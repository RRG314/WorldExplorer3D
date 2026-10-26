package io.worldexplorer3d.app;

import android.content.Context;
import android.os.Looper;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.appcheck.FirebaseAppCheck;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;

/** SDK sessions and attestation. All waits run on the account owner's bounded
 * worker, never the main thread. No credential is logged or copied into a URL. */
final class PortalFirebase {
    final FirebaseApp app;
    final FirebaseAuth auth;
    final FirebaseAppCheck check;
    private volatile HttpURLConnection connection;
    PortalFirebase(Context context,String name){
        FirebaseOptions options=new FirebaseOptions.Builder().setApplicationId(context.getString(R.string.portal_firebase_app_id))
            .setApiKey(context.getString(R.string.portal_firebase_api_key)).setProjectId(context.getString(R.string.portal_firebase_project))
            .setGcmSenderId(context.getString(R.string.portal_firebase_sender)).build();
        FirebaseApp existing=null;for(FirebaseApp value:FirebaseApp.getApps(context))if(name.equals(value.getName()))existing=value;
        app=existing==null?FirebaseApp.initializeApp(context,options,name):existing;check=FirebaseAppCheck.getInstance(app);
        PortalAttestation.install(check);
        check.setTokenAutoRefreshEnabled(false);
        auth=FirebaseAuth.getInstance(app);
    }
    static void workerOnly(){if(Looper.getMainLooper().isCurrentThread())throw new IllegalStateException("Native account work cannot block the screen.");}
    void cancelNetwork(){HttpURLConnection active=connection;if(active!=null)active.disconnect();}
    JSONObject request(String endpoint,JSONObject body,String expectedUid,BooleanSupplier current)throws Exception{
        workerOnly();String attestation=Tasks.await(check.getAppCheckToken(false)).getToken();FirebaseUser user=auth.getCurrentUser();String token=null;
        if(expectedUid!=null){if(user==null||!expectedUid.equals(user.getUid()))throw new IllegalStateException("Explorer account changed. Reconnect this device.");token=Tasks.await(user.getIdToken(false)).getToken();}
        if(!current.getAsBoolean())throw new InterruptedException("Device connection changed.");
        HttpURLConnection http=(HttpURLConnection)new URL(BuildConfig.PORTAL_API_ORIGIN+"/"+endpoint).openConnection();connection=http;
        try{
            http.setInstanceFollowRedirects(false);http.setConnectTimeout(6000);http.setReadTimeout(10000);http.setRequestMethod("POST");http.setDoOutput(true);
            http.setRequestProperty("Content-Type","application/json");http.setRequestProperty("Accept","application/json");http.setRequestProperty("X-Firebase-AppCheck",attestation);
            if(token!=null)http.setRequestProperty("Authorization","Bearer "+token);
            // Firebase API-key Android restrictions require the actual package
            // certificate; the SDK supplies those headers to its own endpoints.
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);http.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=http.getOutputStream()){out.write(bytes);}
            int status=http.getResponseCode();if(status!=200)throw new IllegalStateException(status==401||status==403?"The device could not verify its account. Reconnect when online.":status==409?"This connection or investigation changed. Reopen it and try again.":status==410?"This device connection expired. Start again.":"Sync is unavailable. Your choices are kept on this device.");
            JSONObject result=new JSONObject(PortalStore.readBounded(http.getInputStream(),262144));if(!current.getAsBoolean())throw new InterruptedException("Device connection changed.");return result;
        }finally{http.disconnect();if(connection==http)connection=null;}
    }
    void deleteCandidate(){auth.signOut();app.delete();}
}
