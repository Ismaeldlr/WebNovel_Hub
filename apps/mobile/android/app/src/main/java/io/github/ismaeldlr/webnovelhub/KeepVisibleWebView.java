package io.github.ismaeldlr.webnovelhub;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * The app's WebView. While background fetching runs it tells Chromium it is still visible:
 * otherwise Chromium freezes the page about five minutes after the app leaves the screen,
 * and the page is where the fetching happens. The rest of the time it behaves normally,
 * so the page is throttled like any other when nobody is looking at it.
 */
public class KeepVisibleWebView extends CapacitorWebView {

    private boolean keepVisible = false;

    public KeepVisibleWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setKeepVisible(boolean keepVisible) {
        if (this.keepVisible == keepVisible) return;
        this.keepVisible = keepVisible;
        // Tell Chromium the visibility it should go by from now on.
        int visibility = getWindowVisibility();
        super.onWindowVisibilityChanged(keepVisible ? View.VISIBLE : visibility);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (!keepVisible) {
            super.onWindowVisibilityChanged(visibility);
        } else if (visibility != View.GONE) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
        // While kept visible, the window going away (GONE, when the app leaves the screen)
        // isn't passed on at all: that is what Chromium freezes a page on.
    }
}
