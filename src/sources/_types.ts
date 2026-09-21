// 源契约层 —— 所有查询源遵守的唯一接口(server _source_base.py 的 TS 对应物)。
// _ 前缀文件不注册为源,同 server _sources/ 约定。

export interface SourceError {
  status?: number;
  code?: string;
  message: string;
  retryAfter?: number;
}

export interface SourceSection {
  sourceId: string;
  status: "ok" | "error" | "needs-key" | "warming";
  data?: unknown; // 源特定:ipradar=LookupResult,abuseipdb=AbuseSection
  error?: SourceError;
  // 服务端上报的无效输入行数(spec §4.1):ipradar 流 done 事件回填在末段上,UI 汇总黄条提示
  invalidLines?: number;
}

// Settings 也定义于本契约文件(源调度需要);Task 4 的 settings.ts `import type { Settings } from "./_types"`
export interface Settings {
  serverUrl: string;
  ipradarKey: string;
  abuseipdbKey: string;
  maxIps: number;
  hotkey: string;
  language: "auto" | "zh" | "en";
  theme: "dark" | "light" | "auto";
  sourceEnabled: Record<string, boolean>;
  showMissingKey: boolean;
  autostart: boolean;
}

export interface QuerySource {
  id: string;
  label: string;
  maxConcurrency?: number;
  query(ip: string, s: Settings): Promise<SourceSection>;
  queryMany?(ips: string[], s: Settings): AsyncIterable<{ ip: string; section: SourceSection }>;
}
