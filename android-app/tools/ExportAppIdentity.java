import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.HexFormat;

/** Exports public filing fields only. Password is read from the process environment. */
public class ExportAppIdentity {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("Expected keystore, alias, applicationId and output directory");
        String password = System.getenv("WORKBENCH_STORE_PASSWORD");
        if (password == null) throw new IllegalStateException("WORKBENCH_STORE_PASSWORD is required");
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(Path.of(args[0]))) { store.load(input, password.toCharArray()); }
        X509Certificate cert = (X509Certificate)store.getCertificate(args[1]);
        if (cert == null || !(cert.getPublicKey() instanceof RSAPublicKey)) throw new IllegalStateException("Expected an RSA signing certificate");
        String modulus = ((RSAPublicKey)cert.getPublicKey()).getModulus().toString(16);
        String md5 = HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(cert.getEncoded()));
        String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
        Path output = Path.of(args[3]); Files.createDirectories(output);
        Files.write(output.resolve("release-certificate.der"), cert.getEncoded());
        Files.writeString(output.resolve("app-package-name.txt"), args[2]);
        Files.writeString(output.resolve("app-public-key.txt"), modulus);
        Files.writeString(output.resolve("app-signature-md5.txt"), md5);
        String report = "App包名：" + args[2] + "\n\n公钥（RSA模数，无空格及换行）：\n" + modulus
            + "\n\n签名MD5值（证书指纹，32位，不含冒号）：\n" + md5
            + "\n\n证书SHA256（仅用于核对，不填MD5栏）：\n" + sha256
            + "\n\n以上均为公开证书资料，不包含签名私钥或密码。后续更新必须继续使用对应的发布密钥。\n";
        Files.writeString(output.resolve("APP_FILING_INFO.txt"), report);
        System.out.println("Package: " + args[2]);
        System.out.println("RSA modulus hex length: " + modulus.length());
        System.out.println("Certificate MD5: " + md5);
        System.out.println("Certificate SHA256: " + sha256);
    }
}
