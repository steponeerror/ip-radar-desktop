import { extensionApi } from "./web-extension";
import { summarizeBatch } from "./progress";
import { BatchBuffer } from "./batch-buffer";
import { abuseKeyId } from "./abuse-limits";
import {
  STORAGE,
  saveBatch,
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
let currentRun:
  { buffer: BatchBuffer; controller: AbortController } | undefined;
function mutate<T>(fn: () => T | Promise<T>): Promise<T> {
  const task = serial.then(fn);
  serial = task.catch(() => {});
  return task;
}
async function pump() {
  if (running) return;
  running = true;
  try {
    // Preserve dirty memory after a storage failure; retry it before resuming saved work.
    if (currentRun) {
      await currentRun.buffer.flush();
      currentRun = undefined;
    }
    while (true) {
      const prepared = await mutate(async () => {
        const state = await readActive();
        if (!state.batch) return;
        const controller = new AbortController();
        const buffer = new BatchBuffer(
          state.batch,
          (snapshot) => mutate(() => saveBatch(snapshot)),
          (error) => controller.abort(error),
        );
        currentRun = { buffer, controller };
        return { state, run: currentRun };
      });
      if (!prepared) {
        await extensionApi().alarms.clear("resume");
        break;
      }
      const { state, run } = prepared;
      const { buffer, controller } = run;
      const batch = buffer.batch;
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
      try {
        await queryBatch(
          batch.rows,
          settings,
          controller.signal,
          async (ip, section) => {
            if (controller.signal.aborted) return;
            buffer.update((target) => ({
              ...target,
              sourceIds,
              rows: target.rows.map((r) =>
                r.ip === ip ? mergeSection(r, section, sourceIds) : r,
              ),
            }));
          },
          {
            state: state.abuseLimits?.[keyId],
            save: async (limits) => {
              await mutate(async () => {
                const saved =
                  (await extensionApi().storage.local.get(STORAGE.limits))[
                    STORAGE.limits
                  ] ?? {};
                await extensionApi().storage.local.set({
                  [STORAGE.limits]: { ...saved, [keyId]: limits },
                });
              });
            },
          },
        );
      } finally {
        // Completion/cancellation never reports success before the latest results are durable.
        await buffer.flush();
      }
      await mutate(async () => {
        const index = await readIndex();
        if (index.activeId === batch.id && batchFinished(buffer.batch)) {
          delete index.activeId;
          await extensionApi().storage.local.set({ [STORAGE.index]: index });
        }
        if (currentRun === run) currentRun = undefined;
      });
    }
  } finally {
    running = false;
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
  if (
    message.type === "get" ||
    message.type === "snapshot" ||
    message.type === "batch"
  ) {
    const run = currentRun;
    if (run && (!message.id || message.id === run.buffer.batch.id))
      await run.buffer.flush();
    if (message.type === "batch" && message.id) {
      // Build missing summaries only when this batch is explicitly opened.
      await mutate(async () => {
        const index = await readIndex();
        if (!index.ids.includes(message.id!) || index.summaries?.[message.id!])
          return;
        const batch = await readBatch(message.id!);
        if (batch) {
          index.summaries = {
            ...index.summaries,
            [batch.id]: summarizeBatch(batch),
          };
          await extensionApi().storage.local.set({ [STORAGE.index]: index });
        }
      });
    }
    return read(message.id);
  }
  if (message.type === "settings") {
    await mutate(async () => {
      const state = await readMeta();
      const patch = { ...(message.patch ?? message.settings ?? {}) };
      for (const key of ["serverUrl", "radarKey", "abuseKey"] as const) {
        if (patch[key] != null) patch[key] = patch[key].trim();
      }
      if ("maxQueryIps" in patch && !validQueryLimit(patch.maxQueryIps))
        throw new Error("單次最大查詢數必須是正整數。");
      await extensionApi().storage.local.set({
        [STORAGE.settings]: { ...state.settings, ...patch },
      });
      if (patch.openInTab != null)
        await extensionApi().action.setPopup({
          popup: patch.openInTab ? "" : "index.html?mode=popup",
        });
    });
  } else if (message.type === "start") {
    await mutate(async () => {
      const state = await readActive();
      if (state.batch || currentRun)
        throw new Error("已有批次正在查詢，請等待完成或停止。");
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
      await extensionApi().storage.local.set({
        [STORAGE.batch(batch.id)]: batch,
        [STORAGE.index]: {
          ids,
          activeId: batch.id,
          summaries: {
            ...Object.fromEntries(
              Object.entries(state.index.summaries ?? {}).filter(([id]) =>
                ids.includes(id),
              ),
            ),
            [batch.id]: summarizeBatch(batch),
          },
        },
      });
      const removed = state.index.ids.filter((id) => !ids.includes(id));
      if (removed.length)
        await extensionApi().storage.local.remove(removed.map(STORAGE.batch));
    });
    await extensionApi().alarms.create("resume", { periodInMinutes: 1 });
    void pump().catch(console.error);
  } else if (message.type === "cancel") {
    // Select/stop the in-memory run under the same lock used to start it.
    const run = await mutate(async () => {
      if (currentRun) {
        currentRun.buffer.stop();
        currentRun.controller.abort();
        return currentRun;
      }
      const state = await readActive();
      const batch = state.batch;
      if (batch) {
        batch.cancelled = true;
        batch.rows = batch.rows.map((r) =>
          r.status === "pending"
            ? {
                ...r,
                status: "done",
                errors: [...r.errors, "已停止，未完成查詢"],
              }
            : r,
        );
        state.index.summaries = {
          ...state.index.summaries,
          [batch.id]: summarizeBatch(batch),
        };
        delete state.index.activeId;
        await extensionApi().storage.local.set({
          [STORAGE.batch(batch.id)]: batch,
          [STORAGE.index]: state.index,
        });
      }
    });
    if (run) {
      await run.buffer.flush();
      await mutate(async () => {
        const index = await readIndex();
        if (index.activeId === run.buffer.batch.id) {
          delete index.activeId;
          await extensionApi().storage.local.set({ [STORAGE.index]: index });
        }
      });
    }
  } else if (message.type === "delete") {
    const run = currentRun;
    if (run && (message.ids ?? [message.id]).includes(run.buffer.batch.id)) {
      if (!run.buffer.batch.cancelled) throw new Error("請先停止查詢再刪除。");
      await run.buffer.flush();
    }
    await mutate(async () => {
      const index = await readIndex();
      const ids = message.ids ?? (message.id ? [message.id] : []);
      for (const id of ids) {
        if (!index.ids.includes(id)) continue;
        const summary = index.summaries?.[id];
        const finished = summary
          ? summary.finished
          : batchFinished(await readBatch(id));
        if (!finished) throw new Error("請先停止查詢再刪除。");
      }
      for (const id of ids) if (index.summaries) delete index.summaries[id];
      index.ids = index.ids.filter((id) => !ids.includes(id));
      if (index.activeId && ids.includes(index.activeId)) delete index.activeId;
      await extensionApi().storage.local.set({ [STORAGE.index]: index });
      if (ids.length) await extensionApi().storage.local.remove(ids.map(STORAGE.batch));
    });
  } else throw new Error("未知操作");
  return read();
}
extensionApi().runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== extensionApi().runtime.id ||
    !sender.url?.startsWith(extensionApi().runtime.getURL("index.html"))
  )
    return;
  command(message).then(
    (state) => reply({ state }),
    (e) => reply({ error: e instanceof Error ? e.message : "操作失敗" }),
  );
  return true;
});
extensionApi().alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "resume") void pump().catch(console.error);
});
extensionApi().action.onClicked.addListener(() => {
  void extensionApi().tabs.create({
    url: extensionApi().runtime.getURL("index.html?mode=tab"),
  });
});
async function initialize() {
  // Firefox has no setAccessLevel; this extension does not use content scripts.
  if (extensionApi().storage.local.setAccessLevel)
    await extensionApi().storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  const state = await readActive();
  await extensionApi().action.setPopup({
    popup: state.settings.openInTab ? "" : "index.html?mode=popup",
  });
  if (state.batch) {
    await extensionApi().alarms.create("resume", { periodInMinutes: 1 });
    void pump().catch(console.error);
  }
}
extensionApi().runtime.onInstalled.addListener(() => {
  void initialize();
});
extensionApi().runtime.onStartup.addListener(() => {
  void initialize();
});
