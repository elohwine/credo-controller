package com.credentis.mobile;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private WindowInsetsControllerCompat systemBarsController;
    private final SafeAreaInsetsState safeAreaInsets = new SafeAreaInsetsState();
    private final DeviceKeyBridge deviceKeys = new DeviceKeyBridge(this);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        systemBarsController = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        getBridge().getWebView().addJavascriptInterface(new SystemBarsBridge(), "CredentisSystemBars");
        getBridge().getWebView().addJavascriptInterface(new PushBridge(), "CredentisPush");
        getBridge().getWebView().addJavascriptInterface(new DeviceKeyJsBridge(), "CredentisDeviceKey");
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                applySafeAreaScript(safeAreaInsets.forPageLoad());
            }
        });
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            int top = Math.round(insets.top / density);
            int right = Math.round(insets.right / density);
            int bottom = Math.round(insets.bottom / density);
            int left = Math.round(insets.left / density);
            applySafeAreaScript(safeAreaInsets.update(top, right, bottom, left));
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(getBridge().getWebView());
    }

    private void applySafeAreaScript(String javascript) {
        if (javascript == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(javascript, null));
    }

    static final class SafeAreaInsetsState {
        private String javascript;

        String update(int top, int right, int bottom, int left) {
            String next =
                "(function(){var insets={" +
                "'--safe-area-inset-top':'" + top + "px'," +
                "'--safe-area-inset-right':'" + right + "px'," +
                "'--safe-area-inset-bottom':'" + bottom + "px'," +
                "'--safe-area-inset-left':'" + left + "px'};" +
                "var style=document.documentElement.style;" +
                "Object.keys(insets).forEach(function(name){" +
                "if(style.getPropertyValue(name)!==insets[name])style.setProperty(name,insets[name]);" +
                "});})();";
            if (next.equals(javascript)) return null;
            javascript = next;
            return next;
        }

        // A full page reload replaces the document, so replay the latest insets once it loads.
        String forPageLoad() {
            return javascript;
        }
    }

    private final class SystemBarsBridge {
        @JavascriptInterface
        public void setDarkMode(boolean dark) {
            runOnUiThread(() -> {
                if (systemBarsController == null) return;
                systemBarsController.setAppearanceLightStatusBars(!dark);
                systemBarsController.setAppearanceLightNavigationBars(!dark);
            });
        }
    }

    void deliverDeviceSignature(String signature, String error) {
        String javascript = signature != null
            ? "window.__credentisDeviceSign && window.__credentisDeviceSign(" + org.json.JSONObject.quote(signature) + ", null)"
            : "window.__credentisDeviceSign && window.__credentisDeviceSign(null, " + org.json.JSONObject.quote(error == null ? "Cancelled" : error) + ")";
        applySafeAreaScript(javascript);
    }

    private final class DeviceKeyJsBridge {
        @JavascriptInterface
        public boolean loginAvailable() {
            return deviceKeys.loginAvailable();
        }

        @JavascriptInterface
        public boolean hasKey(String alias) {
            try {
                return deviceKeys.hasKey(alias);
            } catch (Exception error) {
                android.util.Log.w("CredentisDeviceKey", "Unable to read device key", error);
                return false;
            }
        }

        @JavascriptInterface
        public String enrollForAccount(String input) {
            try {
                return deviceKeys.enrollForAccount(input);
            } catch (Exception error) {
                return "{\"error\":" + org.json.JSONObject.quote(error.getMessage()) + "}";
            }
        }

        @JavascriptInterface
        public String removeKey(String alias) {
            try {
                deviceKeys.removeKey(alias);
                return "{\"removed\":true}";
            } catch (Exception error) {
                return "{\"error\":" + org.json.JSONObject.quote(error.getMessage()) + "}";
            }
        }

        @JavascriptInterface
        public void signForKey(String alias, String payload) {
            runOnUiThread(() -> {
                try {
                    deviceKeys.signForKey(alias, payload);
                } catch (Exception error) {
                    deliverDeviceSignature(null, error.getMessage());
                }
            });
        }

        @JavascriptInterface
        public boolean isAvailable() {
            return deviceKeys.available();
        }

        @JavascriptInterface
        public String enroll() {
            try {
                return deviceKeys.enroll();
            } catch (Exception error) {
                return "{\"error\":" + org.json.JSONObject.quote(error.getMessage()) + "}";
            }
        }

        @JavascriptInterface
        public String describe() {
            try {
                return deviceKeys.publicDescription();
            } catch (Exception error) {
                return "{\"error\":" + org.json.JSONObject.quote(error.getMessage()) + "}";
            }
        }

        @JavascriptInterface
        public void sign(String payload) {
            runOnUiThread(() -> {
                try {
                    deviceKeys.sign(payload);
                } catch (Exception error) {
                    deliverDeviceSignature(null, error.getMessage());
                }
            });
        }
    }

    private final class PushBridge {
        /** google_app_id is generated only when google-services.json is in the build. */
        @JavascriptInterface
        public boolean isConfigured() {
            return getResources().getIdentifier("google_app_id", "string", getPackageName()) != 0;
        }
    }
}
