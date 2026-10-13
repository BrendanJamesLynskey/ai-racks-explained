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
  fmtRate,
  fmtTime,
  fmtWatts,
  pct,
  trim,
} from "@/lib/format";

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
  alltoallTime,
  perDir,
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
  | "raw";

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
    default:
      return trim(v);
  }
}
