package io.github.ismaeldlr.webnovelhub;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The Android parts around the page that no Capacitor plugin covers. */
@CapacitorPlugin(name = "Shell")
public class ShellPlugin extends Plugin {

    /** Keeps the page running at full speed while it is out of sight (KeepVisibleWebView). */
    @PluginMethod
    public void setKeepVisible(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            WebView view = getBridge().getWebView();
            if (view instanceof KeepVisibleWebView) ((KeepVisibleWebView) view).setKeepVisible(on);
            call.resolve();
        });
    }

    /** Whether Android may stop the app's work to save battery. */
    @PluginMethod
    public void batteryRestricted(PluginCall call) {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("restricted", !power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(result);
    }

    /** Asks the reader to let the app run in the background without battery limits. */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void askBatteryExemption(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
        call.resolve();
    }
}
