package app.lumen.player

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val ORIGIN = "https://$HOST"
        private val MIME = mapOf(
            "html" to "text/html", "js" to "text/javascript", "css" to "text/css", "json" to "application/json",
            "svg" to "image/svg+xml", "png" to "image/png", "webmanifest" to "application/manifest+json",
            "txt" to "text/plain", "woff2" to "font/woff2", "ico" to "image/x-icon"
        )
    }

    private lateinit var web: WebView
    private lateinit var updater: WebUpdater
    private lateinit var apk: ApkUpdater
    private val io = Executors.newSingleThreadExecutor()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var insetsJs = ""

    private val pickFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else arrayOf())
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        updater = WebUpdater(filesDir, { path -> try { assets.open("web/$path") } catch (e: Exception) { null } })
        apk = ApkUpdater(this)
        updater.prepareLaunch()

        // Lumen's files are served from a private https origin inside the app (needed for module scripts & storage)
        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/") { path ->
                val p = if (path.isEmpty() || path == "callback") "index.html" else path
                val stream = updater.open(p) ?: return@addPathHandler null
                val ext = p.substringAfterLast('.', "")
                WebResourceResponse(MIME[ext] ?: "application/octet-stream", "utf-8", stream).apply {
                    responseHeaders = mapOf("Cache-Control" to "no-cache")
                }
            }
            .build()

        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(true)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString LumenAndroid/${BuildConfig.VERSION_NAME}"
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false
                openExternal(url.toString())   // links to other sites open in the browser
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (insetsJs.isNotEmpty()) view.evaluateJavascript(insetsJs, null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // target=_blank links: open them in the browser instead of a new WebView window
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                val catcher = WebView(this@MainActivity)
                catcher.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                        openExternal(r.url.toString()); v.destroy(); return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = catcher
                resultMsg.sendToTarget()
                return true
            }

            // "Choose image or video" for wallpapers
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(arrayOf())
                fileCallback = callback
                val types = params.acceptTypes.filter { it.isNotBlank() }.flatMap { it.split(",") }.map { it.trim() }
                pickFile.launch(if (types.isEmpty()) arrayOf("*/*") else types.toTypedArray())
                return true
            }
        }
        web.addJavascriptInterface(Bridge(), "LumenAndroid")
        setContentView(web)

        // Tell the page how much room the status bar, camera cutout and gesture bar take up
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val d = resources.displayMetrics.density
            insetsJs = "(function(s){s.setProperty('--safe-top','${b.top / d}px');s.setProperty('--safe-bottom','${b.bottom / d}px');" +
                "s.setProperty('--safe-left','${b.left / d}px');s.setProperty('--safe-right','${b.right / d}px');})(document.documentElement.style)"
            web.evaluateJavascript(insetsJs, null)
            insets
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__lumenBack ? window.__lumenBack() : false") { r ->
                    if (r != "true") moveTaskToBack(true)   // keep Lumen alive in the background, like other music apps
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else loadFor(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        loadFor(intent)
    }

    // lumen://callback?code=… (after logging in to Spotify) → hand the code to the page
    private fun loadFor(intent: Intent?) {
        val data = intent?.data
        if (data != null && data.scheme == "lumen" && data.host == "callback") {
            web.loadUrl("$ORIGIN/callback" + (data.encodedQuery?.let { "?$it" } ?: ""))
        } else if (web.url == null) {
            web.loadUrl("$ORIGIN/")
        }
    }

    private fun openExternal(url: String) {
        try {
            val scheme = CustomTabColorSchemeParams.Builder().setToolbarColor(Color.BLACK).build()
            CustomTabsIntent.Builder().setDefaultColorSchemeParams(scheme).setShowTitle(true).build().launchUrl(this, Uri.parse(url))
        } catch (e: Exception) {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
        }
    }

    private fun reply(id: Int, json: JSONObject) {
        val js = "window.__lumenNative && window.__lumenNative.resolve($id, ${JSONObject.quote(json.toString())})"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    /** Functions the Lumen page can call (window.LumenAndroid.*) */
    inner class Bridge {
        @JavascriptInterface fun getInfo(): String = JSONObject()
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("webVersion", updater.currentVersion())
            .put("rolledBack", updater.rolledBack ?: "")
            .toString()

        @JavascriptInterface fun openAuth(url: String) {
            if (!url.startsWith("https://accounts.spotify.com/")) return
            runOnUiThread { openExternal(url) }
        }

        @JavascriptInterface fun openExternal(url: String) {
            if (!url.startsWith("https://") && !url.startsWith("http://")) return
            runOnUiThread { this@MainActivity.openExternal(url) }
        }

        @JavascriptInterface fun markHealthy() { io.execute { updater.markHealthy() } }

        @JavascriptInterface fun restart() { runOnUiThread { web.loadUrl("$ORIGIN/") } }

        @JavascriptInterface fun checkForUpdates(id: Int) {
            io.execute {
                try {
                    val r = updater.check()
                    reply(id, JSONObject().put("updated", r.updated).put("version", r.version).put("notes", r.notes))
                } catch (e: Exception) { reply(id, JSONObject().put("error", e.message ?: "update failed")) }
            }
        }

        @JavascriptInterface fun checkApkUpdate(id: Int) {
            io.execute {
                try { reply(id, apk.check()) }
                catch (e: Exception) { reply(id, JSONObject().put("error", e.message ?: "check failed")) }
            }
        }

        @JavascriptInterface fun installApk(id: Int) {
            io.execute {
                try { apk.downloadAndInstall(); reply(id, JSONObject().put("ok", true)) }
                catch (e: Exception) { reply(id, JSONObject().put("error", e.message ?: "install failed")) }
            }
        }
    }
}
