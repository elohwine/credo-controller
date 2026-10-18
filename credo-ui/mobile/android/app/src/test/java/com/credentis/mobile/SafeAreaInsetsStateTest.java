package com.credentis.mobile;

import static org.junit.Assert.*;

import org.junit.Test;

public class SafeAreaInsetsStateTest {
    @Test
    public void repeatedInsetsDoNotScheduleMoreWebViewUpdates() {
        MainActivity.SafeAreaInsetsState state = new MainActivity.SafeAreaInsetsState();
        String first = state.update(24, 0, 16, 0);
        assertNotNull(first);
        for (int i = 0; i < 1000; i++) {
            assertNull(state.update(24, 0, 16, 0));
        }
        assertEquals(first, state.forPageLoad());
    }

    @Test
    public void changedInsetsArePublishedAndRetainedForReload() {
        MainActivity.SafeAreaInsetsState state = new MainActivity.SafeAreaInsetsState();
        state.update(24, 0, 16, 0);
        String rotated = state.update(0, 24, 0, 16);
        assertNotNull(rotated);
        assertTrue(rotated.contains("'--safe-area-inset-top':'0px'"));
        assertTrue(rotated.contains("'--safe-area-inset-right':'24px'"));
        assertTrue(rotated.contains("'--safe-area-inset-bottom':'0px'"));
        assertTrue(rotated.contains("'--safe-area-inset-left':'16px'"));
        assertEquals(rotated, state.forPageLoad());
        assertNull(state.update(0, 24, 0, 16));
    }

    @Test
    public void zeroInsetsArePublishedOnFirstLayoutButNotBeforeLayout() {
        MainActivity.SafeAreaInsetsState state = new MainActivity.SafeAreaInsetsState();
        assertNull(state.forPageLoad());
        assertNotNull(state.update(0, 0, 0, 0));
        assertNull(state.update(0, 0, 0, 0));
    }

    @Test
    public void pageLoadReplayDoesNotRewriteUnchangedCssProperties() {
        MainActivity.SafeAreaInsetsState state = new MainActivity.SafeAreaInsetsState();
        String script = state.update(24, 0, 16, 0);
        assertTrue(script.contains("if(style.getPropertyValue(name)!==insets[name])"));
    }
}
