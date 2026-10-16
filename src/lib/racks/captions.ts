/**
 * The live caption of every animation step: a pure function of the model's
 * state, so a test can rebuild the caption of any step from the Python
 * reference's state and compare it with the page (tests/e2e/frames.spec.ts).
 */
import {
  fmtBytes,
  fmtInt,
  fmtJoules,
  fmtRate,
  fmtTemp,
  fmtTime,
  fmtTokens,
  fmtUsd,
  fmtWatts,
  pct,
  trim,
} from "@/lib/format";

import type { Counts } from "./disagg";
import type {
  AbStep,
  CoolingLoop,
  FatTree,
  Layout,
  LayoutStep,
  LoopStep,
  SmoothStep,
  Smoothing,
  TcoStep,
  TorusStep,
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

// --- chapter 6: power smoothing -------------------------------------------------------

export function smoothCaption(
  sm: Smoothing,
  st: SmoothStep,
  n: number,
): string {
  const head = `Frame ${st.i + 1} of ${n}, t = ${fmtTime(st.t)}, ${st.phase} phase: the rack draws ${fmtWatts(st.load)}, the grid supplies ${fmtWatts(st.grid)}`;
  const store =
    sm.e_store > 0
      ? `; the power shelves' store holds ${fmtJoules(st.stored)} of ${fmtJoules(sm.e_store)}.`
      : "; there is no store, so the grid follows the load.";
  const net = st.load - st.grid;
  const flow =
    net > 0
      ? ` The store supplies ${fmtWatts(net)}.`
      : net < 0
        ? ` The store refills at ${fmtWatts(-net)}.`
        : "";
  return `${head}${store}${flow}`;
}

// --- chapter 7: the cooling loop --------------------------------------------------------

export function loopCaption(
  loop: CoolingLoop,
  st: LoopStep,
  n: number,
): string {
  const p = st.parcels[0]!;
  const where: Record<string, string> = {
    supply: "in the supply manifold",
    "cold plates": "crossing the cold plates",
    return: "in the return manifold",
    CDU: "in the CDU's heat exchanger",
  };
  return (
    `Frame ${st.i + 1} of ${n}: the marked parcel is ${where[p.seg]} at ${fmtTemp(p.temp)}. ` +
    `Coolant leaves the CDU at ${fmtTemp(loop.t_sup)} and returns at ${fmtTemp(loop.t_ret)}; ` +
    `${trim(loop.kg_s, 3)} kg/s (${trim(loop.l_min, 3)} L/min) carries the ${fmtWatts(loop.q_liquid)} on the cold plates.`
  );
}

// --- chapter 8: disaggregated inference ----------------------------------------------------

export function disaggCaption(
  frame: number,
  frames: number,
  t: number,
  c: Counts,
  total: number,
): string {
  return (
    `Frame ${frame + 1} of ${frames}, t = ${trim(t, 4)} s: ${fmtInt(c.waiting)} waiting for prefill, ` +
    `${fmtInt(c.prefill)} in prefill, ${fmtInt(c.handoff)} handing their KV cache over, ` +
    `${fmtInt(c.decode_queue)} queued for decode, ${fmtInt(c.decode)} decoding; ${fmtInt(c.done)} of ${fmtInt(total)} done.`
  );
}

// --- chapter 9: training layout ----------------------------------------------------------

export function layoutCaption(l: Layout, st: LayoutStep, n: number): string {
  const head = `Group ${st.i + 1} of ${n}: replica ${st.d}, stage ${st.p}, GPUs ${st.first}-${st.last}`;
  const where = st.split
    ? `, split across NVLink domains ${st.domain} and ${st.domain + 1}`
    : ` in NVLink domain ${st.domain}`;
  const link =
    st.link === null
      ? " (the first stage of its pipeline)."
      : st.link === "nvlink"
        ? `. Its activations come from stage ${st.p - 1} over NVLink, inside the domain.`
        : `. Its activations come from stage ${st.p - 1} over the network: a domain boundary.`;
  const tail =
    st.i === n - 1
      ? ` In all: ${l.tp_inside} of ${l.tp_groups} tensor-parallel groups inside one domain, ${l.pp_net} of ${l.pp_hops} pipeline hops and ${l.dp_net} of ${l.dp_groups} data-parallel groups over the network.`
      : "";
  return `${head}${where}${link}${tail}`;
}

// --- chapter 10: a torus ------------------------------------------------------------------

export function torusCaption(
  st: TorusStep,
  nodes: number,
  last: number,
): string {
  if (st.d === 0)
    return `Hop 0: the source chip. In a switched NVL72 rack, every other GPU is one switch hop away; in a ${nodes}-chip torus, messages walk from neighbour to neighbour.`;
  return (
    `Hop ${st.d}: ${st.new} more chip${st.new === 1 ? "" : "s"} reached, ${st.reached} of ${nodes} so far.` +
    (st.d === last ? ` The farthest chips are ${last} hops away.` : "")
  );
}

// --- chapter 11: cost -------------------------------------------------------------------

export function tcoCaption(st: TcoStep, n: number): string {
  if (st.q === 0)
    return `Quarter 0 of ${n - 1}: the rack is bought; nothing written off, no energy used, no tokens served yet.`;
  return (
    `Quarter ${st.q} of ${n - 1}: ${fmtUsd(st.capex)} written off, ${fmtUsd(st.energy)} of electricity, ` +
    `${fmtTokens(st.tokens)} tokens served: ${fmtUsd(st.usd_per_mtok!)} per million tokens so far (illustrative prices).`
  );
}

// --- chapter 4: the latency term ------------------------------------------------------

export function abCaption(x: AbStep, n: number, gpuName: string): string {
  const r = x.ring;
  const lead =
    r.latShare >= 0.5
      ? `latency-bound: the ${2 * (n - 1)} ring steps' fixed cost is ${pct(r.latShare)} of it`
      : `bandwidth-bound: the fixed cost is ${pct(r.latShare)} of it`;
  return `${fmtBytes(x.size)} all-reduce on ${n} ${gpuName}s: ring ${fmtTime(r.t)} (${lead}; bandwidth alone would say ${fmtTime(x.ringBwOnly)}), in-switch ${fmtTime(x.switch.t)}.`;
}
