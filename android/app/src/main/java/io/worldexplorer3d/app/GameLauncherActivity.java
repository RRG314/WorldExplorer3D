package io.worldexplorer3d.app;

import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Browser ownership stays in ABH. Only a first-launch connectivity fallback is native. */
public final class GameLauncherActivity extends LauncherActivity {
    @Override protected boolean shouldLaunchImmediately() { return false; }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (!isFinishing()) openWhenConnected();
    }

    private void openWhenConnected() {
        ConnectivityManager manager = getSystemService(ConnectivityManager.class);
        NetworkCapabilities network = manager == null ? null : manager.getNetworkCapabilities(manager.getActiveNetwork());
        if (network != null && network.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            launchTwa();
            return;
        }
        setContentView(R.layout.offline);
        findViewById(R.id.retry_connection).setOnClickListener(view -> openWhenConnected());
    }
}
