// 调度器:多源 × 多 IP 的统一执行层。
// queryMany 源单请求多结果(ipradar 流式);query 源按 maxConcurrency 并发池逐 IP。
// 源启用过滤在此层(sourceEnabled[id] === false 跳过),源自身无感。
import type { QuerySource, SourceSection, Settings } from "./_types";

export async function runSources(
  ips: string[],
  sources: QuerySource[],
  s: Settings,
): Promise<Map<string, SourceSection[]>> {
  const out = new Map(ips.map(ip => [ip, [] as SourceSection[]]));
  const enabled = sources.filter(src => s.sourceEnabled[src.id] !== false);
  await Promise.all(enabled.map(async src => {
    if (src.queryMany) {
      for await (const { ip, section } of src.queryMany(ips, s)) out.get(ip)?.push(section);
      return;
    }
    const n = src.maxConcurrency ?? 5;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, ips.length) }, async () => {
      while (i < ips.length) {
        const ip = ips[i++];
        out.get(ip)?.push(await src.query(ip, s));
      }
    }));
  }));
  return out;
}
