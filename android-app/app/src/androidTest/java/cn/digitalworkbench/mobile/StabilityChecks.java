package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Local intercepted AGV-like documents and actual emulator IME; no production API. */
final class StabilityChecks {
    private final Instrumentation test;
    private int checks;
    private String step="setup";
    StabilityChecks(Instrumentation test){this.test=test;}
    private void require(boolean yes){if(!yes)throw new AssertionError(step+" check "+(checks+1));checks++;}
    private Object field(Object object,String name)throws Exception{java.lang.reflect.Field f=object.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(object);}
    private void ui(Runnable action){test.runOnMainSync(action);}
    private void invoke(Activity screen,String name,Class<?>[] types,Object...args)throws Exception{
        AtomicReference<Throwable> error=new AtomicReference<>();ui(()->{try{java.lang.reflect.Method m=MainActivity.class.getDeclaredMethod(name,types);m.setAccessible(true);m.invoke(screen,args);}catch(Throwable e){error.set(e);}});if(error.get()!=null)throw new AssertionError(step,error.get());
    }
    private interface Condition{boolean ready()throws Exception;}
    private void await(Condition condition)throws Exception{
        for(int i=0;i<200;i++){AtomicReference<Boolean> ready=new AtomicReference<>(false);AtomicReference<Throwable> error=new AtomicReference<>();ui(()->{try{ready.set(condition.ready());}catch(Throwable e){error.set(e);}});if(error.get()!=null)throw new AssertionError(step,error.get());if(ready.get())return;Thread.sleep(25);}throw new AssertionError(step+" timed out");
    }
    private String evaluate(WebView web,String js)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();ui(()->web.evaluateJavascript(js,r->{value.set(r);done.countDown();}));if(!done.await(5,TimeUnit.SECONDS))throw new AssertionError(step+" JS timeout");return value.get();
    }
    private void navigate(Activity screen,String path)throws Exception{invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},path,"设备模型展示",0);}
    int run()throws Exception{
        Activity screen=test.startActivitySync(new Intent(test.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            invoke(screen,"open",new Class<?>[]{String.class},"https://native-stability-qa.invalid");
            WebView web=(WebView)field(screen,"web");CountDownLatch loaded=new CountDownLatch(1);String html="<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0;padding:20px}input{width:90%;height:52px;font-size:18px}</style><h2>隔离AGV表单</h2><input id=vehicle aria-label='AGV车号' inputmode=numeric><script>window.__mode='pending';window.__WORKBENCH_MOBILE__={version:1,page:location.pathname,accountId:'stability-qa',name:'隔离测试',initial:'验',role:'验证',modules:[{id:'work',title:'工作管理',path:'/agv-vehicles',links:[{label:'设备模型展示',path:'/agv-vehicles'}]}]};window.__WORKBENCH_NAVIGATE__=p=>{if(window.__mode==='pending')return new Promise(()=>{});history.replaceState(null,'',p);window.__WORKBENCH_MOBILE__.page=p;return Promise.resolve(true)};</script>";
            ui(()->{try{((Handler)field(screen,"handler")).removeCallbacksAndMessages(null);}catch(Exception e){throw new AssertionError(e);}WebViewClient original=web.getWebViewClient();web.setWebViewClient(new WebViewClient(){
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v,android.webkit.WebResourceRequest r){return new android.webkit.WebResourceResponse("text/html","UTF-8",new java.io.ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));}
                @Override public void onPageFinished(WebView v,String url){original.onPageFinished(v,url);loaded.countDown();}
                @Override public boolean onRenderProcessGone(WebView v,android.webkit.RenderProcessGoneDetail detail){return original.onRenderProcessGone(v,detail);}
            });web.loadUrl("https://native-stability-qa.invalid/portal");});
            require(loaded.await(6,TimeUnit.SECONDS));await(()->field(screen,"home")!=null);require(!screen.isFinishing());
            step="pending-route-return";navigate(screen,"/agv-vehicles");await(()->(Boolean)field(screen,"navigating"));Object home=field(screen,"home");ui(screen::onBackPressed);
            require(!(Boolean)field(screen,"navigating"));require(field(screen,"home")==home);require(!screen.isFinishing());
            step="pending-system-back";navigate(screen,"/agv-vehicles");await(()->(Boolean)field(screen,"navigating"));test.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);test.waitForIdleSync();require(!(Boolean)field(screen,"navigating"));require(!screen.isFinishing());
            step="repeat-business-navigation";evaluate(web,"window.__mode='complete';true");
            for(int i=0;i<4;i++){navigate(screen,"/agv-vehicles");await(()->!(Boolean)field(screen,"navigating")&&web.getVisibility()==View.VISIBLE);require(((View)field(screen,"navigation")).getVisibility()==View.VISIBLE);require("\"/agv-vehicles\"".equals(evaluate(web,"location.pathname")));navigate(screen,"/portal");await(()->!(Boolean)field(screen,"navigating")&&field(screen,"home")!=null);require(!screen.isFinishing());}
            navigate(screen,"/agv-vehicles");await(()->!(Boolean)field(screen,"navigating")&&web.getVisibility()==View.VISIBLE);
            step="actual-ime-navigation";JSONArray hit=new JSONArray(evaluate(web,"(()=>{const r=document.getElementById('vehicle').getBoundingClientRect();return [(r.x+r.width/2)/innerWidth,(r.y+r.height/2)/innerHeight]})()"));int[] position=new int[2];ui(()->web.getLocationOnScreen(position));float x=position[0]+(float)hit.getDouble(0)*web.getWidth(),y=position[1]+(float)hit.getDouble(1)*web.getHeight();long time=SystemClock.uptimeMillis();test.sendPointerSync(MotionEvent.obtain(time,time,MotionEvent.ACTION_DOWN,x,y,0));test.sendPointerSync(MotionEvent.obtain(time,time+40,MotionEvent.ACTION_UP,x,y,0));
            await(()->(Boolean)field(screen,"keyboardVisible"));require(((View)field(screen,"navigation")).getVisibility()==View.GONE);require("\"vehicle\"".equals(evaluate(web,"document.activeElement.id")));
            ui(()->((InputMethodManager)screen.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0));await(()->!(Boolean)field(screen,"keyboardVisible"));require(((View)field(screen,"navigation")).getVisibility()==View.VISIBLE);
            step="independent-native-timeout";evaluate(web,"window.__mode='pending';true");navigate(screen,"/portal");await(()->(Boolean)field(screen,"navigating"));ui(()->{try{((Runnable)field(screen,"navigationTimeout")).run();}catch(Exception e){throw new AssertionError(e);}});require(!(Boolean)field(screen,"navigating"));require(!screen.isFinishing());
            step="renderer-stall-recovery";
            if(android.os.Build.VERSION.SDK_INT>=29){
                ui(()->web.getWebViewRenderProcessClient().onRenderProcessUnresponsive(web,web.getWebViewRenderProcess()));require(field(screen,"rendererFailure")!=null);require(!(Boolean)field(screen,"navigating"));
                ui(()->web.getWebViewRenderProcessClient().onRenderProcessResponsive(web,web.getWebViewRenderProcess()));require(field(screen,"rendererFailure")==null);require(!screen.isFinishing());
            }
            step="renderer-exit-recovery";
            if(android.os.Build.VERSION.SDK_INT>=29)ui(()->web.getWebViewRenderProcessClient().onRenderProcessUnresponsive(web,web.getWebViewRenderProcess()));
            android.app.AlertDialog previous=(android.app.AlertDialog)field(screen,"rendererFailure");
            AtomicReference<Boolean> handled=new AtomicReference<>(false);ui(()->handled.set(web.getWebViewClient().onRenderProcessGone(web,null)));require(handled.get());require(field(screen,"web")==null);require(field(screen,"rendererFailure")!=null);require(!screen.isFinishing());if(previous!=null)require(!previous.isShowing());
            return checks;
        }finally{ui(screen::finish);}
    }
}
