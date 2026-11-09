package cn.digitalworkbench.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.Gravity;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Local application identity and privacy information, available without signing in. */
final class AppInfo {
    static final String NAME = "数字记录工具";
    static final String FILING = "皖ICP备2026004209号-3A";
    static final String FILING_URL = "https://beian.miit.gov.cn/";
    static final String CONSENT_VERSION = "2026-10-27";
    static final String PREFERENCES = "app-privacy";
    static final String PURPOSE = "供本人及指定授权人员使用，不面向社会公众开放注册。";
    static final String DESCRIPTION = "本应用用于本人及指定授权人员的日常工作记录与信息整理，提供工作事项记录、物品及备件信息查询、检查清单填报、照片留存、历史记录查询和知识资料辅助检索等功能。应用采用账号登录及权限控制，不面向社会公众开放注册。";
    static final String PRIVACY = "更新日期：2026年10月29日\n\n"
        + "一、使用范围\n" + PURPOSE + "账号由管理者开通，各账号只能使用已授权的功能。\n\n"
        + "二、账号与业务信息\n登录时向当前连接的服务器发送账号和密码用于身份验证，并保存登录会话。工作记录、物品及备件信息、检查结果、人员与时间、主动上传的照片和资料由服务器按业务需要保存。请只提交有权处理的信息。\n\n"
        + "三、本机保存\n本机保存隐私说明同意状态、登录会话和按账号及服务器区分的常用功能选择。“记住密码”默认关闭，主动勾选且登录成功后，密码使用Android Keystore和AES-GCM加密保存在本机；在登录页取消勾选即可清除已保存的密码。退出账号不自动清除已记住的密码。\n\n"
        + "四、相机与照片\n仅在主动扫码或拍照时申请相机权限。扫码使用内置ZXing组件在本机识别，不依赖Google Play服务；识别的器材信息用于打开对应工单，不自动提交记录。选择相册文件使用系统选择器，不申请相册全量读取权限。拒绝相机权限仍可使用其他功能。拍照产生的临时文件位于应用私有缓存。\n\n"
        + "五、工程资料与智能辅助\n主动上传、提问或请求智能分析时，相关问题及必要的资料片段由服务器发送给所配置的模型服务商处理。请勿提交无权披露的个人信息或敏感资料；结果仅供辅助核对，不自动替代业务确认。\n\n"
        + "六、网络与更新\n正式版固定通过HTTPS连接czsdsg.cn，无需填写服务器地址。打开登录页及登录后会自动检查并在后台下载可用更新，可能使用移动数据流量；更新请求不携带业务登录令牌。下载时校验文件大小、SHA256、包名、版本及签名，下载完成后由你选择安装，安装仍需Android系统确认。可在“我的→检查更新”查看状态、安装或清理本机安装包；清理不影响账号、工作记录和照片。应用包含AndroidX及ZXing组件，不接入广告或营销统计SDK。服务器可能记录请求时间、IP和必要的操作审计信息。\n\n"
        + "七、信息管理\n可在个人资料维护账号信息，在登录页取消“记住密码”清除本机保存的密码。服务端业务记录的更正、删除或账号停用，请联系为你开通账号的管理者；本人作为管理者时，通过已有管理入口处理，并保留业务所需审计与备份。卸载应用不自动删除服务端记录。可从登录页或“我的→检查更新”打开隐私说明，登录后可在说明中撤回同意并退出；撤回不会自动删除已保存的信息。\n\n"
        + "八、查询与联系\n主办者：程子硕。使用问题及信息处理请求可直接联系主办者或账号管理者。APP备案号：" + FILING + "。";

    private AppInfo() {}
    static TextView filingLink(Activity activity) {
        TextView link = new TextView(activity); link.setText(activity.getString(R.string.app_filing_query, FILING));
        link.setTextColor(0xff1754b5); link.setTextSize(12); link.setGravity(Gravity.CENTER);
        link.setMinHeight(Math.round(56 * activity.getResources().getDisplayMetrics().density)); link.setFocusable(true);
        link.setContentDescription("APP备案号：" + FILING + "，打开工信部备案查询");
        link.setOnClickListener(v -> {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(FILING_URL))); }
            catch (ActivityNotFoundException e) { Toast.makeText(activity, "请使用浏览器访问 " + FILING_URL, Toast.LENGTH_LONG).show(); }
        });
        return link;
    }
    static boolean accepted(Context context) {
        return CONSENT_VERSION.equals(context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("accepted", ""));
    }
    static void accept(Context context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("accepted", CONSENT_VERSION).apply();
    }
    static AlertDialog requireConsent(Activity activity, Runnable proceed) {
        if (accepted(activity)) { proceed.run(); return null; }
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(NAME + " · 使用与隐私说明")
            .setMessage(PURPOSE + "\n\n使用时需连接服务器处理账号及主动提交的工作信息；扫码、拍照按需申请相机权限。请先阅读隐私说明，再决定是否继续。")
            .setCancelable(false).setPositiveButton("同意并继续", (d, w) -> { accept(activity); proceed.run(); })
            .setNegativeButton("不同意并退出", (d, w) -> activity.finish())
            .setNeutralButton("阅读隐私说明", null).create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> showPrivacy(activity, false));
        return dialog;
    }
    static AlertDialog showPrivacy(Activity activity, boolean allowWithdrawal) {
        TextView text = new TextView(activity); text.setText(PRIVACY); text.setTextSize(15); text.setTextColor(0xff182f46); text.setTextIsSelectable(true);
        int padding = Math.round(22 * activity.getResources().getDisplayMetrics().density); text.setPadding(padding, padding / 2, padding, padding); text.setLineSpacing(5, 1);
        ScrollView scroll = new ScrollView(activity); scroll.addView(text);
        AlertDialog.Builder builder = new AlertDialog.Builder(activity).setTitle("隐私说明").setView(scroll).setPositiveButton("关闭", null);
        if (allowWithdrawal) builder.setNegativeButton("撤回同意并退出", (d, w) -> {
            activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().remove("accepted").apply(); activity.finish();
        });
        return builder.show();
    }
}
