package cn.digitalworkbench.mobile;
import android.app.*;
import android.content.*;
import android.os.Handler;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

final class FavoritesChecks {
    private final Instrumentation instrumentation;private int checks;
    FavoritesChecks(Instrumentation value){instrumentation=value;}
    private void require(boolean condition){if(!condition)throw new AssertionError("Favorites check "+(checks+1));checks++;}
    private Object field(Object target,String name)throws Exception{java.lang.reflect.Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(target);}
    private TextView text(View root,String value){if(root instanceof TextView&&((TextView)root).getText().toString().equals(value))return(TextView)root;if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){TextView found=text(((ViewGroup)root).getChildAt(i),value);if(found!=null)return found;}return null;}
    int run()throws Exception{
        Context context=instrumentation.getTargetContext();Activity screen=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String scope="https://favorites-qa.invalid:qa-account-1";JSONObject data=new JSONObject().put("accountId","qa-1").put("name","常用验证").put("role","仅隔离测试");JSONArray links=new JSONArray();for(int i=0;i<10;i++)links.put(new JSONObject().put("label",i==0?"设备模型展示":"功能"+i).put("path",i==0?"/agv-vehicles":"/qa-feature-"+i));data.put("modules",new JSONArray().put(new JSONObject().put("id","work").put("title","工作管理").put("path","/agv-vehicles").put("links",links)));
        NativeFavorites store=new NativeFavorites(context,scope,data);store.save(List.of());
        try{
            require(store.paths().isEmpty());store.save(List.of("/agv-vehicles","/qa-feature-1","https://outside.invalid","/agv-vehicles"));require(store.paths().equals(List.of("/agv-vehicles","/qa-feature-1")));
            require(new NativeFavorites(context,scope,data).entries().size()==2);require(new NativeFavorites(context,scope+"other-account",data).paths().isEmpty());require(new NativeFavorites(context,"https://other-qa.invalid:qa-account-1",data).paths().isEmpty());
            JSONObject reduced=new JSONObject(data.toString());reduced.getJSONArray("modules").getJSONObject(0).put("links",new JSONArray().put(links.getJSONObject(0)));NativeFavorites revoked=new NativeFavorites(context,scope,reduced);require(revoked.paths().equals(List.of("/agv-vehicles")));require(new NativeFavorites(context,scope,data).paths().size()==1);
            List<String> many=new ArrayList<>();for(int i=0;i<10;i++)many.add(i==0?"/agv-vehicles":"/qa-feature-"+i);store.save(many);require(store.paths().size()==10);store.save(List.of());
            AtomicReference<NativeHome> home=new AtomicReference<>();NativeHome.Session session=new NativeHome.Session();session.bind(scope);AtomicReference<String> destination=new AtomicReference<>();
            instrumentation.runOnMainSync(()->{try{((Handler)field(screen,"handler")).removeCallbacksAndMessages(null);((android.webkit.WebView)field(screen,"web")).stopLoading();NativeHome h=new NativeHome(screen,data,new NativeHome.Actions(){public void navigate(String p,String t){destination.set(p);}public void logout(){}},session,5);home.set(h);screen.setContentView(h);require(h.selectedTab()==5);require(text(h,"＋ 添加功能")!=null);require(NativeHome.navigation(screen,data,5,i->{}).getChildCount()==3);}catch(Exception e){throw new RuntimeException(e);}});
            AtomicReference<AlertDialog> dialog=new AtomicReference<>();instrumentation.runOnMainSync(()->{try{java.lang.reflect.Method edit=NativeHome.class.getDeclaredMethod("editShortcuts");edit.setAccessible(true);edit.invoke(home.get());dialog.set((AlertDialog)field(home.get(),"favoriteDialog"));require(dialog.get().isShowing());dialog.get().getWindow().getDecorView().findViewWithTag("favorite-choice:/agv-vehicles").performClick();dialog.get().getButton(AlertDialog.BUTTON_POSITIVE).performClick();}catch(Exception e){throw new RuntimeException(e);}});instrumentation.waitForIdleSync();require(store.paths().equals(List.of("/agv-vehicles")));
            instrumentation.runOnMainSync(()->{TextView agv=text(home.get(),"设备模型展示");require(agv!=null);View click=agv;while(!click.isClickable())click=(View)click.getParent();click.performClick();require("/agv-vehicles".equals(destination.get()));home.get().select(4);require(text(home.get(),"我的")==null);require(text(home.get(),"个人资料")!=null);require(text(home.get(),"检查更新")!=null);});
            store.save(List.of("/agv-vehicles","/qa-feature-1"));
            instrumentation.runOnMainSync(()->{
                try{
                    home.get().select(5);
                    require(text(home.get(),"排序").performClick());
                    AlertDialog sort=(AlertDialog)field(home.get(),"favoriteDialog");
                    ArrayList<View> matches=new ArrayList<>();
                    sort.getWindow().getDecorView().findViewsWithText(matches,"上移功能1",View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION);
                    require(matches.size()==1&&matches.get(0).performClick());
                    sort.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                }catch(Exception e){throw new RuntimeException(e);}
            });
            instrumentation.waitForIdleSync();
            require(new NativeFavorites(context,scope,data).paths().equals(List.of("/qa-feature-1","/agv-vehicles")));
            return checks;
        }finally{store.save(List.of());instrumentation.runOnMainSync(screen::finish);}
    }
}
