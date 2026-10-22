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
        setFillViewport(true); setBackgroundColor(0xfff4f6f9); setSaveEnabled(false);
        LinearLayout outer = new LinearLayout(context); outer.setOrientation(LinearLayout.VERTICAL); outer.setGravity(Gravity.CENTER); outer.setPadding(dp(24), dp(28), dp(24), dp(28)); addView(outer, new LayoutParams(-1, -1));
        LinearLayout card = new LinearLayout(context); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(24), dp(28), dp(24), dp(24)); GradientDrawable background = new GradientDrawable(); background.setColor(Color.WHITE); background.setCornerRadius(dp(20)); card.setBackground(background); outer.addView(card, new LinearLayout.LayoutParams(-1, -2));
        ImageView icon = new ImageView(context); icon.setImageResource(cn.digitalworkbench.mobile.R.drawable.ic_workbench); card.addView(icon, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView heading = text("登录数字工作台", 23, 0xff1a2b3c); heading.setTypeface(null, Typeface.BOLD); margin(card, heading, 18);
        TextView server = text(origin, 12, 0xff7a8795); margin(card, server, 6);
        margin(card, text("用户名", 14, 0xff43566a), 25); username = input(false); username.setTag("login-username"); username.setContentDescription("用户名"); username.setAutofillHints(View.AUTOFILL_HINT_USERNAME); card.addView(username, field());
        margin(card, text("密码", 14, 0xff43566a), 16); password = input(true); password.setTag("login-password"); password.setContentDescription("密码"); password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD); card.addView(password, field());
        remember = new CheckBox(context); remember.setText("记住密码（仅此手机）"); remember.setTag("login-remember"); remember.setTextSize(14); remember.setTextColor(0xff43566a); margin(card, remember, 12);
        TextView help = text("成功登录后加密保存，下次自动填入；取消勾选即可清除。", 12, 0xff81909e); help.setLineSpacing(dp(3), 1); margin(card, help, 2);
        submit = new Button(context); submit.setText("登录"); submit.setTag("login-submit"); submit.setTextSize(16); submit.setTextColor(Color.WHITE); submit.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xffb91f35)); LinearLayout.LayoutParams button = new LinearLayout.LayoutParams(-1, dp(50)); button.topMargin = dp(20); card.addView(submit, button);
        message = text("", 13, 0xffa63342); message.setTag("login-message"); message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); margin(card, message, 10);
        TextView accountHelp = text("使用原有账号登录，权限与网页一致。", 12, 0xff81909e); margin(card, accountHelp, 8);
        JSONObject saved = vault.read(origin); if (saved != null) { username.setText(saved.optString("username")); password.setText(saved.optString("password")); remember.setChecked(true); }
        initializing = false;
        remember.setOnCheckedChangeListener((buttonView, checked) -> { if (!initializing && !checked) try { vault.clear(origin); } catch (Exception ignored) { message.setText("清除失败，请在密码保存设置中重试。"); } });
        submit.setOnClickListener(v -> login());
        password.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE); password.setOnEditorActionListener((v, action, event) -> { if (action == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) { login(); return true; } return false; });
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) { TextView v = new TextView(getContext()); v.setText(value); v.setTextSize(size); v.setTextColor(color); return v; }
    private void margin(LinearLayout parent, View child, int top) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(top); parent.addView(child, params); }
    private LinearLayout.LayoutParams field() { return new LinearLayout.LayoutParams(-1, dp(48)); }
    private EditText input(boolean secret) { EditText v = new EditText(getContext()); v.setSingleLine(true); v.setTextSize(16); v.setSaveEnabled(false); v.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(secret ? 1024 : 32)}); v.setInputType(InputType.TYPE_CLASS_TEXT | (secret ? InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_TEXT_VARIATION_NORMAL)); return v; }
    boolean isBusy() { return busy; }
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
                try { if (save) vault.save(origin, user, secret); else vault.clear(origin); } catch (Exception ignored) { storageWarning = save ? "登录成功，但密码未能保存，请稍后重试。" : "登录成功，但旧密码未能清除，请在密码保存设置中重试。"; }
                String notice = storageWarning;
                post(() -> { if (closed) return; loading(false); if (!notice.isEmpty()) Toast.makeText(getContext(), notice, Toast.LENGTH_LONG).show(); actions.signedIn(data); });
            } catch (Exception error) {
                String errorText = NativeAuth.message(error);
                post(() -> { if (!closed) { loading(false); message.setText(errorText); } });
            }
        });
    }
    void close() { closed = true; worker.shutdownNow(); password.setText(""); }
}
