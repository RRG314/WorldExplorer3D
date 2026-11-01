package io.worldexplorer3d.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Callback proof is consumed by the application owner, never the widget or
 * game URL. Finish immediately so the ordinary native Trail owns the screen. */
public final class PortalConnectionActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);PortalAccount.get(this).receive(getIntent().getData());
        startActivity(new Intent(this,PortalActivity.class).putExtra("section","account"));finish();}
}
