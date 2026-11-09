import { mkdirSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Offline JVM behavior tests. Compiles the real production classes against deliberately
// small Android ports, not source-regex assertions. No Gradle/APK, Android runtime or network.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bundled = join(root, 'android-app/.local/jdk21/jdk-21.0.12.1+1');
const javaHome = process.env.JOINT_REVIEW_JAVA_HOME || process.env.JAVA_HOME || bundled;
const exe = name => join(javaHome, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
if (!existsSync(exe('javac'))) throw new Error('Set JOINT_REVIEW_JAVA_HOME to a local JDK; no download is performed.');
const scratch = mkdtempSync(join(tmpdir(), 'joint-review-native-'));
const sources = [];
function source(path, value) {
  const target = join(scratch, path); mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value); sources.push(target);
}
const stubs = {
'android/Manifest.java': `package android; public final class Manifest { public static final class permission { public static final String CAMERA="camera"; } }`,
'android/app/Activity.java': `package android.app;
import java.io.File; import android.content.*; import android.net.Uri;
public class Activity {
 public static final int RESULT_OK=-1, RESULT_CANCELED=0;
 public final File cache; public int permission=0, permissionsRequested; public boolean throwLaunch;
 public final java.util.List<Integer> requests=new java.util.ArrayList<>();
 public final java.util.List<Intent> intents=new java.util.ArrayList<>(); public final java.util.List<Uri> revoked=new java.util.ArrayList<>();
 public final ContentResolver resolver=new ContentResolver();
 public Activity(File cache){this.cache=cache;}
 public File getCacheDir(){return cache;} public String getPackageName(){return "qa.synthetic";}
 public void startActivityForResult(Intent intent,int request){if(throwLaunch)throw new IllegalStateException("no handler");intents.add(intent);requests.add(request);}
 public int checkSelfPermission(String value){return permission;}
 public void requestPermissions(String[] values,int request){permissionsRequested++;}
 public void revokeUriPermission(Uri uri,int flags){revoked.add(uri);}
 public ContentResolver getContentResolver(){return resolver;}
}`,
'android/app/ProgressDialog.java': `package android.app;
public class ProgressDialog {
 public interface CancelListener {void onCancel(ProgressDialog d);} public CancelListener cancelListener; public boolean showing;
 public ProgressDialog(Activity a){} public void setTitle(String s){} public void setMessage(String s){}
 public void setCanceledOnTouchOutside(boolean b){} public void setOnCancelListener(CancelListener l){cancelListener=l;}
 public void show(){showing=true;} public void dismiss(){showing=false;} public void cancel(){if(cancelListener!=null)cancelListener.onCancel(this);}
}`,
'android/content/Intent.java': `package android.content;
import android.net.Uri; import java.util.*;
public class Intent {
 public static final String ACTION_CREATE_DOCUMENT="create", CATEGORY_OPENABLE="open", EXTRA_TITLE="title", EXTRA_ALLOW_MULTIPLE="multi";
 public static final int FLAG_GRANT_WRITE_URI_PERMISSION=2, FLAG_GRANT_READ_URI_PERMISSION=1;
 public String action,type; public int flags; public Uri data; public ClipData clip; public final Map<String,Object> extras=new HashMap<>();
 public Intent(){} public Intent(String a){action=a;} public Intent addCategory(String s){return this;} public Intent setType(String s){type=s;return this;}
 public Intent putExtra(String s,Object value){extras.put(s,value);return this;} public Intent addFlags(int f){flags|=f;return this;}
 public Intent setClipData(ClipData c){clip=c;return this;} public ClipData getClipData(){return clip;}
 public Intent setData(Uri u){data=u;return this;} public Uri getData(){return data;} public String getStringExtra(String k){return (String)extras.get(k);}
}`,
'android/content/ClipData.java': `package android.content; import android.net.Uri;
public class ClipData {
 public static class Item {private final Uri uri; public Item(Uri u){uri=u;} public Uri getUri(){return uri;}}
 public final java.util.List<Item> items=new java.util.ArrayList<>();
 public static ClipData newRawUri(String name,Uri uri){ClipData c=new ClipData();c.items.add(new Item(uri));return c;}
 public int getItemCount(){return items.size();} public Item getItemAt(int i){return items.get(i);}
}`,
'android/content/ContentResolver.java': `package android.content; import android.net.Uri; import java.io.*;
public class ContentResolver {public ByteArrayOutputStream saved=new ByteArrayOutputStream();public OutputStream openOutputStream(Uri u,String mode){return saved;}}`,
'android/content/pm/PackageManager.java': `package android.content.pm; public class PackageManager {public static final int PERMISSION_GRANTED=0, PERMISSION_DENIED=-1;}`,
'android/net/Uri.java': `package android.net; import java.net.*; import java.nio.charset.StandardCharsets; import java.util.*;
public class Uri {
 final String raw; final URI uri; private Uri(String s){raw=s;uri=URI.create(s);} public static Uri parse(String s){return new Uri(s);}
 public String getScheme(){return uri.getScheme();} public String getEncodedAuthority(){return uri.getRawAuthority();}
 public String getAuthority(){return uri.getAuthority();} public String getUserInfo(){return uri.getUserInfo();}
 public String getPath(){return uri.getPath();} public String getHost(){return uri.getHost();} public String getFragment(){return uri.getFragment();}
 public String getEncodedQuery(){return uri.getRawQuery();} public boolean isHierarchical(){return !uri.isOpaque();}
 public List<String> getQueryParameters(String name){List<String> out=new ArrayList<>();String query=uri.getRawQuery();if(query!=null)for(String part:query.split("&")){String[] p=part.split("=",2);if(URLDecoder.decode(p[0],StandardCharsets.UTF_8).equals(name))out.add(p.length>1?URLDecoder.decode(p[1],StandardCharsets.UTF_8):"");}return out;}
 public String getQueryParameter(String n){List<String> v=getQueryParameters(n);return v.isEmpty()?null:v.get(0);}
 public Set<String> getQueryParameterNames(){Set<String> out=new HashSet<>();String q=uri.getRawQuery();if(q!=null)for(String p:q.split("&"))out.add(URLDecoder.decode(p.split("=",2)[0],StandardCharsets.UTF_8));return out;}
 public String toString(){return raw;} public boolean equals(Object other){return other instanceof Uri&&raw.equals(other.toString());}public int hashCode(){return raw.hashCode();}
}`,
'android/os/Looper.java': `package android.os; public class Looper {public static Looper getMainLooper(){return new Looper();}}`,
'android/os/Handler.java': `package android.os;
public class Handler {public final java.util.List<Runnable> delayed=new java.util.ArrayList<>();public Handler(Looper l){} public boolean post(Runnable r){r.run();return true;}public boolean postDelayed(Runnable r,long n){delayed.add(r);return true;}public void removeCallbacksAndMessages(Object o){delayed.clear();}}`,
'android/provider/MediaStore.java': `package android.provider; public class MediaStore {public static final String ACTION_IMAGE_CAPTURE="camera",EXTRA_OUTPUT="output";}`,
'android/util/Base64.java': `package android.util; public class Base64 {public static final int NO_WRAP=2;public static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s);}}`,
'android/webkit/ValueCallback.java': `package android.webkit; public interface ValueCallback<T>{void onReceiveValue(T value);}`,
'android/webkit/WebView.java': `package android.webkit;
public class WebView {
 public static class Call {public final String script;public final ValueCallback<String> callback;Call(String s,ValueCallback<String> c){script=s;callback=c;}public void reply(String value){if(callback!=null)callback.onReceiveValue(value);}}
 public String url; public final java.util.List<Call> calls=new java.util.ArrayList<>();public WebView(String u){url=u;}public String getUrl(){return url;}
 public void evaluateJavascript(String script,ValueCallback<String> callback){calls.add(new Call(script,callback));}
 public Call last(){return calls.get(calls.size()-1);}
}`,
'android/webkit/WebChromeClient.java': `package android.webkit; import android.content.Intent;
public class WebChromeClient {public static class FileChooserParams {
 public static final int MODE_OPEN_MULTIPLE=1;public String[] types={"*/*"};public int mode;
 public String[] getAcceptTypes(){return types;}public int getMode(){return mode;}public Intent createIntent(){return new Intent("pick");}
}}`,
'android/widget/Toast.java': `package android.widget; public class Toast {public static final int LENGTH_LONG=1;public static final java.util.List<String> messages=new java.util.ArrayList<>();public static Toast makeText(Object context,String s,int n){messages.add(s);return new Toast();}public void show(){}}`,
'androidx/core/content/FileProvider.java': `package androidx.core.content; import java.io.File;import android.app.Activity;import android.net.Uri;
public class FileProvider {public static Uri getUriForFile(Activity a,String authority,File f){return Uri.parse("content://"+authority+"/"+f.getName());}}`,
'org/json/JSONException.java': `package org.json;public class JSONException extends Exception {public JSONException(String s){super(s);}}`,
'org/json/JSONObject.java': `package org.json;import java.util.*;
// Test JSON port: fixture objects are registered by their valid JSON string, never parsed from files/network.
public class JSONObject {
 private final Map<String,Object> values=new LinkedHashMap<>(); private static final Map<String,JSONObject> fixtures=new HashMap<>();
 public JSONObject(){} public JSONObject(String value)throws JSONException{JSONObject found=fixtures.get(value);if(found==null)throw new JSONException("unregistered fixture");values.putAll(found.values);}
 public JSONObject put(String k,Object v)throws JSONException{values.put(k,v);return this;}public boolean has(String k){return values.containsKey(k);}
 public Object get(String k)throws JSONException{if(!has(k))throw new JSONException(k);return values.get(k);}
 public String getString(String k)throws JSONException{return String.valueOf(get(k));}public JSONObject getJSONObject(String k)throws JSONException{return (JSONObject)get(k);}
 public int getInt(String k)throws JSONException{return ((Number)get(k)).intValue();}public long getLong(String k)throws JSONException{return ((Number)get(k)).longValue();}
 public String optString(String k){return optString(k,"");}public String optString(String k,String d){Object v=values.get(k);return v==null?d:String.valueOf(v);}
 public boolean optBoolean(String k){return Boolean.TRUE.equals(values.get(k));}
 public static String quote(String s){return "\\\""+s.replace("\\\\","\\\\\\\\").replace("\\\"","\\\\\\\"")+"\\\"";}
 public String toString(){StringBuilder b=new StringBuilder("{");for(Map.Entry<String,Object> e:values.entrySet()){if(b.length()>1)b.append(',');Object v=e.getValue();b.append(quote(e.getKey())).append(':').append(v instanceof String?quote((String)v):v);}b.append('}');String s=b.toString();fixtures.put(s,this);return s;}
}`,
'org/json/JSONTokener.java': `package org.json;public class JSONTokener {private final String value;public JSONTokener(String v){value=v;}public Object nextValue(){if(value.startsWith("\\\"")&&value.endsWith("\\\""))return value.substring(1,value.length()-1);return null;}}`,
};
for (const [path, value] of Object.entries(stubs)) source(path, value);
source('cn/digitalworkbench/mobile/JointReviewChecks.java', `package cn.digitalworkbench.mobile;
import android.app.*;import android.content.*;import android.net.Uri;import android.webkit.*;import org.json.*;import java.io.*;import java.lang.reflect.*;import java.util.*;
public class JointReviewChecks {
 static final String ORIGIN="https://synthetic.invalid";static int checks,skipped,passed;static final List<String> failures=new ArrayList<>();
 static void skip(String name,String reason){skipped++;System.out.println("SKIP "+name+": "+reason);}
 interface Checked {void run()throws Exception;}static void check(boolean b,String message){checks++;if(!b)throw new AssertionError(message);}
 static void test(String name,Checked code){try{code.run();passed++;System.out.println("PASS "+name);}catch(Throwable e){failures.add(name+": "+e);System.err.println("FAIL "+name+": "+e);}}
 static Object field(Object o,String n)throws Exception{Field f=o.getClass().getDeclaredField(n);f.setAccessible(true);return f.get(o);}
 static File scratch;static Activity activity(){return new Activity(scratch);}
 static void callStage(WebExports e,String name,int...args)throws Exception{for(Method method:WebExports.class.getDeclaredMethods()){if(!method.getName().equals(name))continue;method.setAccessible(true);Object[] values=new Object[method.getParameterCount()];int offset=values.length==args.length?0:1;if(offset==1)values[0]=field(e,"job");for(int i=0;i<args.length;i++)values[i+offset]=args[i];method.invoke(e,values);return;}throw new AssertionError("Missing stage "+name);}
 static WebView web(){return new WebView(ORIGIN+"/fire-inspection");}
 static WebExports exports(Activity a,WebView w){return new WebExports(a,w,ORIGIN);}
 static void cancel(WebExports e)throws Exception{((ProgressDialog)field(e,"progress")).cancel();}
 static void begin(WebExports e,String suffix){e.download("blob:"+ORIGIN+"/"+suffix,"","application/pdf");}
 static String state(boolean ready,int size,int count)throws Exception{return new JSONObject().put("ready",ready).put("name","synthetic.pdf").put("mime","application/pdf").put("size",size).put("count",count).toString();}
 static final class Selected implements ValueCallback<Uri[]> {int calls;Uri[] value;public void onReceiveValue(Uri[] v){calls++;value=v;}}
 static WebChromeClient.FileChooserParams image(){WebChromeClient.FileChooserParams p=new WebChromeClient.FileChooserParams();p.types=new String[]{"image/jpeg"};return p;}
 static NativeFireTools fire(Activity a,WebView w,String[] account){return new NativeFireTools(a,w,ORIGIN,()->true,()->account[0]);}
 public static void main(String[] args)throws Exception {
  scratch=new File(args[0]);
  test("cancel/retry ignores old export-start callback",()->{Activity a=activity();WebView w=web();WebExports e=exports(a,w);try{begin(e,"A");WebView.Call old=w.last();ProgressDialog oldDialog=(ProgressDialog)field(e,"progress");cancel(e);begin(e,"B");int queued=w.calls.size();old.reply("null");check(w.calls.size()==queued,"cancelled A callback started polling B");check((boolean)field(e,"busy"),"B must remain active");oldDialog.cancel();check((boolean)field(e,"busy"),"old dialog cancel listener cancelled B");}finally{e.close();}});
  test("cancel/retry ignores old export-metadata error",()->{Activity a=activity();WebView w=web();WebExports e=exports(a,w);try{begin(e,"A");w.last().reply("null");WebView.Call old=w.last();cancel(e);begin(e,"B");old.reply(new JSONObject().put("error","synthetic old error").toString());check((boolean)field(e,"busy"),"cancelled A metadata error cancelled B");check(((ProgressDialog)field(e,"progress")).showing,"B progress was dismissed by A");}finally{e.close();}});
  test("cancel/retry ignores old export-chunk error",()->{Activity a=activity();WebView w=web();WebExports e=exports(a,w);try{begin(e,"A");callStage(e,"pollChunk",0,1,1,0);WebView.Call old=w.last();cancel(e);begin(e,"B");old.reply("\\\"ERROR\\\"");check((boolean)field(e,"busy"),"cancelled A chunk error failed current B");check(((ProgressDialog)field(e,"progress")).showing,"B progress was dismissed by A");}finally{e.close();}});
  test("cancel/retry ignores old chunk-start callback",()->{Activity a=activity();WebView w=web();WebExports e=exports(a,w);try{begin(e,"A");callStage(e,"readChunk",0,1,1);WebView.Call old=w.last();cancel(e);begin(e,"B");int queued=w.calls.size();old.reply("null");check(w.calls.size()==queued,"old FileReader callback polled current B");}finally{e.close();}});
  skip("successful export keeps exact synthetic bytes", "native cache/SAF copy requires JVM file IO; not exercised");
  test("untrusted export URL is rejected before JS",()->{Activity a=activity();WebView w=web();WebExports e=exports(a,w);try{e.download("https://other.invalid/x.pdf","","application/pdf");check(w.calls.isEmpty(),"cross-origin export ran JS");check(!(boolean)field(e,"busy"),"rejected export stayed busy");}finally{e.close();}});
  skip("camera cancellation resolves once and permits retry", "native photo creation/removal and camera URI grants are not exercised");
  test("permission denial releases chooser and retry",()->{Activity a=activity();a.permission=-1;WebView w=web();String[] s={"A"};NativeFireTools f=fire(a,w,s);try{Selected chosen=new Selected();f.choose(chosen,image());check(a.permissionsRequested==1&&a.requests.isEmpty(),"permission gate bypassed");f.permission(12,new int[]{-1});f.permission(12,new int[]{-1});check(chosen.calls==1&&chosen.value==null,"denial must complete once");f.choose(new Selected(),image());check(a.permissionsRequested==2&&a.requests.isEmpty(),"retry after permission denial failed");}finally{f.close();}});
  test("permission grant after account switch cannot launch camera",()->{Activity a=activity();a.permission=-1;WebView w=web();String[] s={"A"};NativeFireTools f=fire(a,w,s);try{Selected chosen=new Selected();f.choose(chosen,image());s[0]="B";f.permission(12,new int[]{0});check(a.requests.isEmpty()&&chosen.calls==1&&chosen.value==null,"stale account opened camera");}finally{f.close();}});
  skip("camera unavailable releases chooser", "missing-camera path creates a native photo cache before launch; not exercised");
  test("file picker filters non-content URIs",()->{Activity a=activity();WebView w=web();String[] s={"A"};NativeFireTools f=fire(a,w,s);try{Selected chosen=new Selected();f.choose(chosen,new WebChromeClient.FileChooserParams());ClipData c=ClipData.newRawUri("one",Uri.parse("file:///synthetic.txt"));c.items.add(new ClipData.Item(Uri.parse("content://fixture/item")));f.result(10,-1,new Intent().setClipData(c));check(chosen.calls==1&&chosen.value.length==1&&"content".equals(chosen.value[0].getScheme()),"unsafe picker URI accepted");}finally{f.close();}});
  test("native login validates bounded server response",()->{JSONObject user=new JSONObject().put("id",1).put("username","synthetic").put("role","operator");JSONObject data=new JSONObject().put("token","A".repeat(64)).put("user",user);check(NativeAuth.validate(new JSONObject().put("success",true).put("data",data))==data,"valid synthetic login rejected");boolean bad=false;try{NativeAuth.validate(new JSONObject().put("success",false).put("data",data));}catch(Exception expected){bad=true;}check(bad,"failed login accepted");check(NativeAuth.validOrigin(ORIGIN)&&!NativeAuth.validOrigin("http://synthetic.invalid")&&!NativeAuth.validOrigin("https://user@synthetic.invalid"),"origin constraints broken");check(!NativeAuth.message(new IOException("private diagnostic")).contains("private"),"raw error leaked");});
  System.out.println("Checks: "+checks+"; scenarios passed: "+passed+"; failed: "+failures.size()+"; skipped: "+skipped);if(!failures.isEmpty())throw new AssertionError(String.join("; ",failures));
 }
}
`);
const production = ['WebExports.java', 'NativeFireTools.java', 'NativeAuth.java'].map(name => join(root, 'android-app/app/src/main/java/cn/digitalworkbench/mobile', name));
console.log('Offline synthetic fixtures:', scratch);
function run(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Never invoke javac directory output or retry filesystem writes from the JVM.
// The retained diagnostic helper now also compiles/loads all class bytes in memory.
const bootstrap = join(root, 'android-app/test/joint-review-jvm-probe.java');
run(exe('java'), [bootstrap, scratch, ...sources, ...production]);
