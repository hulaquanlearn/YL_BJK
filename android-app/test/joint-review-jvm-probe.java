import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.tools.*;

/** Source-launcher helper: compile production/fixture sources only into memory.
 * --probe <existing paths...> retains the original read-only path diagnostic.
 * Normal arguments: <existing synthetic scratch> <Java source paths...>.
 * No class output, mkdir, write-to-file, delete, network, Android runtime or credentials.
 */
class JointReviewJvmProbe {
    private static final class Bytes extends SimpleJavaFileObject {
        final ByteArrayOutputStream data = new ByteArrayOutputStream();
        Bytes(String name, Kind kind) {
            super(URI.create("memory:///" + name.replace('.', '/') + kind.extension), kind);
        }
        @Override public OutputStream openOutputStream() { return data; }
    }
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && "--probe".equals(args[0])) {
            System.out.println("user.dir=" + System.getProperty("user.dir"));
            for (String value : Arrays.asList(args).subList(1, args.length)) {
                java.io.File path = new java.io.File(value);
                System.out.println("argument=" + value);
                System.out.println("absolute=" + path.getAbsolutePath());
                System.out.println("canonical=" + path.getCanonicalPath());
                System.out.println("exists=" + path.exists() + ", directory=" + path.isDirectory() + ", canWrite=" + path.canWrite());
            }
            return;
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required");
        Map<String, Bytes> classes = new HashMap<>();
        try (StandardJavaFileManager disk = compiler.getStandardFileManager(null, Locale.ROOT, StandardCharsets.UTF_8)) {
            JavaFileManager memory = new ForwardingJavaFileManager<StandardJavaFileManager>(disk) {
                @Override public JavaFileObject getJavaFileForOutput(Location where, String name, JavaFileObject.Kind kind, FileObject sibling) {
                    Bytes bytes = new Bytes(name, kind); classes.put(name, bytes); return bytes;
                }
            };
            Iterable<? extends JavaFileObject> files = disk.getJavaFileObjectsFromStrings(Arrays.asList(args).subList(1, args.length));
            if (!compiler.getTask(null, memory, null, Arrays.asList("-encoding", "UTF-8", "-proc:none"), null, files).call())
                throw new AssertionError("In-memory compilation failed");
            ClassLoader loader = new ClassLoader(JointReviewJvmProbe.class.getClassLoader()) {
                @Override protected Class<?> findClass(String name) throws ClassNotFoundException {
                    Bytes value = classes.get(name);
                    if (value == null) throw new ClassNotFoundException(name);
                    byte[] bytes = value.data.toByteArray(); return defineClass(name, bytes, 0, bytes.length);
                }
            };
            loader.loadClass("cn.digitalworkbench.mobile.JointReviewChecks").getMethod("main", String[].class)
                .invoke(null, (Object) new String[]{args[0]});
        }
    }
}
