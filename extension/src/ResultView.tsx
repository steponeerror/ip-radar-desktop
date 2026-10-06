import { useI18n } from "./i18n";
import { Button } from "@/components/ui/button";
import { Fragment, useState, useId, type ReactNode } from "react";
import { Radar, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  abuseScoreBand,
  confidenceBand,
  type LookupResult,
  type AbuseSection,
} from "../../shared/intelligence";
import {
  resultOf,
  verdictLabels,
  classLabel,
  countryLabel,
} from "./result-model";
import type { Row } from "./model";

function Verdict({ code, value }: { code: string; value?: number }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      data-tone={
        code === "malicious"
          ? "danger"
          : code === "benign"
            ? "success"
            : code === "suspicious" || code === "disagreed"
              ? "warning"
              : undefined
      }
    >
      {t(verdictLabels[code] || code)}
      {value != null && (code === "malicious" || code === "suspicious")
        ? ` ${value}`
        : ""}
    </Badge>
  );
}
function ClassificationBadges({ row }: { row: Row }) {
  const { t } = useI18n();
  const { classes, infos } = resultOf(row);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="flex flex-nowrap gap-1 overflow-x-auto pb-1"
        aria-label={t("命中分類")}
      >
        {classes.map((c) => (
          <Badge
            key={c.type}
            variant="outline"
            data-tone={
              c.verdict === "malicious"
                ? "danger"
                : c.verdict === "suspicious"
                  ? "warning"
                  : undefined
            }
          >
            {t(classLabel(c.type))} {c.confidence}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {infos.map((info) => (
          <Badge key={info.kind} variant="secondary">
            {info.kind === "cdn"
              ? "CDN"
              : info.kind === "torExit"
                ? t("Tor 出口")
                : info.value}
          </Badge>
        ))}
      </div>
    </div>
  );
}
function Messages({ row }: { row: Row }) {
  const { t, errorText } = useI18n();
  return (
    <>
      {row.errors.map((message, i) => (
        <Alert key={i} variant="destructive">
          <AlertDescription>{errorText(message)}</AlertDescription>
        </Alert>
      ))}
      {!row.sections && row.status === "done" && (
        <Alert>
          <AlertDescription>
            {t("舊紀錄只保存摘要，請重新查詢取得桌面版完整判定與欄位。")}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
function Facts({ items }: { items: [string, ReactNode, number?][] }) {
  const { t } = useI18n();
  return (
    <dl className="facts">
      {items.map(([label, value, confidence]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>
            {value == null || value === "" ? "—" : value}
            {confidence != null && (
              <span
                className="ml-2 text-xs"
                data-confidence={confidenceBand(confidence)}
              >
                {t("信心")} {confidence}
              </span>
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
function RadarBody({ data: d }: { data: LookupResult }) {
  const { t, locale } = useI18n();
  const detected = Object.entries(d.classifications ?? {})
    .filter(([, c]) => c.detected)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">{t("威脅分類")}</h4>
      {detected.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {Object.keys(d.classifications ?? {}).length} {t("組分類 ·")}{" "}
            {detected.length} {t("命中")}
          </p>
          {detected.map(([key, c]) => (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{t(classLabel(key))}</span>
              <Verdict code={c.verdict} />
              <span className="text-xs text-muted-foreground">
                {t("信心")} {c.confidence}
              </span>
              {!!c.malware_names?.length && (
                <p className="w-full break-words text-xs">
                  {t("惡意軟體：")}
                  {c.malware_names.join("、")}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {Object.keys(d.classifications ?? {}).length} {t("組分類 · 0 命中")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("信心值表示 Radar 對該項資料的確定程度，並非惡意分數。")}
      </p>
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("網路資訊")}</h4>
        <Facts
          items={[
            [
              "ASN",
              d.asn?.value != null ? `AS${d.asn.value}` : undefined,
              d.asn?.confidence,
            ],
            [t("業者"), d.as_name?.value, d.as_name?.confidence],
            [t("IP 範圍"), d.ip_range?.value, d.ip_range?.confidence],
          ]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("地理位置")}</h4>
        <Facts
          items={[
            [
              t("地區"),
              countryLabel(d.country?.value, locale),
              d.country?.confidence,
            ],
            [
              t("城市"),
              d.city?.value && d.city.value !== "N/A"
                ? `${d.city.value}${d.city_zh && d.city_zh !== d.city.value ? `（${d.city_zh}）` : ""}`
                : undefined,
              d.city?.confidence,
            ],
            [
              "GPS",
              d.location
                ? `${d.location.lat.toFixed(2)}, ${d.location.lon.toFixed(2)}`
                : undefined,
            ],
            [
              t("定位精度"),
              d.location?.accuracy_radius != null
                ? `±${d.location.accuracy_radius} km`
                : undefined,
            ],
          ]}
        />
      </section>
    </div>
  );
}
function AbuseBody({ data: a }: { data: AbuseSection }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <meter
        className="w-full"
        min={0}
        max={100}
        low={25}
        high={60}
        optimum={0}
        value={a.score}
        aria-label={t("AbuseIPDB 分數")}
      />
      <Facts
        items={[
          [t("地區"), countryLabel(a.countryCode, locale)],
          ["ISP", a.isp],
          [t("用途"), a.usageType],
          [t("Tor 出口"), a.isTor ? t("是") : t("否")],
          [t("舉報次數"), a.totalReports],
          [t("舉報人數"), a.numDistinctUsers],
          [t("最後舉報"), a.lastReportedAt?.slice(0, 10)],
        ]}
      />
      {a.recentComments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("最近舉報摘要（")}
            {a.recentComments.length}）
          </p>
          {a.recentComments.map((comment, i) => (
            <p key={i} className="whitespace-pre-wrap break-words text-xs">
              {comment}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
export function FullResult({ row }: { row: Row }) {
  const { t, locale } = useI18n();
  const r = resultOf(row);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("來源詳情")}</CardTitle>
        <CardDescription>
          {row.ip} ·{" "}
          {row.queriedAt
            ? new Date(row.queriedAt).toLocaleString(locale)
            : t("尚未完成")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Messages row={row} />
        {r.legacy && (
          <Facts
            items={[
              [
                t("Radar 判定"),
                row.verdict
                  ? t(verdictLabels[row.verdict] || row.verdict)
                  : undefined,
              ],
              [t("AbuseIPDB 分數"), row.score],
              [t("業者"), row.isp],
              ["ASN", row.asn],
              [t("地區"), countryLabel(row.country, locale)],
              [t("城市"), row.city],
            ]}
          />
        )}
        <div className="detail-sources">
          {[...(row.sections ?? [])]
            .sort(
              (a, b) =>
                Number(a.sourceId !== "abuseipdb") -
                Number(b.sourceId !== "abuseipdb"),
            )
            .map((s) => (
              <section
                key={s.sourceId}
                className="flex flex-col gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {s.sourceId === "ipradar" ? "IP Radar" : "AbuseIPDB"}
                  </h3>
                  {s.status === "ok" ? (
                    s.sourceId === "ipradar" && r.radar ? (
                      <Verdict
                        code={
                          r.radar.is_reserved
                            ? "reserved"
                            : r.radar.threat?.verdict || "none"
                        }
                        value={r.radar.threat?.confidence}
                      />
                    ) : r.abuse ? (
                      <Badge
                        variant="outline"
                        data-tone={abuseScoreBand(r.abuse.score)}
                      >
                        {r.abuse.score}/100
                      </Badge>
                    ) : null
                  ) : (
                    <Badge variant="destructive">
                      {s.status === "needs-key"
                        ? t("尚未設定 API Key")
                        : s.status === "warming"
                          ? t("預熱中")
                          : t("查詢失敗")}
                    </Badge>
                  )}
                </div>
                {s.status === "ok" &&
                  (s.sourceId === "ipradar" && r.radar ? (
                    <RadarBody data={r.radar} />
                  ) : r.abuse ? (
                    <AbuseBody data={r.abuse} />
                  ) : null)}
                {s.status === "error" && s.error?.retryAfter != null && (
                  <p className="text-xs text-muted-foreground">
                    {t("建議")} {s.error.retryAfter} {t("秒後重試")}
                  </p>
                )}
              </section>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
function ResultItem({ row }: { row: Row }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const r = resultOf(row);
  const score = r.abuse?.score ?? row.score;
  const country =
    countryLabel(r.country, locale) ||
    (row.radarCountry &&
    row.abuseCountry &&
    row.radarCountry !== row.abuseCountry
      ? t("地區分歧")
      : t("地區未知"));
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono">{row.ip}</span>
            {row.status === "done" && (
              <Badge
                variant="outline"
                data-tone={score == null ? undefined : abuseScoreBand(score)}
              >
                AbuseIPDB：{score == null ? "—" : `${score}/100`}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {[country, r.radar?.city?.value || row.city]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {row.status === "pending" ? (
              <Badge variant="secondary">{t("等待查詢…")}</Badge>
            ) : r.legacy ? (
              <Badge variant="outline">{t("舊版摘要")}</Badge>
            ) : (
              <Verdict code={r.code} value={r.value} />
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ClassificationBadges row={row} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {row.isp || t("業者未知")}
            {row.asn != null ? ` · AS${row.asn}` : ""}
          </span>
          {row.reports != null && (
            <span>
              {row.reports} {t("次舉報")}
              {r.abuse ? ` · ${r.abuse.numDistinctUsers} ${t("人")}` : ""}
            </span>
          )}
        </div>
        {(row.errors.length > 0 || r.legacy) && <Messages row={row} />}
        {row.status === "done" && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t("收起詳情") : t("查看詳情")}
            {expanded ? (
              <ChevronUp data-icon="inline-end" />
            ) : (
              <ChevronDown data-icon="inline-end" />
            )}
          </Button>
        )}
        {expanded && (
          <div id={detailId}>
            <FullResult row={row} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export function Results({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  if (!rows.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radar />
          </EmptyMedia>
          <EmptyTitle>{t("尚無結果")}</EmptyTitle>
          <EmptyDescription>
            {t("貼上 IP 清單開始查詢，或調整紀錄篩選條件。")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <ResultItem key={`${row.ip}-${row.queriedAt}-${i}`} row={row} />
      ))}
    </div>
  );
}
