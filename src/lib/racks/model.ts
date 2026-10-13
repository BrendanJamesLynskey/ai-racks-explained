/**
 * Rack-scale model: the TypeScript port of `reference/rack_model.py`.
 *
 * Every function repeats its Python counterpart with the same operations in
 * the same order, so that `tests/unit/model.test.ts` can require the port to
 * reproduce the Python fixtures exactly (IEEE doubles, no tolerance). The
 * hardware figures themselves are read from `src/data/racks.json`, which the
 * Python script writes, so both sides start from identical values.
 */
import data from "@/data/racks.json";

export type Status =
  | "spec"
  | "derived"
  | "rule"
  | "illustrative"
  | "undisclosed";
export type Avail = "product" | "preliminary" | "planned";
export type Field<T = number | string | null> = {
  v: T;
  st: Status;
  src: string;
  ref: string;
};
export type Source = {
  title: string;
  url: string;
  kind: string;
  accessed: string;
};
export type GpuRecord = {
  id: string;
  name: string;
  arch: string;
  avail: Field;
  fields: Record<string, Field>;
};
export type SystemRecord = {
  id: string;
  name: string;
  gpu: string;
  avail: Field;
  fields: Record<string, Field>;
};
export type SwitchRecord = {
  id: string;
  name: string;
  avail: Field;
  ports: Field;
  port_bps: Field;
  cpo: boolean;
};

export const ACCESSED = data.accessed;
export const SOURCES = data.sources as Record<string, Source>;
export const GPU_RECORDS = data.gpus as unknown as GpuRecord[];
export const SYSTEM_RECORDS = data.systems as unknown as SystemRecord[];
export const SWITCH_RECORDS = data.switches as unknown as SwitchRecord[];
export const CLAIMS = data.claims as Record<
  string,
  { text: string; src: string }
>;
export const SUPERPOD_TABLE3 = data.superpodTable3 as {
  gpus: number;
  sus: number;
  core: number;
  leaf: number;
  spine: number;
}[];
export const SUPERPOD_RULES = data.superpodRules as unknown as Record<
  string,
  Field<number>
>;
export const MODELS = data.models as {
  id: ModelId;
  name: string;
  params: number;
  src: string;
}[];
export const FORMATS = data.formats as Record<Fmt, number>;
export const LADDER_PAYLOAD = data.ladderPayload;
export const HALL_W = data.hallW;

export type GpuId = "h100" | "h200" | "b200" | "b300" | "rubin";
export type SystemId = "gb200-nvl72" | "gb300-nvl72" | "vr-nvl72" | "dgx-b200";
export type SwitchId =
  | "quantum2"
  | "q3400"
  | "sn5600"
  | "q3450"
  | "sn6810"
  | "sn6800";
export type ModelId = "llama3-70b" | "llama3-405b" | "deepseek-v3";
export type Fmt = "bf16" | "fp8" | "fp4";

export const GPU_ORDER = GPU_RECORDS.map((g) => g.id as GpuId);
export const MODEL_ORDER = MODELS.map((m) => m.id);

/** A GPU's values, flattened. Undisclosed figures are null. */
export type Gpu = {
  id: GpuId;
  name: string;
  arch: string;
  avail: Avail;
  hbm_bytes: number;
  hbm_bw: number;
  hbm_stacks: number | null;
  hbm_gen: string;
  tdp_w: number | null;
  nvlink_bidir: number;
  nvlink_links: number;
  pcie_bidir: number | null;
  dense_fp8: number;
  dense_bf16: number;
  dies: number | null;
  transistors: number | null;
};

export type System = {
  id: SystemId;
  name: string;
  gpu: GpuId;
  avail: Avail;
  [k: string]: number | string | null;
};

export function gpu(gid: GpuId): Gpu {
  const g = GPU_RECORDS.find((r) => r.id === gid);
  if (!g) throw new Error(`unknown GPU ${gid}`);
  const out: Record<string, number | string | null> = {
    id: g.id,
    name: g.name,
    arch: g.arch,
    avail: g.avail.v,
  };
  for (const [k, f] of Object.entries(g.fields)) out[k] = f.v;
  return out as unknown as Gpu;
}

export function system(sid: SystemId): System {
  const s = SYSTEM_RECORDS.find((r) => r.id === sid);
  if (!s) throw new Error(`unknown system ${sid}`);
  const out: Record<string, number | string | null> = {
    id: s.id,
    name: s.name,
    gpu: s.gpu,
    avail: s.avail.v,
  };
  for (const [k, f] of Object.entries(s.fields)) out[k] = f.v;
  return out as unknown as System;
}

/** A numeric field of a system (throws if it is missing or undisclosed). */
export function num(s: System, k: string): number {
  const v = s[k];
  if (typeof v !== "number") throw new Error(`${s.id}.${k} is not a number`);
  return v;
}

export type Switch = {
  id: SwitchId;
  name: string;
  avail: Avail;
  ports: number;
  port_bps: number;
  cpo: boolean;
};

export function switchOf(wid: SwitchId): Switch {
  const w = SWITCH_RECORDS.find((r) => r.id === wid);
  if (!w) throw new Error(`unknown switch ${wid}`);
  return {
    id: w.id as SwitchId,
    name: w.name,
    avail: w.avail.v as Avail,
    ports: w.ports.v as number,
    port_bps: w.port_bps.v as number,
    cpo: w.cpo,
  };
}

/** A bidirectional figure, per direction. */
export function perDir(bidir: number): number {
  return bidir / 2;
}

const rule = (k: string): number => {
  const f = SUPERPOD_RULES[k];
  if (!f) throw new Error(`no rule ${k}`);
  return f.v;
};

// ---------------------------------------------------------------------------
// Chapter 1: the scale ladder
// ---------------------------------------------------------------------------

export type RungKey = "package" | "tray" | "rack" | "su" | "pod" | "hall";
export type Rung = {
  key: RungKey;
  name: string;
  gpus: number;
  children: number;
  child: string;
  link: string;
  bw: number;
  i: number;
  time: number;
  power_w: number;
  aggregate: number;
  drop: number;
};

export function ladder(
  sid: SystemId = "gb200-nvl72",
  payload: number = LADDER_PAYLOAD,
  hallW: number = HALL_W,
): Rung[] {
  const s = system(sid);
  const g = gpu(s.gpu);
  const rp = num(s, "rack_power_w");
  const gpus = num(s, "gpus");
  const perGpuW = rp / gpus;
  const nvl = perDir(g.nvlink_bidir);
  const nic = num(s, "nic_bps") / 8;
  const su = rule("systems_per_su");
  const maxSus = rule("max_sus");
  const hallRacks = Math.floor(hallW / rp);
  const rungs = [
    {
      key: "package",
      name: "Package",
      gpus: 1,
      children: g.dies as number,
      child: "die",
      link: "HBM",
      bw: g.hbm_bw,
    },
    {
      key: "tray",
      name: "Compute tray",
      gpus: num(s, "gpus_per_tray"),
      children: num(s, "gpus_per_tray"),
      child: "GPU",
      link: "NVLink",
      bw: nvl,
    },
    {
      key: "rack",
      name: "Rack (NVLink domain)",
      gpus,
      children: num(s, "compute_trays"),
      child: "tray",
      link: "NVLink",
      bw: nvl,
    },
    {
      key: "su",
      name: "Scalable unit",
      gpus: gpus * su,
      children: su,
      child: "rack",
      link: "InfiniBand",
      bw: nic,
    },
    {
      key: "pod",
      name: "SuperPOD",
      gpus: gpus * su * maxSus,
      children: maxSus,
      child: "SU",
      link: "InfiniBand",
      bw: nic,
    },
    {
      key: "hall",
      name: "Hall",
      gpus: gpus * hallRacks,
      children: hallRacks,
      child: "rack",
      link: "InfiniBand",
      bw: nic,
    },
  ] as const;
  return rungs.map((r, i) => ({
    ...r,
    i,
    time: payload / r.bw,
    power_w: r.gpus * perGpuW,
    aggregate: r.gpus * r.bw,
    drop: i > 0 ? rungs[i - 1]!.bw / r.bw : 1.0,
  }));
}

// ---------------------------------------------------------------------------
// Chapter 2: the package
// ---------------------------------------------------------------------------

export type Package = {
  id: GpuId;
  stacks: number | null;
  per_stack_bytes: number | null;
  per_stack_bw: number | null;
  sweep_time: number;
  ridge_fp8: number;
  bytes_per_flop: number;
  w_per_tbs: number | null;
};

export function packageOf(gid: GpuId): Package {
  const g = gpu(gid);
  const stacks = g.hbm_stacks;
  return {
    id: gid,
    stacks,
    per_stack_bytes: stacks ? g.hbm_bytes / stacks : null,
    per_stack_bw: stacks ? g.hbm_bw / stacks : null,
    sweep_time: g.hbm_bytes / g.hbm_bw,
    ridge_fp8: g.dense_fp8 / g.hbm_bw,
    bytes_per_flop: g.hbm_bw / g.dense_fp8,
    w_per_tbs: g.tdp_w !== null ? g.tdp_w / (g.hbm_bw / 1e12) : null,
  };
}

export function model(mid: ModelId) {
  const m = MODELS.find((x) => x.id === mid);
  if (!m) throw new Error(`unknown model ${mid}`);
  return m;
}

export function weightsBytes(mid: ModelId, fmt: Fmt): number {
  return model(mid).params * FORMATS[fmt];
}

export type Fit = {
  weights: number;
  gpus: number;
  share: number;
  fill: number;
  read_time: number;
  tokens_per_s: number;
};

export function fit(gid: GpuId, mid: ModelId, fmt: Fmt): Fit {
  const g = gpu(gid);
  const wb = weightsBytes(mid, fmt);
  const n = Math.ceil(wb / g.hbm_bytes);
  const share = wb / n;
  return {
    weights: wb,
    gpus: n,
    share,
    fill: share / g.hbm_bytes,
    read_time: share / g.hbm_bw,
    tokens_per_s: g.hbm_bw / share,
  };
}

export type FillStep = {
  i: number;
  placed: number;
  full: number;
  last: number;
  left: number;
  done: boolean;
};

export function fillSteps(gid: GpuId, mid: ModelId, fmt: Fmt): FillStep[] {
  const g = gpu(gid);
  const stacks = g.hbm_stacks;
  if (!stacks) throw new Error(`${gid}: stack count not disclosed`);
  const f = fit(gid, mid, fmt);
  const per = g.hbm_bytes / stacks;
  const out: FillStep[] = [];
  for (let i = 0; i <= stacks; i++) {
    const placed = Math.min(f.share, per * i);
    const full = Math.floor(placed / per);
    out.push({
      i,
      placed,
      full,
      last: (placed - full * per) / per,
      left: f.share - placed,
      done: placed >= f.share,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chapter 3: data paths through a tray
// ---------------------------------------------------------------------------

export type Hop = { name: string; bw: number };
export type PathId = "rdma" | "grace" | "peer";
export type PathDef = { label: string; hops: Hop[] };
export const PATH_ORDER: PathId[] = ["rdma", "grace", "peer"];

export function paths(sid: SystemId = "gb200-nvl72"): Record<PathId, PathDef> {
  const s = system(sid);
  const g = gpu(s.gpu);
  const nvl = perDir(g.nvlink_bidir);
  const c2c = perDir(num(s, "c2c_bidir"));
  const pcie5 = perDir(gpu("h100").pcie_bidir as number);
  return {
    rdma: {
      label: "Network to GPU memory (GPUDirect RDMA)",
      hops: [
        { name: "InfiniBand port (ConnectX-7)", bw: num(s, "nic_bps") / 8 },
        { name: "PCIe Gen5 x16", bw: pcie5 },
        { name: "HBM write", bw: g.hbm_bw },
      ],
    },
    grace: {
      label: "Grace memory to GPU memory (NVLink-C2C)",
      hops: [
        { name: "LPDDR5X read", bw: num(s, "lpddr_bw_per_cpu") },
        { name: "NVLink-C2C", bw: c2c },
        { name: "HBM write", bw: g.hbm_bw },
      ],
    },
    peer: {
      label: "GPU to GPU in the rack (NVLink via a switch tray)",
      hops: [
        { name: "HBM read", bw: g.hbm_bw },
        { name: "NVLink to the switches", bw: nvl },
        { name: "NVLink to the peer", bw: nvl },
        { name: "HBM write", bw: g.hbm_bw },
      ],
    },
  };
}

export type Pipeline = {
  chunk: number;
  start: number[][];
  finish: number[][];
  total: number;
  bottleneck: number;
  ideal: number;
  rate: number;
};

export function pipeline(
  hops: Hop[],
  payload: number,
  chunks: number,
): Pipeline {
  const size = payload / chunks;
  const h = hops.length;
  const start = Array.from({ length: chunks }, () =>
    new Array<number>(h).fill(0),
  );
  const finish = Array.from({ length: chunks }, () =>
    new Array<number>(h).fill(0),
  );
  for (let c = 0; c < chunks; c++) {
    for (let i = 0; i < h; i++) {
      const a = i > 0 ? finish[c]![i - 1]! : 0.0;
      const b = c > 0 ? finish[c - 1]![i]! : 0.0;
      const s0 = a > b ? a : b;
      start[c]![i] = s0;
      finish[c]![i] = s0 + size / hops[i]!.bw;
    }
  }
  const total = finish[chunks - 1]![h - 1]!;
  let slow = 0;
  for (let i = 1; i < h; i++) if (hops[i]!.bw < hops[slow]!.bw) slow = i;
  return {
    chunk: size,
    start,
    finish,
    total,
    bottleneck: slow,
    ideal: payload / hops[slow]!.bw,
    rate: payload / total,
  };
}

export type ChunkPos = { hop: number; frac: number; wait: boolean };
export type PipeStep = {
  k: number;
  t: number;
  pos: ChunkPos[];
  done: number;
  delivered: number;
  busy: boolean[];
};

export function pipelineSteps(
  hops: Hop[],
  payload: number,
  chunks: number,
  frames: number,
): PipeStep[] {
  const p = pipeline(hops, payload, chunks);
  const h = hops.length;
  const out: PipeStep[] = [];
  for (let k = 0; k <= frames; k++) {
    const t = (p.total * k) / frames;
    const pos: ChunkPos[] = [];
    let done = 0;
    for (let c = 0; c < chunks; c++) {
      if (t >= p.finish[c]![h - 1]!) {
        pos.push({ hop: h, frac: 0.0, wait: false });
        done += 1;
        continue;
      }
      for (let i = 0; i < h; i++) {
        if (t < p.finish[c]![i]!) {
          const s0 = p.start[c]![i]!;
          if (t < s0) pos.push({ hop: i, frac: 0.0, wait: true });
          else
            pos.push({
              hop: i,
              frac: (t - s0) / (p.finish[c]![i]! - s0),
              wait: false,
            });
          break;
        }
      }
    }
    const busy: boolean[] = [];
    for (let i = 0; i < h; i++) {
      let b = false;
      for (let c = 0; c < chunks; c++)
        if (p.start[c]![i]! <= t && t < p.finish[c]![i]!) b = true;
      busy.push(b);
    }
    out.push({ k, t, pos, done, delivered: done * p.chunk, busy });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chapter 4: scale-up, the NVLink domain
// ---------------------------------------------------------------------------

export type NvlinkDomain = {
  chips: number;
  links: number;
  ports: number;
  links_per_chip_per_gpu: number;
  per_gpu_bidir: number;
  per_gpu_dir: number;
  total_bidir: number;
  chip_bidir: number;
  tray_bits_dir: number;
};

export function nvlinkDomain(sid: SystemId = "gb200-nvl72"): NvlinkDomain {
  const s = system(sid);
  const g = gpu(s.gpu);
  const gpus = num(s, "gpus");
  const chips = num(s, "switch_trays") * num(s, "switch_chips_per_tray");
  const links = gpus * g.nvlink_links;
  const ports = chips * num(s, "ports_per_switch_chip");
  const perGpu = g.nvlink_links * num(s, "link_bidir");
  return {
    chips,
    links,
    ports,
    links_per_chip_per_gpu: links / (chips * gpus),
    per_gpu_bidir: perGpu,
    per_gpu_dir: perDir(perGpu),
    total_bidir: gpus * perGpu,
    chip_bidir: num(s, "ports_per_switch_chip") * num(s, "link_bidir"),
    tray_bits_dir:
      num(s, "switch_chips_per_tray") *
      num(s, "ports_per_switch_chip") *
      perDir(num(s, "link_bidir")) *
      8,
  };
}

export function xorshift32(x: number): number {
  x = (x ^ ((x << 13) >>> 0)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ ((x << 5) >>> 0)) >>> 0;
  return x >>> 0;
}

export function ringValues(n: number, seed = 7): number[][] {
  let x = seed;
  const out: number[][] = [];
  for (let g = 0; g < n; g++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) {
      x = xorshift32(x);
      row.push(x % 10);
    }
    out.push(row);
  }
  return out;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export type RingSend = {
  from: number;
  to: number;
  chunk: number;
  value: number;
};
export type RingStep = {
  s: number;
  phase: "start" | "reduce-scatter" | "all-gather";
  sends: RingSend[];
  values: number[][];
  count: number[][];
};
export type Ring = {
  n: number;
  input: number[][];
  total: number[];
  steps: RingStep[];
};

export function ringAllreduceSteps(n: number, seed = 7): Ring {
  const v = ringValues(n, seed);
  const cur = v.map((row) => row.slice());
  const total: number[] = [];
  for (let c = 0; c < n; c++) {
    let t = 0;
    for (let g = 0; g < n; g++) t += v[g]![c]!;
    total.push(t);
  }
  const cnt = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  const copy = (m: number[][]) => m.map((row) => row.slice());
  const steps: RingStep[] = [
    { s: 0, phase: "start", sends: [], values: copy(cur), count: copy(cnt) },
  ];
  for (let s = 0; s < n - 1; s++) {
    const sends: RingSend[] = [];
    for (let g = 0; g < n; g++) {
      const c = mod(g - s, n);
      sends.push({ from: g, to: (g + 1) % n, chunk: c, value: cur[g]![c]! });
    }
    const add = sends.map((m) => cnt[m.from]![m.chunk]!);
    sends.forEach((m, j) => {
      cur[m.to]![m.chunk] = cur[m.to]![m.chunk]! + m.value;
      cnt[m.to]![m.chunk] = cnt[m.to]![m.chunk]! + add[j]!;
    });
    steps.push({
      s: s + 1,
      phase: "reduce-scatter",
      sends,
      values: copy(cur),
      count: copy(cnt),
    });
  }
  for (let s = 0; s < n - 1; s++) {
    const sends: RingSend[] = [];
    for (let g = 0; g < n; g++) {
      const c = mod(g + 1 - s, n);
      sends.push({ from: g, to: (g + 1) % n, chunk: c, value: cur[g]![c]! });
    }
    for (const m of sends) {
      cur[m.to]![m.chunk] = m.value;
      cnt[m.to]![m.chunk] = n;
    }
    steps.push({
      s: n + s,
      phase: "all-gather",
      sends,
      values: copy(cur),
      count: copy(cnt),
    });
  }
  return { n, input: v, total, steps };
}

export type Algo = "ring" | "switch";

export function allreduceTime(
  n: number,
  size: number,
  bw: number,
  algo: Algo,
): number {
  if (algo === "ring") return (((2 * (n - 1)) / n) * size) / bw;
  return size / bw;
}

export type TpCompare = {
  size: number;
  n: number;
  nvlink_bw: number;
  nic_bw: number;
  t_nvlink: number;
  t_switch: number;
  t_nic: number;
  ratio: number;
};

export function tpCompare(sid: SystemId, size: number, n: number): TpCompare {
  const s = system(sid);
  const g = gpu(s.gpu);
  const nvl = perDir(g.nvlink_bidir);
  const nic = num(s, "nic_bps") / 8;
  const tNvl = allreduceTime(n, size, nvl, "ring");
  const tNic = allreduceTime(n, size, nic, "ring");
  return {
    size,
    n,
    nvlink_bw: nvl,
    nic_bw: nic,
    t_nvlink: tNvl,
    t_switch: allreduceTime(n, size, nvl, "switch"),
    t_nic: tNic,
    ratio: tNic / tNvl,
  };
}

export function alltoallTime(n: number, size: number, bw: number): number {
  return (((n - 1) / n) * size) / bw;
}

// ---------------------------------------------------------------------------
// Chapter 5: scale-out, fat trees
// ---------------------------------------------------------------------------

export type FatTree = {
  n: number;
  k: number;
  oversub: number;
  tiers: number;
  down: number;
  up: number;
  leaves: number;
  spines: number;
  cores: number;
  pods: number;
  switches: number;
  endpoint_links: number;
  switch_links: number;
  leaf_links: number;
  core_links: number;
  transceivers: number;
  per_gpu_transceivers: number;
  two_tier_max: number;
  three_tier_max: number | null;
  hops_worst: number;
};

export function fatTree(
  n: number,
  k: number,
  oversub = 1,
  endpointOptics = true,
): FatTree {
  const down = Math.floor((k * oversub) / (oversub + 1));
  const up = k - down;
  const twoMax = k * down;
  let leaves: number;
  let spines: number;
  let tiers: number;
  let cores: number;
  let pods: number;
  let lUp: number;
  let lCore: number;
  if (n <= twoMax) {
    leaves = Math.ceil(n / down);
    spines = Math.ceil((leaves * up) / k);
    tiers = 2;
    cores = 0;
    pods = 0;
    lUp = leaves * up;
    lCore = 0;
  } else {
    const podLeaves = Math.floor(k / 2);
    const perPod = podLeaves * down;
    pods = Math.ceil(n / perPod);
    leaves = Math.ceil(n / down);
    const aggs = pods * Math.floor(k / 2);
    spines = aggs;
    cores = Math.ceil((aggs * Math.floor(k / 2)) / k);
    tiers = 3;
    lUp = leaves * up;
    lCore = aggs * Math.floor(k / 2);
  }
  const switchLinks = lUp + lCore;
  const switches = leaves + spines + cores;
  const transceivers = 2 * switchLinks + (endpointOptics ? 2 * n : 0);
  return {
    n,
    k,
    oversub,
    tiers,
    down,
    up,
    leaves,
    spines,
    cores,
    pods,
    switches,
    endpoint_links: n,
    switch_links: switchLinks,
    leaf_links: lUp,
    core_links: lCore,
    transceivers,
    per_gpu_transceivers: transceivers / n,
    two_tier_max: twoMax,
    three_tier_max: oversub === 1 ? Math.floor((k * k * k) / 4) : null,
    hops_worst: 2 * tiers,
  };
}

export type OpticsPower = { w: number; total_w: number; per_gpu_w: number };

export function opticsPower(tree: FatTree, w: number): OpticsPower {
  const total = tree.transceivers * w;
  return { w, total_w: total, per_gpu_w: total / tree.n };
}

export type TreeStepKey =
  | "gpus"
  | "leaves"
  | "spines"
  | "cores"
  | "route-local"
  | "route-far";
export type TreeStep = {
  i: number;
  key: TreeStepKey;
  label: string;
  switches: number;
  links: number;
  transceivers: number;
  add_switches: number;
  add_links: number;
};

export function treeSteps(n: number, k: number, oversub = 1): TreeStep[] {
  const t = fatTree(n, k, oversub);
  const out: TreeStep[] = [];
  const acc = { switches: 0, links: 0, transceivers: 0 };
  const push = (key: TreeStepKey, label: string, sw: number, links: number) => {
    acc.switches += sw;
    acc.links += links;
    acc.transceivers += 2 * links;
    out.push({
      i: out.length,
      key,
      label,
      switches: acc.switches,
      links: acc.links,
      transceivers: acc.transceivers,
      add_switches: sw,
      add_links: links,
    });
  };
  push("gpus", `${n} GPU network ports`, 0, 0);
  push(
    "leaves",
    `${t.leaves} leaf switches, ${t.down} ports down each`,
    t.leaves,
    t.endpoint_links,
  );
  push(
    "spines",
    `${t.spines} ${t.tiers === 2 ? "spine" : "aggregation"} switches, ${t.up} links up from each leaf`,
    t.spines,
    t.leaf_links,
  );
  if (t.tiers === 3)
    push(
      "cores",
      `${t.cores} core switches over ${t.pods} pods`,
      t.cores,
      t.core_links,
    );
  push("route-local", "same leaf: GPU, leaf, GPU (2 links)", 0, 0);
  push(
    "route-far",
    `different leaves: up to the top and back (${2 * t.tiers} links)`,
    0,
    0,
  );
  return out;
}

export type RailAligned = {
  sus: number;
  gpus: number;
  leaves: number;
  spines: number;
  cores: number;
  leaf_down: number;
  leaf_up: number;
  spine_down: number;
  spine_up: number;
  leaf_ports_used: number;
  spine_ports_used: number;
};

export function railAligned(sus: number): RailAligned {
  const gb = system("gb200-nvl72");
  const trays = num(gb, "compute_trays");
  const racks = rule("systems_per_su");
  const rails = rule("rails");
  const spg = rule("spines_per_slg");
  const k = rule("radix");
  const leaves = sus * racks * rails;
  const spines = sus * rails * spg;
  const leafDown = trays;
  const leafUp = trays;
  const spineDown = Math.floor((rule("leaves_per_slg") * leafUp) / spg);
  const spineUp = spineDown;
  const cores = sus > 1 ? Math.ceil((spines * spineUp) / k) : 0;
  return {
    sus,
    gpus: sus * racks * num(gb, "gpus"),
    leaves,
    spines,
    cores,
    leaf_down: leafDown,
    leaf_up: leafUp,
    spine_down: spineDown,
    spine_up: spineUp,
    leaf_ports_used: leafDown + leafUp,
    spine_ports_used: spineDown + spineUp,
  };
}

// ---------------------------------------------------------------------------
// Validation band
// ---------------------------------------------------------------------------

export type Check = {
  id: string;
  what: string;
  model: number;
  published: number;
  src: string;
  note?: string;
  ratio: number;
};

// ---------------------------------------------------------------------------
// Records for chapters 6-11
// ---------------------------------------------------------------------------

export type FacilityRecord = {
  id: string;
  name: string;
  avail: Field;
  fields: Record<string, Field>;
};
export type OtherRecord = FacilityRecord;
export type FacilityId = "power" | "cooling";
export type OtherId =
  | "tpu-v5p"
  | "tpu-7x"
  | "helios"
  | "trn2-ultra"
  | "trn3-ultra";

export const FACILITY_RECORDS = data.facility as unknown as FacilityRecord[];
export const OTHER_RECORDS = data.others as unknown as OtherRecord[];
export const OTHER_ORDER = OTHER_RECORDS.map((o) => o.id as OtherId);
export const PHYS = data.phys as unknown as {
  shomate: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    T: number;
    molar_mass_g: number;
  };
  fields: Record<string, Field<number>>;
};
export const LLAMA3_RUN = data.llama3Run as unknown as Record<
  string,
  Field<number>
>;
export const COST_ILLUSTRATIVE = data.cost as unknown as Record<
  string,
  Field<number>
>;
export const SMOOTH_LOW = data.smoothLow;
export const BUSBAR_CASES = data.busbarCases as [number, number][];
export const LOOP_STEPS = data.loopSteps;
export const LOOP_PARCELS = data.loopParcels;
export const SEGMENTS = data.segments as Segment[];
export const HOURS_PER_YEAR = data.hoursPerYear;

export type Flat = {
  id: string;
  name: string;
  avail: Avail;
  [k: string]: number | string | null;
};

function flatten(r: FacilityRecord): Flat {
  const out: Record<string, number | string | null> = {
    id: r.id,
    name: r.name,
    avail: r.avail.v,
  };
  for (const [k, f] of Object.entries(r.fields)) out[k] = f.v;
  return out as Flat;
}

/** A facility record's values (power, cooling), flattened. */
export function facility(fid: FacilityId): Flat {
  const r = FACILITY_RECORDS.find((x) => x.id === fid);
  if (!r) throw new Error(`unknown facility record ${fid}`);
  return flatten(r);
}

/** Another vendor's design (chapter 10), flattened. */
export function other(oid: OtherId): Flat {
  const r = OTHER_RECORDS.find((x) => x.id === oid);
  if (!r) throw new Error(`unknown design ${oid}`);
  return flatten(r);
}

const fnum = (r: Flat, k: string): number => {
  const v = r[k];
  if (typeof v !== "number") throw new Error(`${r.id}.${k} is not a number`);
  return v;
};

// ---------------------------------------------------------------------------
// Chapter 6: power
// ---------------------------------------------------------------------------

export type PowerChain = {
  shelves: number;
  psus: number;
  installed_w: number;
  usable_w: number;
  input_w: number;
  rack_w: number;
  margin: number;
  per_gpu_w: number;
  dc_v: number;
  busbar_a: number;
};

export function powerChain(sid: SystemId = "gb200-nvl72"): PowerChain {
  const s = system(sid);
  const psus = num(s, "power_shelves") * num(s, "psus_per_shelf");
  const installed = psus * num(s, "psu_w");
  const usable = installed / 2; // N+N: either half of the supplies carries the rack
  return {
    shelves: num(s, "power_shelves"),
    psus,
    installed_w: installed,
    usable_w: usable,
    input_w: num(s, "power_shelves") * num(s, "shelf_input_w"),
    rack_w: num(s, "rack_power_w"),
    margin: usable / num(s, "rack_power_w"),
    per_gpu_w: num(s, "rack_power_w") / num(s, "gpus"),
    dc_v: num(s, "dc_volts"),
    busbar_a: num(s, "rack_power_w") / num(s, "dc_volts"),
  };
}

export type Busbar = {
  p_w: number;
  volts: number;
  amps: number;
  loss_rel: number;
  copper_kg: number;
};

/** Bus current; I²R loss in the same conductor relative to 54 V; copper at the same current density as 1 MW at 54 V. */
export function busbar(pW: number, volts: number): Busbar {
  const p = facility("power");
  const amps = pW / volts;
  const r = fnum(p, "busbar_v") / volts;
  const refAmps = fnum(p, "mw_rack_w") / fnum(p, "busbar_v");
  return {
    p_w: pW,
    volts,
    amps,
    loss_rel: r * r,
    copper_kg: (fnum(p, "copper_1mw_kg") * amps) / refAmps,
  };
}

export type Smoothing = {
  p_hi: number;
  p_lo: number;
  t_hi: number;
  t_lo: number;
  e_store: number;
  p_avg: number;
  grid_hi: number;
  grid_lo: number;
  used_j: number;
  peak_cut: number;
  swing: number;
  raw_swing: number;
  store_use: number;
};

/**
 * A load alternating p_hi for t_hi and p_lo for t_lo, with e_store joules
 * of storage: the grid's draw is held flat through the high phase as long
 * as the store lasts, and the store is refilled in the low phase.
 */
export function smoothing(
  pHi: number,
  pLo: number,
  tHi: number,
  tLo: number,
  eStore: number,
): Smoothing {
  const period = tHi + tLo;
  const pAvg = (pHi * tHi + pLo * tLo) / period;
  const level = Math.max(pAvg, pHi - eStore / tHi);
  const used = (pHi - level) * tHi;
  const low = pLo + used / tLo;
  return {
    p_hi: pHi,
    p_lo: pLo,
    t_hi: tHi,
    t_lo: tLo,
    e_store: eStore,
    p_avg: pAvg,
    grid_hi: level,
    grid_lo: low,
    used_j: used,
    peak_cut: (pHi - level) / pHi,
    swing: level - low,
    raw_swing: pHi - pLo,
    store_use: eStore > 0 ? used / eStore : 0.0,
  };
}

export function rackSmoothing(
  halfPeriod: number,
  jPerGpu: number,
  sid: SystemId = "gb200-nvl72",
): Smoothing {
  const s = system(sid);
  const pHi = num(s, "rack_power_w");
  return smoothing(
    pHi,
    SMOOTH_LOW * pHi,
    halfPeriod,
    halfPeriod,
    jPerGpu * num(s, "gpus"),
  );
}

export type SmoothStep = {
  i: number;
  t: number;
  phase: "high" | "low";
  load: number;
  grid: number;
  stored: number;
};

export function smoothingSteps(
  sm: Smoothing,
  periods = 2,
  perPhase = 6,
): SmoothStep[] {
  let stored = sm.e_store;
  let t = 0.0;
  const out: SmoothStep[] = [
    { i: 0, t, phase: "high", load: sm.p_hi, grid: sm.grid_hi, stored },
  ];
  let i = 0;
  for (let k = 0; k < periods; k++) {
    for (const phase of ["high", "low"] as const) {
      const dt = (phase === "high" ? sm.t_hi : sm.t_lo) / perPhase;
      for (let j = 0; j < perPhase; j++) {
        i += 1;
        t = t + dt;
        if (phase === "high") {
          stored = stored - (sm.p_hi - sm.grid_hi) * dt;
          out.push({ i, t, phase, load: sm.p_hi, grid: sm.grid_hi, stored });
        } else {
          stored = stored + (sm.grid_lo - sm.p_lo) * dt;
          out.push({ i, t, phase, load: sm.p_lo, grid: sm.grid_lo, stored });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chapter 7: cooling
// ---------------------------------------------------------------------------

export const CFM_PER_M3S = 60 / (0.3048 * 0.3048 * 0.3048);

/** Specific heat of liquid water at 298.15 K, J/(kg K), from NIST's Shomate equation. */
export function waterCp(): number {
  const c = PHYS.shomate;
  const t = c.T / 1000;
  const cpMol = c.A + c.B * t + c.C * t * t + c.D * t * t * t + c.E / (t * t);
  return (cpMol / c.molar_mass_g) * 1000;
}

/** Specific heat of air at constant pressure, J/(kg K): gamma R / (gamma - 1). */
export function airCp(): number {
  const f = PHYS.fields;
  const g = f["air_gamma"]!.v;
  return (g * f["air_r"]!.v) / (g - 1);
}

export type HeatFlow = {
  q_w: number;
  water_kg_s: number;
  water_l_min: number;
  air_m3_s: number;
  air_cfm: number;
  vol_ratio: number;
};

export function heatFlow(
  qW: number,
  dtLiquid: number,
  dtAir: number,
): HeatFlow {
  const f = PHYS.fields;
  const cw = waterCp();
  const ca = airCp();
  const kgS = qW / (cw * dtLiquid);
  const lS = kgS / f["water_kg_per_l"]!.v;
  const airM3s = qW / (f["air_density"]!.v * ca * dtAir);
  return {
    q_w: qW,
    water_kg_s: kgS,
    water_l_min: lS * 60,
    air_m3_s: airM3s,
    air_cfm: airM3s * CFM_PER_M3S,
    vol_ratio: airM3s / (lS / 1000),
  };
}

export type CoolingLoop = {
  q_w: number;
  q_liquid: number;
  q_air: number;
  t_fac: number;
  t_fac_ret: number;
  t_sup: number;
  t_ret: number;
  kg_s: number;
  l_min: number;
  per_tray_kg_s: number;
  racks_per_cdu: number;
};

export function coolingLoop(
  qW: number,
  liquidFrac: number,
  tFac: number,
  dt: number,
  sid: SystemId = "gb200-nvl72",
): CoolingLoop {
  const s = system(sid);
  const c = facility("cooling");
  const qLiq = qW * liquidFrac;
  const tSup = tFac + fnum(c, "cdu_approach_k");
  const tRet = tSup + dt;
  const kgS = qLiq / (waterCp() * dt);
  return {
    q_w: qW,
    q_liquid: qLiq,
    q_air: qW - qLiq,
    t_fac: tFac,
    t_fac_ret: tFac + dt,
    t_sup: tSup,
    t_ret: tRet,
    kg_s: kgS,
    l_min: (kgS / PHYS.fields["water_kg_per_l"]!.v) * 60,
    per_tray_kg_s: kgS / num(s, "compute_trays"),
    racks_per_cdu: Math.floor(fnum(c, "cdu_w") / qLiq),
  };
}

export type Segment = "supply" | "cold plates" | "return" | "CDU";
export type Parcel = { k: number; seg: Segment; temp: number };
export type LoopStep = { i: number; parcels: Parcel[] };

export function loopTemp(loop: CoolingLoop, k: number): number {
  const q = LOOP_STEPS / 4;
  const seg = Math.floor(k / q);
  const x = (k % q) / q;
  if (seg === 0) return loop.t_sup;
  if (seg === 1) return loop.t_sup + (loop.t_ret - loop.t_sup) * x;
  if (seg === 2) return loop.t_ret;
  return loop.t_ret - (loop.t_ret - loop.t_sup) * x;
}

export function loopSteps(loop: CoolingLoop): LoopStep[] {
  const gap = Math.floor(LOOP_STEPS / LOOP_PARCELS);
  const q = LOOP_STEPS / 4;
  const out: LoopStep[] = [];
  for (let i = 0; i < LOOP_STEPS; i++) {
    const parcels: Parcel[] = [];
    for (let j = 0; j < LOOP_PARCELS; j++) {
      const k = (i + j * gap) % LOOP_STEPS;
      parcels.push({
        k,
        seg: SEGMENTS[Math.floor(k / q)]!,
        temp: loopTemp(loop, k),
      });
    }
    out.push({ i, parcels });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chapter 9: training clusters
// ---------------------------------------------------------------------------

/** Unexpected interruptions per GPU-hour in the Llama 3 run. */
export function failureRate(): number {
  const r = LLAMA3_RUN;
  return r["unexpected"]!.v / (r["gpus"]!.v * r["days"]!.v * 24);
}

export type Checkpoint = {
  gpus: number;
  save_s: number;
  mtbf_s: number;
  per_day: number;
  tau_s: number;
  waste: number;
};

/** Young (1974): interval sqrt(2 save M); time lost save / tau + tau / (2 M). */
export function checkpoint(nGpus: number, saveS: number): Checkpoint {
  const lam = failureRate() / 3600;
  const mtbf = 1 / (lam * nGpus);
  const tau = Math.sqrt(2 * saveS * mtbf);
  return {
    gpus: nGpus,
    save_s: saveS,
    mtbf_s: mtbf,
    per_day: 86400 / mtbf,
    tau_s: tau,
    waste: saveS / tau + tau / (2 * mtbf),
  };
}

export function layoutRank(
  d: number,
  p: number,
  t: number,
  pp: number,
  tp: number,
): number {
  return (d * pp + p) * tp + t;
}

export type Layout = {
  tp: number;
  pp: number;
  dp: number;
  gpus: number;
  domain: number;
  domains: number;
  tp_groups: number;
  tp_inside: number;
  pp_hops: number;
  pp_net: number;
  dp_groups: number;
  dp_net: number;
};

export function trainingLayout(
  tp: number,
  pp: number,
  dp: number,
  domain = 72,
): Layout {
  const n = tp * pp * dp;
  const dom = (r: number) => Math.floor(r / domain);
  let tpIn = 0;
  for (let d = 0; d < dp; d++)
    for (let p = 0; p < pp; p++) {
      const racks = new Set<number>();
      for (let t = 0; t < tp; t++) racks.add(dom(layoutRank(d, p, t, pp, tp)));
      tpIn += racks.size === 1 ? 1 : 0;
    }
  let ppNet = 0;
  for (let d = 0; d < dp; d++)
    for (let p = 0; p < pp - 1; p++) {
      let cross = false;
      for (let t = 0; t < tp; t++)
        if (
          dom(layoutRank(d, p, t, pp, tp)) !==
          dom(layoutRank(d, p + 1, t, pp, tp))
        )
          cross = true;
      ppNet += cross ? 1 : 0;
    }
  let dpNet = 0;
  for (let p = 0; p < pp; p++)
    for (let t = 0; t < tp; t++) {
      const racks = new Set<number>();
      for (let d = 0; d < dp; d++) racks.add(dom(layoutRank(d, p, t, pp, tp)));
      dpNet += racks.size > 1 ? 1 : 0;
    }
  return {
    tp,
    pp,
    dp,
    gpus: n,
    domain,
    domains: Math.floor((n + domain - 1) / domain),
    tp_groups: dp * pp,
    tp_inside: tpIn,
    pp_hops: dp * (pp - 1),
    pp_net: ppNet,
    dp_groups: pp * tp,
    dp_net: dpNet,
  };
}

export type LayoutStep = {
  i: number;
  d: number;
  p: number;
  first: number;
  last: number;
  domain: number;
  split: boolean;
  link: "nvlink" | "net" | null;
};

export function layoutSteps(
  tp: number,
  pp: number,
  dp: number,
  domain = 72,
): LayoutStep[] {
  const out: LayoutStep[] = [];
  const dom = (r: number) => Math.floor(r / domain);
  let i = 0;
  for (let d = 0; d < dp; d++)
    for (let p = 0; p < pp; p++) {
      const ranks: number[] = [];
      for (let t = 0; t < tp; t++) ranks.push(layoutRank(d, p, t, pp, tp));
      let link: LayoutStep["link"] = null;
      if (p > 0) {
        let cross = false;
        for (let t = 0; t < tp; t++)
          if (dom(layoutRank(d, p - 1, t, pp, tp)) !== dom(ranks[t]!))
            cross = true;
        link = cross ? "net" : "nvlink";
      }
      out.push({
        i,
        d,
        p,
        first: ranks[0]!,
        last: ranks[tp - 1]!,
        domain: dom(ranks[0]!),
        split: dom(ranks[0]!) !== dom(ranks[tp - 1]!),
        link,
      });
      i += 1;
    }
  return out;
}

// ---------------------------------------------------------------------------
// Chapter 10: other designs (a torus against a switch)
// ---------------------------------------------------------------------------

export type Torus = {
  k: number;
  n: number;
  nodes: number;
  links_per_node: number;
  mean_hops: number;
  diameter: number;
  bisection_links: number;
};

export function torus(k: number, n = 3): Torus {
  const nodes = Math.pow(k, n);
  const ringSum = Math.floor((k * k) / 4);
  const total = n * Math.pow(k, n - 1) * ringSum;
  return {
    k,
    n,
    nodes,
    links_per_node: 2 * n,
    mean_hops: total / (nodes - 1),
    diameter: n * Math.floor(k / 2),
    bisection_links: 2 * Math.pow(k, n - 1),
  };
}

/** The hop distance of node idx from node 0 (wrap-around in every dimension). */
export function torusDistance(idx: number, k: number, n = 3): number {
  let d = 0;
  let x = idx;
  for (let i = 0; i < n; i++) {
    const c = x % k;
    d += Math.min(c, k - c);
    x = Math.floor(x / k);
  }
  return d;
}

export function torusShells(k: number, n = 3): number[] {
  const counts = new Array<number>(n * Math.floor(k / 2) + 1).fill(0);
  for (let idx = 0; idx < Math.pow(k, n); idx++)
    counts[torusDistance(idx, k, n)]! += 1;
  return counts;
}

export type TorusStep = { d: number; new: number; reached: number };

export function torusSteps(k: number, n = 3): TorusStep[] {
  const shells = torusShells(k, n);
  let reached = 0;
  return shells.map((c, d) => {
    reached += c;
    return { d, new: c, reached };
  });
}

export function a2aTorus(
  k: number,
  n: number,
  size: number,
  linkDir: number,
): number {
  const t = torus(k, n);
  return (t.nodes * size) / (4 * t.bisection_links * linkDir);
}

export type TpuCompare = {
  size: number;
  cube: number;
  link_dir: number;
  chip_dir: number;
  t_torus: number;
  t_nvl72: number;
  nvl_dir: number;
};

export function tpuCompare(size: number): TpuCompare {
  const o = other("tpu-v5p");
  const t = torus(4, 3);
  const linkDir = fnum(o, "scaleup_bidir") / t.links_per_node / 2;
  const nvl = perDir(gpu("b200").nvlink_bidir);
  return {
    size,
    cube: t.nodes,
    link_dir: linkDir,
    chip_dir: perDir(fnum(o, "scaleup_bidir")),
    t_torus: a2aTorus(4, 3, size, linkDir),
    t_nvl72: alltoallTime(72, size, nvl),
    nvl_dir: nvl,
  };
}

/** Stated scale-up bandwidth per chip (both directions), or the stated total over the chips. */
export function scaleupPerChip(oid: OtherId): number | null {
  const o = other(oid);
  const per = o["scaleup_bidir"];
  if (per !== undefined && per !== null) return per as number;
  const tot = o["scaleup_total"];
  if (tot !== undefined && tot !== null)
    return (tot as number) / fnum(o, "chips");
  return null;
}

// ---------------------------------------------------------------------------
// Chapter 11: cost (every price illustrative)
// ---------------------------------------------------------------------------

export type Tco = {
  capex_yr: number;
  energy_usd_yr: number;
  energy_kwh_yr: number;
  tokens_yr: number;
  usd_per_mtok: number;
  capex_share: number;
  tok_s_per_mw: number;
};

export function tco(
  capex: number,
  years: number,
  rackW: number,
  pue: number,
  usdPerKwh: number,
  tokS: number,
  util: number,
): Tco {
  const energyKwh = (rackW / 1000) * pue * HOURS_PER_YEAR;
  const energyUsd = energyKwh * usdPerKwh;
  const capexYr = capex / years;
  const tokensYr = tokS * util * HOURS_PER_YEAR * 3600;
  const total = capexYr + energyUsd;
  return {
    capex_yr: capexYr,
    energy_usd_yr: energyUsd,
    energy_kwh_yr: energyKwh,
    tokens_yr: tokensYr,
    usd_per_mtok: (total / tokensYr) * 1e6,
    capex_share: capexYr / total,
    tok_s_per_mw: (tokS * util) / ((rackW * pue) / 1e6),
  };
}

export type TcoStep = {
  q: number;
  capex: number;
  energy: number;
  tokens: number;
  usd_per_mtok: number | null;
};

export function tcoSteps(
  capex: number,
  years: number,
  rackW: number,
  pue: number,
  usdPerKwh: number,
  tokS: number,
  util: number,
): TcoStep[] {
  const c = tco(capex, years, rackW, pue, usdPerKwh, tokS, util);
  const out: TcoStep[] = [];
  for (let q = 0; q < years * 4 + 1; q++) {
    const f = q / 4;
    const cap = c.capex_yr * f;
    const en = c.energy_usd_yr * f;
    const tok = c.tokens_yr * f;
    out.push({
      q,
      capex: cap,
      energy: en,
      tokens: tok,
      usd_per_mtok: q > 0 ? ((cap + en) / tok) * 1e6 : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation band
// ---------------------------------------------------------------------------

export function validation(): Check[] {
  const s = system("gb200-nvl72");
  const d = nvlinkDomain("gb200-nvl72");
  const vr = system("vr-nvl72");
  const rows: Omit<Check, "ratio">[] = [
    {
      id: "nvl72-nvlink-total",
      what: "GB200 NVL72 total NVLink bandwidth (B/s)",
      model: d.total_bidir,
      published: num(s, "nvlink_total"),
      src: "gb200-page",
    },
    {
      id: "nvl72-links-ports",
      what: "NVLink links from 72 GPUs = switch ports in 18 chips",
      model: d.links,
      published: d.ports,
      src: "dgx-gb200-guide",
    },
    {
      id: "nvl72-tray-bits",
      what: "NVLink switch tray, full-duplex (bit/s per direction)",
      model: d.tray_bits_dir,
      published: num(s, "tray_tbps_dir"),
      src: "dgx-gb200-guide",
    },
    {
      id: "nvl72-hbm-bw",
      what: "GB200 NVL72 total HBM bandwidth (B/s)",
      model: num(s, "gpus") * gpu("b200").hbm_bw,
      published: num(s, "hbm_bw_total"),
      src: "gb200-page",
    },
    {
      id: "nvl72-hbm",
      what: "GB200 NVL72 total HBM (B)",
      model: num(s, "gpus") * gpu("b200").hbm_bytes,
      published: num(s, "hbm_total"),
      src: "gb200-page",
    },
    {
      id: "vr-hbm-bw",
      what: "Vera Rubin NVL72 total HBM bandwidth (B/s)",
      model: 72 * gpu("rubin").hbm_bw,
      published: num(vr, "hbm_bw_total"),
      src: "vr-page",
    },
    {
      id: "vr-nvlink-total",
      what: "Vera Rubin NVL72 total NVLink bandwidth (B/s)",
      model: 72 * gpu("rubin").nvlink_bidir,
      published: num(vr, "nvlink_total"),
      src: "vr-page",
    },
    {
      id: "dgx-b200-nvlink",
      what: "DGX B200 aggregate NVLink (B/s)",
      model: 8 * gpu("b200").nvlink_bidir,
      published: num(system("dgx-b200"), "nvlink_total"),
      src: "dgx-b200-page",
    },
    {
      id: "q3450-two-tier",
      what: "two-tier non-blocking fat tree of 144-port switches (endpoints)",
      model: fatTree(10000, 144).two_tier_max,
      published: 10000,
      src: "photonics-page",
      note: "published as 'over 10,000 GPUs'",
    },
  ];
  const h = other("helios");
  const t2 = other("trn2-ultra");
  const t3 = other("trn3-ultra");
  rows.push(
    {
      id: "helios-hbm",
      what: "AMD Helios total HBM (B): 72 x per-GPU",
      model: fnum(h, "chips") * fnum(h, "hbm_bytes"),
      published: fnum(h, "hbm_total"),
      src: "helios-blog",
    },
    {
      id: "helios-hbm-bw",
      what: "AMD Helios total HBM bandwidth (B/s): 72 x per-GPU",
      model: fnum(h, "chips") * fnum(h, "hbm_bw"),
      published: fnum(h, "hbm_bw_total"),
      src: "helios-blog",
    },
    {
      id: "trn2-fp8",
      what: "Trn2 UltraServer FP8 (FLOP/s): 4 x a 16-chip instance",
      model:
        Math.floor(fnum(t2, "chips") / fnum(t2, "instance_chips")) *
        fnum(t2, "instance_fp8"),
      published: fnum(t2, "fp8_total"),
      src: "trn2-page",
    },
    {
      id: "trn2-hbm-bw",
      what: "Trn2 UltraServer HBM bandwidth (B/s): 4 x a 16-chip instance",
      model:
        Math.floor(fnum(t2, "chips") / fnum(t2, "instance_chips")) *
        fnum(t2, "instance_hbm_bw"),
      published: fnum(t2, "hbm_bw_total"),
      src: "trn2-page",
    },
    {
      id: "trn3-hbm",
      what: "Trainium3 UltraServer HBM (B): 144 x per-chip",
      model: fnum(t3, "chips") * fnum(t3, "hbm_bytes"),
      published: fnum(t3, "hbm_total"),
      src: "trainium-page",
    },
    {
      id: "trn3-hbm-bw",
      what: "Trainium3 UltraServer HBM bandwidth (B/s): 144 x per-chip",
      model: fnum(t3, "chips") * fnum(t3, "hbm_bw"),
      published: fnum(t3, "hbm_bw_total"),
      src: "trainium-page",
    },
  );
  const names = { leaf: "leaves", spine: "spines", core: "cores" } as const;
  for (const row of SUPERPOD_TABLE3) {
    const m = railAligned(row.sus);
    for (const key of ["leaf", "spine", "core"] as const)
      rows.push({
        id: `superpod-${row.sus}su-${key}`,
        what: `SuperPOD ${row.gpus} GPUs: ${key} switches`,
        model: m[names[key]],
        published: row[key],
        src: "superpod-network",
      });
  }
  return rows.map((r) => ({ ...r, ratio: r.model / r.published }));
}
