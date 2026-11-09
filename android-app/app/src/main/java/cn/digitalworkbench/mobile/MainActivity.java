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

/** Mobile client with native navigation and authenticated, mobile-specific business pages. */
public class MainActivity extends Activity {
    private WebView web;
    private LinearLayout root;
    private String origin;
    private NativeFireTools fireTools;
    private FrameLayout content;
    private ProgressBar workspaceLoading;
    private LinearLayout toolbar;
    private TextView pageTitle;
    private NativeHome home;
    private LinearLayout navigation;
    private JSONObject catalog;
    private String catalogSignature = "";
    private String navigationSignature = "";
    private final NativeHome.Session session = new NativeHome.Session();
    private int activeTab, pendingTab = -1, navigationRequest;
    private boolean navigating;
    private static final long NAVIGATION_TIMEOUT_MS = 15000;
    private Runnable navigationTimeout;
    private boolean keyboardVisible;
    private NativeLogin loginView;
    private CredentialVault credentialVault;
    private AppUpdater updater;
    private TextView updateNotice;
    private AlertDialog privacyConsent;
    private AlertDialog connectionFailure;
    private AlertDialog rendererFailure;
    private boolean rendererRestartRequested;
    private WebExports exports;
    private final Handler handler = new Handler(android.os.Looper.getMainLooper());
    private boolean inspecting;
    private boolean leavingSession;
    private int generation;
    private int loginHandoffRequest;
    private boolean completingLogin;
    private int inspectionRequest;
    private int workspaceWaitRequest;
    private boolean workspaceWaiting;
    private final Runnable watch = new Runnable() {
        @Override public void run() {
            if (web != null) inspectWorkspace();
            handler.postDelayed(this, 800);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        NotificationManager retiredNotifications=getSystemService(NotificationManager.class);
        if(retiredNotifications!=null){
            retiredNotifications.deleteNotificationChannel("agv_repairs_sound_v1");
            retiredNotifications.deleteNotificationChannel("agv_repairs_quiet_v1");
        }
        getSharedPreferences("agv-message-alerts",MODE_PRIVATE).edit().clear().apply();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            boolean visible = androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(insets, v).isVisible(androidx.core.view.WindowInsetsCompat.Type.ime());
            // Insets run during layout. Do not rebuild navigation children from this callback.
            if (keyboardVisible != visible) { keyboardVisible = visible; updateNavigationVisibility(); }
            int left=insets.getSystemWindowInsetLeft(),top=insets.getSystemWindowInsetTop(),right=insets.getSystemWindowInsetRight(),bottom=insets.getSystemWindowInsetBottom();
            if(v.getPaddingLeft()!=left||v.getPaddingTop()!=top||v.getPaddingRight()!=right||v.getPaddingBottom()!=bottom)v.setPadding(left,top,right,bottom);
            return insets;
        });
        setContentView(root);
        String saved = "https://czsdsg.cn";
        privacyConsent = AppInfo.requireConsent(this, () -> {
            updater = new AppUpdater(this);
            credentialVault = new CredentialVault(this);
            open(saved);
        });
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void open(String address) {
        cancelNavigation();
        if (connectionFailure != null) { connectionFailure.dismiss(); connectionFailure = null; }
        if (rendererFailure != null) { rendererFailure.dismiss(); rendererFailure = null; }
        rendererRestartRequested=false;
        if (fireTools != null) { fireTools.close(); fireTools = null; }
        generation++; inspecting = false; leavingSession = false; navigating = false; completingLogin = false; workspaceWaiting = false; home = null;
        navigationRequest++; catalog = null; catalogSignature = ""; navigationSignature = ""; session.clear(); activeTab = 0; pendingTab = -1;
        if (loginView != null) { loginView.close(); loginView = null; }
        Uri uri = Uri.parse(address);
        origin = uri.getScheme() + "://" + uri.getEncodedAuthority();
        if (web != null) { if (content != null) content.removeView(web); web.destroy(); }
        root.removeAllViews();
        toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL); toolbar.setPadding(dp(8), 0, dp(8), 0);
        FrameLayout back = new FrameLayout(this); ImageView backIcon=NativeIcons.view(this,"arrow",NativeHome.INK);backIcon.setScaleX(-1);back.addView(backIcon,new FrameLayout.LayoutParams(dp(24),dp(24),Gravity.CENTER));back.setContentDescription("返回");back.setFocusable(true);back.setOnClickListener(v -> onBackPressed());toolbar.addView(back,new LinearLayout.LayoutParams(dp(48),-1));
        pageTitle = new TextView(this); pageTitle.setText("数字记录工具"); pageTitle.setTextColor(0xff1a2b3c); pageTitle.setTextSize(17); pageTitle.setTypeface(null, Typeface.BOLD); pageTitle.setSingleLine(true); pageTitle.setEllipsize(android.text.TextUtils.TruncateAt.END); toolbar.addView(pageTitle, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(52)));
        updateNotice=new TextView(this);updateNotice.setTextSize(14);updateNotice.setTextColor(0xff922238);updateNotice.setBackgroundColor(0xffffedf1);updateNotice.setPadding(dp(16),dp(12),dp(16),dp(12));updateNotice.setMinHeight(dp(48));updateNotice.setGravity(Gravity.CENTER);updateNotice.setVisibility(View.GONE);root.addView(updateNotice,new LinearLayout.LayoutParams(-1,-2));
        toolbar.setVisibility(View.GONE);
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        workspaceLoading = new ProgressBar(this); workspaceLoading.setContentDescription("正在连接");
        content.addView(workspaceLoading, new FrameLayout.LayoutParams(dp(32), dp(32), Gravity.CENTER));
        navigation = new LinearLayout(this); navigation.setOrientation(LinearLayout.VERTICAL); navigation.setVisibility(View.GONE); root.addView(navigation, new LinearLayout.LayoutParams(-1, -2));
        web = new WebView(this);
        // Resolve the saved session before displaying a native login or home screen.
        web.setVisibility(View.GONE);
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
                if (r.isForMainFrame()) showConnectionFailure();
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) {
                if (r.isForMainFrame()) showConnectionFailure();
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                if(v!=web){v.destroy();return true;}
                generation++; inspectionRequest++; inspecting=false; cancelNavigation();
                if(fireTools!=null){fireTools.close();fireTools=null;}
                content.removeView(v);web=null;v.destroy();
                if(rendererFailure!=null){rendererFailure.dismiss();rendererFailure=null;}
                if(connectionFailure!=null){connectionFailure.dismiss();connectionFailure=null;}
                if(rendererRestartRequested){rendererRestartRequested=false;open(origin);return true;}
                // The rest of the native UI remains usable if a vendor WebView renderer exits.
                if(isFinishing())return true;
                rendererFailure=new AlertDialog.Builder(MainActivity.this).setTitle("页面已停止响应")
                    .setMessage("页面进程已退出，已保存的数据不受影响。未提交内容可能需要重新填写。")
                    .setPositiveButton("重新连接",(d,w)->open(origin))
                    .setNegativeButton("退出",(d,w)->finish()).setCancelable(false).show();
                return true;
            }
        });
        if(android.os.Build.VERSION.SDK_INT>=29)web.setWebViewRenderProcessClient(new WebViewRenderProcessClient(){
            @Override public void onRenderProcessUnresponsive(WebView view,WebViewRenderProcess renderer){
                if(view!=web||isFinishing()||rendererFailure!=null&&rendererFailure.isShowing())return;
                cancelNavigation();
                rendererFailure=new AlertDialog.Builder(MainActivity.this).setTitle("页面暂时无响应")
                    .setMessage("可以继续等待，或重新连接页面。重新连接后，未提交内容可能需要重新填写。")
                    .setNegativeButton("继续等待",(d,w)->rendererFailure=null)
                    .setPositiveButton("重新连接",(d,w)->{
                        rendererFailure=null;if(view!=web)return;
                        rendererRestartRequested=true;
                        if(renderer==null||!renderer.terminate()){rendererRestartRequested=false;open(origin);}
                    }).setCancelable(false).show();
            }
            @Override public void onRenderProcessResponsive(WebView view,WebViewRenderProcess renderer){
                if(view==web&&rendererFailure!=null){rendererFailure.dismiss();rendererFailure=null;}
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
                return fireTools.choose(callback, p);
            }
        });
        fireTools = new NativeFireTools(this, web, origin, this::hasFireAccess, () -> session.scope);
        if (exports != null) exports.close();
        exports = new WebExports(this, web, origin);
        web.setDownloadListener((url, agent, disposition, mime, size) -> exports.download(url, disposition, mime));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        beginWorkspaceLoading();
        web.loadUrl(origin + "/portal");
    }
    private void beginWorkspaceLoading() {
        toolbar.setVisibility(View.GONE); workspaceLoading.setVisibility(View.VISIBLE);
        if (!workspaceWaiting) awaitWorkspace();
    }
    private void awaitWorkspace() {
        workspaceWaiting = true;
        final int expected = generation, request = ++workspaceWaitRequest;
        handler.postDelayed(() -> {
            if (expected == generation && request == workspaceWaitRequest && !isFinishing()
                    && home == null && loginView == null && web != null && web.getVisibility() != View.VISIBLE && catalog == null) showConnectionFailure();
        }, 15000);
    }
    private void workspaceReady() {
        workspaceWaiting = false; workspaceWaitRequest++;
        workspaceLoading.setVisibility(View.GONE);
        if (connectionFailure != null) { connectionFailure.dismiss(); connectionFailure = null; }
    }
    private void showConnectionFailure() {
        if (isFinishing() || connectionFailure != null && connectionFailure.isShowing()) return;
        final int expected = generation;
        connectionFailure = new AlertDialog.Builder(this)
            .setTitle("连接失败").setMessage("暂时无法连接，请检查手机网络后重试。")
            .setPositiveButton("重试", (d,w) -> {
                if (expected != generation || isFinishing() || web == null) return;
                awaitWorkspace(); web.reload();
            })
            .setNegativeButton("退出", (d,w) -> { if (expected == generation) finish(); }).setCancelable(false).show();
    }
    private void returnToHome() {
        if (home != null) { home.select(0); return; }
        int target=activeTab==4?4:activeTab==5?5:0; navigateTo("/portal", NativeHome.TABS[target], target);
    }
    private void inspectWorkspace() {
        if (inspecting || web == null || loginView != null && !completingLogin || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) return;
        inspecting = true; final int expected = generation, request = ++inspectionRequest;
        handler.postDelayed(() -> {
            if(expected==generation&&request==inspectionRequest&&inspecting){inspectionRequest++;inspecting=false;}
        },5000);
        // The current contract is independent of page markup and never contains a session token.
        // The old portal adapter is used only when a server has not yet published the contract.
        String script = "(()=>{try{const s=window.__WORKBENCH_MOBILE__;if(s&&s.version===1)return {version:1,page:s.page||location.pathname,accountId:String(s.accountId||''),name:s.name,initial:s.initial,role:s.role,modules:s.modules};"
            + "if(location.pathname!='/portal')return {page:location.pathname};"
            + "const cards=[...document.querySelectorAll('.workbench .module-card')];"
            + "if(!localStorage.getItem('spare_parts_auth_token')||!cards.length)return null;"
            + "const user=JSON.parse(localStorage.getItem('spare_parts_auth_user')||'null');if(!user)return null;"
            + "const modules=cards.map(c=>{const a=c.querySelector('.module-enter');if(!a)return null;return {title:c.querySelector('h2')?.textContent.trim()||'',description:c.querySelector('p')?.textContent.trim()||'',path:a.getAttribute('href'),enter:a.textContent.trim(),links:[...c.querySelectorAll('.workspace-links a')].map(l=>({label:l.textContent.trim(),path:l.getAttribute('href')}))}}).filter(Boolean);"
            + "return {page:'/portal',name:user.displayName||user.username||'同事',initial:(user.displayName||user.username||'用').slice(0,1),role:document.querySelector('.portal-account small')?.textContent.trim()||'已登录',modules};}catch{return null}})()";
        web.evaluateJavascript(script, value -> {
            if (expected != generation || request != inspectionRequest || isFinishing()) return;
            inspecting = false;
            if (loginView != null && !completingLogin) return;
            try {
                JSONObject data = new JSONObject(value); String path = data.optString("page");
                if (web.getUrl() == null || !path.equals(Uri.parse(web.getUrl()).getPath())) return;
                if ("/login".equals(path)) {
                    if (completingLogin) {
                        completingLogin = false; loginHandoffRequest++;
                        loginView.handoffFailed("登录状态验证失败，请重新登录。");
                    }
                    leavingSession = false; clearCatalog(); pageTitle.setText(AppInfo.NAME); if (NativeAuth.validOrigin(origin)) showLogin();
                } else if (!leavingSession && data.optJSONArray("modules") != null
                        && (data.optJSONArray("modules").length() > 0 || data.optInt("version") == 1 && !data.optString("accountId").isEmpty())) {
                    String scope = origin + ":" + data.optString("accountId", data.optString("name"));
                    if (!session.scope.equals(scope)) { session.bind(scope); removeHome(); activeTab = 0; catalogSignature = ""; }
                    catalog = data;
                    if ("/portal".equals(path)) {
                        if (pendingTab >= 0) { activeTab = pendingTab; pendingTab = -1; }
                        showHome(data);
                    } else {
                        showBusiness(); updateBusinessTitle(path); renderNavigation();
                    }
                    if (updater != null && !leavingSession) {updater.bindNotice(updateNotice);updater.check(origin, false);}
                }
            } catch (JSONException ignored) { if ("null".equals(value)) clearCatalog(); /* portal may still be loading */ }
        });
    }
    private void showLogin() {
        if(updater!=null){updater.bindNotice(updateNotice);updater.check(origin,false);}
        if (web == null) return;
        web.setVisibility(View.GONE); toolbar.setVisibility(View.GONE); workspaceReady();
        if (loginView != null) return;
        inspectionRequest++; inspecting = false;
        final int expected = generation;
        loginView = new NativeLogin(this, origin, credentialVault, NativeAuth.network(AppUpdater.version(this)), data -> {
            final NativeLogin source = loginView;
            if (source == null) return;
            if (expected != generation || isFinishing() || web == null || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) {
                source.handoffFailed("登录页面已变化，请重新登录。"); return;
            }
            final int request = ++loginHandoffRequest;
            try {
                String token = data.getString("token"), user = data.getJSONObject("user").toString();
                // Only authenticated session data crosses into this origin; the password never enters JavaScript.
                String script = "(()=>{if(location.origin!==new URL(" + JSONObject.quote(origin) + ").origin||(location.pathname!='/login'&&" + !completingLogin + "))return false;"
                    + "localStorage.setItem('spare_parts_auth_token'," + JSONObject.quote(token) + ");"
                    + "localStorage.setItem('spare_parts_auth_user'," + JSONObject.quote(user) + ");return true})()";
                handler.postDelayed(() -> {
                    if (expected == generation && request == loginHandoffRequest && source == loginView && !isFinishing()) {
                        loginHandoffRequest++; source.handoffFailed("登录页面响应超时，请重试。");
                    }
                }, 12000);
                web.evaluateJavascript(script, result -> {
                    if (expected != generation || request != loginHandoffRequest || source != loginView || isFinishing()) return;
                    if (!"true".equals(result)) { loginHandoffRequest++; source.handoffFailed("登录页面已变化，请重新登录。"); return; }
                    inspectionRequest++; inspecting = false;
                    completingLogin = true;
                    // Keep the single native form visible until the authorized home is ready.
                    // Some device WebViews discard evaluateJavascript callbacks if that script also navigates.
                    web.loadUrl(origin + "/portal");
                });
            } catch (JSONException ignored) { loginHandoffRequest++; source.handoffFailed("登录响应无效，请重新登录。"); }
        });
        web.setVisibility(View.GONE); toolbar.setVisibility(View.GONE); workspaceLoading.setVisibility(View.GONE); content.addView(loginView, new FrameLayout.LayoutParams(-1, -1));
    }
    private void removeHome() {
        if (home != null) { content.removeView(home); home = null; }
    }
    private void dismissLogin() {
        completingLogin = false; loginHandoffRequest++;
        if (loginView != null) { NativeLogin source = loginView; loginView = null; content.removeView(source); source.close(); }
    }
    private void showBusiness() {
        removeHome(); dismissLogin(); workspaceReady();
        web.setVisibility(View.VISIBLE); toolbar.setVisibility(View.VISIBLE);
    }
    private void clearCatalog() {
        removeHome(); catalog = null; catalogSignature = ""; navigationSignature = ""; session.clear(); activeTab = 0; pendingTab = -1;
        cancelNavigation();
        if (navigation != null) { navigation.removeAllViews(); navigation.setVisibility(View.GONE); }
        if (loginView == null && web != null && web.getVisibility() != View.VISIBLE) {
            beginWorkspaceLoading();
        }
    }
    private void renderNavigation() {
        if(navigation==null)return;
        if (catalog == null || loginView != null || leavingSession) { navigationSignature = ""; navigation.removeAllViews(); navigation.setVisibility(View.GONE); return; }
        String signature = session.scope + "|" + activeTab + "|" + catalog.optJSONArray("modules");
        if (signature.equals(navigationSignature)) { updateNavigationVisibility(); return; }
        navigationSignature = signature; navigation.removeAllViews();
        navigation.addView(NativeHome.navigation(this, catalog, activeTab, target -> {
            if (navigating) cancelNavigation();
            if (home != null) { activeTab = target; home.select(target); renderNavigation(); }
            else navigateTo("/portal", NativeHome.TABS[target], target);
        }), new LinearLayout.LayoutParams(-1, -2));
        updateNavigationVisibility();
    }
    private void updateNavigationVisibility(){
        if(navigation!=null)navigation.setVisibility(home!=null&&home.getVisibility()==View.VISIBLE&&!keyboardVisible&&catalog!=null&&loginView==null&&!leavingSession&&navigation.getChildCount()>0?View.VISIBLE:View.GONE);
    }
    private void cancelNavigation(){
        navigationRequest++;navigating=false;pendingTab=-1;
        if(navigationTimeout!=null){handler.removeCallbacks(navigationTimeout);navigationTimeout=null;}
    }
    private void navigationFinished(){
        navigating=false;
        if(navigationTimeout!=null){handler.removeCallbacks(navigationTimeout);navigationTimeout=null;}
    }
    private void updateBusinessTitle(String path) {
        String pathname = Uri.parse(path).getPath();
        if(pendingTab>=0){activeTab=pendingTab;pendingTab=-1;}
        JSONArray modules = catalog.optJSONArray("modules");
        if ("/account".equals(pathname)) { activeTab = 4; pageTitle.setText("个人资料"); return; }
        if (modules == null) return;
        for (int i = 0; i < modules.length(); i++) {
            JSONObject module = modules.optJSONObject(i); if (module == null) continue;
            JSONArray links = module.optJSONArray("links");
            if (links != null) for (int j = 0; j < links.length(); j++) {
                JSONObject link = links.optJSONObject(j);
                if (link != null && pathname != null && pathname.equals(Uri.parse(link.optString("path")).getPath())) {
                    activeTab = activeTab==5?5:0; pageTitle.setText(link.optString("label")); return;
                }
            }
            if (pathname != null && pathname.equals(Uri.parse(module.optString("path")).getPath())) {
                activeTab = activeTab==5?5:0; pageTitle.setText(module.optString("title")); return;
            }
        }
    }
    /** Vue router owns leave guards. Native UI changes only after a successful transition. */
    private void navigateTo(String path, String title, int destinationTab) {
        if (navigating || web == null || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) return;
        Uri target = Uri.parse(origin + path);
        if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\") || path.contains("\n") || path.contains("\r") || !sameOrigin(target)) { toast("无效的业务入口"); return; }
        navigating = true; pendingTab = destinationTab;
        final int request = ++navigationRequest, expected = generation;
        navigationTimeout=()->{
            if(request!=navigationRequest||expected!=generation||isFinishing())return;
            cancelNavigation();
            toast("页面切换超时，可重新点击入口或返回；当前填写内容仍保留。");
        };
        // A renderer that stops invoking JS callbacks must not lock native Back/navigation forever.
        handler.postDelayed(navigationTimeout,NAVIGATION_TIMEOUT_MS);
        String script = "(()=>{if(typeof window.__WORKBENCH_NAVIGATE__!=='function')return 'legacy';"
            + "window.__WORKBENCH_NATIVE_TRANSITION__={id:" + request + ",status:'pending'};"
            + "Promise.resolve().then(()=>window.__WORKBENCH_NAVIGATE__(" + JSONObject.quote(path) + ")).then(ok=>{const s=window.__WORKBENCH_NATIVE_TRANSITION__;if(s&&s.id===" + request + ")s.status=ok?'done':'cancelled'}).catch(()=>{const s=window.__WORKBENCH_NATIVE_TRANSITION__;if(s&&s.id===" + request + ")s.status='failed'});return 'contract'})()";
        web.evaluateJavascript(script, result -> {
            if (expected != generation || request != navigationRequest || isFinishing()) return;
            if ("\"legacy\"".equals(result)) {
                Runnable fallback = () -> { if (expected != generation || request != navigationRequest||web==null) return; navigationFinished(); if (!"/portal".equals(target.getPath())) showBusiness(); pageTitle.setText(title); web.loadUrl(target.toString()); };
                if (home == null && loginView == null) new AlertDialog.Builder(this).setTitle("离开当前页面")
                    .setMessage("旧版服务器尚未提供手机导航，离开前请确认已保存当前内容。")
                    .setPositiveButton("已保存，继续", (d,w) -> fallback.run())
                    .setNegativeButton("取消", (d,w) -> cancelNavigation())
                    .setOnCancelListener(d -> cancelNavigation()).show();
                else fallback.run();
            } else pollNavigation(request, expected, title, 0, "/portal".equals(target.getPath()));
        });
    }
    private void pollNavigation(int request, int expected, String title, int count, boolean targetIsPortal) {
        if (request != navigationRequest || expected != generation || isFinishing()) return;
        if (web==null||!navigating) return;
        web.evaluateJavascript("(()=>{const s=window.__WORKBENCH_NATIVE_TRANSITION__;return s&&s.id===" + request + "?s.status:'missing'})()", status -> {
            if (request != navigationRequest || expected != generation || isFinishing()) return;
            if ("\"pending\"".equals(status)) { handler.postDelayed(() -> pollNavigation(request, expected, title, count + 1, targetIsPortal), 250); return; }
            navigationFinished();
            if ("\"done\"".equals(status)) { if (!targetIsPortal) { showBusiness(); pageTitle.setText(title); } else web.setVisibility(View.GONE); inspectWorkspace(); }
            else { pendingTab = -1; if ("\"failed\"".equals(status)) toast("页面暂时无法打开，请重试。"); }
        });
    }
    private void showHome(JSONObject data) {
        String signature = data.optString("accountId") + "|" + data.optString("name") + "|" + data.optString("role") + "|" + data.optJSONArray("modules");
        workspaceReady();
        if (home != null && signature.equals(catalogSignature)) { renderNavigation(); return; }
        removeHome(); dismissLogin(); catalogSignature = signature;
        home = new NativeHome(this, data, new NativeHome.Actions() {
            @Override public void navigate(String path, String title) { navigateTo(path, title, home != null ? home.selectedTab() : activeTab); }
            @Override public void tab(int index) { activeTab = index; renderNavigation(); }
            @Override public void updates() { updater.show(origin); }
            @Override public void downloadApp() { AppDownload.show(MainActivity.this); }
            @Override public void logout() {
                new AlertDialog.Builder(MainActivity.this).setTitle("退出登录").setMessage("确定退出当前账号吗？")
                    .setNegativeButton("取消", null).setPositiveButton("退出", (d,w) -> {
                        leavingSession = true; clearCatalog(); web.setVisibility(View.GONE); beginWorkspaceLoading();
                        if (web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl()))) web.evaluateJavascript("(async()=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),8000);try{await fetch('/api/auth/logout',{method:'POST',signal:c.signal,headers:{Authorization:'Bearer '+localStorage.getItem('spare_parts_auth_token')}})}catch{}finally{clearTimeout(t);localStorage.removeItem('spare_parts_auth_token');localStorage.removeItem('spare_parts_auth_user');location.replace('/login')}})()", null);
                    }).show();
            }
        }, session, activeTab);
        web.setVisibility(View.GONE); toolbar.setVisibility(View.GONE); workspaceLoading.setVisibility(View.GONE); content.addView(home, new FrameLayout.LayoutParams(-1, -1)); renderNavigation();
    }

    private void applyMobileStyles() {
        try (java.io.InputStream in = getAssets().open("mobile.css"); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            String css = out.toString("UTF-8");
            web.evaluateJavascript("(()=>{document.body.classList.add('workbench-android');let s=document.getElementById('android-mobile-style');if(!s){s=document.createElement('style');s.id='android-mobile-style';document.head.appendChild(s)}s.textContent=" + JSONObject.quote(css) + "})()", null);
        } catch (java.io.IOException e) { toast("手机样式加载失败，请重新安装"); }
    }
    private boolean sameOrigin(Uri u) {
        return origin.equals(u.getScheme() + "://" + u.getEncodedAuthority());
    }
    private boolean hasFireAccess() {
        if (catalog == null || leavingSession || loginView != null) return false;
        JSONArray modules = catalog.optJSONArray("modules");
        if (modules == null) return false;
        for (int i = 0; i < modules.length(); i++) {
            JSONObject module = modules.optJSONObject(i); if (module == null) continue;
            if ("/fire-inspection".equals(Uri.parse(module.optString("path")).getPath())) return true;
            JSONArray links = module.optJSONArray("links");
            if (links != null) for (int j = 0; j < links.length(); j++) {
                JSONObject link = links.optJSONObject(j);
                if (link != null && "/fire-inspection".equals(Uri.parse(link.optString("path")).getPath())) return true;
            }
        }
        return false;
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (exports != null && exports.result(request, result, data)) return;
        if (fireTools != null) fireTools.result(request, result, data);
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (fireTools != null) fireTools.permission(request, results);
    }
    private int backRequest, checkingBackGeneration = -1;
    private void businessBack() {
        if (checkingBackGeneration == generation || web == null) return;
        final int expected = generation, request = ++backRequest;
        final WebView source = web;
        checkingBackGeneration = generation;
        handler.postDelayed(() -> {
            if (request != backRequest) return;
            backRequest++; checkingBackGeneration = -1;
            if (expected == generation && source == web && !isFinishing()) toast("页面暂未响应，请重试返回。");
        }, 3000);
        source.evaluateJavascript("(()=>{try{return typeof window.__WORKBENCH_BACK__==='function'?(window.__WORKBENCH_BACK__()?'handled':'clear'):'legacy'}catch{return 'failed'}})()", value -> {
            if (request != backRequest) return;
            backRequest++; checkingBackGeneration = -1;
            if (expected != generation || source != web || isFinishing() || loginView != null || home != null) return;
            if ("\"clear\"".equals(value) || "\"legacy\"".equals(value)) returnToHome();
            else if (!"\"handled\"".equals(value)) toast("页面暂未响应，请重试返回。");
        });
    }
    @Override public void onBackPressed() {
        if (navigating) { cancelNavigation(); if(home!=null)return; }
        if (home != null && home.selectedTab() != 0) { home.select(0); return; }
        if (loginView == null && home == null && web != null && catalog != null) businessBack();
        else if (loginView == null && home == null && web != null && web.canGoBack()) new AlertDialog.Builder(this)
            .setTitle("离开当前页面").setMessage("离开前请确认已保存当前填写内容。")
            .setPositiveButton("已保存，返回", (d,w) -> web.goBack()).setNegativeButton("取消", null).show();
        else new AlertDialog.Builder(this).setMessage("退出数字记录工具？")
            .setPositiveButton("退出", (d,w) -> finish()).setNegativeButton("取消", null).show();
    }
    @Override protected void onResume() { super.onResume(); handler.removeCallbacks(watch); handler.post(watch); if (updater != null) updater.resume(); }
    @Override protected void onPause() { handler.removeCallbacks(watch); super.onPause(); }
    @Override protected void onDestroy() {
        generation++; handler.removeCallbacksAndMessages(null);
        if (privacyConsent != null) privacyConsent.dismiss();
        if (connectionFailure != null) connectionFailure.dismiss();
        if (rendererFailure != null) rendererFailure.dismiss();
        if (updater != null) updater.close();
        if (exports != null) exports.close();
        if (loginView != null) loginView.close();
        if (fireTools != null) fireTools.close();
        if (web != null) { if (content != null) content.removeView(web); web.destroy(); }
        super.onDestroy();
    }
}
