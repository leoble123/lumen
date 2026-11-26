package app.lumen.player

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import kotlin.concurrent.thread
import java.nio.file.Files

/**
 * Runs the real updater against a local web server that plays the part of GitHub.
 * Release folders (good / tampered / broken / bundled) are made by the test runner script with tools/release.js.
 */
class WebUpdaterTest {
    private val rel = File(System.getenv("LUMEN_TEST_RELEASES") ?: error("set LUMEN_TEST_RELEASES"))
    private lateinit var server: ServerSocket
    private lateinit var files: File
    private var serving = "good"
    private val requested = mutableListOf<String>()
    private lateinit var base: String

    @Before fun start() {
        files = Files.createTempDirectory("lumen-files").toFile()
        server = ServerSocket(0)
        // a tiny HTTP/1.0 server, enough for the updater's GET requests
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val sock = try { server.accept() } catch (e: Exception) { break }
                try {
                    val line = sock.getInputStream().bufferedReader().readLine() ?: ""
                    val path = line.split(" ").getOrElse(1) { "/" }.substringBefore("?").removePrefix("/")
                    synchronized(requested) { requested += path }
                    val f = File(rel, "$serving/public/$path")
                    val out = sock.getOutputStream()
                    if (f.isFile) {
                        val b = f.readBytes()
                        out.write("HTTP/1.0 200 OK\r\nContent-Length: ${b.size}\r\nContent-Type: text/plain\r\n\r\n".toByteArray()); out.write(b)
                    } else out.write("HTTP/1.0 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray())
                    out.flush()
                } catch (_: Exception) {} finally { sock.close() }
            }
        }
        base = "http://127.0.0.1:${server.localPort}/"
    }
    @After fun stop() { server.close(); files.deleteRecursively() }

    private fun updater() = WebUpdater(files, { p -> File(rel, "bundled/public/$p").takeIf { it.isFile }?.inputStream() }, base)
    private fun text(u: WebUpdater, p: String) = u.open(p)!!.use { String(it.readBytes()) }
    private fun bundledVersion() = JSONObject(File(rel, "bundled/public/version.json").readText()).getString("version")

    @Test fun startsOnTheBuiltInCopy() {
        val u = updater()
        assertEquals(bundledVersion(), u.currentVersion())
        assertTrue(text(u, "index.html").contains("<html"))
    }

    @Test fun downloadsVerifiesAndSwitchesToAGoodUpdate() {
        val u = updater()
        val r = u.check()
        assertTrue(r.updated); assertEquals("9.9.9", r.version)
        assertEquals("9.9.9", u.currentVersion())
        assertTrue("new index.html is served", text(u, "index.html").contains("lumen-build\" content=\"999"))
        val downloaded = requested.filter { !it.startsWith("version.json") }
        assertEquals("only the changed file is downloaded", listOf("index.html"), downloaded)
        // second check: nothing new
        assertFalse(updater().check().updated)
    }

    @Test fun rejectsATamperedUpdate() {
        serving = "tampered"
        val u = updater()
        val e = assertThrows(Exception::class.java) { u.check() }
        assertTrue(e.message!!.contains("integrity"))
        assertEquals(bundledVersion(), u.currentVersion())
        assertFalse(File(files, "web/9.9.7").exists())
    }

    @Test fun rollsBackAnUpdateThatNeverStartsAndSkipsIt() {
        serving = "broken"
        assertTrue(updater().check().updated)
        // three app starts without the page ever saying it started fine
        repeat(3) { updater().prepareLaunch() }
        val u = updater()
        assertEquals(bundledVersion(), u.currentVersion())
        assertFalse(u.check().updated)   // the broken version is skipped from now on
    }

    @Test fun aHealthyUpdateStays() {
        assertTrue(updater().check().updated)
        updater().prepareLaunch()
        updater().markHealthy()
        repeat(5) { updater().prepareLaunch() }
        assertEquals("9.9.9", updater().currentVersion())
    }

    @Test fun refusesPathsOutsideTheApp() {
        val u = updater()
        assertNull(u.open("../../etc/passwd"))
        assertNull(u.open("/etc/passwd"))
        assertNull(u.open("vendor/../../secret"))
    }

    @Test fun aNewerBuiltInCopyWinsOverAnOlderDownload() {
        assertTrue(updater().check().updated)
        // pretend the APK was updated with a copy newer than the download
        val bundledManifest = File(rel, "bundled/public/version.json")
        val original = bundledManifest.readText()
        try {
            bundledManifest.writeText(JSONObject(original).put("version", "10.0.0").toString())
            assertEquals("10.0.0", updater().currentVersion())
        } finally { bundledManifest.writeText(original) }
    }
}
