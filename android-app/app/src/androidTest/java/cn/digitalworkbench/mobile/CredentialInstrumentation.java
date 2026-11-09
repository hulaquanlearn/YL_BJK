package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.widget.*;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Separate signed test APK; no accounts, production writes or real passwords are used. */
public final class CredentialInstrumentation extends Instrumentation {
    private Bundle arguments;
    private final String origin = "https://remember-qa.invalid", other = "https://other-remember-qa.invalid";
    private final String username = "isolated-ui-account", password = "isolated-test-only-credential";
    private int checks;
    private String diagnostic = "";
    @Override public void onCreate(Bundle args) { arguments = args; start(); }
    private void require(boolean value) { if (!value) throw new AssertionError("Credential check " + (checks + 1) + " failed"); checks++; }
    @Override public void onStart() {
        Bundle result = new Bundle(); Activity activity = null; NativeLogin view = null;
        CredentialVault vault = new CredentialVault(getTargetContext()); String phase = arguments == null ? "all" : arguments.getString("phase", "all");
        try {
            if (!"filing".equals(phase)) {
                AppInfo.accept(getTargetContext());
                getTargetContext().getSharedPreferences("MainActivity", Context.MODE_PRIVATE).edit().putString("server", "https://instrumentation-qa.invalid").commit();
            }
            if ("ux-review".equals(phase)) {
                checks += UxReviewSurface.run(this, "ux-review-finished-20261029");
            } else if ("login-layout".equals(phase)) {
                checks += new LoginLayoutChecks(this).run();
            } else if ("stability".equals(phase)) {
                checks += new StabilityChecks(this).run();
            } else if ("filing".equals(phase)) {
                checks += new FilingChecks(this).run();
            } else if ("startup".equals(phase)) {
                checks += new StartupChecks(this).run();
            } else if ("updates".equals(phase)) {
                checks += new UpdateChecks(this).run();

            } else if ("icons".equals(phase)) {
                checks += NativeIconChecks.run(this);
            } else if ("favorites".equals(phase)) {
                checks += new FavoritesChecks(this).run();
            } else if ("fire".equals(phase)) {
                checks += new FireToolsChecks(this).run();
            } else if ("handoff".equals(phase)) {
                activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                verifySessionHandoff(activity, vault);
            } else if ("navigation".equals(phase)) {
                activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                verifyNavigationContract(activity);
            } else if ("write".equals(phase)) {
                vault.save(origin, username, password); require(vault.read(origin) != null); requireEncrypted();
            } else if ("readAndClear".equals(phase)) {
                require(password.equals(vault.read(origin).getString("password"))); requireEncrypted(); vault.clear(origin); require(vault.read(origin) == null);
            } else {
                vault.clear(origin); vault.clear(other);
                require(NativeAuth.validOrigin("https://czsdsg.cn")); require(!NativeAuth.validOrigin("http://czsdsg.cn")); require(!NativeAuth.validOrigin("https://name:secret@czsdsg.cn")); require(!NativeAuth.validOrigin("https://czsdsg.cn/path"));
                require(!NativeAuth.validOrigin("https://czsdsg.cn:99999"));
                JSONObject data = NativeAuth.validate(new JSONObject().put("success", true).put("data", data())); require(data.getJSONObject("user").getString("username").equals(username));
                boolean rejected = false; try { NativeAuth.validate(new JSONObject().put("success", true).put("data", new JSONObject().put("token", "invalid").put("user", data.getJSONObject("user")))); } catch (Exception expected) { rejected = true; } require(rejected);
                vault.save(origin, username, password); require(password.equals(vault.read(origin).getString("password"))); require(vault.read(other) == null); requireEncrypted();
                vault.save(other, "second-qa-account", "second-test-only-credential"); require(!vault.read(other).getString("password").equals(password));
                SharedPreferences preferences = getTargetContext().getSharedPreferences(CredentialVault.PREFERENCES, Context.MODE_PRIVATE);
                String cipher = preferences.getString(CredentialVault.slot(origin), null); JSONObject tampered = new JSONObject(cipher).put("iv", "AAAAAAAAAAAAAAAA"); preferences.edit().putString(CredentialVault.slot(origin), tampered.toString()).commit(); require(vault.read(origin) == null); require(vault.read(other) != null); vault.clear(other);
                activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); Activity screen = activity;
                // Stop periodic portal inspection in this isolated UI test only.
                java.lang.reflect.Field field = MainActivity.class.getDeclaredField("handler"); field.setAccessible(true); Handler handler = (Handler) field.get(activity); runOnMainSync(() -> handler.removeCallbacksAndMessages(null));
                CountDownLatch success = new CountDownLatch(1); AtomicReference<NativeLogin> holder = new AtomicReference<>();
                runOnMainSync(() -> { NativeLogin login = new NativeLogin(screen, origin, vault, (o,u,p) -> data(), d -> success.countDown()); holder.set(login); screen.setContentView(login); });
                view = holder.get(); NativeLogin login = view;
                runOnMainSync(() -> { EditText user = login.findViewWithTag("login-username"), secret = login.findViewWithTag("login-password"); CheckBox remember = login.findViewWithTag("login-remember"); require(!remember.isChecked()); user.setText(username); secret.setText(password); remember.setChecked(true); login.findViewWithTag("login-submit").performClick(); });
                require(success.await(12, TimeUnit.SECONDS)); require(password.equals(vault.read(origin).getString("password"))); requireEncrypted(); runOnMainSync(login::close);
                runOnMainSync(() -> { NativeLogin restored = new NativeLogin(screen, origin, vault, (o,u,p) -> { throw new java.io.IOException("用户名或密码不正确，或账号不可用。"); }, d -> { throw new AssertionError("Failed login must not succeed"); }); holder.set(restored); screen.setContentView(restored); });
                view = holder.get(); NativeLogin restored = view;
                runOnMainSync(() -> { EditText user = restored.findViewWithTag("login-username"), secret = restored.findViewWithTag("login-password"); CheckBox remember = restored.findViewWithTag("login-remember"); require(username.equals(user.getText().toString())); require(password.equals(secret.getText().toString())); require(remember.isChecked()); secret.setText("wrong-test-only-credential"); restored.findViewWithTag("login-submit").performClick(); });
                for (int i = 0; i < 100; i++) { AtomicReference<Boolean> busy = new AtomicReference<>(); runOnMainSync(() -> busy.set(restored.isBusy())); if (!busy.get()) break; Thread.sleep(30); }
                require(password.equals(vault.read(origin).getString("password")));
                runOnMainSync(() -> { CheckBox remember = restored.findViewWithTag("login-remember"); remember.setChecked(false); }); require(vault.read(origin) == null);
                runOnMainSync(() -> { restored.cleared(); require(((EditText)restored.findViewWithTag("login-password")).getText().length() == 0); require(!((CheckBox)restored.findViewWithTag("login-remember")).isChecked()); });
                verifySessionHandoff(screen, vault);
            }
            result.putString("stream", "Credential checks passed: " + checks + "; phase=" + phase + "\n"); finish(Activity.RESULT_OK, result);
        } catch (Throwable ignored) { result.putString("stream", "Credential checks failed after " + checks + "; phase=" + phase + "; fixture=" + diagnostic + "; error=" + ignored.getClass().getSimpleName() + (("navigation".equals(phase) || "fire".equals(phase) || "stability".equals(phase)) ? "; detail=" + ignored.getMessage() : "") + "\n"); finish(Activity.RESULT_CANCELED, result); }
        finally { if (!"write".equals(phase)) try { vault.clear(origin); vault.clear(other); } catch (Exception ignored) {} if (view != null) { NativeLogin current = view; runOnMainSync(current::close); } if (activity != null) { Activity current = activity; runOnMainSync(current::finish); } }
    }
    private JSONObject data() throws Exception { return new JSONObject().put("token", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").put("user", new JSONObject().put("id", 1).put("username", username).put("role", "viewer")); }
    private void requireEncrypted() throws Exception { String value = getTargetContext().getSharedPreferences(CredentialVault.PREFERENCES, Context.MODE_PRIVATE).getString(CredentialVault.slot(origin), ""); require(!value.contains(username) && !value.contains(password)); require(new JSONObject(value).has("ciphertext")); }
    private Object field(Object target, String name) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(target); }
    private void set(Object target, String name, Object value) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); f.set(target, value); }
    private void verifySessionHandoff(Activity screen, CredentialVault vault) throws Exception {
        String site = "https://session-qa.invalid"; vault.clear(site);
        AtomicReference<android.webkit.WebView> fixture = new AtomicReference<>();
        java.util.concurrent.atomic.AtomicBoolean holdInspection = new java.util.concurrent.atomic.AtomicBoolean();
        AtomicReference<android.webkit.ValueCallback<String>> staleInspection = new AtomicReference<>();
        runOnMainSync(() -> { try {
            android.webkit.WebView original = (android.webkit.WebView)field(screen,"web"); original.stopLoading();
            android.view.ViewGroup content = (android.view.ViewGroup)field(screen,"content"); content.removeView(original);
            android.webkit.WebView replacement = new android.webkit.WebView(screen) {
                @Override public void evaluateJavascript(String script, android.webkit.ValueCallback<String> callback) {
                    if (script.contains("try{const s=window.__WORKBENCH_MOBILE__") && holdInspection.compareAndSet(true,false)) { staleInspection.set(callback); return; }
                    // Reproduce engines that discard the JS result callback when that script navigates the document.
                    super.evaluateJavascript(script, script.contains("location.replace(") ? null : callback);
                }
            };
            replacement.getSettings().setJavaScriptEnabled(true); replacement.getSettings().setDomStorageEnabled(true);
            content.addView(replacement,new android.widget.FrameLayout.LayoutParams(-1,-1)); set(screen,"web",replacement);fixture.set(replacement);original.destroy();
        } catch(Exception e) { throw new RuntimeException(e); }});
        android.webkit.WebView web = fixture.get(); CountDownLatch loaded = new CountDownLatch(1), portal = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        runOnMainSync(() -> { try {
            NativeLogin existing = (NativeLogin) field(screen, "loginView"); if (existing != null) { existing.close(); ((android.view.ViewGroup)existing.getParent()).removeView(existing); set(screen, "loginView", null); }
            set(screen, "origin", site); set(screen, "home", null); screen.setContentView((android.view.View)field(screen, "root")); web.stopLoading();
            web.setWebViewClient(new android.webkit.WebViewClient(){
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView v, android.webkit.WebResourceRequest request) {
                    String html = "<html><body><div class='workbench'><article class='module-card'><h2>合成权限验证</h2><p>不连接生产数据</p><a class='module-enter' href='/inventory'>进入</a></article></div></body></html>";
                    return new android.webkit.WebResourceResponse("text/html", "UTF-8", new java.io.ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                }
                @Override public void onPageFinished(android.webkit.WebView v, String url) { if (url.endsWith("/portal")) portal.countDown(); else loaded.countDown(); }
            }); web.loadUrl(site + "/login");
        } catch(Throwable e) { failure.set(e); }}); require(failure.get()==null); require(loaded.await(8,TimeUnit.SECONDS));
        runOnMainSync(() -> { try {
            ((Handler)field(screen,"handler")).removeCallbacksAndMessages(null);set(screen,"inspecting",false);
            holdInspection.set(true);java.lang.reflect.Method inspect=MainActivity.class.getDeclaredMethod("inspectWorkspace");inspect.setAccessible(true);inspect.invoke(screen);
            java.lang.reflect.Method show=MainActivity.class.getDeclaredMethod("showLogin");show.setAccessible(true);show.invoke(screen);
        } catch(Throwable e) { failure.set(e); }}); require(failure.get()==null);require(staleInspection.get()!=null);
        NativeLogin form=(NativeLogin)field(screen,"loginView");require(form!=null);java.util.concurrent.atomic.AtomicBoolean called=new java.util.concurrent.atomic.AtomicBoolean();set(form,"client",(NativeAuth.Client)(o,u,p)->{called.set(true);return data();});NativeLogin.Actions callback=(NativeLogin.Actions)field(form,"actions");
        runOnMainSync(() -> { ((EditText)form.findViewWithTag("login-username")).setText(username);((EditText)form.findViewWithTag("login-password")).setText(password);form.findViewWithTag("login-submit").performClick(); });
        boolean arrived=portal.await(10,TimeUnit.SECONDS); CountDownLatch probe=new CountDownLatch(1);runOnMainSync(()->web.evaluateJavascript("({url:location.href,origin:location.origin,path:location.pathname,token:!!localStorage.getItem('spare_parts_auth_token')})",v->{try{diagnostic=v+"; called="+called.get()+"; busy="+form.isBusy()+"; view="+(field(screen,"loginView")!=null)+"; sameView="+(field(screen,"loginView")==form)+"; closed="+field(form,"closed")+"; message="+((TextView)form.findViewWithTag("login-message")).getText();}catch(Exception ignored){}probe.countDown();}));probe.await(3,TimeUnit.SECONDS);require(arrived);require(field(screen,"loginView")==form);require(form.isBusy());require(web.getVisibility()==android.view.View.GONE); CountDownLatch read=new CountDownLatch(1);AtomicReference<String> session=new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript("(()=>({hasToken:!!localStorage.getItem('spare_parts_auth_token'),role:JSON.parse(localStorage.getItem('spare_parts_auth_user')).role,passwordStored:!!localStorage.getItem('password')}))()",v->{session.set(v);read.countDown();}));require(read.await(5,TimeUnit.SECONDS));JSONObject state=new JSONObject(session.get());require(state.getBoolean("hasToken"));require(state.getString("role").equals("viewer"));require(!state.getBoolean("passwordStored"));
        runOnMainSync(() -> staleInspection.get().onReceiveValue("{\"page\":\"/login\"}"));require(field(screen,"loginView")==form);
        runOnMainSync(() -> {try{set(screen,"inspecting",false);java.lang.reflect.Method inspect=MainActivity.class.getDeclaredMethod("inspectWorkspace");inspect.setAccessible(true);inspect.invoke(screen);}catch(Throwable e){failure.set(e);}});require(failure.get()==null);
        for(int i=0;i<100;i++){AtomicReference<Boolean> present=new AtomicReference<>(false);runOnMainSync(()->{try{present.set(field(screen,"home")!=null);}catch(Exception ignored){}});if(present.get())break;Thread.sleep(30);}require(field(screen,"home")!=null);require(field(screen,"loginView")==null);require(web.getVisibility()==android.view.View.GONE);
        CountDownLatch otherLoaded=new CountDownLatch(1);runOnMainSync(()->{web.setWebViewClient(new android.webkit.WebViewClient(){@Override public void onPageFinished(android.webkit.WebView v,String url){otherLoaded.countDown();}});web.loadDataWithBaseURL("https://cross-session-qa.invalid/login","<html></html>","text/html","UTF-8","https://cross-session-qa.invalid/login");});require(otherLoaded.await(8,TimeUnit.SECONDS));
        CountDownLatch guarded=new CountDownLatch(1);AtomicReference<String> notCopied=new AtomicReference<>();runOnMainSync(()->{try{callback.signedIn(data());web.evaluateJavascript("localStorage.getItem('spare_parts_auth_token')===null",v->{notCopied.set(v);guarded.countDown();});}catch(Exception e){failure.set(e);}});require(guarded.await(5,TimeUnit.SECONDS));require("true".equals(notCopied.get()));vault.clear(site);
    }

    private interface UiCheck { boolean value() throws Exception; }
    private void awaitUi(UiCheck check) throws Exception {
        for (int i=0;i<160;i++) {
            AtomicReference<Boolean> ready=new AtomicReference<>(false); AtomicReference<Throwable> error=new AtomicReference<>();
            runOnMainSync(()->{try{ready.set(check.value());}catch(Throwable e){error.set(e);}});
            if(error.get()!=null)throw new AssertionError(error.get()); if(ready.get())return; Thread.sleep(25);
        }
        throw new AssertionError("Timed out during "+diagnostic);
    }
    private void invoke(Activity screen,String name,Class<?>[] signature,Object... args) throws Exception {
        AtomicReference<Throwable> failure=new AtomicReference<>();
        runOnMainSync(()->{try{java.lang.reflect.Method method=MainActivity.class.getDeclaredMethod(name,signature);method.setAccessible(true);method.invoke(screen,args);}catch(Throwable error){failure.set(error);}});
        if(failure.get()!=null)throw new AssertionError(failure.get());
    }
    private String evaluate(android.webkit.WebView web,String source) throws Exception {
        CountDownLatch finished=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        runOnMainSync(()->web.evaluateJavascript(source,value->{result.set(value);finished.countDown();}));
        if(!finished.await(8,TimeUnit.SECONDS))throw new AssertionError("JavaScript timed out during "+diagnostic);return result.get();
    }
    /** Contract-only fixture has deliberately conflicting DOM and no login token or remote assets. */
    private void verifyNavigationContract(Activity screen) throws Exception {
        diagnostic="navigation-fixture";String site="https://mobile-navigation-qa.invalid";
        android.webkit.WebView web=(android.webkit.WebView)field(screen,"web");Handler timer=(Handler)field(screen,"handler");
        CountDownLatch loaded=new CountDownLatch(1);AtomicReference<Throwable> failure=new AtomicReference<>();
        String html="<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body>"
            +"<div class='workbench'><article class='module-card'><h2>错误的旧DOM目录</h2><p>应忽略</p><a class='module-enter' href='/retired-never-open'>旧入口</a></article></div>"
            +"<script>window.__WORKBENCH_MOBILE__={version:1,page:'/inventory',accountId:'contract-qa-1',name:'合成账号',initial:'测',role:'隔离验证',modules:["
            +"{id:'spare',title:'契约备件目录',description:'只验证导航',path:'/inventory',enter:'库存查询',links:[{label:'库存查询',path:'/inventory'},{label:'3D库位',path:'/warehouse-3d'}]},"
            +"{id:'work',title:'工作管理',description:'只验证导航',path:'/raw-duties',enter:'履职',links:[{label:'履职填报',path:'/raw-duties'},{label:'消防点检',path:'/fire-inspection'}]}]};"
            +"window.__WORKBENCH_NAVIGATE__=()=>Promise.resolve(false);</script></body></html>";
        runOnMainSync(()->{try{
            timer.removeCallbacksAndMessages(null);
            NativeLogin existing=(NativeLogin)field(screen,"loginView");
            if(existing!=null){existing.close();if(existing.getParent()!=null)((android.view.ViewGroup)existing.getParent()).removeView(existing);set(screen,"loginView",null);}
            set(screen,"origin",site);set(screen,"home",null);set(screen,"catalog",null);set(screen,"leavingSession",false);set(screen,"inspecting",false);
            web.stopLoading();web.setVisibility(android.view.View.VISIBLE);
            web.setWebViewClient(new android.webkit.WebViewClient(){
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView view,android.webkit.WebResourceRequest request){return new android.webkit.WebResourceResponse("text/html","UTF-8",new java.io.ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
                @Override public void onPageFinished(android.webkit.WebView view,String url){if((site+"/inventory").equals(url))loaded.countDown();}
            });web.loadUrl(site+"/inventory");
        }catch(Throwable error){failure.set(error);}});require(failure.get()==null);require(loaded.await(8,TimeUnit.SECONDS));
        require("true".equals(evaluate(web,"!!window.__WORKBENCH_MOBILE__&&window.__WORKBENCH_MOBILE__.accountId==='contract-qa-1'")));
        diagnostic="navigation-initial-inspect";
        invoke(screen,"inspectWorkspace",new Class<?>[]{});
        awaitUi(()->field(screen,"catalog")!=null&&!((Boolean)field(screen,"inspecting")));
        JSONObject catalog=(JSONObject)field(screen,"catalog");require("contract-qa-1".equals(catalog.getString("accountId")));
        require("契约备件目录".equals(catalog.getJSONArray("modules").getJSONObject(0).getString("title")));require(field(screen,"home")==null);
        require(((Integer)field(screen,"activeTab"))==0);require(web.getVisibility()==android.view.View.VISIBLE);
        require(((android.view.View)field(screen,"navigation")).getVisibility()==android.view.View.GONE);
        android.view.ViewGroup navigation=(android.view.ViewGroup)field(screen,"navigation");
        require(navigation.getChildCount()==1 && ((android.view.ViewGroup)navigation.getChildAt(0)).getChildCount()==3);
        require("true".equals(evaluate(web,"localStorage.getItem('spare_parts_auth_token')===null")));
        NativeHome.Session session=(NativeHome.Session)field(screen,"session");require(session.scope.endsWith(":contract-qa-1"));
        diagnostic="navigation-cancel-business";
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/portal","我的",4);
        awaitUi(()->!((Boolean)field(screen,"navigating")));
        require("\"/inventory\"".equals(evaluate(web,"location.pathname")));require(field(screen,"home")==null);require(((Integer)field(screen,"activeTab"))==0);require(((Integer)field(screen,"pendingTab"))==-1);
        require(web.getVisibility()==android.view.View.VISIBLE);require(session.scope.endsWith(":contract-qa-1"));
        diagnostic="navigation-success-race";
        evaluate(web,"window.__WORKBENCH_NAVIGATE__=path=>new Promise(resolve=>{window.fixtureResolve=()=>{history.replaceState(null,'',path);window.__WORKBENCH_MOBILE__.page=path;resolve(true)}});true");
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/portal","我的",4);
        for(int i=0;i<80;i++){if("true".equals(evaluate(web,"typeof window.fixtureResolve==='function'")))break;Thread.sleep(25);}
        // Force catalog inspection to finish before the delayed navigation completion callback.
        runOnMainSync(()->timer.removeCallbacksAndMessages(null));
        require("true".equals(evaluate(web,"window.fixtureResolve();true")));
        invoke(screen,"inspectWorkspace",new Class<?>[]{});
        awaitUi(()->field(screen,"home")!=null&&!((Boolean)field(screen,"inspecting")));
        NativeHome firstHome=(NativeHome)field(screen,"home");require(firstHome.selectedTab()==4);require(((Integer)field(screen,"activeTab"))==4);
        int request=(Integer)field(screen,"navigationRequest"),generation=(Integer)field(screen,"generation");
        invoke(screen,"pollNavigation",new Class<?>[]{int.class,int.class,String.class,int.class,boolean.class},request,generation,"工作",0,true);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&!((Boolean)field(screen,"inspecting")));
        require(field(screen,"home")==firstHome);require(web.getVisibility()==android.view.View.GONE);require("\"/portal\"".equals(evaluate(web,"location.pathname")));
        diagnostic="navigation-cancel-native";
        evaluate(web,"window.__WORKBENCH_NAVIGATE__=()=>Promise.resolve(false);true");
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/inventory","库存查询",-1);
        awaitUi(()->!((Boolean)field(screen,"navigating")));require(field(screen,"home")==firstHome);require(web.getVisibility()==android.view.View.GONE);require(((Integer)field(screen,"activeTab"))==4);
        diagnostic="navigation-success-business";
        evaluate(web,"window.__WORKBENCH_NAVIGATE__=path=>{history.replaceState(null,'',path);window.__WORKBENCH_MOBILE__.page=path;return Promise.resolve(true)};true");
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/inventory","库存查询",-1);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")==null&&!((Boolean)field(screen,"inspecting")));
        require(((Integer)field(screen,"activeTab"))==0);require(web.getVisibility()==android.view.View.VISIBLE);require("\"/inventory\"".equals(evaluate(web,"location.pathname")));
        diagnostic="navigation-fire-from-work-management";
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/fire-inspection","消防点检",-1);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")==null&&!((Boolean)field(screen,"inspecting")));
        require("\"/fire-inspection\"".equals(evaluate(web,"location.pathname")));require(((Integer)field(screen,"activeTab"))==0);
        require(web.getVisibility()==android.view.View.VISIBLE);
        android.view.ViewGroup fireNavigation=(android.view.ViewGroup)navigation.getChildAt(0);
        require(fireNavigation.getChildCount()==3);require(fireNavigation.getChildAt(0).isSelected());require(!fireNavigation.getChildAt(1).isSelected());
        diagnostic="navigation-fire-return-workspace";
        invoke(screen,"returnToHome",new Class<?>[]{});
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")!=null&&!((Boolean)field(screen,"inspecting")));
        require(((NativeHome)field(screen,"home")).selectedTab()==0);require(web.getVisibility()==android.view.View.GONE);
        diagnostic="navigation-profile-back-to-mine";
        NativeHome profileHome=(NativeHome)field(screen,"home");
        runOnMainSync(()->profileHome.select(4));
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/account?tab=profile","个人资料",4);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")==null&&!((Boolean)field(screen,"inspecting")));
        require(((Integer)field(screen,"activeTab"))==4);
        require("个人资料".contentEquals(((TextView)field(screen,"pageTitle")).getText()));
        runOnMainSync(screen::onBackPressed);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")!=null&&!((Boolean)field(screen,"inspecting")));
        require(((NativeHome)field(screen,"home")).selectedTab()==4);
        require(web.getVisibility()==android.view.View.GONE);
        diagnostic="navigation-favorites-back";
        NativeHome favoriteHome=(NativeHome)field(screen,"home");
        runOnMainSync(()->favoriteHome.select(5));
        invoke(screen,"navigateTo",new Class<?>[]{String.class,String.class,int.class},"/inventory","库存查询",5);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")==null&&!((Boolean)field(screen,"inspecting")));
        require(((Integer)field(screen,"activeTab"))==5);
        runOnMainSync(screen::onBackPressed);
        awaitUi(()->!((Boolean)field(screen,"navigating"))&&field(screen,"home")!=null&&!((Boolean)field(screen,"inspecting")));
        require(((NativeHome)field(screen,"home")).selectedTab()==5);
        diagnostic="navigation-account-scope";
        evaluate(web,"window.__WORKBENCH_MOBILE__.accountId='contract-qa-2';true");invoke(screen,"inspectWorkspace",new Class<?>[]{});
        awaitUi(()->session.scope.endsWith(":contract-qa-2")&&!((Boolean)field(screen,"inspecting")));
        require(session.scope.endsWith(":contract-qa-2"));
        diagnostic="navigation-login-clear";
        evaluate(web,"history.replaceState(null,'','/login');window.__WORKBENCH_MOBILE__.page='/login';window.__WORKBENCH_MOBILE__.modules=[];true");
        invoke(screen,"inspectWorkspace",new Class<?>[]{});
        awaitUi(()->field(screen,"loginView")!=null&&!((Boolean)field(screen,"inspecting")));
        require(field(screen,"catalog")==null);require(field(screen,"home")==null);require(session.scope.isEmpty());
        require(((android.view.View)field(screen,"navigation")).getVisibility()==android.view.View.GONE);require(((Integer)field(screen,"pendingTab"))==-1);
        runOnMainSync(()->timer.removeCallbacksAndMessages(null));
        diagnostic="navigation-complete";
    }

}
