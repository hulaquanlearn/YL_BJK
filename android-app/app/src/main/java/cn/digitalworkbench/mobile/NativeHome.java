package cn.digitalworkbench.mobile;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.util.function.IntConsumer;

/** Compact native workspace; business entries always come from the signed-in catalog. */
@android.annotation.SuppressLint("ViewConstructor")
final class NativeHome extends LinearLayout {
    interface Actions { void navigate(String path,String title); void logout(); default void updates() {} default void downloadApp() {} default void tab(int index) {} }
    static final int INK=0xff233044,MUTED=0xff768398,RED=0xffaa3147,PAPER=0xfff4f6f9;
    static final String[] TABS={"工作台","备件","工程","工作","我的","常用"};
    static final class Session {
        String scope="";
        void bind(String key){if(!scope.equals(key)){clear();scope=key;}}
        void clear(){scope="";}
    }
    private final Actions actions;
    private final JSONObject snapshot;
    private final NativeFavorites favorites;
    private android.app.AlertDialog favoriteDialog;
    private int tab;
    NativeHome(Context c,JSONObject data,Actions a){this(c,data,a,new Session(),0);}
    NativeHome(Context c,JSONObject data,Actions a,Session session,int selected){
        super(c);snapshot=data;actions=a;favorites=new NativeFavorites(c,session.scope,data);setOrientation(VERTICAL);setBackgroundColor(PAPER);select(selected);
    }
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable surface(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color,boolean bold){TextView t=new TextView(getContext());t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,Typeface.BOLD);return t;}
    private void touch(View view,int color,int radius,Runnable action){view.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x12000000),surface(color,radius),null));view.setOnClickListener(v->action.run());view.setClickable(true);view.setFocusable(true);}
    private LinearLayout column(){LinearLayout l=new LinearLayout(getContext());l.setOrientation(VERTICAL);return l;}
    private LinearLayout row(){LinearLayout l=new LinearLayout(getContext());l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private void gap(LinearLayout parent,int height){parent.addView(new View(getContext()),new LayoutParams(1,dp(height)));}
    private JSONArray modules(){JSONArray a=snapshot.optJSONArray("modules");return a==null?new JSONArray():a;}
    static int moduleTab(JSONObject module){String id=module.optString("id"),p=module.optString("path");if("spare".equals(id)||"/inventory".equals(p))return 1;if("knowledge".equals(id)||"engineering".equals(id)||"/robot-program".equals(p)||"/knowledge".equals(p))return 2;if("work".equals(id)||"/raw-duties".equals(p))return 3;if("account".equals(id)||"/account".equals(p))return 4;return 0;}
    static boolean tabAvailable(JSONObject data,int index){
        return index==0||index==4||index==5;
    }
    static LinearLayout navigation(Context c,JSONObject data,int selected,IntConsumer action){
        LinearLayout nav=new LinearLayout(c);nav.setGravity(Gravity.CENTER_VERTICAL);nav.setBackgroundColor(Color.WHITE);float density=c.getResources().getDisplayMetrics().density;
        nav.setPadding(Math.round(12*density),Math.round(6*density),Math.round(12*density),Math.round(5*density));
        nav.setElevation(5*density);
        for(int index:new int[]{0,5,4}){
            if(!tabAvailable(data,index))continue;
            boolean active=selected==index;int color=active?RED:MUTED;
            LinearLayout item=new LinearLayout(c);item.setOrientation(VERTICAL);item.setGravity(Gravity.CENTER);item.setMinimumHeight(Math.round(54*density));
            android.widget.FrameLayout badge=new android.widget.FrameLayout(c);GradientDrawable tint=new GradientDrawable();tint.setColor(active?0xfff9e9ee:Color.TRANSPARENT);tint.setCornerRadius(14*density);badge.setBackground(tint);android.widget.FrameLayout.LayoutParams ip=new android.widget.FrameLayout.LayoutParams(Math.round(23*density),Math.round(23*density),Gravity.CENTER);badge.addView(NativeIcons.view(c,index==4?"person":index==5?"star":"grid",color),ip);item.addView(badge,new LayoutParams(Math.round(58*density),Math.round(32*density)));
            TextView label=new TextView(c);label.setText(TABS[index]);label.setTextSize(11);label.setTextColor(color);label.setGravity(Gravity.CENTER);label.setPadding(0,Math.round(3*density),0,0);if(active)label.setTypeface(null,Typeface.BOLD);item.addView(label);
            item.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x12b91f35),new android.graphics.drawable.ColorDrawable(Color.WHITE),null));
            item.setOnClickListener(v->action.accept(index));item.setFocusable(true);item.setSelected(active);item.setContentDescription(TABS[index]+(active?"，当前页面":""));nav.addView(item,new LayoutParams(0,-2,1));
        }
        return nav;
    }
    void select(int index){
        tab=index==4?4:index==5?5:0;removeAllViews();actions.tab(tab);
        ScrollView scroll=new ScrollView(getContext());scroll.setFillViewport(true);scroll.setClipToPadding(false);LinearLayout body=column();body.setPadding(dp(18),dp(22),dp(18),dp(24));scroll.addView(body);addView(scroll,new LayoutParams(-1,-1));
        if(tab==4)profile(body);else if(tab==5)shortcuts(body);else dashboard(body);
    }
    int selectedTab(){return tab;}
    private boolean validPath(String value){return value.startsWith("/")&&!value.startsWith("//")&&!value.contains("\\")&&!value.contains("\n")&&!value.contains("\r");}
    private List<JSONObject> entries(JSONObject module){
        LinkedHashMap<String,JSONObject> out=new LinkedHashMap<>();JSONArray links=module.optJSONArray("links");
        if(links!=null)for(int i=0;i<links.length();i++){JSONObject link=links.optJSONObject(i);if(link!=null&&validPath(link.optString("path")))out.put(link.optString("path"),link);}
        String p=module.optString("path");if(validPath(p)&&!out.containsKey(p))try{out.put(p,new JSONObject().put("path",p).put("label",module.optString("enter",module.optString("title"))));}catch(JSONException ignored){}
        out.remove("/account");return new ArrayList<>(out.values());
    }
    private void dashboard(LinearLayout body){

        int total=0;
        for(int i=0;i<modules().length();i++){
            JSONObject module=modules().optJSONObject(i);if(module==null||moduleTab(module)==4)continue;List<JSONObject> links=entries(module);if(links.isEmpty())continue;total+=links.size();
            TextView group=text(module.optString("title").replace("管理中心","管理"),16,INK,true);body.addView(group);gap(body,12);
            addGrid(body,links);gap(body,24);
        }
        if(total==0)body.addView(text("当前账号尚未开通业务功能",14,MUTED,false));
    }
    private void addGrid(LinearLayout body,List<JSONObject> links){int height=dp(Math.round(84+28*getResources().getConfiguration().fontScale));LinearLayout grid=column();grid.setPadding(dp(4),dp(6),dp(4),dp(6));grid.setBackground(surface(Color.WHITE,18));LinearLayout line=null;for(int j=0;j<links.size();j++){if(j%3==0){line=row();line.setGravity(Gravity.TOP);grid.addView(line,new LayoutParams(-1,-2));}line.addView(tile(links.get(j)),new LayoutParams(0,height,1));}if(line!=null)for(int j=links.size()%3;j>0&&j<3;j++)line.addView(new View(getContext()),new LayoutParams(0,height,1));body.addView(grid);}
    private View tile(JSONObject entry){
        String p=entry.optString("path"),label=entry.optString("label");LinearLayout item=column();item.setGravity(Gravity.CENTER);item.setPadding(dp(5),dp(12),dp(5),dp(10));
        int color=featureColor(p);android.widget.FrameLayout badge=new android.widget.FrameLayout(getContext());badge.setBackground(surface((color&0x00ffffff)|0x12000000,14));badge.addView(NativeIcons.view(getContext(),NativeIcons.forPath(p),color),new android.widget.FrameLayout.LayoutParams(dp(25),dp(25),Gravity.CENTER));item.addView(badge,new LayoutParams(dp(46),dp(46)));gap(item,9);TextView name=text(label,12,INK,false);name.setGravity(Gravity.CENTER);name.setMaxLines(2);name.setEllipsize(android.text.TextUtils.TruncateAt.END);item.addView(name,new LayoutParams(-1,-2));item.setContentDescription(label);touch(item,Color.WHITE,14,()->actions.navigate(p,label));return item;
    }
    private int featureColor(String p){if(p.contains("agv"))return 0xffa46e27;if(p.contains("fire"))return 0xffb14d57;if(p.contains("duties"))return 0xff537c66;if(p.contains("robot")||p.contains("knowledge"))return 0xff79659e;return 0xff527ca6;}
    private View setting(String title,String icon,String subtitle,Runnable action){LinearLayout r=row();r.setPadding(dp(17),dp(14),dp(14),dp(14));r.setMinimumHeight(dp(72));android.widget.FrameLayout mark=new android.widget.FrameLayout(getContext());mark.setBackground(surface(0xfff1f4f8,11));mark.addView(NativeIcons.view(getContext(),icon,title.equals("退出登录")?RED:0xff627c9b),new android.widget.FrameLayout.LayoutParams(dp(21),dp(21),Gravity.CENTER));r.addView(mark,new LayoutParams(dp(38),dp(38)));LinearLayout labels=column();labels.setPadding(dp(13),0,dp(8),0);labels.addView(text(title,15,title.equals("退出登录")?RED:INK,false));if(!subtitle.isEmpty()){gap(labels,5);labels.addView(text(subtitle,11,MUTED,false));}r.addView(labels,new LayoutParams(0,-2,1));r.addView(NativeIcons.view(getContext(),"arrow",0xffa5afbd),new LayoutParams(dp(17),dp(17)));touch(r,Color.WHITE,16,action);return r;}
    private void profile(LinearLayout body){
        LinearLayout identity=row();identity.setPadding(dp(18),dp(22),dp(18),dp(22));identity.setBackground(surface(Color.WHITE,20));TextView avatar=text(snapshot.optString("initial","用"),22,RED,true);avatar.setGravity(Gravity.CENTER);avatar.setBackground(surface(0xfffaedf0,28));identity.addView(avatar,new LayoutParams(dp(56),dp(56)));
        LinearLayout names=column();names.setPadding(dp(15),0,0,0);TextView name=text(snapshot.optString("name","当前账号"),22,INK,true);name.setMaxLines(2);names.addView(name);gap(names,7);names.addView(text(snapshot.optString("role","已登录"),12,MUTED,false));identity.addView(names,new LayoutParams(0,-2,1));body.addView(identity);gap(body,20);
        body.addView(setting("个人资料","person","姓名、密码与账号安全",()->actions.navigate("/account?tab=profile","个人资料")));gap(body,9);String version=getContext() instanceof android.app.Activity?AppUpdater.version((android.app.Activity)getContext()):"";body.addView(setting("检查更新","refresh",version+" · 后台自动检查",actions::updates));gap(body,9);body.addView(setting("下载 App","grid","扫码获取最新版，分享给同事",actions::downloadApp));gap(body,20);body.addView(setting("退出登录","logout","",actions::logout));
    }

    private void shortcuts(LinearLayout body){
        List<JSONObject> entries=favorites.entries();LinearLayout heading=row();heading.addView(text("常用",22,INK,true),new LayoutParams(0,-2,1));
        if(entries.size()>1) heading.addView(shortcutAction("排序","调整常用功能顺序",()->sortShortcuts(entries)));
        if(!entries.isEmpty()){TextView edit=text("管理",14,RED,false);edit.setGravity(Gravity.CENTER);edit.setMinimumHeight(dp(48));edit.setMinWidth(dp(64));edit.setContentDescription("编辑常用功能");touch(edit,Color.TRANSPARENT,12,this::editShortcuts);heading.addView(edit);}body.addView(heading);gap(body,16);
        if(!entries.isEmpty()){addGrid(body,entries);return;}TextView add=text("＋ 添加功能",16,RED,true);add.setContentDescription("添加常用功能");add.setGravity(Gravity.CENTER);add.setMinimumHeight(dp(100));touch(add,Color.WHITE,16,this::editShortcuts);body.addView(add,new LayoutParams(-1,-2));
    }
    private TextView shortcutAction(String label,String description,Runnable action){
        TextView button=text(label,14,RED,false);
        button.setGravity(Gravity.CENTER);
        button.setMinWidth(dp(52));
        button.setMinimumHeight(dp(48));
        button.setContentDescription(description);
        touch(button,Color.TRANSPARENT,12,action);
        return button;
    }

    private void sortShortcuts(List<JSONObject> entries){
        if(favoriteDialog!=null&&favoriteDialog.isShowing())return;
        LinearLayout list=column();
        list.setPadding(dp(12),dp(6),dp(12),dp(12));
        renderShortcutOrder(list,entries);
        ScrollView scroll=new ScrollView(getContext());
        scroll.addView(list);
        favoriteDialog=new android.app.AlertDialog.Builder(getContext())
            .setTitle("调整常用顺序").setView(scroll).setNegativeButton("取消",null)
            .setPositiveButton("保存",(dialog,which)->{
                List<String> paths=new ArrayList<>();
                for(JSONObject entry:entries)paths.add(entry.optString("path"));
                favorites.save(paths);
                select(5);
            }).create();
        favoriteDialog.show();
    }

    private void renderShortcutOrder(LinearLayout list,List<JSONObject> entries){
        list.removeAllViews();
        for(int index=0;index<entries.size();index++){
            final int position=index;
            String label=entries.get(index).optString("label");
            LinearLayout item=row();
            item.setGravity(Gravity.CENTER_VERTICAL);
            item.addView(text((index+1)+"  "+label,14,INK,true),new LayoutParams(0,-2,1));
            TextView up=shortcutAction("上移","上移"+label,()->moveShortcut(list,entries,position,position-1));
            TextView down=shortcutAction("下移","下移"+label,()->moveShortcut(list,entries,position,position+1));
            up.setEnabled(index>0);
            down.setEnabled(index<entries.size()-1);
            up.setAlpha(up.isEnabled()?1f:.35f);
            down.setAlpha(down.isEnabled()?1f:.35f);
            item.addView(up);
            item.addView(down);
            list.addView(item,new LayoutParams(-1,-2));
        }
    }

    private void moveShortcut(LinearLayout list,List<JSONObject> entries,int from,int to){
        java.util.Collections.swap(entries,from,to);
        renderShortcutOrder(list,entries);
    }

    private void editShortcuts(){
        if(favoriteDialog!=null&&favoriteDialog.isShowing())return;List<JSONObject> choices=favorites.choices();if(choices.isEmpty())return;
        List<String> selected=new ArrayList<>(favorites.paths());LinearLayout body=column();body.setPadding(dp(12),dp(6),dp(12),dp(14));LinearLayout line=null;String group="";int count=0;
        for(JSONObject entry:choices){String category=entry.optString("group");if(!category.equals(group)){if(line!=null&&count%2!=0)line.addView(new View(getContext()),new LayoutParams(0,dp(100),1));group=category;gap(body,12);body.addView(text(group,12,MUTED,true));gap(body,6);line=null;count=0;}
            if(count%2==0){line=row();body.addView(line,new LayoutParams(-1,-2));}count++;String path=entry.optString("path"),label=entry.optString("label");LinearLayout card=column();card.setTag("favorite-choice:"+path);card.setPadding(dp(12),dp(12),dp(12),dp(12));card.setGravity(Gravity.CENTER);LinearLayout top=row();top.addView(NativeIcons.view(getContext(),NativeIcons.forPath(path),featureColor(path)),new LayoutParams(dp(25),dp(25)));TextView tick=text(selected.contains(path)?"✓":"＋",18,RED,true);tick.setGravity(Gravity.RIGHT);top.addView(tick,new LayoutParams(0,dp(28),1));card.addView(top);gap(card,10);TextView name=text(label,13,INK,false);name.setMaxLines(2);card.addView(name);card.setSelected(selected.contains(path));card.setContentDescription(label+(card.isSelected()?"，已选择":"，未选择"));
            touch(card,card.isSelected()?0xfffcecf0:0xfff3f5f8,12,()->{if(selected.contains(path))selected.remove(path);else selected.add(path);card.setSelected(selected.contains(path));card.setBackground(surface(card.isSelected()?0xfffcecf0:0xfff3f5f8,12));tick.setText(card.isSelected()?"✓":"＋");card.setContentDescription(label+(card.isSelected()?"，已选择":"，未选择"));});LayoutParams params=new LayoutParams(0,dp(104),1);params.setMargins(dp(4),dp(4),dp(4),dp(4));line.addView(card,params);
        }if(line!=null&&count%2!=0)line.addView(new View(getContext()),new LayoutParams(0,dp(100),1));ScrollView scroll=new ScrollView(getContext());scroll.addView(body);favoriteDialog=new android.app.AlertDialog.Builder(getContext()).setTitle("选择常用功能").setView(scroll).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->{favorites.save(selected);select(5);}).create();favoriteDialog.show();android.graphics.drawable.GradientDrawable shape=new android.graphics.drawable.GradientDrawable();shape.setColor(Color.WHITE);shape.setCornerRadius(dp(18));favoriteDialog.getWindow().setBackgroundDrawable(shape);
    }
    @Override protected void onDetachedFromWindow(){if(favoriteDialog!=null){favoriteDialog.dismiss();favoriteDialog=null;}super.onDetachedFromWindow();}

}
