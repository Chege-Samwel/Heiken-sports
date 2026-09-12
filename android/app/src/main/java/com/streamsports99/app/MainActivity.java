package com.streamsports99.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * StreamSports99 — Android wrapper (API 23+).
 *
 * A single fullscreen WebView that:
 *  - loads the deployed site when online, and falls back to the copy bundled
 *    in assets/www when offline (so TV boxes get instant startup either way)
 *  - supports Android TV: D-pad navigation is handled by the site's spatial
 *    navigation, BACK/ENTER keys are mapped below, and a leanback launcher
 *    banner is declared in the manifest
 *  - enables fullscreen <video>/element fullscreen via WebChromeClient
 *  - allows autoplay of muted media and mixed content (many free sports
 *    stream endpoints are plain http)
 */
public class MainActivity extends Activity {

    /** Deployed site. Change after you connect your own Vercel domain. */
    private static final String REMOTE_URL = "https://heiken-sports.vercel.app/";
    /** Copy of the site bundled inside the APK (works offline). */
    private static final String LOCAL_URL = "file:///android_asset/www/index.html";

    private FrameLayout rootLayout;
    private WebView webView;

    // --- custom fullscreen view state (HTML5 fullscreen) ---
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int originalSystemUiVisibility;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sports app: don't let the screen sleep mid-match.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFF070B12);
        setContentView(rootLayout);
        getWindow().setStatusBarColor(0xFF070B12);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF070B12);
        rootLayout.addView(
                webView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // allow autoplay (muted fallback in-page)
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(true);
        if (Build.VERSION.SDK_INT >= 21) {
            // many free stream URLs are http:// — allow them inside the page
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        webView.setWebViewClient(new SiteWebViewClient());
        webView.setWebChromeClient(new TvChromeClient());
        webView.requestFocus();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadHome();
        }
    }

    private void loadHome() {
        if (isOnline()) {
            webView.loadUrl(REMOTE_URL);
        } else {
            webView.loadUrl(LOCAL_URL);
            Toast.makeText(this, "Offline — using the bundled site", Toast.LENGTH_SHORT).show();
        }
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Navigation: keep the site inside the app, send everything else out
    // ------------------------------------------------------------------
    private class SiteWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url == null) return false;
            Uri uri = Uri.parse(url);

            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

            // Our own site (remote deployment) stays in the app
            if (url.startsWith("file://") || host.contains("heiken-sports.vercel.app")) {
                return false;
            }

            // Everything else (cdnlivetv.is JSON endpoints, mailto:, stores…) -> system
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(MainActivity.this, "No app can open this link", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Only care about the main frame; subresources (streams, images) fail quietly
            if (Build.VERSION.SDK_INT >= 23 && request.isForMainFrame()) {
                String failing = request.getUrl().toString();
                if (REMOTE_URL.equals(failing)) {
                    // Remote unreachable: fall back to the bundled site
                    webView.loadUrl(LOCAL_URL);
                    Toast.makeText(MainActivity.this, "Using bundled offline site", Toast.LENGTH_SHORT).show();
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // HTML5 fullscreen (used by the player's fullscreen button)
    // ------------------------------------------------------------------
    private class TvChromeClient extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            originalSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            rootLayout.addView(
                    view,
                    new FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT));
            webView.setVisibility(View.GONE);
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            rootLayout.removeView(customView);
            customView = null;
            getWindow().getDecorView().setSystemUiVisibility(originalSystemUiVisibility);
            webView.setVisibility(View.VISIBLE);
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Old WebView crashed (low-memory TV boxes) — restart cleanly instead of dying
            if (Build.VERSION.SDK_INT >= 26) {
                Intent intent = getBaseContext().getPackageManager()
                        .getLaunchIntentForPackage(getBaseContext().getPackageName());
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    startActivity(intent);
                }
                finish();
                return true;
            }
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Keys: BACK exits fullscreen / navigates history; D-pad reaches the page
    // ------------------------------------------------------------------
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                // simulate leaving HTML5 fullscreen
                if (webView.getWebChromeClient() instanceof TvChromeClient) {
                    ((TvChromeClient) webView.getWebChromeClient()).onHideCustomView();
                }
                return true;
            }
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        // MENU button on TV remotes -> reload (handy on boxes)
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            webView.reload();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (Build.VERSION.SDK_INT >= 11) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= 11) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
