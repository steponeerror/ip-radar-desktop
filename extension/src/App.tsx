import {
  I18nContext,
  resolveLanguage,
  translate,
  translateError,
  useI18n,
} from "./i18n";
import { clipboardIpList, queryInputKey } from "./query-input";
import { ResultPanel, QueryExport } from "./ResultPanel";
import { downloadCsv } from "./csv";
import { Download } from "lucide-react";
import { UpdateCheck } from "./UpdateCheck";
import { HistoryView } from "./HistoryView";
import { batchFinished } from "./result-controls";
import { useEffect, useState, useRef } from "react";
import {
  Radar,
  Search,
  History,
  Settings2,
  Sun,
  Moon,
  ExternalLink,
  Square,
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
import { ChoiceSelect, ChoiceOption } from "@/components/ui/choice-select";
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
  type Settings,
} from "./model";
import { send, subscribe, openTab, isExtension, beginLookup } from "./client";

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
            <ChoiceSelect
              id="language"
              value={draft.language}
              onValueChange={(value) =>
                update("language", value as Settings["language"])
              }
            >
              <ChoiceOption value="auto">
                {t("Auto（跟隨瀏覽器）")}
              </ChoiceOption>
              <ChoiceOption value="zh-Hant">繁體中文</ChoiceOption>
              <ChoiceOption value="zh-Hans">简体中文</ChoiceOption>
              <ChoiceOption value="en">English</ChoiceOption>
            </ChoiceSelect>
          </Field>
          <Field data-invalid={limitInvalid}>
            <FieldLabel htmlFor="query-limit">{t("單次最大查詢數")}</FieldLabel>
            <Input
              type="text"
              inputMode="numeric"
              id="query-limit"

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
            <span
              id="radar-enabled-label"
              className="flex-1 text-sm font-medium"
            >
              IP Radar Server
            </span>
            <Switch
              id="radar-enabled"
              aria-labelledby="radar-enabled-label"
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
            <span
              id="abuse-enabled-label"
              className="flex-1 text-sm font-medium"
            >
              AbuseIPDB
            </span>
            <Switch
              id="abuse-enabled"
              aria-labelledby="abuse-enabled-label"
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
            <span id="open-tab-label" className="flex-1 text-sm font-medium">
              {t("預設以瀏覽器分頁開啟")}
            </span>
            <Switch
              id="open-tab"
              aria-labelledby="open-tab-label"
              checked={draft.openInTab}
              onCheckedChange={(v) => update("openInTab", v)}
            />
          </Field>
          <Field orientation="horizontal">
            <span id="dark-label" className="flex-1 text-sm font-medium">
              {t("深色模式")}
            </span>
            <Switch
              id="dark"
              aria-labelledby="dark-label"
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
  const inputEdited = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState(
    new URLSearchParams(location.search).get("view") || "query",
  );
  const [managingBatches, setManagingBatches] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
  const completed = state.batches.filter(batchFinished);
  const canStart =
    ready &&
    !busy &&
    !active &&
    parsed.ips.length > 0 &&
    !parsed.invalid.length &&
    parsed.ips.length <= state.settings.maxQueryIps;
  useEffect(() => {
    if (!isExtension || !ready || view !== "query" || active) return;
    let cancelled = false;
    let reading = false;
    let attempted = false;
    const readClipboard = async () => {
      if (
        cancelled ||
        reading ||
        attempted ||
        inputEdited.current ||
        !document.hasFocus()
      )
        return;
      reading = true;
      try {
        const value = clipboardIpList(await navigator.clipboard.readText());
        attempted = true;
        if (!cancelled && !inputEdited.current && value)
          setText((current) => current || value);
      } catch {
        // Clipboard may be unavailable or denied; manual input remains usable.
      } finally {
        reading = false;
      }
    };
    void readClipboard();
    window.addEventListener("focus", readClipboard);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", readClipboard);
    };
  }, [ready, view, !!active]);
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
    if (!canStart) return;
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
        {managingBatches ? (
          <HistoryView
            management
            batches={state.batches}
            onDone={() => setManagingBatches(false)}
            onDelete={async (ids) => setState(await send("delete", { ids }))}
          />
        ) : (
          <Tabs value={view} onValueChange={(v) => setView(String(v))}>
            <TabsList className="w-full">
              <TabsTrigger value="query">
                <Search />
                {t("查詢")}
              </TabsTrigger>
              <TabsTrigger value="history">
                <History />
                {t("紀錄")} {completed.length || ""}
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
                        ref={textareaRef}
                        aria-describedby="ips-shortcuts"
                        aria-invalid={parsed.invalid.length > 0}
                        value={text}
                        onChange={(e) => {
                          inputEdited.current = true;
                          setText(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          const key = queryInputKey(e.nativeEvent);
                          if (!key) return;
                          e.preventDefault();
                          if (key === "submit") {
                            if (!e.repeat) void start();
                            return;
                          }
                          inputEdited.current = true;
                          const input = e.currentTarget;
                          const from = input.selectionStart;
                          const to = input.selectionEnd;
                          setText(
                            input.value.slice(0, from) +
                              "\n" +
                              input.value.slice(to),
                          );
                          requestAnimationFrame(() =>
                            textareaRef.current?.setSelectionRange(
                              from + 1,
                              from + 1,
                            ),
                          );
                        }}
                        placeholder={"1.1.1.1\n8.8.8.8\n2606:4700:4700::1111"}
                        className="min-h-28 max-h-48"
                      />
                      <FieldDescription id="ips-shortcuts">
                        {t("Enter 開始查詢 · Alt+Space 換行")}
                      </FieldDescription>
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
                      <Button disabled={!canStart} onClick={() => void start()}>
                        {t("開始查詢")}
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2
                    id="latest-results"
                    className="scroll-mt-3 text-sm font-medium"
                  >
                    {t("最新結果")}
                  </h2>
                  <Badge variant="outline">
                    {current?.rows.filter((r) => r.status === "done").length ||
                      0}{" "}
                    / {current?.rows.length || 0}
                  </Badge>
                </div>
                <QueryExport batch={current} />
              </div>
              {active && (
                <p role="status" className="text-xs text-muted-foreground">
                  {t("背景查詢中，重新開啟查詢頁可查看進度。")}
                </p>
              )}
              <ResultPanel
                key={current?.id || "empty"}
                batch={current}
                scrollTargetId="latest-results"
              />
            </TabsContent>
            <TabsContent value="history" className="flex flex-col gap-4 pt-3">
              <HistoryView
                batches={state.batches}
                onDelete={async (ids) =>
                  setState(await send("delete", { ids }))
                }
              />
            </TabsContent>
            <TabsContent value="settings" className="flex flex-col gap-4 pt-3">
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
              <Card>
                <CardHeader>
                  <CardTitle>{t("紀錄管理與更新")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      disabled={!completed.length}
                      onClick={() => setManagingBatches(true)}
                    >
                      {t("管理批次")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!completed.length}
                      onClick={() =>
                        downloadCsv(
                          completed.flatMap((batch) => batch.rows),
                          locale,
                        )
                      }
                    >
                      <Download data-icon="inline-start" />
                      {t("匯出全部紀錄")}
                    </Button>
                  </div>
                  <UpdateCheck />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </I18nContext.Provider>
  );
}
