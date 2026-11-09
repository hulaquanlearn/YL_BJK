package cn.digitalworkbench.mobile;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native opt-in login: no password is injected into or read from a WebView. */
@android.annotation.SuppressLint("ViewConstructor")
final class NativeLogin extends ScrollView {
    interface Actions { void signedIn(JSONObject data); }
    private final EditText username, password;
    private final CheckBox remember;
    private final Button submit;
    private final TextView message;
    private final LinearLayout loginCard;
    private final CredentialVault vault;
    private final String origin;
    private final NativeAuth.Client client;
    private final Actions actions;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean closed;
    private boolean busy;
    private boolean initializing = true;

    NativeLogin(Context context, String origin, CredentialVault vault, NativeAuth.Client client, Actions actions) {
        super(context); this.origin = origin; this.vault = vault; this.client = client; this.actions = actions;
        setFillViewport(true); setBackground(new LoginBackdrop()); setSaveEnabled(false);setClipToPadding(false);
        LinearLayout outer = new LinearLayout(context); outer.setOrientation(LinearLayout.VERTICAL);outer.setGravity(Gravity.CENTER_HORIZONTAL);outer.setClipToPadding(false);outer.setPadding(dp(20),dp(32),dp(20),dp(18));addView(outer,new LayoutParams(-1,-1));
        outer.addView(new View(context),new LinearLayout.LayoutParams(1,0,1));
        LinearLayout card = new LinearLayout(context);loginCard=card;card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(24),dp(28),dp(24),dp(24));GradientDrawable surface=new GradientDrawable();surface.setColor(Color.WHITE);surface.setCornerRadius(dp(22));surface.setStroke(dp(1),0xffe8ebf0);card.setBackground(surface);card.setElevation(dp(10));outer.addView(card,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout brandRow=new LinearLayout(context);brandRow.setGravity(Gravity.CENTER_VERTICAL);android.widget.FrameLayout mark=new android.widget.FrameLayout(context);GradientDrawable markShape=new GradientDrawable();markShape.setColor(NativeHome.RED);markShape.setCornerRadius(dp(14));mark.setBackground(markShape);mark.addView(NativeIcons.view(context,"grid",Color.WHITE),new android.widget.FrameLayout.LayoutParams(dp(26),dp(26),Gravity.CENTER));brandRow.addView(mark,new LinearLayout.LayoutParams(dp(48),dp(48)));
        LinearLayout brandText=new LinearLayout(context);brandText.setOrientation(LinearLayout.VERTICAL);TextView heading=text("数字工作台",21,NativeHome.INK);heading.setTypeface(null,Typeface.BOLD);brandText.addView(heading);TextView subtitle=text("连接现场，让工作井然有序",12,NativeHome.MUTED);subtitle.setPadding(0,dp(5),0,0);brandText.addView(subtitle);LinearLayout.LayoutParams brandParams=new LinearLayout.LayoutParams(0,-2,1);brandParams.leftMargin=dp(12);brandRow.addView(brandText,brandParams);card.addView(brandRow);
        margin(card, text("用户名", 13, 0xff43566a), 28); username = input(false); username.setHint("请输入用户名");username.setTag("login-username"); username.setContentDescription("用户名"); username.setAutofillHints(View.AUTOFILL_HINT_USERNAME); card.addView(username, field());
        margin(card, text("密码", 13, 0xff43566a), 18); password = input(true);password.setHint("请输入密码");password.setTag("login-password"); password.setContentDescription("密码"); password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
        LinearLayout secretRow = new LinearLayout(context); secretRow.setGravity(Gravity.CENTER_VERTICAL); secretRow.addView(password,new LinearLayout.LayoutParams(0,dp(48),1));
        TextView reveal = text("显示",13,NativeHome.MUTED); reveal.setGravity(Gravity.CENTER); reveal.setContentDescription("显示密码"); reveal.setFocusable(true); reveal.setOnClickListener(v -> { boolean visible = password.getTransformationMethod() instanceof android.text.method.PasswordTransformationMethod; password.setTransformationMethod(visible ? android.text.method.HideReturnsTransformationMethod.getInstance() : android.text.method.PasswordTransformationMethod.getInstance()); password.setSelection(password.length()); reveal.setText(visible ? "隐藏" : "显示"); reveal.setContentDescription(visible ? "隐藏密码" : "显示密码"); }); secretRow.addView(reveal,new LinearLayout.LayoutParams(dp(48),dp(48)));secretRow.setBackground(fieldBackground());password.setBackgroundColor(Color.TRANSPARENT);card.addView(secretRow,field());
        remember = new CheckBox(context); remember.setText("记住密码"); remember.setTag("login-remember"); remember.setTextSize(13);remember.setButtonTintList(android.content.res.ColorStateList.valueOf(NativeHome.RED)); remember.setTextColor(0xff43566a); remember.setMinHeight(dp(44)); margin(card, remember, 8);
        submit = new Button(context); submit.setText("登录"); submit.setTag("login-submit"); submit.setTextSize(16); submit.setTextColor(Color.WHITE); GradientDrawable primary=new GradientDrawable();primary.setColor(NativeHome.RED);primary.setCornerRadius(dp(10));submit.setBackground(primary);submit.setStateListAnimator(null);submit.setAllCaps(false); LinearLayout.LayoutParams button = new LinearLayout.LayoutParams(-1, dp(48)); button.topMargin = dp(16); card.addView(submit, button);
        message = text("", 13, 0xffa63342); message.setTag("login-message"); message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); margin(card, message, 10);
        TextView privacy = text("隐私说明", 12, NativeHome.MUTED); privacy.setTag("login-privacy");privacy.setGravity(Gravity.CENTER); privacy.setMinHeight(dp(44)); privacy.setFocusable(true);privacy.setContentDescription("查看隐私说明"); privacy.setOnClickListener(v -> AppInfo.showPrivacy((android.app.Activity)getContext(), false)); margin(card, privacy, 8);
        View spacer=new View(context);outer.addView(spacer,new LinearLayout.LayoutParams(1,0,1));
        TextView filing = AppInfo.filingLink((android.app.Activity)getContext()); filing.setText(AppInfo.FILING); margin(outer, filing, 0);
        JSONObject saved = vault.read(origin); if (saved != null) { username.setText(saved.optString("username")); password.setText(saved.optString("password")); remember.setChecked(true); }
        initializing = false;
        remember.setOnCheckedChangeListener((buttonView, checked) -> { if (!initializing && !checked) try { vault.clear(origin); } catch (Exception ignored) { message.setText("清除失败，请在登录页取消记住密码后重试。"); } });
        submit.setOnClickListener(v -> login());
        password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE); password.setOnEditorActionListener((v, action, event) -> { if (action == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) { login(); return true; } return false; });
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) { TextView v = new TextView(getContext()); v.setText(value); v.setTextSize(size); v.setTextColor(color); return v; }
    private void margin(LinearLayout parent, View child, int top) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(top); parent.addView(child, params); }
    private LinearLayout.LayoutParams field() { return new LinearLayout.LayoutParams(-1, dp(48)); }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh){super.onSizeChanged(w,h,oldw,oldh);if(loginCard!=null){android.view.ViewGroup.LayoutParams params=loginCard.getLayoutParams();params.width=Math.min(Math.max(1,w-dp(40)),dp(440));loginCard.setLayoutParams(params);}}
    private GradientDrawable fieldBackground(){GradientDrawable d=new GradientDrawable();d.setColor(0xfffcfcfd);d.setCornerRadius(dp(10));d.setStroke(dp(1),0xffdce3eb);return d;}
    private static final class LoginBackdrop extends android.graphics.drawable.Drawable {
        private final android.graphics.Paint paint=new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        @Override public void draw(android.graphics.Canvas canvas){android.graphics.Rect bounds=getBounds();canvas.drawColor(0xfff3f5f8);paint.setShader(new android.graphics.LinearGradient(0,0,bounds.width(),bounds.height()*.45f,0xff871521,0xffc72036,android.graphics.Shader.TileMode.CLAMP));android.graphics.Path shape=new android.graphics.Path();shape.moveTo(0,0);shape.lineTo(bounds.right,0);shape.lineTo(bounds.right,bounds.height()*.18f);shape.lineTo(0,bounds.height()*.55f);shape.close();canvas.drawPath(shape,paint);paint.setShader(null);}
        @Override public void setAlpha(int alpha){paint.setAlpha(alpha);}
        @Override public void setColorFilter(android.graphics.ColorFilter filter){paint.setColorFilter(filter);}
        @Override public int getOpacity(){return android.graphics.PixelFormat.OPAQUE;}
    }
    private EditText input(boolean secret) { EditText v = new EditText(getContext()); v.setSingleLine(true); v.setTextSize(16);v.setTextColor(NativeHome.INK);v.setPadding(dp(14),0,dp(14),0);v.setBackground(fieldBackground()); v.setSaveEnabled(false); v.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(secret ? 1024 : 32)}); v.setInputType(InputType.TYPE_CLASS_TEXT | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_VARIATION_NORMAL)); return v; }
    boolean isBusy() { return busy; }
    void handoffFailed(String text) { if (!closed) { loading(false); message.setText(text); } }
    void cleared() { initializing = true; remember.setChecked(false); password.setText(""); initializing = false; message.setText("已清除本服务器保存的密码。"); }
    private void loading(boolean value) { busy = value; submit.setEnabled(!value); username.setEnabled(!value); password.setEnabled(!value); remember.setEnabled(!value); submit.setText(value ? "正在登录…" : "登录"); }
    private void login() {
        if (busy || closed) return;
        String user = username.getText().toString().trim(), secret = password.getText().toString(); boolean save = remember.isChecked();
        if (user.isEmpty() || secret.isEmpty()) { message.setText("请输入用户名和密码。"); return; }
        loading(true); message.setText("");
        android.view.inputmethod.InputMethodManager keyboard = (android.view.inputmethod.InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE); if (keyboard != null) keyboard.hideSoftInputFromWindow(password.getWindowToken(), 0);
        worker.execute(() -> {
            try {
                JSONObject data = client.login(origin, user, secret); if (closed) return;
                String storageWarning = "";
                try { if (save) vault.save(origin, user, secret); else vault.clear(origin); } catch (Exception ignored) { storageWarning = save ? "登录成功，但密码未能保存，请稍后重试。" : "登录成功，但旧密码未能清除，请在登录页取消记住密码后重试。"; }
                String notice = storageWarning;
                post(() -> { if (closed) return; submit.setText("正在进入…"); if (!notice.isEmpty()) Toast.makeText(getContext(), notice, Toast.LENGTH_LONG).show(); actions.signedIn(data); });
            } catch (Exception error) {
                String errorText = NativeAuth.message(error);
                post(() -> { if (!closed) { loading(false); message.setText(errorText); } });
            }
        });
    }
    void close() { closed = true; worker.shutdownNow(); password.setText(""); }
}
