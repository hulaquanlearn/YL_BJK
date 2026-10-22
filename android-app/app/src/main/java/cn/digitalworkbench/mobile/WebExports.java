package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.ProgressDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;

/** Reads user-initiated same-origin exports; the website keeps its own authorization token. */
final class WebExports {
    private static final int SAVE = 42, MAX = 500 * 1024 * 1024;
    private final Activity activity;
    private final WebView web;
    private final String origin;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean busy, closed;
    private String job, name, mime;
    private File file;
    private FileOutputStream output;
    private ProgressDialog progress;
    WebExports(Activity activity, WebView web, String origin) { this.activity = activity; this.web = web; this.origin = origin; }
    private boolean trusted() {
        if (closed || web.getUrl() == null) return false;
        Uri uri = Uri.parse(web.getUrl()); return origin.equals(uri.getScheme() + "://" + uri.getEncodedAuthority());
    }
    void prepare() {
        if (!trusted()) return;
        web.evaluateJavascript("(()=>{if(window.__wbExportReady)return;window.__wbExportReady=true;const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>setTimeout(()=>revoke(u),60000);document.addEventListener('click',e=>{const a=e.target.closest?.('a[download]');if(a)window.__wbExportName=a.download},true)})()", null);
    }
    void download(String url, String disposition, String type) {
        if (!trusted() || busy) { toast("请等待当前文件保存完成"); return; }
        Uri uri = Uri.parse(url); boolean blob = url.startsWith("blob:" + origin + "/");
        if (!blob && (!"https".equals(uri.getScheme()) || !origin.equals(uri.getScheme() + "://" + uri.getEncodedAuthority()) || uri.getUserInfo() != null)) { toast("仅支持当前服务器的文件导出"); return; }
        busy = true; job = UUID.randomUUID().toString(); mime = type == null || type.isEmpty() ? "application/octet-stream" : type;
        progress = new ProgressDialog(activity); progress.setTitle("准备导出文件"); progress.setMessage("请稍候，文件准备好后可选择保存位置"); progress.setCanceledOnTouchOutside(false); progress.setOnCancelListener(d -> fail(null)); progress.show();
        String script = "(()=>{const key=" + JSONObject.quote(job) + ";window.__wbExports=window.__wbExports||{};const s=window.__wbExports[key]={ready:false};(async()=>{try{const u=" + JSONObject.quote(url)
            + ";const h={};if(!u.startsWith('blob:')&&new URL(u).pathname.startsWith('/api/')){const t=localStorage.getItem('spare_parts_auth_token');if(t)h.Authorization='Bearer '+t}"
            + "const r=await fetch(u,{credentials:'same-origin',headers:h,redirect:'error'});if(!r.ok)throw Error();const b=await r.blob();if(b.size>" + MAX + ")throw Error('large');"
            + "s.size=b.size;s.name=window.__wbExportName||'导出文件';s.mime=b.type||'application/octet-stream';s.blob=b;s.count=Math.ceil(b.size/24576);s.ready=true}catch(e){s.error=e.message==='large'?'文件超过500MB，请分批导出':'文件准备失败，请重新导出'}})()})()";
        web.evaluateJavascript(script, ignored -> poll(0));
    }
    private void poll(int attempt) {
        if (!busy || !trusted()) { fail(null); return; }
        if (attempt > 450) { fail("准备文件超时，请重新导出"); return; }
        web.evaluateJavascript("(()=>{const s=window.__wbExports?.[" + JSONObject.quote(job) + "];return s?{ready:s.ready,error:s.error,name:s.name,mime:s.mime,size:s.size,count:s.count}:null})()", value -> {
            if (!busy || closed) return;
            try {
                JSONObject state = new JSONObject(value); if (state.has("error")) { fail(state.getString("error")); return; }
                if (!state.optBoolean("ready")) { main.postDelayed(() -> poll(attempt + 1), 200); return; }
                int size = state.getInt("size"), count = state.getInt("count"); if (size < 0 || size > MAX || count != (size + 24575) / 24576) throw new IOException();
                name = state.optString("name", "导出文件").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_"); if (name.length() > 120) name = name.substring(0, 120);
                String detected = state.optString("mime"); if (!detected.isEmpty()) mime = detected;
                if (!name.contains(".")) name += mime.contains("zip") ? ".zip" : mime.contains("spreadsheet") ? ".xlsx" : mime.contains("pdf") ? ".pdf" : ".bin";
                file = File.createTempFile("export-", ".tmp", activity.getCacheDir()); output = new FileOutputStream(file); readChunk(0, count, size);
            } catch (Exception e) { fail("文件准备失败，请重新导出"); }
        });
    }
    private void readChunk(int index, int count, int size) {
        if (!busy || !trusted()) { fail(null); return; }
        if (index == count) {
            try { output.close(); output = null; if (file.length() != size) throw new IOException();
                clearScript(); progress.dismiss();
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                activity.startActivityForResult(intent, SAVE);
            } catch (Exception e) { fail("无法选择保存位置，请重试"); } return;
        }
        web.evaluateJavascript("(()=>{const s=window.__wbExports?.[" + JSONObject.quote(job) + "];if(!s)return;s.chunk=null;s.chunkError=false;const r=new FileReader();r.onload=()=>s.chunk=String(r.result).split(',')[1];r.onerror=()=>s.chunkError=true;r.readAsDataURL(s.blob.slice(" + (index * 24576L) + "," + ((index + 1) * 24576L) + "))})()", ignored -> pollChunk(index,count,size,0));
    }
    private void pollChunk(int index,int count,int size,int attempt){
        if(!busy||!trusted()){fail(null);return;}
        if(attempt>300){fail("文件读取超时，请重新导出");return;}
        web.evaluateJavascript("(()=>{const s=window.__wbExports?.[" + JSONObject.quote(job) + "];return s?.chunkError?'ERROR':s?.chunk})()", value -> {
            if (!busy || closed) return;
            if("null".equals(value)||"undefined".equals(value)){main.postDelayed(()->pollChunk(index,count,size,attempt+1),20);return;}
            try { Object decoded = new JSONTokener(value).nextValue(); if (!(decoded instanceof String) || ((String)decoded).length() > 32768) throw new IOException();
                output.write(Base64.decode((String)decoded, Base64.NO_WRAP)); readChunk(index + 1, count, size);
            } catch (Exception e) { fail("文件读取失败，请重新导出"); }
        });
    }
    boolean result(int request, int result, Intent data) {
        if (request != SAVE) return false;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null || file == null) { fail(null); return true; }
        Uri target = data.getData(); File source = file;
        worker.execute(() -> {
            String error = null;
            try (InputStream in = new FileInputStream(source); OutputStream out = activity.getContentResolver().openOutputStream(target, "w")) {
                if (out == null) throw new IOException(); byte[] bytes = new byte[32768]; int n; while ((n = in.read(bytes)) != -1) { if (closed) throw new InterruptedIOException(); out.write(bytes, 0, n); }
            } catch (Exception e) { error = "保存失败，请检查空间后重新导出"; }
            final String message = error == null ? "文件已保存" : error; main.post(() -> { if (!closed) { fail(null); toast(message); } });
        }); return true;
    }
    private void clearScript() { if (trusted() && job != null) web.evaluateJavascript("delete window.__wbExports?.[" + JSONObject.quote(job) + "]", null); }
    private void toast(String message) { if (!closed) Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }
    private void fail(String message) {
        busy = false; main.removeCallbacksAndMessages(null); clearScript();
        if (output != null) { try { output.close(); } catch (IOException ignored) {} output = null; }
        if (file != null) { file.delete(); file = null; } if (progress != null) progress.dismiss(); if (message != null) toast(message);
    }
    void close() { fail(null); closed = true; worker.shutdownNow(); }
}
