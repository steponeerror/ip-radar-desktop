import { extensionApi } from "./web-extension";
import { summarizeBatch } from "./progress";
import {
  normalizeState,
  type Batch,
  type BatchSummary,
  type Settings,
  type State,
} from "./model";

export const STORAGE = {
  settings: "radar.settings",
  limits: "radar.abuseLimits",
  index: "radar.batchIndex",
  batch: (id: string) => `radar.batch.${id}`,
};
export interface BatchIndex {
  ids: string[];
  summaries?: Record<string, BatchSummary>;
  activeId?: string;
  cleanupPending?: string[];
}
let initialized: Promise<void> | undefined;
export function initializeStorage(): Promise<void> {
  return (initialized ??= (async () => {
    const saved = await extensionApi().storage.local.get([
      STORAGE.settings,
      STORAGE.limits,
      STORAGE.index,
    ]);
    if (saved[STORAGE.index]) return;
    // Preserve connection settings and cooldowns only. Old history is deliberately not migrated.
    const legacy = (await extensionApi().storage.local.get("radarState"))
      .radarState as State | undefined;
    const normalized = normalizeState(legacy);
    await extensionApi().storage.local.set({
      [STORAGE.settings]: saved[STORAGE.settings] ?? normalized.settings,
      [STORAGE.limits]: saved[STORAGE.limits] ?? normalized.abuseLimits ?? {},
      [STORAGE.index]: { ids: [] },
    });
  })().catch((e) => {
    initialized = undefined;
    throw e;
  }));
}
export async function readMeta() {
  await initializeStorage();
  const data = await extensionApi().storage.local.get([
    STORAGE.settings,
    STORAGE.limits,
    STORAGE.index,
  ]);
  return {
    settings: normalizeState({
      settings: data[STORAGE.settings] as Settings,
      batches: [],
    }).settings,
    abuseLimits: (data[STORAGE.limits] ?? {}) as NonNullable<
      State["abuseLimits"]
    >,
    index: (data[STORAGE.index] ?? { ids: [] }) as BatchIndex,
  };
}
export async function readIndex(): Promise<BatchIndex> {
  return (
    ((await extensionApi().storage.local.get(STORAGE.index))[STORAGE.index] as
      BatchIndex | undefined) ?? { ids: [] }
  );
}
export async function readBatch(id: string): Promise<Batch | undefined> {
  const key = STORAGE.batch(id);
  return (await extensionApi().storage.local.get(key))[key] as
    Batch | undefined;
}
export async function readActive(recoverFinished = false) {
  const meta = await readMeta();
  const candidate = meta.index.activeId
    ? await readBatch(meta.index.activeId)
    : undefined;
  const batch =
    candidate &&
    !candidate.cancelled &&
    candidate.rows.some((r) => r.status === "pending")
      ? candidate
      : undefined;
  if (recoverFinished && meta.index.activeId && !batch) {
    // Recover a worker interrupted between its final data write and index cleanup.
    delete meta.index.activeId;
    await extensionApi().storage.local.set({ [STORAGE.index]: meta.index });
  }
  return { ...meta, batch };
}
/** Called under the background mutation lock, together with the batch write. */
export async function saveBatch(batch: Batch) {
  const index = await readIndex();
  index.summaries = { ...index.summaries, [batch.id]: summarizeBatch(batch) };
  await extensionApi().storage.local.set({
    [STORAGE.batch(batch.id)]: batch,
    [STORAGE.index]: index,
  });
}
export function indexSummaries(index: BatchIndex): BatchSummary[] {
  return index.ids.map((id) => {
    const summary = index.summaries?.[id] ?? { id, finished: true };
    // A stream can send final warnings after all rows become done.
    return id === index.activeId ? { ...summary, finished: false } : summary;
  });
}
/** Only the latest (query-page) batch is loaded by default. */
export async function readState(selectedId?: string): Promise<State> {
  const meta = await readMeta();
  const id = selectedId ?? meta.index.activeId ?? meta.index.ids[0];
  const batch =
    id && meta.index.ids.includes(id) ? await readBatch(id) : undefined;
  return {
    settings: meta.settings,
    abuseLimits: meta.abuseLimits,
    summaries: indexSummaries(meta.index),
    batches: batch ? [batch] : [],
  };
}

/** Retain only the query-page batch, never accumulate history from storage events. */
export function applyStorageChanges(
  state: State,
  changes: Record<string, chrome.storage.StorageChange>,
): State {
  const index = changes[STORAGE.index]?.newValue as BatchIndex | undefined;
  const id = index ? (index.activeId ?? index.ids[0]) : state.batches[0]?.id;
  let batch = state.batches.find((b) => b.id === id);
  if (id && STORAGE.batch(id) in changes)
    batch = changes[STORAGE.batch(id)].newValue as Batch | undefined;
  const batches =
    batch === state.batches[0] && state.batches.length <= 1
      ? state.batches
      : batch
        ? [batch]
        : [];
  return {
    settings:
      (changes[STORAGE.settings]?.newValue as Settings | undefined) ??
      state.settings,
    abuseLimits:
      (changes[STORAGE.limits]?.newValue as State["abuseLimits"]) ??
      state.abuseLimits,
    summaries: index ? indexSummaries(index) : state.summaries,
    batches,
  };
}

/** Caller holds the background mutation lock. Reads summaries, never full history. */
export async function cleanupHistory(now = Date.now()) {
  const { settings, index } = await readMeta();
  if (index.cleanupPending?.length) {
    await extensionApi().storage.local.remove(
      index.cleanupPending.map(STORAGE.batch),
    );
    delete index.cleanupPending;
    await extensionApi().storage.local.set({ [STORAGE.index]: index });
  }
  const expired = new Set<string>();
  let changed = false;
  for (const id of index.ids) {
    const summary = index.summaries?.[id];
    if (id === index.activeId || !summary?.finished) continue;
    // Older summaries lack a completion time: grant a full retention period
    // starting at the first cleanup, without reading/migrating their batch data.
    if (!Number.isFinite(Date.parse(summary.completedAt ?? ""))) {
      summary.completedAt = new Date(now).toISOString();
      changed = true;
    }
    if (
      settings.historyRetentionHours > 0 &&
      now - Date.parse(summary.completedAt!) >=
        settings.historyRetentionHours * 3600000
    )
      expired.add(id);
  }
  let remaining = index.ids.length - expired.size;
  for (const id of [...index.ids].reverse()) {
    if (remaining <= settings.historyMaxBatches) break;
    if (
      !expired.has(id) &&
      id !== index.activeId &&
      index.summaries?.[id]?.finished
    ) {
      expired.add(id);
      remaining--;
    }
  }
  if (expired.size) {
    index.ids = index.ids.filter((id) => !expired.has(id));
    for (const id of expired) delete index.summaries![id];
    index.cleanupPending = [...expired];
    changed = true;
  }
  if (changed)
    await extensionApi().storage.local.set({ [STORAGE.index]: index });
  if (index.cleanupPending?.length) {
    await extensionApi().storage.local.remove(
      index.cleanupPending.map(STORAGE.batch),
    );
    delete index.cleanupPending;
    await extensionApi().storage.local.set({ [STORAGE.index]: index });
  }
}
