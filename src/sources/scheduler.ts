// 调度器:多源 × 多 IP 的统一执行层。
// queryMany 源单请求多结果(ipradar 流式);query 源按 maxConcurrency 并发池逐 IP。
// 源启用过滤在此层(sourceEnabled[id] === false 跳过),源自身无感。
// 错误隔离:任一源抛错(transport/解析)转为该源每 IP 的 error section,
// 绝不 reject 整个 runSources —— 调用方(App)拿到的 map 恒完整(C1)。
import type { QuerySource, SourceSection, Settings } from "./_types";

export async function runSources(
  ips: string[],
  sources: QuerySource[],
  s: Settings,
): Promise<Map<string, SourceSection[]>> {
  const out = new Map(ips.map(ip => [ip, [] as SourceSection[]]));
  const enabled = sources.filter(src => s.sourceEnabled[src.id] !== false);
  await Promise.all(enabled.map(async src => {
    const errSec = (e: unknown): SourceSection => ({
      sourceId: src.id,
      status: "error",
      error: { message: String((e as Error)?.message ?? e) },
    });
    if (src.queryMany) {
      // 流式中途抛错:已产出的保留,尚未拿到段的 IP 补 error section
      const seen = new Set<string>();
      try {
        for await (const { ip, section } of src.queryMany(ips, s)) {
          out.get(ip)?.push(section);
          seen.add(ip);
        }
      } catch (e) {
        for (const ip of ips) {
          if (!seen.has(ip)) out.get(ip)?.push(errSec(e));
        }
      }
      return;
    }
    const n = src.maxConcurrency ?? 5;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, ips.length) }, async () => {
      while (i < ips.length) {
        const ip = ips[i++];
        try {
          out.get(ip)?.push(await src.query(ip, s));
        } catch (e) {
          out.get(ip)?.push(errSec(e));
        }
      }
    }));
  }));
  return out;
}
