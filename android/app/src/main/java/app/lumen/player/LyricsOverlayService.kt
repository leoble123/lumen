package app.lumen.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/** Floating lyrics: a small bubble with the current line, shown over other apps while music plays. */
class LyricsOverlayService : Service() {
    companion object {
        @Volatile var running = false
        const val STOP = "app.lumen.player.STOP_FLOATING"
        fun canDraw(c: Context) = Settings.canDrawOverlays(c)
        fun start(c: Context) {
            val i = Intent(c, LyricsOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }
        fun stop(c: Context) { c.stopService(Intent(c, LyricsOverlayService::class.java)) }
    }

    private lateinit var wm: WindowManager
    private lateinit var bubble: LinearLayout
    private lateinit var line: TextView
    private lateinit var sub: TextView
    private lateinit var params: WindowManager.LayoutParams
    private val handler = Handler(Looper.getMainLooper())
    private var shownText = "\u0000"
    private val core get() = LumenApp.core
    private val dp = { v: Float -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics) }

    private val tick = object : Runnable {
        override fun run() {
            update()
            // only wake up often while music plays; idle otherwise
            handler.postDelayed(this, if (core.paused) 1000 else 200)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { core.prefs.edit().putBoolean("floating", false).apply(); stopSelf() }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        startAsForeground()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        line = TextView(this).apply { setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f); typeface = Typeface.DEFAULT_BOLD; maxLines = 2 }
        sub = TextView(this).apply { setTextColor(Color.argb(190, 255, 255, 255)); setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f); maxLines = 1; visibility = View.GONE }
        bubble = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = dp(14f).toInt(); setPadding(p, dp(9f).toInt(), p, dp(9f).toInt())
            background = GradientDrawable().apply { cornerRadius = dp(20f); setColor(Color.argb(215, 20, 18, 28)); setStroke(dp(0.7f).toInt(), Color.argb(60, 255, 255, 255)) }
            addView(line); addView(sub)
            elevation = dp(6f)
        }
        val width = (resources.displayMetrics.widthPixels * 0.86f).toInt()
        bubble.layoutParams = LinearLayout.LayoutParams(width, LinearLayout.LayoutParams.WRAP_CONTENT)
        params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = core.prefs.getInt("float_x", (resources.displayMetrics.widthPixels - width) / 2)
            y = core.prefs.getInt("float_y", (resources.displayMetrics.heightPixels * 0.12f).toInt())
        }
        line.maxWidth = width - dp(28f).toInt()
        bubble.setOnTouchListener(DragListener())
        wm.addView(bubble, params)
        bubble.visibility = View.GONE
        core.phone.reconnectIfNeeded()
        handler.post(tick)
    }

    private fun update() {
        val cur = core.currentLine()
        val show = cur != null && !core.paused
        bubble.visibility = if (show) View.VISIBLE else View.GONE
        if (!show) return
        val text = cur!!.text.ifBlank { "♪" }
        if (text == shownText) return
        shownText = text
        bubble.animate().alpha(0.35f).setDuration(90).withEndAction {
            line.text = text
            sub.text = cur.sub; sub.visibility = if (cur.sub.isNotBlank()) View.VISIBLE else View.GONE
            bubble.animate().alpha(1f).setDuration(160).start()
        }.start()
    }

    /** Drag to move; tap to open Lumen. */
    private inner class DragListener : View.OnTouchListener {
        private var sx = 0f; private var sy = 0f; private var px = 0; private var py = 0; private var moved = false
        override fun onTouch(v: View, e: MotionEvent): Boolean {
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { sx = e.rawX; sy = e.rawY; px = params.x; py = params.y; moved = false }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - sx; val dy = e.rawY - sy
                    if (abs(dx) + abs(dy) > dp(6f)) moved = true
                    params.x = px + dx.toInt(); params.y = py + dy.toInt(); wm.updateViewLayout(bubble, params)
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) core.prefs.edit().putInt("float_x", params.x).putInt("float_y", params.y).apply()
                    else startActivity(Intent(this@LyricsOverlayService, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            return true
        }
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("floating", "Floating lyrics", NotificationManager.IMPORTANCE_MIN))
        val stop = PendingIntent.getService(this, 1, Intent(this, LyricsOverlayService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "floating")
            .setSmallIcon(R.drawable.ic_stat_lumen)
            .setContentTitle("Floating lyrics are on")
            .setContentText("Tap to open Lumen")
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Turn off", stop).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(7, n)
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacksAndMessages(null)
        try { wm.removeView(bubble) } catch (_: Exception) {}
        super.onDestroy()
    }
}
