import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { useId, useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChoiceSelect, ChoiceOption } from "@/components/ui/choice-select";
import { Results } from "./ResultView";
import { useI18n } from "./i18n";
import { downloadCsv } from "./csv";
import type { Batch } from "./model";
import { countryLabel, resultOf, verdictLabels } from "./result-model";
import {
  PAGE_SIZE,
  batchFinished,
  emptyFilters,
  filterResults,
  toggleSelection,
  validScoreFilter,
  type ResultFilters,
  type ScoreOperator,
} from "./result-controls";
export function QueryExport({ batch }: { batch?: Batch }) {
  const { t, locale } = useI18n();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={!batchFinished(batch)}
      onClick={() => {
        if (batchFinished(batch)) downloadCsv(batch!.rows, locale);
      }}
    >
      <Download data-icon="inline-start" />
      {t("匯出 CSV")}
    </Button>
  );
}
export function PageControls({
  page,
  count,
  onChange,
  unit = "IP",
}: {
  page: number;
  count: number;
  unit?: string;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <Pagination aria-label={t("結果分頁")}>
      <PaginationContent className="w-full justify-between">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text={t("上一頁")}
            aria-label={t("上一頁")}
            aria-disabled={page === 0}
            tabIndex={page === 0 ? -1 : 0}
            className={
              page === 0 ? "pointer-events-none opacity-50" : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onChange(page - 1);
            }}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {pages} · {count} {unit}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            text={t("下一頁")}
            aria-label={t("下一頁")}
            aria-disabled={page + 1 >= pages}
            tabIndex={page + 1 >= pages ? -1 : 0}
            className={
              page + 1 >= pages ? "pointer-events-none opacity-50" : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              if (page + 1 < pages) onChange(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
export function ResultPanel({
  batch,
  history = false,
}: {
  batch?: Batch;
  history?: boolean;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ResultFilters>({ ...emptyFilters });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filterCount = [
    filters.text.trim(),
    filters.country,
    filters.verdict,
    filters.operator !== "any",
  ].filter(Boolean).length;
  const rows = batch?.rows ?? [];
  const filtered = history ? filterResults(rows, filters, locale) : rows;
  const valid = !history || validScoreFilter(filters);
  const finished = batchFinished(batch);
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
  );
  const visible = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );
  const chosen = rows.filter((row) => selected.has(row.ip));
  const hidden = chosen.filter(
    (row) => !filtered.some((item) => item.ip === row.ip),
  ).length;
  const countries = [
    ...new Set(
      rows
        .map((row) => resultOf(row).country)
        .filter((code): code is string => !!code),
    ),
  ].sort();
  function update(patch: Partial<ResultFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  }
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t(history ? "紀錄結果" : "查詢結果")}
    >
      {history && (
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <SlidersHorizontal data-icon="inline-start" />
              {t("篩選紀錄")}
              {filterCount > 0 ? ` (${filterCount})` : ""}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(420px,calc(100vw-32px))] max-h-[min(480px,calc(100dvh-48px))] overflow-y-auto p-4"
            >
              <PopoverHeader>
                <PopoverTitle>{t("篩選紀錄")}</PopoverTitle>
              </PopoverHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${id}-search`}>
                    {t("篩選紀錄")}
                  </FieldLabel>
                  <Input
                    id={`${id}-search`}
                    value={filters.text}
                    placeholder={t("搜尋 IP、地區或 ISP…")}
                    onChange={(e) => update({ text: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${id}-country`}>
                      {t("地區")}
                    </FieldLabel>
                    <ChoiceSelect
                      id={`${id}-country`}
                      value={filters.country}
                      onValueChange={(value) => update({ country: value })}
                    >
                      <ChoiceOption value="">{t("全部")}</ChoiceOption>
                      {countries.map((code) => (
                        <ChoiceOption key={code} value={code}>
                          {countryLabel(code, locale)}
                        </ChoiceOption>
                      ))}
                    </ChoiceSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-verdict`}>
                      {t("總判定")}
                    </FieldLabel>
                    <ChoiceSelect
                      id={`${id}-verdict`}
                      value={filters.verdict}
                      onValueChange={(value) => update({ verdict: value })}
                    >
                      <ChoiceOption value="">{t("全部")}</ChoiceOption>
                      {Object.entries(verdictLabels).map(([code, label]) => (
                        <ChoiceOption key={code} value={code}>
                          {t(label)}
                        </ChoiceOption>
                      ))}
                    </ChoiceSelect>
                  </Field>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field className="min-w-40 flex-1">
                    <FieldLabel htmlFor={`${id}-operator`}>
                      {t("AbuseIPDB 分數")}
                    </FieldLabel>
                    <ChoiceSelect
                      id={`${id}-operator`}
                      value={filters.operator}
                      onValueChange={(value) =>
                        update({ operator: value as ScoreOperator })
                      }
                    >
                      {(
                        [
                          ["any", "不限分數"],
                          ["gt", "大於 >"],
                          ["gte", "大於或等於 ≥"],
                          ["lt", "小於 <"],
                          ["lte", "小於或等於 ≤"],
                          ["eq", "等於 ="],
                          ["between", "介於（含邊界）"],
                          ["missing", "沒有分數"],
                        ] as const
                      ).map(([value, label]) => (
                        <ChoiceOption key={value} value={value}>
                          {t(label)}
                        </ChoiceOption>
                      ))}
                    </ChoiceSelect>
                  </Field>
                  {!["any", "missing"].includes(filters.operator) && (
                    <Field className="w-40" data-invalid={!valid}>
                      <FieldLabel htmlFor={`${id}-score`}>
                        {t("分數")}
                      </FieldLabel>
                      <Input
                        type="text"
                        inputMode="numeric"
                        id={`${id}-score`}
                        value={filters.score}
                        aria-invalid={!valid}
                        onChange={(e) => update({ score: e.target.value })}
                      />
                    </Field>
                  )}
                  {filters.operator === "between" && (
                    <Field className="w-40" data-invalid={!valid}>
                      <FieldLabel htmlFor={`${id}-upper`}>
                        {t("上限")}
                      </FieldLabel>
                      <Input
                        type="text"
                        inputMode="numeric"
                        id={`${id}-upper`}
                        value={filters.upper}
                        aria-invalid={!valid}
                        onChange={(e) => update({ upper: e.target.value })}
                      />
                    </Field>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setFilters({ ...emptyFilters });
                      setPage(0);
                    }}
                  >
                    {t("重置篩選")}
                  </Button>
                </div>
                {!valid && (
                  <FieldError>
                    {t("請輸入 0–100 的有效分數，上限不可低於下限。")}
                  </FieldError>
                )}
              </FieldGroup>
              <Button
                size="sm"
                className="self-end"
                onClick={() => setFilterOpen(false)}
              >
                {t("完成篩選")}
              </Button>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            variant="outline"
            disabled={!finished || !valid || !filtered.length}
            onClick={() => {
              if (finished && valid) downloadCsv(filtered, locale);
            }}
          >
            {t("匯出篩選結果")} ({filtered.length})
          </Button>
          {!selecting ? (
            <Button
              size="sm"
              variant="default"
              disabled={!rows.length}
              onClick={() => setSelecting(true)}
            >
              {t("開始勾選")}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!finished || !chosen.length}
                onClick={() => {
                  if (finished) downloadCsv(chosen, locale);
                }}
              >
                {t("匯出已勾選")} ({chosen.length})
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    visible.forEach((row) => next.add(row.ip));
                    return next;
                  })
                }
                disabled={!visible.length}
              >
                {t("勾選本頁")}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => setSelected(new Set())}
                disabled={!chosen.length}
              >
                {t("重置勾選")}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setSelected(new Set());
                  setSelecting(false);
                }}
              >
                {t("取消勾選")}
              </Button>
            </>
          )}
        </div>
      )}
      {history && selecting && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("已勾選")} {chosen.length} · {t("篩選外已勾選")} {hidden} ·{" "}
          {t("勾選跨頁保留，匯出已勾選包含篩選外項目。")}
        </p>
      )}
      {!finished && rows.length > 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("查詢完成後才能匯出 CSV。")}
        </p>
      )}
      <Results
        rows={visible}
        selected={history && selecting ? selected : undefined}
        onSelect={(ip, checked) =>
          setSelected((previous) => toggleSelection(previous, ip, checked))
        }
      />
      {filtered.length > 0 && (
        <PageControls
          page={safePage}
          count={filtered.length}
          onChange={setPage}
        />
      )}
    </section>
  );
}
