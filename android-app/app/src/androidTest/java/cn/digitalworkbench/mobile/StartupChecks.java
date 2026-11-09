package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Handler;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Local intercepted documents only: exercises the surfaces users see during session startup. */
final class StartupChecks {
    private final Instrumentation instrumentation;
    private final String site = "https://startup-surface-qa.invalid";
    private int checks;
    private String phase = "startup";
    private final AtomicReference<String> document = new AtomicReference<>(html(""));
    private final AtomicReference<CountDownLatch> loaded = new AtomicReference<>();

    StartupChecks(Instrumentation instrumentation) { this.instrumentation = instrumentation; }
    private void require(boolean condition) { if (!condition) throw new AssertionError(phase + " check " + (checks + 1)); checks++; }
    private Object field(Object target, String name) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(target); }
    private void set(Object target, String name, Object value) throws Exception { java.lang.reflect.Field f = target.getClass().getDeclaredField(name); f.setAccessible(true); f.set(target, value); }
    private void ui(Runnable task) { instrumentation.runOnMainSync(task); }
    private void invoke(Activity screen, String name) throws Exception {
        AtomicReference<Throwable> error = new AtomicReference<>();
        ui(() -> { try { java.lang.reflect.Method m = MainActivity.class.getDeclaredMethod(name); m.setAccessible(true); m.invoke(screen); } catch (Throwable t) { error.set(t); } });
        if (error.get() != null) throw new AssertionError(phase, error.get());
    }
    private interface Condition { boolean ready() throws Exception; }
    private void await(Condition condition) throws Exception {
        await(condition, 200);
    }
    private void await(Condition condition, int attempts) throws Exception {
        for (int i = 0; i < attempts; i++) {
            AtomicReference<Boolean> ready = new AtomicReference<>(false); AtomicReference<Throwable> error = new AtomicReference<>();
            ui(() -> { try { ready.set(condition.ready()); } catch (Throwable t) { error.set(t); } });
            if (error.get() != null) throw new AssertionError(phase, error.get());
            if (ready.get()) return;
            Thread.sleep(25);
        }
        throw new AssertionError(phase + " timed out");
    }
    private String evaluate(WebView web, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        ui(() -> web.evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        if (!done.await(5, TimeUnit.SECONDS)) throw new AssertionError(phase + " JavaScript timed out");
        return value.get();
    }
    private static String html(String script) {
        return "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<div class='public-page-shell' id='web-login'>网页版登录</div><div class='portal-page-shell' id='web-home'>网页版工作台</div>"
            + "<div class='app-shell' id='business'>业务正文</div><script>" + script + "</script>";
    }
    private String snapshot() {
        return "window.__WORKBENCH_MOBILE__={version:1,page:'/portal',accountId:'startup-qa',name:'启动隔离验证',initial:'验',role:'验证',"
            + "modules:[{id:'spare',title:'备件管理',path:'/inventory',links:[{label:'库存',path:'/inventory'}]}]};";
    }
    private WebView openFixture(Activity screen) throws Exception {
        AtomicReference<WebView> result = new AtomicReference<>(); AtomicReference<Throwable> error = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1); loaded.set(done);
        ui(() -> { try {
            ((Handler)field(screen, "handler")).removeCallbacksAndMessages(null);
            java.lang.reflect.Method open = MainActivity.class.getDeclaredMethod("open", String.class); open.setAccessible(true); open.invoke(screen, site);
            WebView web = (WebView)field(screen, "web"); WebViewClient client = web.getWebViewClient();
            web.setWebViewClient(new WebViewClient() {
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                    return new android.webkit.WebResourceResponse("text/html", "UTF-8", new java.io.ByteArrayInputStream(document.get().getBytes(StandardCharsets.UTF_8)));
                }
                @Override public void onPageFinished(WebView view, String url) {
                    client.onPageFinished(view, url); CountDownLatch signal = loaded.get(); if (signal != null) signal.countDown();
                }
            });
            require(web.getVisibility() == View.GONE);
            require(((View)field(screen, "toolbar")).getVisibility() == View.GONE);
            require(((View)field(screen, "workspaceLoading")).getVisibility() == View.VISIBLE);
            result.set(web);
        } catch (Throwable t) { error.set(t); } });
        if (error.get() != null) throw new AssertionError(phase, error.get());
        require(done.await(6, TimeUnit.SECONDS)); await(() -> !((Boolean)field(screen, "inspecting")));
        return result.get();
    }
    private JSONObject data() throws Exception {
        return new JSONObject().put("token", "startup-isolated-session-token-xxxxxxxxxxxxxxxx")
            .put("user", new JSONObject().put("id", "startup-qa").put("username", "startup-qa").put("role", "viewer"));
    }

    int run() throws Exception {
        Activity screen = instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView web = openFixture(screen);
            require(field(screen, "loginView") == null); require(field(screen, "home") == null);
            require(web.getVisibility() == View.GONE);
            phase = "native-owned-style";
            require("\"hidden\"".equals(evaluate(web, "getComputedStyle(document.getElementById('web-login')).visibility")));
            require("\"hidden\"".equals(evaluate(web, "getComputedStyle(document.getElementById('web-home')).visibility")));
            require("\"visible\"".equals(evaluate(web, "getComputedStyle(document.getElementById('business')).visibility")));

            phase = "startup-timeout-retry";
            await(() -> field(screen, "connectionFailure") != null && ((AlertDialog)field(screen, "connectionFailure")).isShowing(), 700);
            require(field(screen, "home") == null); require(field(screen, "loginView") == null);
            require(web.getVisibility() == View.GONE); require(((View)field(screen, "toolbar")).getVisibility() == View.GONE);
            AlertDialog startupError = (AlertDialog)field(screen, "connectionFailure");
            CountDownLatch retried = new CountDownLatch(1); loaded.set(retried);
            ui(() -> startupError.getButton(AlertDialog.BUTTON_POSITIVE).performClick()); require(retried.await(6, TimeUnit.SECONDS));
            require(!startupError.isShowing()); require(web.getVisibility() == View.GONE);
            require(((View)field(screen, "workspaceLoading")).getVisibility() == View.VISIBLE);

            phase = "native-login-only";
            evaluate(web, "history.replaceState(null,'','/login');window.__WORKBENCH_MOBILE__={version:1,page:'/login',modules:[]};true");
            invoke(screen, "inspectWorkspace"); await(() -> field(screen, "loginView") != null);
            NativeLogin login = (NativeLogin)field(screen, "loginView");
            require(login.findViewWithTag("login-updates") == null);
            require(login.findViewWithTag("login-privacy") != null);
            require(field(field(screen,"updater"),"notice") == field(screen,"updateNotice"));
            require(web.getVisibility() == View.GONE); require(((View)field(screen, "workspaceLoading")).getVisibility() == View.GONE);
            require(((View)field(screen, "toolbar")).getVisibility() == View.GONE);
            require(field(screen, "connectionFailure") == null);
            set(login, "client", (NativeAuth.Client)(o,u,p) -> data());
            CountDownLatch portal = new CountDownLatch(1); loaded.set(portal);
            ui(() -> { ((EditText)login.findViewWithTag("login-username")).setText("startup-qa"); ((EditText)login.findViewWithTag("login-password")).setText("isolated-credential"); login.findViewWithTag("login-submit").performClick(); });
            require(portal.await(6, TimeUnit.SECONDS)); await(() -> !((Boolean)field(screen, "inspecting")));
            phase = "login-pending-session";
            require(field(screen, "loginView") == login); require(login.isBusy()); require(web.getVisibility() == View.GONE);
            require(((View)field(screen, "toolbar")).getVisibility() == View.GONE); require(field(screen, "home") == null);
            require("true".equals(evaluate(web, "!!localStorage.getItem('spare_parts_auth_token')&&!localStorage.getItem('password')")));

            phase = "session-timeout-retry";
            await(() -> !login.isBusy(), 600);
            require(field(screen, "loginView") == login); require(web.getVisibility() == View.GONE);
            require(((TextView)login.findViewWithTag("login-message")).getText().toString().contains("超时"));
            portal = new CountDownLatch(1); loaded.set(portal);
            ui(() -> login.findViewWithTag("login-submit").performClick()); require(portal.await(6, TimeUnit.SECONDS));
            require(field(screen, "loginView") == login); require(login.isBusy());

            phase = "session-rejected-retry";
            evaluate(web, "history.replaceState(null,'','/login');window.__WORKBENCH_MOBILE__={version:1,page:'/login',modules:[]};true");
            invoke(screen, "inspectWorkspace"); await(() -> !login.isBusy());
            require(field(screen, "loginView") == login); require(web.getVisibility() == View.GONE);
            require(((TextView)login.findViewWithTag("login-message")).getText().length() > 0);
            portal = new CountDownLatch(1); loaded.set(portal);
            ui(() -> login.findViewWithTag("login-submit").performClick()); require(portal.await(6, TimeUnit.SECONDS));
            require(field(screen, "loginView") == login); require(login.isBusy());
            evaluate(web, snapshot() + "true"); invoke(screen, "inspectWorkspace");
            await(() -> field(screen, "home") != null && field(screen, "loginView") == null);
            require(web.getVisibility() == View.GONE); require(((EditText)login.findViewWithTag("login-password")).length() == 0);
            require(((View)field(screen, "toolbar")).getVisibility() == View.GONE);

            phase = "authenticated-empty-catalog";
            evaluate(web, "window.__WORKBENCH_MOBILE__.modules=[];true"); invoke(screen, "inspectWorkspace");
            await(() -> field(screen, "home") != null && ((JSONObject)field(screen, "catalog")).getJSONArray("modules").length() == 0);
            require(field(screen, "loginView") == null); require(web.getVisibility() == View.GONE);
            require(((View)field(screen, "workspaceLoading")).getVisibility() == View.GONE);

            phase = "unresolved-empty-catalog";
            document.set(html("window.__WORKBENCH_MOBILE__={version:1,page:'/portal',accountId:'',modules:[]};"));
            WebView unresolved = openFixture(screen);
            require(field(screen, "home") == null); require(field(screen, "loginView") == null);
            require(unresolved.getVisibility() == View.GONE); require(((View)field(screen, "workspaceLoading")).getVisibility() == View.VISIBLE);

            phase = "saved-session-startup";
            document.set(html(snapshot())); WebView restored = openFixture(screen);
            await(() -> field(screen, "home") != null);
            require(field(screen, "loginView") == null); require(restored.getVisibility() == View.GONE);
            require(((View)field(screen, "workspaceLoading")).getVisibility() == View.GONE);
            require("true".equals(evaluate(restored, "!!localStorage.getItem('spare_parts_auth_token')")));

            phase = "connection-retry";
            invoke(screen, "showConnectionFailure"); AlertDialog error = (AlertDialog)field(screen, "connectionFailure");
            require(error.isShowing()); require(error.getButton(AlertDialog.BUTTON_POSITIVE) != null);
            CountDownLatch reloaded = new CountDownLatch(1); loaded.set(reloaded);
            ui(() -> error.getButton(AlertDialog.BUTTON_POSITIVE).performClick()); require(reloaded.await(6, TimeUnit.SECONDS));
            require(!error.isShowing()); await(() -> field(screen, "home") != null);
            require(restored.getVisibility() == View.GONE);
            return checks;
        } finally { ui(screen::finish); }
    }
}
