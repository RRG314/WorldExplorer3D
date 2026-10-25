package io.worldexplorer3d.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

/** Runs only on a fresh CI-owned emulator. Actual AppWidgetHost, RemoteViews,
 * pending intents, private persistence and containing Activity; no JUnit mocks. */
public final class PortalWidgetContractInstrumentation extends Instrumentation {
    private Bundle arguments;
    private AppWidgetHostView view;
    private Activity expectedWindow;
    @Override public void onCreate(Bundle args){arguments=args;start();}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private void until(BooleanSupplier ready)throws Exception{long deadline=System.currentTimeMillis()+8000;while(!ready.getAsBoolean()){if(System.currentTimeMillis()>=deadline)throw new AssertionError("Native widget state did not settle.");Thread.sleep(50);}}
    private String text(int id){AtomicReference<String> value=new AtomicReference<>("");runOnMainSync(()->{TextView item=view.findViewById(id);if(item!=null)value.set(item.getText().toString());});return value.get();}
    private boolean foreground(){AtomicReference<Boolean> focused=new AtomicReference<>(false);runOnMainSync(()->focused.set(expectedWindow!=null&&expectedWindow.hasWindowFocus()));android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();return focused.get()&&root!=null&&root.getPackageName()!=null&&getTargetContext().getPackageName().contentEquals(root.getPackageName());}
    private void click(int id)throws Exception{until(this::foreground);Rect bounds=new Rect();runOnMainSync(()->{View item=view.findViewById(id);check(item!=null&&item.isShown()&&item.getGlobalVisibleRect(bounds),"Widget control is unavailable: "+id);});long at=SystemClock.uptimeMillis();for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent event=MotionEvent.obtain(at,SystemClock.uptimeMillis(),action,bounds.exactCenterX(),bounds.exactCenterY(),0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{check(getUiAutomation().injectInputEvent(event,true),"Native screen tap was rejected.");}finally{event.recycle();}}}
    private void screenshot(String name)throws Exception{until(this::foreground);waitForIdleSync();try{getUiAutomation().waitForIdle(150,1500);}catch(java.util.concurrent.TimeoutException ignored){}check(foreground(),"A system window covers the widget proof.");Bitmap pixels=getUiAutomation().takeScreenshot();check(pixels!=null,"Native screenshot unavailable.");File directory=new File(getTargetContext().getFilesDir(),"portal-evidence");check(directory.mkdirs()||directory.isDirectory(),"Evidence directory unavailable.");try(FileOutputStream output=new FileOutputStream(new File(directory,name))){check(pixels.compress(Bitmap.CompressFormat.PNG,100,output),"Screenshot could not be written.");}finally{pixels.recycle();}}
    @Override public void onStart(){
        Bundle result=new Bundle();int outcome=Activity.RESULT_CANCELED;AppWidgetHost host=null;PortalWidgetHarnessActivity activity=null;int widgetId=AppWidgetManager.INVALID_APPWIDGET_ID;SharedPreferences prefs=null;boolean owned=false;
        try{
            check(arguments!=null&&"true".equals(arguments.getString("ownedEmulator"))&&(Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish")),"Use a fresh owned Android emulator.");
            Context context=getTargetContext();prefs=context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE);
            check(prefs.getAll().isEmpty()&&PortalWidgetProvider.ids(context).length==0,"Refusing to replace existing Portal data or widgets.");owned=true;
            PortalStore store=new PortalStore(context);String id="baltimore-harbor";JSONObject place=store.place(id);check(place!=null,"Bundled destination unavailable offline.");
            final String modelId="monaco-coast";
            store.act(modelId,"save");store.act(modelId,"investigate");store.act(modelId,"unsave");JSONObject state=new PortalStore(context).trail(modelId);
            check(!state.getBoolean("saved")&&state.getLong("investigatedAt")>0&&state.getLong("visitedAt")==0&&state.getJSONArray("expeditionIds").length()==0,"Native choices changed visit/reward semantics.");
            boolean denied=false;try{store.act(id,"visit");}catch(Exception expected){denied=true;}check(denied,"Widget accepted game visit verb.");
            JSONObject invalid=store.catalog();invalid.getJSONArray("destinations").getJSONObject(0).put("gameLink","https://invalid.example/");denied=false;try{PortalStore.validateCatalog(invalid.toString());}catch(Exception expected){denied=true;}check(denied,"Malformed game link was accepted.");
            check(!store.gameAvailable(place,System.currentTimeMillis()),"Unqualified bundled destination offered a game entry.");
            result.putInt("persistence_contract_checks",4);
            AppWidgetManager manager=AppWidgetManager.getInstance(context);host=new AppWidgetHost(context,60252);widgetId=host.allocateAppWidgetId();
            store.configure(widgetId,"home",id);Bundle options=new Bundle();options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,300);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,440);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,440);
            getUiAutomation().adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET");
            try{check(manager.bindAppWidgetIdIfAllowed(widgetId,new ComponentName(context,PortalWidgetProvider.class),options),"System widget binding was denied.");}finally{getUiAutomation().dropShellPermissionIdentity();}
            activity=(PortalWidgetHarnessActivity)startActivitySync(new Intent(context,PortalWidgetHarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            expectedWindow=activity;
            final AppWidgetHost currentHost=host;final PortalWidgetHarnessActivity currentActivity=activity;final int currentId=widgetId;
            runOnMainSync(()->{currentHost.startListening();view=currentHost.createView(currentActivity,currentId,manager.getAppWidgetInfo(currentId));currentActivity.showWidget(view,300,440);});
            PortalWidgetProvider.update(context,widgetId);until(()->text(R.id.portal_title).contains("Baltimore"));
            click(R.id.portal_save);until(()->store.trail(id).optBoolean("saved"));until(()->text(R.id.portal_save).equals(context.getString(R.string.portal_saved)));
            click(R.id.portal_investigate);until(()->store.learning(currentId).equals(id));until(()->text(R.id.portal_body).equals(PortalStore.facts(place).get(0)));
            screenshot("widget-investigation.png");
            int count=PortalStore.facts(place).size();for(int i=1;i<count;i++){click(R.id.portal_fact_next);final int index=i;until(()->store.fact(currentId)==index);until(()->text(R.id.portal_body).equals(PortalStore.facts(place).get(index)));}
            click(R.id.portal_fact_next);until(()->store.learning(currentId).isEmpty());check(store.trail(id).optLong("investigatedAt")>0,"The actual widget investigation did not persist.");check(store.trail(id).optLong("visitedAt")==0,"Investigation granted a game visit.");
            screenshot("widget-saved.png");result.putInt("host_interaction_checks",3);
            ActivityMonitor monitor=addMonitor(PortalActivity.class.getName(),null,false);click(R.id.portal_trail);Activity trail=waitForMonitorWithTimeout(monitor,8000);removeMonitor(monitor);check(trail!=null,"Native Trail Activity did not open.");expectedWindow=trail;screenshot("native-trail.png");runOnMainSync(trail::finish);expectedWindow=activity;until(this::foreground);
            options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,180);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,200);manager.updateAppWidgetOptions(widgetId,options);
            runOnMainSync(()->{android.view.ViewGroup parent=(android.view.ViewGroup)view.getParent();parent.removeView(view);currentActivity.showWidget(view,180,200);view.updateAppWidget(PortalWidgetProvider.views(context,currentId));});
            until(()->text(R.id.portal_title).contains("Baltimore"));screenshot("widget-compact.png");
            store.configure(widgetId,"together",id);check(store.suggestion(widgetId,System.currentTimeMillis())==null,"Together fabricated a daily destination.");
            store.configure(widgetId,"beyond",id);check(store.suggestion(widgetId,System.currentTimeMillis())==null,"Beyond Earth fabricated an Earth visit.");
            result.putInt("handoff_layout_checks",3);result.putString("scope","Actual Android emulator widget host and pending-intent interaction. Offline bundled content; no physical phone, account sync, native VR or live catalog acceptance.");
            result.putString("passed","true");outcome=Activity.RESULT_OK;
        }catch(Throwable error){result.putString("passed","false");result.putString("failure",error.toString());}
        finally{
            if(host!=null){host.stopListening();if(widgetId!=AppWidgetManager.INVALID_APPWIDGET_ID)host.deleteAppWidgetId(widgetId);}
            if(activity!=null){final Activity closing=activity;runOnMainSync(closing::finish);}
            if(owned&&prefs!=null)prefs.edit().clear().commit();
        }
        finish(outcome,result);
    }
}
