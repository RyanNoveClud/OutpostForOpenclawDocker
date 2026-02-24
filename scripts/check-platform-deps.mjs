import fs from 'node:fs';
import path from 'node:path';

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const allDeps = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.optionalDependencies || {})
};

const forbiddenPatterns = [
  /^@rollup\/rollup-(linux|darwin|win32)/i,
  /^@esbuild\/(linux|darwin|win32)/i,
  /(linux|darwin|win32|freebsd|openbsd|sunos|aix|android|musl|gnu)(-|$)/i
];

const allowlist = new Set([
  // Add exceptions here only when absolutely necessary.
]);

const violations = Object.keys(allDeps).filter((name) => {
  if (allowlist.has(name)) return false;
  return forbiddenPatterns.some((pattern) => pattern.test(name));
});

if (violations.length > 0) {
  console.error('❌ 检测到平台绑定依赖（不允许直接写入 package.json）：');
  for (const dep of violations) console.error(` - ${dep}`);
  console.error('\n请改为跨平台包，或放入 optionalDependencies 并加白名单说明。');
  process.exit(1);
}

console.log('✅ 平台依赖检查通过（package.json 未发现平台绑定依赖）');
