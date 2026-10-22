package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit, verified APK upgrades; credentials and business data are never sent to the update endpoint. */
final class AppUpdater {
    private static final long MAX_APK = 64L * 1024 * 1024;
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final SharedPreferences prefs;
    private final File directory;
    private boolean busy;
    private volatile boolean closed;
    private ProgressDialog progress;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    AppUpdater(Activity activity) {
        this.activity = activity; prefs = activity.getSharedPreferences("app-updates", 0);
        directory = new File(activity.getFilesDir(), "updates");
    }
    static String version(Activity activity) {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return "未知版本"; }
    }
    private void ui(Runnable action) { activity.runOnUiThread(() -> { if (!closed && !activity.isFinishing() && !activity.isDestroyed()) action.run(); }); }
    private void toast(String message) { Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }
    private PackageInfo installed() throws Exception { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), signatureFlags()); }
    @SuppressWarnings("deprecation") private int signatureFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    @SuppressWarnings("deprecation") private long code(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    @SuppressWarnings("deprecation") private Signature[] signatures(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.signingInfo == null ? new Signature[0] : info.signingInfo.getApkContentsSigners() : info.signatures == null ? new Signature[0] : info.signatures;
    }
    private Set<String> signers(PackageInfo info) throws Exception {
        Set<String> result = new HashSet<>();
        for (Signature signature : signatures(info)) result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        return result;
    }
    private static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString(); }
    private HttpURLConnection connect(URL url) throws IOException {
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getRef() != null) throw new IOException("更新地址必须使用 HTTPS");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection(); connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json, application/vnd.android.package-archive");
        if (connection.getResponseCode() != 200) { int status = connection.getResponseCode(); connection.disconnect(); throw new IOException(status == 404 ? "该服务器尚未发布 App 更新" : "更新服务器暂不可用（" + status + "）"); }
        return connection;
    }
    private JSONObject manifest(String origin) throws Exception {
        HttpURLConnection connection = connect(new URL(origin + "/app-updates/android/latest.json"));
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) { if (out.size() + n > 32768) throw new IOException("版本信息过大"); out.write(buffer, 0, n); }
            JSONObject data = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            if (data.getInt("schema") != 1 || !activity.getPackageName().equals(data.getString("packageName")) || data.getLong("versionCode") < 1
                    || !data.getString("sha256").matches("[a-fA-F0-9]{64}") || data.getLong("size") < 1 || data.getLong("size") > MAX_APK
                    || data.getString("versionName").length() > 100 || data.optString("notes").length() > 6000) throw new IOException("版本信息无效");
            URL base = new URL(origin), apk = new URL(data.getString("url"));
            if (!"https".equals(apk.getProtocol()) || !base.getHost().equalsIgnoreCase(apk.getHost()) || base.getPort() != apk.getPort()
                    || apk.getUserInfo() != null || apk.getRef() != null || apk.getQuery() != null || !apk.getPath().startsWith("/app-updates/android/") || !apk.getPath().endsWith(".apk")) throw new IOException("安装包地址与更新服务器不一致");
            return data;
        } finally { connection.disconnect(); }
    }
    void check(String origin, boolean manual) {
        if (busy) { if (manual) toast("正在处理更新，请稍候"); return; }
        if (origin == null || !origin.startsWith("https://")) { if (manual) toast("在线更新需要 HTTPS 服务器"); return; }
        long now = System.currentTimeMillis();
        if (!manual && now - prefs.getLong("last-check:" + origin, 0) < 24 * 3600000L) return;
        busy = true; if (manual) toast("正在检查更新…");
        worker.execute(() -> {
            try {
                JSONObject data = manifest(origin); long current = code(installed());
                prefs.edit().putLong("last-check:" + origin, now).apply();
                ui(() -> { busy = false;
                    if (data.optLong("versionCode") <= current) { if (manual) new AlertDialog.Builder(activity).setTitle("已是最新版本").setMessage("当前版本：" + version(activity) + "\n业务页面随服务器更新，无需重装。").setPositiveButton("知道了", null).show(); return; }
                    if (data.optInt("minSdk", 26) > Build.VERSION.SDK_INT) { if (manual) toast("新版暂不支持当前安卓系统"); return; }
                    new AlertDialog.Builder(activity).setTitle("发现新版本 " + data.optString("versionName"))
                        .setMessage(data.optString("notes", "功能优化与问题修复") + "\n\n大小：" + String.format(Locale.CHINA, "%.1f MB", data.optLong("size") / 1048576.0) + "\n覆盖安装会保留账号配置，安装时需你确认。")
                        .setNegativeButton("稍后", null).setPositiveButton("下载更新", (d,w) -> download(data)).show();
                });
            } catch (Exception e) { ui(() -> { busy = false; if (manual) toast(friendly(e)); }); }
        });
    }
    private String friendly(Exception e) {
        if (e instanceof java.net.SocketTimeoutException) return "连接超时，请检查网络后重试";
        return e instanceof IOException && e.getMessage() != null && e.getMessage().matches("[\\p{IsHan}].*") ? e.getMessage() : "更新失败，请检查网络后重试";
    }
    private void download(JSONObject data) {
        if (busy) return; busy = true; cancelled.set(false);
        progress = new ProgressDialog(activity); progress.setTitle("下载更新"); progress.setMessage("下载后会校验安装包，请稍候"); progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL); progress.setMax(100);
        progress.setCancelable(true); progress.setCanceledOnTouchOutside(false); progress.setOnCancelListener(d -> cancelled.set(true)); progress.show();
        worker.execute(() -> {
            File partial = new File(directory, "update.part");
            try {
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建更新目录");
                HttpURLConnection connection = connect(new URL(data.getString("url")));
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(partial)) {
                    long expected = data.getLong("size"), total = 0; int lastPercent = -1; byte[] buffer = new byte[32768]; int n;
                    while ((n = in.read(buffer)) != -1) {
                        if (cancelled.get() || closed || Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                        total += n; if (total > expected || total > MAX_APK) throw new IOException("安装包大小不符，请重试"); out.write(buffer, 0, n);
                        int percent = (int)(total * 100 / expected); if (percent != lastPercent) { lastPercent = percent; ui(() -> progress.setProgress(percent)); }
                    }
                    if (total != expected) throw new IOException("下载不完整，请重试"); out.getFD().sync();
                } finally { connection.disconnect(); }
                verify(partial, data);
                File apk = new File(directory, "update.apk"); if (apk.exists() && !apk.delete()) throw new IOException("无法替换缓存安装包");
                if (!partial.renameTo(apk)) throw new IOException("保存安装包失败");
                try (FileOutputStream out = new FileOutputStream(new File(directory, "verified.json"))) { out.write(data.toString().getBytes(StandardCharsets.UTF_8)); }
                ui(() -> { busy = false; progress.dismiss(); install(); });
            } catch (Exception e) { partial.delete(); ui(() -> { busy = false; progress.dismiss(); if (!cancelled.get()) toast(friendly(e)); }); }
        });
    }
    private void verify(File apk, JSONObject data) throws Exception {
        if (apk.length() != data.getLong("size")) throw new IOException("安装包大小校验失败");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(apk)) { byte[] buffer = new byte[32768]; int n; while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n); }
        if (!hex(digest.digest()).equalsIgnoreCase(data.getString("sha256"))) throw new IOException("安装包校验失败，请重新下载");
        PackageInfo candidate = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signatureFlags()), current = installed();
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName) || code(candidate) != data.getLong("versionCode") || code(candidate) <= code(current)) throw new IOException("安装包版本或应用标识不符");
        Set<String> expected = signers(current);
        if (expected.isEmpty() || !expected.equals(signers(candidate))) throw new IOException("安装包签名不符；体验版与正式版不能互相覆盖");
    }
    private void install() {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity).setTitle("允许安装应用更新").setMessage("请在系统设置中允许数字工作台安装应用更新，然后返回继续。")
                .setNegativeButton("稍后", null).setPositiveButton("前往设置", (d,w) -> {
                    try { prefs.edit().putBoolean("waiting-install", true).apply(); activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
                    catch (RuntimeException e) { prefs.edit().putBoolean("waiting-install", false).apply(); toast("无法打开设置，请在系统设置中允许安装应用"); }
                }).show(); return;
        }
        if (busy) return; busy = true;
        worker.execute(() -> {
            try {
                File apk = new File(directory, "update.apk"), metadata = new File(directory, "verified.json");
                if (metadata.length() > 32768) throw new IOException("更新信息无效，请重新检查更新");
                JSONObject data; try (InputStream in = new FileInputStream(metadata); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) { if (out.size() + n > 32768) throw new IOException("更新信息无效"); out.write(buffer, 0, n); }
                    data = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
                }
                verify(apk, data);
                ui(() -> { busy = false;
                    Uri uri = Uri.parse("content://" + activity.getPackageName() + ".updates/apk");
                    Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.setClipData(ClipData.newRawUri("App update", uri));
                    try { activity.startActivity(intent); } catch (RuntimeException e) { toast("系统安装器不可用，请稍后重试"); }
                });
            } catch (Exception e) { ui(() -> { busy = false; toast(friendly(e)); }); }
        });
    }
    void resume() {
        if (prefs.getBoolean("waiting-install", false)) {
            prefs.edit().putBoolean("waiting-install", false).apply();
            if (activity.getPackageManager().canRequestPackageInstalls()) install(); else toast("未授予安装权限，可稍后重新检查更新");
        }
    }
    void close() { closed = true; cancelled.set(true); worker.shutdownNow(); if (progress != null) progress.dismiss(); }
}
