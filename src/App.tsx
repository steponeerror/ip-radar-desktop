// 主 UI(双栏):常驻查询栏 → banners → 左列表(w-72)/右详情;settings/history 整窗覆盖态。
// 唤起链路:Rust 快捷键 → emit("hotkey-triggered") 携带 {selected, reason} → routeHotkey 路由:captured→分发选中(无 IP 走 noIpHint)/clipboard-fallback→读剪贴板/其余→captureFailed 提示条 → extractIps → 分发查询。
// warming(503 code):轮询 /api/db-status(5s 起 ×2 至 30s 封顶),就绪后重发原查询。
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { extractIps } from "./extractIps";
import { routeHotkey, type HotkeyPayload } from "./hotkey";
import { getSources } from "./sources/registry";
import { runSources } from "./sources/_scheduler";
import { TECH_LABEL } from "./components/badges";
import type { Settings, SourceSection } from "./sources/_types";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";
import { I18nProvider, useI18n, type Pref } from "./i18n";
import { isNewerVersion, stripTag } from "./version";
import { recordQuery, stampVerdicts, loadHistory, saveHistory, HISTORY_CAP, type HistoryEntry } from "./history";
import { nextPollDelay } from "./warming";
import { consensusOf } from "./components/consensus";
import { ResultList } from "./components/ResultList";
import { ResultDetail } from "./components/ResultDetail";
import { SettingsPage } from "./components/SettingsPage";
import { HistoryPage } from "./components/HistoryPage";
import { CircleNotch, Gear, Minus, X, Moon, Sun, ClockCounterClockwise } from "@phosphor-icons/react";

type View = "main" | "settings" | "history";

// 新版本提醒两常量:检查打 GitHub 公开 API(无鉴权头无遥测,纯本地红线内),
// 「去下载」开 releases 页(open_url 由 Task 1a 提供)
const RELEASES_API = "https://api.github.com/repos/steponeerror/ip-radar-desktop/releases/latest";
const RELEASES_URL = "https://github.com/steponeerror/ip-radar-desktop/releases/latest";

// Rust http_get 回复契约(src-tauri main.rs HttpReply):
// 非 2xx 不 reject,status+body 透传;仅传输层错误才 reject invoke
interface HttpReply { status: number; body: string }

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

/** 无 key 引导卡:横贯双栏上方的琥珀条(401 首启路径也能看到)。 */
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

/** 左栏查询骨架:双行行形(首行 IP+徽章形,次行小字形)。 */
function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5 border-b border-zinc-800/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
            <div className="h-4 w-12 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-800" />
        </div>
      ))}
      <span className="px-4 pt-3 text-center text-xs text-zinc-500">{label}</span>
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
  const [view, setView] = useState<View>("main");
  const [results, setResults] = useState<Map<string, SourceSection[]>>(new Map());
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ total: number; max: number } | null>(null);
  const [warming, setWarming] = useState(false);
  const [inputText, setInputText] = useState("");
  const [noIpHint, setNoIpHint] = useState(false);
  // 划词捕获失败提示(timeout/非文本剪贴板):amber 提示条,dispatch/改输入即清
  const [captureFailed, setCaptureFailed] = useState(false);
  // 新版本提醒:tag 为 null = 无更新/未检出;dismissed 进程内不持久化,更高 tag 重新弹
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // 历史:state 供 HistoryPage 渲染,ref 持最新供 runQuery 读写(其依赖数组刻意最小,不读 state)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const seenUpdateRef = useRef<string | null>(null); // 已弹过的 tag:同 tag 关过后不再弹
  const [querying, setQuerying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 查询用最新 settings/上轮 ips —— 事件监听一次性注册,经 ref 防陈旧闭包
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastIpsRef = useRef<string[]>([]);
  const lastTruncRef = useRef<{ total: number; max: number } | undefined>( undefined);
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
      // 历史写入经此(ref 为真相 + 同步 state + 异步落盘,失败静默:丢一轮持久化可接受)
      const commitHistory = (next: HistoryEntry[]) => {
        historyRef.current = next;
        setHistory(next);
        void saveHistory(next).catch(() => {});
      };
      lastIpsRef.current = ips;
      lastTruncRef.current = trunc;
      setTruncated(trunc ?? null);
      // 渐进流入:开始即选中首 IP,右栏与左栏同步生长(v0.1.9);选中后
      // 用户仍可随时点击左栏改选。
      setSelectedIp(ips[0]);
      setQuerying(true);
      // 历史发起即记:dispatch 已拦 0-IP,进到这里的 ips 恒非空;去重置顶会作废旧
      // verdicts(重查同集合回填前灰,设计内)
      commitHistory(recordQuery(historyRef.current, ips));
      // 纵深防御(C1):调度器已把单源异常转 error section,这里兑底任何漏网异常,
      // 保证绝不永久停在 querying 态
      let map: Map<string, SourceSection[]>;
      try {
        // 每个 section 落地即推送快照(流式行/单 IP 完成/error 段),
        // 陈旧代际丢弃 —— 新查询已取代时不再消费旧快照
        map = await runSources(ips, getSources(), settingsRef.current, snapshot => {
          if (epoch !== queryEpochRef.current) return;
          setResults(snapshot);
        });
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
      // 回填共识 verdict:仅写 consensusOf 出 kind=verdict 的 ip(none/disagreed/
      // reserved 无共识不写键 → HistoryPage 徽章灰)
      const verdicts: NonNullable<HistoryEntry["verdicts"]> = {};
      for (const [ip, secs] of map) {
        const c = consensusOf(secs);
        if (c.kind === "verdict") verdicts[ip] = c.code;
      }
      commitHistory(stampVerdicts(historyRef.current, ips, verdicts));
      setNoIpHint(false);
      setQuerying(false);
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

  /** 剪贴板/手输共用分发:≥1 个进查询;0 个提示无 IP(输入已聚焦,直接改稿重查)。 */
  const dispatch = useCallback(
    (text: string) => {
      setCaptureFailed(false);
      const { ips, total } = extractIps(text, settingsRef.current.maxIps);
      if (ips.length === 0) {
        setNoIpHint(true);
        inputRef.current?.focus();
        return;
      }
      const trunc = total > ips.length ? { total, max: settingsRef.current.maxIps } : undefined;
      void runQueryRef.current(ips, trunc);
    },
    [],
  );

  // 快捷键唤起:按 Rust 上报的 reason 路由(Task 3)——captured 即便无 IP 也 dispatch
  // (走 noIpHint,不再静默查剪贴板);仅 clipboard-fallback(终端守卫/非 Windows)读剪贴板一次;
  // timeout/非文本剪贴板 → capture-failed 提示条 + 聚焦输入。
  // disposed-flag:cleanup 先于 listen promise resolve 时立即反注册,防泄漏/StrictMode 双挂载重复分发
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<HotkeyPayload>("hotkey-triggered", e => {
      const route = routeHotkey(e.payload);
      if (route.action === "dispatch") {
        dispatch(route.text);
        return;
      }
      if (route.action === "clipboard") {
        readText()
          .then(text => dispatch(text ?? ""))
          .catch(() => dispatch(""));
        return;
      }
      setNoIpHint(false);
      setCaptureFailed(true);
      inputRef.current?.focus();
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

  // 版本检查:启动延迟 5s(避开 Rust 连接预热)+ 每 24h 一轮 + 窗口唤起(获得
  // 焦点)时节流重查 —— 托盘常驻进程会跨过发版时刻,只靠启动+24h 会一直看不到
  // 新横幅(0.1.13 实报)。限频/断网/解析异常全静默 —— 失败不打扰查询主流程。
  // 仅当 tag 比当前版本高才弹;同 tag 被关过不再弹,进程内发现更高 tag(新 release)重新弹。
  useEffect(() => {
    let disposed = false;
    let lastCheck = Date.now(); // 节流零点 = 挂载时刻:首个焦点检查最早 mount+10min,不抢启动预热窗口
    const check = async () => {
      try {
        // GitHub REST 对无 User-Agent 的请求直接 403(实测),必带 UA 才能过下面的状态门
        const r = await invoke<HttpReply>("http_get", {
          url: RELEASES_API,
          headers: { "User-Agent": "ip-radar-desktop" },
        });
        if (disposed || r.status < 200 || r.status >= 300) return;
        // GitHub tag_name 自带 v 前缀,与 i18n 模板字面 v(v{v})双写 → 剥前缀,统一喂比较与显示
        const tag = stripTag(String(JSON.parse(r.body)?.tag_name ?? ""));
        if (!tag || !isNewerVersion(tag, await getVersion())) return;
        if (seenUpdateRef.current !== tag) {
          seenUpdateRef.current = tag;
          setUpdateDismissed(false);
        }
        setUpdateAvailable(tag);
      } catch {
        /* 静默,下个周期再试 */
      }
    };
    const checkThrottled = () => {
      if (Date.now() - lastCheck < 10 * 60_000) return;
      lastCheck = Date.now();
      void check();
    };
    const first = window.setTimeout(() => { lastCheck = Date.now(); void check(); }, 5000);
    const every = window.setInterval(checkThrottled, 24 * 60 * 60 * 1000);
    // 热键/托盘/单实例唤起都汇于 show()+focus → Focused(true) 一处全接,10min 节流
    let unFocus: (() => void) | undefined;
    void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) checkThrottled();
    }).then(u => { unFocus = u; });
    return () => {
      disposed = true;
      clearTimeout(first);
      clearInterval(every);
      unFocus?.();
    };
  }, []);

  // 挂载读历史(store history.json → state/ref)
  useEffect(() => {
    loadHistory()
      .then(entries => {
        // 挂载竞态:热键查询可在读取落定前写入 ref(其落盘后 store.get 仍可能返回存前旧照)→ 磁盘旧条目按 IP 集合并入而非丢弃,防下次落盘清空全盘历史
        const memKeys = new Set(historyRef.current.map(e => [...e.ips].sort().join(",")));
        const merged = historyRef.current.length
          ? [...historyRef.current, ...entries.filter(e => !memKeys.has([...e.ips].sort().join(",")))].slice(0, HISTORY_CAP)
          : entries; // ref 空(无竞态)= 原始加载行为
        historyRef.current = merged;
        setHistory(merged);
      })
      .catch(() => {});
  }, []);

  // 常驻查询栏:挂载即聚焦(窗口常驻进程,热键 0 命中路径由 dispatch 兜底再聚焦)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => () => stopWarmingPoll(), [stopWarmingPoll]);

  // 主题应用:dark 默认;auto 跟系统。异步 store 读取后生效(极短暗闪可接受, ponytail: 同步缓存可消除)
  useEffect(() => {
    const light =
      settings.theme === "light" ||
      (settings.theme === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.classList.toggle("light", light);
  }, [settings.theme]);

  const toggleTheme = () => {
    const next: Settings["theme"] = document.documentElement.classList.contains("light") ? "dark" : "light";
    const merged = { ...settings, theme: next };
    onSettingsSaved(merged);
    void saveSettings(merged);
  };

  const submitInput = () => {
    if (!inputText.trim()) return;
    dispatch(inputText);
  };

  const goSettings = () => setView("settings");
  const goHistory = () => setView("history");
  const guidance = needsKeyGuidance(results) && view === "main";
  const detailSections = selectedIp ? (results.get(selectedIp) ?? []) : [];
  const invalidLines = invalidLinesOf(results);
  // 左栏分派:查询中且无旧结果 → 骨架;有旧结果 → 保留旧列表(stale-while-revalidate,防重查闪烁);
  // 未查询 → 粘贴提示;已查询 0 结果 → ResultList 内部空态
  const showSkeleton = querying && results.size === 0;

  return (
    <div className="dot-grid flex h-screen w-full flex-col overflow-hidden rounded-xl bg-zinc-950 text-zinc-100">
      <header
        data-tauri-drag-region
        className="relative flex items-center justify-between border-b border-zinc-800 px-4 py-2"
      >
        <span data-tauri-drag-region className={`${TECH_LABEL} select-none`}>
          {t("app.title")}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="history"
            onClick={goHistory}
            className="rounded-md p-1.5 text-zinc-500 transition active:scale-[0.95] hover:bg-zinc-800 hover:text-zinc-300"
          >
            <ClockCounterClockwise size={16} />
          </button>
          <button
            aria-label="theme"
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-zinc-500 transition active:scale-[0.95] hover:bg-zinc-800 hover:text-zinc-300"
          >
            {document.documentElement.classList.contains("light") ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            aria-label="minimize"
            onClick={() => void import("@tauri-apps/api/window").then(m => m.getCurrentWindow().minimize())}
            className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Minus size={14} />
          </button>
          <button
            aria-label="close"
            title={t("app.closeHint")}
            onClick={() => invoke("hide_window").catch(() => {})}
            className="rounded-md p-1.5 text-zinc-500 transition hover:bg-red-500/15 hover:text-red-400"
          >
            <X size={14} />
          </button>
          <button
            aria-label="settings"
            onClick={() => {
              if (view !== "settings") setView("settings");
            }}
            className="rounded-md p-1.5 text-zinc-500 transition active:scale-[0.95] hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Gear size={16} />
          </button>
        </div>
        {/* 查询中:header 底缘 2px 进度滑条(绝对定位,压在 border-b 上) */}
        {querying && <div className="query-progress" aria-hidden="true" />}
      </header>

      <main key={view} className="fade-in min-h-0 flex-1 overflow-hidden">
        {view === "settings" ? (
          <SettingsPage initial={settings} onSaved={onSettingsSaved} onClose={() => setView("main")} />
        ) : view === "history" ? (
          <HistoryPage
            entries={history}
            onRequery={ips => {
              setView("main");
              dispatch(ips.join("\n"));   // 重查:走 dispatch 既有管线(提取/限流/noIpHint)
            }}
            onClear={() => {
              historyRef.current = [];
              setHistory([]);
              void saveHistory([]).catch(() => {});
            }}
            onClose={() => setView("main")}
          />
        ) : (
          <div className="flex h-full flex-col">
            {/* 常驻查询栏 */}
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
              <input
                ref={inputRef}
                value={inputText}
                onChange={e => {
                  setInputText(e.target.value);
                  setNoIpHint(false);
                  setCaptureFailed(false);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") submitInput();
                }}
                placeholder={t("query.placeholder")}
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 transition-colors placeholder:font-sans placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
              />
              <button
                onClick={submitInput}
                aria-label={t("query.go")}
                aria-busy={querying}
                className={`shrink-0 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:scale-[1.02] active:scale-[0.98] ${
                  querying ? "pointer-events-none" : ""
                }`}
              >
                {querying ? <CircleNotch size={14} className="animate-spin" /> : t("query.go")}
              </button>
            </div>
            {noIpHint && (
              <div className="border-b border-zinc-800 px-4 py-1.5 text-xs text-zinc-500">{t("query.noIp")}</div>
            )}
            {captureFailed && (
              <div className="border-b border-zinc-800 px-4 py-1.5 text-xs text-amber-400/80">{t("query.captureFailed")}</div>
            )}
            {/* 新版本条(amber 同款,仅 main 视图渲染):× 进程内关闭,更高 tag 下轮重弹 */}
            {updateAvailable && !updateDismissed && (
              <div className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-400">
                <span>{t("update.available", { v: updateAvailable })}</span>
                <button
                  onClick={() => invoke("open_url", { url: RELEASES_URL }).catch(() => {})}
                  className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-500/25 transition active:scale-[0.98] hover:bg-amber-500/25"
                >
                  {t("update.go")}
                </button>
                <button
                  aria-label="dismiss"
                  onClick={() => setUpdateDismissed(true)}
                  className="ml-auto rounded-md px-1.5 py-0.5 text-amber-400/70 transition hover:bg-amber-500/15 hover:text-amber-300"
                >
                  ×
                </button>
              </div>
            )}
            {guidance && <GuidanceCard serverUrl={settings.serverUrl} onGoSettings={goSettings} />}
            {warming && (
              <div className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-400">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                {t("query.warming")}
              </div>
            )}
            {truncated && (
              <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-400">
                {t("query.truncated", truncated)}
              </div>
            )}
            {invalidLines > 0 && (
              <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-400">
                {t("query.invalidLines", { n: invalidLines })}
              </div>
            )}

            {/* 双栏:左列表 / 右详情 */}
            <div className="flex min-h-0 flex-1">
              <div
                className={`w-72 shrink-0 overflow-y-auto border-r border-zinc-800 transition-opacity duration-150 ${
                  querying && results.size > 0 ? "opacity-50" : ""
                }`}
              >
                {showSkeleton ? (
                  <ListSkeleton label={t("query.lookingUp")} />
                ) : results.size === 0 ? (
                  <div className="flex h-full items-center justify-center px-6">
                    <span className={`${TECH_LABEL} text-center leading-relaxed`}>{t("query.emptyHint")}</span>
                  </div>
                ) : (
                  <ResultList results={results} selectedIp={selectedIp} onSelect={setSelectedIp} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {selectedIp ? (
                  <ResultDetail
                    ip={selectedIp}
                    sections={detailSections}
                    settings={settings}
                    onGoSettings={goSettings}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-8">
                    <span className={`${TECH_LABEL} text-center leading-relaxed`}>{t("query.emptyHint")}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
