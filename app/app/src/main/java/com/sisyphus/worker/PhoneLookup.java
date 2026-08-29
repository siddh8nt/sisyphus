package com.sisyphus.worker;

import android.os.AsyncTask;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Resolves a phone's display name (what the operator typed, matching the
 * Termux `--name`) to the server's logical phoneId (`GET /api/phones`,
 * matched by `name`) — the id the worker route actually requires
 * (`/worker/<phoneId>`, not `/worker/<name>`). Doing a live lookup instead of
 * re-deriving the hash locally means the app never has to know the server's
 * hashing scheme.
 */
final class PhoneLookup {

    interface Callback {
        void onResolved(String phoneId);
        void onError(String message);
    }

    private static final String TAG = "PhoneLookup";

    static void resolve(final String hubIp, final int port, final String name, final Callback cb) {
        new AsyncTask<Void, Void, Result>() {
            @Override
            protected Result doInBackground(Void... voids) {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("http://" + hubIp + ":" + port + "/api/phones");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.setRequestMethod("GET");

                    int code = conn.getResponseCode();
                    if (code != 200) {
                        return Result.error("Hub returned HTTP " + code);
                    }

                    String body = readAll(conn.getInputStream());
                    JSONArray phones = new JSONArray(body);
                    for (int i = 0; i < phones.length(); i++) {
                        JSONObject p = phones.getJSONObject(i);
                        if (name.equalsIgnoreCase(p.optString("name"))) {
                            return Result.ok(p.getString("phoneId"));
                        }
                    }
                    return Result.error("No phone named \"" + name + "\" is registered yet");
                } catch (Exception e) {
                    Log.w(TAG, "lookup failed", e);
                    return Result.error("Can't reach hub: " + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }

            @Override
            protected void onPostExecute(Result r) {
                if (r.phoneId != null) cb.onResolved(r.phoneId);
                else cb.onError(r.error);
            }
        }.execute();
    }

    private static String readAll(InputStream in) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        return sb.toString();
    }

    private static final class Result {
        final String phoneId;
        final String error;
        private Result(String phoneId, String error) { this.phoneId = phoneId; this.error = error; }
        static Result ok(String id) { return new Result(id, null); }
        static Result error(String msg) { return new Result(null, msg); }
    }
}
