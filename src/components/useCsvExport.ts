// 导出 CSV 共用助手(T4/T5):主视图与历史回看同一实现——save_csv 原生另存为 +
// 三态 note(null=静默/取消、saved、failed)。数据变化时由调用方 clearNote() 过期旧提示。
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultCsvName, toCsv } from "../csv";
import type { SourceSection } from "../sources/_types";
import { useI18n } from "../i18n";

export function useCsvExport() {
  const { t } = useI18n();
  // null = 静默(未导出/用户取消);saved/failed 渲染为提示条
  const [note, setNote] = useState<string | null>(null);
  /** 导出筛选后所见(WYSIWYG):rows 为 [ip, sections] 行;at = 该批数据的查询时刻。 */
  const exportCsv = async (rows: [string, SourceSection[]][], at: number) => {
    if (rows.length === 0) return;
    try {
      const saved = await invoke<string | null>("save_csv", {
        fileName: defaultCsvName(),
        content: toCsv(rows.map(([ip, sections]) => ({ ip, sections, at })), t),
      });
      setNote(saved ? t("export.saved", { path: saved }) : null);
    } catch {
      setNote(t("export.failed"));
    }
  };
  // 稳定引用:进 runQuery 依赖数组(见 App.tsx)不破坏其刻意最小依赖
  const clearNote = useCallback(() => setNote(null), []);
  return { note, exportCsv, clearNote };
}
