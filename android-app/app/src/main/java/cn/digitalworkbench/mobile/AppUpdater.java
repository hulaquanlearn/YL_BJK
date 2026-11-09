package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Downloads verified updates after sign-in; installation always requires the user's action. */
final class AppUpdater {
    private static final long MAX_APK = 64L * 1024 * 1024;
    private static final String[] CACHE_FILES = {"update.apk", "update.part", "verified.json", "verified.json.part"};
    interface ConnectionFactory { HttpURLConnection open(URL url) throws IOException; }
    interface ArchiveVerifier { void verify(File apk, JSONObject manifest) throws Exception; }
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final SharedPreferences prefs;
    private final File directory;
    private final ConnectionFactory connections;
    private final ArchiveVerifier archiveVerifier;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private final AtomicInteger generation = new AtomicInteger();
    private volatile HttpURLConnection activeConnection;
    private volatile boolean busy, closed;
    private volatile String state = "idle", message = "登录后自动检查并在后台下载新版。";
    private volatile int percent;
    private volatile long cachedBytes;
    private volatile JSONObject available;
    private String origin, announcedHash = "";
    private long nextAutomaticCheck;
    private boolean cacheInitialized;
    private AlertDialog panel;
    private TextView statusText, cacheText, releaseText;
    private LinearLayout cacheRow;
    private Button primary, cleanup;
    private ProgressBar progress;
    private TextView notice;
    void bindNotice(TextView view) { if(notice==view)return;notice=view; if(view!=null){view.setTag("update-notice");view.setOnClickListener(v->{if("ready".equals(state))install();else if(origin!=null)show(origin);});} render(); }

    AppUpdater(Activity activity) { this(activity, url -> (HttpURLConnection)url.openConnection(), null); }
    // These package-private ports keep instrumentation offline; the normal constructor verifies real archives/signatures.
    AppUpdater(Activity activity, ConnectionFactory connections, ArchiveVerifier verifier) {
        this.activity = activity; this.connections = connections;
        archiveVerifier = verifier == null ? this::verifyArchive : verifier;
        prefs = activity.getSharedPreferences("app-updates", 0);
        directory = new File(activity.getFilesDir(), "updates");
    }
    static String version(Activity activity) {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return "未知版本"; }
    }
    private void ui(Runnable action) { activity.runOnUiThread(() -> { if (!closed && !activity.isFinishing() && !activity.isDestroyed()) action.run(); }); }
    private void ui(int operation, Runnable action) { ui(() -> { if (operation == generation.get()) action.run(); }); }
    private void toast(String text) { Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) { TextView view = new TextView(activity); view.setText(value); view.setTextSize(size); view.setTextColor(NativeHome.INK); return view; }
    private void add(LinearLayout body, View view, int top) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(top); body.addView(view, params); }

    AlertDialog show(String server) {
        origin = server;
        if (panel != null && panel.isShowing()) { render(); return panel; }
        LinearLayout body = new LinearLayout(activity); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(22), dp(12), dp(22), dp(18));
        LinearLayout header=new LinearLayout(activity);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(22),dp(8),dp(8),0);
        TextView appName=text(AppInfo.NAME,17);appName.setTypeface(null,android.graphics.Typeface.BOLD);header.addView(appName,new LinearLayout.LayoutParams(0,-2,1));
        ImageButton dismiss=new ImageButton(activity);dismiss.setImageResource(R.drawable.ic_lucide_x);dismiss.setColorFilter(0xff788594);dismiss.setPadding(dp(12),dp(12),dp(12),dp(12));dismiss.setBackgroundResource(android.R.drawable.list_selector_background);dismiss.setContentDescription("关闭更新窗口");dismiss.setTag("update-close");dismiss.setOnClickListener(v->{if(panel!=null)panel.dismiss();});header.addView(dismiss,new LinearLayout.LayoutParams(dp(44),dp(44)));
        TextView versionText=text("当前版本 "+version(activity),12);versionText.setTextColor(0xff788594);add(body,versionText,6);
        statusText = text(message, 15); statusText.setTag("update-status");statusText.setPadding(dp(12),dp(12),dp(12),dp(12));android.graphics.drawable.GradientDrawable statusSurface=new android.graphics.drawable.GradientDrawable();statusSurface.setColor(0xfff3f5f8);statusSurface.setCornerRadius(dp(10));statusText.setBackground(statusSurface);statusText.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); add(body, statusText, 16);
        progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal); progress.setMax(100); progress.setTag("update-progress"); add(body, progress, 8);
        releaseText = text("", 14); add(body, releaseText, 12);
        primary = new Button(activity); primary.setTag("update-primary"); styleButton(primary,true); primary.setOnClickListener(v -> { if ("ready".equals(state)) install(); else check(origin, true); }); add(body, primary, 14);
        cacheRow=new LinearLayout(activity);cacheRow.setGravity(Gravity.CENTER_VERTICAL);cacheText = text("", 12); cacheText.setTextColor(0xff788594);cacheText.setTag("update-cache-size");cacheRow.addView(cacheText,new LinearLayout.LayoutParams(0,-2,1));
        cleanup = new Button(activity); cleanup.setText("清理"); cleanup.setTag("update-cleanup");styleButton(cleanup,false);cleanup.setTextSize(12);cleanup.setOnClickListener(v -> clear());cacheRow.addView(cleanup,new LinearLayout.LayoutParams(dp(76),dp(44)));add(body,cacheRow,10);
        LinearLayout links=new LinearLayout(activity);links.setGravity(Gravity.CENTER_VERTICAL);TextView privacy=text("隐私说明",12);privacy.setTextColor(0xff758297);privacy.setGravity(Gravity.CENTER);privacy.setMinHeight(dp(44));privacy.setOnClickListener(v->AppInfo.showPrivacy(activity,true));links.addView(privacy,new LinearLayout.LayoutParams(0,-2,1));TextView filing=AppInfo.filingLink(activity);filing.setText(AppInfo.FILING);filing.setTextSize(11);filing.setTag("update-filing");filing.setTextColor(0xff758297);links.addView(filing,new LinearLayout.LayoutParams(0,-2,2));add(body,links,10);
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);content.addView(header);content.addView(scroll);
        panel = new AlertDialog.Builder(activity).setView(content).create();
        panel.setOnDismissListener(d -> { panel = null; statusText = null; cacheText = null; releaseText = null; primary = null; cleanup = null; progress = null; });
        panel.show();android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(android.graphics.Color.WHITE);background.setCornerRadius(dp(18));panel.getWindow().setBackgroundDrawable(background);render();
        if (!busy && !"ready".equals(state)) check(server, true);
        return panel;
    }
    private void render() {
        if(notice!=null){boolean visible=available!=null;notice.setVisibility(visible?View.VISIBLE:View.GONE);if(visible)notice.setText("ready".equals(state)?"新版 "+available.optString("versionName")+" 已下载 · 点击安装":"error".equals(state)?"发现新版，下载失败 · 点击重试":"正在下载新版 "+percent+"% · 点击查看");}
        if (panel == null || statusText == null) return;
        statusText.setText(message);
        progress.setVisibility("downloading".equals(state) ? View.VISIBLE : View.GONE); progress.setProgress(percent);
        JSONObject data = available; String notes = data == null ? "" : data.optString("notes");
        releaseText.setText(data == null ? "" : "新版本 " + data.optString("versionName") + (notes.isEmpty() ? "" : "\n" + notes)); releaseText.setVisibility(data == null ? View.GONE : View.VISIBLE);
        primary.setEnabled(!busy); primary.setText("ready".equals(state) ? "安装更新" : "downloading".equals(state) ? "正在下载 " + percent + "%" : "checking".equals(state) ? "正在检查…" : "error".equals(state) ? "重试更新" : "检查更新");
        cacheRow.setVisibility(cachedBytes>0?View.VISIBLE:View.GONE);cacheText.setText(activity.getString(R.string.app_update_cache_size, size(cachedBytes)));
        cleanup.setEnabled(!"clearing".equals(state) && cachedBytes > 0); cleanup.setText("clearing".equals(state) ? "清理中…" : "清理");
    }
    private static String size(long bytes) { return bytes < 1024 ? bytes + " B" : bytes < 1048576 ? String.format(Locale.CHINA, "%.1f KB", bytes / 1024.0) : String.format(Locale.CHINA, "%.2f MB", bytes / 1048576.0); }
    private void styleButton(Button button,boolean filled){button.setAllCaps(false);button.setTextSize(14);button.setMinHeight(dp(48));button.setTextColor(filled?android.graphics.Color.WHITE:NativeHome.INK);android.graphics.drawable.GradientDrawable surface=new android.graphics.drawable.GradientDrawable();surface.setColor(filled?NativeHome.RED:0xfff0f3f7);surface.setCornerRadius(dp(12));button.setBackground(surface);button.setStateListAnimator(null);}
    private PackageInfo installed() throws Exception { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), signatureFlags()); }
    @SuppressWarnings("deprecation") private int signatureFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    @SuppressWarnings("deprecation") private long code(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    @SuppressWarnings("deprecation") private Signature[] signatures(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.signingInfo == null ? new Signature[0] : info.signingInfo.getApkContentsSigners() : info.signatures == null ? new Signature[0] : info.signatures;
    }
    private Set<String> signers(PackageInfo info) throws Exception {
        Set<String> result = new HashSet<>(); for (Signature signature : signatures(info)) result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()))); return result;
    }
    private static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString(); }
    private HttpURLConnection connect(URL url) throws IOException {
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getRef() != null) throw new IOException("更新地址必须使用 HTTPS");
        HttpURLConnection connection = connections.open(url); activeConnection = connection;
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json, application/vnd.android.package-archive");
        if (cancelled.get() || closed) { connection.disconnect(); throw new InterruptedIOException(); }
        try { int status = connection.getResponseCode(); if (status != 200) throw new IOException(status == 404 ? "该服务器尚未发布 App 更新" : "更新服务器暂不可用（" + status + "）"); return connection; }
        catch (IOException error) { connection.disconnect(); throw error; }
    }
    private JSONObject readJson(InputStream input) throws Exception {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count; while ((count = in.read(buffer)) != -1) { if (out.size() + count > 32768) throw new IOException("版本信息过大"); out.write(buffer, 0, count); }
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        }
    }
    private JSONObject validateManifest(String server, JSONObject data) throws Exception {
        if (!NativeAuth.validOrigin(server) || data.getInt("schema") != 1 || !activity.getPackageName().equals(data.getString("packageName")) || data.getLong("versionCode") < 1
                || !data.getString("sha256").matches("[a-fA-F0-9]{64}") || data.getLong("size") < 1 || data.getLong("size") > MAX_APK
                || data.getString("versionName").isEmpty() || data.getString("versionName").length() > 100 || data.optString("notes").length() > 6000) throw new IOException("版本信息无效");
        URL base = new URL(server), apk = new URL(data.getString("url"));
        if (!"https".equals(apk.getProtocol()) || !base.getHost().equalsIgnoreCase(apk.getHost()) || base.getPort() != apk.getPort()
                || apk.getUserInfo() != null || apk.getRef() != null || apk.getQuery() != null || !apk.getPath().startsWith("/app-updates/android/") || !apk.getPath().endsWith(".apk") || apk.getPath().contains("..")) throw new IOException("安装包地址与更新服务器不一致");
        return data;
    }
    private JSONObject manifest(String server) throws Exception {
        HttpURLConnection connection = connect(new URL(server + "/app-updates/android/latest.json"));
        try { return validateManifest(server, readJson(connection.getInputStream())); } finally { connection.disconnect(); activeConnection = null; }
    }
    private void ensureCurrent(int operation) throws InterruptedIOException { if (cancelled.get() || closed || operation != generation.get() || Thread.currentThread().isInterrupted()) throw new InterruptedIOException(); }
    private void update(int operation, String next, String text) { ui(operation, () -> { state = next; message = text; render(); }); }

    void check(String server, boolean manual) {
        if (closed || busy) return;
        if (!NativeAuth.validOrigin(server)) { if (manual) { state = "error"; message = "在线更新需要 HTTPS 服务器"; render(); } return; }
        long now = System.currentTimeMillis();
        if (!manual && (now < nextAutomaticCheck || now - prefs.getLong("last-check:" + server, 0) < 5 * 60000L)) {
            if (!cacheInitialized) restoreCache(server);
            return;
        }
        cacheInitialized = true;
        origin = server; nextAutomaticCheck = now + 5 * 60000L; busy = true; cancelled.set(false); int operation = generation.incrementAndGet();
        state = "checking"; message = "正在检查更新…"; percent = 0; render();
        worker.execute(() -> {
            JSONObject cached = null;
            try {
                cached = cached(server); ensureCurrent(operation);
                JSONObject data;
                try { data = manifest(server); } catch (Exception error) { if (cached == null) throw error; ensureCurrent(operation); ready(operation, cached, true); return; }
                ensureCurrent(operation); long current = code(installed());
                if (data.getLong("versionCode") <= current) {
                    deleteCache(); prefs.edit().putLong("last-check:" + server, now).apply();
                    ui(operation, () -> { busy = false; available = null; state = "latest"; cachedBytes = 0; message = "当前已是最新版本。"; render(); }); return;
                }
                if (data.optInt("minSdk", 26) > Build.VERSION.SDK_INT) {
                    ui(operation, () -> { busy = false; available = null; state = "unsupported"; message = "新版暂不支持当前安卓系统。"; render(); }); return;
                }
                if (cached != null && sameRelease(cached, data)) { ready(operation, data, true); return; }
                JSONObject release = data; ui(operation, () -> { available = release;state="downloading";message="发现新版本，正在后台下载…";render(); });
                download(operation, data); ensureCurrent(operation); ready(operation, data, false);
            } catch (Exception error) {
                try { deleteOwned("update.part"); deleteOwned("verified.json.part"); } catch (IOException ignored) {}
                ui(operation, () -> { busy = false; state = "error"; message = cancelled.get() ? "下载已取消，可稍后重试。" : friendly(error); cachedBytes = cacheSize(); render(); });
            }
        });
    }
    private void restoreCache(String server) {
        cacheInitialized = true; origin = server; busy = true; cancelled.set(false); int operation = generation.incrementAndGet();
        state = "checking"; message = "正在检查本机安装包…"; render();
        worker.execute(() -> {
            try {
                JSONObject data = cached(server); ensureCurrent(operation);
                if (data != null) { ready(operation, data, true); return; }
                ui(operation, () -> { busy = false; available = null; state = "idle"; cachedBytes = cacheSize(); message = "后台更新已启用，可随时手动检查。"; render(); });
            } catch (Exception error) {
                ui(operation, () -> { busy = false; state = "error"; cachedBytes = cacheSize(); message = friendly(error); render(); });
            }
        });
    }
    private boolean sameRelease(JSONObject first, JSONObject second) { return first.optLong("versionCode") == second.optLong("versionCode") && first.optLong("size") == second.optLong("size") && first.optString("sha256").equalsIgnoreCase(second.optString("sha256")) && first.optString("url").equals(second.optString("url")); }
    private JSONObject cached(String server) throws Exception {
        deleteOwned("update.part"); deleteOwned("verified.json.part");
        File metadata = new File(directory, "verified.json"), apk = new File(directory, "update.apk");
        if (!metadata.isFile() || !apk.isFile()) { deleteCache(); return null; }
        try {
            JSONObject data = validateManifest(server, readJson(new FileInputStream(metadata)));
            if (data.getLong("versionCode") <= code(installed()) || data.optInt("minSdk", 26) > Build.VERSION.SDK_INT) { deleteCache(); return null; }
            verify(apk, data); cachedBytes = cacheSize(); return data;
        } catch (Exception error) { deleteCache(); return null; }
    }
    private void ready(int operation, JSONObject data, boolean restored) {
        ui(operation, () -> {
            busy = false; available = data; state = "ready"; percent = 100; cachedBytes = cacheSize(); message = "新版本已下载，可在方便时安装。"; render();
            nextAutomaticCheck = System.currentTimeMillis() + 3600000L;
            if (origin != null) prefs.edit().putLong("last-check:" + origin, System.currentTimeMillis()).apply();
            String hash = data.optString("sha256"); if (!restored && !hash.equals(announcedHash)) { announcedHash = hash; toast("新版本已下载，可在“我的 → 检查更新”安装。"); }
        });
    }
    private String friendly(Exception error) {
        if (error instanceof java.net.SocketTimeoutException) return "连接超时，请检查网络后重试。";
        return error instanceof IOException && error.getMessage() != null && error.getMessage().matches("[\\p{IsHan}].*") ? error.getMessage() : "更新失败，请检查网络后重试。";
    }
    private void download(int operation, JSONObject data) throws Exception {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建更新目录");
        File partial = new File(directory, "update.part"); update(operation, "downloading", "发现新版本，正在后台下载…");
        HttpURLConnection connection = connect(new URL(data.getString("url")));
        try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(partial)) {
            long expected = data.getLong("size"), total = 0; int previous = -1, count; byte[] buffer = new byte[32768];
            while ((count = in.read(buffer)) != -1) {
                ensureCurrent(operation); total += count; if (total > expected || total > MAX_APK) throw new IOException("安装包大小不符，请重试"); out.write(buffer, 0, count);
                int value = (int)(total * 100 / expected); if (value != previous) { previous = value; long downloaded = total; ui(operation, () -> { percent = value; cachedBytes = cacheSize(); message = "正在后台下载 " + value + "%（" + size(downloaded) + " / " + size(expected) + "）"; render(); }); }
            }
            ensureCurrent(operation); if (total != expected) throw new IOException("下载不完整，请重试"); out.getFD().sync();
        } finally { connection.disconnect(); activeConnection = null; }
        ensureCurrent(operation); update(operation, "checking", "下载完成，正在校验安装包…"); verify(partial, data); ensureCurrent(operation);
        File metadata = new File(directory, "verified.json.part");
        try (FileOutputStream out = new FileOutputStream(metadata)) { out.write(data.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
        ensureCurrent(operation);
        Files.move(partial.toPath(), new File(directory, "update.apk").toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        Files.move(metadata.toPath(), new File(directory, "verified.json").toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
    private void verify(File apk, JSONObject data) throws Exception {
        if (apk.length() != data.getLong("size")) throw new IOException("安装包大小校验失败");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(apk)) { byte[] buffer = new byte[32768]; int count; while ((count = in.read(buffer)) != -1) digest.update(buffer, 0, count); }
        if (!hex(digest.digest()).equalsIgnoreCase(data.getString("sha256"))) throw new IOException("安装包校验失败，请重新下载");
        archiveVerifier.verify(apk, data);
    }
    private void verifyArchive(File apk, JSONObject data) throws Exception {
        PackageInfo candidate = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signatureFlags()), current = installed();
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName) || code(candidate) != data.getLong("versionCode") || code(candidate) <= code(current)) throw new IOException("安装包版本或应用标识不符");
        Set<String> expected = signers(current); if (expected.isEmpty() || !expected.equals(signers(candidate))) throw new IOException("安装包签名不符；体验版与正式版不能互相覆盖");
    }
    private long cacheSize() { long bytes = 0; for (String name : CACHE_FILES) { File file = new File(directory, name); if (file.isFile()) bytes += file.length(); } return bytes; }
    private void deleteOwned(String name) throws IOException {
        File expected = new File(activity.getFilesDir().getCanonicalFile(), "updates"), file = new File(directory, name);
        if (!directory.getCanonicalFile().equals(expected) || !Arrays.asList(CACHE_FILES).contains(name) || !file.getCanonicalFile().getParentFile().equals(expected)) throw new IOException("更新缓存路径无效");
        if (file.exists() && (!file.isFile() || !file.delete())) throw new IOException("安装包清理失败，请重试");
    }
    private void deleteCache() throws IOException { for (String name : CACHE_FILES) deleteOwned(name); prefs.edit().remove("waiting-install").remove("waiting-origin").apply(); }
    void clear() {
        if (closed || "clearing".equals(state)) return;
        cancelled.set(true); int operation = generation.incrementAndGet(); busy = true; nextAutomaticCheck = System.currentTimeMillis() + 24 * 3600000L;
        if (origin != null) prefs.edit().putLong("last-check:" + origin, System.currentTimeMillis()).apply();
        prefs.edit().remove("waiting-install").remove("waiting-origin").apply();
        HttpURLConnection connection = activeConnection; if (connection != null) connection.disconnect();
        state = "clearing"; message = "正在停止下载并清理安装包…"; render();
        worker.execute(() -> {
            try { deleteCache(); ui(operation, () -> { busy = false; available = null; cachedBytes = 0; percent = 0; state = "idle"; message = "安装包已清理；需要时可重新检查更新。"; render(); }); }
            catch (IOException error) { ui(operation, () -> { busy = false; state = "error"; cachedBytes = cacheSize(); message = friendly(error); render(); }); }
        });
    }
    private void install() {
        if (closed || busy || !NativeAuth.validOrigin(origin)) return;
        busy = true; cancelled.set(false); int operation = generation.incrementAndGet(); state = "checking"; message = "正在核验安装包…"; render(); String server = origin;
        worker.execute(() -> {
            try {
                JSONObject data = validateManifest(server, readJson(new FileInputStream(new File(directory, "verified.json")))); verify(new File(directory, "update.apk"), data); ensureCurrent(operation);
                ui(operation, () -> { busy = false; state = "ready"; message = "新版本已下载，可在方便时安装。"; render();
                    if (!activity.getPackageManager().canRequestPackageInstalls()) {
                        new AlertDialog.Builder(activity).setTitle("允许安装应用更新").setMessage("请在系统设置中允许数字记录工具安装应用更新，然后返回继续。")
                            .setNegativeButton("稍后", null).setPositiveButton("前往设置", (d,w) -> {
                                try { prefs.edit().putBoolean("waiting-install", true).putString("waiting-origin", server).apply(); activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
                                catch (RuntimeException error) { prefs.edit().remove("waiting-install").remove("waiting-origin").apply(); toast("无法打开设置，请在系统设置中允许安装应用"); }
                            }).show(); return;
                    }
                    Uri uri = Uri.parse("content://" + activity.getPackageName() + ".updates/apk");
                    Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); intent.setClipData(ClipData.newRawUri("App update", uri));
                    try { activity.startActivity(intent); } catch (RuntimeException error) { toast("系统安装器不可用，请稍后重试"); }
                });
            } catch (Exception error) { ui(operation, () -> { busy = false; state = "error"; message = friendly(error); render(); }); }
        });
    }
    void resume() {
        if (prefs.getBoolean("waiting-install", false)) {
            origin = prefs.getString("waiting-origin", ""); prefs.edit().remove("waiting-install").remove("waiting-origin").apply();
            if (activity.getPackageManager().canRequestPackageInstalls()) install(); else toast("未授予安装权限，可稍后重新检查更新");
        }
    }
    void close() { closed = true; cancelled.set(true); generation.incrementAndGet(); HttpURLConnection connection = activeConnection; if (connection != null) connection.disconnect(); worker.shutdownNow(); if (panel != null) panel.dismiss(); }
}
