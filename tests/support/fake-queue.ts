export interface CapturedQueueMessage<T> {
  body: T;
  delaySeconds: number;
}

export interface FakeQueue<T> {
  binding: Queue;
  messages: CapturedQueueMessage<T>[];
  drainNext(
    handler: (message: CapturedQueueMessage<T>) => Promise<void>,
  ): Promise<void>;
}

export function createFakeQueue<T>(): FakeQueue<T> {
  const messages: CapturedQueueMessage<T>[] = [];
  const binding = {
    send: async function send(
      body: T,
      options?: QueueSendOptions,
    ): Promise<void> {
      messages.push({
        body,
        delaySeconds: options?.delaySeconds ?? 0,
      });
    },
    sendBatch: async function sendBatch(
      batch: Iterable<MessageSendRequest<T>>,
    ): Promise<void> {
      for (const message of batch) {
        messages.push({
          body: message.body,
          delaySeconds: message.options?.delaySeconds ?? 0,
        });
      }
    },
  } as Queue<T>;

  return {
    binding: binding as Queue,
    messages,
    drainNext: async function drainNext(handler) {
      const message = messages.shift();
      if (!message) throw new Error("Cannot drain an empty fake queue");
      await handler(message);
    },
  };
}
