import { summarizeBatch, summaryProgress } from "./progress";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ChoiceSelect, ChoiceOption } from "@/components/ui/choice-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useI18n } from "./i18n";
import type { Batch, BatchSummary } from "./model";
import { PAGE_SIZE, toggleSelection } from "./result-controls";
import { PageControls, ResultPanel } from "./ResultPanel";
export function HistoryView({
  batches = [],
  summaries,
  loadBatch,
  onDelete,
  management = false,
  onDone,
}: {
  batches?: Batch[];
  summaries?: BatchSummary[];
  loadBatch?: (id: string) => Promise<Batch | undefined>;
  management?: boolean;
  onDone?: () => void;
  onDelete: (ids: string[]) => Promise<void>;
}) {
  const { t, locale, errorText } = useI18n();
  const [batchId, setBatchId] = useState("");
  const managing = management;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const completed = (summaries ?? batches.map(summarizeBatch)).filter(
    (b) => b.finished,
  );
  const current =
    completed.find((batch) => batch.id === batchId) || completed[0];
  const chosen = completed.filter((batch) => selected.has(batch.id));
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(completed.length / PAGE_SIZE) - 1),
  );
  const [detail, setDetail] = useState<Batch>();
  const [loadError, setLoadError] = useState("");
  const currentId = current?.id;
  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    setLoadError("");
    if (!management && currentId && loadBatch) {
      void loadBatch(currentId)
        .then((batch) => {
          if (!cancelled) {
            setDetail(batch);
            if (!batch) setLoadError("找不到此批次");
          }
        })
        .catch((e) => {
          if (!cancelled)
            setLoadError(e instanceof Error ? e.message : "操作失敗");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [currentId, loadBatch, management]);
  const displayed = loadBatch
    ? detail?.id === currentId
      ? detail
      : undefined
    : batches.find((b) => b.id === currentId);
  const label = (batch: BatchSummary) =>
    batch.createdAt != null
      ? `${new Date(batch.createdAt).toLocaleString(locale)} · ${batch.total} IP`
      : `${t("舊紀錄")} · ${batch.id.slice(0, 8)} · ${t("選取後載入摘要")}`;
  async function remove() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(confirm);
      setSelected(new Set());
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("操作失敗"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {management && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" disabled={busy} onClick={onDone}>
            {t("完成管理")}
          </Button>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{errorText(error)}</AlertDescription>
        </Alert>
      )}
      {managing ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("管理批次")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <FieldGroup>
              {completed
                .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
                .map((batch) => (
                  <Field key={batch.id} orientation="horizontal">
                    <Checkbox
                      id={`batch-delete-${batch.id}`}
                      disabled={busy || !!confirm}
                      checked={selected.has(batch.id)}
                      onCheckedChange={(checked) =>
                        setSelected((previous) =>
                          toggleSelection(previous, batch.id, checked),
                        )
                      }
                    />
                    <FieldLabel htmlFor={`batch-delete-${batch.id}`}>
                      {label(batch)} ·{" "}
                      {batch.cancelled ? t("已停止") + " · " : ""}
                      {summaryProgress(batch, t, true)}
                    </FieldLabel>
                  </Field>
                ))}
            </FieldGroup>
            <PageControls
              page={safePage}
              count={completed.length}
              unit={t("批次")}
              onChange={setPage}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !!confirm}
                onClick={() =>
                  setSelected(new Set(completed.map((batch) => batch.id)))
                }
              >
                {t("勾選全部批次")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !!confirm}
                onClick={() => setSelected(new Set())}
              >
                {t("重置勾選")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || !chosen.length || !!confirm}
                onClick={() => setConfirm(chosen.map((batch) => batch.id))}
              >
                {t("刪除已勾選批次")} ({chosen.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !management ? (
        <>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="batch">{t("查詢批次")}</FieldLabel>
              <ChoiceSelect
                id="batch"
                value={current?.id || ""}
                onValueChange={(value) => {
                  setBatchId(value);
                  setConfirm(null);
                }}
              >
                <ChoiceOption value="" disabled>
                  {t("尚無紀錄")}
                </ChoiceOption>
                {completed.map((batch) => (
                  <ChoiceOption key={batch.id} value={batch.id}>
                    {label(batch)}
                  </ChoiceOption>
                ))}
              </ChoiceSelect>
            </Field>
          </FieldGroup>
          <div className="flex items-center justify-between gap-3">
            <p
              className="min-w-0 flex-1 text-xs text-muted-foreground"
              role="status"
            >
              {current && (
                <>
                  {current.cancelled ? t("已停止") + " · " : ""}
                  {summaryProgress(current, t, true)}
                </>
              )}
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      className="shrink-0"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("刪除此批次")}
                      disabled={!current || busy}
                      onClick={() => current && setConfirm([current.id])}
                    />
                  }
                >
                  <Trash2 />
                </TooltipTrigger>
                <TooltipContent>{t("刪除此批次")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </>
      ) : null}
      {confirm && (
        <Alert>
          <AlertDescription>
            <div className="flex flex-col gap-2">
              <p>
                {t("確認刪除批次，刪除後無法復原。")} ({confirm.length})
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {t("刪除")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  {t("取消")}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!management && loadError && (
        <Alert variant="destructive">
          <AlertDescription>{errorText(loadError)}</AlertDescription>
        </Alert>
      )}
      {!management && currentId && !displayed && !loadError && (
        <p role="status">{t("載入中…")}</p>
      )}
      {!management && (!currentId || displayed) && (
        <ResultPanel key={current?.id || "empty"} batch={displayed} history />
      )}
    </div>
  );
}
