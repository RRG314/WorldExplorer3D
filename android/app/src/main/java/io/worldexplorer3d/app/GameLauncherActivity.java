package io.worldexplorer3d.app;

import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.content.Intent;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Browser ownership stays in ABH. Only a first-launch connectivity fallback is native. */
public final class GameLauncherActivity extends LauncherActivity {
    private Uri playUrl(Uri original) {
        if (original == null || !"https".equalsIgnoreCase(original.getScheme()) ||
                !"worldexplorer3d.io".equalsIgnoreCase(original.getHost())) return original;
        Uri.Builder builder = original.buildUpon().clearQuery();
        for (String name : original.getQueryParameterNames()) {
            if ("distribution".equals(name)) continue;
            for (String value : original.getQueryParameters(name)) builder.appendQueryParameter(name, value);
        }
        return builder.appendQueryParameter("distribution", "google-play").build();
    }

    @Override protected Uri getUrlForIntent(Intent intent) {
        // Keep ABH's origin validation and original-launch handling in charge.
        return playUrl(super.getUrlForIntent(intent));
    }

    @Override protected Uri getLaunchingUrl() {
        return playUrl(super.getLaunchingUrl());
    }

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
