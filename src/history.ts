// 查询历史:纯函数(去重置顶/FIFO/verdict 回填)+ plugin-store 持久化。
// 纯本地红线:历史仅存本地 store,不上传。
import { load as storeLoad } from "@tauri-apps/plugin-store";

export const HISTORY_CAP = 200;

export interface HistoryEntry {
  at: number; // Date.now()
  ips: string[];
  verdicts?: Record<string, "malicious" | "suspicious" | "benign">; // ip→verdict,无=灰
}

/** 集合相等:排序后逐位比较(顺序不同算同集合)。 */
function sameIpSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((ip, i) => ip === sb[i]);
}

/** 查询发起即记:相同 IP 集合(排序比较)去重置顶,新条目插头,FIFO 裁到 CAP。 */
export function recordQuery(prev: HistoryEntry[], ips: string[]): HistoryEntry[] {
  // 空 ips 不记:查询必有 ≥1 IP,空集合条目无展示价值
  if (ips.length === 0) return prev;
  // 重查同集合时旧 verdicts 作废:新查询未完成,回填前徽章应显示灰
  const rest = prev.filter((e) => !sameIpSet(e.ips, ips));
  return [{ at: Date.now(), ips: [...ips] }, ...rest].slice(0, HISTORY_CAP);
}

/** 查询完成回填:更新头部该 ips 条目的 verdicts(仅覆盖给出的键);无匹配条目 → 原样返回。 */
export function stampVerdicts(
  prev: HistoryEntry[],
  ips: string[],
  verdicts: Record<string, "malicious" | "suspicious" | "benign">,
): HistoryEntry[] {
  // recordQuery 维持「每集合至多一条」不变量,故首个匹配即头部该条目;
  // 仅覆盖给出的键:部分源失败无共识的 ip 不写键,徽章保持灰
  const idx = prev.findIndex((e) => sameIpSet(e.ips, ips));
  if (idx < 0) return prev;
  const updated: HistoryEntry = { ...prev[idx], verdicts: { ...prev[idx].verdicts, ...verdicts } };
  return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
}

/** 读 store(history.json 单键 "history"),缺键回空数组。沿 settings.ts 的 store 模式。 */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const store = await storeLoad("history.json");
  return (await store.get<HistoryEntry[]>("history")) ?? [];
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const store = await storeLoad("history.json");
  await store.set("history", entries);
  await store.save();
}
