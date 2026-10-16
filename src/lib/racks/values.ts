/**
 * Every number the chapters quote comes from here: a path into the model's
 * results, e.g. "gpu.b300.hbm_bw", "ladder.su.bw" or
 * "tree.n9216.k64.o1.switches", formatted by kind. The MDX writes
 * <V of="…" fmt="…" />, so prose cannot drift from the tested model
 * (tests/unit/values.test.ts checks every path the chapters use resolves).
 */
import {
  fmtBits,
  fmtBytes,
  fmtFlops,
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

import { DISAGG } from "./disagg";

import {
  FORMATS,
  GPU_ORDER,
  MODEL_ORDER,
  PATH_ORDER,
  SWITCH_RECORDS,
  SYSTEM_RECORDS,
  fatTree,
  fit,
  gpu,
  ladder,
  nvlinkDomain,
  packageOf,
  paths,
  pipeline,
  railAligned,
  switchOf,
  system,
  tpCompare,
  validation,
  abSweep,
  alphaOf,
  cval,
  decodeAllreduce,
  alltoallTime,
  perDir,
  BUSBAR_CASES,
  COST_ILLUSTRATIVE,
  HOURS_PER_YEAR,
  LLAMA3_RUN,
  OTHER_ORDER,
  PHYS,
  airCp,
  busbar,
  checkpoint,
  coolingLoop,
  facility,
  failureRate,
  heatFlow,
  other,
  powerChain,
  rackSmoothing,
  scaleupPerChip,
  tco,
  torus,
  torusShells,
  tpuCompare,
  trainingLayout,
  waterCp,
  type Fmt as WeightFmt,
  type SwitchId,
  type SystemId,
} from "./model";

export type Fmt =
  | "rate"
  | "bits"
  | "bytes"
  | "flops"
  | "time"
  | "watts"
  | "pct"
  | "int"
  | "num"
  | "raw"
  | "temp"
  | "usd"
  | "joules"
  | "tokens";

/** The message sizes the collective numbers are quoted at. */
export const SIZE_LABELS: Record<string, number> = {
  "16MB": 16e6,
  "64MB": 64e6,
  "256MB": 256e6,
  "1GB": 1e9,
};
/** The fabric sizes and radixes the fat-tree numbers are quoted at. */
export const TREE_N = [576, 2048, 9216, 32768] as const;
export const TREE_K = [64, 144] as const;

/** Chapter 6's power-smoothing cases: how fast the load swings, and the storage per GPU. */
export const SMOOTH_HALF: Record<string, number> = {
  fast: 0.05,
  mid: 0.25,
  slow: 1.0,
};
export const SMOOTH_J: Record<string, number> = {
  none: 0,
  gb300: 65,
  x10: 650,
};
/** Chapter 7's rack powers. */
export const RACK_Q: Record<string, number> = {
  r120: 120e3,
  r135: 135e3,
  r1000: 1e6,
};
/** Chapter 9's layouts: TP x PP x DP. */
export const LAYOUTS: [number, number, number][] = [
  [4, 2, 2],
  [8, 4, 4],
  [8, 16, 128],
];
export const CKPT_N = [1024, 4096, 16384, 100000] as const;
export const CKPT_SAVE = [10, 60, 300] as const;
/** Chapter 11's cases: [capex per rack, $ per kWh, utilisation] (all illustrative). */
export const TCO_CASES: Record<string, [number, number, number]> = {
  base: [3.5e6, 0.1, 0.7],
  low: [2e6, 0.05, 0.9],
  high: [5e6, 0.15, 0.5],
};

/** The illustrative cost inputs and the rack's sustained output from chapter 8. */
export type CostInputs = {
  capex_rack_usd: number;
  years: number;
  pue: number;
  usd_per_kwh: number;
  utilisation: number;
  rack_w: number;
  tok_s: number;
};

export function costInputs(): CostInputs {
  const c = (k: string) => COST_ILLUSTRATIVE[k]!.v;
  return {
    capex_rack_usd: c("capex_rack_usd"),
    years: c("years"),
    pue: c("pue"),
    usd_per_kwh: c("usd_per_kwh"),
    utilisation: c("utilisation"),
    rack_w: system("gb200-nvl72")["rack_power_w"] as number,
    tok_s: DISAGG.offeredTokS,
  };
}

function build(): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  const g: Record<string, unknown> = {};
  for (const id of GPU_ORDER) g[id] = gpu(id);
  t.gpu = g;
  const s: Record<string, unknown> = {};
  for (const r of SYSTEM_RECORDS) s[r.id] = system(r.id as SystemId);
  t.sys = s;
  const w: Record<string, unknown> = {};
  for (const r of SWITCH_RECORDS) w[r.id] = switchOf(r.id as SwitchId);
  t.sw = w;
  const l: Record<string, unknown> = {};
  for (const r of ladder()) l[r.key] = r;
  t.ladder = l;
  const p: Record<string, unknown> = {};
  for (const id of GPU_ORDER) p[id] = packageOf(id);
  t.pkg = p;
  const f: Record<string, unknown> = {};
  for (const id of GPU_ORDER) {
    const byModel: Record<string, unknown> = {};
    for (const m of MODEL_ORDER) {
      const byFmt: Record<string, unknown> = {};
      for (const fm of Object.keys(FORMATS) as WeightFmt[])
        byFmt[fm] = fit(id, m, fm);
      byModel[m] = byFmt;
    }
    f[id] = byModel;
  }
  t.fit = f;
  const ps = paths();
  const pp: Record<string, unknown> = {};
  for (const id of PATH_ORDER) {
    const byChunks: Record<string, unknown> = {};
    for (const c of [1, 4, 8, 16]) {
      const pl = pipeline(ps[id].hops, 2e9, c);
      byChunks[`c${c}`] = {
        total: pl.total,
        ideal: pl.ideal,
        rate: pl.rate,
        efficiency: pl.ideal / pl.total,
        slow_bw: ps[id].hops[pl.bottleneck]!.bw,
      };
    }
    pp[id] = byChunks;
  }
  t.pipe = pp;
  t.nvl = nvlinkDomain();
  const tp: Record<string, unknown> = {};
  for (const n of [4, 8, 72]) {
    const bySize: Record<string, unknown> = {};
    for (const [lab, z] of Object.entries(SIZE_LABELS))
      bySize[lab] = tpCompare("gb200-nvl72", z, n);
    tp[`n${n}`] = bySize;
  }
  t.tp = tp;
  const a2a: Record<string, unknown> = {};
  for (const [lab, z] of Object.entries(SIZE_LABELS))
    a2a[lab] = {
      nvlink: alltoallTime(72, z, perDir(gpu("b200").nvlink_bidir)),
      net: alltoallTime(
        72,
        z,
        (system("gb200-nvl72")["nic_bps"] as number) / 8,
      ),
    };
  t.a2a = a2a;
  const tree: Record<string, unknown> = {};
  for (const n of TREE_N) {
    const byK: Record<string, unknown> = {};
    for (const k of TREE_K) {
      const byO: Record<string, unknown> = {};
      for (const o of [1, 2]) byO[`o${o}`] = fatTree(n, k, o);
      byK[`k${k}`] = byO;
    }
    tree[`n${n}`] = byK;
  }
  t.tree = tree;
  const rail: Record<string, unknown> = {};
  for (const su of [1, 2, 4, 8, 16]) rail[String(su)] = railAligned(su);
  t.rail = rail;
  const val: Record<string, unknown> = {};
  for (const v of validation()) val[v.id] = v;
  t.val = val;
  // brief 42: the latency term
  const sweep = abSweep("b200", 8);
  const at: Record<string, unknown> = {};
  for (const x of sweep) at[`s${x.size}`] = x;
  t.ab = {
    alphaRing: alphaOf("ring"),
    alphaSwitch: alphaOf("switch"),
    ringSmall: cval("ring_small_s"),
    nvlsSmall: cval("nvls_small_s"),
    nvlsBig: cval("nvls_big_bps"),
    b200n8: at,
    dec8: decodeAllreduce(8, 8),
    dec1: decodeAllreduce(1, 8),
    dec256: decodeAllreduce(256, 8),
    // how much the bandwidth-only time underestimates the batch-8 decode all-reduce
    dec8under: decodeAllreduce(8, 8).ring.t / decodeAllreduce(8, 8).bwOnly,
    d70: cval("d_70b"),
  };
  const kinds: Record<string, number> = {
    consistency: 0,
    rule: 0,
    measured: 0,
  };
  for (const v of validation()) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  t.kinds = kinds;
  // chapter 6: power
  t.pow = powerChain();
  t.fac = { power: facility("power"), cooling: facility("cooling") };
  const bus: Record<string, unknown> = {};
  for (const [p, v] of BUSBAR_CASES) bus[`w${p / 1e3}k_v${v}`] = busbar(p, v);
  t.bus = bus;
  const sm: Record<string, unknown> = {};
  for (const [h, hv] of Object.entries(SMOOTH_HALF)) {
    const byJ: Record<string, unknown> = {};
    for (const [j, jv] of Object.entries(SMOOTH_J))
      byJ[j] = rackSmoothing(hv, jv);
    sm[h] = byJ;
  }
  t.smooth = sm;
  // chapter 7: cooling
  const phys: Record<string, unknown> = {
    water_cp: waterCp(),
    air_cp: airCp(),
  };
  for (const [k, f] of Object.entries(PHYS.fields)) phys[k] = f.v;
  t.phys = phys;
  const flow: Record<string, unknown> = {};
  for (const [k, q] of Object.entries(RACK_Q)) flow[k] = heatFlow(q, 10, 15);
  t.flow = flow;
  const loop: Record<string, unknown> = {};
  for (const tf of [20, 30, 40]) {
    const byDt: Record<string, unknown> = {};
    for (const d of [5, 10, 15]) byDt[`d${d}`] = coolingLoop(120e3, 0.9, tf, d);
    loop[`t${tf}`] = byDt;
  }
  t.loop = loop;
  // chapter 8: the recorded rack runs (and the run's own parameters)
  const kvMean = DISAGG.promptMean * DISAGG.kvBytesPerToken;
  const link: Record<string, unknown> = {};
  for (const k of DISAGG.linkOrder)
    link[k] = { bw: DISAGG.links[k].bw, kv_time: kvMean / DISAGG.links[k].bw };
  t.dis = {
    ...DISAGG.runs,
    meta: {
      gpus: DISAGG.gpus,
      tp: DISAGG.tp,
      instances: DISAGG.instances,
      rate: DISAGG.rate,
      n: DISAGG.n,
      offered_tok_s: DISAGG.offeredTokS,
      prompt_tok_s: DISAGG.promptTokS,
      prompt_mean: DISAGG.promptMean,
      output_mean: DISAGG.outputMean,
      kv_per_token: DISAGG.kvBytesPerToken,
      kv_mean: kvMean,
      ttft_slo: DISAGG.ttftSlo,
      tpot_slo: DISAGG.tpotSlo,
      ctx_bw: DISAGG.ctx.B,
      ctx_mem: DISAGG.ctx.M,
      gb200_bw: DISAGG.gb200.B,
      gb200_mem: DISAGG.gb200.M,
      gb200_flops: DISAGG.gb200.F,
      commit: DISAGG.commit.slice(0, 7),
    },
    link,
  };
  // chapter 9: training
  const llama: Record<string, unknown> = { rate: failureRate() };
  for (const [k, f] of Object.entries(LLAMA3_RUN)) llama[k] = f.v;
  t.llama = llama;
  const ck: Record<string, unknown> = {};
  for (const n of CKPT_N) {
    const byS: Record<string, unknown> = {};
    for (const z of CKPT_SAVE) byS[`s${z}`] = checkpoint(n, z);
    ck[`n${n}`] = byS;
  }
  t.ckpt = ck;
  const lay: Record<string, unknown> = {};
  for (const [a, b, c] of LAYOUTS)
    lay[`l${a}x${b}x${c}`] = {
      d8: trainingLayout(a, b, c, 8),
      d72: trainingLayout(a, b, c, 72),
    };
  t.lay = lay;
  // chapter 10: other designs
  const tor: Record<string, unknown> = {};
  for (const k of [2, 4, 8]) {
    const tt = torus(k) as unknown as Record<string, unknown>;
    tor[`k${k}`] = { ...tt, shell_max: Math.max(...torusShells(k)) };
  }
  t.torus = tor;
  const tpu: Record<string, unknown> = {};
  for (const [lab, z] of Object.entries(SIZE_LABELS)) {
    const c = tpuCompare(z);
    tpu[lab] = { ...c, ratio: c.t_torus / c.t_nvl72 };
  }
  t.tpu = tpu;
  const oth: Record<string, unknown> = {};
  for (const o of OTHER_ORDER)
    oth[o] = {
      ...other(o),
      scaleup_per_chip: scaleupPerChip(o) ?? "not disclosed",
    };
  t.other = oth;
  // chapter 11: cost
  const ci = costInputs();
  t.cost = { ...ci, hours: HOURS_PER_YEAR };
  const tc: Record<string, unknown> = {};
  for (const [k, [cap, kwh, u]] of Object.entries(TCO_CASES))
    tc[k] = tco(cap, ci.years, ci.rack_w, ci.pue, kwh, ci.tok_s, u);
  t.tco = tc;
  return t;
}

let TREE: Record<string, unknown> | null = null;

export function lookup(path: string): number | string {
  if (!TREE) TREE = build();
  let cur: unknown = TREE;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(k in cur))
      throw new Error(`no value at ${path}`);
    cur = (cur as Record<string, unknown>)[k];
  }
  if (typeof cur !== "number" && typeof cur !== "string")
    throw new Error(`${path} is not a number or string`);
  return cur;
}

export function formatValue(v: number | string, fmt: Fmt): string {
  if (typeof v === "string") return v;
  switch (fmt) {
    case "rate":
      return fmtRate(v);
    case "bits":
      return fmtBits(v);
    case "bytes":
      return fmtBytes(v);
    case "flops":
      return fmtFlops(v);
    case "time":
      return fmtTime(v);
    case "watts":
      return fmtWatts(v);
    case "pct":
      return pct(v);
    case "int":
      return fmtInt(v);
    case "raw":
      return String(v);
    case "temp":
      return fmtTemp(v);
    case "usd":
      return fmtUsd(v);
    case "joules":
      return fmtJoules(v);
    case "tokens":
      return fmtTokens(v);
    default:
      return trim(v);
  }
}
