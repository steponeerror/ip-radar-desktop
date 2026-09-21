/** 剪贴板文本 → IP 列表。唯一出口;调用方不再自行解析。 */
const V4_RE = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/g;
// 含冒号的 hex 候选串(宽松捕获,后面合法化;防粘 hex 字符边界)。
// 尾部可选 IPv4 组(:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})供 v4-mapped(::ffff:1.2.3.4)
// 完整捕获:hex 贪婪吞 ":1" 后 lookahead 撞 "." 回溯,把 ":1.2.3.4" 让给尾组。
// 守卫类含 "." 防止从点分串中段起匹配。
const V6_RE = /(?<![:0-9A-Fa-f.])([0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4})+(?::\d{1,3}(?:\.\d{1,3}){3})?)(?![:0-9A-Fa-f.])/g;

function validV4(s: string): boolean {
  const p = s.split(".");
  return p.length === 4 && p.every(x => x !== "" && /^\d{1,3}$/.test(x) && Number(x) <= 255);
}

// v6 合法化借 URL 解析器:[addr] 形式非法即抛 —— 纯 stdlib,零手写状态机
function validV6(s: string): boolean {
  try { new URL(`http://[${s}]/`); return true; } catch { return false; }
}

function normV6(raw: string): string {
  let s = raw.replace(/^\[|\]$/g, "");          // [fe80::1]:443 的括号
  s = s.split("%")[0];                           // zone-id
  // 尾部 ":digits" 端口:剥掉后仍是合法 v6 才剥([addr]:443 已由括号路径处理;
  // 裸 fe80::1:443 因本身可作 v6 地址,保守不剥)
  if (!validV6(s)) {
    const m = s.match(/^(.*):(\d{1,5})$/);
    if (m && validV6(m[1])) s = m[1];
  }
  return s.toLowerCase();
}

export function extractIps(text: string, max: number): { ips: string[]; total: number } {
  const seen = new Set<string>();
  const push = (s: string) => { if (!seen.has(s)) seen.add(s); };
  for (const m of text.matchAll(V4_RE)) if (validV4(m[1])) push(m[1]);
  for (const m of text.matchAll(V6_RE)) {
    const cand = normV6(m[1]);
    if (cand.includes(":") && validV6(cand) && !cand.includes(".")) push(cand);
    // v4-mapped(::ffff:1.2.3.4)含 ".":URL 校验其合法性后原样保留
    if (cand.includes(".") && validV6(cand)) push(cand);
  }
  return { ips: [...seen].slice(0, max), total: seen.size };
}
