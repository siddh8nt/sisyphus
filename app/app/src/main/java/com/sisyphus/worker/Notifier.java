package com.sisyphus.worker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;

/**
 * Posts a single "current task" notification for this phone, updated in place as
 * the worker moves assigned -> generating -> done. Tapping it opens the kiosk.
 * Framework NotificationManager only (no AndroidX) — fine at minSdk 26 where
 * notification channels and Notification.Builder(context, channelId) exist.
 */
final class Notifier {

    private static final String CHANNEL = "sisyphus_tasks";
    private static final int NOTIF_ID = 1001;   // one live task at a time -> reuse
    private static final int SIGNAL = Color.parseColor("#3DDC84");

    private final Context app;
    private final NotificationManager nm;

    Notifier(Context ctx) {
        app = ctx.getApplicationContext();
        nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel();
    }

    private void ensureChannel() {
        NotificationChannel ch = new NotificationChannel(
            CHANNEL, "Task activity", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alerts when a task is assigned to this phone.");
        ch.setLightColor(SIGNAL);
        ch.enableLights(true);
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);
    }

    /** Task just assigned to this phone — heads-up alert. */
    void assigned(String title) {
        post("Task assigned", safeTitle(title), true, false);
    }

    /** Output started streaming. Update text, don't re-buzz. */
    void generating(String title) {
        post("Generating…", safeTitle(title), false, false);
    }

    /** Task finished (completed or failed). Tap dismisses. */
    void finished(String title, boolean ok) {
        post(ok ? "Complete ✓" : "Failed ✕", safeTitle(title), false, true);
    }

    void clear() {
        nm.cancel(NOTIF_ID);
    }

    private void post(String heading, String body, boolean alert, boolean autoCancel) {
        Intent open = new Intent(app, KioskActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            app, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(SIGNAL)
            .setContentTitle(heading)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(autoCancel)
            .setOngoing(!autoCancel)      // keep pinned while a task is live
            .setOnlyAlertOnce(!alert)     // buzz on assignment only
            .build();

        nm.notify(NOTIF_ID, n);
    }

    private static String safeTitle(String t) {
        if (t == null || t.trim().isEmpty()) return "Worker task";
        return t.trim();
    }
}
