// The whole game runs on OSRS-style 600ms server ticks. Actions resolve on
// tick boundaries; rendering interpolates between them via tickAlpha().
export const TICK_MS = 600;

type TickFn = () => void;
const subscribers: TickFn[] = [];

let last = performance.now();
let alpha = 0;

export function onTick(fn: TickFn): void {
  subscribers.push(fn);
}

export function updateTicks(now: number): void {
  // After a background-tab sleep, don't fast-forward a huge backlog of ticks.
  if (now - last > TICK_MS * 6) last = now - TICK_MS;
  while (now - last >= TICK_MS) {
    last += TICK_MS;
    for (const fn of subscribers) fn();
  }
  alpha = (now - last) / TICK_MS;
}

export function tickAlpha(): number {
  return alpha;
}
