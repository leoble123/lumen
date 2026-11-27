package app.lumen.player

import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile: play / pause from the notification shade. */
class PlayTileService : TileService() {
    companion object {
        fun refresh(c: Context) {
            try { requestListeningState(c, ComponentName(c, PlayTileService::class.java)) } catch (_: Exception) {}
        }
    }

    private val listener: () -> Unit = { qsTile?.let { show(it) } }

    override fun onStartListening() {
        LumenApp.core.listeners.add(listener)
        qsTile?.let { show(it) }
    }
    override fun onStopListening() { LumenApp.core.listeners.remove(listener) }

    private fun show(t: Tile) {
        val core = LumenApp.core
        val p = core.prefs
        val title = core.state?.optJSONObject("track")?.optString("name") ?: p.getString("w_title", "") ?: ""
        val playing = core.state != null && !core.paused
        t.state = if (playing) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        t.label = if (playing) "Pause" else "Play"
        if (Build.VERSION.SDK_INT >= 29) t.subtitle = title.ifEmpty { "Lumen" }
        t.icon = Icon.createWithResource(this, if (playing) R.drawable.ic_w_pause else R.drawable.ic_w_play)
        t.updateTile()
    }

    override fun onClick() {
        val core = LumenApp.core
        core.command(if (core.state == null || core.paused) "resume" else "pause") { err ->
            if (err != null) {
                val i = android.content.Intent(this, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(android.app.PendingIntent.getActivity(this, 20, i, android.app.PendingIntent.FLAG_IMMUTABLE))
                else @Suppress("DEPRECATION") startActivityAndCollapse(i)
            }
            qsTile?.let { show(it) }
        }
    }
}
