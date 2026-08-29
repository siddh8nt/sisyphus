package com.sisyphus.worker;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;

/**
 * The web design system as native resources: the two real font families
 * (Silkscreen for the pixel display face, JetBrains Mono for everything else)
 * and the dot-field background used behind empty/idle states. Fonts are the
 * exact TTFs the web loads from Google Fonts, bundled in res/font. Framework
 * getFont() (API 26+, our minSdk) — no AndroidX needed.
 */
final class Type {

    private Type() {}

    /** Silkscreen — wordmark, headlines, big numerals (web .pixel). */
    static Typeface pixel(Context c) {
        return c.getResources().getFont(R.font.silkscreen_regular);
    }

    static Typeface pixelBold(Context c) {
        return c.getResources().getFont(R.font.silkscreen_bold);
    }

    /** JetBrains Mono — body text and labels (web body font). */
    static Typeface mono(Context c) {
        return c.getResources().getFont(R.font.jetbrainsmono_regular);
    }

    static Typeface monoMedium(Context c) {
        return c.getResources().getFont(R.font.jetbrainsmono_medium);
    }

    static Typeface monoBold(Context c) {
        return c.getResources().getFont(R.font.jetbrainsmono_bold);
    }

    /**
     * Tiling dot field matching web .dotfield:
     * radial-gradient(#1E1E1B 1px, transparent) on a 22px grid.
     */
    static Drawable dotField(Context c) {
        float density = c.getResources().getDisplayMetrics().density;
        int cell = Math.round(22 * density);
        int dot = Math.max(1, Math.round(1.4f * density));
        Bitmap bmp = Bitmap.createBitmap(cell, cell, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.parseColor("#0E0E0E"));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.parseColor("#1E1E1B"));
        canvas.drawCircle(dot, dot, dot, p);
        BitmapDrawable d = new BitmapDrawable(c.getResources(), bmp);
        d.setTileModeXY(Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        return d;
    }
}
