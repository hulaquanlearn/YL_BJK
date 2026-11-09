package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.webkit.WebView;
import android.widget.Button;
import org.json.JSONObject;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Offline update transport plus real byte checks; no production request, account or installation is used. */
final class UpdateChecks {
    private final Instrumentation instrumentation;
    private int checks;
    private final String origin = "https://updates-qa.invalid";
    UpdateChecks(Instrumentation instrumentation) { this.instrumentation = instrumentation; }
    private void require(boolean condition, String text) { if (!condition) throw new AssertionError("Update check " + (checks + 1) + ": " + text); checks++; }
    private Object field(Object target, String name) throws Exception { Field value = target.getClass().getDeclaredField(name); value.setAccessible(true); return value.get(target); }
    private void main(Runnable action) { instrumentation.runOnMainSync(action); }
    private String state(AppUpdater updater) throws Exception { return String.valueOf(field(updater, "state")); }
    private void waitState(AppUpdater updater, String expected) throws Exception {
        for (int i = 0; i < 300; i++) { instrumentation.waitForIdleSync(); if (expected.equals(state(updater)) && !(boolean)field(updater, "busy")) return; Thread.sleep(25); }
        throw new AssertionError("Expected " + expected + ", got " + state(updater) + ": " + field(updater, "message"));
    }
    private static String hash(byte[] bytes) throws Exception { StringBuilder result = new StringBuilder(); for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format(Locale.ROOT, "%02x", value & 255)); return result.toString(); }
    private void write(File file, byte[] bytes) throws Exception { File parent = file.getParentFile(); if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Test directory unavailable"); try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); } }
    private byte[] read(File file) throws Exception { try (FileInputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) { byte[] bytes = new byte[4096]; int count; while ((count = in.read(bytes)) != -1) out.write(bytes, 0, count); return out.toByteArray(); } }
    private JSONObject release(Activity activity, long code, byte[] payload) throws Exception {
        return new JSONObject().put("schema", 1).put("packageName", activity.getPackageName()).put("versionCode", code).put("versionName", "isolated-update-" + code).put("minSdk", 26)
            .put("url", origin + "/app-updates/android/test-" + code + ".apk").put("size", payload.length).put("sha256", hash(payload)).put("notes", "隔离更新回归");
    }
    private final class Source implements AppUpdater.ConnectionFactory {
        final AtomicInteger manifests = new AtomicInteger(), artifacts = new AtomicInteger();
        final AtomicReference<JSONObject> release = new AtomicReference<>();
        final byte[] payload;
        volatile int response = 200;
        volatile boolean block;
        final CountDownLatch blocked = new CountDownLatch(1), released = new CountDownLatch(1);
        volatile boolean redirected, credentialSent;
        Source(byte[] payload) { this.payload = payload; }
        @Override public HttpURLConnection open(URL url) throws IOException {
            boolean manifest = url.getPath().endsWith("latest.json"); if (manifest) manifests.incrementAndGet(); else artifacts.incrementAndGet();
            byte[] data = manifest ? release.get().toString().getBytes(StandardCharsets.UTF_8) : payload;
            return new HttpURLConnection(url) {
                volatile boolean disconnected;
                public void connect() {}
                public boolean usingProxy() { return false; }
                public void disconnect() { disconnected = true; if (!manifest && block) released.countDown(); }
                public int getResponseCode() { redirected |= getInstanceFollowRedirects(); credentialSent |= getRequestProperty("Authorization") != null || getRequestProperty("Cookie") != null; return response; }
                public InputStream getInputStream() {
                    ByteArrayInputStream bytes = new ByteArrayInputStream(data);
                    return new InputStream() {
                        int reads;
                        public int read() throws IOException { byte[] one = new byte[1]; int count = read(one, 0, 1); return count < 0 ? -1 : one[0] & 255; }
                        public int read(byte[] buffer, int offset, int length) throws IOException {
                            if (!manifest && block && reads++ > 0) { blocked.countDown(); try { if (!released.await(10, TimeUnit.SECONDS)) throw new IOException("Test download wait timeout"); } catch (InterruptedException error) { throw new InterruptedIOException(); } }
                            if (disconnected) throw new InterruptedIOException();
                            return bytes.read(buffer, offset, Math.min(length, 2048));
                        }
                    };
                }
            };
        }
    }
    private AppUpdater create(Activity screen, Source source, AtomicInteger verified) {
        AtomicReference<AppUpdater> result = new AtomicReference<>(); main(() -> result.set(new AppUpdater(screen, source, verified == null ? null : (file, manifest) -> verified.incrementAndGet()))); return result.get();
    }
    private void rejectsManifest(AppUpdater updater, JSONObject data, String label) throws Exception {
        Method validate = AppUpdater.class.getDeclaredMethod("validateManifest", String.class, JSONObject.class); validate.setAccessible(true);
        boolean rejected = false; try { validate.invoke(updater, origin, data); } catch (InvocationTargetException expected) { rejected = true; }
        require(rejected, label);
    }
    int run() throws Exception {
        Context context = instrumentation.getTargetContext(); AppInfo.accept(context);
        SharedPreferences prefs = context.getSharedPreferences("app-updates", Context.MODE_PRIVATE); prefs.edit().remove("last-check:" + origin).remove("waiting-install").remove("waiting-origin").commit();
        Activity screen = instrumentation.startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<AppUpdater> current = new AtomicReference<>();
        File directory = new File(screen.getFilesDir(), "updates"), protectedFile = new File(screen.getFilesDir(), "updates-qa-protected.txt");
        File protectedPhoto = new File(screen.getCacheDir(), "fire-photos/update-qa-protected.jpg");
        byte[] marker = "updates-isolated-protected".getBytes(StandardCharsets.UTF_8), payload = new byte[8192]; Arrays.fill(payload, (byte)0x4b);
        try {
            main(() -> { try { ((Handler)field(screen, "handler")).removeCallbacksAndMessages(null); ((WebView)field(screen, "web")).stopLoading(); ((AppUpdater)field(screen, "updater")).close(); } catch (Exception error) { throw new RuntimeException(error); } });
            long installed = screen.getPackageManager().getPackageInfo(screen.getPackageName(), 0).getLongVersionCode();
            Source source = new Source(payload); source.release.set(release(screen, installed + 1, payload)); AtomicInteger verified = new AtomicInteger();
            AppUpdater updater = create(screen, source, verified); current.set(updater);
            main(updater::clear); waitState(updater, "idle"); prefs.edit().remove("last-check:" + origin).commit();
            // A fresh instance models the first valid sign-in after application startup.
            main(updater::close); updater = create(screen, source, verified); current.set(updater); AppUpdater first = updater;
            main(() -> first.check(origin, false)); waitState(first, "ready");
            require(source.manifests.get() == 1 && source.artifacts.get() == 1, "automatic check downloads once");
            require(verified.get() == 1, "archive verification follows byte validation");
            require(field(first, "panel") == null, "background download opens no modal window");
            android.widget.TextView notice=new android.widget.TextView(screen);main(()->first.bindNotice(notice));
            require(notice.getVisibility()==android.view.View.VISIBLE&&notice.getText().toString().contains("点击安装"),"verified update has a persistent install notice outside the update panel");
            require(!prefs.getBoolean("waiting-install", false), "background completion does not request installation");
            require(!source.redirected && !source.credentialSent, "transport refuses redirects and sends no login credentials");
            require(Arrays.equals(read(new File(directory, "update.apk")), payload), "verified APK persisted");
            require(new JSONObject(new String(read(new File(directory, "verified.json")), StandardCharsets.UTF_8)).getLong("versionCode") == installed + 1, "matching metadata persisted");
            AppUpdater restored = create(screen, source, verified);
            try {
                main(() -> restored.check(origin, false)); waitState(restored, "ready");
                require(source.manifests.get() == 1 && source.artifacts.get() == 1, "restart restores verified cache without bypassing check interval");
                require((long)field(restored, "cachedBytes") > payload.length, "restored cache reports APK and metadata size");
            } finally { main(restored::close); }
            main(() -> { for (int i = 0; i < 8; i++) first.check(origin, false); }); Thread.sleep(100);
            require(source.manifests.get() == 1 && source.artifacts.get() == 1, "login polling does not repeat ready download");
            AtomicReference<AlertDialog> panel = new AtomicReference<>(); main(() -> panel.set(first.show(origin)));
            main(() -> { require("安装更新".contentEquals(((Button)panel.get().findViewById(android.R.id.content).findViewWithTag("update-primary")).getText()), "download can be installed later"); require(panel.get().findViewById(android.R.id.content).findViewWithTag("update-cleanup").isEnabled(), "download cache can be cleared"); });
            main(() -> panel.get().dismiss());
            int before = source.artifacts.get(); main(() -> first.check(origin, true)); waitState(first, "ready");
            require(source.artifacts.get() == before && verified.get() >= 2, "existing cache is reverified and reused");
            write(new File(directory, "update.apk"), new byte[payload.length]); main(() -> first.check(origin, true)); waitState(first, "ready");
            require(source.artifacts.get() == before + 1, "corrupt cache is discarded and downloaded again");
            write(protectedFile, marker); write(protectedPhoto, marker);
            SharedPreferences credentials = screen.getSharedPreferences("update-qa-protected", Context.MODE_PRIVATE); credentials.edit().putString("account", "qa-account").commit();
            source.release.set(release(screen, installed + 2, payload)); source.block = true; main(() -> first.check(origin, true));
            require(source.blocked.await(8, TimeUnit.SECONDS), "fixture reached an in-flight download"); instrumentation.waitForIdleSync();
            require("downloading".equals(state(first)), "download progress uses active transfer state");
            require(new File(directory, "update.part").length() > 0 && new File(directory, "update.part").length() < payload.length, "cleanup is exercised before transfer completes");
            main(() -> { panel.set(first.show(origin)); panel.get().dismiss(); }); require((boolean)field(first, "busy"), "closing update panel leaves background transfer running");
            prefs.edit().putBoolean("waiting-install", true).putString("waiting-origin", origin).commit();
            main(first::clear); waitState(first, "idle");
            require(!new File(directory, "update.apk").exists() && !new File(directory, "update.part").exists(), "cleanup cancels and removes complete/partial APK");
            require(!new File(directory, "verified.json").exists() && !new File(directory, "verified.json.part").exists(), "cleanup removes metadata after transfer stops");
            require(!prefs.contains("waiting-install") && !prefs.contains("waiting-origin"), "cleanup cancels installation resume");
            require(Arrays.equals(read(protectedFile), marker) && Arrays.equals(read(protectedPhoto), marker) && "qa-account".equals(credentials.getString("account", "")), "cleanup preserves photos and account data");
            int afterClear = source.manifests.get(); main(() -> { for (int i = 0; i < 8; i++) first.check(origin, false); }); Thread.sleep(100);
            require(source.manifests.get() == afterClear && !(boolean)field(first, "busy"), "cleanup suppresses immediate automatic redownload");
            main(first::close); Source retry = new Source(payload); retry.release.set(release(screen, installed + 2, payload)); updater = create(screen, retry, verified); current.set(updater); AppUpdater second = updater;
            main(() -> second.check(origin, false)); Thread.sleep(100); require(retry.manifests.get() == 0, "cleanup suppression survives updater recreation");
            main(() -> second.check(origin, true)); waitState(second, "ready"); require(retry.artifacts.get() == 1, "manual check overrides cleanup suppression");
            main(second::clear); waitState(second, "idle");
            retry.release.set(release(screen, installed, payload)); main(() -> second.check(origin, true)); waitState(second, "latest");
            int latest = retry.manifests.get(); main(() -> { for (int i = 0; i < 8; i++) second.check(origin, false); }); Thread.sleep(100); require(retry.manifests.get() == latest, "latest-version result suppresses login polling");
            prefs.edit().putLong("last-check:"+origin,System.currentTimeMillis()-6*60000L).commit();
            main(()->{try{Field gate=AppUpdater.class.getDeclaredField("nextAutomaticCheck");gate.setAccessible(true);gate.setLong(second,0L);second.check(origin,false);}catch(Exception error){throw new RuntimeException(error);}});waitState(second,"latest");require(retry.manifests.get()==latest+1,"a new version check is allowed after five minutes, not an hour");
            retry.response = 503; main(() -> second.check(origin, true)); waitState(second, "error");
            int failed = retry.manifests.get(); main(() -> { for (int i = 0; i < 8; i++) second.check(origin, false); }); Thread.sleep(100); require(retry.manifests.get() == failed, "failure backoff suppresses login polling");
            retry.response = 200; retry.release.set(release(screen, installed + 3, payload).put("sha256", "0".repeat(64))); main(() -> second.check(origin, true)); waitState(second, "error");
            require(!new File(directory, "update.part").exists() && !new File(directory, "update.apk").exists(), "hash mismatch cannot become an installable cache");
            require(verified.get() >= 2, "successful paths have exercised archive verifier");
            JSONObject valid = release(screen, installed + 3, payload);
            for (String url : new String[]{"http://updates-qa.invalid/app-updates/android/a.apk", "https://other-qa.invalid/app-updates/android/a.apk", origin + "/app-updates/android/a.apk?token=x", origin + "/app-updates/android/a.apk#x", "https://name:secret@updates-qa.invalid/app-updates/android/a.apk", origin + "/app-updates/android/../a.apk"}) rejectsManifest(second, new JSONObject(valid.toString()).put("url", url), "unsafe APK address rejected");
            rejectsManifest(second, new JSONObject(valid.toString()).put("size", 65L * 1024 * 1024), "oversized APK rejected");
            rejectsManifest(second, new JSONObject(valid.toString()).put("packageName", "other.qa"), "manifest package mismatch rejected");
            rejectsManifest(second, new JSONObject(valid.toString()).put("sha256", "invalid"), "invalid digest rejected");
            main(second::close); Source realVerification = new Source(payload); realVerification.release.set(valid); updater = create(screen, realVerification, null); current.set(updater); AppUpdater normal = updater;
            main(() -> normal.check(origin, true)); waitState(normal, "error");
            require(!new File(directory, "update.apk").exists() && !new File(directory, "verified.json").exists(), "normal verifier rejects a hashed non-APK payload");
            Method archive = AppUpdater.class.getDeclaredMethod("verifyArchive", File.class, JSONObject.class); archive.setAccessible(true); boolean downgrade = false;
            try { archive.invoke(normal, new File(screen.getApplicationInfo().sourceDir), release(screen, installed, payload)); } catch (InvocationTargetException expected) { downgrade = true; }
            require(downgrade, "same installed version cannot be reinstalled as update");
            main(normal::clear); waitState(normal, "idle"); main(normal::close);
            write(new File(directory, "update.apk"), payload);
            write(new File(directory, "verified.json"), release(screen, installed, payload).toString().getBytes(StandardCharsets.UTF_8));
            prefs.edit().putLong("last-check:" + origin, System.currentTimeMillis()).commit();
            Source stale = new Source(payload); stale.release.set(valid); AppUpdater afterUpgrade = create(screen, stale, verified); current.set(afterUpgrade);
            main(() -> afterUpgrade.check(origin, false)); waitState(afterUpgrade, "idle");
            require(!new File(directory, "update.apk").exists() && !new File(directory, "verified.json").exists(), "installed update cache is cleared even within automatic check interval");
            require(stale.manifests.get() == 0 && stale.artifacts.get() == 0, "local cache maintenance does not make a network request");
            return checks;
        } finally {
            AppUpdater last = current.get(); if (last != null) main(last::close);
            prefs.edit().remove("last-check:" + origin).remove("waiting-install").remove("waiting-origin").commit();
            // These three sentinel values were created by this isolated test and are never business data.
            protectedFile.delete(); protectedPhoto.delete(); screen.getSharedPreferences("update-qa-protected", Context.MODE_PRIVATE).edit().clear().commit(); main(screen::finish);
        }
    }
}
