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
import { runSources } from "./sources/scheduler";
import type { Settings, SourceSection } from "./sources/_types";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";
import { I18nProvider, useI18n, type Pref } from "./i18n";
import { nextPollDelay } from "./warming";
import { ResultList } from "./components/ResultList";
import { ResultDetail } from "./components/ResultDetail";

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
      <AppInner settings={settings} />
    </I18nProvider>
  );
}

function AppInner({ settings }: { settings: Settings }) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("input");
  const [results, setResults] = useState<Map<string, SourceSection[]>>(new Map());
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [fromList, setFromList] = useState(false);
  const [truncated, setTruncated] = useState<{ total: number; max: number } | null>(null);
  const [warming, setWarming] = useState(false);
  const [inputText, setInputText] = useState("");
  const [noIpHint, setNoIpHint] = useState(false);
  const [returnView, setReturnView] = useState<View>("input");
  const inputRef = useRef<HTMLInputElement>(null);

  // 查询用最新 settings/上轮 ips —— 事件监听一次性注册,经 ref 防陈旧闭包
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastIpsRef = useRef<string[]>([]);
  const lastTruncRef = useRef<{ total: number; max: number } | undefined>(undefined);
  const pollTimerRef = useRef<number | null>(null);
  const runQueryRef = useRef<(ips: string[], trunc?: { total: number; max: number }) => Promise<void>>(
    async () => {},
  );
  const startWarmingRef = useRef<() => void>(() => {});

  const stopWarmingPoll = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setWarming(false);
  }, []);

  const runQuery = useCallback(
    async (ips: string[], trunc?: { total: number; max: number }) => {
      stopWarmingPoll();
      lastIpsRef.current = ips;
      lastTruncRef.current = trunc;
      setTruncated(trunc ?? null);
      setView("querying");
      const map = await runSources(ips, getSources(), settingsRef.current);
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
    setWarming(true);
    const tick = async (delay: number) => {
      try {
        const base = settingsRef.current.serverUrl.replace(/\/+$/, "");
        const r = await tauriFetch(`${base}/api/db-status`, { signal: AbortSignal.timeout(10_000) });
        const body = r.ok ? await r.json().catch(() => null) : null;
        if (body && body.warming_up === false) {
          pollTimerRef.current = null;
          setWarming(false);
          void runQueryRef.current(lastIpsRef.current, lastTruncRef.current);
          return;
        }
      } catch {
        /* server 不可达:继续按退避轮询 */
      }
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
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("hotkey-triggered", () => {
      readText()
        .then(text => dispatch(text ?? ""))
        .catch(() => dispatch(""));
    })
      .then(u => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
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

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-200">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium text-zinc-400">{t("app.title")}</span>
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

      <main className="flex-1 overflow-hidden">
        {view === "input" && (
          <div className="flex flex-col gap-2 p-4">
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
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
            />
            <button
              onClick={submitInput}
              className="self-end rounded-md bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              {t("query.go")}
            </button>
            {noIpHint && <p className="text-xs text-zinc-500">{t("query.noIp")}</p>}
          </div>
        )}

        {view === "querying" && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <span className="text-sm text-zinc-500">{t("query.lookingUp")}</span>
          </div>
        )}

        {view === "list" && (
          <div className="flex h-full flex-col">
            {guidance && (
              <div className="space-y-1 border-b border-amber-400/30 bg-amber-400/10 px-4 py-3">
                <div className="text-sm text-amber-400">{t("guidance.noKey")}</div>
                <div className="text-xs text-amber-400/70">
                  {t("guidance.adminHint", { url: settings.serverUrl.replace(/\/+$/, "") })}
                </div>
                <button
                  onClick={() => {
                    setReturnView("list");
                    setView("settings");
                  }}
                  className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-500/25"
                >
                  {t("guidance.goSettings")}
                </button>
              </div>
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
        )}

        {view === "settings" && (
          <div className="flex flex-col gap-3 p-4">
            <button
              onClick={() => setView(returnView)}
              className="self-start rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              ← {t("common.back")}
            </button>
            <p className="text-xs text-zinc-600">settings — Task 8</p>
          </div>
        )}
      </main>
    </div>
  );
}
