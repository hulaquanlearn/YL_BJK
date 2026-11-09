package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Handler;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Real Android consent, identity and navigation checks with no production accounts. */
final class FilingChecks {
    private final Instrumentation instrumentation;
    private int checks;
    FilingChecks(Instrumentation instrumentation) { this.instrumentation = instrumentation; }
    static void dismissOfflineDialog(Instrumentation instrumentation, Activity screen) {
        instrumentation.waitForIdleSync();
        // Only the isolated test bootstrap is being dismissed. The real negative
        // button exits the Activity, so never drive it via accessibility here.
        instrumentation.runOnMainSync(()->{
            try {
                java.lang.reflect.Field field=MainActivity.class.getDeclaredField("connectionFailure");field.setAccessible(true);
                AlertDialog offline=(AlertDialog)field.get(screen);
                if(offline!=null){offline.dismiss();field.set(screen,null);}
            }catch(ReflectiveOperationException failure){throw new AssertionError(failure);}
        });
        instrumentation.waitForIdleSync();
    }
    private void require(boolean condition) { if (!condition) throw new AssertionError("Filing check " + (checks + 1)); checks++; }
    private Object field(Object target, String name) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(target); }
    private boolean contains(View view, String value) {
        if (view instanceof TextView && ((TextView)view).getText().toString().contains(value)) return true;
        if (view instanceof ViewGroup) for (int i=0; i<((ViewGroup)view).getChildCount(); i++) if (contains(((ViewGroup)view).getChildAt(i), value)) return true;
        return false;
    }
    private View text(View view, String value) {
        if (view instanceof TextView && ((TextView)view).getText().toString().equals(value)) return view;
        if (view instanceof ViewGroup) for (int i=0; i<((ViewGroup)view).getChildCount(); i++) { View found=text(((ViewGroup)view).getChildAt(i),value); if(found!=null)return found; }
        return null;
    }
    private int countText(View view, String value) {
        int count=view instanceof TextView && value.contentEquals(((TextView)view).getText()) ? 1 : 0;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)count+=countText(((ViewGroup)view).getChildAt(i),value);
        return count;
    }
    private boolean inGroup(View view, String group, String entry) {
        if(!(view instanceof ViewGroup))return false;
        ViewGroup parent=(ViewGroup)view;
        for(int i=0;i<parent.getChildCount();i++){
            View child=parent.getChildAt(i);
            if(child instanceof TextView && group.contentEquals(((TextView)child).getText())){
                for(int j=i+1;j<parent.getChildCount();j++){
                    View next=parent.getChildAt(j);
                    if(next instanceof TextView)break;
                    if(text(next,entry)!=null)return true;
                }
            }
            if(inGroup(child,group,entry))return true;
        }
        return false;
    }
    private void clickEntry(View root,String label) {
        View entry=text(root,label);require(entry!=null);
        while(!entry.isClickable() && entry.getParent() instanceof View)entry=(View)entry.getParent();
        require(entry.isClickable());entry.performClick();
    }
    private void screenshot(String name) throws Exception {
        instrumentation.waitForIdleSync(); Thread.sleep(350);
        Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot(); require(bitmap!=null);
        File directory=new File(instrumentation.getTargetContext().getExternalFilesDir(null),"filing-qa"); require(directory.isDirectory()||directory.mkdirs());
        try(FileOutputStream stream=new FileOutputStream(new File(directory,name+".png"))){require(bitmap.compress(Bitmap.CompressFormat.PNG,100,stream));}finally{bitmap.recycle();}
    }
    int run() throws Exception {
        Context context=instrumentation.getTargetContext();
        android.app.NotificationManager retired=context.getSystemService(android.app.NotificationManager.class);
        for(String id:new String[]{"agv_repairs_sound_v1","agv_repairs_quiet_v1"})retired.createNotificationChannel(new android.app.NotificationChannel(id,"旧版隔离验证",android.app.NotificationManager.IMPORTANCE_DEFAULT));
        context.getSharedPreferences("agv-message-alerts",Context.MODE_PRIVATE).edit().putBoolean("fixture",true).commit();
        context.getSharedPreferences("MainActivity",Context.MODE_PRIVATE).edit().putString("server","https://filing-qa.invalid").commit();
        context.getSharedPreferences(AppInfo.PREFERENCES,Context.MODE_PRIVATE).edit().clear().commit();
        Activity first=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        require(retired.getNotificationChannel("agv_repairs_sound_v1")==null);
        require(retired.getNotificationChannel("agv_repairs_quiet_v1")==null);
        require(context.getSharedPreferences("agv-message-alerts",Context.MODE_PRIVATE).getAll().isEmpty());
        try {
            require(field(first,"web")==null); require(!AppInfo.accepted(context));
            AlertDialog consent=(AlertDialog)field(first,"privacyConsent"); require(consent.isShowing());
            require(contains(consent.getWindow().getDecorView(),"指定授权人员"));
            screenshot("01-consent");
            instrumentation.runOnMainSync(()->consent.getButton(AlertDialog.BUTTON_NEGATIVE).performClick());
            require(!AppInfo.accepted(context)); require(field(first,"web")==null);
        } finally { instrumentation.runOnMainSync(first::finish); }
        instrumentation.waitForIdleSync();
        Activity screen=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<AlertDialog> dialog=new AtomicReference<>();
        try {
            require(field(screen,"web")==null);
            AlertDialog consent=(AlertDialog)field(screen,"privacyConsent");
            instrumentation.runOnMainSync(()->consent.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(()->{
                try { WebView web=(WebView)field(screen,"web");web.setWebViewClient(new WebViewClient());web.stopLoading();((Handler)field(screen,"handler")).removeCallbacksAndMessages(null); }catch(Exception e){throw new RuntimeException(e);}
            });
            dismissOfflineDialog(instrumentation,screen);
            require(AppInfo.accepted(context)); require(field(screen,"web")!=null);
            require(context.getApplicationInfo().loadLabel(context.getPackageManager()).toString().equals("数字记录工具"));
            android.content.pm.PackageInfo installed=context.getPackageManager().getPackageInfo(context.getPackageName(),0);
            require(installed.versionName!=null && installed.versionName.matches("1\\.9\\.10-android\\.\\d+"));
            AppUpdater updater=(AppUpdater)field(screen,"updater");
            instrumentation.runOnMainSync(()->dialog.set(updater.show("https://filing-qa.invalid")));
            View updatePanel=dialog.get().getWindow().getDecorView();
            require(contains(updatePanel,AppInfo.FILING));require(contains(updatePanel,AppInfo.NAME));require(contains(updatePanel,installed.versionName));
            require(text(updatePanel,"隐私说明")!=null);require(text(updatePanel,"检查更新")!=null);
            android.content.IntentFilter filter=new android.content.IntentFilter(Intent.ACTION_VIEW);filter.addDataScheme("https");
            Instrumentation.ActivityMonitor browser=instrumentation.addMonitor(filter,null,true);
            instrumentation.runOnMainSync(()->updatePanel.findViewWithTag("update-filing").performClick());
            require(browser.getHits()==1);instrumentation.removeMonitor(browser);
            screenshot("02-update-panel");instrumentation.runOnMainSync(()->dialog.get().dismiss());
            instrumentation.runOnMainSync(()->dialog.set(AppInfo.showPrivacy(screen,true)));
            require(contains(dialog.get().getWindow().getDecorView(),"Android Keystore"));require(contains(dialog.get().getWindow().getDecorView(),"模型服务商"));
            screenshot("03-privacy");instrumentation.runOnMainSync(()->dialog.get().dismiss());
            final boolean[] navigated={false};
            instrumentation.runOnMainSync(()->{
                NativeHome home=new NativeHome(screen,new JSONObject(),new NativeHome.Actions(){public void navigate(String p,String t){}public void logout(){}public void updates(){navigated[0]=true;}});
                screen.setContentView(home);home.select(4);clickEntry(home,"检查更新");
                require(text(home,"个人资料")!=null);require(text(home,"关于与隐私")==null);require(text(home,"退出登录")!=null);
            });require(navigated[0]);
            instrumentation.runOnMainSync(()->{
                NativeLogin login=new NativeLogin(screen,"https://filing-qa.invalid",new CredentialVault(screen),(o,u,p)->new JSONObject(),d->{});screen.setContentView(login);
                require(!contains(login,"供本人及指定授权人员使用"));require(text(login,"隐私说明")!=null);require(text(login,"关于与隐私")==null);require(contains(login,AppInfo.FILING));require(!contains(login,"成功登录后加密保存"));require(!contains(login,"仅此手机"));login.close();
            });screenshot("04-login-isolated");
            View loginHeading=text(screen.getWindow().getDecorView(),"登录");android.graphics.Rect visible=new android.graphics.Rect();require(loginHeading!=null&&loginHeading.getGlobalVisibleRect(visible));require(visible.top<screen.getResources().getDisplayMetrics().heightPixels/2);
            JSONObject sample=new JSONObject("{\"name\":\"演示账号\",\"initial\":\"演\",\"role\":\"界面验证\",\"modules\":[{\"title\":\"备件管理\",\"path\":\"/inventory\",\"links\":[{\"label\":\"库存查询\",\"path\":\"/inventory\"},{\"label\":\"盘点管理\",\"path\":\"/check\"},{\"label\":\"3D库位\",\"path\":\"/warehouse-3d\"}]},{\"title\":\"工作管理\",\"path\":\"/raw-duties\",\"links\":[{\"label\":\"履职填报\",\"path\":\"/raw-duties\"},{\"label\":\"消防点检\",\"path\":\"/fire-inspection\"},{\"label\":\"设备模型展示\",\"path\":\"/agv-vehicles\"}]}]}");
            AtomicReference<NativeHome> workspace=new AtomicReference<>();
            AtomicReference<String> destination=new AtomicReference<>();
            instrumentation.runOnMainSync(()->{
                android.widget.LinearLayout root=new android.widget.LinearLayout(screen);root.setOrientation(1);root.setBackgroundColor(NativeHome.PAPER);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
                NativeHome home=new NativeHome(screen,sample,new NativeHome.Actions(){public void navigate(String p,String t){destination.set(p);}public void logout(){}});workspace.set(home);
                android.widget.LinearLayout nav=NativeHome.navigation(screen,sample,0,i->{});
                root.addView(home,new android.widget.LinearLayout.LayoutParams(-1,0,1));root.addView(nav);screen.setContentView(root);
                require(!contains(root,"连接设置"));require(!contains(root,"刷新功能目录"));
                require(inGroup(home,"工作管理","消防点检"));require(countText(home,"消防点检")==1);
                require(nav.getChildCount()==3);require(text(nav,"工作台")!=null);require(text(nav,"常用")!=null);require(text(nav,"我的")!=null);require(text(nav,"点检")==null);
                clickEntry(home,"消防点检");require("/fire-inspection".equals(destination.get()));
            });screenshot("05-workspace-isolated");
            instrumentation.runOnMainSync(()->{
                workspace.get().select(4);android.widget.LinearLayout parent=(android.widget.LinearLayout)workspace.get().getParent();parent.removeViewAt(1);parent.addView(NativeHome.navigation(screen,sample,4,i->workspace.get().select(i)));
                require(countText(workspace.get(),"检查更新")==1);require(contains(workspace.get(),"演示账号"));require(contains(workspace.get(),"界面验证"));
                require(text(workspace.get(),"个人资料")!=null);require(text(workspace.get(),"关于与隐私")==null);require(text(workspace.get(),"退出登录")!=null);
            });
            require(text(workspace.get(),"消息提醒")==null);
            screenshot("06-profile-isolated");
            JSONObject fireOnly=new JSONObject("{\"modules\":[{\"id\":\"work\",\"title\":\"工作管理\",\"path\":\"/fire-inspection\",\"enter\":\"消防点检\",\"links\":[{\"label\":\"消防点检\",\"path\":\"/fire-inspection\"}]}]}");
            JSONObject noFire=new JSONObject("{\"modules\":[{\"id\":\"spare\",\"title\":\"备件管理\",\"path\":\"/inventory\",\"links\":[{\"label\":\"库存查询\",\"path\":\"/inventory\"}]}]}");
            instrumentation.runOnMainSync(()->{
                NativeHome home=new NativeHome(screen,fireOnly,new NativeHome.Actions(){public void navigate(String p,String t){destination.set(p);}public void logout(){}});
                require(inGroup(home,"工作管理","消防点检"));require(countText(home,"消防点检")==1);require(text(home,"履职填报")==null);
                destination.set(null);clickEntry(home,"消防点检");require("/fire-inspection".equals(destination.get()));
                NativeHome restricted=new NativeHome(screen,noFire,new NativeHome.Actions(){public void navigate(String p,String t){}public void logout(){}});
                require(text(restricted,"消防点检")==null);require(text(restricted,"库存查询")!=null);
                require(NativeHome.navigation(screen,noFire,0,i->{}).getChildCount()==3);
            });
            instrumentation.runOnMainSync(()->dialog.set(AppInfo.showPrivacy(screen,true)));
            instrumentation.runOnMainSync(()->dialog.get().getButton(AlertDialog.BUTTON_NEGATIVE).performClick());instrumentation.waitForIdleSync();require(!AppInfo.accepted(context));
        } finally {
            instrumentation.runOnMainSync(()->{if(dialog.get()!=null)dialog.get().dismiss();screen.finish();});
        }
        return checks;
    }
}
