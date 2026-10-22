package cn.digitalworkbench.mobile;

import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import org.json.JSONObject;

/** Same server login contract as the website. No redirects, custom TLS trust, or credential logging. */
final class NativeAuth {
    interface Client { JSONObject login(String origin, String username, String password) throws Exception; }
    static boolean validOrigin(String value) {
        try { URI u = new URI(value); return "https".equals(u.getScheme()) && u.getHost() != null && u.getRawUserInfo() == null
            && u.getRawQuery() == null && u.getRawFragment() == null && (u.getRawPath() == null || u.getRawPath().isEmpty())
            && (u.getPort() == -1 || u.getPort() >= 1 && u.getPort() <= 65535); } catch (Exception ignored) { return false; }
    }
    static String message(Exception error) {
        String value = error.getMessage();
        for (String known : new String[]{"请使用有效的 HTTPS 服务器地址。", "用户名或密码不正确，或账号不可用。", "登录尝试较多，请稍后再试。", "登录服务暂不可用，请稍后重试。", "登录响应无效，请稍后重试。", "登录响应无效。"})
            if (known.equals(value)) return known;
        return "登录失败，请检查网络、服务器地址和证书后重试。";
    }
    static JSONObject validate(JSONObject json) throws Exception {
        JSONObject data = json.getJSONObject("data"), user = data.getJSONObject("user");
        if (!json.optBoolean("success") || !data.getString("token").matches("[A-Za-z0-9_-]{40,100}")
                || user.optString("id").isEmpty() || user.optString("username").isEmpty() || user.optString("role").isEmpty())
            throw new java.io.IOException("登录响应无效，请稍后重试。");
        return data;
    }
    static Client network(String version) {
        return (origin, username, password) -> {
            if (!validOrigin(origin)) throw new java.io.IOException("请使用有效的 HTTPS 服务器地址。");
            HttpURLConnection connection = (HttpURLConnection) new URL(origin + "/api/auth/login").openConnection();
            try {
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12000); connection.setReadTimeout(15000);
                connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setUseCaches(false);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8"); connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("X-Client-Platform", "android"); connection.setRequestProperty("User-Agent", "DigitalWorkbenchAndroid/" + version);
                byte[] body = new JSONObject().put("username", username).put("password", password).toString().getBytes(StandardCharsets.UTF_8);
                try { connection.setFixedLengthStreamingMode(body.length); try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); } }
                finally { java.util.Arrays.fill(body, (byte) 0); }
                int status = connection.getResponseCode();
                if (status == 401 || status == 403) throw new java.io.IOException("用户名或密码不正确，或账号不可用。");
                if (status == 429) throw new java.io.IOException("登录尝试较多，请稍后再试。");
                if (status != 200) throw new java.io.IOException("登录服务暂不可用，请稍后重试。");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream in = connection.getInputStream()) { byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) { if (bytes.size() + n > 65536) throw new java.io.IOException("登录响应无效。"); bytes.write(buffer, 0, n); } }
                return validate(new JSONObject(bytes.toString("UTF-8")));
            } finally { connection.disconnect(); }
        };
    }
}
