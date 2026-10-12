package io.github.ismaeldlr.webnovelhub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

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

    /** The library database, as the SQLite plugin names it. */
    private static final String LIBRARY = "librarySQLite.db";
    /** What the page names the libraries a restore replaces. */
    private static final String KEPT_PREFIX = "webnovel-hub-before-restore-";
    /** How many replaced libraries are kept. */
    private static final int KEEP = 3;

    /** Asks for a backup file and copies it into the cache: `{path}`, or `{}` when cancelled. */
    @PluginMethod
    public void pickBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "backupPicked");
    }

    @ActivityCallback
    private void backupPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.resolve(new JSObject());
            return;
        }
        File copy = new File(getContext().getCacheDir(), "restore.whub");
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IOException("the file is gone");
                copy(in, copy);
                JSObject picked = new JSObject();
                picked.put("path", copy.getAbsolutePath());
                call.resolve(picked);
            } catch (IOException | SecurityException error) {
                call.reject("Couldn't read the file: " + error.getMessage());
            }
        }).start();
    }

    /** The libraries replaced by a restore, newest first: `{backups: [{name, path}]}`. */
    @PluginMethod
    public void keptBackups(PluginCall call) {
        JSArray list = new JSArray();
        for (File file : kept(backupsFolder())) {
            JSObject backup = new JSObject();
            backup.put("name", file.getName());
            backup.put("path", file.getAbsolutePath());
            list.put(backup);
        }
        JSObject result = new JSObject();
        result.put("backups", list);
        call.resolve(result);
    }

    /**
     * Puts the backup at `path` (a file of the app's: picked or kept) in place of the library,
     * which is kept as `keepAs`. The page has closed the database and reloads after.
     */
    @PluginMethod
    public void replaceLibrary(PluginCall call) {
        String path = call.getString("path");
        String keepAs = call.getString("keepAs");
        if (path == null || keepAs == null) {
            call.reject("path and keepAs are needed");
            return;
        }
        File backup = new File(path);
        File library = getContext().getDatabasePath(LIBRARY);
        File folder = backupsFolder();
        new Thread(() -> {
            File keep = new File(folder, new File(keepAs).getName());
            // Putting a kept library back within the second it was kept.
            while (keep.exists()) keep = new File(folder, keep.getName().replace(".whub", ".1.whub"));
            if (!library.renameTo(keep)) {
                call.reject("Couldn't move the current library aside");
                return;
            }
            for (String suffix : new String[] { "-wal", "-shm", "-journal" }) {
                new File(library.getPath() + suffix).delete();
            }
            try (InputStream in = new FileInputStream(backup)) {
                copy(in, library);
            } catch (IOException error) {
                library.delete();
                keep.renameTo(library);
                call.reject("Couldn't copy the backup: " + error.getMessage());
                return;
            }
            backup.delete();
            List<File> old = kept(folder);
            for (File file : old.subList(Math.min(KEEP, old.size()), old.size())) file.delete();
            call.resolve();
        }).start();
    }

    private File backupsFolder() {
        File folder = new File(getContext().getFilesDir(), "backups");
        folder.mkdirs();
        return folder;
    }

    private static List<File> kept(File folder) {
        File[] files = folder.listFiles((dir, name) -> name.startsWith(KEPT_PREFIX));
        List<File> list = new ArrayList<>(files == null ? Collections.emptyList() : Arrays.asList(files));
        // The names end in the date and time, so the newest sorts last.
        Collections.sort(list, (a, b) -> b.getName().compareTo(a.getName()));
        return list;
    }

    private static void copy(InputStream in, File target) throws IOException {
        try (OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[1 << 16];
            for (int read; (read = in.read(buffer)) != -1; ) out.write(buffer, 0, read);
        }
    }
}
