import { useState } from "react";
import { useI18n } from "./i18n";
import { type Settings, validQueryLimit } from "./model";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChoiceSelect, ChoiceOption } from "@/components/ui/choice-select";
export function RetentionSettings({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (patch: Partial<Settings>) => Promise<void>;
}) {
  const { t, errorText } = useI18n();
  const [count, setCount] = useState(String(settings.historyMaxBatches));
  const [unit, setUnit] = useState(
    settings.historyRetentionHours === 0
      ? "off"
      : settings.historyRetentionHours % 24 === 0
        ? "days"
        : "hours",
  );
  const [duration, setDuration] = useState(
    String(
      settings.historyRetentionHours === 0
        ? 7
        : settings.historyRetentionHours % 24 === 0
          ? settings.historyRetentionHours / 24
          : settings.historyRetentionHours,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const hours =
    unit === "off" ? 0 : Number(duration) * (unit === "days" ? 24 : 1);
  const valid =
    validQueryLimit(Number(count)) &&
    (unit === "off" ||
      (validQueryLimit(Number(duration)) && validQueryLimit(hours)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("紀錄保留與自動清理")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="history-count">{t("最多保留批次數")}</FieldLabel>
          <Input
            id="history-count"
            inputMode="numeric"
            value={count}
            disabled={busy}
            onChange={(e) => {
              setCount(e.target.value);
              setNotice("");
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="history-unit">{t("保存期限")}</FieldLabel>
          <ChoiceSelect
            id="history-unit"
            value={unit}
            onValueChange={(v) => {
              if (!busy) {
                setUnit(v);
                setNotice("");
              }
            }}
          >
            <ChoiceOption value="days">{t("天")}</ChoiceOption>
            <ChoiceOption value="hours">{t("小時")}</ChoiceOption>
            <ChoiceOption value="off">{t("關閉時間清理")}</ChoiceOption>
          </ChoiceSelect>
        </Field>
        {unit !== "off" && (
          <Field>
            <FieldLabel htmlFor="history-duration">
              {t("保存數量（正整數）")}
            </FieldLabel>
            <Input
              id="history-duration"
              inputMode="numeric"
              value={duration}
              disabled={busy}
              onChange={(e) => {
                setDuration(e.target.value);
                setNotice("");
              }}
            />
          </Field>
        )}
        <FieldDescription>
          {t(
            "從完成或停止時計算期限；超過數量或期限的紀錄會自動刪除。正在查詢的批次不刪除。",
          )}
        </FieldDescription>
        <FieldDescription>
          {t("儲存後立即套用清理，刪除無法復原，需要保留的紀錄請先匯出。")}
        </FieldDescription>
        <FieldDescription>
          {t("每小時及開啟時檢查；舊紀錄沒有完成時間時，從首次檢查起算期限。")}
        </FieldDescription>
        <Button
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            setNotice("");
            try {
              await onSave({
                historyMaxBatches: Number(count),
                historyRetentionHours: hours,
              });
              setNotice(t("保留設定已儲存。"));
            } catch (e) {
              setNotice(errorText(e instanceof Error ? e.message : "操作失敗"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("儲存保留設定")}
        </Button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
