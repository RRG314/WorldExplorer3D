package io.worldexplorer3d.app;

import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

/** Native projection of trail-model.js. The accepted server state is separate
 * from coalesced pending choices, so a late acknowledgement cannot undo a tap.
 * The widget action vocabulary deliberately contains no visit or expedition. */
final class PortalTrail {
    static boolean identifier(String value){return value!=null&&value.matches("[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}");}
    static boolean ownerValid(String owner){return "device-guest".equals(owner)||owner!=null&&owner.startsWith("account:")&&owner.substring(8).matches("[^\\p{Cntrl}]{1,128}");}
    static String key(String owner,String id)throws JSONException{if(!ownerValid(owner)||!identifier(id))throw new JSONException("Invalid Trail owner or destination.");return "portal-trail:"+Uri.encode(owner)+"|"+id;}
    static JSONObject empty(String id)throws JSONException{
        if(!identifier(id))throw new JSONException("Invalid Trail destination.");
        return new JSONObject().put("destinationId",id).put("revision",0).put("firstOfferedAt",0).put("lastOfferedAt",0)
            .put("saved",false).put("savedAt",0).put("investigatedAt",0).put("investigationVersion",JSONObject.NULL).put("visitedAt",0).put("expeditionIds",new JSONArray());
    }
    private static long integer(JSONObject source,String field)throws JSONException{
        Object raw=source.get(field);if(!(raw instanceof Number))throw new JSONException("Invalid Trail number.");double value=((Number)raw).doubleValue();
        if(!Double.isFinite(value)||value<0||value>9007199254740991d||Math.floor(value)!=value)throw new JSONException("Invalid Trail number.");return ((Number)raw).longValue();
    }
    static JSONObject state(JSONObject input,String id)throws JSONException{
        if(!id.equals(input.getString("destinationId"))||!(input.get("saved") instanceof Boolean))throw new JSONException("Invalid Trail state.");
        JSONObject result=empty(id);result.put("revision",integer(input,"revision"));
        for(String field:new String[]{"firstOfferedAt","lastOfferedAt","savedAt","investigatedAt","visitedAt"})result.put(field,integer(input,field));
        Object version=input.get("investigationVersion");if(version!=JSONObject.NULL&&(!(version instanceof String)||!identifier((String)version)))throw new JSONException("Invalid investigation version.");
        result.put("saved",input.getBoolean("saved")).put("investigationVersion",version);
        JSONArray expeditions=input.getJSONArray("expeditionIds"),accepted=new JSONArray();HashSet<String> seen=new HashSet<>();
        if(expeditions.length()>128)throw new JSONException("Invalid expedition list.");
        for(int i=0;i<expeditions.length();i++){String value=expeditions.getString(i);if(!identifier(value)||!seen.add(value))throw new JSONException("Invalid expedition identity.");accepted.put(value);}
        result.put("expeditionIds",accepted);
        if(result.getLong("firstOfferedAt")>result.getLong("lastOfferedAt")||result.getBoolean("saved")&&result.getLong("savedAt")==0||result.getLong("investigatedAt")>0&&version==JSONObject.NULL)throw new JSONException("Incomplete Trail state.");
        return result;
    }
    static String slot(String kind)throws JSONException{
        switch(kind){case "save":case "unsave":return "saved";case "offered":return "offered";case "investigate":return "investigated";default:throw new JSONException("Invalid widget action.");}
    }
    static JSONObject action(JSONObject input,String id)throws JSONException{
        String kind=input.getString("kind");slot(kind);
        if(!identifier(input.getString("operationId"))||!id.equals(input.getString("destinationId"))||integer(input,"createdAt")==0)throw new JSONException("Invalid Trail action.");
        JSONObject result=new JSONObject().put("operationId",input.getString("operationId")).put("destinationId",id).put("kind",kind).put("createdAt",input.getLong("createdAt"));
        if(kind.equals("investigate")){String version=input.getString("contentVersion");if(!identifier(version))throw new JSONException("Invalid investigation version.");result.put("contentVersion",version);}return result;
    }
    static JSONObject entry(String owner,String id)throws JSONException{
        return new JSONObject().put("type","PortalTrailEntry").put("schemaVersion",1).put("id",key(owner,id)).put("ownerScope",owner).put("destinationId",id).put("state",empty(id)).put("pending",new JSONObject());
    }
    static JSONObject read(JSONObject stored,String owner,String id)throws JSONException{
        JSONObject result=entry(owner,id);if(stored==null)return result;
        // Version 1 Android guest rows were flattened. Retain every learned,
        // saved and visited fact while upgrading on the next atomic write.
        if(!stored.has("type")){
            result.put("state",state(stored,id));
            if(!owner.equals("device-guest")&&stored.has("pending"))result.put("pending",stored.getJSONObject("pending"));
        }else{
            if(!"PortalTrailEntry".equals(stored.getString("type"))||integer(stored,"schemaVersion")!=1||!key(owner,id).equals(stored.getString("id"))||!owner.equals(stored.getString("ownerScope"))||!id.equals(stored.getString("destinationId")))throw new JSONException("Trail record changed owner or destination.");
            result.put("state",state(stored.getJSONObject("state"),id)).put("pending",stored.getJSONObject("pending"));
        }
        JSONObject pending=result.getJSONObject("pending"),accepted=new JSONObject();
        for(java.util.Iterator<String> it=pending.keys();it.hasNext();){String name=it.next();JSONObject choice=action(pending.getJSONObject(name),id);if(owner.equals("device-guest")||!name.equals(slot(choice.getString("kind"))))throw new JSONException("Invalid pending Trail action.");accepted.put(name,choice);}
        result.put("pending",accepted);return result;
    }
    private static JSONObject apply(JSONObject base,JSONObject choice)throws JSONException{
        JSONObject next=state(base,choice.getString("destinationId"));long at=choice.getLong("createdAt"),first=next.getLong("firstOfferedAt");
        next.put("firstOfferedAt",first==0?at:Math.min(first,at)).put("lastOfferedAt",Math.max(next.getLong("lastOfferedAt"),at));
        String kind=choice.getString("kind");if(kind.equals("save")||kind.equals("unsave")){next.put("saved",kind.equals("save"));if(kind.equals("save"))next.put("savedAt",at);}
        if(kind.equals("investigate"))next.put("investigatedAt",at).put("investigationVersion",choice.getString("contentVersion"));return next;
    }
    static List<JSONObject> pending(JSONObject entry)throws JSONException{
        List<JSONObject> choices=new ArrayList<>();JSONObject pending=entry.getJSONObject("pending");for(java.util.Iterator<String> it=pending.keys();it.hasNext();)choices.add(pending.getJSONObject(it.next()));
        choices.sort(Comparator.comparingLong((JSONObject row)->row.optLong("createdAt")).thenComparing(row->row.optString("operationId")));return choices;
    }
    static JSONObject view(JSONObject entry)throws JSONException{
        JSONObject value=state(entry.getJSONObject("state"),entry.getString("destinationId"));for(JSONObject choice:pending(entry))value=apply(value,choice);
        return value.put("pending",entry.getJSONObject("pending").length()>0).put("ownerScope",entry.getString("ownerScope"));
    }
    static JSONObject queue(JSONObject source,JSONObject input)throws JSONException{
        JSONObject next=read(source,source.getString("ownerScope"),source.getString("destinationId")),choice=action(input,next.getString("destinationId"));
        if(next.getString("ownerScope").equals("device-guest"))next.put("state",apply(next.getJSONObject("state"),choice));
        else next.getJSONObject("pending").put(slot(choice.getString("kind")),choice);return next;
    }
    static JSONObject accept(JSONObject source,JSONObject response,String owner)throws JSONException{
        String id=source.getString("destinationId");JSONObject next=read(source,owner,id);
        if(!owner.equals(response.getString("ownerScope")))throw new JSONException("Trail synchronization changed account.");
        JSONObject remote=state(response.getJSONObject("state"),id);if(remote.getLong("revision")>=next.getJSONObject("state").getLong("revision"))next.put("state",remote);
        JSONObject pending=next.getJSONObject("pending");for(JSONObject choice:pending(next))if(choice.getString("operationId").equals(response.optString("operationId")))pending.remove(slot(choice.getString("kind")));
        return next;
    }
}
