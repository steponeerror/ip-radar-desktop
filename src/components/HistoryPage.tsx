// 查询历史视图(共识 Q4/Q6/Q9):条目列表 + 回看子视图。
// 条目列表:存档条目点击=回看(钻入子视图),骨架条目点击=重查;hover 两步确认单删;清空全部保留。
// 回看子视图:与主视图同构(FilterBar + ResultList + ResultDetail 整套复用),只读不发起查询。
// 徽章由 App 在查询完成时回填共识;verdicts 键缺失 = 灰(源全挂无共识,或重查同集合回填前——设计内)。
import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEntry } from "../history";
import type { Settings } from "../sources/_types";
import { useI18n } from "../i18n";
import { TECH_LABEL, ConsensusBadge } from "./badges";
import { ResultList } from "./ResultList";
import { ResultDetail } from "./ResultDetail";
import { FilterBar, Toolbar, ICON_BTN } from "./FilterBar";
import {
  emptyFilters,
  filterResults,
  type ResultFilters,
  type ResultRow,
} from "../result-model";
import { useCsvExport } from "./useCsvExport";
import {
  ArrowLeft,
  ArrowClockwise,
  Archive,
  TrashSimple,
  Download,
} from "@phosphor-icons/react";

interface Props {
  entries: HistoryEntry[];
  settings: Settings;
  onGoSettings: () => void;
  onRequery: (ips: string[]) => void;
  onDelete: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** 条目稳定键(App 的单删 onDelete 按同一键过滤,故导出)。 */
export const entryKey = (e: HistoryEntry) => `${e.at}-${e.ips[0]}`;

/** 手写 MM-dd HH:mm(不引库);完整 ISO 时间放条目 title 供悬停。 */
function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 回看子视图:只读渲染条目已存 sections,筛选/导出作用于所见(WYSIWYG,共识 Q7)。 */
function HistoryViewing({
  entry,
  settings,
  onGoSettings,
  onRequery,
  onBack,
}: {
  entry: HistoryEntry;
  settings: Settings;
  onGoSettings: () => void;
  onRequery: (ips: string[]) => void;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const rows = useMemo<ResultRow[]>(() => Object.entries(entry.sections ?? {}), [entry]);
  const [filters, setFilters] = useState<ResultFilters>({ ...emptyFilters });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string | null>(rows[0]?.[0] ?? null);
  const { note: exportNote, exportCsv, clearNote } = useCsvExport();
  const filteredRows = useMemo(() => filterResults(rows, filters, lang), [rows, filters, lang]);
  const filteredMap = useMemo(() => new Map(filteredRows), [filteredRows]);
  // 提示过期:切换条目时清旧「已保存」;返回路径由卸载重置覆盖(T5)
  useEffect(() => { clearNote(); }, [entry, clearNote]);
  const filterCount = [
    filters.text.trim(),
    filters.country,
    filters.verdict,
    filters.operator !== "any",
  ].filter(Boolean).length;

  // 筛选把选中行滤掉 → 跳到首个可见行;全空 → 清空右栏
  useEffect(() => {
    if (selectedIp && filteredRows.some(([ip]) => ip === selectedIp)) return;
    setSelectedIp(filteredRows.length ? filteredRows[0][0] : null);
  }, [filteredRows, selectedIp]);

  const exportView = () => exportCsv(filteredRows, entry.at);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition active:scale-[0.97] hover:bg-zinc-800 hover:text-zinc-300"
          >
            <ArrowLeft size={12} weight="bold" /> {t("history.backToList")}
          </button>
          <span className={`${TECH_LABEL} truncate`}>
            {t("history.viewing")} · {new Date(entry.at).toLocaleString()}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* 导出作用于筛选后所见(WYSIWYG),与主视图同规则;at 用条目查询时刻 */}
          <button
            aria-label={t("export.button")}
            title={t("export.button")}
            disabled={filteredRows.length === 0}
            onClick={exportView}
            className={ICON_BTN}
          >
            <Download size={13} />
          </button>
          <button
            onClick={() => onRequery(entry.ips)}
            className="flex items-center gap-1 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-700"
          >
            <ArrowClockwise size={12} /> {t("history.requery")}
          </button>
        </div>
      </div>
      {exportNote && (
        <div className="truncate border-b border-zinc-800 px-4 py-1 text-[10px] text-zinc-500">{exportNote}</div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <Toolbar
            open={filterOpen}
            onToggle={() => setFilterOpen(o => !o)}
            filterCount={filterCount}
            onClearFilters={() => setFilters({ ...emptyFilters })}
          />
          {filterOpen && <FilterBar rows={rows} filters={filters} onChange={setFilters} />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredMap.size > 0 ? (
              <ResultList results={filteredMap} selectedIp={selectedIp} onSelect={setSelectedIp} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
                {t("query.noResults")}
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {selectedIp ? (
            <ResultDetail
              ip={selectedIp}
              sections={filteredMap.get(selectedIp) ?? []}
              settings={settings}
              onGoSettings={onGoSettings}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <span className={`${TECH_LABEL} text-center leading-relaxed`}>{t("query.emptyHint")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HistoryPage({ entries, settings, onGoSettings, onRequery, onDelete, onClear, onClose }: Props) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<HistoryEntry | null>(null);
  // 单删两步确认:首次点击变红,3s 无操作复原;与清空按钮同一模式
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);
  // 清空两步确认:首次点击变红改文案,3s 无操作复原;不用 modal
  const [confirming, setConfirming] = useState(false);
  const deleteAllTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    if (deleteAllTimer.current !== null) clearTimeout(deleteAllTimer.current);
  }, []);

  const clickClear = () => {
    if (!confirming) {
      setConfirming(true);
      deleteAllTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (deleteAllTimer.current !== null) clearTimeout(deleteAllTimer.current);
    setConfirming(false);
    onClear();
  };

  const clickDelete = (key: string) => () => {
    if (confirmKey !== key) {
      setConfirmKey(key);
      if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmKey(null), 3000);
      return;
    }
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    setConfirmKey(null);
    onDelete(key);
  };

  if (viewing) {
    return (
      <HistoryViewing
        entry={viewing}
        settings={settings}
        onGoSettings={onGoSettings}
        onRequery={ips => {
          setViewing(null);
          onRequery(ips);
        }}
        onBack={() => setViewing(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition active:scale-[0.97] hover:bg-zinc-800 hover:text-zinc-300"
          >
            <ArrowLeft size={12} weight="bold" /> {t("common.back")}
          </button>
          <span className={TECH_LABEL}>{t("history.title")}</span>
        </div>
        <button
          onClick={clickClear}
          className={
            confirming
              ? "rounded-md bg-red-500/15 px-2.5 py-1 text-xs text-red-400 ring-1 ring-red-500/25 transition active:scale-[0.98] hover:bg-red-500/25"
              : "rounded-md px-2.5 py-1 text-xs text-zinc-500 transition active:scale-[0.98] hover:bg-zinc-800 hover:text-zinc-300"
          }
        >
          {confirming ? t("history.clearConfirm") : t("history.clear")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
            {t("history.empty")}
          </div>
        ) : (
          entries.map(e => {
            const key = entryKey(e);
            const confirmingThis = confirmKey === key;
            return (
              <div key={key} className="group relative border-b border-zinc-800/60 hover:bg-zinc-900">
                <button
                  title={new Date(e.at).toISOString()}
                  onClick={() => (e.sections ? setViewing(e) : onRequery(e.ips))}
                  className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors focus-visible:bg-zinc-900 focus-visible:outline-none active:bg-zinc-800/70"
                >
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                    {fmtTime(e.at)} · {t("history.ipCount", { n: e.ips.length })}
                    {e.sections && (
                      <Archive size={10} className="text-emerald-500/70" aria-label={t("history.archive")} />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    {e.ips.slice(0, 5).map(ip => {
                      const code = e.verdicts?.[ip];
                      return (
                        <span key={ip} className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-sm text-zinc-200">{ip}</span>
                          {code ? (
                            <ConsensusBadge consensus={{ kind: "verdict", code }} t={t} />
                          ) : (
                            // 灰徽章:无共识/回填未完成(键缺失 = 设计内语义)
                            <span className="shrink-0 rounded bg-zinc-700/30 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-600/30">
                              —
                            </span>
                          )}
                        </span>
                      );
                    })}
                    {e.ips.length > 5 && (
                      <span className="text-[11px] text-zinc-500">
                        {t("history.more", { n: e.ips.length - 5 })}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  title={confirmingThis ? t("history.deleteConfirm") : t("history.delete")}
                  aria-label={confirmingThis ? t("history.deleteConfirm") : t("history.delete")}
                  onClick={clickDelete(key)}
                  className={`absolute right-1.5 top-1.5 rounded-md p-1 transition focus-visible:opacity-100 ${
                    confirmingThis
                      ? "bg-red-500/15 text-red-400 opacity-100 ring-1 ring-red-500/25"
                      : "text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100"
                  }`}
                >
                  <TrashSimple size={11} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
