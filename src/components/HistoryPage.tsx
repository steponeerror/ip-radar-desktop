// 查询历史视图:顶栏返回 + 右侧清空(两步确认,3s 超时复原)+ 滚动条目区(仿 SettingsPage 骨架)。
// 条目 = 一次查询(时间 · N IP + 逐 IP verdict 徽章);徽章由 App 在查询完成时回填共识,
// verdicts 键缺失 = 灰(源全挂无共识,或重查同集合回填前——设计内,本组件不补偿)。
// 点击条目 = onRequery 重查全部;props 边界 onClose 为 supervisor 批准的第 4 项(计划钉死 3 项的勘误)。
import { useEffect, useRef, useState } from "react";
import type { HistoryEntry } from "../history";
import { useI18n } from "../i18n";
import { TECH_LABEL, ConsensusBadge } from "./badges";
import { ArrowLeft } from "@phosphor-icons/react";

interface Props {
  entries: HistoryEntry[];
  onRequery: (ips: string[]) => void;
  onClear: () => void;
  onClose: () => void;
}

/** 手写 MM-dd HH:mm(不引库);完整 ISO 时间放条目 title 供悬停。 */
function fmtTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function HistoryPage({ entries, onRequery, onClear, onClose }: Props) {
  const { t } = useI18n();
  // 清空两步确认:首次点击变红改文案,3s 无操作复原;不用 modal
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
  }, []);

  const clickClear = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    setConfirming(false);
    onClear();
  };

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
          entries.map(e => (
            <button
              key={`${e.at}-${e.ips[0]}`}
              title={new Date(e.at).toISOString()}
              onClick={() => onRequery(e.ips)}
              className="flex w-full flex-col gap-1 border-b border-zinc-800/60 px-4 py-2.5 text-left transition-colors hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:outline-none active:bg-zinc-800/70"
            >
              <span className="font-mono text-[11px] text-zinc-500">
                {fmtTime(e.at)} · {e.ips.length} 个 IP
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
          ))
        )}
      </div>
    </div>
  );
}
