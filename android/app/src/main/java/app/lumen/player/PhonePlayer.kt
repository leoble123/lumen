package app.lumen.player

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.android.appremote.api.error.AuthenticationFailedException
import com.spotify.android.appremote.api.error.CouldNotFindSpotifyApp
import com.spotify.android.appremote.api.error.NotLoggedInException
import com.spotify.android.appremote.api.error.OfflineModeException
import com.spotify.android.appremote.api.error.UserNotAuthorizedException
import com.spotify.protocol.types.PlayerState
import org.json.JSONArray
import org.json.JSONObject

/**
 * Plays music on THIS phone through the Spotify app (Spotify's official App Remote SDK).
 * Spotify keeps playing in the background with its own notification; Lumen gets live player updates.
 */
class PhonePlayer(private val context: Context, private val push: (String) -> Unit) {
    private val prefs = context.getSharedPreferences("lumen", Context.MODE_PRIVATE)
    private var remote: SpotifyAppRemote? = null
    private var clientId: String? = null
    private var connecting = false
    private val waiting = mutableListOf<(String?) -> Unit>()
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    val deviceName: String
        get() = Settings.Global.getString(context.contentResolver, "device_name")?.takeIf { it.isNotBlank() } ?: Build.MODEL

    fun isConnected() = remote?.isConnected == true

    /** Connects to the Spotify app; calls back with null on success, or a message explaining what's wrong. */
    /** @param interactive true when the Lumen screen is open (Spotify may show its "allow" screen) */
    fun connect(id: String, interactive: Boolean = true, done: (String?) -> Unit) {
        clientId = id
        prefs.edit().putString("clientId", id).apply()
        if (isConnected()) { done(null); return }
        waiting += done
        if (connecting) return
        connecting = true
        val params = ConnectionParams.Builder(id)
            .setRedirectUri("lumen://callback")
            .showAuthView(interactive)     // the first time, Spotify asks you to allow Lumen
            .build()
        SpotifyAppRemote.connect(context, params, object : Connector.ConnectionListener {
            override fun onConnected(r: SpotifyAppRemote) {
                remote = r
                r.playerApi.subscribeToPlayerState().setEventCallback { st -> push(stateJson(st).toString()) }
                finish(null)
            }
            override fun onFailure(t: Throwable) { remote = null; finish(explain(t)) }
        })
    }

    private fun finish(err: String?) {
        connecting = false
        val list = waiting.toList(); waiting.clear()
        list.forEach { it(err) }
    }

    fun reconnectIfNeeded() { (clientId ?: prefs.getString("clientId", null))?.let { if (!isConnected()) connect(it, true) { } } }

    fun disconnect() { remote?.let { SpotifyAppRemote.disconnect(it) }; remote = null }

    private fun explain(t: Throwable): String = when (t) {
        is CouldNotFindSpotifyApp -> "Install the Spotify app on this phone to play music here."
        is NotLoggedInException -> "Log in to the Spotify app on this phone first."
        is UserNotAuthorizedException, is AuthenticationFailedException ->
            "Spotify didn't allow Lumen yet. In the Spotify Developer Dashboard, add the Android package and fingerprint (see Lumen's README), then try again."
        is OfflineModeException -> "Spotify is in offline mode — turn it off in the Spotify app."
        else -> t.message ?: "Couldn't connect to the Spotify app."
    }

    /** Runs a player command (connecting first if needed); done(null) = ok, else an error message. */
    fun command(cmd: String, arg: String, interactive: Boolean = true, done: (String?) -> Unit) {
        val id = clientId ?: prefs.getString("clientId", null) ?: return done("Open Lumen and log in first.")
        connect(id, interactive) { err ->
            if (err != null) return@connect done(err)
            val p = remote!!.playerApi
            val call = when (cmd) {
                "resume" -> p.resume()
                "pause" -> p.pause()
                "next" -> p.skipNext()
                "prev" -> p.skipPrevious()
                "seek" -> p.seekTo(arg.toLong())
                "shuffle" -> p.setShuffle(arg == "true")
                "repeat" -> p.setRepeat(when (arg) { "track" -> 1; "context" -> 2; else -> 0 })
                "play" -> p.play(arg)
                "queue" -> p.queue(arg)
                else -> return@connect done("Unknown command")
            }
            call.setResultCallback { done(null) }.setErrorCallback { e -> done(e.message ?: "Spotify didn't accept that") }
        }
    }

    /** Phone media volume (Spotify plays through it). 0..1 */
    fun volume(): Double {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
    }
    fun setVolume(v: Double) {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, (v.coerceIn(0.0, 1.0) * max).toInt(), 0)
    }

    private fun stateJson(st: PlayerState): JSONObject {
        val o = JSONObject()
            .put("paused", st.isPaused)
            .put("position", st.playbackPosition)
            .put("shuffle", st.playbackOptions?.isShuffling ?: false)
            .put("repeat", when (st.playbackOptions?.repeatMode) { 1 -> "track"; 2 -> "context"; else -> "off" })
        val t = st.track
        if (t != null) {
            val artists = JSONArray()
            (t.artists ?: listOfNotNull(t.artist)).forEach { a -> artists.put(JSONObject().put("name", a.name).put("uri", a.uri)) }
            o.put("track", JSONObject()
                .put("name", t.name).put("uri", t.uri).put("duration", t.duration)
                .put("artists", artists)
                .put("album", JSONObject().put("name", t.album?.name ?: "").put("uri", t.album?.uri ?: ""))
                .put("image", t.imageUri?.raw ?: "")
                .put("episode", t.isEpisode))
        }
        return o
    }
}
