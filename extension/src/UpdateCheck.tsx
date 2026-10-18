import { useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "./i18n";
import { isNewerVersion, stripTag } from "../../src/version";
import manifest from "../package.json";

const RELEASES_API =
  "https://api.github.com/repos/steponeerror/ip-radar-desktop/releases/latest";
const RELEASES_URL =
  "https://github.com/steponeerror/ip-radar-desktop/releases/latest";
// 通道资产前缀:Firefox 构建(VITE_CHANNEL=firefox)比对 Firefox zip,默认 Chrome
const ASSET_PREFIX =
  import.meta.env.VITE_CHANNEL === "firefox"
    ? "IP.Radar.Firefox_"
    : "IP.Radar.Chrome_";
export function UpdateCheck() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [latest, setLatest] = useState("");
  async function check() {
    setBusy(true);
    setMessage("");
    setLatest("");
    try {
      const response = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      if (
        typeof release.tag_name !== "string" ||
        !/^v?\d+(\.\d+)*$/i.test(release.tag_name) ||
        release.draft ||
        release.prerelease
      )
        throw new Error("Invalid release");
      if (isNewerVersion(release.tag_name, manifest.version)) {
        if (
          !Array.isArray(release.assets) ||
          !release.assets.some(
            (asset: { name?: string }) =>
              asset.name?.startsWith(ASSET_PREFIX) && asset.name.endsWith(".zip"),
          )
        ) {
          setMessage("新版本的擴充功能下載尚未就緒，請稍後再試。");
        } else setLatest(stripTag(release.tag_name));
      } else setMessage("目前已是最新版本。");
    } catch {
      setMessage("無法檢查更新，請稍後重試或前往 GitHub 發佈頁。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {t("目前版本")} · {manifest.version}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void check()}
        >
          <RefreshCw data-icon="inline-start" />
          {t(busy ? "檢查更新中…" : "檢查更新")}
        </Button>
      </div>
      {(message || latest) && (
        <p role="status" className="text-sm">
          {latest ? `${t("有新版本")} · ${latest}` : t(message)}
        </p>
      )}
      {(message || latest) && (
        <Button
          size="sm"
          variant={latest ? "default" : "outline"}
          className="self-start"
          nativeButton={false}
          render={
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <ExternalLink data-icon="inline-start" />
          {t("前往 GitHub 發佈頁")}
        </Button>
      )}
    </>
  );
}
