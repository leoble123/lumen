package app.lumen.player

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Updates to the Android app itself (rare — Lumen's screens update over the air without this).
 * Reads android/latest.json from GitHub; downloads the APK, checks its SHA-256, then hands it to Android's installer.
 * Android only installs it if it's signed with the same key as the installed app.
 */
class ApkUpdater(private val context: Context) {
    companion object {
        const val LATEST = "https://raw.githubusercontent.com/leoble123/lumen/main/android/latest.json"
        const val BASE = "https://raw.githubusercontent.com/leoble123/lumen/main/"
    }

    private var latest: JSONObject? = null

    private fun get(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 60000
        try {
            if (c.responseCode != 200) throw Exception("server answered ${c.responseCode}")
            return c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }

    fun check(): JSONObject {
        val j = JSONObject(String(get("$LATEST?t=${System.currentTimeMillis()}"), Charsets.UTF_8))
        latest = j
        val available = j.optInt("versionCode", 0) > BuildConfig.VERSION_CODE
        return JSONObject().put("available", available).put("versionName", j.optString("versionName")).put("notes", j.optString("notes"))
    }

    fun downloadAndInstall() {
        val j = latest ?: check().let { latest!! }
        if (j.optInt("versionCode", 0) <= BuildConfig.VERSION_CODE) throw Exception("You already have the latest app.")
        val path = j.getString("apk")
        if (!Regex("^android/releases/[A-Za-z0-9._-]+\\.apk$").matches(path)) throw Exception("Bad update info")
        val bytes = get(BASE + path)
        if (WebUpdater.sha256(bytes) != j.getString("sha256")) throw Exception("The download failed its integrity check.")
        val dir = File(context.cacheDir, "apk").apply { mkdirs() }
        val file = File(dir, "lumen-update.apk").apply { writeBytes(bytes) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
