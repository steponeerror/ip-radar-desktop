// KeyboardEvent → Tauri 全局快捷键 accel 字符串(纯函数,便于测试)。
// 规则:Ctrl/Cmd 任一 → CmdOrCtrl;Alt/Shift 直拼;键位只认 字母/F1-F24/数字;
// 至少一个修饰键(防单键绑定撞输入),修饰键单按(Shift 等)不算组合 → null。
export function buildAccel(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;
  let key: string | null = null;
  if (/^[a-zA-Z]$/.test(e.key)) key = e.key.toUpperCase();
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
  else if (/^[0-9]$/.test(e.key)) key = e.key;
  if (!key) return null;
  parts.push(key);
  return parts.join("+");
}
