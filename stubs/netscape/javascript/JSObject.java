package netscape.javascript;

// Legacy LiveConnect bridge that some JDK/library classes still reference
// in their constant pool. CheerpJ's JDK build doesn't ship javafx.web, so
// when one of those classes is verified the class loader throws
// NoClassDefFoundError("netscape/javascript/JSObject"). Providing this
// stub on the classpath satisfies the verifier; nothing actually invokes
// it at runtime in headless Mindustry.
public abstract class JSObject {
    protected JSObject() {}

    public abstract Object call(String methodName, Object... args) throws JSException;
    public abstract Object eval(String s) throws JSException;
    public abstract Object getMember(String name) throws JSException;
    public abstract Object getSlot(int index) throws JSException;
    public abstract void setMember(String name, Object value) throws JSException;
    public abstract void setSlot(int index, Object value) throws JSException;
    public abstract void removeMember(String name) throws JSException;
}
