package app.lumen.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews
import java.net.URL
import java.util.concurrent.Executors

/** Home screen widget: cover, song, artist and play controls. Updates only when the song or play state changes. */
class LumenWidget : AppWidgetProvider() {
    companion object {
        private const val ACTION = "app.lumen.player.WIDGET"
        private val io = Executors.newSingleThreadExecutor()
        @Volatile private var art: Pair<String, Bitmap?> = "" to null

        fun updateAll(c: Context) {
            val mgr = AppWidgetManager.getInstance(c)
            val ids = mgr.getAppWidgetIds(ComponentName(c, LumenWidget::class.java))
            if (ids.isEmpty()) return
            val p = c.getSharedPreferences("lumen", Context.MODE_PRIVATE)
            val img = p.getString("w_image", "") ?: ""
            val views = build(c, p.getString("w_title", "") ?: "", p.getString("w_artist", "") ?: "", p.getBoolean("w_paused", true), if (art.first == img) art.second else null)
            mgr.updateAppWidget(ids, views)
            if (img.isNotEmpty() && art.first != img) io.execute {
                val bmp = try {
                    val url = if (img.startsWith("spotify:image:")) "https://i.scdn.co/image/${img.substringAfterLast(':')}" else img
                    URL(url).openStream().use { BitmapFactory.decodeStream(it) }?.let { Bitmap.createScaledBitmap(it, 192, 192, true) }
                } catch (e: Exception) { null }
                art = img to bmp
                updateAll(c)
            }
        }

        private fun build(c: Context, title: String, artist: String, paused: Boolean, bmp: Bitmap?): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget_lumen)
            v.setTextViewText(R.id.w_title, title.ifEmpty { "Lumen" })
            v.setTextViewText(R.id.w_artist, if (title.isEmpty()) "Tap to open" else artist)
            if (bmp != null) v.setImageViewBitmap(R.id.w_art, bmp) else v.setImageViewResource(R.id.w_art, R.mipmap.ic_launcher)
            v.setImageViewResource(R.id.w_play, if (paused) R.drawable.ic_w_play else R.drawable.ic_w_pause)
            val open = PendingIntent.getActivity(c, 10, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.w_root, open)
            fun act(cmd: String, code: Int) = PendingIntent.getBroadcast(c, code, Intent(c, LumenWidget::class.java).setAction(ACTION).putExtra("cmd", cmd), PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.w_prev, act("prev", 11))
            v.setOnClickPendingIntent(R.id.w_play, act("toggle", 12))
            v.setOnClickPendingIntent(R.id.w_next, act("next", 13))
            return v
        }
    }

    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) = updateAll(c)

    override fun onReceive(c: Context, intent: Intent) {
        super.onReceive(c, intent)
        if (intent.action != ACTION) return
        val core = LumenApp.core
        val cmd = when (intent.getStringExtra("cmd")) {
            "toggle" -> if (core.state == null || core.paused) "resume" else "pause"
            else -> intent.getStringExtra("cmd") ?: return
        }
        val pending = goAsync()
        core.command(cmd) { err ->
            if (err != null) c.startActivity(Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            pending.finish()
        }
    }
}
