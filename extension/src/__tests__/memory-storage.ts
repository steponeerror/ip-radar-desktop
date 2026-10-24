import { vi } from "vitest";
import { STORAGE, type BatchIndex } from "../storage";
import { activeBatch, normalizeState, type State } from "../model";
export function memoryStorage(
  seed: State,
  onChange: (state: State) => void = () => {},
) {
  const data: Record<string, any> = {};
  const restore = (state: State) => {
    data[STORAGE.settings] = structuredClone(state.settings);
    data[STORAGE.limits] = structuredClone(state.abuseLimits ?? {});
    data[STORAGE.index] = {
      ids: state.batches.map((b) => b.id),
      activeId: activeBatch(state)?.id,
    };
    for (const b of state.batches)
      data[STORAGE.batch(b.id)] = structuredClone(b);
  };
  restore(seed);
  const snapshot = () =>
    normalizeState({
      settings: data[STORAGE.settings],
      abuseLimits: data[STORAGE.limits],
      batches:
        (data[STORAGE.index] as BatchIndex | undefined)?.ids
          .map((id) => data[STORAGE.batch(id)])
          .filter(Boolean) ?? [],
    });
  return {
    data,
    restore,
    snapshot,
    local: {
      get: vi.fn(async (keys: string | string[]) =>
        Object.fromEntries(
          (typeof keys === "string" ? [keys] : keys)
            .filter((key) => key in data)
            .map((key) => [key, structuredClone(data[key])]),
        ),
      ),
      set: vi.fn(async (values: Record<string, any>) => {
        Object.assign(data, structuredClone(values));
        onChange(snapshot());
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of typeof keys === "string" ? [keys] : keys)
          delete data[key];
        onChange(snapshot());
      }),
      setAccessLevel: vi.fn(),
    },
  };
}
