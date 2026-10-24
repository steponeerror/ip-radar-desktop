import { useEffect, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { abuseBlocked, abuseKeyId, type AbuseLimits } from "./abuse-limits";
import { useI18n } from "./i18n";

export function AbuseStatusView({
  limits,
  hasKey,
  compact = false,
  now = Date.now(),
}: {
  limits?: AbuseLimits;
  hasKey: boolean;
  compact?: boolean;
  now?: number;
}) {
  const { t, locale } = useI18n();
  const cooling = hasKey && abuseBlocked(limits, now);
  const date = (value?: number) =>
    value == null ? t("未知") : new Date(value).toLocaleString(locale);
  const notice = cooling ? (
    <Alert>
      <AlertTitle>
        {t(
          limits?.reason === "quota"
            ? "AbuseIPDB 額度已用完"
            : "AbuseIPDB 需冷卻",
        )}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t("已停止 AbuseIPDB 後續查詢；Radar 不受影響，已取得的結果會保留。")}
        </p>
        <p>
          {t("可再次查詢時間")}：{date(limits?.blockedUntil)}
        </p>
        {limits?.estimated && (
          <p>{t("API 未提供有效等待時間，暫採 60 秒冷卻。")}</p>
        )}
        <p>{t("冷卻結束後可另開新批次，不會自動重查已停止的項目。")}</p>
      </AlertDescription>
    </Alert>
  ) : null;
  if (compact) return notice;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("AbuseIPDB 額度與冷卻")}</CardTitle>
        <CardDescription>
          {t("顯示此 API Key 最近一次回應的額度，不會為了更新狀態額外查詢。")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasKey ? (
          <p>{t("請先設定 AbuseIPDB API Key。")}</p>
        ) : (
          <>
            {notice}
            {!cooling && (
              <p>
                {t(
                  limits?.blockedUntil
                    ? "冷卻已結束，可開始新查詢。"
                    : "目前沒有已知的冷卻限制。",
                )}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>{t("剩餘查詢額度（上次回應）")}</dt>
              <dd>{limits?.remaining ?? t("未知")}</dd>
              <dt>{t("每日查詢上限")}</dt>
              <dd>{limits?.limit ?? t("未知")}</dd>
              <dt>{t("額度重置時間")}</dt>
              <dd>{date(limits?.resetAt)}</dd>
              <dt>{t("額度最後更新")}</dt>
              <dd>{date(limits?.updatedAt)}</dd>
            </dl>
            {(limits?.resetAt ?? Infinity) <= now && (
              <p className="text-sm text-muted-foreground">
                {t("已超過上次重置時間，實際額度待下次回應確認。")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AbuseStatus({
  apiKey,
  records,
  compact = false,
}: {
  apiKey: string;
  records?: Record<string, AbuseLimits>;
  compact?: boolean;
}) {
  const [identity, setIdentity] = useState({ key: "", id: "" });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let alive = true;
    void abuseKeyId(apiKey).then((id) => {
      if (alive) setIdentity({ key: apiKey, id });
    });
    return () => {
      alive = false;
    };
  }, [apiKey]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const limits = identity.key === apiKey ? records?.[identity.id] : undefined;
  return (
    <AbuseStatusView
      limits={limits}
      hasKey={!!apiKey.trim()}
      compact={compact}
      now={now}
    />
  );
}
