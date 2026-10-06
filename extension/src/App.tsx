import {
  I18nContext,
  resolveLanguage,
  translate,
  translateError,
  useI18n,
} from "./i18n";
import { Results } from "./ResultView";
import { useEffect, useState, useRef } from "react";
import {
  Radar,
  Search,
  History,
  Settings2,
  Sun,
  Moon,
  ExternalLink,
  Download,
  Square,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  activeBatch,
  initialState,
  parseIps,
  validateSettings,
  validQueryLimit,
  MAX_QUERY_IPS,
  type Settings,
} from "./model";
import { send, subscribe, openTab, isExtension, beginLookup } from "./client";
import { downloadCsv } from "./csv";

function SettingsForm({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Partial<Settings>) => Promise<void>;
}) {
  const { t, errorText } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [limitInput, setLimitInput] = useState(String(settings.maxQueryIps));
  const limitInvalid = !validQueryLimit(Number(limitInput));
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    setDraft((s) => ({ ...s, theme: settings.theme }));
  }, [settings.theme]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((s) => ({ ...s, [key]: value }));
    const current = ++revision.current;
    setNotice(t("儲存中…"));
    void onSave({ [key]: value }).then(
      () => {
        if (revision.current === current) setNotice("");
      },
      (e) => {
        if (revision.current === current)
          setNotice(
            e instanceof Error ? e.message : t("儲存失敗，請重新輸入。"),
          );
      },
    );
  };
  let validation = "";
  try {
    validateSettings(draft);
  } catch (e) {
    validation = e instanceof Error ? e.message : t("請完成連線設定。");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("連線與偏好設定")}</CardTitle>
        <CardDescription>
          {t("API Key 只保存在這台瀏覽器，不會加入 CSV。")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="language">{t("語言")}</FieldLabel>
            <NativeSelect
              id="language"
              value={draft.language}
              onChange={(e) =>
                update("language", e.target.value as Settings["language"])
              }
            >
              <NativeSelectOption value="auto">
                {t("Auto（跟隨瀏覽器）")}
              </NativeSelectOption>
              <NativeSelectOption value="zh-Hant">繁體中文</NativeSelectOption>
              <NativeSelectOption value="zh-Hans">简体中文</NativeSelectOption>
              <NativeSelectOption value="en">English</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field data-invalid={limitInvalid}>
            <FieldLabel htmlFor="query-limit">{t("單次最大查詢數")}</FieldLabel>
            <Input
              id="query-limit"
              type="number"
              min={1}
              max={MAX_QUERY_IPS}
              step={1}
              value={limitInput}
              aria-invalid={limitInvalid}
              onChange={(e) => {
                setLimitInput(e.target.value);
                const value = Number(e.target.value);
                if (validQueryLimit(value)) update("maxQueryIps", value);
              }}
            />
            <FieldDescription>
              {t(
                "預設 100；可設定 1–1,000，以去重後的 IP 數量計算，不會增加 API 配額。",
              )}
            </FieldDescription>
            {limitInvalid && (
              <FieldError>
                {t("單次最大查詢數必須是 1–1,000 的整數。")}
              </FieldError>
            )}
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="radar-enabled">IP Radar Server</FieldLabel>
            <Switch
              id="radar-enabled"
              checked={draft.radarEnabled}
              onCheckedChange={(v) => update("radarEnabled", v)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="server">Server URL</FieldLabel>
            <Input
              id="server"
              value={draft.serverUrl}
              placeholder="http://127.0.0.1:8000"
              onChange={(e) => update("serverUrl", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="radar-key">Radar API Key</FieldLabel>
            <Input
              id="radar-key"
              type="password"
              autoComplete="off"
              value={draft.radarKey}
              onChange={(e) => update("radarKey", e.target.value)}
            />
            <FieldDescription>
              {t("使用 Server 的 Bearer Token；未啟用驗證時可留空。")}
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="abuse-enabled">AbuseIPDB</FieldLabel>
            <Switch
              id="abuse-enabled"
              checked={draft.abuseEnabled}
              onCheckedChange={(v) => update("abuseEnabled", v)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="abuse-key">AbuseIPDB API Key</FieldLabel>
            <Input
              id="abuse-key"
              type="password"
              autoComplete="off"
              value={draft.abuseKey}
              onChange={(e) => update("abuseKey", e.target.value)}
            />
            <FieldDescription>
              {t("每個 IP 消耗一次查詢，受你的 API 配額限制。")}
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="open-tab">
              {t("預設以瀏覽器分頁開啟")}
            </FieldLabel>
            <Switch
              id="open-tab"
              checked={draft.openInTab}
              onCheckedChange={(v) => update("openInTab", v)}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="dark">{t("深色模式")}</FieldLabel>
            <Switch
              id="dark"
              checked={draft.theme === "dark"}
              onCheckedChange={(v) => update("theme", v ? "dark" : "light")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      {(notice || validation) && (
        <CardFooter>
          <div className="flex w-full flex-col gap-3">
            {notice && (
              <p role="status" className="text-sm">
                {errorText(notice)}
              </p>
            )}
            {validation && (
              <FieldError>
                {errorText(validation)} {t("設定已保留，修正後即可查詢。")}
              </FieldError>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
export default function App() {
  const [state, setState] = useState(initialState);
  const locale = resolveLanguage(state.settings.language);
  const t = (text: string) => translate(text, locale);
  const errorText = (text: string) => translateError(text, locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `IP Radar · ${translate("批量查詢 IP", locale)}`;
  }, [locale]);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [view, setView] = useState(
    new URLSearchParams(location.search).get("view") || "query",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [paginate, setPaginate] = useState(true);
  const [page, setPage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const unsubscribe = subscribe(setState);
    send("get")
      .then((s) => {
        setState(s);
        setReady(true);
      })
      .catch((e) => setNotice(e.message));
    return unsubscribe;
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      state.settings.theme === "dark",
    );
  }, [state.settings.theme]);
  const parsed = parseIps(text);
  const active = activeBatch(state);
  const current = state.batches[0];
  const historyBatch = state.batches.find((b) => b.id === selected) || current;
  const filtered = (historyBatch?.rows || []).filter((r) =>
    `${r.ip} ${r.country || ""} ${r.city || ""} ${r.isp || ""}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages - 1);
  async function action(type: string, data = {}) {
    setBusy(true);
    setNotice("");
    try {
      setState(await send(type, data));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("操作失敗"));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setNotice("");
    try {
      setState(await beginLookup(text, state.settings));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("無法開始查詢"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <I18nContext.Provider value={locale}>
      <main className="app-shell">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <Radar className="size-6" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                IP Radar
              </h1>
              <p className="text-xs text-muted-foreground">
                NETWORK INTELLIGENCE
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("切換明暗模式")}
              disabled={!ready || busy}
              onClick={() => {
                const settings = {
                  ...state.settings,
                  theme:
                    state.settings.theme === "dark"
                      ? ("light" as const)
                      : ("dark" as const),
                };
                if (!isExtension) setState((s) => ({ ...s, settings }));
                else
                  void action("settings", { patch: { theme: settings.theme } });
              }}
            >
              {state.settings.theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("在分頁中開啟")}
              onClick={() => void openTab()}
            >
              <ExternalLink />
            </Button>
          </div>
        </header>
        {!isExtension && (
          <Alert>
            <AlertDescription>
              {t("介面預覽 · 載入 Chrome 擴充功能後即可查詢。")}
            </AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert variant="destructive">
            <AlertDescription>{errorText(notice)}</AlertDescription>
          </Alert>
        )}
        <Tabs value={view} onValueChange={(v) => setView(String(v))}>
          <TabsList className="w-full">
            <TabsTrigger value="query">
              <Search />
              {t("查詢")}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History />
              {t("紀錄")} {state.batches.length || ""}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 />
              {t("設定")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="query" className="flex flex-col gap-4 pt-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("批量查詢 IP")}</CardTitle>
                <CardDescription>
                  {t("IPv4 / IPv6 · 換行、逗號或空格分隔")} ·{" "}
                  {t("單次最大查詢數")}：{state.settings.maxQueryIps}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field data-invalid={parsed.invalid.length > 0}>
                    <FieldLabel htmlFor="ips" className="sr-only">
                      {t("IP 清單")}
                    </FieldLabel>
                    <Textarea
                      id="ips"
                      aria-invalid={parsed.invalid.length > 0}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={"1.1.1.1\n8.8.8.8\n2606:4700:4700::1111"}
                      className="min-h-28 max-h-48"
                    />
                    {parsed.invalid.length > 0 && (
                      <FieldError>
                        {t("無效項目：")}
                        {parsed.invalid.slice(0, 3).join("、")}
                      </FieldError>
                    )}
                    {parsed.ips.length > state.settings.maxQueryIps && (
                      <FieldError>
                        {t("超過單次查詢上限，請分批查詢。")}
                      </FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter>
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {parsed.ips.length} {t("個不重複 IP")}
                  </span>
                  {active ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void action("cancel")}
                    >
                      <Square data-icon="inline-start" />
                      {t("停止查詢")}
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        !ready ||
                        busy ||
                        !parsed.ips.length ||
                        !!parsed.invalid.length ||
                        parsed.ips.length > state.settings.maxQueryIps
                      }
                      onClick={() => void start()}
                    >
                      {t("開始查詢")}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{t("最新結果")}</h2>
                <Badge variant="outline">
                  {current?.rows.filter((r) => r.status === "done").length || 0}{" "}
                  / {current?.rows.length || 0}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={!current?.rows.length}
                onClick={() => downloadCsv(current.rows, locale)}
              >
                <Download data-icon="inline-start" />
                CSV
              </Button>
            </div>
            {active && (
              <p role="status" className="text-xs text-muted-foreground">
                {t("背景查詢中，關閉視窗後可從紀錄查看進度。")}
              </p>
            )}
            <Results rows={current?.rows || []} />
          </TabsContent>
          <TabsContent value="history" className="flex flex-col gap-4 pt-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="batch">{t("查詢批次")}</FieldLabel>
                <NativeSelect
                  id="batch"
                  value={historyBatch?.id || ""}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setPage(0);
                    setConfirmDelete(false);
                  }}
                >
                  <NativeSelectOption value="" disabled>
                    {t("尚無紀錄")}
                  </NativeSelectOption>
                  {state.batches.map((b) => (
                    <NativeSelectOption key={b.id} value={b.id}>
                      {new Date(b.createdAt).toLocaleString(locale)} ·{" "}
                      {b.rows.length} IP{b.cancelled ? t(" · 已停止") : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="filter" className="sr-only">
                  {t("篩選紀錄")}
                </FieldLabel>
                <Input
                  id="filter"
                  placeholder={t("搜尋 IP、地區或 ISP…")}
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="pagination">
                  {t("分頁顯示（每頁 10 筆）")}
                </FieldLabel>
                <Switch
                  id="pagination"
                  checked={paginate}
                  onCheckedChange={setPaginate}
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!filtered.length}
                onClick={() => downloadCsv(filtered, locale)}
              >
                <Download data-icon="inline-start" />
                {t("匯出篩選結果 (")}
                {filtered.length})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!state.batches.length}
                onClick={() =>
                  downloadCsv(
                    state.batches.flatMap((b) => b.rows),
                    locale,
                  )
                }
              >
                {t("匯出全部紀錄")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("刪除此批次")}
                disabled={
                  !historyBatch || busy || active?.id === historyBatch?.id
                }
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
            </div>
            {confirmDelete && (
              <Alert>
                <AlertDescription>
                  <div className="flex items-center justify-between gap-2">
                    {t("刪除此批次紀錄？")}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        void action("delete", { id: historyBatch?.id });
                        setConfirmDelete(false);
                      }}
                    >
                      {t("刪除")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t("取消")}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            <Results
              rows={
                paginate
                  ? filtered.slice(safePage * 10, safePage * 10 + 10)
                  : filtered
              }
            />
            {paginate && filtered.length > 0 && (
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  {t("上一頁")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {safePage + 1} / {pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage + 1 >= pages}
                  onClick={() => setPage(safePage + 1)}
                >
                  {t("下一頁")}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("保留最近 50 個批次。CSV 包含篩選後所有頁面，缺失資料留空。")}
            </p>
          </TabsContent>
          <TabsContent value="settings" className="pt-3">
            {ready && (
              <SettingsForm
                settings={state.settings}
                onSave={async (settings) => {
                  if (!isExtension)
                    setState((s) => ({
                      ...s,
                      settings: { ...s.settings, ...settings },
                    }));
                  else setState(await send("settings", { patch: settings }));
                }}
              />
            )}
          </TabsContent>
        </Tabs>
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>IP Radar + AbuseIPDB</span>
          <span>LOCAL HISTORY · CSV EXPORT</span>
        </footer>
      </main>
    </I18nContext.Provider>
  );
}
