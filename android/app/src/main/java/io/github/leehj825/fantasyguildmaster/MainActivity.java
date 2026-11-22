package io.github.leehj825.fantasyguildmaster;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.webkit.JavascriptInterface;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.ArrayList;
import java.util.List;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Fantasy Guild Master runs as the plain web game inside a WebView. The files are bundled in the APK under assets/www and
 * served from a made-up https origin, so ES modules and WebGL run in a secure context without file:// access.
 * Debug builds allow chrome://inspect.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE = "https://" + HOST + "/";
    private static final String TAG = "GuildMaster";
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "application/javascript");
        MIME.put("mjs", "application/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
    }

    // Debug builds use Google's TEST ad units (clicking your own live ads is against AdMob policy); release builds use the real ones.
    private static final String BANNER_ID = BuildConfig.DEBUG ? "ca-app-pub-3940256099942544/6300978111" : "ca-app-pub-4400173019354346/2942968813";
    private static final String REWARDED_ID = BuildConfig.DEBUG ? "ca-app-pub-3940256099942544/5224354917" : "ca-app-pub-4400173019354346/3174068951";

    private WebView web;
    private AdView banner;
    private RewardedAd rewarded;
    private boolean adsStarted = false;
    private LinearLayout rootView;

    // Play Billing: one-time products created in the Play Console with these ids
    private static final String[] PRODUCT_IDS = { "starter_pack" };
    private BillingClient billing;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private boolean billingReady = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        // The page sits above a banner strip: the WebView simply gets shorter when the banner shows, so nothing in the game is covered.
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        rootView = root;
        web.addJavascriptInterface(new AdBridge(), "AndroidAds");
        web.addJavascriptInterface(new BillingBridge(), "AndroidBilling");
        web.addJavascriptInterface(new NotifyBridge(), "AndroidNotify");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED && !getSharedPreferences("iap", MODE_PRIVATE).getBoolean("asked_notify", false)) {
            getSharedPreferences("iap", MODE_PRIVATE).edit().putBoolean("asked_notify", true).apply();
            requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 1);
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setBackgroundColor(0xFF2F7A32);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!HOST.equals(request.getUrl().getHost())) return null;
                String path = request.getUrl().getPath();
                if (path == null || path.equals("/")) path = "/www/index.html";
                if (path.contains("..")) return null;
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    return new WebResourceResponse(mimeOf(path), "utf-8", in);
                } catch (IOException e) {
                    Log.w(TAG, "Missing asset " + path);
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.sourceId() + ":" + m.lineNumber() + " " + m.message());
                return true;
            }
        });
        web.loadUrl(BASE + "www/index.html");
        startConsentThenAds(root);
        startBilling();
    }

    // ---------------------------------------------------------------- ads
    // Ask for consent where the law requires it (UMP), then start the Mobile Ads SDK, the banner and the rewarded ad.
    private void startConsentThenAds(final LinearLayout root) {
        final ConsentInformation info = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        info.requestConsentInfoUpdate(this, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> {
                    if (info.canRequestAds()) startAds(root);
                }),
                requestError -> { if (info.canRequestAds()) startAds(root); });
        if (info.canRequestAds()) startAds(root);   // consent from an earlier session
    }

    private synchronized void startAds(final LinearLayout root) {
        if (adsStarted) return;
        adsStarted = true;
        MobileAds.initialize(this, status -> { });
        banner = new AdView(this);
        banner.setAdUnitId(BANNER_ID);
        banner.setAdSize(AdSize.BANNER);
        banner.setVisibility(View.GONE);
        banner.setAdListener(new AdListener() {
            @Override public void onAdLoaded() { banner.setVisibility(View.VISIBLE); }
            @Override public void onAdFailedToLoad(LoadAdError error) { banner.setVisibility(View.GONE); }
        });
        root.addView(banner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ((LinearLayout.LayoutParams) banner.getLayoutParams()).gravity = android.view.Gravity.CENTER_HORIZONTAL;
        banner.loadAd(new AdRequest.Builder().build());
        loadRewarded();
    }

    private void loadRewarded() {
        RewardedAd.load(this, REWARDED_ID, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) { rewarded = ad; }
            @Override public void onAdFailedToLoad(LoadAdError error) {
                rewarded = null;
                web.postDelayed(MainActivity.this::loadRewarded, 60000);   // try again in a minute
            }
        });
    }

    private void answer(final String id, final boolean ok) {
        web.postDelayed(() -> web.evaluateJavascript("window.__adResult&&window.__adResult('" + id + "'," + ok + ")", null), 300);
    }

    private void showRewarded(final String id) {
        final RewardedAd ad = rewarded;
        if (ad == null) { answer(id, false); return; }
        rewarded = null;
        final boolean[] earned = { false };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { answer(id, earned[0]); loadRewarded(); }
            @Override public void onAdFailedToShowFullScreenContent(AdError error) { answer(id, false); loadRewarded(); }
        });
        ad.show(this, reward -> earned[0] = true);
    }

    // ---------------------------------------------------------------- purchases
    private boolean ownedLocal(String id) { return getSharedPreferences("iap", MODE_PRIVATE).getBoolean(id, false); }

    private void startBilling() {
        PurchasesUpdatedListener listener = (result, purchases) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase p : purchases) handlePurchase(p, true);
            } else {
                for (String id : PRODUCT_IDS) if (pendingId != null && id.equals(pendingId)) { reply(id, false); pendingId = null; }
            }
        };
        billing = BillingClient.newBuilder(this).setListener(listener)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).build();
        connectBilling();
    }

    private void connectBilling() {
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
                billingReady = true;
                queryDetails();
                restorePurchases();
            }
            @Override public void onBillingServiceDisconnected() { billingReady = false; web.postDelayed(MainActivity.this::connectBilling, 30000); }
        });
    }

    private void queryDetails() {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : PRODUCT_IDS) list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, found) -> {
            for (ProductDetails d : found) details.put(d.getProductId(), d);
        });
    }

    // Purchases made earlier (or on another device) come back here, so nothing paid for is lost after a reinstall
    private void restorePurchases() {
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, purchases) -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) for (Purchase p : purchases) handlePurchase(p, false);
        });
    }

    private String pendingId = null;

    private void handlePurchase(final Purchase p, final boolean fresh) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
        for (final String id : p.getProducts()) {
            getSharedPreferences("iap", MODE_PRIVATE).edit().putBoolean(id, true).apply();
            if (fresh) { reply(id, true); pendingId = null; }
        }
        if (!p.isAcknowledged()) {
            billing.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
        }
    }

    private void reply(final String id, final boolean ok) {
        web.post(() -> web.evaluateJavascript("window.__iapResult&&window.__iapResult('" + id + "'," + ok + ")", null));
    }

    private void buy(final String id) {
        final ProductDetails d = details.get(id);
        if (!billingReady || d == null) { reply(id, false); return; }
        pendingId = id;
        List<BillingFlowParams.ProductDetailsParams> pl = new ArrayList<>();
        pl.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build());
        BillingResult r = billing.launchBillingFlow(this, BillingFlowParams.newBuilder().setProductDetailsParamsList(pl).build());
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { pendingId = null; reply(id, false); }
    }

    private class BillingBridge {
        @JavascriptInterface public boolean isReady() { return billingReady && !details.isEmpty(); }
        @JavascriptInterface public boolean owned(String id) { return ownedLocal(id); }
        @JavascriptInterface public String price(String id) {
            ProductDetails d = details.get(id);
            return d != null && d.getOneTimePurchaseOfferDetails() != null ? d.getOneTimePurchaseOfferDetails().getFormattedPrice() : "";
        }
        @JavascriptInterface public void buy(final String id) { runOnUiThread(() -> MainActivity.this.buy(id)); }
    }

    // ---------------------------------------------------------------- reminders
    private PendingIntent alarmIntent(int id, String title, String text, int flags) {
        Intent i = new Intent(this, NotifyReceiver.class).putExtra("id", id).putExtra("title", title).putExtra("text", text);
        return PendingIntent.getBroadcast(this, id, i, PendingIntent.FLAG_IMMUTABLE | flags);
    }
    private class NotifyBridge {
        @JavascriptInterface public void schedule(int id, int seconds, String title, String text) {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + seconds * 1000L, alarmIntent(id, title, text, PendingIntent.FLAG_UPDATE_CURRENT));
        }
        @JavascriptInterface public void cancelAll() {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null) for (int id = 1; id <= 3; id++) am.cancel(alarmIntent(id, "", "", PendingIntent.FLAG_UPDATE_CURRENT));
        }
    }

    // What the page can call (see src/ads.js)
    private class AdBridge {
        @JavascriptInterface public boolean isReady() { return rewarded != null; }
        @JavascriptInterface public void show(final String id) { runOnUiThread(() -> showRewarded(id)); }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        String m = MIME.get(ext);
        return m != null ? m : "application/octet-stream";
    }

    // WebView.onPause() does not stop Web Audio, so tell the page to silence itself first
    @Override protected void onPause() { web.evaluateJavascript("window.__scheduleNotify&&window.__scheduleNotify()", null); if (banner != null) banner.pause(); web.evaluateJavascript("window.__audioHidden&&window.__audioHidden(true)", null); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.evaluateJavascript("window.__cancelNotify&&window.__cancelNotify()", null); if (banner != null) banner.resume(); web.onResume(); web.evaluateJavascript("window.__audioHidden&&window.__audioHidden(false)", null); }
    @Override protected void onDestroy() { if (banner != null) banner.destroy(); web.destroy(); super.onDestroy(); }
}
