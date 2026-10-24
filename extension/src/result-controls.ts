import type { Batch, Row, State } from "./model";
import { countryLabel, resultOf } from "./result-model";
export const PAGE_SIZE = 5;
export const batchFinished = (batch?: Batch) =>
  !!batch?.rows.length && batch.rows.every((row) => row.status === "done");
/** Include partial source results; exclude IPs with no response yet. */
export const queriedRows = (batch?: Batch) =>
  batch?.rows.filter(
    (row) => !!row.sections?.length || row.status === "done",
  ) ?? [];
export type ScoreOperator =
  "any" | "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "missing";
export interface ResultFilters {
  text: string;
  operator: ScoreOperator;
  score: string;
  upper: string;
  country: string;
  verdict: string;
}
export const emptyFilters: ResultFilters = {
  text: "",
  operator: "any",
  score: "50",
  upper: "100",
  country: "",
  verdict: "",
};
export function validScoreFilter(f: ResultFilters) {
  if (f.operator === "any" || f.operator === "missing") return true;
  const valid = (value: string) =>
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100;
  return (
    valid(f.score) &&
    (f.operator !== "between" ||
      (valid(f.upper) && Number(f.upper) >= Number(f.score)))
  );
}
export function filterResults(rows: Row[], f: ResultFilters, locale: string) {
  if (!validScoreFilter(f)) return [];
  return rows.filter((row) => {
    const r = resultOf(row);
    const text = [
      row.ip,
      r.country,
      countryLabel(r.country, locale),
      row.city,
      r.radar?.city?.value,
      row.isp,
    ]
      .join(" ")
      .toLowerCase();
    if (
      !text.includes(f.text.trim().toLowerCase()) ||
      (f.country === "disagreed"
        ? !r.countryDisagreed
        : f.country && r.country !== f.country) ||
      (f.verdict && r.code !== f.verdict)
    )
      return false;
    const score = r.abuse?.score ?? row.score;
    if (f.operator === "any") return true;
    if (f.operator === "missing") return score == null;
    if (score == null) return false;
    const value = Number(f.score);
    switch (f.operator) {
      case "gt":
        return score > value;
      case "gte":
        return score >= value;
      case "lt":
        return score < value;
      case "lte":
        return score <= value;
      case "eq":
        return score === value;
      case "between":
        return score >= value && score <= Number(f.upper);
    }
  });
}
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
  checked: boolean,
) {
  const next = new Set(selected);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}
export function deleteBatches(state: State, ids: string[]) {
  const selected = new Set(ids);
  if (state.batches.some((b) => selected.has(b.id) && !batchFinished(b)))
    throw new Error("請先停止查詢再刪除。");
  state.batches = state.batches.filter((b) => !selected.has(b.id));
}
