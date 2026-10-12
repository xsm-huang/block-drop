/** Serialize all database operations. Replacing a session invalidates its queued writes. */
export class SaveQueue {
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  replace() { return ++this.generation; }
  current() { return this.generation; }
  enqueue(task: () => Promise<void>, generation?: number): Promise<void> {
    const next = this.chain.catch(() => {}).then(async () => {
      if (generation === undefined || generation === this.generation) await task();
    });
    this.chain = next;
    return next;
  }
}
