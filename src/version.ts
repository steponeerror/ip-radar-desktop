/** 去 v/V 前缀:GitHub tag_name 自带 v,与 i18n 模板字面 v 双写 → 统一剥掉再比较/显示(双 v 回归出过一次,test 钉住)。 */
export function stripTag(tag: string): string {
  return tag.replace(/^[vV]/, "");
}

/** latest 是否比 current 新。纯数字段比较,非数字段/解析失败 → false。 */
export function isNewerVersion(latest: string, current: string): boolean {
  // 去 v/V 前缀 → 按 . 切 → 每段 parseInt;任一段 NaN 判解析失败。
  // GitHub releases/latest 端点已排除 draft/prerelease,tag 恒为纯数字段,
  // 宽松 parseInt(而非整串正则)是为容错手滑 tag,解析失败静默不弹横幅。
  const parse = (v: string): number[] | null => {
    const nums = stripTag(v).split(".").map((s) => parseInt(s, 10));
    return nums.some(Number.isNaN) ? null : nums;
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  // 缺段补 0(0.1 ≡ 0.1.0)→ 逐段数字比较;首 个非零差值定向,全等 → false
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
