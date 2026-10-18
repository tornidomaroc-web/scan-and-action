package com.scanaction.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * The largest text zoom, in percent: iOS xxxLarge (23/17 = 135.29%),
     * rounded DOWN so it never exceeds TEXT_SCALE_CAP in
     * src/native/textScale.ts. If it did, the web layer would measure a zoom
     * above its cap and pull the root down on top of this one
     * (textScale.test.ts pins the two together).
     */
    static final int TEXT_ZOOM_CAP_PERCENT = 135;

    private static final String TAG = "ScanActionTextZoom";

    /**
     * The WebView's text zoom for a system font scale: the scale itself up to
     * the cap. Android's WebView applies the font scale to the glyphs only,
     * never to rem or em lengths; capping it here, instead of shrinking the
     * page's root in JavaScript, keeps every control at its size while the
     * text stops at the cap (restyle PR 3 measured Detail's back button at
     * 30x30 px under the JavaScript cap at font scale 2.0).
     */
    static int cappedTextZoom(float fontScale) {
        if (Float.isNaN(fontScale) || fontScale <= 0f) return 100;
        return Math.min(Math.round(fontScale * 100f), TEXT_ZOOM_CAP_PERCENT);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Fallback: any failure leaves the WebView's own zoom in place, and
        // src/native/textScale.ts, which measures the zoom actually applied,
        // still holds the text at the cap as it did before this change.
        // A font size change recreates this activity (fontScale is not in
        // android:configChanges), so this runs again with the new scale.
        try {
            WebView webView = getBridge().getWebView();
            float fontScale = getResources().getConfiguration().fontScale;
            int zoom = cappedTextZoom(fontScale);
            webView.getSettings().setTextZoom(zoom);
            Log.i(TAG, "fontScale=" + fontScale + " textZoom=" + zoom);
        } catch (RuntimeException e) {
            Log.w(TAG, "text zoom cap not applied; the web layer's cap holds", e);
        }
    }
}
