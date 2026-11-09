package cn.digitalworkbench.mobile;
import android.app.*;
import android.content.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.concurrent.atomic.*;
final class LoginLayoutChecks {
 private final Instrumentation test;LoginLayoutChecks(Instrumentation value){test=value;}
 int run() throws Exception {
  Activity activity=test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));AtomicReference<NativeLogin> reference=new AtomicReference<>();
  try {test.runOnMainSync(()->{NativeLogin login=new NativeLogin(activity,"https://login-layout.invalid",new CredentialVault(activity),(o,u,p)->{throw new IOException("isolated layout fixture");},data->{});activity.setContentView(login);reference.set(login);});test.waitForIdleSync();Thread.sleep(300);
  NativeLogin login=reference.get();for(String tag:new String[]{"login-username","login-password","login-remember","login-submit","login-privacy"})if(login.findViewWithTag(tag)==null)throw new AssertionError("Missing "+tag);
  if(login.findViewWithTag("login-updates")!=null)throw new AssertionError("Login update entry must be removed");
  View privacy=login.findViewWithTag("login-privacy"),submit=login.findViewWithTag("login-submit");if(privacy.getParent()!=submit.getParent())throw new AssertionError("Privacy must remain in login card");
  File screenshot=new File(test.getTargetContext().getExternalFilesDir(null),"login-layout.png");try(FileOutputStream out=new FileOutputStream(screenshot)){test.getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}return 6;
  }finally{test.runOnMainSync(()->{if(reference.get()!=null)reference.get().close();activity.finish();});}
 }
}
