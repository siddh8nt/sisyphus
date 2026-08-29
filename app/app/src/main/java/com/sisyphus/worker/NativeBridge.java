package com.sisyphus.worker;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

/**
 * Exposed to the worker page as window.SisyphusNative. The page calls these when
 * its own task state changes; the app turns them into notifications. Guarded on
 * the web side (only called if window.SisyphusNative exists), so a plain browser
 * is unaffected.
 *
 * @JavascriptInterface methods arrive on a WebView binder thread — hop to main.
 */
final class NativeBridge {

    static final String NAME = "SisyphusNative";

    private final Notifier notifier;
    private final Handler main = new Handler(Looper.getMainLooper());

    NativeBridge(Context ctx) {
        notifier = new Notifier(ctx);
    }

    @JavascriptInterface
    public void assigned(final String title) {
        main.post(new Runnable() {
            @Override public void run() { notifier.assigned(title); }
        });
    }

    @JavascriptInterface
    public void generating(final String title) {
        main.post(new Runnable() {
            @Override public void run() { notifier.generating(title); }
        });
    }

    @JavascriptInterface
    public void finished(final String title, final boolean ok) {
        main.post(new Runnable() {
            @Override public void run() { notifier.finished(title, ok); }
        });
    }

    @JavascriptInterface
    public void clear() {
        main.post(new Runnable() {
            @Override public void run() { notifier.clear(); }
        });
    }
}
