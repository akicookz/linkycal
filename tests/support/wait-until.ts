export interface WaitUntilCollector {
  waitUntil(promise: Promise<unknown>): void;
  flush(): Promise<void>;
}

export function createWaitUntilCollector(): WaitUntilCollector {
  const pending: Promise<unknown>[] = [];

  return {
    waitUntil: function waitUntil(promise) {
      pending.push(promise);
    },
    flush: async function flush() {
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }
    },
  };
}
