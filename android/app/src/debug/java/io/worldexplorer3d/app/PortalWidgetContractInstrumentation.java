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
    private String step="fresh emulator preflight";
    @Override public void onCreate(Bundle args){arguments=args;start();}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private void until(BooleanSupplier ready)throws Exception{long deadline=System.currentTimeMillis()+8000;while(!ready.getAsBoolean()){if(System.currentTimeMillis()>=deadline)throw new AssertionError("Native widget state did not settle.");Thread.sleep(50);}}
    private String text(int id){AtomicReference<String> value=new AtomicReference<>("");runOnMainSync(()->{TextView item=view.findViewById(id);if(item!=null)value.set(item.getText().toString());});return value.get();}
    private boolean foreground(){AtomicReference<Boolean> focused=new AtomicReference<>(false);runOnMainSync(()->focused.set(expectedWindow!=null&&expectedWindow.hasWindowFocus()));android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();return focused.get()&&root!=null&&root.getPackageName()!=null&&getTargetContext().getPackageName().contentEquals(root.getPackageName());}
    private void click(int id)throws Exception{until(this::foreground);Rect bounds=new Rect();runOnMainSync(()->{View item=view.findViewById(id);check(item!=null&&item.isShown()&&item.getGlobalVisibleRect(bounds),"Widget control is unavailable: "+id);});long at=SystemClock.uptimeMillis();for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent event=MotionEvent.obtain(at,SystemClock.uptimeMillis(),action,bounds.exactCenterX(),bounds.exactCenterY(),0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);try{check(getUiAutomation().injectInputEvent(event,true),"Native screen tap was rejected.");}finally{event.recycle();}}}
    private void screenshot(String name)throws Exception{until(this::foreground);waitForIdleSync();try{getUiAutomation().waitForIdle(150,1500);}catch(java.util.concurrent.TimeoutException ignored){}check(foreground(),"A system window covers the widget proof.");Bitmap pixels=getUiAutomation().takeScreenshot();check(pixels!=null,"Native screenshot unavailable.");File directory=new File(getTargetContext().getFilesDir(),"portal-evidence");check(directory.mkdirs()||directory.isDirectory(),"Evidence directory unavailable.");try(FileOutputStream output=new FileOutputStream(new File(directory,name))){check(pixels.compress(Bitmap.CompressFormat.PNG,100,output),"Screenshot could not be written.");}finally{pixels.recycle();}}
    private void attachWidget(PortalWidgetHarnessActivity activity,AppWidgetHost host,int widgetId,int width,int height)throws Exception{
        AppWidgetManager manager=AppWidgetManager.getInstance(getTargetContext());Bundle options=new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,width);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height);options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,height);
        java.util.ArrayList<android.util.SizeF> sizes=new java.util.ArrayList<>();sizes.add(new android.util.SizeF(width,height));options.putParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES,sizes);
        manager.updateAppWidgetOptions(widgetId,options);
        runOnMainSync(()->{if(view!=null&&view.getParent()!=null)((android.view.ViewGroup)view.getParent()).removeView(view);view=host.createView(activity,widgetId,manager.getAppWidgetInfo(widgetId));activity.showWidget(view,width,height);view.updateAppWidget(PortalWidgetProvider.views(getTargetContext(),widgetId));});
        until(()->text(R.id.portal_title).equals("Baltimore"));waitForIdleSync();
    }
    private void visibleControls(int...ids){
        AtomicReference<String> failure=new AtomicReference<>();
        runOnMainSync(()->{Rect outer=new Rect();if(!view.getGlobalVisibleRect(outer)){failure.set("The widget is not visible.");return;}
            float density=view.getResources().getDisplayMetrics().density;
            for(int id:ids){View control=view.findViewById(id);Rect rect=new Rect();if(control==null||!control.isShown()||!control.getGlobalVisibleRect(rect)||rect.height()!=control.getHeight()||!outer.contains(rect)||rect.width()<44*density||rect.height()<48*density){failure.set("Clipped or undersized widget control: "+id);return;}}
        });check(failure.get()==null,failure.get());
    }
    private void completeText(int id){
        AtomicReference<String> failure=new AtomicReference<>();runOnMainSync(()->{TextView text=view.findViewById(id);android.text.Layout layout=text.getLayout();
            if(layout==null||layout.getLineCount()==0){failure.set("Missing widget text layout.");return;}
            for(int i=0;i<layout.getLineCount();i++)if(layout.getEllipsisCount(i)>0){failure.set("A required widget label or fact was truncated.");return;}
            if(layout.getLineBottom(layout.getLineCount()-1)>text.getHeight()-text.getPaddingTop()-text.getPaddingBottom())failure.set("A required widget label or fact was clipped vertically.");
        });check(failure.get()==null,failure.get());
    }
    private void fontScale(float scale)throws Exception{
        try(java.io.InputStream output=new android.os.ParcelFileDescriptor.AutoCloseInputStream(getUiAutomation().executeShellCommand("settings put system font_scale "+Float.toString(scale)))){output.readAllBytes();}
        until(()->Math.abs(getTargetContext().getResources().getConfiguration().fontScale-scale)<.01f);
    }
    @Override public void onStart(){
        Bundle result=new Bundle();int outcome=Activity.RESULT_CANCELED;AppWidgetHost host=null;PortalWidgetHarnessActivity activity=null;int widgetId=AppWidgetManager.INVALID_APPWIDGET_ID;SharedPreferences prefs=null;boolean owned=false,fontChanged=false;float originalFontScale=1;
        try{
            check(arguments!=null&&"true".equals(arguments.getString("ownedEmulator"))&&(Build.HARDWARE.contains("ranchu")||Build.HARDWARE.contains("goldfish")),"Use a fresh owned Android emulator.");
            Context context=getTargetContext();originalFontScale=context.getResources().getConfiguration().fontScale;prefs=context.getSharedPreferences("living-portal-v1",Context.MODE_PRIVATE);
            check(prefs.getAll().isEmpty()&&PortalWidgetProvider.ids(context).length==0,"Refusing to replace existing Portal data or widgets.");owned=true;
            result.putInt("account_contract_checks",PortalAccountContracts.run(context));
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
            step="save from actual widget";click(R.id.portal_save);until(()->store.trail(id).optBoolean("saved"));until(()->text(R.id.portal_save).equals(context.getString(R.string.portal_saved)));
            step="reveal first fact";
            click(R.id.portal_investigate);until(()->store.learning(currentId).equals(id));until(()->text(R.id.portal_body).equals(PortalStore.facts(place).get(0)));
            completeText(R.id.portal_body);visibleControls(R.id.portal_save,R.id.portal_investigate,R.id.portal_fact_next,R.id.portal_open);
            screenshot("widget-investigation.png");
            int count=PortalStore.facts(place).size();for(int i=1;i<count;i++){step="tap fact "+i+" of "+count;click(R.id.portal_fact_next);final int index=i;step="persist fact "+i+" of "+count;until(()->store.fact(currentId)==index);step="render fact "+i+" of "+count;until(()->text(R.id.portal_body).equals(PortalStore.facts(place).get(index)));waitForIdleSync();completeText(R.id.portal_body);}
            step="complete investigation from last fact";
            click(R.id.portal_fact_next);until(()->store.learning(currentId).isEmpty());check(store.trail(id).optLong("investigatedAt")>0,"The actual widget investigation did not persist.");check(store.trail(id).optLong("visitedAt")==0,"Investigation granted a game visit.");
            screenshot("widget-saved.png");result.putInt("host_interaction_checks",3);
            step="open containing Trail";ActivityMonitor monitor=addMonitor(PortalActivity.class.getName(),null,false);click(R.id.portal_trail);Activity trail=waitForMonitorWithTimeout(monitor,8000);removeMonitor(monitor);check(trail!=null,"Native Trail Activity did not open.");expectedWindow=trail;screenshot("native-trail.png");runOnMainSync(trail::finish);expectedWindow=activity;until(this::foreground);
            Activity account=startActivitySync(new Intent(context,PortalActivity.class).putExtra("section","account").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));expectedWindow=account;screenshot("native-account.png");runOnMainSync(account::finish);expectedWindow=activity;until(this::foreground);
            step="medium responsive composition";attachWidget(activity,host,widgetId,320,280);visibleControls(R.id.portal_save,R.id.portal_investigate,R.id.portal_open);completeText(R.id.portal_title);screenshot("widget-medium.png");
            ActivityMonitor readingMonitor=addMonitor(PortalActivity.class.getName(),null,false);click(R.id.portal_investigate);Activity reading=waitForMonitorWithTimeout(readingMonitor,8000);removeMonitor(readingMonitor);check(reading!=null,"Medium Investigate did not open the complete native page.");expectedWindow=reading;screenshot("native-medium-investigation.png");runOnMainSync(reading::finish);expectedWindow=activity;until(this::foreground);
            step="compact responsive composition";attachWidget(activity,host,widgetId,180,200);visibleControls(R.id.portal_save,R.id.portal_open);completeText(R.id.portal_title);screenshot("widget-compact.png");
            store.showFact(widgetId,id,0);android.app.PendingIntent previousNext=PortalWidgetProvider.action(context,widgetId,"next",id,300,440);
            runOnMainSync(activity::finish);fontChanged=true;fontScale(2f);
            activity=(PortalWidgetHarnessActivity)startActivitySync(new Intent(context,PortalWidgetHarnessActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));expectedWindow=activity;
            step="large system text and obsolete reading command";attachWidget(activity,host,widgetId,300,440);
            java.util.concurrent.CountDownLatch completed=new java.util.concurrent.CountDownLatch(1);previousNext.send(context,0,null,(pending,intent,code,data,extras)->completed.countDown(),null);
            check(completed.await(8,java.util.concurrent.TimeUnit.SECONDS),"The old reading command did not finish.");check(store.fact(widgetId)==0,"A clipped stale fact command advanced investigation.");
            visibleControls(R.id.portal_save,R.id.portal_investigate,R.id.portal_open);completeText(R.id.portal_title);check(text(R.id.portal_fact_next).isEmpty(),"Large text offered inline completion without full fact space.");screenshot("widget-large-system-text.png");
            step="medium system text";attachWidget(activity,host,widgetId,320,280);visibleControls(R.id.portal_save,R.id.portal_investigate,R.id.portal_open);completeText(R.id.portal_title);screenshot("widget-medium-system-text.png");
            step="compact system text";attachWidget(activity,host,widgetId,180,200);visibleControls(R.id.portal_save,R.id.portal_open);completeText(R.id.portal_title);screenshot("widget-compact-system-text.png");
            store.configure(widgetId,"together",id);check(store.suggestion(widgetId,System.currentTimeMillis())==null,"Together fabricated a daily destination.");
            store.configure(widgetId,"beyond",id);check(store.suggestion(widgetId,System.currentTimeMillis())==null,"Beyond Earth fabricated an Earth visit.");
            result.putInt("handoff_layout_checks",8);result.putString("scope","Actual Android emulator widget host and pending-intent interaction. Offline bundled content; no physical phone, account sync, native VR or live catalog acceptance.");
            result.putString("passed","true");outcome=Activity.RESULT_OK;
        }catch(Throwable error){
            result.putString("passed","false");result.putString("failure",error.toString());result.putString("failed_step",step);
            if(owned&&view!=null&&widgetId!=AppWidgetManager.INVALID_APPWIDGET_ID){PortalStore state=new PortalStore(getTargetContext());result.putInt("displayed_fact_index",state.fact(widgetId));result.putBoolean("learning_open",!state.learning(widgetId).isEmpty());result.putString("visible_fact",text(R.id.portal_body));}
            try{if(foreground())screenshot("widget-failure.png");}catch(Exception ignored){}
        }
        finally{
            if(fontChanged)try{fontScale(originalFontScale);}catch(Exception error){result.putString("font_restore_failure",error.toString());result.putString("passed","false");outcome=Activity.RESULT_CANCELED;}
            if(host!=null){host.stopListening();if(widgetId!=AppWidgetManager.INVALID_APPWIDGET_ID)host.deleteAppWidgetId(widgetId);}
            if(activity!=null){final Activity closing=activity;runOnMainSync(closing::finish);}
            if(owned&&prefs!=null)prefs.edit().clear().commit();
        }
        finish(outcome,result);
    }
}
