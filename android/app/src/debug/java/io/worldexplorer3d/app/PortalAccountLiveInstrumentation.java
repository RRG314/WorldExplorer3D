package io.worldexplorer3d.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** Real native SDK + staging services. The browser approval HTTP role and device
 * attestation source are controlled; this is not Google OAuth or Play Integrity. */
public final class PortalAccountLiveInstrumentation extends Instrumentation {
    private Bundle arguments;
    @Override public void onCreate(Bundle args){arguments=args;start();}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private static void until(BooleanSupplier condition,String message)throws Exception{long deadline=System.currentTimeMillis()+90000;while(!condition.getAsBoolean()){if(System.currentTimeMillis()>deadline)throw new AssertionError(message);Thread.sleep(100);}}
    private void freshBrowserIdentity(JSONObject fixture)throws Exception{
        check(fixture.getString("browserEmail").matches("qa-native-[a-f0-9-]+@example\\.invalid"),"Use only the disposable verification account.");
        HttpURLConnection connection=(HttpURLConnection)new URL("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key="+Uri.encode(fixture.getString("browserApiKey"))).openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(6000);connection.setReadTimeout(15000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
            byte[] bytes=new JSONObject().put("email",fixture.getString("browserEmail")).put("password",fixture.getString("browserPassword")).put("returnSecureToken",true).toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            check(connection.getResponseCode()==200,"The disposable browser account could not sign in.");
            JSONObject signed=new JSONObject(PortalStore.readBounded(connection.getInputStream(),16384));check(signed.getString("localId").equals(fixture.getString("uid")),"The disposable browser identity changed.");fixture.put("webIdentity",signed.getString("idToken"));
        }finally{connection.disconnect();}
    }
    private JSONObject approve(String name,JSONObject body,JSONObject fixture)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(BuildConfig.PORTAL_API_ORIGIN+"/"+name).openConnection();
        try{
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(6000);connection.setReadTimeout(15000);connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("X-Firebase-AppCheck",fixture.getString("webCheck"));connection.setRequestProperty("Authorization","Bearer "+fixture.getString("webIdentity"));
            byte[] bytes=body.put("expectedOwnerUid",fixture.getString("uid")).toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            check(connection.getResponseCode()==200,"The controlled browser approval API failed: "+name);return new JSONObject(PortalStore.readBounded(connection.getInputStream(),262144));
        }finally{connection.disconnect();}
    }
    @Override public void onStart(){
        Bundle result=new Bundle();int outcome=Activity.RESULT_CANCELED;PortalAccount account=null;String owner=null;
        try{
            Context context=getTargetContext();check(arguments!=null&&"true".equals(arguments.getString("ownedEmulator"))&&(Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish")),"Use a fresh owned emulator.");
            check(context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE).getAll().isEmpty(),"Refusing to replace an existing native Trail.");
            JSONObject fixture=new JSONObject(PortalStore.readBounded(context.openFileInput("native-acceptance.json"),16384));
            check(fixture.getString("appId").equals(context.getString(R.string.portal_firebase_app_id))&&fixture.getString("project").equals("we3d-staging-20260712"),"Wrong native verification client.");
            PortalAttestation.prepare(fixture.getString("nativeCheck"),fixture.getLong("expiresAt"));
            PortalStore store=new PortalStore(context);account=PortalAccount.get(context);CountDownLatch opened=new CountDownLatch(1);Runnable observer=opened::countDown;account.observe(observer);
            check(opened.await(20,TimeUnit.SECONDS),"Native SDK bootstrap did not finish.");account.unobserve(observer);
            account.start();final PortalAccount current=account;
            until(()->current.approval()!=null,"Native connection did not reach approval.");Uri approval=account.approval();String requestId=approval.getQueryParameter("connect");
            freshBrowserIdentity(fixture);
            JSONObject metadata=approve("inspectPortalPairing",new JSONObject().put("requestId",requestId),fixture);
            check(metadata.getString("verificationCode").equals(account.code()),"Displayed native/browser codes differ.");
            byte[] random=new byte[32];new SecureRandom().nextBytes(random);String code=Base64.encodeToString(random,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
            String hash=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.US_ASCII)),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
            JSONObject approved=approve("approvePortalPairing",new JSONObject().put("requestId",requestId).put("approvalId",java.util.UUID.randomUUID().toString()).put("codeHash",hash),fixture);
            check(approved.getString("callback").equals(BuildConfig.APPLICATION_ID+"://portal-connect"),"Unexpected native return address.");
            // Resolve and dispatch the real manifest callback through Android.
            Uri callback=Uri.parse(approved.getString("callback")).buildUpon().appendQueryParameter("requestId",requestId).appendQueryParameter("code",code).build();
            Intent intent=new Intent(Intent.ACTION_VIEW,callback).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).setPackage(context.getPackageName());
            check(intent.resolveActivity(context.getPackageManager())!=null,"The native OS callback is not registered.");context.startActivity(intent);
            owner="account:"+fixture.getString("uid");final String expected=owner;
            until(()->expected.equals(store.owner())&&current.status().equals("synced"),"Approved identity did not adopt and synchronize through the native SDK.");
            until(()->FirebaseApp.getApps(context).stream().noneMatch(app->app.getName().equals("portal-candidate")),"Temporary SDK session did not retire.");
            PortalFirebase primary=new PortalFirebase(context,"portal-native");check(primary.auth.getCurrentUser()!=null&&primary.auth.getCurrentUser().getUid().equals(fixture.getString("uid")),"Primary native identity changed.");
            check(Tasks.await(primary.auth.getCurrentUser().getIdToken(true),30,TimeUnit.SECONDS).getToken()!=null,"The primary SDK could not refresh after candidate teardown.");
            store.act("baltimore-harbor","save",owner);CountDownLatch synced=new CountDownLatch(1);account.sync(()->true,synced::countDown);check(synced.await(60,TimeUnit.SECONDS)&&account.status().equals("synced"),"Native saved choice did not sync.");
            JSONObject listed=approve("listPortalTrail",new JSONObject().put("after",JSONObject.NULL).put("limit",100),fixture);
            check(listed.getString("ownerScope").equals(owner)&&listed.getJSONArray("items").length()==1&&listed.getJSONArray("items").getJSONObject(0).getBoolean("saved")&&listed.getJSONArray("items").getJSONObject(0).getLong("visitedAt")==0,"Native save did not reach the browser account Trail or falsely granted a visit.");
            result.putString("passed","true");result.putString("scope","Real Android OS callback, native Firebase candidate/primary adoption, candidate teardown, forced SDK token refresh and live staging Trail save/read. Controlled browser HTTP approval and temporary Google-signed debug attestation; not Google OAuth, physical Play Integrity or a production phone.");outcome=Activity.RESULT_OK;
        }catch(Throwable error){result.putString("passed","false");result.putString("failure",error.getClass().getSimpleName()+": "+error.getMessage());}
        finally{if(account!=null&&owner!=null)account.disconnect(owner);getTargetContext().deleteFile("native-acceptance.json");}
        finish(outcome,result);
    }
}
