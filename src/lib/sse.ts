type Listener = (event: string, data: unknown) => void;

const bus = globalThis as unknown as { __dthBus?: Map<string, Set<Listener>> };
const channels: Map<string, Set<Listener>> = bus.__dthBus ?? new Map();
bus.__dthBus = channels;

export function subscribe(channel: string, listener: Listener): () => void {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(listener);
  return () => {
    channels.get(channel)?.delete(listener);
  };
}

export function publish(channel: string, event: string, data: unknown) {
  const set = channels.get(channel);
  if (!set) return;
  for (const fn of set) {
    try { fn(event, data); } catch {}
  }
}

export const screenChannel = (roundId: string | number) => `screen:${roundId}`;
