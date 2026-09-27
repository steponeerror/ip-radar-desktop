// 划词热键路由(Task 3):纯函数,消费 Rust HotkeyCapture 契约(f248bba)。
// 关键语义变化:captured 即便无 IP 也 dispatch(走 noIpHint 可见提示),
// 只有 clipboard-fallback(终端守卫/非 Windows)才读剪贴板;
// timeout/non-text-clipboard 一律 capture-failed —— 不再静默查旧剪贴板误导用户。

/** 与 Rust HotkeyCapture 序列化形状一字不差。 */
export interface HotkeyPayload {
  selected: string | null;
  reason: "captured" | "clipboard-fallback" | "timeout" | "non-text-clipboard";
}

export type HotkeyRoute =
  | { action: "dispatch"; text: string }
  | { action: "clipboard" }
  | { action: "capture-failed" };

export function routeHotkey(p: HotkeyPayload): HotkeyRoute {
  if (p.reason === "captured") return { action: "dispatch", text: p.selected ?? "" };
  if (p.reason === "clipboard-fallback") return { action: "clipboard" };
  return { action: "capture-failed" };
}
