package io.worldexplorer3d.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** System-owned home-screen projection; no renderer or permanent connection. */
public final class PortalWidgetProvider extends AppWidgetProvider {
    private static final String ACTION="io.worldexplorer3d.app.PORTAL_ACTION";
    static int[] ids(Context context){return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context,PortalWidgetProvider.class));}
    static void updateAll(Context context){for(int id:ids(context))update(context,id);}
    private static PendingIntent action(Context context,int widgetId,String verb,String destination){
        PortalStore store=new PortalStore(context);JSONObject place=store.place(destination);
        Intent intent=new Intent(context,PortalWidgetProvider.class).setAction(ACTION)
            .setData(new Uri.Builder().scheme("we3d-widget").authority("action").appendPath(Integer.toString(widgetId)).appendPath(verb).appendPath(destination).build())
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId).putExtra("verb",verb).putExtra("destination",destination).putExtra("owner",store.owner())
            .putExtra("learningVersion",place==null?"":place.optJSONObject("learning").optString("version"));
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent open(Context context,int widgetId,String section,String destination){
        Intent intent=new Intent(context,PortalActivity.class).setData(new Uri.Builder().scheme("we3d-widget").authority("open").appendPath(Integer.toString(widgetId)).appendPath(section).appendPath(destination).build())
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId).putExtra("section",section).putExtra("destination",destination);
        return PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static PendingIntent game(Context context,String path){
        return PendingIntent.getActivity(context,0,new Intent(context,GameLauncherActivity.class).setAction(Intent.ACTION_VIEW).setData(Uri.parse(PortalStore.ORIGIN+path)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static void update(Context context,int widgetId){
        AppWidgetManager.getInstance(context).updateAppWidget(widgetId,views(context,widgetId));
    }
    static RemoteViews views(Context context,int widgetId){
        PortalStore store=new PortalStore(context);JSONObject place=store.suggestion(widgetId,System.currentTimeMillis());
        String mode=store.mode(widgetId),id=place==null?"":place.optString("id"),learningId=store.learning(widgetId);
        // A revealed investigation remains the displayed place across midnight.
        if(!learningId.isEmpty()){JSONObject learning=store.place(learningId);if(learning!=null){place=learning;id=learningId;}}
        Bundle options=AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        boolean compact=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,440)<380||options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,280)<250;
        RemoteViews views=new RemoteViews(context.getPackageName(),compact?R.layout.portal_widget_compact:R.layout.portal_widget);
        views.setOnClickPendingIntent(R.id.portal_settings,open(context,widgetId,"configure",id));
        views.setOnClickPendingIntent(R.id.portal_trail,open(context,widgetId,"trail",id));
        views.setViewVisibility(R.id.portal_save,place==null?View.GONE:View.VISIBLE);
        views.setViewVisibility(R.id.portal_investigate,place==null||compact?View.GONE:View.VISIBLE);
        long loaded=store.loadedAt();views.setTextViewText(R.id.portal_status,loaded==0?context.getString(R.string.portal_bundled):context.getString(R.string.portal_updated,DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(new Date(loaded))));
        if(place!=null){
            JSONObject state=store.trail(id),learning=place.optJSONObject("learning");boolean revealed=!compact&&id.equals(learningId),saved=state.optBoolean("saved");
            if(revealed&&!store.learningVersion(widgetId).equals(learning.optString("version")))store.showFact(widgetId,id,0);
            views.setTextViewText(R.id.portal_title,place.optString("title"));
            views.setTextViewText(R.id.portal_region,place.optString("region"));
            views.setTextViewText(R.id.portal_save,context.getString(saved?R.string.portal_saved:R.string.portal_save));
            views.setOnClickPendingIntent(R.id.portal_save,action(context,widgetId,"save",id));
            views.setOnClickPendingIntent(R.id.portal_investigate,compact?open(context,widgetId,"place",id):action(context,widgetId,revealed?"close":"investigate",id));
            views.setTextViewText(R.id.portal_investigate,context.getString(revealed?R.string.portal_close_fact:R.string.portal_investigate));
            boolean ready=store.gameAvailable(place,System.currentTimeMillis());
            views.setOnClickPendingIntent(R.id.portal_open,ready?game(context,place.optString("gameLink")):open(context,widgetId,"place",id));
            views.setTextViewText(R.id.portal_open,context.getString(ready?R.string.portal_enter:R.string.portal_open_place));
            views.setViewVisibility(R.id.portal_fact_next,revealed?View.VISIBLE:View.GONE);
            if(revealed){
                java.util.List<String> facts=PortalStore.facts(place);int index=Math.min(store.fact(widgetId),facts.size()-1);
                views.setTextViewText(R.id.portal_body,facts.get(index));
                views.setTextViewText(R.id.portal_fact_next,context.getString(index==facts.size()-1?R.string.portal_add_investigated:R.string.portal_next_fact));
                views.setOnClickPendingIntent(R.id.portal_fact_next,action(context,widgetId,"next",id));
            }else views.setTextViewText(R.id.portal_body,place.optString("summary"));
            try{store.act(id,"offered");}catch(Exception ignored){}
        }else{
            int title=mode.equals("together")?R.string.portal_together:mode.equals("beyond")?R.string.portal_beyond:R.string.portal_home;
            int body=mode.equals("together")?R.string.portal_together_body:mode.equals("beyond")?R.string.portal_beyond_body:R.string.portal_home_body;
            views.setTextViewText(R.id.portal_title,context.getString(title));views.setTextViewText(R.id.portal_body,context.getString(body));
            views.setTextViewText(R.id.portal_region,context.getString(R.string.portal_follow_label));views.setViewVisibility(R.id.portal_fact_next,View.GONE);
            views.setTextViewText(R.id.portal_open,context.getString(mode.equals("home")?R.string.portal_choose_place:R.string.portal_open_game));
            views.setOnClickPendingIntent(R.id.portal_open,open(context,widgetId,mode.equals("home")?"configure":mode,""));
        }
        if(compact)views.setTextViewText(R.id.portal_body,"");
        return views;
    }
    private void localWork(Runnable work){
        PendingResult pending=goAsync();ExecutorService executor=Executors.newSingleThreadExecutor();
        executor.execute(()->{try{work.run();}finally{pending.finish();executor.shutdown();}});
    }
    @Override public void onUpdate(Context context,AppWidgetManager manager,int[] ids){
        localWork(()->{for(int id:ids)update(context,id);PortalRefreshJob.schedule(context);});
    }
    @Override public void onAppWidgetOptionsChanged(Context context,AppWidgetManager manager,int id,Bundle options){localWork(()->update(context,id));}
    @Override public void onDeleted(Context context,int[] ids){PortalStore store=new PortalStore(context);for(int id:ids)store.removeWidget(id);}
    @Override public void onReceive(Context context,Intent intent){
        if(!ACTION.equals(intent.getAction())){super.onReceive(context,intent);return;}
        int widgetId=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);boolean owned=false;
        for(int id:ids(context))if(id==widgetId)owned=true;if(!owned)return;
        final int currentWidgetId=widgetId;
        localWork(()->{
            PortalStore store=new PortalStore(context);String destination=intent.getStringExtra("destination"),verb=intent.getStringExtra("verb");
            JSONObject shown=store.suggestion(currentWidgetId,System.currentTimeMillis());String learning=store.learning(currentWidgetId);
            if(destination==null||!store.owner().equals(intent.getStringExtra("owner"))||!(destination.equals(learning)||shown!=null&&destination.equals(shown.optString("id")))){update(context,currentWidgetId);return;}
            try{
                JSONObject place=store.place(destination);if(place==null)return;
                if("save".equals(verb))store.act(destination,store.trail(destination).optBoolean("saved")?"unsave":"save",intent.getStringExtra("owner"));
                else if("investigate".equals(verb))store.showFact(currentWidgetId,destination,0);
                else if("close".equals(verb))store.closeLearning(currentWidgetId);
                else if("next".equals(verb)&&destination.equals(learning)){
                    if(!place.getJSONObject("learning").getString("version").equals(intent.getStringExtra("learningVersion"))){store.showFact(currentWidgetId,destination,0);updateAll(context);return;}
                    int index=store.fact(currentWidgetId),count=PortalStore.facts(place).size();
                    if(index>=count-1){store.act(destination,"investigate",intent.getStringExtra("owner"));store.closeLearning(currentWidgetId);}else store.showFact(currentWidgetId,destination,index+1);
                }
            }catch(Exception ignored){/* A failed commit cannot create a success state. */}
            updateAll(context);PortalRefreshJob.schedule(context);
        });
    }
}
