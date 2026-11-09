package cn.digitalworkbench.mobile;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Per origin/account shortcuts. Revoked entries are removed before display. */
final class NativeFavorites {
    static final int LIMIT=Integer.MAX_VALUE;
    private final SharedPreferences preferences;
    private final String key;
    private final LinkedHashMap<String,JSONObject> allowed=new LinkedHashMap<>();
    NativeFavorites(Context context,String scope,JSONObject snapshot){
        preferences=context.getSharedPreferences("favorite-functions",Context.MODE_PRIVATE);
        String identity=scope.isEmpty()?"preview:"+snapshot.optString("accountId",snapshot.optString("name","anonymous")):scope;
        try{StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8)))hash.append(String.format(Locale.ROOT,"%02x",b&255));key=hash.toString();}catch(Exception e){throw new IllegalStateException(e);}
        JSONArray modules=snapshot.optJSONArray("modules");if(modules!=null)for(int i=0;i<modules.length();i++){
            JSONObject m=modules.optJSONObject(i);if(m==null)continue;JSONArray links=m.optJSONArray("links");if(links!=null)for(int j=0;j<links.length();j++){JSONObject entry=links.optJSONObject(j);add(entry,m.optString("title"));}
            String p=m.optString("path");if(!allowed.containsKey(p))try{add(new JSONObject().put("path",p).put("label",m.optString("title")),m.optString("title"));}catch(JSONException ignored){}
        }
    }
    private void add(JSONObject entry,String group){if(entry==null)return;String p=entry.optString("path");if(!p.startsWith("/")||p.startsWith("//")||p.contains("\\")||p.contains("\n")||p.contains("\r")||p.startsWith("/account"))return;try{allowed.putIfAbsent(p,new JSONObject(entry.toString()).put("group",group));}catch(JSONException ignored){}}
    List<JSONObject> choices(){return new ArrayList<>(allowed.values());}
    List<String> paths(){List<String> values=new ArrayList<>();String saved=preferences.getString(key,"[]");try{JSONArray data=new JSONArray(saved);for(int i=0;i<data.length()&&values.size()<LIMIT;i++){String p=data.optString(i);if(allowed.containsKey(p)&&!values.contains(p))values.add(p);}}catch(JSONException ignored){}String clean=new JSONArray(values).toString();if(!clean.equals(saved))preferences.edit().putString(key,clean).apply();return values;}
    void save(List<String> paths){List<String> safe=new ArrayList<>();for(String p:paths)if(allowed.containsKey(p)&&!safe.contains(p)&&safe.size()<LIMIT)safe.add(p);preferences.edit().putString(key,new JSONArray(safe).toString()).apply();}
    List<JSONObject> entries(){List<JSONObject> out=new ArrayList<>();for(String p:paths())out.add(allowed.get(p));return out;}
}
