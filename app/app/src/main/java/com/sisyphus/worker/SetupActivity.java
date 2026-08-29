package com.sisyphus.worker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * GLITCH-styled first-run / re-config screen. Collects hub IP:port and this
 * phone's worker name, then hands off to the fullscreen kiosk. Built in code
 * (no XML/appcompat) so the module has zero external dependencies.
 *
 * Palette mirrors web/src/index.css: --bg #0E0E0E, --text #EAE7E0,
 * --text-faint #8A8880, --border #3A3A36, --signal #3DDC84, --ink #111111.
 */
public class SetupActivity extends Activity {

    private static final int BG = Color.parseColor("#0E0E0E");
    private static final int SURFACE = Color.parseColor("#111111");
    private static final int TEXT = Color.parseColor("#EAE7E0");
    private static final int FAINT = Color.parseColor("#8A8880");
    private static final int BORDER = Color.parseColor("#3A3A36");
    private static final int SIGNAL = Color.parseColor("#3DDC84");
    private static final int INK = Color.parseColor("#111111");

    private EditText hubField;
    private EditText nameField;
    private Button connectButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Prefs prefs = new Prefs(this);

        int pad = dp(28);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(pad, pad, pad, pad);
        root.setGravity(Gravity.CENTER_VERTICAL);

        // Wordmark — real Silkscreen, the web .pixel display face.
        TextView wordmark = new TextView(this);
        wordmark.setText("SISYPHUS");
        wordmark.setTypeface(Type.pixel(this));
        wordmark.setTextColor(TEXT);
        wordmark.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        root.addView(wordmark);

        // Subtitle row: 7px signal square + micro-label (echoes the web LIVE
        // indicator). Green appears only here, honoring the signal-green budget.
        LinearLayout subRow = new LinearLayout(this);
        subRow.setOrientation(LinearLayout.HORIZONTAL);
        subRow.setGravity(Gravity.CENTER_VERTICAL);
        subRow.setPadding(0, dp(10), 0, dp(40));

        View sq = new View(this);
        sq.setBackgroundColor(SIGNAL);
        LinearLayout.LayoutParams sqlp = new LinearLayout.LayoutParams(dp(7), dp(7));
        sqlp.rightMargin = dp(10);
        subRow.addView(sq, sqlp);

        TextView sub = new TextView(this);
        sub.setText("WORKER · KIOSK");
        sub.setTypeface(Type.mono(this));
        sub.setTextColor(FAINT);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        sub.setLetterSpacing(0.14f);
        subRow.addView(sub);
        root.addView(subRow);

        hubField = field(prefs.hubIp() + ":" + prefs.port(), "HUB  (IP:PORT)");
        root.addView(label("HUB  (IP:PORT)"));
        root.addView(hubField);

        View gap = new View(this);
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(20)));

        nameField = field(prefs.name(), "PHONE NAME");
        nameField.setHint("phone1");
        nameField.setHintTextColor(Color.parseColor("#55534E"));
        root.addView(label("PHONE NAME"));
        root.addView(nameField);

        // Primary action = inverted block (--text bg / --ink text), matching the
        // web's active tab cell and NPU badge — NOT green (green-budget rule).
        connectButton = new Button(this);
        connectButton.setText("CONNECT");
        connectButton.setAllCaps(true);
        connectButton.setTypeface(Type.monoBold(this));
        connectButton.setLetterSpacing(0.14f);
        connectButton.setTextColor(INK);
        connectButton.setBackgroundColor(TEXT);
        connectButton.setStateListAnimator(null);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        blp.topMargin = dp(40);
        root.addView(connectButton, blp);

        connectButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                onConnect(prefs);
            }
        });

        // On-device build proof: if this label doesn't match the APK you just
        // sent, the install didn't actually replace the old app.
        TextView build = new TextView(this);
        build.setText("BUILD " + BuildConfig.VERSION_NAME);
        build.setTypeface(Type.mono(this));
        build.setTextColor(FAINT);
        build.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9);
        build.setLetterSpacing(0.14f);
        build.setGravity(Gravity.CENTER_HORIZONTAL);
        LinearLayout.LayoutParams blp2 = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp2.topMargin = dp(24);
        root.addView(build, blp2);

        setContentView(root);
    }

    private void onConnect(Prefs prefs) {
        String hub = hubField.getText().toString().trim();
        String name = nameField.getText().toString().trim();

        if (name.isEmpty()) {
            toast("Enter a phone name (e.g. phone1)");
            return;
        }

        String ip = hub;
        int port = BuildConfig.DEFAULT_PORT;
        int colon = hub.lastIndexOf(':');
        if (colon > 0) {
            ip = hub.substring(0, colon).trim();
            try {
                port = Integer.parseInt(hub.substring(colon + 1).trim());
            } catch (NumberFormatException ignored) {
                toast("Port must be a number");
                return;
            }
        }
        if (ip.isEmpty()) {
            toast("Enter the hub IP");
            return;
        }

        // The worker route needs the server's hashed phoneId, not the plain
        // name the operator typed — resolve it from the live phone list first.
        connectButton.setEnabled(false);
        connectButton.setText("CONNECTING…");
        final String finalIp = ip;
        final int finalPort = port;
        final String finalName = name;
        PhoneLookup.resolve(ip, port, name, new PhoneLookup.Callback() {
            @Override public void onResolved(String phoneId) {
                prefs.save(finalIp, finalPort, finalName, phoneId);
                startActivity(new Intent(SetupActivity.this, KioskActivity.class));
                finish();
            }

            @Override public void onError(String message) {
                connectButton.setEnabled(true);
                connectButton.setText("CONNECT");
                toast(message);
            }
        });
    }

    private EditText field(String value, String contentDesc) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setContentDescription(contentDesc);
        e.setSingleLine(true);
        e.setTypeface(Type.mono(this));
        e.setTextColor(TEXT);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        e.setPadding(dp(14), dp(14), dp(14), dp(14));

        GradientDrawable box = new GradientDrawable();
        box.setColor(SURFACE);
        box.setStroke(dp(1), BORDER);
        box.setCornerRadius(0f); // zero radius — GLITCH rule
        e.setBackground(box);
        e.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTypeface(Type.mono(this));
        t.setTextColor(FAINT);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        t.setLetterSpacing(0.14f);
        t.setPadding(0, 0, 0, dp(8));
        return t;
    }

    private void toast(String m) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
