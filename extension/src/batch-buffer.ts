import type { Batch } from "./model";

export const BATCH_SAVE_INTERVAL_MS = 200;
/** Coalesces result writes without making the stream wait for storage. */
export class BatchBuffer {
  private version = 0;
  private savedVersion = 0;
  private tail: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    public batch: Batch,
    private readonly persist: (snapshot: Batch) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}
  update(change: (batch: Batch) => Batch) {
    if (this.batch.cancelled) return;
    this.batch = change(this.batch);
    this.version++;
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(this.onError);
      }, BATCH_SAVE_INTERVAL_MS);
  }
  stop() {
    this.update((batch) => ({
      ...batch,
      cancelled: true,
      completedAt: new Date().toISOString(),
      rows: batch.rows.map((row) =>
        row.status === "pending"
          ? {
              ...row,
              status: "done",
              errors: [...row.errors, "已停止，未完成查詢"],
            }
          : row,
      ),
    }));
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const requiredVersion = this.version;
    const job = this.tail.then(async () => {
      if (this.savedVersion >= requiredVersion) return;
      const writingVersion = this.version;
      const snapshot = structuredClone(this.batch);
      await this.persist(snapshot);
      this.savedVersion = writingVersion;
    });
    // A failed write remains dirty and can be retried at the next flush boundary.
    this.tail = job.catch(() => {});
    return job;
  }
}
