/**
 * Chapter 8: one rack serving with prefill and decode in separate pools,
 * run by Disaggregated_Inference_Sim's own JavaScript engine
 * (`vendor/sim_engine.js`, vendored byte for byte at the commit in
 * `vendor/VENDORED.json`). The engine is bit-exact with the simulator's
 * Python package; `tests/unit/disagg.test.ts` checks it again here, on the
 * rack's own configurations, against `scripts/disagg_reference.py`.
 *
 * The rack's KV links and the illustrative context-optimised part are not
 * among the engine's presets: they come from `src/data/disagg.json` (written
 * by the same reference script, which builds the identical Python objects)
 * and are registered with the engine before it runs, without touching the
 * vendored file. The engine is a classic script that sets
 * `globalThis.DisaggSim`; importing it for its side effect keeps it
 * unmodified.
 */
import "./vendor/sim_engine.js";

import data from "@/data/disagg.json";

export type Split = `${number}-${number}`;
export type LinkKey = "nvlink" | "ib" | "eth100";
export type Part = "gb200" | "ctx-prefill" | "ctx-decode";
export type RunKey = `${Split}.${LinkKey}.${Part}`;

/** One request: [arrival s, prompt tokens, output tokens]. */
export type Row = [number, number, number];
export type EngineConfig = Record<string, unknown>;

/** A run's summary, with the same keys and arithmetic as the reference's `summary_of`. */
export type RunSummary = {
  ttft_p50: number;
  ttft_p99: number;
  tpot_p50: number;
  tpot_p99: number;
  slo: number;
  out_tok_s: number;
  avg_w: number;
  j_per_tok: number;
  handoff_mean: number;
  tok_s_per_mw: number;
  completed: number;
  rejected: number;
  horizon: number;
};

/** A request's seven timestamps, in seconds (null if never reached). */
export type Stamps = {
  arrival: number;
  prefillStart: number | null;
  firstToken: number | null;
  kvStart: number | null;
  kvReady: number | null;
  decodeStart: number | null;
  finish: number | null;
};

export const STAMP_KEYS = [
  "arrival",
  "prefillStart",
  "firstToken",
  "kvStart",
  "kvReady",
  "decodeStart",
  "finish",
] as const;

type LinkDef = { name: string; bw: number; lat: number; pjBit: number };

export type DisaggData = {
  simulator: string;
  commit: string;
  gpus: number;
  tp: number;
  instances: number;
  model: string;
  modelName: string;
  kvBytesPerToken: number;
  rate: number;
  n: number;
  seed: number;
  offeredTokS: number;
  promptTokS: number;
  promptMean: number;
  promptCv: number;
  outputMean: number;
  outputCv: number;
  ttftSlo: number;
  tpotSlo: number;
  frameDt: number;
  splits: [number, number][];
  links: Record<LinkKey, LinkDef>;
  linkOrder: LinkKey[];
  ctx: { name: string; B: number; M: number };
  parts: Part[];
  gb200: { F: number; B: number; M: number; tdp: number };
  cfgs: Record<string, EngineConfig>;
  runs: Record<string, Record<string, Record<string, RunSummary>>>;
};

export const DISAGG = data as unknown as DisaggData;

type EngineSummary = {
  completed: number;
  rejected: number;
  ttft: { p50: number; p99: number };
  tpot: { p50: number; p99: number };
  sloAttain: number;
  outTokPerS: number;
  energy: { totalJ: number; avgW: number; jPerTok: number };
};

type Engine = {
  DEVICES: Record<string, Record<string, unknown>>;
  LINKS: Record<string, LinkDef>;
  simulate: (
    cfg: EngineConfig,
    rows: Row[],
  ) => { reqs: Stamps[]; horizon: number };
  summarise: (res: unknown) => EngineSummary;
};

/** The vendored engine's API. */
export const engine: Engine = (globalThis as unknown as { DisaggSim: Engine })
  .DisaggSim;

/**
 * Register the rack's KV links and the illustrative context-optimised part
 * with the engine (idempotent): `rack-<link>` and `rack-ctx`, the keys the
 * recorded configurations name.
 */
export function register(): void {
  for (const k of DISAGG.linkOrder) engine.LINKS[`rack-${k}`] = DISAGG.links[k];
  engine.DEVICES["rack-ctx"] = {
    ...engine.DEVICES["gb200"],
    name: DISAGG.ctx.name,
    B: DISAGG.ctx.B,
    M: DISAGG.ctx.M,
  };
}

export function runKey(split: Split, link: LinkKey, part: Part): RunKey {
  return `${split}.${link}.${part}`;
}

/** The engine configuration the reference recorded for a run. */
export function configFor(key: RunKey): EngineConfig {
  const c = DISAGG.cfgs[key];
  if (!c) throw new Error(`no configuration ${key}`);
  return c;
}

/** The recorded summary of a run (the numbers the chapter quotes). */
export function recorded(key: RunKey): RunSummary {
  const [s, l, p] = key.split(".") as [string, string, string];
  return DISAGG.runs[s]![l]![p]!;
}

export type Run = { summary: RunSummary; reqs: Stamps[] };

/** Run one configuration on the recorded rows: the summary and every request's stamps. */
/** Mean seconds from first token to the KV cache landing on the decode pool (a plain sum, as the reference). */
export function handoffMean(reqs: Stamps[]): number {
  let total = 0.0;
  let n = 0;
  for (const r of reqs)
    if (r.kvReady !== null && r.firstToken !== null) {
      total = total + (r.kvReady - r.firstToken);
      n += 1;
    }
  return total / n;
}

export function runRack(cfg: EngineConfig, rows: Row[]): Run {
  register();
  const res = engine.simulate(cfg, rows);
  const s = engine.summarise(res);
  return {
    summary: {
      ttft_p50: s.ttft.p50,
      ttft_p99: s.ttft.p99,
      tpot_p50: s.tpot.p50,
      tpot_p99: s.tpot.p99,
      slo: s.sloAttain,
      out_tok_s: s.outTokPerS,
      avg_w: s.energy.avgW,
      j_per_tok: s.energy.jPerTok,
      handoff_mean: handoffMean(res.reqs),
      tok_s_per_mw: s.outTokPerS / (s.energy.avgW / 1e6),
      completed: s.completed,
      rejected: s.rejected,
      horizon: res.horizon,
    },
    reqs: res.reqs.map((r) => ({
      arrival: r.arrival,
      prefillStart: r.prefillStart,
      firstToken: r.firstToken,
      kvStart: r.kvStart,
      kvReady: r.kvReady,
      decodeStart: r.decodeStart,
      finish: r.finish,
    })),
  };
}

export type Counts = {
  waiting: number;
  prefill: number;
  handoff: number;
  decode_queue: number;
  decode: number;
  done: number;
};

export const STAGE_ORDER: (keyof Counts)[] = [
  "waiting",
  "prefill",
  "handoff",
  "decode_queue",
  "decode",
  "done",
];

/** The stage a request is in at time t (null before it arrives). */
export function stageAt(r: Stamps, t: number): keyof Counts | null {
  if (r.arrival > t) return null;
  if (r.finish !== null && t >= r.finish) return "done";
  if (r.decodeStart !== null && t >= r.decodeStart) return "decode";
  if (r.kvReady !== null && t >= r.kvReady) return "decode_queue";
  if (r.firstToken !== null && t >= r.firstToken) return "handoff";
  if (r.prefillStart !== null && t >= r.prefillStart) return "prefill";
  return "waiting";
}

/** How many requests are in each stage at time t (the reference's `stage_counts`). */
export function countsAt(reqs: Stamps[], t: number): Counts {
  const c: Counts = {
    waiting: 0,
    prefill: 0,
    handoff: 0,
    decode_queue: 0,
    decode: 0,
    done: 0,
  };
  for (const r of reqs) {
    const s = stageAt(r, t);
    if (s) c[s] += 1;
  }
  return c;
}

/** Animation frames: one every `frameDt` seconds until the last request finishes. */
export function frameCount(reqs: Stamps[]): number {
  let end = 0;
  for (const r of reqs) if (r.finish !== null && r.finish > end) end = r.finish;
  return Math.ceil(end / DISAGG.frameDt) + 1;
}

/** The requests the timeline draws: `n` consecutive requests from the middle of the run. */
export function laneSlice(
  reqs: Stamps[],
  n = 16,
): { start: number; lanes: Stamps[] } {
  const start = Math.floor(reqs.length / 3);
  return { start, lanes: reqs.slice(start, start + n) };
}
