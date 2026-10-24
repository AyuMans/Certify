// One shared institution wallet is used by this demo. Queue writes to avoid nonce conflicts.
let pending: Promise<void> = Promise.resolve();
export async function acquireWriteLock(): Promise<() => void> {
  const previous = pending;
  let release!: () => void;
  pending = new Promise<void>(resolve => { release = resolve; });
  await previous;
  return release;
}
