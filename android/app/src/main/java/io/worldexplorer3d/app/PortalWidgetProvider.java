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
    static PendingIntent action(Context context,int widgetId,String verb,String destination){return action(context,widgetId,verb,destination,0,0);}
    static PendingIntent action(Context context,int widgetId,String verb,String destination,int width,int height){
        synchronized(PortalStore.LOCK){
        PortalStore store=new PortalStore(context);JSONObject place=store.place(destination);String owner=store.owner(),version=place==null?"":place.optJSONObject("learning").optString("version");int fact=store.fact(widgetId);
        // Extras do not distinguish PendingIntents. Bind the actual command
        // identity too, or UPDATE_CURRENT can retarget a still-visible button
        // to another account or a later fact page before the host redraws.
        Intent intent=new Intent(context,PortalWidgetProvider.class).setAction(ACTION)
            .setData(new Uri.Builder().scheme("we3d-widget").authority("action").appendPath(Integer.toString(widgetId)).appendPath(verb).appendPath(destination)
                .appendQueryParameter("width",Integer.toString(width)).appendQueryParameter("height",Integer.toString(height)).appendQueryParameter("owner",owner).appendQueryParameter("version",version).appendQueryParameter("fact",Integer.toString(fact)).build())
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId).putExtra("verb",verb).putExtra("destination",destination).putExtra("owner",owner)
            .putExtra("learningVersion",version).putExtra("fact",fact).putExtra("width",width).putExtra("height",height);
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        }
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
        synchronized(PortalStore.LOCK){return viewsLocked(context,widgetId);}
    }
    private static RemoteViews viewsLocked(Context context,int widgetId){
        Bundle options=AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
        long now=System.currentTimeMillis();
        if(android.os.Build.VERSION.SDK_INT>=31){
            java.util.ArrayList<android.util.SizeF> sizes=options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if(sizes!=null&&!sizes.isEmpty()&&sizes.size()<=16){
                java.util.Map<android.util.SizeF,RemoteViews> variants=new java.util.LinkedHashMap<>();
                boolean valid=true;
                for(android.util.SizeF size:sizes)if(size==null||!Float.isFinite(size.getWidth())||!Float.isFinite(size.getHeight())||size.getWidth()<=0||size.getHeight()<=0||size.getWidth()>2048||size.getHeight()>2048){valid=false;break;}
                if(valid){
                    for(int i=0;i<sizes.size();i++){android.util.SizeF size=sizes.get(i);variants.put(size,viewForSize(context,widgetId,(int)size.getWidth(),(int)size.getHeight(),now,i==sizes.size()-1));}
                    return new RemoteViews(variants);
                }
            }
        }
        // Legacy launchers report two orientation ranges, not one min/min size.
        int minWidth=Math.max(1,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,280)),minHeight=Math.max(1,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,440));
        int maxWidth=Math.max(minWidth,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,minWidth)),maxHeight=Math.max(minHeight,options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,minHeight));
        return new RemoteViews(viewForSize(context,widgetId,maxWidth,minHeight,now,false),viewForSize(context,widgetId,minWidth,maxHeight,now,true));
    }
    private static boolean canShowFacts(Context context,JSONObject place,int width,int height){
        if(place==null||width<300||height<440*Math.max(1,context.getResources().getConfiguration().fontScale))return false;
        android.text.TextPaint paint=new android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(android.graphics.Typeface.DEFAULT);
        paint.setTextSize(android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP,14,context.getResources().getDisplayMetrics()));
        android.graphics.Rect margins=android.appwidget.AppWidgetHostView.getDefaultPaddingForWidget(context,new ComponentName(context,PortalWidgetProvider.class),null);
        int textWidth=Math.max(1,Math.round((width-32)*context.getResources().getDisplayMetrics().density)-margins.left-margins.right);
        for(String fact:PortalStore.facts(place))if(android.text.StaticLayout.Builder.obtain(fact,0,fact.length(),paint,textWidth).setIncludePad(true).build().getLineCount()>5)return false;
        return true;
    }
    private static RemoteViews viewForSize(Context context,int widgetId,int width,int height,long now,boolean recordOffered){
        PortalStore store=new PortalStore(context);JSONObject place=store.suggestion(widgetId,now);
        String mode=store.mode(widgetId),id=place==null?"":place.optString("id"),learningId=store.learning(widgetId);
        // A revealed investigation remains the displayed place across midnight.
        if(!learningId.isEmpty()){JSONObject learning=store.place(learningId);if(learning!=null){place=learning;id=learningId;}}
        boolean compact=height<250||width<280;
        // Full facts need space for their complete text and Next control. At
        // larger system text sizes the concise card opens the full native page
        // instead of allowing completion from a clipped fact.
        boolean inlineLearning=!compact&&canShowFacts(context,place,width,height);
        RemoteViews views=new RemoteViews(context.getPackageName(),compact?R.layout.portal_widget_compact:inlineLearning?R.layout.portal_widget:R.layout.portal_widget_medium);
        views.setOnClickPendingIntent(R.id.portal_settings,open(context,widgetId,"configure",id));
        views.setOnClickPendingIntent(R.id.portal_trail,open(context,widgetId,"trail",id));
        views.setViewVisibility(R.id.portal_save,place==null?View.GONE:View.VISIBLE);
        views.setViewVisibility(R.id.portal_investigate,place==null||compact||!inlineLearning&&context.getResources().getConfiguration().fontScale>1.3f?View.GONE:View.VISIBLE);
        long loaded=store.loadedAt();views.setTextViewText(R.id.portal_status,loaded==0?context.getString(R.string.portal_bundled):context.getString(R.string.portal_updated,DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(new Date(loaded))));
        if(place!=null){
            JSONObject state=store.trail(id),learning=place.optJSONObject("learning");boolean revealed=inlineLearning&&id.equals(learningId),saved=state.optBoolean("saved");
            if(revealed&&!store.learningVersion(widgetId).equals(learning.optString("version")))store.showFact(widgetId,id,0);
            String title=place.optString("title");
            views.setTextViewText(R.id.portal_title,inlineLearning?title:title.split(" · ",2)[0]);
            views.setContentDescription(R.id.portal_title,title);
            views.setTextViewText(R.id.portal_region,place.optString("region"));
            views.setTextViewText(R.id.portal_save,context.getString(saved?R.string.portal_saved:inlineLearning?R.string.portal_save:R.string.portal_save_short));
            views.setContentDescription(R.id.portal_save,context.getString(saved?R.string.portal_saved:R.string.portal_save));
            views.setOnClickPendingIntent(R.id.portal_save,action(context,widgetId,saved?"unsave":"save",id,width,height));
            views.setOnClickPendingIntent(R.id.portal_investigate,!inlineLearning?open(context,widgetId,"place",id):action(context,widgetId,revealed?"close":"investigate",id,width,height));
            views.setTextViewText(R.id.portal_investigate,context.getString(revealed?R.string.portal_close_fact:R.string.portal_investigate));
            boolean ready=store.gameAvailable(place,now);
            views.setOnClickPendingIntent(R.id.portal_open,ready?game(context,place.optString("gameLink")):open(context,widgetId,"place",id));
            views.setTextViewText(R.id.portal_open,context.getString(inlineLearning?(ready?R.string.portal_enter:R.string.portal_open_place):(ready?R.string.portal_enter_short:R.string.portal_open_short)));
            views.setContentDescription(R.id.portal_open,context.getString(ready?R.string.portal_enter:R.string.portal_open_place));
            views.setViewVisibility(R.id.portal_fact_next,revealed?View.VISIBLE:View.GONE);
            if(revealed){
                java.util.List<String> facts=PortalStore.facts(place);int index=Math.min(store.fact(widgetId),facts.size()-1);
                views.setTextViewText(R.id.portal_body,facts.get(index));
                views.setTextViewText(R.id.portal_fact_next,context.getString(index==facts.size()-1?R.string.portal_add_investigated:R.string.portal_next_fact));
                views.setOnClickPendingIntent(R.id.portal_fact_next,action(context,widgetId,"next",id,width,height));
            }else views.setTextViewText(R.id.portal_body,place.optString("summary"));
            if(recordOffered)try{store.act(id,"offered");}catch(Exception ignored){}
        }else{
            int title=mode.equals("together")?R.string.portal_together:mode.equals("beyond")?R.string.portal_beyond:R.string.portal_home;
            int body=mode.equals("together")?R.string.portal_together_body:mode.equals("beyond")?R.string.portal_beyond_body:R.string.portal_home_body;
            views.setTextViewText(R.id.portal_title,context.getString(title));views.setTextViewText(R.id.portal_body,context.getString(body));
            views.setContentDescription(R.id.portal_open,context.getString(mode.equals("home")?R.string.portal_choose_place:R.string.portal_open_game));
            views.setTextViewText(R.id.portal_region,context.getString(R.string.portal_follow_label));views.setViewVisibility(R.id.portal_fact_next,View.GONE);
            views.setTextViewText(R.id.portal_open,context.getString(mode.equals("home")?R.string.portal_choose_place:R.string.portal_open_game));
            views.setOnClickPendingIntent(R.id.portal_open,open(context,widgetId,mode.equals("home")?"configure":mode,""));
        }
        if(compact){
            views.setTextViewText(R.id.portal_open,"↗");
            views.setTextViewText(R.id.portal_body,"");
            if(context.getResources().getConfiguration().fontScale>1.3f){views.setViewVisibility(R.id.portal_region,View.GONE);views.setViewVisibility(R.id.portal_status,View.GONE);}
        }
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
            synchronized(PortalStore.LOCK){
            PortalStore store=new PortalStore(context);String destination=intent.getStringExtra("destination"),verb=intent.getStringExtra("verb");
            JSONObject shown=store.suggestion(currentWidgetId,System.currentTimeMillis());String learning=store.learning(currentWidgetId);
            if(destination==null||!store.owner().equals(intent.getStringExtra("owner"))||!(destination.equals(learning)||shown!=null&&destination.equals(shown.optString("id")))){update(context,currentWidgetId);return;}
            try{
                JSONObject place=store.place(destination);if(place==null)return;
                // A font/host-size change can leave a formerly valid PendingIntent
                // visible until the next projection. Reject its clipped reading
                // command and refresh; never advance an unseen fact.
                if(("investigate".equals(verb)||"next".equals(verb))&&!canShowFacts(context,place,intent.getIntExtra("width",0),intent.getIntExtra("height",0))){updateAll(context);return;}
                if("save".equals(verb)||"unsave".equals(verb))store.act(destination,verb,intent.getStringExtra("owner"));
                else if("investigate".equals(verb))store.showFact(currentWidgetId,destination,0);
                else if("close".equals(verb))store.closeLearning(currentWidgetId);
                else if("next".equals(verb)&&destination.equals(learning)){
                    if(!place.getJSONObject("learning").getString("version").equals(intent.getStringExtra("learningVersion"))){store.showFact(currentWidgetId,destination,0);updateAll(context);return;}
                    int index=store.fact(currentWidgetId),count=PortalStore.facts(place).size();
                    if(intent.getIntExtra("fact",-1)!=index){update(context,currentWidgetId);return;}
                    if(index>=count-1){store.act(destination,"investigate",intent.getStringExtra("owner"),intent.getStringExtra("learningVersion"));store.closeLearning(currentWidgetId);}else store.showFact(currentWidgetId,destination,index+1);
                }
            }catch(Exception ignored){/* A failed commit cannot create a success state. */}
            }
            updateAll(context);PortalRefreshJob.schedule(context);
        });
    }
}
