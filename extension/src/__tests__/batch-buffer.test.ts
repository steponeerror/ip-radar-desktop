import { afterEach, expect, it, vi } from "vitest";
import { BatchBuffer } from "../batch-buffer";
import type { Batch } from "../model";
const initial = (): Batch => ({
  id: "batch",
  createdAt: "",
  rows: [{ ip: "1.1.1.1", queriedAt: "", status: "pending", errors: [] }],
});
afterEach(() => vi.useRealTimers());
it("coalesces a 217-result burst and flushes on the 200ms deadline", async () => {
  vi.useFakeTimers();
  const persist = vi.fn(async () => {});
  const buffer = new BatchBuffer(initial(), persist, vi.fn());
  for (let i = 0; i < 217; i++)
    buffer.update((b) => ({
      ...b,
      rows: [
        ...b.rows,
        { ip: `10.0.0.${i}`, queriedAt: "", errors: [], status: "done" },
      ],
    }));
  expect(persist).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(199);
  expect(persist).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(persist.mock.calls[0]).toEqual([buffer.batch]);
});
it("continues accepting results while a slow save runs and serializes a final newer snapshot", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const persist = vi
    .fn<(batch: Batch) => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  const buffer = new BatchBuffer(initial(), persist, vi.fn());
  buffer.update((b) => ({ ...b, rows: [{ ...b.rows[0], score: 10 }] }));
  await vi.advanceTimersByTimeAsync(200);
  buffer.update((b) => ({ ...b, rows: [{ ...b.rows[0], score: 58 }] }));
  expect(buffer.batch.rows[0].score).toBe(58);
  expect(persist.mock.calls[0][0].rows[0].score).toBe(10);
  const final = buffer.flush();
  finish();
  await final;
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist.mock.calls[1][0].rows[0].score).toBe(58);
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenCalledTimes(2);
});
it("stop keeps partial data, rejects late results and drains all writes before returning", async () => {
  vi.useFakeTimers();
  const persist = vi.fn(async () => {});
  const buffer = new BatchBuffer(initial(), persist, vi.fn());
  buffer.update((b) => ({
    ...b,
    rows: [
      {
        ...b.rows[0],
        sections: [
          { sourceId: "ipradar", status: "ok", data: { ip: "1.1.1.1" } },
        ],
      },
    ],
  }));
  buffer.stop();
  buffer.update((b) => ({ ...b, rows: [] }));
  await buffer.flush();
  expect(buffer.batch.cancelled).toBe(true);
  expect(buffer.batch.rows[0].sections).toHaveLength(1);
  expect(buffer.batch.rows[0].status).toBe("done");
  expect(buffer.batch.rows[0].errors).toContain("已停止，未完成查詢");
  await vi.advanceTimersByTimeAsync(1000);
  expect(persist).toHaveBeenCalledTimes(1);
});
it("does not forget unsaved results after a storage error", async () => {
  vi.useFakeTimers();
  const error = new Error("storage unavailable");
  const persist = vi
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(undefined);
  const onError = vi.fn();
  const buffer = new BatchBuffer(initial(), persist, onError);
  buffer.update((b) => ({ ...b, rows: [{ ...b.rows[0], score: 58 }] }));
  await vi.advanceTimersByTimeAsync(200);
  expect(onError).toHaveBeenCalledWith(error);
  await buffer.flush();
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist.mock.calls[1][0].rows[0].score).toBe(58);
});
