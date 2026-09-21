// 自动发现:新增源 = 加一个文件,零注册代码(对齐 server _discover_sources 的 glob+契约模式)。
// dev 启动即炸 = Vite overlay 显示 throw,对齐 server metadata_problems 护栏;单测测 collectSources 纯函数。

import type { QuerySource } from "./_types";

interface SourceModule {
  default: unknown;
}

export function collectSources(mods: Record<string, SourceModule>): QuerySource[] {
  const out: QuerySource[] = [];
  for (const [path, mod] of Object.entries(mods)) {
    if (path.includes("/_")) continue; // _ 前缀不注册,同 server 约定
    const src = mod?.default as Record<string, unknown> | undefined;
    if (!src || typeof src !== "object" || typeof src.id !== "string" || typeof src.query !== "function") {
      throw new Error(`source contract violation: ${path} (need { id: string, query(ip, settings) })`);
    }
    out.push(src as unknown as QuerySource);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function getSources(): QuerySource[] {
  const mods = import.meta.glob("./*.ts", { eager: true }) as Record<string, SourceModule>;
  return collectSources(mods);
}
