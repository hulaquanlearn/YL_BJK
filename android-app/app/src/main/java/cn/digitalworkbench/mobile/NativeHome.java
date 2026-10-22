package cn.digitalworkbench.mobile;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
import org.json.*;

/** Native workspace. Entries come from the current authenticated portal, never invented statistics. */
@android.annotation.SuppressLint("ViewConstructor") // This view requires authenticated data and is not inflated from XML.
final class NativeHome extends LinearLayout {
    interface Actions { void navigate(String path, String title); void server(); void reload(); void logout(); default void update() {} default void passwords() {} }
    private final Actions actions;
    private final JSONObject snapshot;
    private final int ink = Color.rgb(26, 43, 60), muted = Color.rgb(117, 130, 145);
    private final int red = Color.rgb(185, 31, 53), paper = Color.rgb(245, 247, 250);
    private final FrameLayout page;
    private final LinearLayout navigation;
    private int tab = 0;

    NativeHome(Context context, JSONObject snapshot, Actions actions) {
        super(context); this.snapshot = snapshot; this.actions = actions;
        setOrientation(VERTICAL); setBackgroundColor(paper);
        page = new FrameLayout(context); addView(page, new LayoutParams(-1, 0, 1));
        navigation = new LinearLayout(context); navigation.setPadding(dp(14), dp(7), dp(14), dp(7));
        navigation.setBackgroundColor(Color.WHITE); navigation.setElevation(dp(6));
        addView(navigation, new LayoutParams(-1, dp(68))); select(0);
    }

    private int dp(float n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private GradientDrawable surface(int color, int radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d;
    }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(getContext()); t.setText(value); t.setTextSize(size); t.setTextColor(color);
        t.setFontFeatureSettings("kern"); if (bold) t.setTypeface(null, Typeface.BOLD); return t;
    }
    private void touch(View v, int background, int radius, Runnable action) {
        v.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x16000000), surface(background, radius), null));
        v.setOnClickListener(w -> action.run()); v.setClickable(true); v.setFocusable(true);
    }
    private LinearLayout column() { LinearLayout l = new LinearLayout(getContext()); l.setOrientation(VERTICAL); return l; }
    private LinearLayout row() { LinearLayout l = new LinearLayout(getContext()); l.setGravity(Gravity.CENTER_VERTICAL); return l; }
    private void gap(LinearLayout parent, int height) { parent.addView(new View(getContext()), new LayoutParams(1, dp(height))); }
    private void select(int index) {
        tab = index; page.removeAllViews(); navigation.removeAllViews();
        ScrollView scroll = new ScrollView(getContext()); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        LinearLayout body = column(); body.setPadding(dp(20), dp(22), dp(20), dp(28)); scroll.addView(body);
        page.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        if (index == 2) profile(body); else if (index == 1) shortcuts(body); else dashboard(body);
        String[] labels = {"工作台", "常用", "我的"}; String[] icons = {"grid", "layers", "person"};
        for (int i = 0; i < labels.length; i++) {
            final int target = i; LinearLayout item = column(); item.setGravity(Gravity.CENTER);
            Icon icon = new Icon(getContext(), icons[i], i == tab ? red : muted);
            LinearLayout pill = row(); pill.setGravity(Gravity.CENTER); pill.setBackground(surface(i == tab ? 0xfff9e9ec : Color.WHITE, 16));
            pill.addView(icon, new LayoutParams(dp(23), dp(23))); item.addView(pill, new LayoutParams(dp(58), dp(30)));
            TextView label = text(labels[i], 11, i == tab ? red : muted, i == tab); label.setGravity(Gravity.CENTER); label.setPadding(0, dp(3), 0, 0); item.addView(label);
            item.setContentDescription(labels[i]); touch(item, Color.WHITE, 12, () -> select(target));
            navigation.addView(item, new LayoutParams(0, -1, 1));
        }
    }
    private void heading(LinearLayout body, String title, String subtitle) {
        LinearLayout head = row(); LinearLayout names = column();
        names.addView(text(title, 26, ink, true)); TextView sub = text(subtitle, 12, muted, false); sub.setPadding(0, dp(7), 0, 0); names.addView(sub);
        head.addView(names, new LayoutParams(0, -2, 1));
        TextView avatar = text(snapshot.optString("initial", "用"), 17, red, true); avatar.setGravity(Gravity.CENTER);
        touch(avatar, 0xfff7e8eb, 16, () -> select(2)); head.addView(avatar, new LayoutParams(dp(46), dp(46))); body.addView(head);
    }
    private JSONArray modules() { JSONArray a = snapshot.optJSONArray("modules"); return a == null ? new JSONArray() : a; }
    private int accent(int index) { return index == 0 ? red : index == 1 ? 0xff147d80 : 0xff6264ad; }
    private void dashboard(LinearLayout body) {
        heading(body, "工作台", "把日常工作，安排得井井有条"); gap(body, 23);
        LinearLayout welcome = column(); welcome.setPadding(dp(19), dp(18), dp(19), dp(18));
        GradientDrawable gradient = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xff243e57,0xff142a40}); gradient.setCornerRadius(dp(22)); welcome.setBackground(gradient);
        welcome.addView(text("你好，" + snapshot.optString("name", "同事"), 20, Color.WHITE, true));
        TextView date = text(new java.text.SimpleDateFormat("M月d日  EEEE", java.util.Locale.CHINA).format(new java.util.Date()), 12, 0xffc8d5e2, false);
        date.setPadding(0, dp(9), 0, 0); welcome.addView(date); body.addView(welcome); gap(body, 24);
        LinearLayout section = row(); section.addView(text("业务中心", 17, ink, true), new LayoutParams(0, -2, 1));
        section.addView(text(String.format(java.util.Locale.ROOT, "%02d", modules().length()) + " 个板块", 12, muted, false)); body.addView(section); gap(body, 12);
        for (int i = 0; i < modules().length(); i++) { JSONObject module = modules().optJSONObject(i); if (module != null) { body.addView(moduleCard(module, i)); gap(body, 12); } }
    }
    private View moduleCard(JSONObject module, int index) {
        int color = accent(index); LinearLayout card = column(); card.setPadding(dp(17), dp(17), dp(17), dp(12)); card.setBackground(surface(Color.WHITE, 20));
        LinearLayout top = row(); FrameLayout box = new FrameLayout(getContext()); box.setBackground(surface((color & 0x00ffffff) | 0x10000000, 14));
        Icon icon = new Icon(getContext(), index == 0 ? "box" : index == 1 ? "book" : "check", color);
        box.addView(icon, new FrameLayout.LayoutParams(dp(25), dp(25), Gravity.CENTER)); top.addView(box, new LayoutParams(dp(48), dp(48)));
        LinearLayout detail = column(); detail.setPadding(dp(13), 0, dp(6), 0);
        detail.addView(text(module.optString("title"), 17, ink, true));
        TextView description = text(module.optString("description"), 11, muted, false); description.setPadding(0, dp(5), 0, 0); description.setMaxLines(2); detail.addView(description);
        top.addView(detail, new LayoutParams(0, -2, 1)); top.addView(text("›", 25, muted, false));
        top.setMinimumHeight(dp(58)); touch(top, Color.WHITE, 10, () -> actions.navigate(module.optString("path"), module.optString("title"))); card.addView(top);
        JSONArray links = module.optJSONArray("links");
        if (links != null && links.length() > 0) {
            gap(card, 13); View line = new View(getContext()); line.setBackgroundColor(0xfff0f2f5); card.addView(line, new LayoutParams(-1, dp(1))); gap(card, 5);
            LinearLayout quick = row();
            for (int i = 0; i < Math.min(3, links.length()); i++) {
                JSONObject link = links.optJSONObject(i); if (link == null) continue;
                TextView label = text(link.optString("label"), 12, color, true); label.setGravity(Gravity.CENTER); label.setMaxLines(2); label.setEllipsize(android.text.TextUtils.TruncateAt.END); label.setMinHeight(dp(44));
                touch(label, Color.WHITE, 10, () -> actions.navigate(link.optString("path"), link.optString("label"))); quick.addView(label, new LayoutParams(0, -2, 1));
            }
            card.addView(quick);
        }
        return card;
    }
    private void shortcuts(LinearLayout body) {
        heading(body, "常用功能", "按业务分类，快速找到工作入口"); gap(body, 26);
        for (int i = 0; i < modules().length(); i++) {
            JSONObject module = modules().optJSONObject(i); if (module == null) continue;
            body.addView(text(module.optString("title"), 14, muted, true)); gap(body, 10);
            LinearLayout group = column(); group.setPadding(dp(12), dp(4), dp(12), dp(4)); group.setBackground(surface(Color.WHITE, 18));
            group.addView(actionRow(module.optString("enter", "进入业务"), "grid", accent(i), () -> actions.navigate(module.optString("path"), module.optString("title"))));
            JSONArray links = module.optJSONArray("links"); if (links != null) for (int j = 0; j < links.length(); j++) {
                JSONObject link = links.optJSONObject(j); if (link != null) group.addView(actionRow(link.optString("label"), "layers", accent(i), () -> actions.navigate(link.optString("path"), link.optString("label"))));
            }
            body.addView(group); gap(body, 22);
        }
    }
    private View actionRow(String title, String type, int color, Runnable action) {
        LinearLayout r = row(); r.setPadding(dp(7), dp(8), dp(7), dp(8)); r.setMinimumHeight(dp(54));
        r.addView(new Icon(getContext(), type, color), new LayoutParams(dp(22), dp(22)));
        TextView t = text(title, 14, ink, false); t.setPadding(dp(12), 0, dp(8), 0); r.addView(t, new LayoutParams(0, -2, 1)); r.addView(text("›", 22, muted, false)); touch(r, Color.WHITE, 10, action); return r;
    }
    private void profile(LinearLayout body) {
        heading(body, "我的", "账号与应用设置"); gap(body, 28);
        LinearLayout account = column(); account.setPadding(dp(20), dp(22), dp(20), dp(22)); account.setBackground(surface(Color.WHITE, 20));
        account.addView(text(snapshot.optString("name", "当前账号"), 23, ink, true)); gap(account, 7); account.addView(text(snapshot.optString("role", "已登录"), 13, muted, false)); body.addView(account); gap(body, 20);
        LinearLayout settings = column(); settings.setPadding(dp(12), dp(4), dp(12), dp(4)); settings.setBackground(surface(Color.WHITE, 18));
        settings.addView(actionRow("个人中心与账号管理", "person", 0xff526b84, () -> actions.navigate("/account", "个人中心")));
        settings.addView(actionRow("检查 App 更新", "layers", 0xff526b84, actions::update));
        settings.addView(actionRow("密码保存设置", "person", 0xff526b84, actions::passwords));
        settings.addView(actionRow("连接设置", "layers", 0xff526b84, actions::server)); settings.addView(actionRow("刷新工作台", "grid", 0xff526b84, actions::reload));
        settings.addView(actionRow("退出当前账号", "person", 0xff526b84, actions::logout));
        body.addView(settings); gap(body, 22); TextView version = text("数字工作台 · " + AppUpdater.version((android.app.Activity)getContext()), 11, muted, false); version.setGravity(Gravity.CENTER); body.addView(version);
    }

    /** Small, consistent outline icon set drawn at device resolution. */
    static final class Icon extends View {
        private final String type; private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        Icon(Context context, String type, int color) { super(context); this.type = type; p.setColor(color); p.setStrokeWidth(1.8f); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); canvas.save(); canvas.scale(getWidth()/24f, getHeight()/24f);
            switch(type) {
                case "person": canvas.drawCircle(12, 7.5f, 3.5f, p); canvas.drawArc(4, 12, 20, 26, 190, 160, false, p); break;
                case "book": canvas.drawRoundRect(3, 4, 21, 20, 2, 2, p); canvas.drawLine(12, 4, 12, 20, p); break;
                case "box": canvas.drawRoundRect(3, 7, 21, 21, 2, 2, p); canvas.drawLine(3, 7, 7, 3, p); canvas.drawLine(7, 3, 17, 3, p); canvas.drawLine(17, 3, 21, 7, p); canvas.drawLine(12, 3, 12, 14, p); canvas.drawLine(9, 14, 15, 14, p); break;
                case "check": canvas.drawRoundRect(5, 3, 19, 21, 2, 2, p); canvas.drawLine(8, 12, 11, 15, p); canvas.drawLine(11, 15, 16, 9, p); break;
                case "layers": for(int i=0;i<3;i++) { path.reset(); path.moveTo(3,7+i*5);path.lineTo(12,2+i*5);path.lineTo(21,7+i*5);if(i==0){path.lineTo(12,12);path.close();} canvas.drawPath(path,p); } break;
                default: for(int y=0;y<2;y++)for(int x=0;x<2;x++)canvas.drawRoundRect(3+x*10,3+y*10,10+x*10,10+y*10,1.5f,1.5f,p);
            }
            canvas.restore();
        }
    }
}
