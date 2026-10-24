import { abuseKeyId } from "./abuse-limits";
import {
  STORAGE,
  readMeta,
  readIndex,
  readBatch,
  readActive,
  readState as read,
} from "./storage";
import { batchFinished } from "./result-controls";
import {
  validateQuery,
  validQueryLimit,
  validateSettings,
  type Settings,
} from "./model";
import { queryBatch, mergeSection } from "./api";
let serial: Promise<unknown> = Promise.resolve();
let running = false;
let controller: AbortController | undefined;
function mutate<T>(fn: () => T | Promise<T>): Promise<T> {
  const task = serial.then(fn);
  serial = task.catch(() => {});
  return task;
}
async function pump() {
  if (running) return;
  running = true;
  try {
    while (true) {
      await serial;
      const state = await readActive();
      const batch = state.batch;
      if (!batch) {
        await chrome.alarms.clear("resume");
        break;
      }
      controller = new AbortController();
      const sourceIds =
        batch.sourceIds ??
        [
          state.settings.radarEnabled ? "ipradar" : "",
          state.settings.abuseEnabled ? "abuseipdb" : "",
        ].filter(Boolean);
      const settings = {
        ...state.settings,
        radarEnabled: sourceIds.includes("ipradar"),
        abuseEnabled: sourceIds.includes("abuseipdb"),
      };
      const keyId = await abuseKeyId(settings.abuseKey);
      await queryBatch(
        batch.rows,
        settings,
        controller.signal,
        async (ip, section) => {
          await mutate(async () => {
            const target = await readBatch(batch.id);
            if (!target || target.cancelled) return;
            target.sourceIds = sourceIds;
            target.rows = target.rows.map((r) =>
              r.ip === ip ? mergeSection(r, section, sourceIds) : r,
            );
            await chrome.storage.local.set({
              [STORAGE.batch(batch.id)]: target,
            });
          });
        },
        {
          state: state.abuseLimits?.[keyId],
          save: async (limits) => {
            await mutate(async () => {
              const saved =
                (await chrome.storage.local.get(STORAGE.limits))[
                  STORAGE.limits
                ] ?? {};
              await chrome.storage.local.set({
                [STORAGE.limits]: { ...saved, [keyId]: limits },
              });
            });
          },
        },
      );
      await mutate(async () => {
        const index = await readIndex();
        if (index.activeId === batch.id) {
          delete index.activeId;
          await chrome.storage.local.set({ [STORAGE.index]: index });
        }
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
  patch?: Partial<Settings>;
  id?: string;
  ids?: string[];
}) {
  if (message.type === "get") return read();
  if (message.type === "settings") {
    await mutate(async () => {
      const state = await readMeta();
      const patch = { ...(message.patch ?? message.settings ?? {}) };
      for (const key of ["serverUrl", "radarKey", "abuseKey"] as const) {
        if (patch[key] != null) patch[key] = patch[key].trim();
      }
      if ("maxQueryIps" in patch && !validQueryLimit(patch.maxQueryIps))
        throw new Error("單次最大查詢數必須是正整數。");
      await chrome.storage.local.set({
        [STORAGE.settings]: { ...state.settings, ...patch },
      });
      if (patch.openInTab != null)
        await chrome.action.setPopup({
          popup: patch.openInTab ? "" : "index.html?mode=popup",
        });
    });
  } else if (message.type === "start") {
    await mutate(async () => {
      const state = await readActive();
      if (state.batch) throw new Error("已有批次正在查詢，請等待完成或停止。");
      validateSettings(state.settings);
      if (!state.settings.radarEnabled && !state.settings.abuseKey)
        throw new Error("請先設定 AbuseIPDB API Key。");
      const ips = validateQuery(message.text || "", state.settings.maxQueryIps);
      const batch = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        sourceIds: [
          state.settings.radarEnabled ? "ipradar" : "",
          state.settings.abuseEnabled ? "abuseipdb" : "",
        ].filter(Boolean),
        rows: ips.map((ip) => ({
          ip,
          queriedAt: "",
          status: "pending" as const,
          errors: [],
        })),
      };
      const ids = [batch.id, ...state.index.ids].slice(0, 50);
      await chrome.storage.local.set({
        [STORAGE.batch(batch.id)]: batch,
        [STORAGE.index]: { ids, activeId: batch.id },
      });
      const removed = state.index.ids.filter((id) => !ids.includes(id));
      if (removed.length)
        await chrome.storage.local.remove(removed.map(STORAGE.batch));
    });
    await chrome.alarms.create("resume", { periodInMinutes: 1 });
    void pump().catch(console.error);
  } else if (message.type === "cancel") {
    await mutate(async () => {
      const state = await readActive();
      const batch = state.batch;
      if (batch) {
        batch.cancelled = true;
        batch.rows.forEach((r) => {
          if (r.status === "pending") {
            r.status = "done";
            r.errors.push("已停止，未完成查詢");
          }
        });
        delete state.index.activeId;
        await chrome.storage.local.set({
          [STORAGE.batch(batch.id)]: batch,
          [STORAGE.index]: state.index,
        });
      }
    });
    controller?.abort();
  } else if (message.type === "delete") {
    await mutate(async () => {
      const index = await readIndex();
      const ids = message.ids ?? (message.id ? [message.id] : []);
      const batches = await Promise.all(ids.map(readBatch));
      if (batches.some((b) => b && !batchFinished(b)))
        throw new Error("請先停止查詢再刪除。");
      index.ids = index.ids.filter((id) => !ids.includes(id));
      if (index.activeId && ids.includes(index.activeId)) delete index.activeId;
      await chrome.storage.local.set({ [STORAGE.index]: index });
      if (ids.length) await chrome.storage.local.remove(ids.map(STORAGE.batch));
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
  const state = await readActive();
  await chrome.action.setPopup({
    popup: state.settings.openInTab ? "" : "index.html?mode=popup",
  });
  if (state.batch) {
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
