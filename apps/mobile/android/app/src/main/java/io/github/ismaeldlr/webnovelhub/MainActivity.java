package io.github.ismaeldlr.webnovelhub;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShellPlugin.class);
        registerPlugin(RenderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
