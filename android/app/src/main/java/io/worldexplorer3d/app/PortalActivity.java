package io.worldexplorer3d.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native companion for configuration, complete investigations and Trail. Game
 * play continues through the existing trusted browser launcher and web owners. */
public final class PortalActivity extends Activity {
    private PortalStore store;
    private LinearLayout content;
    private final ExecutorService work=Executors.newSingleThreadExecutor();
    private boolean closed;
    private int widgetId;
    private String section,destination;
    private String draftMode,draftHome;
    private Spinner modeField,homeField;
    private List<JSONObject> configurationPlaces;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);store=new PortalStore(this);widgetId=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);
        section=state==null?getIntent().getStringExtra("section"):state.getString("section");destination=state==null?getIntent().getStringExtra("destination"):state.getString("destination");
        if(state!=null){draftMode=state.getString("draftMode");draftHome=state.getString("draftHome");}
        if(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE.equals(getIntent().getAction()))section="configure";
        if(section==null)section="trail";if(destination==null)destination="";
        setResult(RESULT_CANCELED);show();PortalRefreshJob.schedule(this);
    }
    @Override protected void onSaveInstanceState(Bundle out){out.putString("section",section);out.putString("destination",destination);
        if(modeField!=null&&homeField!=null&&configurationPlaces!=null){out.putString("draftMode",new String[]{"wander","home","nature","together","beyond"}[modeField.getSelectedItemPosition()]);out.putString("draftHome",configurationPlaces.get(homeField.getSelectedItemPosition()).optString("id"));}
        super.onSaveInstanceState(out);}
    @Override protected void onDestroy(){closed=true;work.shutdownNow();super.onDestroy();}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private void shell(){
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(7,20,35));
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(24),dp(20),dp(24));scroll.addView(content);setContentView(scroll);
        final LinearLayout currentContent=content;
        scroll.setOnApplyWindowInsetsListener((view,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());currentContent.setPadding(dp(20)+safe.left,dp(24)+safe.top,dp(20)+safe.right,dp(24)+safe.bottom);}
            else currentContent.setPadding(dp(20)+insets.getSystemWindowInsetLeft(),dp(24)+insets.getSystemWindowInsetTop(),dp(20)+insets.getSystemWindowInsetRight(),dp(24)+insets.getSystemWindowInsetBottom());
            return insets;
        });scroll.requestApplyInsets();
        text(getString(R.string.portal_brand),13,true);text(getString(R.string.portal_name),30,true);
        if(!section.equals("configure")){button(R.string.portal_trail,()->navigate("trail",""));button(R.string.portal_open_game,()->openGame("/app/"));}
    }
    private TextView text(String value,int size,boolean heading){
        TextView view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(heading?Color.rgb(230,242,255):Color.rgb(183,203,223));view.setPadding(0,dp(8),0,dp(8));
        view.setAccessibilityHeading(heading);if(heading)view.setTypeface(null,android.graphics.Typeface.BOLD);content.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;
    }
    private void button(int label,Runnable action){button(getString(label),action);}
    private void button(String label,Runnable action){
        Button view=new Button(this);view.setText(label);view.setAllCaps(false);view.setTextColor(Color.rgb(230,242,255));view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(24,53,76)));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.setMargins(0,dp(4),0,dp(4));view.setMinHeight(dp(48));content.addView(view,params);view.setOnClickListener(v->action.run());
    }
    private void navigate(String next,String id){section=next;destination=id;show();}
    private void perform(Runnable mutation){
        work.execute(()->{try{mutation.run();PortalWidgetProvider.updateAll(this);if(!closed)runOnUiThread(this::show);}
            catch(Exception error){if(!closed)runOnUiThread(()->text(getString(R.string.portal_save_failed),16,false));}});
    }
    private void mutate(String id,String kind){String owner=store.owner();perform(()->{try{store.act(id,kind,owner);}catch(Exception error){throw new IllegalStateException(error);}});}
    private void openGame(String path){
        Uri uri=Uri.parse(PortalStore.ORIGIN+path);if(!PortalStore.ORIGIN.equals(uri.getScheme()+"://"+uri.getHost())||!uri.getPath().startsWith("/app/"))return;
        startActivity(new Intent(this,GameLauncherActivity.class).setAction(Intent.ACTION_VIEW).setData(uri));
    }
    private void show(){
        if(closed)return;shell();
        if(section.equals("configure")){configure();return;}
        if(section.equals("together")){text(getString(R.string.portal_together_body),17,false);button(R.string.portal_open_multiplayer,()->openGame("/app/?tab=multiplayer"));return;}
        if(section.equals("beyond")){text(getString(R.string.portal_beyond_body),17,false);for(String body:Arrays.asList("moon","mars","space"))button(getString(body.equals("moon")?R.string.portal_moon:body.equals("mars")?R.string.portal_mars:R.string.portal_space),()->openGame("/app/?launch="+body+"&gm=free"));return;}
        JSONObject place=store.place(destination);if(section.equals("place")&&place!=null){showPlace(place);return;}
        text(getString(R.string.portal_trail_explanation),17,false);
        int count=0;for(JSONObject row:store.trailEntries()){
            if(!row.optBoolean("saved")&&row.optLong("investigatedAt")==0&&row.optLong("visitedAt")==0)continue;
            count++;String id=row.optString("destinationId");JSONObject known=store.place(id);text(known==null?id:known.optString("title"),20,true);
            List<String> labels=new ArrayList<>();if(row.optBoolean("saved"))labels.add(getString(R.string.portal_saved));if(row.optLong("investigatedAt")>0)labels.add(getString(R.string.portal_investigated));if(row.optLong("visitedAt")>0)labels.add(getString(R.string.portal_visited));
            text(android.text.TextUtils.join(" · ",labels),15,false);if(known!=null)button(R.string.portal_open_place,()->navigate("place",id));
        }
        if(count==0)text(getString(R.string.portal_empty_trail),17,false);
        text(getString(R.string.portal_device_trail),14,false);
        text(getString(R.string.portal_places_heading),23,true);for(JSONObject row:store.destinations())button(row.optString("title"),()->navigate("place",row.optString("id")));
        button(R.string.portal_refresh,()->{PortalRefreshJob.schedule(this);text(getString(R.string.portal_refresh_scheduled),14,false);});
        long loaded=store.loadedAt();text(loaded==0?getString(R.string.portal_bundled):getString(R.string.portal_updated,DateFormat.getDateTimeInstance().format(new Date(loaded))),13,false);
    }
    private void showPlace(JSONObject place){
        String id=place.optString("id");JSONObject state=store.trail(id),learning=place.optJSONObject("learning");
        text(place.optString("title"),24,true);text(place.optString("region"),15,false);text(place.optString("summary"),17,false);
        button(state.optBoolean("saved")?R.string.portal_remove_saved:R.string.portal_save,()->mutate(id,state.optBoolean("saved")?"unsave":"save"));
        if(store.gameAvailable(place,System.currentTimeMillis()))button(R.string.portal_enter,()->openGame(place.optString("gameLink")));
        else text(getString(R.string.portal_world_checks),14,false);
        text(learning.optString("title"),21,true);JSONArray paragraphs=learning.optJSONArray("paragraphs");for(int i=0;i<paragraphs.length();i++)text(paragraphs.optString(i),17,false);
        text(getString(R.string.portal_sources),18,true);JSONArray sources=learning.optJSONArray("sources");for(int i=0;i<sources.length();i++){
            JSONObject source=sources.optJSONObject(i);button(source.optString("title"),()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(source.optString("url")))));
        }
        button(state.optString("investigationVersion").equals(learning.optString("version"))?R.string.portal_investigated:R.string.portal_add_investigated,()->mutate(id,"investigate"));
    }
    private void configure(){
        boolean owned=false;for(int id:PortalWidgetProvider.ids(this))if(id==widgetId)owned=true;
        if(!owned){text(getString(R.string.portal_add_widget_first),17,false);return;}
        text(getString(R.string.portal_choose_follow),21,true);
        final String[] modes={"wander","home","nature","together","beyond"};
        Spinner mode=new Spinner(this);modeField=mode;mode.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,getResources().getStringArray(R.array.portal_modes)));mode.setSelection(Math.max(0,Arrays.asList(modes).indexOf(draftMode==null?store.mode(widgetId):draftMode)));content.addView(mode);
        text(getString(R.string.portal_choose_home),18,true);List<JSONObject> places=store.destinations();List<String> titles=new ArrayList<>();int selected=0;
        configurationPlaces=places;for(int i=0;i<places.size();i++){titles.add(places.get(i).optString("title"));if(places.get(i).optString("id").equals(draftHome==null?store.home(widgetId):draftHome))selected=i;}
        Spinner home=new Spinner(this);homeField=home;home.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,titles));home.setSelection(selected);content.addView(home);
        text(getString(R.string.portal_refresh_explanation),15,false);
        button(R.string.portal_done,()->{String selectedMode=modes[mode.getSelectedItemPosition()],homeId=places.get(home.getSelectedItemPosition()).optString("id");
            work.execute(()->{store.configure(widgetId,selectedMode,homeId);PortalWidgetProvider.update(this,widgetId);if(!closed)runOnUiThread(()->{setResult(RESULT_OK,new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,widgetId));finish();});});});
        button(R.string.portal_cancel,this::finish);
    }
}
