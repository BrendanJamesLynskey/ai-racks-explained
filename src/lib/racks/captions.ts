/**
 * The live caption of every animation step: a pure function of the model's
 * state, so a test can rebuild the caption of any step from the Python
 * reference's state and compare it with the page (tests/e2e/frames.spec.ts).
 */
import {
  fmtBytes,
  fmtInt,
  fmtRate,
  fmtTime,
  fmtWatts,
  pct,
  trim,
} from "@/lib/format";

import type {
  FatTree,
  FillStep,
  Fit,
  Hop,
  PipeStep,
  Pipeline,
  Ring,
  Rung,
  TreeStep,
} from "./model";

// --- chapter 1: the ladder ----------------------------------------------------

export function ladderCaption(r: Rung, n: number, payload: number): string {
  const what =
    r.i === 0
      ? `one GPU of ${r.children} dies and its HBM`
      : `${fmtInt(r.gpus)} GPUs in ${fmtInt(r.children)} ${r.child === "GPU" ? "GPUs" : `${r.child}s`}`;
  const drop =
    r.drop > 1
      ? ` That is ${trim(r.drop, 3)} times less than the rung below.`
      : r.i > 0
        ? " The same as the rung below."
        : "";
  return (
    `Rung ${r.i + 1} of ${n}, the ${r.name.charAt(0).toLowerCase()}${r.name.slice(1)}: ${what}. ` +
    `Each GPU moves data over ${r.link} at ${fmtRate(r.bw)}${r.i === 0 ? "" : " per direction"}, ` +
    `so ${fmtBytes(payload)} takes ${fmtTime(r.time)}.${drop} ` +
    `Rack power of these GPUs: ${fmtWatts(r.power_w)}.`
  );
}

// --- chapter 2: the package -----------------------------------------------------

export function fillCaption(
  s: FillStep,
  stacks: number,
  perStack: number,
  f: Fit,
  gpuName: string,
  modelName: string,
): string {
  if (s.i === 0)
    return (
      `${modelName}: ${fmtBytes(f.weights)} of weights need ${f.gpus} ${gpuName} GPU${f.gpus > 1 ? "s" : ""}; ` +
      `this GPU holds ${fmtBytes(f.share)}, written into ${stacks} stacks of ${fmtBytes(perStack)}.`
    );
  const head = `Stack ${s.i} of ${stacks}: ${fmtBytes(s.placed)} placed, ${fmtBytes(s.left)} to go.`;
  if (!s.done) return head;
  return (
    `${head} Done: ${pct(f.fill)} of HBM holds weights. ` +
    `Reading them once takes ${fmtTime(f.read_time)}, so batch-1 decode is at most ${trim(f.tokens_per_s, 3)} tokens/s.`
  );
}

// --- chapter 3: paths ---------------------------------------------------------------

export function pipeCaption(
  hops: Hop[],
  p: Pipeline,
  s: PipeStep,
  chunks: number,
): string {
  const slow = hops[p.bottleneck]!;
  const busy = hops
    .filter((_, i) => s.busy[i])
    .map((h) => h.name)
    .join(", ");
  const head =
    s.done === chunks
      ? `Done at ${fmtTime(s.t)}: ${fmtBytes(s.delivered)} delivered, ${pct(p.ideal / p.total)} of the speed of ${slow.name} alone.`
      : `t = ${fmtTime(s.t)}: ${s.done} of ${chunks} chunks delivered (${fmtBytes(s.delivered)}).`;
  const now = s.done === chunks ? "" : busy ? ` Moving on: ${busy}.` : "";
  return `${head}${now} The slowest link is ${slow.name} at ${fmtRate(slow.bw)}.`;
}

// --- chapter 4: ring all-reduce --------------------------------------------------------

export function ringCaption(r: Ring, k: number): string {
  const st = r.steps[k]!;
  const n = r.n;
  if (st.phase === "start")
    return `${n} GPUs in a ring, each holding ${n} chunks of its own vector. Goal: every GPU ends with the sum of all ${n}.`;
  const m = st.sends[0]!;
  if (st.phase === "reduce-scatter")
    return (
      `Reduce-scatter step ${st.s} of ${n - 1}: every GPU sends one chunk to its neighbour, which adds it ` +
      `(GPU ${m.from} sends chunk ${m.chunk}, value ${m.value}, to GPU ${m.to}).` +
      (st.s === n - 1
        ? ` Each GPU now owns one complete chunk of the sum.`
        : "")
    );
  const j = st.s - n + 1;
  return (
    `All-gather step ${j} of ${n - 1}: every GPU forwards a finished chunk, which its neighbour copies ` +
    `(GPU ${m.from} sends chunk ${m.chunk} = ${m.value} to GPU ${m.to}).` +
    (j === n - 1
      ? ` Every GPU now holds the full sum: ${r.total.join(", ")}.`
      : "")
  );
}

// --- chapter 5: fat trees -------------------------------------------------------------

export function treeCaption(t: FatTree, s: TreeStep, n: number): string {
  const running = `So far: ${fmtInt(s.switches)} switches, ${fmtInt(s.links)} links, ${fmtInt(s.transceivers)} transceivers.`;
  switch (s.key) {
    case "gpus":
      return `Step ${s.i + 1} of ${n}: ${fmtInt(t.n)} GPU network ports to connect with ${t.k}-port switches${t.oversub > 1 ? `, ${t.oversub}:1 oversubscribed` : ", non-blocking"}.`;
    case "leaves":
    case "spines":
    case "cores":
      return `Step ${s.i + 1} of ${n}: ${s.label}. ${running}`;
    case "route-local":
      return `Step ${s.i + 1} of ${n}: ${s.label}. Traffic between GPUs on one leaf never leaves it.`;
    default:
      return `Step ${s.i + 1} of ${n}: ${s.label}. Total ${fmtInt(t.switches)} switches and ${fmtInt(t.transceivers)} transceivers, ${trim(t.per_gpu_transceivers, 3)} per GPU.`;
  }
}
