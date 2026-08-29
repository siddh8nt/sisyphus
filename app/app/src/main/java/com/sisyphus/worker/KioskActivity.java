package com.sisyphus.worker;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Fullscreen, kiosk-style WebView wrapping the existing worker view
 * (http://<hub>:<port>/worker/<name>). No browser chrome, screen stays awake,
 * and a GLITCH-styled overlay auto-reconnects when the hub is unreachable.
 * The page itself already carries the GLITCH re-skin; this class only styles
 * the native surfaces the WebView doesn't cover.
 */
public class KioskActivity extends Activity {

    private static final int BG = Color.parseColor("#0E0E0E");
    private static final int TEXT = Color.parseColor("#EAE7E0");
    private static final int FAINT = Color.parseColor("#8A8880");
    private static final int SIGNAL = Color.parseColor("#3DDC84");

    private static final long RETRY_MS = 3000L;
    private static final int REQ_NOTIF = 42;

    private WebView web;
    private View overlay;
    private TextView overlayUrl;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pageFailed = false;

    private final Runnable retry = new Runnable() {
        @Override public void run() {
            if (pageFailed && web != null) {
                web.reload();
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Prefs prefs = new Prefs(this);
        if (!prefs.isConfigured()) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        // Android 13+ needs runtime consent to post the task notifications.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // LAN is fast and the page changes between builds — never serve a stale
        // cached page (that's what made a re-deployed font change not show up).
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.clearCache(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return false; // keep everything inside the kiosk WebView
            }

            // Serve /fonts/*.ttf straight from the APK's bundled assets, so the
            // GLITCH fonts render even if the server dist is stale or the hotspot
            // has no internet — the #1 thing that made the worker view fall back
            // to system monospace. Everything else loads from the hub as normal.
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(
                    WebView v, WebResourceRequest req) {
                String path = req.getUrl() != null ? req.getUrl().getPath() : null;
                if (path != null && path.startsWith("/fonts/") && path.endsWith(".ttf")) {
                    String file = path.substring("/fonts/".length());
                    try {
                        return new android.webkit.WebResourceResponse(
                            "font/ttf", null, getAssets().open("fonts/" + file));
                    } catch (java.io.IOException ignored) {
                        // fall through to normal network load
                    }
                }
                return null;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                // Only care about the main document failing (hub down / off-network).
                if (req != null && req.isForMainFrame()) {
                    showOverlay(true);
                    scheduleRetry();
                }
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (!"about:blank".equals(url)) {
                    showOverlay(false);
                }
            }
        });

        // Expose window.SisyphusNative so the worker page can fire task
        // notifications (assigned / generating / finished). No-op in a browser.
        web.addJavascriptInterface(new NativeBridge(this), NativeBridge.NAME);

        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        overlay = buildOverlay(prefs);
        root.addView(overlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Deliberate operator escape hatch: long-press the top-left corner to
        // reopen setup. Small + cornered so judges/viewers won't trigger it.
        View corner = new View(this);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(dp(56), dp(56));
        clp.gravity = Gravity.TOP | Gravity.START;
        corner.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) {
                startActivity(new Intent(KioskActivity.this, SetupActivity.class));
                finish();
                return true;
            }
        });
        root.addView(corner, clp);

        setContentView(root);
        hideSystemUi();

        overlayUrl.setText(prefs.workerUrl() + " · b" + BuildConfig.VERSION_CODE);
        showOverlay(true);           // show reconnect card until first paint
        // Cache-buster: a new build gets a URL no old cache entry can answer.
        web.loadUrl(prefs.workerUrl() + "?b=" + BuildConfig.VERSION_CODE);
    }

    private void scheduleRetry() {
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    private void showOverlay(boolean failed) {
        pageFailed = failed;
        if (overlay != null) {
            overlay.setVisibility(failed ? View.VISIBLE : View.GONE);
        }
        if (!failed) {
            handler.removeCallbacks(retry);
        }
    }

    private View buildOverlay(Prefs prefs) {
        // Mirrors the web idle/empty state: dot field, pulsing signal square,
        // Silkscreen pixel headline, wide-tracked micro caption.
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackground(Type.dotField(this));

        // Pulsing 12px signal square (web READY-state square, .pulse).
        final View dot = new View(this);
        dot.setBackgroundColor(SIGNAL);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(12), dp(12));
        dlp.bottomMargin = dp(22);
        dlp.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(dot, dlp);
        blink(dot);

        TextView head = new TextView(this);
        head.setText("(RECONNECTING)");
        head.setTypeface(Type.pixel(this));
        head.setTextColor(TEXT);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        head.setGravity(Gravity.CENTER);
        box.addView(head);

        TextView caption = new TextView(this);
        caption.setText("HUB UNREACHABLE · RETRYING");
        caption.setTypeface(Type.mono(this));
        caption.setTextColor(FAINT);
        caption.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        caption.setLetterSpacing(0.18f);
        caption.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = dp(16);
        box.addView(caption, clp);

        overlayUrl = new TextView(this);
        overlayUrl.setText(prefs.workerUrl());
        overlayUrl.setTypeface(Type.mono(this));
        overlayUrl.setTextColor(FAINT);
        overlayUrl.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        overlayUrl.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams ulp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ulp.topMargin = dp(8);
        box.addView(overlayUrl, ulp);

        return box;
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        // Returning to the kiosk after it was backgrounded — refetch so a
        // re-deployed page (e.g. new fonts) always shows without a reinstall.
        if (web != null) web.reload();
    }

    // Web .pulse: blink 1.4s steps(2) — full on/off, ~700ms each phase.
    private void blink(final View v) {
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                v.setAlpha(v.getAlpha() > 0.5f ? 0f : 1f);
                handler.postDelayed(this, 700);
            }
        }, 700);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
