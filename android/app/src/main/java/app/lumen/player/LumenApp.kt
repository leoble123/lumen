package app.lumen.player

import android.app.Application
import android.content.Context
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArrayList

/** Lives as long as the app process: the Spotify connection, the latest player state and the current lyrics.
 *  Shared by the Lumen screen, floating lyrics, the home screen widget and the Quick Settings tile. */
class LumenApp : Application() {
    companion object { lateinit var core: Core }
    override fun onCreate() { super.onCreate(); core = Core(this) }
}

class Core(val app: Context) {
    data class Line(val t: Long, val text: String, val sub: String)

    val prefs = app.getSharedPreferences("lumen", Context.MODE_PRIVATE)
    val phone = PhonePlayer(app) { json -> onState(json) }
    @Volatile var webPush: ((String) -> Unit)? = null
    @Volatile var state: JSONObject? = null
    private var stateAt = 0L
    @Volatile var lyrics: List<Line> = emptyList()
    @Volatile var lyricsUri = ""
    val listeners = CopyOnWriteArrayList<() -> Unit>()
    private var lastKey = ""

    private fun onState(json: String) {
        val s = JSONObject(json)
        state = s; stateAt = SystemClock.elapsedRealtime()
        webPush?.invoke(json)
        listeners.forEach { it() }
        // the widget and tile only care about song / play-pause changes
        val t = s.optJSONObject("track")
        val key = "${t?.optString("uri")}|${s.optBoolean("paused")}"
        if (key != lastKey) {
            lastKey = key
            prefs.edit()
                .putString("w_title", t?.optString("name") ?: "")
                .putString("w_artist", t?.optJSONArray("artists")?.let { a -> (0 until a.length()).joinToString(", ") { a.getJSONObject(it).optString("name") } } ?: "")
                .putString("w_image", t?.optString("image") ?: "")
                .putBoolean("w_paused", s.optBoolean("paused", true))
                .apply()
            LumenWidget.updateAll(app)
            PlayTileService.refresh(app)
        }
    }

    val paused get() = state?.optBoolean("paused", true) ?: true
    val trackUri get() = state?.optJSONObject("track")?.optString("uri") ?: ""

    fun position(): Long {
        val s = state ?: return 0
        val p = s.optLong("position")
        return if (s.optBoolean("paused")) p else p + (SystemClock.elapsedRealtime() - stateAt)
    }

    fun setLyrics(uri: String, json: String) {
        val a = try { JSONArray(json) } catch (e: Exception) { JSONArray() }
        lyrics = (0 until a.length()).map { i -> a.getJSONObject(i).let { Line(it.optLong("t"), it.optString("x"), it.optString("s")) } }
        lyricsUri = uri
        listeners.forEach { it() }
    }

    /** The lyric line being sung right now (only when the lyrics belong to the playing song). */
    fun currentLine(): Line? {
        val l = lyrics
        if (l.isEmpty() || lyricsUri != trackUri) return null
        val pos = position() + 150
        var cur: Line? = null
        for (x in l) { if (x.t <= pos) cur = x else break }
        return cur
    }

    fun command(cmd: String, arg: String = "", interactive: Boolean = false, done: (String?) -> Unit = {}) =
        phone.command(cmd, arg, interactive, done)
}
