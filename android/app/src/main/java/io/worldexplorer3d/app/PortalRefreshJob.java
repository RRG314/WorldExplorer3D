package io.worldexplorer3d.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Android owns when background work may run. No timers, foreground service,
 * continuous GPS or connection; failed refresh retains the last-good catalog. */
public final class PortalRefreshJob extends JobService {
    private static final int JOB_ID=60251;
    private volatile int generation;
    private PortalStore activeStore;
    private Thread worker;
    static void schedule(Context context){
        JobScheduler scheduler=context.getSystemService(JobScheduler.class);
        if(scheduler!=null&&scheduler.getPendingJob(JOB_ID)==null)scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(context,PortalRefreshJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build());
    }
    @Override public boolean onStartJob(JobParameters params){
        final int request; synchronized(PortalStore.LOCK){request=++generation;}
        final PortalStore store=new PortalStore(this);activeStore=store;
        worker=new Thread(()->{store.refresh(()->generation==request);if(generation==request){
            PortalWidgetProvider.updateAll(this);
            if(store.owner().equals("device-guest"))jobFinished(params,false);
            else PortalAccount.get(this).sync(()->generation==request,()->{if(generation==request){boolean retry=false;try{for(org.json.JSONObject row:store.entries(store.owner()))if(row.getJSONObject("pending").length()>0)retry=true;}catch(Exception ignored){retry=true;}jobFinished(params,retry);}});
        }},"living-portal-refresh");worker.start();return true;
    }
    @Override public boolean onStopJob(JobParameters params){synchronized(PortalStore.LOCK){generation++;}if(activeStore!=null)activeStore.cancelRefresh();if(worker!=null)worker.interrupt();activeStore=null;worker=null;return false;}
}
