/**
 * The learning layer's numbers (brief 44) that are not already a path in
 * the chapters' value tree (`src/lib/racks/values.ts`): each is computed here
 * from the tested model's values, at build time. A self-check cites one as
 * `<Check v="…">`, prose as `<V v="…" />`; tests/unit/learn.test.ts checks
 * every one.
 */
import { lookup } from "@/lib/racks/values";

const num = (path: string): number => {
  const v = lookup(path);
  if (typeof v !== "number") throw new Error(`${path} is not a number`);
  return v;
};

const VALUES: Record<string, () => number> = {
  // chapter 5: transceivers per GPU, generic tree of 64-port switches
  "ch05.xcvrPerGpu": () =>
    num("tree.n9216.k64.o1.transceivers") / num("tree.n9216.k64.o1.n"),
  "ch05.xcvrPerGpu144": () =>
    num("tree.n9216.k144.o1.transceivers") / num("tree.n9216.k144.o1.n"),
  // chapter 11: the dear case's cost per token over the cheap case's
  "ch11.highOverLow": () =>
    num("tco.high.usd_per_mtok") / num("tco.low.usd_per_mtok"),
};

export const LEARN_VALUE_NAMES = Object.keys(VALUES);

const CACHE = new Map<string, number>();

export function learnValue(name: string): number {
  const cached = CACHE.get(name);
  if (cached !== undefined) return cached;
  const f = VALUES[name];
  if (!f) throw new Error(`no learn value ${name}`);
  const v = f();
  if (!Number.isFinite(v)) throw new Error(`learn value ${name} is ${v}`);
  CACHE.set(name, v);
  return v;
}
