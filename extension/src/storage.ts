import { normalizeState, type Batch, type Settings, type State } from "./model";

export const STORAGE = {
  settings: "radar.settings",
  limits: "radar.abuseLimits",
  index: "radar.batchIndex",
  batch: (id: string) => `radar.batch.${id}`,
};
export interface BatchIndex {
  ids: string[];
  activeId?: string;
}
let initialized: Promise<void> | undefined;
export function initializeStorage(): Promise<void> {
  return (initialized ??= (async () => {
    const saved = await chrome.storage.local.get([
      STORAGE.settings,
      STORAGE.limits,
      STORAGE.index,
    ]);
    if (saved[STORAGE.index]) return;
    // Preserve connection settings and cooldowns only. Old history is deliberately not migrated.
    const legacy = (await chrome.storage.local.get("radarState")).radarState as
      State | undefined;
    const normalized = normalizeState(legacy);
    await chrome.storage.local.set({
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
  const data = await chrome.storage.local.get([
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
    ((await chrome.storage.local.get(STORAGE.index))[STORAGE.index] as
      BatchIndex | undefined) ?? { ids: [] }
  );
}
export async function readBatch(id: string): Promise<Batch | undefined> {
  const key = STORAGE.batch(id);
  return (await chrome.storage.local.get(key))[key] as Batch | undefined;
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
/** Full history is assembled only for an explicit UI snapshot, never for each result. */
export async function readState(): Promise<State> {
  const meta = await readMeta();
  const data = meta.index.ids.length
    ? await chrome.storage.local.get(meta.index.ids.map(STORAGE.batch))
    : {};
  return {
    settings: meta.settings,
    abuseLimits: meta.abuseLimits,
    batches: meta.index.ids
      .map((id) => data[STORAGE.batch(id)] as Batch | undefined)
      .filter((b): b is Batch => !!b),
  };
}

/** Apply per-key storage events locally; no full-history reread on each update. */
export function applyStorageChanges(
  state: State,
  changes: Record<string, chrome.storage.StorageChange>,
): State {
  let batches = state.batches;
  const changedBatches = Object.entries(changes).filter(([key]) =>
    key.startsWith("radar.batch."),
  );
  if (changedBatches.length || changes[STORAGE.index]) {
    const byId = new Map(batches.map((b) => [b.id, b]));
    for (const [key, change] of changedBatches) {
      const id = key.slice("radar.batch.".length);
      if (change.newValue) byId.set(id, change.newValue as Batch);
      else byId.delete(id);
    }
    const ids = (changes[STORAGE.index]?.newValue as BatchIndex | undefined)
      ?.ids ?? [...byId.keys()];
    batches = ids.map((id) => byId.get(id)).filter((b): b is Batch => !!b);
  }
  return {
    settings:
      (changes[STORAGE.settings]?.newValue as Settings | undefined) ??
      state.settings,
    abuseLimits:
      (changes[STORAGE.limits]?.newValue as State["abuseLimits"]) ??
      state.abuseLimits,
    batches,
  };
}
