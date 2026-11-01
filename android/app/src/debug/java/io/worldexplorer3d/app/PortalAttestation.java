package io.worldexplorer3d.app;

import android.os.Build;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.appcheck.AppCheckToken;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

/** Debug-only provider boundary. The optional token is Google-signed for the
 * separate staging client; server attestation checks are never bypassed. */
final class PortalAttestation {
    private static AppCheckToken temporary;
    static void prepare(String token,long expiresAt) {
        if(!BuildConfig.DEBUG||!BuildConfig.APPLICATION_ID.equals("io.worldexplorer3d.app.staging")||
           !(Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish"))||expiresAt<System.currentTimeMillis()+120000)throw new IllegalStateException("Use a fresh owned staging emulator with unexpired attestation.");
        temporary=new AppCheckToken(){public String getToken(){return token;}public long getExpireTimeMillis(){return expiresAt;}};
    }
    static void install(FirebaseAppCheck check) {
        if(temporary==null)check.installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance());
        else check.installAppCheckProviderFactory(app->()->temporary.getExpireTimeMillis()>System.currentTimeMillis()
            ?Tasks.forResult(temporary):Tasks.forException(new IllegalStateException("Temporary verification attestation expired.")));
    }
}
