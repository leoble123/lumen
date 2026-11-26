package app.lumen.player

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Over-the-air updates for the Lumen web app that lives inside this Android app.
 *
 * - The APK ships with a copy of Lumen (assets/web). Newer versions are downloaded from GitHub
 *   into files/web/<version>/ — never over the copy that is running.
 * - Every file is checked against the SHA-256 in version.json before it's used.
 * - A new version is "on trial" until the page reports it started fine (markHealthy).
 *   If it fails to start twice, Lumen goes back to the previous version and skips the bad one.
 */
class WebUpdater(
    filesDir: File,
    private val openAsset: (String) -> InputStream?,     // reads a file from the copy bundled in the APK
    private val source: String = SOURCE,
) {
    companion object {
        const val SOURCE = "https://raw.githubusercontent.com/leoble123/lumen/main/public/"
        private val SAFE_PATH = Regex("^(?!.*\\.\\.)[A-Za-z0-9_-][A-Za-z0-9_\\-./]*$")
        private val VERSION = Regex("^\\d+\\.\\d+\\.\\d+$")
        private val HASH = Regex("^[0-9a-f]{64}$")

        fun cmp(a: String, b: String): Int {
            val pa = a.split(".").map { it.toIntOrNull() ?: 0 }
            val pb = b.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until 3) {
                val d = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
                if (d != 0) return Integer.signum(d)
            }
            return 0
        }

        fun sha256(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }

    private val root = File(filesDir, "web").apply { mkdirs() }
    private val stateFile = File(root, "state.json")
    @Volatile var rolledBack: String? = null
        private set

    private fun loadState(): JSONObject = try {
        if (stateFile.exists()) JSONObject(stateFile.readText()) else JSONObject()
    } catch (e: Exception) { JSONObject() }

    @Synchronized private fun saveState(s: JSONObject) {
        val tmp = File(root, "state.json.tmp")
        tmp.writeText(s.toString())
        tmp.renameTo(stateFile)
    }

    val bundledManifest: JSONObject by lazy {
        openAsset("version.json")!!.use { JSONObject(it.readBytes().toString(Charsets.UTF_8)) }
    }

    /** The downloaded version in use, or null when running the copy inside the APK. */
    private fun activeDownloaded(): String? {
        val v = loadState().optString("active", "")
        if (v.isEmpty()) return null
        if (!File(root, v).isDirectory) return null
        // An app update may bring a newer built-in copy than what was downloaded
        if (cmp(v, bundledManifest.getString("version")) <= 0) return null
        return v
    }

    fun currentVersion(): String = activeDownloaded() ?: bundledManifest.getString("version")

    private fun currentManifest(): JSONObject {
        val v = activeDownloaded() ?: return bundledManifest
        return JSONObject(File(File(root, v), "version.json").readText())
    }

    /** Opens a web file for the WebView, from the active downloaded version or the built-in copy. */
    fun open(path: String): InputStream? {
        if (!SAFE_PATH.matches(path)) return null
        activeDownloaded()?.let { v ->
            val f = File(File(root, v), path)
            if (f.isFile) return f.inputStream()
        }
        return try { openAsset(path) } catch (e: Exception) { null }
    }

    /** Called once per app start: counts launches of a version that's still on trial; rolls back after 2 failures. */
    fun prepareLaunch() {
        val s = loadState()
        if (!s.optBoolean("trial", false)) return
        val launches = s.optInt("launches", 0) + 1
        s.put("launches", launches)
        if (launches > 2) {
            val bad = s.optString("active", "")
            val prev = s.optString("previous", "")
            s.put("active", prev)
            s.put("previous", "")
            s.put("trial", false)
            s.put("launches", 0)
            val skip = s.optJSONArray("skip") ?: JSONArray()
            if (bad.isNotEmpty()) skip.put(bad)
            s.put("skip", skip)
            if (bad.isNotEmpty()) File(root, bad).deleteRecursively()
            rolledBack = bad.ifEmpty { null }
        }
        saveState(s)
    }

    fun markHealthy() {
        val s = loadState()
        if (s.optBoolean("trial", false) || s.optInt("launches", 0) != 0) {
            s.put("trial", false); s.put("launches", 0); saveState(s)
        }
        // tidy up versions we no longer need
        val keep = setOf(s.optString("active", ""), s.optString("previous", ""), "state.json")
        root.listFiles()?.forEach { if (it.name !in keep && it.isDirectory) it.deleteRecursively() }
    }

    private fun get(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 30000
        c.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (c.responseCode != 200) throw Exception("update server answered ${c.responseCode}")
            return c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }

    private fun validate(m: JSONObject) {
        if (!VERSION.matches(m.optString("version"))) throw Exception("invalid version.json")
        val files = m.optJSONObject("files") ?: throw Exception("invalid version.json")
        for (k in files.keys()) {
            if (!SAFE_PATH.matches(k) || !HASH.matches(files.getString(k))) throw Exception("invalid entry in version.json: $k")
        }
        if (!files.has("index.html") || !files.has("app.js")) throw Exception("version.json is missing core files")
    }

    data class Result(val updated: Boolean, val version: String, val notes: String = "")

    /** Checks GitHub; if there's a newer version, downloads + verifies it. It's used from the next (re)start. */
    @Synchronized fun check(): Result {
        val current = currentVersion()
        val m = JSONObject(String(get("${source}version.json?t=${System.currentTimeMillis()}"), Charsets.UTF_8))
        validate(m)
        val version = m.getString("version")
        val state = loadState()
        val skip = state.optJSONArray("skip") ?: JSONArray()
        for (i in 0 until skip.length()) if (skip.getString(i) == version) return Result(false, current)
        if (cmp(version, current) <= 0) return Result(false, current)
        if (state.optString("active") == version && File(root, version).isDirectory) return Result(true, version, m.optString("notes"))

        val old = currentManifest().optJSONObject("files") ?: JSONObject()
        val tmp = File(root, "$version.partial").apply { deleteRecursively(); mkdirs() }
        try {
            val files = m.getJSONObject("files")
            for (path in files.keys()) {
                val hash = files.getString(path)
                // unchanged files are copied from what we already have; changed ones are downloaded
                val bytes = if (old.optString(path) == hash) open(path)?.use { it.readBytes() } else null
                val data = bytes ?: get("$source$path?v=${hash.take(12)}")
                if (sha256(data) != hash) throw Exception("$path failed its integrity check")
                File(tmp, path).apply { parentFile?.mkdirs(); writeBytes(data) }
            }
            File(tmp, "version.json").writeText(m.toString())
            val dest = File(root, version)
            dest.deleteRecursively()
            if (!tmp.renameTo(dest)) throw Exception("couldn't save the update")
        } catch (e: Exception) {
            tmp.deleteRecursively(); throw e
        }
        val s = loadState()
        val prevActive = activeDownloaded()
        s.put("previous", prevActive ?: "")
        s.put("active", version)
        s.put("trial", true)
        s.put("launches", 0)
        saveState(s)
        return Result(true, version, m.optString("notes"))
    }
}
