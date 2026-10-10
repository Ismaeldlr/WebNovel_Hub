package io.github.ismaeldlr.webnovelhub;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayDeque;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Pages whose text only their own scripts produce, loaded in an off-screen WebView. Once a
 * CSS selector matches (or, without one, once the page has loaded) or the time is up, the
 * page's HTML comes back. That WebView has no bridge to the app, so a page loaded there
 * can't call anything. One page renders at a time.
 */
@CapacitorPlugin(name = "Render")
public class RenderPlugin extends Plugin {

    private static final long POLL_MS = 250;
    /** Beyond the caller's timeout: for a page that never answers at all. */
    private static final long GRACE_MS = 15_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayDeque<PluginCall> waiting = new ArrayDeque<>();
    private boolean busy = false;

    @PluginMethod
    public void render(PluginCall call) {
        if (call.getString("url") == null) {
            call.reject("No URL to render");
            return;
        }
        handler.post(() -> {
            waiting.add(call);
            next();
        });
    }

    /**
     * Opens a site's page (its sign-in page) full screen, in a WebView that shares the app's
     * cookies with the off-screen one: the rendered pages are signed in to what the reader
     * signs in to here. Resolves once the reader closes it. It has no bridge to the app either.
     */
    @PluginMethod
    @SuppressLint("SetJavaScriptEnabled")
    public void openWindow(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("No https page to open");
            return;
        }
        String title = call.getString("title", "");
        handler.post(() -> {
            Context context = getActivity();
            Dialog dialog = new Dialog(context, android.R.style.Theme_DeviceDefault_NoActionBar);
            LinearLayout layout = new LinearLayout(context);
            layout.setOrientation(LinearLayout.VERTICAL);

            LinearLayout bar = new LinearLayout(context);
            bar.setOrientation(LinearLayout.HORIZONTAL);
            int padding = Math.round(12 * context.getResources().getDisplayMetrics().density);
            bar.setPadding(padding, padding / 2, padding / 2, padding / 2);
            TextView heading = new TextView(context);
            heading.setText(title);
            heading.setTextSize(18);
            bar.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            Button done = new Button(context);
            done.setText("Done");
            done.setOnClickListener((button) -> dialog.dismiss());
            bar.addView(done);
            layout.addView(bar);

            WebView view = new WebView(context);
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setDomStorageEnabled(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);
            view.setWebViewClient(new WebViewClient());
            layout.addView(view, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

            dialog.setContentView(layout);
            dialog.setOnDismissListener((closed) -> {
                CookieManager.getInstance().flush();
                view.destroy();
                call.resolve();
            });
            view.loadUrl(url);
            dialog.show();
        });
    }

    private void next() {
        if (busy || waiting.isEmpty()) return;
        busy = true;
        new Page(waiting.poll()).start();
    }

    /** A WebView that keeps rendering while the app is out of sight. */
    private static class OffscreenWebView extends WebView {

        OffscreenWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    private class Page {

        private final PluginCall call;
        private final String url;
        private final String waitFor;
        private final long timeout;
        private final String userAgent;
        private WebView view;
        private ViewGroup root;
        private long started;
        private int status = 200;
        private boolean loaded = false;
        private boolean done = false;

        Page(PluginCall call) {
            this.call = call;
            this.url = call.getString("url");
            this.waitFor = call.getString("waitFor");
            this.timeout = call.getInt("timeout", 45_000);
            this.userAgent = call.getString("userAgent");
        }

        @SuppressLint("SetJavaScriptEnabled")
        void start() {
            view = new OffscreenWebView(getContext());
            view.getSettings().setJavaScriptEnabled(true);
            view.getSettings().setDomStorageEnabled(true);
            if (userAgent != null) view.getSettings().setUserAgentString(userAgent);
            view.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public void onPageStarted(WebView page, String address, Bitmap icon) {
                        loaded = true;
                    }

                    @Override
                    public void onReceivedHttpError(WebView page, WebResourceRequest request, WebResourceResponse response) {
                        if (request.isForMainFrame()) status = response.getStatusCode();
                    }

                    @Override
                    public void onReceivedError(WebView page, WebResourceRequest request, WebResourceError error) {
                        if (request.isForMainFrame()) fail(url + " didn't load: " + error.getDescription());
                    }
                }
            );
            root = (ViewGroup) getActivity().getWindow().getDecorView();
            root.addView(view, new FrameLayout.LayoutParams(1, 1));
            view.setAlpha(0f);
            started = System.currentTimeMillis();
            view.loadUrl(url);
            handler.postDelayed(this::poll, POLL_MS);
        }

        private String probe() {
            String ready = waitFor == null
                ? "document.readyState === 'complete'"
                : "document.readyState !== 'loading' && document.querySelector(" + JSONObject.quote(waitFor) + ") !== null";
            boolean late = System.currentTimeMillis() - started >= timeout;
            return "(function(){if(!(" + ready + ")&&!" + late +
                ")return null;return JSON.stringify({url:location.href,html:document.documentElement.outerHTML});})()";
        }

        private void poll() {
            if (done) return;
            if (System.currentTimeMillis() - started > timeout + GRACE_MS) {
                fail(url + " didn't load in time");
                return;
            }
            view.evaluateJavascript(probe(), value -> {
                if (done) return;
                String page = decode(value);
                if (page == null || !loaded) {
                    handler.postDelayed(this::poll, POLL_MS);
                    return;
                }
                try {
                    JSONObject answer = new JSONObject(page);
                    JSObject result = new JSObject();
                    result.put("url", answer.getString("url"));
                    result.put("status", status);
                    result.put("html", answer.getString("html"));
                    finish();
                    call.resolve(result);
                } catch (Exception error) {
                    fail("The rendered page couldn't be read: " + error.getMessage());
                }
            });
        }

        private void fail(String message) {
            if (done) return;
            finish();
            call.reject(message);
        }

        private void finish() {
            done = true;
            root.removeView(view);
            view.destroy();
            busy = false;
            next();
        }
    }

    /** The string an `evaluateJavascript` result holds, or null. */
    private static String decode(String value) {
        if (value == null || value.equals("null")) return null;
        try {
            Object decoded = new JSONTokener(value).nextValue();
            return decoded instanceof String ? (String) decoded : null;
        } catch (Exception error) {
            return null;
        }
    }
}
