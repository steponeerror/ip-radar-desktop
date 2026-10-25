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
    const legacy = (await extensionApi().storage.local.get("radarState")).radarState as
      State | undefined;
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
  return (await extensionApi().storage.local.get(key))[key] as Batch | undefined;
}
export async function readActive() {
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
