package cn.digitalworkbench.mobile;

import android.app.*;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.*;

/** Debug-only local layout fixture. No network, tokens or business data. */
public class PreviewActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xfff5f7fa); getWindow().setNavigationBarColor(0xffffffff);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(0xfff5f7fa);
        root.setOnApplyWindowInsetsListener((v, i) -> { v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i; });
        setContentView(root);
        TextView banner = new TextView(this); banner.setText("本地界面演示 · 不连接业务服务器"); banner.setTextSize(10); banner.setTextColor(0xff758291); banner.setGravity(Gravity.CENTER); root.addView(banner);
        try {
            JSONObject snapshot = new JSONObject(); snapshot.put("name", "演示账号"); snapshot.put("initial", "演"); snapshot.put("role", "仅用于界面验证");
            JSONArray modules = new JSONArray();
            modules.put(module("备件管理中心", "查询库存、库位与现场备件", "/inventory", new String[][]{{"3D 库位","/warehouse-3d"},{"补货清单","/replenishment"},{"盘点管理","/check"}}));
            modules.put(module("智能工程中心", "工程资料与故障经验，随时查阅", "/knowledge", new String[][]{{"工程知识库","/knowledge"},{"机器人程序助手","/robot-program"}}));
            modules.put(module("工作管理中心", "履职填报、考评与考勤核查", "/raw-duties", new String[][]{{"履职考评","/raw-duties"},{"考勤核查","/attendance"}}));
            snapshot.put("modules", modules);
            root.addView(new NativeHome(this,snapshot,new NativeHome.Actions(){
                public void navigate(String p,String t){new AlertDialog.Builder(PreviewActivity.this).setTitle(t).setMessage("演示入口："+p).setPositiveButton("确定",null).show();}
                public void server(){navigate("连接设置","设置");}public void reload(){navigate("刷新","刷新");}public void logout(){navigate("退出登录","账号");}
            }),new LinearLayout.LayoutParams(-1,0,1));
        } catch (JSONException e) { throw new IllegalStateException(e); }
    }
    private JSONObject module(String title,String description,String path,String[][] links) throws JSONException {
        JSONObject m=new JSONObject();m.put("title",title);m.put("description",description);m.put("path",path);m.put("enter","进入业务");JSONArray a=new JSONArray();for(String[] l:links){JSONObject o=new JSONObject();o.put("label",l[0]);o.put("path",l[1]);a.put(o);}m.put("links",a);return m;
    }
}
