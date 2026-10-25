import type { Batch, BatchSummary } from "./model";

export function batchProgress(
  batch: Batch,
  t: (text: string) => string,
  compact = false,
): string {
  return summaryProgress(summarizeBatch(batch), t, compact);
}
export function summarizeBatch(batch: Batch): BatchSummary {
  const ids = batch.sourceIds ?? [
    ...new Set(
      batch.rows.flatMap((r) => (r.sections ?? []).map((s) => s.sourceId)),
    ),
  ];
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    total: batch.rows.length,
    finished:
      !!batch.rows.length && batch.rows.every((r) => r.status === "done"),
    cancelled: batch.cancelled,
    sources: ids.map((id) => {
      const sections = batch.rows.flatMap((r) =>
        (r.sections ?? []).filter((s) => s.sourceId === id),
      );
      const success = sections.filter((s) => s.status === "ok").length;
      return { id, success, failed: sections.length - success };
    }),
  };
}
export function summaryProgress(
  batch: BatchSummary,
  t: (text: string) => string,
  compact = false,
): string {
  if (batch.total == null) return t("選取後載入摘要");
  return (batch.sources ?? [])
    .map(({ id, success, failed }) => {
      const remaining = batch.total! - success - failed;
      const status =
        success === batch.total
          ? t("已查完")
          : remaining > 0
            ? t(batch.cancelled ? "已停止，未查完" : "查詢中")
            : t("已結束，部分未成功");
      return `${id === "ipradar" ? "Radar" : "AbuseIPDB"} ${t("成功")} ${success}/${batch.total}${failed ? ` · ${t("失敗／未查詢")} ${failed}` : ""}${compact ? "" : ` · ${status}`}`;
    })
    .join("；");
}
