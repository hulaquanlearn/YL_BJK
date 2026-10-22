package cn.digitalworkbench.mobile;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Handler;
import org.json.*;

/** Online preview client. No JavaScript-to-native bridge is exposed to the server. */
public class MainActivity extends Activity {
    private WebView web;
    private LinearLayout root;
    private String origin;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 10;
    private FrameLayout content;
    private LinearLayout toolbar;
    private TextView pageTitle;
    private NativeHome home;
    private NativeLogin loginView;
    private CredentialVault credentialVault;
    private AppUpdater updater;
    private WebExports exports;
    private final Handler handler = new Handler(android.os.Looper.getMainLooper());
    private boolean inspecting;
    private boolean leavingSession;
    private int generation;
    private final Runnable watch = new Runnable() {
        @Override public void run() {
            if (web != null && home == null) inspectWorkspace();
            handler.postDelayed(this, 800);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        updater = new AppUpdater(this);
        credentialVault = new CredentialVault(this);
        String saved = getPreferences(0).getString("server", "https://czsdsg.cn");
        open(saved);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void configure() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://工作台域名");
        input.setText(getPreferences(0).getString("server", ""));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("连接数字工作台")
            .setMessage("填写电脑浏览器访问工作台的网址，不能填手机的 localhost。试用版支持内网 HTTP；正式版使用 HTTPS。")
            .setView(input).setNegativeButton("取消", (d, w) -> { if (web == null) finish(); })
            .setPositiveButton("连接", null).create();
        dialog.show();
        // Override default dismiss behavior so invalid addresses remain editable.
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String address = input.getText().toString().trim();
            Uri u = Uri.parse(address);
            boolean debug = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (!("https".equals(u.getScheme()) || (debug && "http".equals(u.getScheme())))
                    || u.getHost() == null || u.getUserInfo() != null
                    || u.getQuery() != null || u.getFragment() != null
                    || !(u.getPath() == null || u.getPath().isEmpty() || "/".equals(u.getPath()))) {
                input.setError("请填写完整的网站根地址，例如 https://work.example.com"); return;
            }
            String host = u.getHost();
            if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host)) {
                input.setError("请填写服务器域名或电脑的局域网 IP"); return;
            }
            String previous = getPreferences(0).getString("server", "");
            Runnable connect = () -> {
                getPreferences(0).edit().putString("server", address).apply();
                dialog.dismiss(); open(address);
            };
            if (!previous.isEmpty() && !previous.equals(address)) {
                new AlertDialog.Builder(this).setMessage("切换服务器后需在新服务器登录，当前未保存的内容可能丢失。继续？")
                    .setPositiveButton("切换", (d,w) -> connect.run()).setNegativeButton("取消", null).show();
            } else connect.run();
        });
    }

    private void open(String address) {
        generation++; inspecting = false; leavingSession = false; home = null;
        if (loginView != null) { loginView.close(); loginView = null; }
        Uri uri = Uri.parse(address);
        origin = uri.getScheme() + "://" + uri.getEncodedAuthority();
        if (web != null) { if (content != null) content.removeView(web); web.destroy(); }
        root.removeAllViews();
        toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL); toolbar.setPadding(dp(8), 0, dp(8), 0);
        TextView back = new TextView(this); back.setText("‹"); back.setTextSize(32); back.setTextColor(0xff243e57); back.setGravity(Gravity.CENTER); back.setContentDescription("返回"); back.setOnClickListener(v -> onBackPressed()); toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), -1));
        pageTitle = new TextView(this); pageTitle.setText("数字工作台"); pageTitle.setTextColor(0xff1a2b3c); pageTitle.setTextSize(17); pageTitle.setTypeface(null, Typeface.BOLD); pageTitle.setSingleLine(true); pageTitle.setEllipsize(android.text.TextUtils.TruncateAt.END); toolbar.addView(pageTitle, new LinearLayout.LayoutParams(0, -2, 1));
        TextView more = new TextView(this); more.setText("⋯"); more.setTextSize(28); more.setTextColor(0xff243e57); more.setGravity(Gravity.CENTER); more.setContentDescription("更多操作"); more.setOnClickListener(v -> {
            PopupMenu menu = new PopupMenu(this, more);
            menu.getMenu().add("返回工作台").setOnMenuItemClickListener(item -> { returnToHome(); return true; });
            menu.getMenu().add("刷新页面").setOnMenuItemClickListener(item -> { web.reload(); return true; });
            menu.getMenu().add("检查 App 更新").setOnMenuItemClickListener(item -> { updater.check(origin, true); return true; });
            menu.getMenu().add("密码保存设置").setOnMenuItemClickListener(item -> { passwordSettings(); return true; });
            menu.getMenu().add("连接设置").setOnMenuItemClickListener(item -> { configure(); return true; }); menu.show();
        }); toolbar.addView(more, new LinearLayout.LayoutParams(dp(48), -1));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(52)));
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " DigitalWorkbenchAndroid/" + AppUpdater.version(this));
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                if (!sameOrigin(Uri.parse(url))) return;
                applyMobileStyles(); inspectWorkspace();
                if (exports != null) exports.prepare();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (sameOrigin(u)) return false;
                if ("https".equals(u.getScheme()) || "http".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
                    catch (ActivityNotFoundException e) { toast("没有可打开链接的浏览器"); }
                } else toast("暂不支持此链接");
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) new AlertDialog.Builder(MainActivity.this)
                    .setTitle("连接失败").setMessage("请检查手机网络、服务器地址和证书。")
                    .setPositiveButton("重试", (d,w) -> web.reload())
                    .setNeutralButton("修改服务器", (d,w) -> configure()).setNegativeButton("关闭", null).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (d,w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (d,w) -> result.confirm())
                    .setNegativeButton("取消", (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsPrompt(WebView v, String url, String message, String value, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this); input.setText(value);
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input)
                    .setPositiveButton("确定", (d,w) -> result.confirm(input.getText().toString()))
                    .setNegativeButton("取消", (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(p.createIntent(), PICK_FILE); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; toast("没有可用的文件选择器"); }
                return true;
            }
        });
        if (exports != null) exports.close();
        exports = new WebExports(this, web, origin);
        web.setDownloadListener((url, agent, disposition, mime, size) -> exports.download(url, disposition, mime));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(address);
        handler.postDelayed(() -> { if (updater != null) updater.check(origin, false); }, 1800);
    }
    private void returnToHome() {
        if (home != null) return;
        pageTitle.setText("工作台"); web.loadUrl(origin + "/portal");
    }
    private void inspectWorkspace() {
        if (inspecting || web == null || home != null || loginView != null || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) return;
        inspecting = true; final int expected = generation;
        // Read only the already-authorized portal entries. Never read tokens across the JavaScript boundary.
        String script = "(()=>{try{if(location.pathname!='/portal')return {page:location.pathname};"
            + "const cards=[...document.querySelectorAll('.workbench .module-card')];"
            + "if(!localStorage.getItem('spare_parts_auth_token')||!cards.length)return null;"
            + "const user=JSON.parse(localStorage.getItem('spare_parts_auth_user')||'null');if(!user)return null;"
            + "const modules=cards.map(c=>{const a=c.querySelector('.module-enter');if(!a)return null;return {title:c.querySelector('h2')?.textContent.trim()||'',description:c.querySelector('p')?.textContent.trim()||'',path:a.getAttribute('href'),enter:a.textContent.trim(),links:[...c.querySelectorAll('.workspace-links a')].map(l=>({label:l.textContent.trim(),path:l.getAttribute('href')}))}}).filter(Boolean);"
            + "return {page:'/portal',name:user.displayName||user.username||'同事',initial:(user.displayName||user.username||'用').slice(0,1),role:document.querySelector('.portal-account small')?.textContent.trim()||'已登录',modules};}catch{return null}})()";
        web.evaluateJavascript(script, value -> {
            if (expected != generation || isFinishing()) return;
            inspecting = false;
            try {
                JSONObject data = new JSONObject(value); String path = data.optString("page");
                if ("/login".equals(path)) { leavingSession = false; toolbar.setVisibility(View.VISIBLE); pageTitle.setText("账号登录"); if (NativeAuth.validOrigin(origin)) showLogin(); }
                else if (!leavingSession && "/portal".equals(path) && data.optJSONArray("modules") != null && data.optJSONArray("modules").length() > 0) {
                    showHome(data);
                }
            } catch (JSONException ignored) { /* portal is still loading, next tick retries */ }
        });
    }
    private void showLogin() {
        if (loginView != null || web == null) return;
        final int expected = generation;
        loginView = new NativeLogin(this, origin, credentialVault, NativeAuth.network(AppUpdater.version(this)), data -> {
            if (expected != generation || isFinishing() || web == null || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) return;
            try {
                String token = data.getString("token"), user = data.getJSONObject("user").toString();
                // Only authenticated session data crosses into this origin; the password never enters JavaScript.
                String script = "(()=>{if(location.origin!==new URL(" + JSONObject.quote(origin) + ").origin||location.pathname!='/login')return false;"
                    + "localStorage.setItem('spare_parts_auth_token'," + JSONObject.quote(token) + ");"
                    + "localStorage.setItem('spare_parts_auth_user'," + JSONObject.quote(user) + ");location.replace('/portal');return true})()";
                web.evaluateJavascript(script, result -> {
                    if (expected != generation || isFinishing()) return;
                    if (!"true".equals(result)) { toast("登录页面已变化，请重新登录。"); return; }
                    if (loginView != null) { NativeLogin old = loginView; loginView = null; content.removeView(old); old.close(); }
                    web.setVisibility(View.VISIBLE);
                });
            } catch (JSONException ignored) { toast("登录响应无效，请重新登录。"); }
        });
        web.setVisibility(View.GONE); toolbar.setVisibility(View.VISIBLE); content.addView(loginView, new FrameLayout.LayoutParams(-1, -1));
    }
    private void passwordSettings() {
        if (loginView != null && loginView.isBusy()) { toast("请等待本次登录完成后再修改设置。"); return; }
        boolean saved = credentialVault.read(origin) != null;
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("密码保存设置")
            .setMessage(saved ? "已为当前服务器保存登录密码。密码在本机加密存储，退出登录不会自动清除；下次仍需点击登录。" : "当前服务器未保存密码。需要时可在 App 登录页勾选“记住密码”，成功登录后保存。")
            .setNegativeButton("关闭", null);
        if (saved) dialog.setPositiveButton("清除保存的密码", (d,w) -> {
            try { credentialVault.clear(origin); if (loginView != null) loginView.cleared(); toast("已清除当前服务器保存的密码。"); }
            catch (Exception ignored) { toast("清除失败，请稍后重试。"); }
        });
        dialog.show();
    }
    private void showHome(JSONObject data) {
        if (home != null) return;
        home = new NativeHome(this, data, new NativeHome.Actions() {
            @Override public void navigate(String path, String title) {
                Uri target = Uri.parse(origin + path);
                if (!path.startsWith("/") || path.startsWith("//") || !sameOrigin(target)) { toast("无效的业务入口"); return; }
                content.removeView(home); home = null; web.setVisibility(View.VISIBLE); toolbar.setVisibility(View.VISIBLE); pageTitle.setText(title); web.loadUrl(target.toString());
            }
            @Override public void server() { configure(); }
            @Override public void update() { updater.check(origin, true); }
            @Override public void passwords() { passwordSettings(); }
            @Override public void reload() { content.removeView(home); home = null; web.setVisibility(View.VISIBLE); toolbar.setVisibility(View.VISIBLE); web.reload(); }
            @Override public void logout() {
                new AlertDialog.Builder(MainActivity.this).setTitle("退出登录").setMessage("确定退出当前账号吗？")
                    .setNegativeButton("取消", null).setPositiveButton("退出", (d,w) -> {
                        leavingSession = true; content.removeView(home); home = null; web.setVisibility(View.VISIBLE); toolbar.setVisibility(View.VISIBLE); pageTitle.setText("正在退出登录");
                        if (web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl()))) web.evaluateJavascript("(async()=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),8000);try{await fetch('/api/auth/logout',{method:'POST',signal:c.signal,headers:{Authorization:'Bearer '+localStorage.getItem('spare_parts_auth_token')}})}catch{}finally{clearTimeout(t);localStorage.removeItem('spare_parts_auth_token');localStorage.removeItem('spare_parts_auth_user');location.replace('/login')}})()", null);
                    }).show();
            }
        });
        web.setVisibility(View.GONE); toolbar.setVisibility(View.GONE); content.addView(home, new FrameLayout.LayoutParams(-1, -1));
    }
    private void applyMobileStyles() {
        try (java.io.InputStream in = getAssets().open("mobile.css"); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            String css = out.toString("UTF-8");
            web.evaluateJavascript("(()=>{let s=document.getElementById('android-mobile-style');if(!s){s=document.createElement('style');s.id='android-mobile-style';document.head.appendChild(s)}s.textContent=" + JSONObject.quote(css) + "})()", null);
        } catch (java.io.IOException e) { toast("手机样式加载失败，请重新安装"); }
    }
    private boolean sameOrigin(Uri u) {
        return origin.equals(u.getScheme() + "://" + u.getEncodedAuthority());
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (exports != null && exports.result(request, result, data)) return;
        if (request == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); fileCallback = null;
        }
    }
    @Override public void onBackPressed() {
        if (loginView == null && home == null && web != null && web.canGoBack()) web.goBack();
        else new AlertDialog.Builder(this).setMessage("退出数字工作台？")
            .setPositiveButton("退出", (d,w) -> finish()).setNegativeButton("取消", null).show();
    }
    @Override protected void onResume() { super.onResume(); handler.removeCallbacks(watch); handler.post(watch); if (updater != null) updater.resume(); }
    @Override protected void onPause() { handler.removeCallbacks(watch); super.onPause(); }
    @Override protected void onDestroy() {
        generation++; handler.removeCallbacksAndMessages(null);
        if (updater != null) updater.close();
        if (exports != null) exports.close();
        if (loginView != null) loginView.close();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (web != null) { if (content != null) content.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
