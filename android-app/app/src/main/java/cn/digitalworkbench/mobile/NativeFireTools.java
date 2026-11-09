package cn.digitalworkbench.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/** File selection and fire inspection photo capture. Never receives login tokens. */
final class NativeFireTools {
    static final int PICK_FILE = 10, TAKE_PHOTO = 11, PHOTO_PERMISSION = 12;
    private final Activity activity;
    private final WebView web;
    private final String origin;
    private final BooleanSupplier fireAccess;
    private final Supplier<String> scope;
    private ValueCallback<Uri[]> fileCallback;
    private String filePage, fileScope;
    private File cameraFile;
    private Uri cameraUri;
    private boolean awaitingPermission, closed;

    NativeFireTools(Activity activity, WebView web, String origin, BooleanSupplier fireAccess, Supplier<String> scope) {
        this.activity = activity; this.web = web; this.origin = origin; this.fireAccess = fireAccess; this.scope = scope;
        // Cache files are private temporary capture inputs, never a public photo album.
        File dir = new File(activity.getCacheDir(), "fire-photos");
        File[] old = dir.listFiles();
        if (old != null) for (File file : old) if (file.isFile() && file.getName().matches("photo-[A-Za-z0-9-]+\\.jpg")
                && file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
    }

    private boolean sameOrigin(Uri uri) {
        return uri != null && origin.equals(uri.getScheme() + "://" + uri.getEncodedAuthority()) && uri.getUserInfo() == null;
    }
    private boolean firePage() {
        String url = web.getUrl();
        return !closed && url != null && sameOrigin(Uri.parse(url)) && "/fire-inspection".equals(Uri.parse(url).getPath())
                && fireAccess.getAsBoolean() && !scope.get().isEmpty();
    }
    private boolean unchanged(String page, String account) {
        return !closed && page != null && page.equals(web.getUrl()) && account != null && account.equals(scope.get());
    }
    private void toast(String message) { Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }

    boolean choose(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) { callback.onReceiveValue(null); toast("正在拍照或选择文件，请先完成或取消。"); return true; }
        String url = web.getUrl();
        if (closed || url == null || !sameOrigin(Uri.parse(url)) || scope.get().isEmpty()) { callback.onReceiveValue(null); return true; }
        fileCallback = callback; filePage = url; fileScope = scope.get();
        boolean image = false;
        String[] types = params.getAcceptTypes();
        if (types != null) for (String mime : types) if (mime != null && mime.startsWith("image/")) image = true;
        if (image && firePage()) {
            if (activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                awaitingPermission = true;
                activity.requestPermissions(new String[]{Manifest.permission.CAMERA}, PHOTO_PERMISSION);
            } else capture();
        } else {
            try {
                Intent picker = params.createIntent();
                picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
                activity.startActivityForResult(picker, PICK_FILE);
            } catch (RuntimeException e) { finishFile(null, false); toast("没有可用的文件选择器，请稍后重试。"); }
        }
        return true;
    }
    private void capture() {
        if (fileCallback == null || !unchanged(filePage, fileScope) || !firePage()) { finishFile(null, false); return; }
        try {
            File dir = new File(activity.getCacheDir(), "fire-photos");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Capture cache unavailable");
            cameraFile = File.createTempFile("photo-", ".jpg", dir);
            cameraUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".photos", cameraFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.setClipData(ClipData.newRawUri("消防现场照片", cameraUri));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivityForResult(intent, TAKE_PHOTO);
        } catch (IOException | RuntimeException e) { finishFile(null, false); toast("无法打开相机，请检查相机权限后重新拍照。"); }
    }
    boolean permission(int request, int[] grants) {
        if (request != PHOTO_PERMISSION) return false;
        if (!awaitingPermission || fileCallback == null) return true;
        awaitingPermission = false;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) capture();
        else { finishFile(null, false); toast("未允许相机权限，请允许后重新拍照。"); }
        return true;
    }
    private void finishFile(Uri[] values, boolean keepPhoto) {
        awaitingPermission = false;
        if (cameraUri != null) activity.revokeUriPermission(cameraUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (cameraFile != null && !keepPhoto) cameraFile.delete();
        cameraUri = null; cameraFile = null;
        ValueCallback<Uri[]> callback = fileCallback; fileCallback = null; filePage = null; fileScope = null;
        if (callback != null) callback.onReceiveValue(values);
    }

    boolean result(int request, int result, Intent data) {
        if (request != PICK_FILE && request != TAKE_PHOTO) return false;
        if (fileCallback == null) return true;
        if (result != Activity.RESULT_OK || !unchanged(filePage, fileScope)) { finishFile(null, false); return true; }
        if (request == TAKE_PHOTO) {
            if (cameraFile == null || cameraUri == null || cameraFile.length() <= 0 || cameraFile.length() > 20 * 1024 * 1024L) {
                finishFile(null, false); toast("未取得有效照片，请重新拍照。");
            } else finishFile(new Uri[]{cameraUri}, true);
        } else {
            ArrayList<Uri> values = new ArrayList<>();
            if (data != null && data.getClipData() != null) {
                ClipData clip = data.getClipData();
                for (int i = 0; i < Math.min(clip.getItemCount(), 20); i++) if (clip.getItemAt(i).getUri() != null) values.add(clip.getItemAt(i).getUri());
            } else if (data != null && data.getData() != null) values.add(data.getData());
            values.removeIf(uri -> !"content".equals(uri.getScheme()));
            finishFile(values.isEmpty() ? null : values.toArray(new Uri[0]), false);
        }
        return true;
    }
    void close() { closed = true; finishFile(null, false); }
}
