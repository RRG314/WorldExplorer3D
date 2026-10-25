package io.worldexplorer3d.app;
import android.app.Activity;
import android.appwidget.AppWidgetHostView;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;
public final class PortalWidgetHarnessActivity extends Activity {
    private LinearLayout root;
    @Override public void onCreate(Bundle state){super.onCreate(state);root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(24,48,24,24);root.setBackgroundColor(0xff071423);setContentView(root);
        TextView label=new TextView(this);label.setText("Native Android widget · owned emulator verification");label.setTextColor(0xffb7cbdf);label.setTextSize(16);root.addView(label);}
    void showWidget(AppWidgetHostView view,int width,int height){if(view.getParent()!=null)((android.view.ViewGroup)view.getParent()).removeView(view);root.addView(view,new LinearLayout.LayoutParams(Math.round(width*getResources().getDisplayMetrics().density),Math.round(height*getResources().getDisplayMetrics().density)));}
}
