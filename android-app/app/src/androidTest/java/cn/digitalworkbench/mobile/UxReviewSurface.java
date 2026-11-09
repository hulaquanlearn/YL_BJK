package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Handler;
import android.widget.LinearLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.File;
import java.util.concurrent.atomic.AtomicReference;

/** Manual review of real native components, with synthetic identity and no business writes. */
final class UxReviewSurface {
 static int run(Instrumentation test, String marker) throws Exception {
  Activity screen=test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  File done=new File(test.getTargetContext().getExternalFilesDir(null),marker);
  AtomicReference<NativeHome> home=new AtomicReference<>();
  JSONObject data=new JSONObject("{\"name\":\"本地审查账号\",\"initial\":\"审\",\"role\":\"系统管理员 · 合成数据\",\"modules\":[{\"id\":\"spare\",\"title\":\"备件管理\",\"path\":\"/inventory\",\"links\":[{\"label\":\"库存查询\",\"path\":\"/inventory\"},{\"label\":\"3D库位\",\"path\":\"/warehouse-3d\"},{\"label\":\"盘点管理\",\"path\":\"/check\"}]},{\"id\":\"knowledge\",\"title\":\"智能工程\",\"path\":\"/knowledge\",\"links\":[{\"label\":\"工程知识库\",\"path\":\"/knowledge\"},{\"label\":\"机器人程序助手\",\"path\":\"/robot-program\"}]},{\"id\":\"work\",\"title\":\"工作管理\",\"path\":\"/agv-vehicles\",\"links\":[{\"label\":\"设备模型展示\",\"path\":\"/agv-vehicles\"},{\"label\":\"设备模型展示\",\"path\":\"/agv-vehicles\"},{\"label\":\"消防点检\",\"path\":\"/fire-inspection\"}]}]}");
  try {
   test.runOnMainSync(()->{try{
    java.lang.reflect.Field handler=MainActivity.class.getDeclaredField("handler");handler.setAccessible(true);((Handler)handler.get(screen)).removeCallbacksAndMessages(null);
    java.lang.reflect.Field web=MainActivity.class.getDeclaredField("web");web.setAccessible(true);((android.webkit.WebView)web.get(screen)).stopLoading();
    LinearLayout root=new LinearLayout(screen);root.setOrientation(LinearLayout.VERTICAL);root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
    NativeHome.Session session=new NativeHome.Session();session.bind("isolated-ux-review");
    NativeHome view=new NativeHome(screen,data,new NativeHome.Actions(){public void navigate(String p,String t){Toast.makeText(screen,"本地原生布局审查："+t,Toast.LENGTH_SHORT).show();}public void logout(){}},session,0);home.set(view);
    java.util.function.IntConsumer[] select=new java.util.function.IntConsumer[1];select[0]=index->{view.select(index);if(root.getChildCount()>1)root.removeViewAt(1);root.addView(NativeHome.navigation(screen,data,index,select[0]));};root.addView(view,new LinearLayout.LayoutParams(-1,0,1));select[0].accept(0);screen.setContentView(root);
   }catch(Exception e){throw new RuntimeException(e);}});
   long end=System.currentTimeMillis()+300000;
   while(!done.exists()&&System.currentTimeMillis()<end)Thread.sleep(250);
   return 1;
  }finally{test.runOnMainSync(screen::finish);}
 }
}
