// JNI name mangling helper for CheerpJ's natives option.
//
// JNI mangling rules: in a method name `_` becomes `_1`. Other chars
// (`;`, `[`, unicode) we don't need to handle for Arc's interface.
//
// Final key shape: Java_<package_with_underscores>_<ClassName>_<methodName>
// where periods in the class FQN become underscores and underscores in
// the method name become `_1`.

export function mangleClass(fqn, methods) {
  const prefix = 'Java_' + fqn.replace(/\./g, '_') + '_';
  const out = {};
  for (const [name, fn] of Object.entries(methods)) {
    const mangled = name.replace(/_/g, '_1');
    out[prefix + mangled] = fn;
  }
  return out;
}
