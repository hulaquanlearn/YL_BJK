package cn.digitalworkbench.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Optional, per-origin encrypted credentials. No plaintext or keys go into preferences/backups. */
final class CredentialVault {
    static final String PREFERENCES = "remembered_credentials";
    private final SharedPreferences preferences;
    CredentialVault(Context context) { preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE); }
    static String slot(String origin) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(origin.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(); for (byte b : digest) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    private SecretKey key(String id, boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias = "workbench.credentials." + id;
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        if (!create) throw new java.security.KeyStoreException("Credential key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    synchronized void save(String origin, String username, String password) throws Exception {
        if (!NativeAuth.validOrigin(origin)) throw new IllegalArgumentException("HTTPS origin required");
        String id = slot(origin); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(id, true)); cipher.updateAAD(origin.getBytes(StandardCharsets.UTF_8));
        JSONObject plain = new JSONObject().put("username", username).put("password", password);
        byte[] bytes = plain.toString().getBytes(StandardCharsets.UTF_8);
        byte[] encrypted;
        try { encrypted = cipher.doFinal(bytes); } finally { java.util.Arrays.fill(bytes, (byte) 0); }
        String value = new JSONObject().put("version", 1).put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP)).toString();
        if (!preferences.edit().putString(id, value).commit()) throw new java.io.IOException("Credential storage unavailable");
    }
    synchronized JSONObject read(String origin) {
        String id;
        try {
            if (!NativeAuth.validOrigin(origin)) return null;
            id = slot(origin); String value = preferences.getString(id, null); if (value == null) return null;
            if (value.length() > 32768) throw new java.io.IOException("Invalid encrypted credential");
            JSONObject saved = new JSONObject(value); if (saved.getInt("version") != 1) throw new java.io.IOException("Invalid version");
            byte[] iv = Base64.decode(saved.getString("iv"), Base64.NO_WRAP); if (iv.length != 12) throw new java.io.IOException("Invalid IV");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(id, false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(origin.getBytes(StandardCharsets.UTF_8)); byte[] bytes = cipher.doFinal(Base64.decode(saved.getString("ciphertext"), Base64.NO_WRAP));
            try {
                JSONObject plain = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                if (plain.getString("username").isEmpty() || plain.getString("password").isEmpty()) throw new java.io.IOException("Empty credential");
                return plain;
            } finally { java.util.Arrays.fill(bytes, (byte) 0); }
        } catch (Exception ignored) { try { clear(origin); } catch (Exception ignoredAgain) { /* never fall back to plaintext */ } return null; }
    }
    synchronized void clear(String origin) throws Exception {
        String id = slot(origin);
        if (!preferences.edit().remove(id).commit()) throw new java.io.IOException("Credential storage unavailable");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry("workbench.credentials." + id);
    }
}
