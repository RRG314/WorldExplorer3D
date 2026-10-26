package io.worldexplorer3d.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.BooleanSupplier;

/** Native projection of the shared catalog/Trail wire contract. No game engine,
 * location tracking, socket, reward authority or alternate Explorer identity. */
final class PortalStore {
    static final String ORIGIN="https://worldexplorer3d.io";
    static final Object LOCK=new Object();
    private final Context context;
    private final SharedPreferences prefs;
    private volatile HttpURLConnection activeConnection;
    PortalStore(Context context){this.context=context.getApplicationContext();prefs=this.context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE);}
    static String readBounded(InputStream stream,int limit)throws Exception{
        try(InputStream input=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1){if(out.size()+count>limit)throw new IllegalStateException("Portal data is too large.");out.write(buffer,0,count);}
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
    private static boolean identifier(String value){return value!=null&&value.matches("[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}");}
    static JSONObject validateCatalog(String source)throws JSONException{
        JSONObject catalog=new JSONObject(source);JSONArray rows=catalog.getJSONArray("destinations");
        if(catalog.getInt("schemaVersion")!=1||rows.length()<1||rows.length()>32||!identifier(catalog.getString("version")))throw new JSONException("Unsupported Portal catalog.");
        List<String> ids=new ArrayList<>();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i),learning=row.getJSONObject("learning"),d=row.getJSONObject("destination");String id=row.getString("id");
            if(!identifier(id)||ids.contains(id)||!id.equals(d.getString("id"))||!identifier(d.getString("revision"))||!identifier(learning.getString("version")))throw new JSONException("Invalid Portal identity.");
            ids.add(id);bounded(row.getString("title"),180);bounded(row.getString("summary"),800);bounded(row.getString("region"),180);
            JSONObject origin=d.getJSONObject("origin");double lat=origin.getDouble("lat"),lon=origin.getDouble("lon");
            if(!Double.isFinite(lat)||Math.abs(lat)>90||!Double.isFinite(lon)||Math.abs(lon)>180)throw new JSONException("Invalid geographic point.");
            JSONArray paragraphs=learning.getJSONArray("paragraphs");if(paragraphs.length()<1||paragraphs.length()>8)throw new JSONException("Invalid investigation.");
            for(int j=0;j<paragraphs.length();j++)bounded(paragraphs.getString(j),2000);
            JSONArray sources=learning.getJSONArray("sources");if(sources.length()<1||sources.length()>8)throw new JSONException("Missing learning sources.");
            for(int j=0;j<sources.length();j++){JSONObject item=sources.getJSONObject(j);bounded(item.getString("title"),240);Uri uri=Uri.parse(item.getString("url"));if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null)throw new JSONException("Invalid learning source.");}
            String expected="/app/?portal="+Uri.encode(id)+"&pr="+Uri.encode(d.getString("revision"));
            if(!expected.equals(row.getString("gameLink")))throw new JSONException("Invalid Portal game intent.");
            JSONArray tags=row.getJSONArray("tags");if(tags.length()<1||tags.length()>16)throw new JSONException("Invalid Portal subjects.");
            for(int j=0;j<tags.length();j++)if(!identifier(tags.getString(j)))throw new JSONException("Invalid Portal subject.");
        }
        catalog.getJSONArray("qualifications");if(catalog.getJSONArray("offers").length()>128)throw new JSONException("Too many Portal offers.");
        bounded(catalog.getString("renderContractVersion"),160);return catalog;
    }
    private static void bounded(String value,int limit)throws JSONException{if(value==null||value.isEmpty()||value.length()>limit)throw new JSONException("Invalid Portal content.");}
    JSONObject catalog(){
        synchronized(LOCK){
            String cached=prefs.getString("catalog",null);if(cached!=null)try{return validateCatalog(cached);}catch(JSONException ignored){}
            try{return validateCatalog(readBounded(context.getAssets().open("portal-catalog.json"),131072));}
            catch(Exception error){throw new IllegalStateException("The bundled Portal could not open.",error);}
        }
    }
    void cancelRefresh(){HttpURLConnection connection=activeConnection;if(connection!=null)connection.disconnect();}
    boolean refresh(BooleanSupplier current){
        // Android's widget update schedule is inexact. Last-good content remains
        // usable offline; failed/redirected/malformed downloads never replace it.
        HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)new URL(ORIGIN+"/portal/catalog.json").openConnection();
            activeConnection=connection;if(!current.getAsBoolean())return false;
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(4000);connection.setReadTimeout(4000);
            connection.setRequestProperty("Accept","application/json");
            if(connection.getResponseCode()!=200)return false;
            String text=readBounded(connection.getInputStream(),131072);validateCatalog(text);
            synchronized(LOCK){return current.getAsBoolean()&&prefs.edit().putString("catalog",text).putLong("catalogLoadedAt",System.currentTimeMillis()).commit();}
        }catch(Exception ignored){return false;}finally{if(connection!=null)connection.disconnect();activeConnection=null;}
    }
    long loadedAt(){return prefs.getLong("catalogLoadedAt",0);}
    String mode(int widgetId){return prefs.getString("mode:"+widgetId,"wander");}
    String home(int widgetId){return prefs.getString("home:"+widgetId,"");}
    void configure(int widgetId,String mode,String home){
        if(!Arrays.asList("wander","home","nature","together","beyond").contains(mode))mode="wander";
        synchronized(LOCK){prefs.edit().putString("mode:"+widgetId,mode).putString("home:"+widgetId,home).remove("learning:"+widgetId).remove("fact:"+widgetId).remove("learningVersion:"+widgetId).commit();}
    }
    void removeWidget(int id){synchronized(LOCK){prefs.edit().remove("mode:"+id).remove("home:"+id).remove("learning:"+id).remove("fact:"+id).remove("learningVersion:"+id).commit();}}
    JSONObject place(String id){JSONArray rows=catalog().optJSONArray("destinations");for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(id.equals(row.optString("id")))return row;}return null;}
    List<JSONObject> destinations(){JSONArray rows=catalog().optJSONArray("destinations");List<JSONObject> result=new ArrayList<>();for(int i=0;i<rows.length();i++)result.add(rows.optJSONObject(i));return result;}
    static List<String> facts(JSONObject place){
        List<String> result=new ArrayList<>();JSONArray paragraphs=place.optJSONObject("learning").optJSONArray("paragraphs");
        for(int i=0;i<paragraphs.length();i++){StringBuilder part=new StringBuilder();for(String word:paragraphs.optString(i).split("\\s+")){
            if(part.length()>0&&part.length()+word.length()+1>160){result.add(part.toString());part.setLength(0);}
            if(part.length()>0)part.append(' ');part.append(word);
        }if(part.length()>0)result.add(part.toString());}return result;
    }
    JSONObject suggestion(int widgetId,long now){
        String mode=mode(widgetId);if(mode.equals("together")||mode.equals("beyond"))return null;
        if(mode.equals("home"))return place(home(widgetId));
        List<JSONObject> rows=new ArrayList<>();for(JSONObject row:destinations())if(!mode.equals("nature")||row.optJSONArray("tags").toString().contains("\"nature\""))rows.add(row);
        return rows.isEmpty()?null:rows.get((int)Math.floorMod(now/86400000L,rows.size()));
    }
    // Identity is assigned only by the native account coordinator. A broadcast,
    // deep link or widget extra never supplies the owner of a mutation.
    String owner(){return prefs.getString("owner","device-guest");}
    private String trailKey(String owner,String id){return "trail:"+Uri.encode(owner)+"|"+id;}
    boolean accountCommitPending(){return prefs.getBoolean("accountCommitPending",false);}
    void beginAccountCommit(){synchronized(LOCK){if(!prefs.edit().putBoolean("accountCommitPending",true).commit())throw new IllegalStateException("The account connection could not be saved.");}}
    void finishAccountRollback(){synchronized(LOCK){if(!prefs.edit().remove("accountCommitPending").commit())throw new IllegalStateException("The previous account could not be restored.");}}
    void adoptOwner(String uid){
        String next=uid==null?"device-guest":"account:"+uid;if(!PortalTrail.ownerValid(next))throw new IllegalArgumentException("Invalid Explorer account.");
        synchronized(LOCK){if(!prefs.edit().putString("owner",next).remove("accountCommitPending").commit())throw new IllegalStateException("The account connection could not be saved.");}
    }
    JSONObject entry(String owner,String id)throws JSONException{
        String value=prefs.getString(trailKey(owner,id),null);return PortalTrail.read(value==null?null:new JSONObject(value),owner,id);
    }
    JSONObject trail(String id){return trail(owner(),id);}
    JSONObject trail(String owner,String id){synchronized(LOCK){try{return PortalTrail.view(entry(owner,id));}catch(JSONException error){throw new IllegalStateException("Your saved Trail could not open.",error);}}}
    List<JSONObject> entries(String owner)throws JSONException{
        synchronized(LOCK){List<JSONObject> rows=new ArrayList<>();String prefix="trail:"+Uri.encode(owner)+"|";
            for(String key:prefs.getAll().keySet())if(key.startsWith(prefix))rows.add(entry(owner,key.substring(prefix.length())));
            rows.sort((a,b)->a.optString("destinationId").compareTo(b.optString("destinationId")));return rows;}
    }
    List<JSONObject> trailEntries(){
        synchronized(LOCK){try{List<JSONObject> rows=new ArrayList<>();for(JSONObject entry:entries(owner()))rows.add(PortalTrail.view(entry));
            rows.sort((a,b)->Long.compare(Math.max(b.optLong("visitedAt"),Math.max(b.optLong("savedAt"),b.optLong("investigatedAt"))),Math.max(a.optLong("visitedAt"),Math.max(a.optLong("savedAt"),a.optLong("investigatedAt")))));return rows;}
            catch(JSONException error){throw new IllegalStateException("Your saved Trail could not open.",error);}}
    }
    void act(String id,String kind)throws JSONException{act(id,kind,owner());}
    void act(String id,String kind,String expectedOwner)throws JSONException{act(id,kind,expectedOwner,null);}
    void act(String id,String kind,String expectedOwner,String expectedLearningVersion)throws JSONException{
        synchronized(LOCK){
            JSONObject place=place(id);if(place==null)throw new JSONException("Invalid widget destination.");PortalTrail.slot(kind);
            String owner=owner();if(!owner.equals(expectedOwner))throw new JSONException("Explorer account changed.");
            if(kind.equals("investigate")&&expectedLearningVersion!=null&&!expectedLearningVersion.equals(place.getJSONObject("learning").getString("version")))throw new JSONException("This investigation changed. Reopen it before marking it complete.");
            long now=System.currentTimeMillis();JSONObject entry=entry(owner,id),state=PortalTrail.view(entry);
            if(kind.equals("offered")&&state.optLong("lastOfferedAt")/86400000L==now/86400000L)return;
            JSONObject action=new JSONObject().put("operationId",UUID.randomUUID().toString()).put("destinationId",id).put("kind",kind).put("createdAt",now);
            if(kind.equals("investigate"))action.put("contentVersion",place.getJSONObject("learning").getString("version"));
            if(!prefs.edit().putString(trailKey(owner,id),PortalTrail.queue(entry,action).toString()).commit())throw new JSONException("Your Trail could not be saved.");
        }
    }
    boolean accept(JSONObject response,String expectedOwner,BooleanSupplier current)throws JSONException{
        synchronized(LOCK){if(!current.getAsBoolean()||!owner().equals(expectedOwner)||accountCommitPending())return false;
            String id=response.getJSONObject("state").getString("destinationId");
            JSONObject next=PortalTrail.accept(entry(expectedOwner,id),response,expectedOwner);
            if(!prefs.edit().putString(trailKey(expectedOwner,id),next.toString()).commit())throw new JSONException("Your Trail could not be saved.");return true;}
    }
    void copyGuestChoices(String expectedOwner)throws JSONException{
        synchronized(LOCK){if(expectedOwner.equals("device-guest")||!owner().equals(expectedOwner))throw new JSONException("Sign in to copy device choices.");
            // Explicit interest copy only. Never turn device visits/expeditions
            // into an account visit or completed activity.
            for(JSONObject guest:entries("device-guest")){JSONObject view=PortalTrail.view(guest);String id=view.getString("destinationId");JSONObject place=place(id);if(place==null)continue;
                if(view.getBoolean("saved"))act(id,"save",expectedOwner);
                if(view.getLong("investigatedAt")>0&&view.optString("investigationVersion").equals(place.getJSONObject("learning").getString("version")))act(id,"investigate",expectedOwner);
            }
        }
    }
    void markSynced(String expectedOwner,BooleanSupplier current){synchronized(LOCK){if(current.getAsBoolean()&&owner().equals(expectedOwner)&&!accountCommitPending())prefs.edit().putLong("synced:"+expectedOwner,System.currentTimeMillis()).commit();}}
    long syncedAt(){return prefs.getLong("synced:"+owner(),0);}
    String learning(int widgetId){return prefs.getString("learning:"+widgetId,"");}
    String learningVersion(int widgetId){return prefs.getString("learningVersion:"+widgetId,"");}
    int fact(int widgetId){return prefs.getInt("fact:"+widgetId,0);}
    void showFact(int widgetId,String id,int fact){synchronized(LOCK){JSONObject place=place(id);if(place!=null)prefs.edit().putString("learning:"+widgetId,id).putInt("fact:"+widgetId,Math.max(0,fact)).putString("learningVersion:"+widgetId,place.optJSONObject("learning").optString("version")).commit();}}
    void closeLearning(int widgetId){synchronized(LOCK){prefs.edit().remove("learning:"+widgetId).remove("fact:"+widgetId).remove("learningVersion:"+widgetId).commit();}}
    boolean gameAvailable(JSONObject place,long now){
        // This is display gating; the game always resolves its own current
        // trusted qualification and actual world/arrival before recording.
        try{
            JSONObject catalog=catalog(),d=place.getJSONObject("destination");JSONArray rows=catalog.getJSONArray("offers");
            for(int i=0;i<rows.length();i++){JSONObject q=rows.getJSONObject(i);
                if(!q.optString("destinationId").equals(place.getString("id"))||!q.optString("deviceProfile").equals("mobile-touch")||
                    q.optLong("checkedAt")<=0||q.optLong("checkedAt")>now||q.optLong("validUntil")<=now||
                    !q.optString("destinationRevision").equals(d.getString("revision"))||!q.optString("contentVersion").equals(d.getString("contentVersion"))||
                    !q.optString("renderContractVersion").equals(catalog.getString("renderContractVersion")))continue;
                // Offers are generated by the same full qualification policy as
                // the browser, with time bounds checked again on this device.
                return true;
            }
        }catch(JSONException ignored){}return false;
    }
}
