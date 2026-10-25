package io.worldexplorer3d.app;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseUser;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;

/** One native account command owner. Local Trail choices remain usable offline;
 * Firebase owns identity/refresh credentials. No widget-owned auth session. */
final class PortalAccount {
    private static PortalAccount instance;
    static synchronized PortalAccount get(Context context){if(instance==null)instance=new PortalAccount(context.getApplicationContext());return instance;}
    private final Context context;
    private final PortalStore store;
    private final PortalPrivateState proof;
    private final ExecutorService commands=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private final CopyOnWriteArraySet<Runnable> observers=new CopyOnWriteArraySet<>();
    private volatile long generation;
    private volatile JSONObject pending;
    private volatile String status="",message="";
    private volatile PortalFirebase firebase;
    private boolean opened;
    private PortalAccount(Context context){this.context=context;store=new PortalStore(context);proof=new PortalPrivateState(context);}
    void observe(Runnable listener){observers.add(listener);commands.execute(()->{try{open();publish();}catch(Exception error){fail(error);}});}
    void unobserve(Runnable listener){observers.remove(listener);}
    private void publish(){main.post(()->{for(Runnable listener:observers)listener.run();});}
    private void fail(Exception error){status="pending";message=error instanceof InterruptedException?"Device connection cancelled.":error instanceof IllegalStateException?error.getMessage():"Connection is unavailable. Your choices are kept on this device.";publish();}
    String status(){return status;}
    String message(){return message;}
    String code(){JSONObject row=pending;return row!=null&&row.optLong("expiresAt")>System.currentTimeMillis()?row.optString("verificationCode"):"";}
    Uri approval(){JSONObject row=pending;return row!=null&&row.optLong("expiresAt")>System.currentTimeMillis()?Uri.parse(PortalStore.ORIGIN+"/portal/?connect="+Uri.encode(row.optString("requestId"))):null;}
    String accountLabel(){PortalFirebase sdk=firebase;FirebaseUser user=sdk==null?null:sdk.auth.getCurrentUser();return user!=null&&store.owner().equals("account:"+user.getUid())?(user.getEmail()==null?"Explorer account":user.getEmail()):"";}
    private void open()throws Exception{
        if(opened)return;PortalFirebase.workerOnly();firebase=new PortalFirebase(context,"portal-native");
        FirebaseUser user=firebase.auth.getCurrentUser();String expected=user==null?"device-guest":"account:"+user.getUid();
        if(store.accountCommitPending()||!expected.equals(store.owner())){
            firebase.auth.signOut();store.adoptOwner(null);message="Reconnect your Explorer account. Your private Trail caches are kept.";
        }
        // A candidate never becomes the active identity merely because its SDK
        // task persisted before a process death. Only explicit adoption commits.
        PortalFirebase candidate=new PortalFirebase(context,"portal-candidate");candidate.deleteCandidate();
        try{JSONObject row=proof.read();if(row!=null&&row.optLong("expiresAt")>System.currentTimeMillis()&&validId(row.optString("requestId"))&&validId(row.optString("verifier")))pending=row;else proof.clear();}
        catch(Exception invalid){proof.clear();message="Start a new device connection.";}
        opened=true;status=store.owner().equals("device-guest")?"device":"pending";
    }
    private boolean current(long version){return generation==version;}
    static boolean validId(String value){return value!=null&&value.matches("[A-Za-z0-9_-]{43}");}
    private static String random(){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);return Base64.encodeToString(bytes,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    void start(){
        final long version;synchronized(PortalStore.LOCK){version=++generation;}cancelNetwork();
        commands.execute(()->{JSONObject created=null;try{
            open();if(!current(version))return;JSONObject old=pending;pending=null;proof.clear();if(old!=null)cancelRemote(old);
            if(!current(version))return;status="connecting";message="Preparing your secure device connection…";publish();
            String verifier=random(),challenge=Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);
            JSONObject response=firebase.request("startPortalPairing",new JSONObject().put("challenge",challenge),null,()->current(version));
            if(!validId(response.optString("requestId"))||!response.optString("verificationCode").matches("[0-9]{8}")||response.optLong("expiresAt")<=System.currentTimeMillis()||response.optLong("expiresAt")>System.currentTimeMillis()+11*60000)throw new IllegalStateException("Invalid device connection response.");
            created=new JSONObject().put("requestId",response.getString("requestId")).put("verifier",verifier).put("verificationCode",response.getString("verificationCode")).put("expiresAt",response.getLong("expiresAt"));
            synchronized(PortalStore.LOCK){if(current(version)){proof.write(created);pending=created;status="approval";message="Open the browser, sign in and check that the code matches.";publish();return;}}
            cancelRemote(created);
        }catch(Exception error){if(current(version))fail(error);if(created!=null)cancelRemote(created);}});
    }
    private void cancelNetwork(){PortalFirebase sdk=firebase;if(sdk!=null)sdk.cancelNetwork();}
    private void cancelRemote(JSONObject row){try{firebase.request("cancelPortalPairing",new JSONObject().put("requestId",row.getString("requestId")).put("verifier",row.getString("verifier")),null,()->true);}catch(Exception ignored){/* Short-lived proof is already retired locally; server approval expires. */}}
    void cancel(){
        final JSONObject old;synchronized(PortalStore.LOCK){generation++;old=pending;pending=null;proof.clear();status="device";message="Device connection cancelled.";}cancelNetwork();publish();
        commands.execute(()->{if(old!=null&&firebase!=null)cancelRemote(old);});
    }
    void disconnect(){
        cancel();synchronized(PortalStore.LOCK){store.adoptOwner(null);}PortalWidgetProvider.updateAll(context);
        commands.execute(()->{try{open();firebase.auth.signOut();store.adoptOwner(null);status="device";message="Disconnected on this device. Your account Trail is kept.";publish();}catch(Exception error){fail(error);}});
    }
    static String[] callback(Uri uri){
        if(uri==null||!"io.worldexplorer3d.app".equals(uri.getScheme())||!"portal-connect".equals(uri.getHost())||uri.getUserInfo()!=null||uri.getPort()!=-1||uri.getFragment()!=null||uri.getPath()!=null&&!uri.getPath().isEmpty()||uri.getQueryParameterNames().size()!=2)return null;
        if(uri.getQueryParameters("requestId").size()!=1||uri.getQueryParameters("code").size()!=1)return null;
        String request=uri.getQueryParameter("requestId"),code=uri.getQueryParameter("code");return validId(request)&&validId(code)?new String[]{request,code}:null;
    }
    void receive(Uri uri){
        final String[] fields=callback(uri);if(fields==null){message="This device connection link is invalid.";publish();return;}
        final long version=generation;commands.execute(()->{PortalFirebase candidate=null;try{
            open();JSONObject row=pending;if(!current(version)||row==null||!fields[0].equals(row.getString("requestId"))||row.getLong("expiresAt")<=System.currentTimeMillis())throw new IllegalStateException("This connection expired or belongs to another device. Start again.");
            status="connecting";message="Connecting your Explorer account…";publish();
            JSONObject response=firebase.request("claimPortalPairing",new JSONObject().put("requestId",fields[0]).put("code",fields[1]).put("verifier",row.getString("verifier")),null,()->current(version));
            String uid=response.getString("ownerUid");if(!PortalTrail.ownerValid("account:"+uid))throw new IllegalStateException("Invalid Explorer account response.");
            candidate=new PortalFirebase(context,"portal-candidate");FirebaseUser user=Tasks.await(candidate.auth.signInWithCustomToken(response.getString("customToken"))).getUser();
            if(!current(version))return;
            boolean adopted=new PortalAccountCommit<FirebaseUser>().run(user,uid,()->current(version),PortalStore.LOCK,new PortalAccountCommit.Port<FirebaseUser>(){
                public FirebaseUser current(){return firebase.auth.getCurrentUser();}
                public String uid(FirebaseUser value){return value==null?null:value.getUid();}
                public void mark(){store.beginAccountCommit();}
                public void adopt(FirebaseUser value)throws Exception{Tasks.await(firebase.auth.updateCurrentUser(value));}
                public void restore(FirebaseUser previous)throws Exception{if(previous==null)firebase.auth.signOut();else Tasks.await(firebase.auth.updateCurrentUser(previous));synchronized(PortalStore.LOCK){if(PortalAccount.this.current(version))store.adoptOwner(previous==null?null:previous.getUid());else store.finishAccountRollback();}}
                public void persist(String value){proof.clear();pending=null;store.adoptOwner(value);}
                public void abandon(){firebase.auth.signOut();store.adoptOwner(null);}
            });
            if(adopted){status="pending";message="Explorer account connected. Device choices stay separate until you choose to copy them.";publish();PortalWidgetProvider.updateAll(context);syncNow(()->current(version));}
        }catch(Exception error){if(current(version))fail(error);}finally{if(candidate!=null)candidate.deleteCandidate();}});
    }
    void sync(BooleanSupplier allowed){sync(allowed,()->{});}
    void sync(BooleanSupplier allowed,Runnable complete){final long version=generation;commands.execute(()->{try{open();syncNow(()->current(version)&&allowed.getAsBoolean());}catch(Exception error){if(current(version)&&allowed.getAsBoolean())fail(error);}finally{complete.run();}});}
    void copyDeviceChoices(){final long version=generation;final String owner=store.owner();commands.execute(()->{try{open();synchronized(PortalStore.LOCK){if(!current(version)||!owner.equals(store.owner()))return;store.copyGuestChoices(owner);}PortalWidgetProvider.updateAll(context);syncNow(()->current(version));}catch(Exception error){if(current(version))fail(error);}});}
    private void syncNow(BooleanSupplier allowed)throws Exception{
        String owner=store.owner();if(owner.equals("device-guest")||store.accountCommitPending()||!allowed.getAsBoolean())return;
        String uid=owner.substring(8);BooleanSupplier active=()->allowed.getAsBoolean()&&owner.equals(store.owner())&&!store.accountCommitPending();
        status="syncing";message="Syncing your Exploration Trail…";publish();
        for(JSONObject entry:store.entries(owner))for(JSONObject action:PortalTrail.pending(entry)){
            if(!active.getAsBoolean())return;JSONObject response=firebase.request("mutatePortalTrail",new JSONObject().put("expectedOwnerUid",uid).put("action",action),uid,active);
            if(!store.accept(response,owner,active))return;
        }
        String after=null;HashSet<String> cursors=new HashSet<>();int count=0;
        do{
            if(!active.getAsBoolean())return;JSONObject response=firebase.request("listPortalTrail",new JSONObject().put("expectedOwnerUid",uid).put("after",after==null?JSONObject.NULL:after).put("limit",100),uid,active);
            if(!owner.equals(response.getString("ownerScope")))throw new IllegalStateException("Trail synchronization changed account.");
            JSONArray rows=response.getJSONArray("items");if(rows.length()>100||(count+=rows.length())>10000)throw new IllegalStateException("Trail synchronization exceeded its page limit.");
            for(int i=0;i<rows.length();i++)if(!store.accept(new JSONObject().put("ownerScope",owner).put("state",rows.getJSONObject(i)).put("operationId",JSONObject.NULL),owner,active))return;
            after=response.isNull("nextCursor")?null:response.getString("nextCursor");
            if(after!=null&&(!PortalTrail.identifier(after)||!cursors.add(after)||rows.length()==0))throw new IllegalStateException("Invalid Trail page cursor.");
        }while(after!=null);
        if(active.getAsBoolean()){store.markSynced(owner,active);status="synced";message="Your Trail is synced.";publish();PortalWidgetProvider.updateAll(context);}
    }
}
