// 主 UI 状态机:input → querying → list/detail(+settings 桩,Task 8 落地)。
// 唤起链路:Rust 快捷键 → emit("hotkey-triggered") → 读剪贴板 → extractIps → 分发查询。
// warming(503 code):轮询 /api/db-status(5s 起 ×2 至 30s 封顶),就绪后重发原查询。
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { extractIps } from "./extractIps";
import { getSources } from "./sources/registry";
import { runSources } from "./sources/_scheduler";
import { TECH_LABEL } from "./components/badges";
import type { Settings, SourceSection } from "./sources/_types";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { I18nProvider, useI18n, type Pref } from "./i18n";
import { nextPollDelay } from "./warming";
import { ResultList } from "./components/ResultList";
import { ResultDetail } from "./components/ResultDetail";
import { SettingsPage } from "./components/SettingsPage";
import { Gear, Minus, X } from "@phosphor-icons/react";

type View = "input" | "querying" | "list" | "detail" | "settings";

/** 任一 ipradar section 报 401 → 无 key 引导(新版 server 跨源必持 Bearer)。 */
function needsKeyGuidance(results: Map<string, SourceSection[]>): boolean {
  for (const sections of results.values()) {
    if (sections.some(s => s.sourceId === "ipradar" && s.error?.status === 401)) return true;
  }
  return false;
}

/** 任一 section 带 error.code==="warming" → 预热轮询。 */
function anyWarming(results: Map<string, SourceSection[]>): boolean {
  for (const sections of results.values()) {
    if (sections.some(s => s.error?.code === "warming")) return true;
  }
  return false;
}

/** 服务端上报的无效行数(R5):任一 ipradar 段携带即取(同一流同一值)。 */
function invalidLinesOf(results: Map<string, SourceSection[]>): number {
  for (const sections of results.values()) {
    for (const s of sections) {
      if ((s.invalidLines ?? 0) > 0) return s.invalidLines!;
    }
  }
  return 0;
}

/** 无 key 引导卡:list 与 detail 两个视图共用(401 首启路径也能看到)。 */
function GuidanceCard({ serverUrl, onGoSettings }: { serverUrl: string; onGoSettings: () => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 border-b border-amber-400/30 bg-amber-400/10 px-4 py-3">
      <div className="text-sm text-amber-400">{t("guidance.noKey")}</div>
      <div className="text-xs text-amber-400/70">
        {t("guidance.adminHint", { url: serverUrl.replace(/\/+$/, "") })}
      </div>
      <button
        onClick={onGoSettings}
        className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-500/25 transition active:scale-[0.98] hover:bg-amber-500/25"
      >
        {t("guidance.goSettings")}
      </button>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
  }, []);
  return (
    <I18nProvider
      preference={settings.language}
      setPreference={(p: Pref) => setSettings(s => ({ ...s, language: p }))}
    >
      <AppInner settings={settings} onSettingsSaved={setSettings} />
    </I18nProvider>
  );
}

function AppInner({ settings, onSettingsSaved }: { settings: Settings; onSettingsSaved: (s: Settings) => void }) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("input");
  const [results, setResults] = useState<Map<string, SourceSection[]>>(new Map());
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [fromList, setFromList] = useState(false);
  const [truncated, setTruncated] = useState<{ total: number; max: number } | null>(null);
  const [warming, setWarming] = useState(false);
  const [inputText, setInputText] = useState("");
  const [noIpHint, setNoIpHint] = useState(false);
  const [queryingSingle, setQueryingSingle] = useState(false);
  const [returnView, setReturnView] = useState<View>("input");
  const inputRef = useRef<HTMLInputElement>(null);

  // 查询用最新 settings/上轮 ips —— 事件监听一次性注册,经 ref 防陈旧闭包
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastIpsRef = useRef<string[]>([]);
  const lastTruncRef = useRef<{ total: number; max: number } | undefined>(undefined);
  const pollTimerRef = useRef<number | null>(null);
  // 查询代际:旧查询在飞时新查询取代 → 旧响应丢弃,防陈旧覆盖
  const queryEpochRef = useRef(0);
  // 轮询代际:stop/start 均失效在飞 tick,防已停轮询重复触发重发
  const pollIdRef = useRef(0);
  const runQueryRef = useRef<(ips: string[], trunc?: { total: number; max: number }) => Promise<void>>(
    async () => {},
  );
  const startWarmingRef = useRef<() => void>(() => {});

  const stopWarmingPoll = useCallback(() => {
    pollIdRef.current += 1;               // 在飞的轮询 tick 全部失效
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setWarming(false);
  }, []);

  const runQuery = useCallback(
    async (ips: string[], trunc?: { total: number; max: number }) => {
      const epoch = ++queryEpochRef.current;
      stopWarmingPoll();
      lastIpsRef.current = ips;
      lastTruncRef.current = trunc;
      setTruncated(trunc ?? null);
      setQueryingSingle(ips.length === 1);
      setView("querying");
      // 纵深防御(C1):调度器已把单源异常转 error section,这里兑底任何漏网异常,
      // 保证绝不永久停在 querying 视图
      let map: Map<string, SourceSection[]>;
      try {
        map = await runSources(ips, getSources(), settingsRef.current);
      } catch (e) {
        if (epoch !== queryEpochRef.current) return;
        const msg = String((e as Error)?.message ?? e);
        map = new Map(ips.map(ip => [
          ip,
          [{ sourceId: "system", status: "error", error: { message: msg } }],
        ]));
      }
      if (epoch !== queryEpochRef.current) return;   // 被更新查询取代:丢弃陈旧结果
      setResults(map);
      setNoIpHint(false);
      if (ips.length === 1) {
        setSelectedIp(ips[0]);
        setFromList(false);
        setView("detail");
      } else {
        setView("list");
      }
      if (anyWarming(map)) startWarmingRef.current();
    },
    [stopWarmingPoll],
  );
  runQueryRef.current = runQuery;

  /** db-status 轮询:warming_up===false 后重发原查询(退避 5s×2 至 30s)。 */
  const startWarmingPoll = () => {
    pollIdRef.current += 1;               // 新周期:旧周期残留 tick 失效
    const myPoll = pollIdRef.current;
    setWarming(true);
    const tick = async (delay: number) => {
      try {
        const base = settingsRef.current.serverUrl.replace(/\/+$/, "");
        const r = await tauriFetch(`${base}/api/db-status`, { signal: AbortSignal.timeout(10_000) });
        if (myPoll !== pollIdRef.current) return;
        const body = r.ok ? await r.json().catch(() => null) : null;
        if (myPoll !== pollIdRef.current) return;
        if (body && body.warming_up === false) {
          pollTimerRef.current = null;
          setWarming(false);
          void runQueryRef.current(lastIpsRef.current, lastTruncRef.current);
          return;
        }
      } catch {
        /* server 不可达:继续按退避轮询 */
      }
      if (myPoll !== pollIdRef.current) return;
      const next = nextPollDelay(delay);
      pollTimerRef.current = window.setTimeout(() => void tick(next), next);
    };
    pollTimerRef.current = window.setTimeout(() => void tick(5000), 5000);
  };
  startWarmingRef.current = startWarmingPoll;

  /** 剪贴板/手输共用分发:1 个直接查;多个查列表;0 个回输入框。 */
  const dispatch = useCallback(
    (text: string) => {
      const { ips, total } = extractIps(text, settingsRef.current.maxIps);
      if (ips.length === 0) {
        setView("input");
        setNoIpHint(true);
        return;
      }
      const trunc = total > ips.length ? { total, max: settingsRef.current.maxIps } : undefined;
      void runQueryRef.current(ips, trunc);
    },
    [],
  );

  // 快捷键唤起:emit 到达即读剪贴板一次(spec:不做持续监听)
  // disposed-flag:cleanup 先于 listen promise resolve 时立即反注册,防泄漏/StrictMode 双挂载重复分发
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<string>("hotkey-triggered", () => {
      readText()
        .then(text => dispatch(text ?? ""))
        .catch(() => dispatch(""));
    })
      .then(u => {
        if (disposed) {
          u();
          return;
        }
        unlisten = u;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dispatch]);

  // Esc 隐藏窗口(设置页除外,避免编辑中误关);命令 Task 9 落地,浏览器 dev 下 catch 吞掉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view !== "settings") {
        invoke("hide_window").catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view]);

  // 进入 input 视图聚焦输入框(快捷键 0 命中/返回)
  useEffect(() => {
    if (view === "input") inputRef.current?.focus();
  }, [view]);

  useEffect(() => () => stopWarmingPoll(), [stopWarmingPoll]);

  const submitInput = () => {
    if (!inputText.trim()) return;
    dispatch(inputText);
  };

  const guidance = needsKeyGuidance(results) && (view === "list" || view === "detail");
  const detailSections = selectedIp ? (results.get(selectedIp) ?? []) : [];
  const invalidLines = invalidLinesOf(results);

  return (
    <div className="dot-grid flex h-screen w-full flex-col bg-zinc-950 text-zinc-100">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between border-b border-zinc-800 px-4 py-2"
      >
        <span data-tauri-drag-region className={`${TECH_LABEL} select-none`}>
          {t("app.title")}
        </span>
        <div className="flex items-center gap-0.5">
          {import.meta.env.DEV && (
            <>
              <button
                aria-label="minimize"
                onClick={() => void import("@tauri-apps/api/window").then(m => m.getCurrentWindow().minimize())}
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                <Minus size={14} />
              </button>
              <button
                aria-label="close"
                onClick={() => void import("@tauri-apps/api/window").then(m => m.getCurrentWindow().close())}
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-red-500/15 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </>
          )}
          <button
            aria-label="settings"
            onClick={() => {
              if (view !== "settings") {
                setReturnView(view);
                setView("settings");
              }
            }}
            className="rounded-md p-1.5 text-zinc-500 transition active:scale-[0.95] hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Gear size={16} />
          </button>
        </div>
      </header>

      {warming && (
        <div className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          {t("query.warming")}
        </div>
      )}
      {truncated && (view === "querying" || view === "list" || view === "detail") && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-400">
          {t("query.truncated", truncated)}
        </div>
      )}
      {invalidLines > 0 && (view === "querying" || view === "list" || view === "detail") && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-400">
          {t("query.invalidLines", { n: invalidLines })}
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {view === "input" && (
          <div className="p-4">
            <div className="border border-zinc-800">
              <div className="border-b border-zinc-800 px-3 py-1.5">
                <span className={TECH_LABEL}>{t("query.sectionLabel")}</span>
              </div>
              <div className="space-y-2 p-3">
                <input
                  ref={inputRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    setNoIpHint(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") submitInput();
                  }}
                  placeholder={t("query.placeholder")}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 transition-colors placeholder:font-sans placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  onClick={submitInput}
                  className="self-end rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 transition hover:scale-[1.02] active:scale-[0.98]"
                >
                  {t("query.go")}
                </button>
              </div>
            </div>
            {noIpHint && <p className="mt-2 text-xs text-zinc-500">{t("query.noIp")}</p>}
          </div>
        )}

        {view === "querying" && (
          <div className="flex h-full flex-col overflow-hidden p-4">
            {queryingSingle ? (
              <div className="space-y-3">
                <div className="border border-zinc-800">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                    <div className="h-5 w-44 animate-pulse bg-zinc-800" />
                    <div className="h-4 w-14 animate-pulse bg-zinc-800" />
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-zinc-800">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-8 animate-pulse bg-zinc-950" />
                    ))}
                  </div>
                </div>
                <div className="h-16 animate-pulse border border-zinc-800" />
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-zinc-800/60 pb-3"
                  >
                    <div className="h-4 w-32 animate-pulse bg-zinc-800" />
                    <div className="h-4 w-12 animate-pulse bg-zinc-800" />
                    <div className="ml-auto h-3 w-16 animate-pulse bg-zinc-800" />
                  </div>
                ))}
              </div>
            )}
            <span className="pt-4 text-center text-xs text-zinc-500">{t("query.lookingUp")}</span>
          </div>
        )}

        {view === "list" && (
          <div className="flex h-full flex-col">
            {guidance && (
              <GuidanceCard
                serverUrl={settings.serverUrl}
                onGoSettings={() => {
                  setReturnView("list");
                  setView("settings");
                }}
              />
            )}
            <ResultList
              results={results}
              onSelect={ip => {
                setSelectedIp(ip);
                setFromList(true);
                setView("detail");
              }}
            />
          </div>
        )}

        {view === "detail" && selectedIp && (
          <div className="flex h-full flex-col">
            {guidance && (
              <GuidanceCard
                serverUrl={settings.serverUrl}
                onGoSettings={() => {
                  setReturnView("detail");
                  setView("settings");
                }}
              />
            )}
            <div className="min-h-0 flex-1">
              <ResultDetail
                ip={selectedIp}
                sections={detailSections}
                settings={settings}
                backLabel={fromList ? t("query.backToList") : t("common.back")}
                onBack={() => setView(fromList ? "list" : "input")}
                onGoSettings={() => {
                  setReturnView("detail");
                  setView("settings");
                }}
              />
            </div>
          </div>
        )}

        {view === "settings" && (
          <SettingsPage
            initial={settings}
            onSaved={onSettingsSaved}
            onClose={() => setView(returnView)}
          />
        )}
      </main>
    </div>
  );
}
