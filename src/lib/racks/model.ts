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
