package io.worldexplorer3d.app;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Cross-language fixtures and adversarial SDK adoption, without live accounts
 * or network. Actual Firebase exchange is a separate service/device check. */
final class PortalAccountContracts {
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private static boolean equal(Object a,Object b)throws Exception{
        if(a instanceof JSONObject&&b instanceof JSONObject){JSONObject x=(JSONObject)a,y=(JSONObject)b;if(x.length()!=y.length())return false;for(java.util.Iterator<String> it=x.keys();it.hasNext();){String key=it.next();if(!y.has(key)||!equal(x.get(key),y.get(key)))return false;}return true;}
        if(a instanceof JSONArray&&b instanceof JSONArray){JSONArray x=(JSONArray)a,y=(JSONArray)b;if(x.length()!=y.length())return false;for(int i=0;i<x.length();i++)if(!equal(x.get(i),y.get(i)))return false;return true;}
        if(a instanceof Number&&b instanceof Number)return ((Number)a).doubleValue()==((Number)b).doubleValue();return a.equals(b);
    }
    static int run(Context context)throws Exception{
        int count=0;JSONArray fixtures=new JSONObject(PortalStore.readBounded(context.getAssets().open("portal-trail-contracts.json"),65536)).getJSONArray("scenarios");
        for(int i=0;i<fixtures.length();i++){
            JSONObject row=fixtures.getJSONObject(i),before=row.getJSONObject("before");
            JSONObject nativeEntry=PortalTrail.read(before,before.getString("ownerScope"),before.getString("destinationId"));
            nativeEntry=row.getString("kind").equals("queue")?PortalTrail.queue(nativeEntry,row.getJSONObject("command")):PortalTrail.accept(nativeEntry,row.getJSONObject("response"),before.getString("ownerScope"));
            check(equal(nativeEntry,row.getJSONObject("expected"))&&equal(PortalTrail.view(nativeEntry),row.getJSONObject("view")),"Native Trail diverged from shared wire fixture "+i);count++;
        }
        JSONObject guest=PortalTrail.empty("monaco-coast").put("firstOfferedAt",100).put("lastOfferedAt",500).put("saved",true).put("savedAt",200).put("investigatedAt",300).put("investigationVersion","learning-v1").put("visitedAt",400).put("pending",new JSONObject());
        context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE).edit().putString("trail:device-guest|monaco-coast",guest.toString()).commit();
        PortalStore store=new PortalStore(context);check(store.trail("monaco-coast").getLong("visitedAt")==400,"Flat guest migration lost an existing visit.");store.act("monaco-coast","unsave");
        check(store.entry("device-guest","monaco-coast").getString("type").equals("PortalTrailEntry")&&store.trail("monaco-coast").getLong("visitedAt")==400,"Atomic migration discarded guest history.");count++;
        String owner="account:native-fixture";store.adoptOwner("native-fixture");store.act("baltimore-harbor","save");JSONObject sent=PortalTrail.pending(store.entry(owner,"baltimore-harbor")).get(0);store.act("baltimore-harbor","unsave");
        JSONObject response=new JSONObject().put("ownerScope",owner).put("operationId",sent.getString("operationId")).put("state",PortalTrail.empty("baltimore-harbor").put("revision",2).put("firstOfferedAt",100).put("lastOfferedAt",200).put("savedAt",200).put("saved",true).put("visitedAt",150));
        check(store.accept(response,owner,()->true)&&!store.trail("baltimore-harbor").getBoolean("saved")&&store.trail("baltimore-harbor").getLong("visitedAt")==150,"Delayed acknowledgement lost a newer choice or remote visit.");
        check(!store.markSynced(owner,()->true)&&store.syncedAt()==0,"A newer pending choice was reported fully synced.");
        store.adoptOwner("different-native-fixture");check(!store.accept(response,owner,()->true),"Replaced account accepted a stale sync.");store.adoptOwner(null);count++;
        store.act("monaco-coast","save");store.act("monaco-coast","investigate");store.adoptOwner("copied-native-fixture");store.copyGuestChoices(store.owner());
        JSONObject copied=store.trail("monaco-coast");check(copied.getBoolean("saved")&&copied.getLong("investigatedAt")>0&&copied.getLong("visitedAt")==0&&copied.getJSONArray("expeditionIds").length()==0,"Explicit device copy granted a game visit or lost interest.");
        check(store.trail("device-guest","monaco-coast").getLong("visitedAt")==400,"Copy moved or removed device history.");store.adoptOwner(null);count++;
        boolean staleDenied=false;try{store.act("baltimore-harbor","investigate","device-guest","old-learning-version");}catch(Exception expected){staleDenied=true;}
        check(staleDenied&&store.trail("baltimore-harbor").getLong("investigatedAt")==0,"Replaced learning content was marked read from an old screen.");count++;
        // Exercise Android's real PendingIntent identity/cache rather than a
        // model of intent extras. These owned invalid widget IDs cannot send
        // a mutation; every created handle is explicitly retired below.
        int commandWidget=-60252;store.adoptOwner("first-command-fixture");android.app.PendingIntent first=PortalWidgetProvider.action(context,commandWidget,"save","baltimore-harbor");
        store.adoptOwner("second-command-fixture");android.app.PendingIntent second=PortalWidgetProvider.action(context,commandWidget,"save","baltimore-harbor");
        try{check(!first.equals(second),"A displayed widget command was rebound to a different Explorer account.");}finally{first.cancel();second.cancel();}count++;
        store.showFact(commandWidget,"baltimore-harbor",0);first=PortalWidgetProvider.action(context,commandWidget,"next","baltimore-harbor");
        store.showFact(commandWidget,"baltimore-harbor",1);second=PortalWidgetProvider.action(context,commandWidget,"next","baltimore-harbor");
        try{check(!first.equals(second),"An old fact button was rebound to a later investigation page.");}finally{first.cancel();second.cancel();store.removeWidget(commandWidget);store.adoptOwner(null);}count++;
        boolean denied=false;try{PortalTrail.queue(PortalTrail.entry(owner,"baltimore-harbor"),new JSONObject().put("operationId","visit-forged").put("destinationId","baltimore-harbor").put("kind","visit").put("createdAt",100));}catch(Exception expected){denied=true;}check(denied,"Native widget acquired a visit writer.");count++;
        String proof="A".repeat(43);check(PortalAccount.callback(Uri.parse(BuildConfig.APPLICATION_ID+"://portal-connect?requestId="+proof+"&code="+proof))!=null,"Valid native callback rejected.");
        for(String bad:new String[]{"https://portal-connect?requestId="+proof+"&code="+proof,BuildConfig.APPLICATION_ID+"://portal-connect/else?requestId="+proof+"&code="+proof,BuildConfig.APPLICATION_ID+"://portal-connect?requestId="+proof+"&code="+proof+"&code="+proof,BuildConfig.APPLICATION_ID+"://portal-connect?requestId="+proof+"&code="+proof+"#fragment"})check(PortalAccount.callback(Uri.parse(bad))==null,"Native callback accepted a mixed command.");count++;
        PortalPrivateState privateState=new PortalPrivateState(context);JSONObject privateProof=new JSONObject().put("requestId",proof).put("verifier",proof);privateState.write(privateProof);check(equal(privateState.read(),privateProof),"Keystore proof did not survive re-open.");
        check(!context.getSharedPreferences("portal-connection-private",Context.MODE_PRIVATE).getString("pending","").contains(proof),"Native verifier stored in clear text.");privateState.clear();check(privateState.read()==null,"Cancelled native verifier remained available.");count++;
        AtomicReference<String> sdk=new AtomicReference<>("old"),persisted=new AtomicReference<>("old");AtomicBoolean active=new AtomicBoolean(true),marked=new AtomicBoolean(false),restored=new AtomicBoolean(false);CountDownLatch adopting=new CountDownLatch(1),release=new CountDownLatch(1);AtomicReference<Throwable> failure=new AtomicReference<>();
        PortalAccountCommit.Port<String> port=new PortalAccountCommit.Port<String>(){
            public String current(){return sdk.get();}public String uid(String value){return value;}public void mark(){marked.set(true);}
            public void adopt(String value)throws Exception{adopting.countDown();release.await();sdk.set(value);}
            public void restore(String previous){sdk.set(previous);restored.set(true);marked.set(false);}public void persist(String uid){persisted.set(uid);marked.set(false);}public void abandon(){sdk.set(null);}
        };
        Thread worker=new Thread(()->{try{check(!new PortalAccountCommit<String>().run("new","new",active::get,new Object(),port),"Cancelled adoption committed.");}catch(Throwable error){failure.set(error);}});worker.start();
        check(adopting.await(5,java.util.concurrent.TimeUnit.SECONDS),"SDK adoption did not start.");active.set(false);release.countDown();worker.join(5000);check(!worker.isAlive()&&failure.get()==null&&restored.get()&&sdk.get().equals("old")&&persisted.get().equals("old")&&!marked.get(),"Late SDK adoption escaped rollback.");count++;
        active.set(true);check(new PortalAccountCommit<String>().run("new","new",active::get,new Object(),port)&&sdk.get().equals("new")&&persisted.get().equals("new"),"Verified account adoption did not commit.");count++;
        denied=false;try{new PortalAccountCommit<String>().run("wrong","expected",()->true,new Object(),port);}catch(Exception expected){denied=true;}check(denied&&sdk.get().equals("new"),"Mismatched approval replaced the account.");count++;
        check(!new PortalAccountCommit<String>().run("other","other",()->false,new Object(),port)&&sdk.get().equals("new")&&!marked.get(),"Already cancelled admission reached the SDK.");count++;
        // Restore the fresh-owned test's guest fixture before UI interaction.
        context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE).edit().clear().commit();
        store.act("monaco-coast","save");store.beginAccountCommit();CountDownLatch recovered=new CountDownLatch(1);PortalAccount account=PortalAccount.get(context);Runnable observer=recovered::countDown;account.observe(observer);
        check(recovered.await(10,java.util.concurrent.TimeUnit.SECONDS),"Native SDK recovery did not finish.");account.unobserve(observer);
        check(!store.accountCommitPending()&&store.owner().equals("device-guest")&&store.trail("monaco-coast").getBoolean("saved"),"Interrupted SDK adoption lost the guest Trail or remained active.");count++;
        PortalFirebase firebaseSdk=new PortalFirebase(context,"portal-native");check(firebaseSdk.app.getOptions().getApplicationId().split(":")[1].equals(firebaseSdk.app.getOptions().getGcmSenderId()),"Play Integrity's required project number is missing or belongs to a different Firebase app.");count++;
        context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE).edit().clear().commit();return count;
    }
}
