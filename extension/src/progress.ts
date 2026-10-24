import type { Batch } from "./model";

export function batchProgress(
  batch: Batch,
  t: (text: string) => string,
  compact = false,
): string {
  const ids = batch.sourceIds ?? [
    ...new Set(
      batch.rows.flatMap((r) => (r.sections ?? []).map((s) => s.sourceId)),
    ),
  ];
  return ids
    .map((id) => {
      const sections = batch.rows.flatMap((r) =>
        (r.sections ?? []).filter((s) => s.sourceId === id),
      );
      const success = sections.filter((s) => s.status === "ok").length;
      const failed = sections.length - success;
      const remaining = batch.rows.length - sections.length;
      const status =
        success === batch.rows.length
          ? t("已查完")
          : remaining > 0
            ? t(batch.cancelled ? "已停止，未查完" : "查詢中")
            : t("已結束，部分未成功");
      return `${id === "ipradar" ? "Radar" : "AbuseIPDB"} ${t("成功")} ${success}/${batch.rows.length}${failed ? ` · ${t("失敗／未查詢")} ${failed}` : ""}${compact ? "" : ` · ${status}`}`;
    })
    .join("；");
}
