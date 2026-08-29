package com.sisyphus.worker;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Thin wrapper over SharedPreferences for what the kiosk needs: the hub
 * IP:port, the display name the operator typed (matching Termux --name), and
 * the resolved phoneId (`GET /api/phones`, see PhoneLookup) — the worker route
 * is `/worker/<phoneId>`, a hashed id, not the plain name. No config = show
 * setup first.
 */
final class Prefs {
    private static final String FILE = "sisyphus";
    private static final String K_HUB = "hub_ip";
    private static final String K_PORT = "port";
    private static final String K_NAME = "phone_name";
    private static final String K_PHONE_ID = "phone_id";

    private final SharedPreferences sp;

    Prefs(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    boolean isConfigured() {
        return !phoneId().isEmpty() && !hubIp().isEmpty();
    }

    String hubIp() {
        return sp.getString(K_HUB, BuildConfig.DEFAULT_HUB_IP);
    }

    int port() {
        return sp.getInt(K_PORT, BuildConfig.DEFAULT_PORT);
    }

    String name() {
        return sp.getString(K_NAME, "");
    }

    String phoneId() {
        return sp.getString(K_PHONE_ID, "");
    }

    void save(String hubIp, int port, String name, String phoneId) {
        sp.edit()
            .putString(K_HUB, hubIp.trim())
            .putInt(K_PORT, port)
            .putString(K_NAME, name.trim())
            .putString(K_PHONE_ID, phoneId.trim())
            .apply();
    }

    /** Full worker-view URL the WebView loads. Requires the resolved phoneId. */
    String workerUrl() {
        return "http://" + hubIp() + ":" + port() + "/worker/" + phoneId();
    }
}
