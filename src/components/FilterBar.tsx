// 左栏控件簇(主视图与回看子视图共用,共识 Q5):筛选栏 + 工具行。
// 语义纯函数在 result-model.ts;此处仅控件。国家下拉由当前未筛数据派生。
// 工具行 = 筛选开关 + 激活计数 + 清除 ×;导出按钮仅主视图传入(回看子视图的导出在其顶栏)。
import { useI18n } from "../i18n";
import {
  availableCountries,
  validScoreFilter,
  VERDICT_CODES,
  type ResultFilters,
  type ResultRow,
} from "../result-model";
import { Download, Funnel, X } from "@phosphor-icons/react";

const INPUT_CLS =
  "min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:font-sans placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none";
const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-300 focus:border-emerald-600 focus:outline-none";

export const ICON_BTN =
  "rounded-md p-1 text-zinc-500 transition active:scale-[0.95] hover:bg-zinc-800 hover:text-zinc-300 disabled:pointer-events-none disabled:opacity-40";

export function FilterBar({
  rows,
  filters,
  onChange,
}: {
  rows: ResultRow[];
  filters: ResultFilters;
  onChange: (f: ResultFilters) => void;
}) {
  const { t } = useI18n();
  const countries = availableCountries(rows);
  const valid = validScoreFilter(filters);
  const update = (patch: Partial<ResultFilters>) => onChange({ ...filters, ...patch });
  const needsValue = filters.operator !== "any" && filters.operator !== "missing";

  return (
    <div className="flex flex-col gap-1.5 border-b border-zinc-800 px-3 py-2">
      <input
        type="text"
        value={filters.text}
        placeholder={t("filter.search")}
        onChange={e => update({ text: e.target.value })}
        className={INPUT_CLS}
      />
      <div className="flex gap-1.5">
        <select
          aria-label={t("filter.country")}
          value={filters.country}
          onChange={e => update({ country: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">{t("filter.country")}·{t("filter.all")}</option>
          {countries.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select
          aria-label={t("filter.verdict")}
          value={filters.verdict}
          onChange={e => update({ verdict: e.target.value })}
          className={SELECT_CLS}
        >
          <option value="">{t("filter.verdict")}·{t("filter.all")}</option>
          {VERDICT_CODES.map(code => (
            <option key={code} value={code}>{t(`verdict.${code}`)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={t("filter.score")}
          value={filters.operator}
          onChange={e => update({ operator: e.target.value as ResultFilters["operator"] })}
          className={SELECT_CLS}
        >
          {(["any", "gt", "gte", "lt", "lte", "eq", "between", "missing"] as const).map(op => (
            <option key={op} value={op}>{t(`filter.op.${op}`)}</option>
          ))}
        </select>
        {needsValue && (
          <input
            type="text"
            inputMode="numeric"
            aria-label={t("filter.scoreVal")}
            value={filters.score}
            aria-invalid={!valid}
            onChange={e => update({ score: e.target.value })}
            className={`${INPUT_CLS} w-14 flex-none`}
          />
        )}
        {filters.operator === "between" && (
          <input
            type="text"
            inputMode="numeric"
            aria-label={t("filter.upper")}
            value={filters.upper}
            aria-invalid={!valid}
            onChange={e => update({ upper: e.target.value })}
            className={`${INPUT_CLS} w-14 flex-none`}
          />
        )}
      </div>
      {!valid && <p className="text-[10px] text-red-400">{t("filter.invalid")}</p>}
    </div>
  );
}

/** 筛选开关 + 激活计数 + 清除(左栏窄工具行);onExport 传入才渲染导出图标(WYSIWYG)。 */
export function Toolbar({
  open,
  onToggle,
  filterCount,
  onClearFilters,
  onExport,
  exportDisabled,
  exportTitle,
}: {
  open: boolean;
  onToggle: () => void;
  filterCount: number;
  onClearFilters: () => void;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportTitle?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-1.5">
      <button aria-label={t("filter.title")} aria-pressed={open} onClick={onToggle} className={ICON_BTN}>
        <Funnel size={13} weight={open ? "fill" : "regular"} />
      </button>
      {filterCount > 0 && (
        <>
          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">
            {filterCount}
          </span>
          <button aria-label={t("filter.clear")} onClick={onClearFilters} className={ICON_BTN}>
            <X size={11} />
          </button>
        </>
      )}
      <span className="flex-1" />
      {onExport && (
        <button aria-label={exportTitle} title={exportTitle} disabled={exportDisabled} onClick={onExport} className={ICON_BTN}>
          <Download size={13} />
        </button>
      )}
    </div>
  );
}
