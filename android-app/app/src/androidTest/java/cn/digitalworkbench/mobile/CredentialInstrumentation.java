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
            if ("write".equals(phase)) {
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
        } catch (Throwable ignored) { result.putString("stream", "Credential checks failed after " + checks + "; phase=" + phase + "; fixture=" + diagnostic + "; error=" + ignored.getClass().getSimpleName() + "\n"); finish(Activity.RESULT_CANCELED, result); }
        finally { if (!"write".equals(phase)) try { vault.clear(origin); vault.clear(other); } catch (Exception ignored) {} if (view != null) { NativeLogin current = view; runOnMainSync(current::close); } if (activity != null) { Activity current = activity; runOnMainSync(current::finish); } }
    }
    private JSONObject data() throws Exception { return new JSONObject().put("token", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").put("user", new JSONObject().put("id", 1).put("username", username).put("role", "viewer")); }
    private void requireEncrypted() throws Exception { String value = getTargetContext().getSharedPreferences(CredentialVault.PREFERENCES, Context.MODE_PRIVATE).getString(CredentialVault.slot(origin), ""); require(!value.contains(username) && !value.contains(password)); require(new JSONObject(value).has("ciphertext")); }
    private Object field(Object target, String name) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(target); }
    private void set(Object target, String name, Object value) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); f.set(target, value); }
    private void verifySessionHandoff(Activity screen, CredentialVault vault) throws Exception {
        String site = "https://session-qa.invalid"; vault.clear(site);
        android.webkit.WebView web = (android.webkit.WebView) field(screen, "web"); CountDownLatch loaded = new CountDownLatch(1), portal = new CountDownLatch(1);
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
        runOnMainSync(() -> { try { java.lang.reflect.Method show=MainActivity.class.getDeclaredMethod("showLogin");show.setAccessible(true);show.invoke(screen); } catch(Throwable e) { failure.set(e); }}); require(failure.get()==null);
        NativeLogin form=(NativeLogin)field(screen,"loginView");require(form!=null);java.util.concurrent.atomic.AtomicBoolean called=new java.util.concurrent.atomic.AtomicBoolean();set(form,"client",(NativeAuth.Client)(o,u,p)->{called.set(true);return data();});NativeLogin.Actions callback=(NativeLogin.Actions)field(form,"actions");
        runOnMainSync(() -> { ((EditText)form.findViewWithTag("login-username")).setText(username);((EditText)form.findViewWithTag("login-password")).setText(password);form.findViewWithTag("login-submit").performClick(); });
        boolean arrived=portal.await(10,TimeUnit.SECONDS); CountDownLatch probe=new CountDownLatch(1);runOnMainSync(()->web.evaluateJavascript("({url:location.href,origin:location.origin,path:location.pathname,token:!!localStorage.getItem('spare_parts_auth_token')})",v->{try{diagnostic=v+"; called="+called.get()+"; busy="+form.isBusy()+"; view="+(field(screen,"loginView")!=null)+"; message="+((TextView)form.findViewWithTag("login-message")).getText();}catch(Exception ignored){}probe.countDown();}));probe.await(3,TimeUnit.SECONDS);require(arrived); CountDownLatch read=new CountDownLatch(1);AtomicReference<String> session=new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript("(()=>({hasToken:!!localStorage.getItem('spare_parts_auth_token'),role:JSON.parse(localStorage.getItem('spare_parts_auth_user')).role,passwordStored:!!localStorage.getItem('password')}))()",v->{session.set(v);read.countDown();}));require(read.await(5,TimeUnit.SECONDS));JSONObject state=new JSONObject(session.get());require(state.getBoolean("hasToken"));require(state.getString("role").equals("viewer"));require(!state.getBoolean("passwordStored"));
        runOnMainSync(() -> {try{set(screen,"inspecting",false);java.lang.reflect.Method inspect=MainActivity.class.getDeclaredMethod("inspectWorkspace");inspect.setAccessible(true);inspect.invoke(screen);}catch(Throwable e){failure.set(e);}});require(failure.get()==null);
        for(int i=0;i<100;i++){AtomicReference<Boolean> present=new AtomicReference<>(false);runOnMainSync(()->{try{present.set(field(screen,"home")!=null);}catch(Exception ignored){}});if(present.get())break;Thread.sleep(30);}require(field(screen,"home")!=null);
        CountDownLatch otherLoaded=new CountDownLatch(1);runOnMainSync(()->{web.setWebViewClient(new android.webkit.WebViewClient(){@Override public void onPageFinished(android.webkit.WebView v,String url){otherLoaded.countDown();}});web.loadDataWithBaseURL("https://cross-session-qa.invalid/login","<html></html>","text/html","UTF-8","https://cross-session-qa.invalid/login");});require(otherLoaded.await(8,TimeUnit.SECONDS));
        CountDownLatch guarded=new CountDownLatch(1);AtomicReference<String> notCopied=new AtomicReference<>();runOnMainSync(()->{try{callback.signedIn(data());web.evaluateJavascript("localStorage.getItem('spare_parts_auth_token')===null",v->{notCopied.set(v);guarded.countDown();});}catch(Exception e){failure.set(e);}});require(guarded.await(5,TimeUnit.SECONDS));require("true".equals(notCopied.get()));vault.clear(site);
    }
}
