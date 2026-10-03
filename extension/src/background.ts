import {
  activeBatch,
  initialState,
  parseIps,
  validateSettings,
  type State,
  type Settings,
} from "./model";
import { lookup } from "./api";
const KEY = "radarState";
let serial: Promise<unknown> = Promise.resolve();
let running = false;
let controller: AbortController | undefined;
async function read(): Promise<State> {
  return (
    ((await chrome.storage.local.get(KEY))[KEY] as State) || initialState()
  );
}
function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  const task = serial.then(async () => {
    const state = await read();
    const result = await fn(state);
    await chrome.storage.local.set({ [KEY]: state });
    return result;
  });
  serial = task.catch(() => {});
  return task;
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (true) {
      await serial;
      const state = await read();
      const batch = activeBatch(state);
      if (!batch) {
        await chrome.alarms.clear("resume");
        break;
      }
      const pending = batch.rows.find((r) => r.status === "pending")!;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 20_000);
      let row;
      try {
        row = await lookup(pending.ip, state.settings, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      await mutate((current) => {
        const target = current.batches.find((b) => b.id === batch.id);
        if (target && !target.cancelled)
          target.rows = target.rows.map((r) => (r.ip === row.ip ? row : r));
      });
    }
  } finally {
    running = false;
    controller = undefined;
  }
}
async function command(message: {
  type: string;
  text?: string;
  settings?: Settings;
  id?: string;
}) {
  if (message.type === "get") return read();
  if (message.type === "settings") {
    const s = message.settings!;
    validateSettings(s);
    await mutate((state) => {
      state.settings = s;
    });
    await chrome.action.setPopup({
      popup: s.openInTab ? "" : "index.html?mode=popup",
    });
  } else if (message.type === "start") {
    await mutate((state) => {
      if (activeBatch(state))
        throw new Error("已有批次正在查詢，請等待完成或停止。");
      validateSettings(state.settings);
      if (!state.settings.radarEnabled && !state.settings.abuseKey)
        throw new Error("請先設定 AbuseIPDB API Key。");
      const { ips, invalid } = parseIps(message.text || "");
      if (!ips.length || invalid.length || ips.length > 100)
        throw new Error("請輸入 1–100 個有效 IP，並修正無效項目。");
      state.batches.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        rows: ips.map((ip) => ({
          ip,
          queriedAt: "",
          status: "pending",
          errors: [],
        })),
      });
      state.batches = state.batches.slice(0, 50);
    });
    await chrome.alarms.create("resume", { periodInMinutes: 1 });
    void pump().catch(console.error);
  } else if (message.type === "cancel") {
    await mutate((state) => {
      const batch = activeBatch(state);
      if (batch) {
        batch.cancelled = true;
        batch.rows.forEach((r) => {
          if (r.status === "pending") {
            r.status = "done";
            r.errors = ["已停止，未完成查詢"];
          }
        });
      }
    });
    controller?.abort();
  } else if (message.type === "delete") {
    await mutate((state) => {
      if (activeBatch(state)?.id === message.id)
        throw new Error("請先停止查詢再刪除。");
      state.batches = state.batches.filter((b) => b.id !== message.id);
    });
  } else throw new Error("未知操作");
  return read();
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL("index.html"))
  )
    return;
  command(message).then(
    (state) => reply({ state }),
    (e) => reply({ error: e instanceof Error ? e.message : "操作失敗" }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "resume") void pump().catch(console.error);
});
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("index.html?mode=tab"),
  });
});
async function initialize() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const state = await read();
  await chrome.action.setPopup({
    popup: state.settings.openInTab ? "" : "index.html?mode=popup",
  });
  if (activeBatch(state)) {
    await chrome.alarms.create("resume", { periodInMinutes: 1 });
    void pump().catch(console.error);
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});
chrome.runtime.onStartup.addListener(() => {
  void initialize();
});
