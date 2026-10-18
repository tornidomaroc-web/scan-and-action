package com.scanaction.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** MainActivity.cappedTextZoom: the system font scale, up to the cap. */
public class TextZoomCapTest {

    @Test
    public void followsTheScaleUpToTheCap() {
        assertEquals(85, MainActivity.cappedTextZoom(0.85f));
        assertEquals(100, MainActivity.cappedTextZoom(1.0f));
        assertEquals(115, MainActivity.cappedTextZoom(1.15f));
        assertEquals(130, MainActivity.cappedTextZoom(1.3f));
    }

    @Test
    public void stopsAtTheCap() {
        assertEquals(135, MainActivity.cappedTextZoom(1.5f));
        assertEquals(135, MainActivity.cappedTextZoom(1.8f));
        assertEquals(135, MainActivity.cappedTextZoom(2.0f));
    }

    @Test
    public void anUnreadableScaleMeansNoZoom() {
        assertEquals(100, MainActivity.cappedTextZoom(Float.NaN));
        assertEquals(100, MainActivity.cappedTextZoom(0f));
        assertEquals(100, MainActivity.cappedTextZoom(-1f));
    }

    @Test
    public void theCapIsIosXxxLargeRoundedDown() {
        // 23/17 = 135.29%: rounded down so the web layer's cap (the same ratio)
        // never sees a zoom above its own and acts on top of this one.
        assertEquals((int) Math.floor(23.0 / 17.0 * 100.0), MainActivity.TEXT_ZOOM_CAP_PERCENT);
    }
}
