package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Isolated Android photo capture checks; no production credentials, requests or business writes. */
final class FireToolsChecks {
    private final Instrumentation instrumentation;
    private int checks;
    private final String origin = "https://fire-qa.invalid";
    FireToolsChecks(Instrumentation instrumentation) { this.instrumentation = instrumentation; }
    private void require(boolean value) { if (!value) throw new AssertionError("Fire check " + (checks + 1)); checks++; }
    private Object field(Object value, String name) throws Exception { java.lang.reflect.Field f = value.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(value); }
    private void set(Object value, String name, Object data) throws Exception { java.lang.reflect.Field f = value.getClass().getDeclaredField(name); f.setAccessible(true); f.set(value, data); }
    int run() throws Exception {
        Activity screen = instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<NativeFireTools> holder = new AtomicReference<>();
        try {
            WebView web = (WebView) field(screen, "web"); Handler timer = (Handler) field(screen, "handler");
            CountDownLatch loaded = new CountDownLatch(1); AtomicReference<Throwable> error = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                try {
                    timer.removeCallbacksAndMessages(null); web.stopLoading();
                    NativeLogin login = (NativeLogin) field(screen, "loginView");
                    if (login != null) { login.close(); if (login.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup)login.getParent()).removeView(login); set(screen, "loginView", null); }
                    web.setVisibility(android.view.View.VISIBLE);
                    NativeFireTools previous = (NativeFireTools) field(screen, "fireTools"); if (previous != null) previous.close();
                    NativeFireTools tools = new NativeFireTools(screen, web, origin, () -> true, () -> "isolated-fire-account"); holder.set(tools); set(screen, "fireTools", tools);
                    android.webkit.WebViewClient nativeClient = web.getWebViewClient();
                    String html = "<!doctype html><meta charset=utf-8><title>消防拍照隔离测试</title>";
                    web.setWebViewClient(new android.webkit.WebViewClient() {
                        @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) { return nativeClient.shouldOverrideUrlLoading(view, request); }
                        @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) { return new android.webkit.WebResourceResponse("text/html", "UTF-8", new java.io.ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
                        @Override public void onPageFinished(WebView view, String url) { if ((origin + "/fire-inspection").equals(url)) loaded.countDown(); }
                    }); web.loadUrl(origin + "/fire-inspection");
                } catch (Throwable failure) { error.set(failure); loaded.countDown(); }
            });
            require(loaded.await(8, TimeUnit.SECONDS)); if (error.get() != null) throw new AssertionError(error.get());
            // The deliberately invalid bootstrap origin may queue an offline dialog before the fixture loads.
            FilingChecks.dismissOfflineDialog(instrumentation, screen);
            NativeFireTools tools = holder.get();
            File dir = new File(screen.getCacheDir(), "fire-photos"); require(dir.isDirectory() || dir.mkdirs());
            File capture = File.createTempFile("photo-", ".jpg", dir); Uri captureUri = FileProvider.getUriForFile(screen, screen.getPackageName() + ".photos", capture);
            require("content".equals(captureUri.getScheme())); require("image/jpeg".equals(screen.getContentResolver().getType(captureUri)));
            boolean rejected = false; try { FileProvider.getUriForFile(screen, screen.getPackageName() + ".photos", new File(screen.getFilesDir(), "not-a-photo.txt")); } catch (IllegalArgumentException expected) { rejected = true; } require(rejected);
            AtomicInteger callbacks = new AtomicInteger(); AtomicReference<Uri[]> selected = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                try { set(tools, "fileCallback", (android.webkit.ValueCallback<Uri[]>) values -> { callbacks.incrementAndGet(); selected.set(values); }); set(tools, "filePage", origin + "/fire-inspection"); set(tools, "fileScope", "isolated-fire-account"); set(tools, "cameraFile", capture); set(tools, "cameraUri", captureUri); tools.result(NativeFireTools.TAKE_PHOTO, Activity.RESULT_CANCELED, null); tools.result(NativeFireTools.TAKE_PHOTO, Activity.RESULT_CANCELED, null); }
                catch (Exception failure) { error.set(failure); }
            });
            require(error.get() == null); require(callbacks.get() == 1); require(selected.get() == null); require(!capture.exists());
            callbacks.set(0);
            instrumentation.runOnMainSync(() -> {
                try { set(tools, "fileCallback", (android.webkit.ValueCallback<Uri[]>) values -> { callbacks.incrementAndGet(); selected.set(values); }); set(tools, "awaitingPermission", true); tools.permission(NativeFireTools.PHOTO_PERMISSION, new int[]{android.content.pm.PackageManager.PERMISSION_DENIED}); }
                catch (Exception failure) { error.set(failure); }
            });
            require(error.get() == null); require(callbacks.get() == 1); require(selected.get() == null);
            // A valid capture is handed to WebView once, with camera grants revoked but the local input retained.
            File successPhoto = File.createTempFile("photo-", ".jpg", dir);
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(successPhoto)) { android.graphics.Bitmap.createBitmap(8, 8, android.graphics.Bitmap.Config.ARGB_8888).compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, out); }
            Uri successUri = FileProvider.getUriForFile(screen, screen.getPackageName() + ".photos", successPhoto); callbacks.set(0);
            instrumentation.runOnMainSync(() -> {
                try { set(tools, "fileCallback", (android.webkit.ValueCallback<Uri[]>) values -> { callbacks.incrementAndGet(); selected.set(values); }); set(tools, "filePage", origin + "/fire-inspection"); set(tools, "fileScope", "isolated-fire-account"); set(tools, "cameraFile", successPhoto); set(tools, "cameraUri", successUri); tools.result(NativeFireTools.TAKE_PHOTO, Activity.RESULT_OK, null); }
                catch (Exception failure) { error.set(failure); }
            });
            require(error.get() == null); require(callbacks.get() == 1); require(selected.get() != null && successUri.equals(selected.get()[0])); require(successPhoto.isFile());
            try (java.io.InputStream in = screen.getContentResolver().openInputStream(successUri)) { require(in != null && in.read() == 255); }
            successPhoto.delete();
        } finally { instrumentation.runOnMainSync(() -> { if (holder.get() != null) holder.get().close(); screen.finish(); }); }
        return checks;
    }
}
