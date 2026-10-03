import { useEffect, useState } from "react";
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
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  activeBatch,
  initialState,
  parseIps,
  serverOrigin,
  validateSettings,
  type Row,
  type Settings,
} from "./model";
import { send, subscribe, openTab, isExtension } from "./client";
import { downloadCsv } from "./csv";

function Results({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Radar />
          </EmptyMedia>
          <EmptyTitle>從一個 IP 開始</EmptyTitle>
          <EmptyDescription>
            貼上 IP 清單，整合地區與信譽資訊。
            <br />
            查詢結果會自動保存在紀錄中。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>IP / 地區</TableHead>
          <TableHead>AbuseIPDB</TableHead>
          <TableHead>情報</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.ip}-${i}`}>
            <TableCell>
              <div className="font-mono text-xs">{r.ip}</div>
              <div className="text-xs text-muted-foreground">
                {[r.country, r.city].filter(Boolean).join(" · ") || "地區未知"}
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  r.score != null && r.score >= 50 ? "destructive" : "secondary"
                }
              >
                {r.score == null ? "—" : `${r.score} / 100`}
              </Badge>
              {r.reports != null && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.reports} 次舉報
                </div>
              )}
            </TableCell>
            <TableCell>
              <div className="max-w-48 truncate text-xs" title={r.isp}>
                {r.status === "pending"
                  ? "等待查詢…"
                  : r.verdict || r.isp || "—"}
              </div>
              {(r.errors.length > 0 || r.asn != null || r.tor != null) && (
                <details className="max-w-48 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {r.errors.length ? "來源訊息" : "詳細資訊"}
                  </summary>
                  <div className="whitespace-normal break-words py-1">
                    {r.asn != null && <p>ASN {r.asn}</p>}
                    {r.tor != null && <p>Tor：{r.tor ? "是" : "否"}</p>}
                    {r.radarCountry &&
                      r.abuseCountry &&
                      r.radarCountry !== r.abuseCountry && (
                        <p>
                          地區不同：Radar {r.radarCountry} / AbuseIPDB{" "}
                          {r.abuseCountry}
                        </p>
                      )}
                    {r.errors.map((e) => (
                      <p key={e}>{e}</p>
                    ))}
                  </div>
                </details>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function SettingsForm({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft((s) => ({ ...s, theme: settings.theme }));
  }, [settings.theme]);
  const [notice, setNotice] = useState("");
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((s) => ({ ...s, [key]: value }));
    setNotice("");
  };
  async function save() {
    setSaving(true);
    setNotice("");
    try {
      validateSettings(draft);
      if (
        isExtension &&
        draft.radarEnabled &&
        !(await chrome.permissions.request({
          origins: [serverOrigin(draft.serverUrl)],
        }))
      )
        throw new Error("未授權 Server 存取，設定尚未儲存。");
      await onSave({
        ...draft,
        serverUrl: draft.serverUrl.trim(),
        radarKey: draft.radarKey.trim(),
        abuseKey: draft.abuseKey.trim(),
      });
      setNotice("設定已儲存");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>連線與偏好設定</CardTitle>
        <CardDescription>
          API Key 只保存在這台瀏覽器，不會加入 CSV。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
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
              使用 Server 的 Bearer Token；未啟用驗證時可留空。
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
              每個 IP 消耗一次查詢，受你的 API 配額限制。
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="open-tab">預設以瀏覽器分頁開啟</FieldLabel>
            <Switch
              id="open-tab"
              checked={draft.openInTab}
              onCheckedChange={(v) => update("openInTab", v)}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="dark">深色模式</FieldLabel>
            <Switch
              id="dark"
              checked={draft.theme === "dark"}
              onCheckedChange={(v) => update("theme", v ? "dark" : "light")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <div className="flex w-full flex-col gap-3">
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "儲存中…" : "儲存設定"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
export default function App() {
  const [state, setState] = useState(initialState);
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
      setNotice(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    try {
      if (
        isExtension &&
        state.settings.radarEnabled &&
        !(await chrome.permissions.request({
          origins: [serverOrigin(state.settings.serverUrl)],
        }))
      )
        throw new Error("需要 Server 存取權限才能查詢。");
      await action("start", { text });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "無法開始查詢");
    }
  }
  return (
    <main className="app-shell">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="brand-mark">
            <Radar className="size-6" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">IP Radar</h1>
            <p className="text-xs text-muted-foreground">
              NETWORK INTELLIGENCE
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="切換明暗模式"
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
              else void action("settings", { settings });
            }}
          >
            {state.settings.theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="在分頁中開啟"
            onClick={() => void openTab()}
          >
            <ExternalLink />
          </Button>
        </div>
      </header>
      {!isExtension && (
        <Alert>
          <AlertDescription>
            介面預覽 · 載入 Chrome 擴充功能後即可查詢。
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Tabs value={view} onValueChange={(v) => setView(String(v))}>
        <TabsList className="w-full">
          <TabsTrigger value="query">
            <Search />
            查詢
          </TabsTrigger>
          <TabsTrigger value="history">
            <History />
            紀錄 {state.batches.length || ""}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 />
            設定
          </TabsTrigger>
        </TabsList>
        <TabsContent value="query" className="flex flex-col gap-4 pt-3">
          <Card>
            <CardHeader>
              <CardTitle>批量查詢 IP</CardTitle>
              <CardDescription>
                IPv4 / IPv6 · 換行、逗號或空格分隔 · 最多 100 個
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={parsed.invalid.length > 0}>
                  <FieldLabel htmlFor="ips" className="sr-only">
                    IP 清單
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
                      無效項目：{parsed.invalid.slice(0, 3).join("、")}
                    </FieldError>
                  )}
                  {parsed.ips.length > 100 && (
                    <FieldError>超過 100 個，請分批查詢。</FieldError>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {parsed.ips.length} 個不重複 IP
                </span>
                {active ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action("cancel")}
                  >
                    <Square data-icon="inline-start" />
                    停止查詢
                  </Button>
                ) : (
                  <Button
                    disabled={
                      !ready ||
                      busy ||
                      !parsed.ips.length ||
                      !!parsed.invalid.length ||
                      parsed.ips.length > 100
                    }
                    onClick={() => void start()}
                  >
                    開始查詢
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">最新結果</h2>
              <Badge variant="outline">
                {current?.rows.filter((r) => r.status === "done").length || 0} /{" "}
                {current?.rows.length || 0}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!current?.rows.length}
              onClick={() => downloadCsv(current.rows)}
            >
              <Download data-icon="inline-start" />
              CSV
            </Button>
          </div>
          {active && (
            <p role="status" className="text-xs text-muted-foreground">
              背景查詢中，關閉視窗後可從紀錄查看進度。
            </p>
          )}
          <Results rows={current?.rows || []} />
        </TabsContent>
        <TabsContent value="history" className="flex flex-col gap-4 pt-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="batch">查詢批次</FieldLabel>
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
                  尚無紀錄
                </NativeSelectOption>
                {state.batches.map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {new Date(b.createdAt).toLocaleString("zh-TW")} ·{" "}
                    {b.rows.length} IP{b.cancelled ? " · 已停止" : ""}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter" className="sr-only">
                篩選紀錄
              </FieldLabel>
              <Input
                id="filter"
                placeholder="搜尋 IP、地區或 ISP…"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="pagination">
                分頁顯示（每頁 10 筆）
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
              onClick={() => downloadCsv(filtered)}
            >
              <Download data-icon="inline-start" />
              匯出篩選結果 ({filtered.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!state.batches.length}
              onClick={() => downloadCsv(state.batches.flatMap((b) => b.rows))}
            >
              匯出全部紀錄
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="刪除此批次"
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
                  刪除此批次紀錄？
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void action("delete", { id: historyBatch?.id });
                      setConfirmDelete(false);
                    }}
                  >
                    刪除
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
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
                上一頁
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
                下一頁
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            保留最近 50 個批次。CSV 包含篩選後所有頁面，缺失資料留空。
          </p>
        </TabsContent>
        <TabsContent value="settings" className="pt-3">
          {ready && (
            <SettingsForm
              settings={state.settings}
              onSave={async (settings) => {
                setState(await send("settings", { settings }));
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
  );
}
