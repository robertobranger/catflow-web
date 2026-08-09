import { get, set } from 'idb-keyval';
import { addTransaction } from './api.js';

const KEY = 'catflow.queue';

export async function getQueue() {
  return (await get(KEY)) || [];
}

export async function enqueue(tx) {
  const queue = await getQueue();
  queue.push(tx);
  await set(KEY, queue);
  return queue.length;
}

/**
 * Try to send every queued transaction. Duplicates are rejected server-side
 * by UUID, so retrying after a partial failure is safe.
 * Returns { sent, remaining, error }.
 */
export async function flushQueue() {
  let queue = await getQueue();
  let sent = 0;
  let error = null;

  while (queue.length > 0) {
    try {
      await addTransaction(queue[0]);
      queue = queue.slice(1);
      await set(KEY, queue);
      sent++;
    } catch (err) {
      error = err;
      break;
    }
  }
  return { sent, remaining: queue.length, error };
}
