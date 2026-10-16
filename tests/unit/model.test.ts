/**
 * The TypeScript model against the Python reference's fixtures
 * (scripts/make_fixtures.py): every value exactly, no tolerance.
 */
import { describe, expect, it } from "vitest";

import fx from "../fixtures/rack_fixtures.json";
import { abCaption } from "@/lib/racks/captions";

import {
  GPU_ORDER,
  OTHER_ORDER,
  PATH_ORDER,
  a2aTorus,
  airCp,
  busbar,
  checkpoint,
  coolingLoop,
  facility,
  failureRate,
  heatFlow,
  layoutSteps,
  loopSteps,
  other,
  powerChain,
  rackSmoothing,
  scaleupPerChip,
  smoothingSteps,
  tco,
  tcoSteps,
  torus,
  torusShells,
  torusSteps,
  tpuCompare,
  trainingLayout,
  waterCp,
  allreduceTime,
  alltoallTime,
  fatTree,
  fillSteps,
  fit,
  gpu,
  ladder,
  nvlinkDomain,
  opticsPower,
  packageOf,
  paths,
  pipeline,
  pipelineSteps,
  railAligned,
  ringAllreduceSteps,
  ringValues,
  switchOf,
  system,
  tpCompare,
  treeSteps,
  validation,
  type Algo,
  type Fmt,
  type GpuId,
  type ModelId,
  type PathId,
  type SwitchId,
  type SystemId,
  abSweep,
  alphaOf,
  decodeAllreduce,
} from "@/lib/racks/model";

describe("records", () => {
  it("flattens every GPU, system and switch identically", () => {
    for (const g of GPU_ORDER)
      expect(gpu(g)).toEqual((fx.gpus as Record<string, unknown>)[g]);
    for (const s of Object.keys(fx.systems))
      expect(system(s as SystemId)).toEqual(
        (fx.systems as Record<string, unknown>)[s],
      );
    for (const w of Object.keys(fx.switches))
      expect(switchOf(w as SwitchId)).toEqual(
        (fx.switches as Record<string, unknown>)[w],
      );
  });
});

describe("chapter 1: the ladder", () => {
  it("builds the same rungs", () => {
    expect(ladder()).toEqual(fx.ladder);
    for (const c of fx.ladderHalls)
      expect(ladder("gb200-nvl72", c.payload, c.hall_w)).toEqual(c.out);
  });
});

describe("chapter 2: the package", () => {
  it("derives the same per-stack figures", () => {
    for (const g of GPU_ORDER)
      expect(packageOf(g)).toEqual((fx.package as Record<string, unknown>)[g]);
  });
  it("fits every model identically", () => {
    for (const c of fx.fit)
      expect(fit(c.gpu as GpuId, c.model as ModelId, c.fmt as Fmt)).toEqual(
        c.out,
      );
  });
  it("produces the same fill animation states", () => {
    for (const c of fx.fill)
      expect(
        fillSteps(c.gpu as GpuId, c.model as ModelId, c.fmt as Fmt),
      ).toEqual(c.out);
  });
  it("refuses a GPU whose stack count is not disclosed", () => {
    expect(() => fillSteps("rubin", "llama3-70b", "fp8")).toThrow();
  });
});

describe("chapter 3: paths", () => {
  const ps = paths();
  it("defines the same paths", () => {
    expect(ps).toEqual(fx.paths);
  });
  it("pipelines every payload identically", () => {
    for (const c of fx.pipeline)
      expect(pipeline(ps[c.path as PathId].hops, c.payload, c.chunks)).toEqual(
        c.out,
      );
  });
  it("produces the same animation frames", () => {
    for (const c of fx.pipelineSteps)
      expect(
        pipelineSteps(ps[c.path as PathId].hops, 2e9, c.chunks, 48),
      ).toEqual(c.out);
    expect(PATH_ORDER).toEqual(["rdma", "grace", "peer"]);
  });
});

describe("chapter 4: scale-up", () => {
  it("wires the NVLink domain identically", () => {
    expect(nvlinkDomain()).toEqual(fx.nvlinkDomain);
  });
  it("draws the same ring values and all-reduce steps", () => {
    for (const c of fx.ringValues)
      expect(ringValues(c.n, c.seed)).toEqual(c.out);
    for (const c of fx.ring)
      expect(ringAllreduceSteps(c.n, c.seed)).toEqual(c.out);
  });
  it("times collectives identically", () => {
    for (const c of fx.allreduce)
      expect(allreduceTime(c.n, c.size, c.bw, c.algo as Algo)).toBe(c.out);
    for (const c of fx.alltoall)
      expect(alltoallTime(c.n, c.size, c.bw)).toBe(c.out);
    for (const c of fx.tp)
      expect(tpCompare("gb200-nvl72", c.size, c.n)).toEqual(c.out);
  });
});

describe("chapter 5: scale-out", () => {
  it("sizes every fat tree identically", () => {
    for (const c of fx.fatTree)
      expect(fatTree(c.n, c.k, c.oversub, c.optics)).toEqual(c.out);
    for (const c of fx.opticsPower)
      expect(opticsPower(fatTree(c.n, c.k), c.w)).toEqual(c.out);
  });
  it("builds the trees in the same steps", () => {
    for (const c of fx.treeSteps)
      expect(treeSteps(c.n, c.k, c.oversub)).toEqual(c.out);
  });
  it("applies the rail-aligned rules identically", () => {
    fx.railAligned.forEach((row, i) => expect(railAligned(i + 1)).toEqual(row));
  });
});

describe("spec cross-checks, rules and the measured check", () => {
  it("computes the same checks", () => {
    expect(validation()).toEqual(fx.validation);
  });
  it("the cross-checks and rules stay within 2% below and 4% above every published figure", () => {
    for (const v of validation().filter((x) => x.kind !== "measured")) {
      expect(v.ratio, v.id).toBeGreaterThanOrEqual(0.98);
      expect(v.ratio, v.id).toBeLessThanOrEqual(1.04);
    }
  });
});

describe("chapters 6-11 (brief 31B)", () => {
  it("power: the rack's shelves, bus currents and smoothing", () => {
    for (const f of ["power", "cooling"] as const)
      expect(facility(f)).toEqual((fx.facility as Record<string, unknown>)[f]);
    expect(powerChain()).toEqual(fx.powerChain);
    for (const c of fx.busbar) expect(busbar(c.p, c.v)).toEqual(c.out);
    for (const c of fx.smoothing) {
      const m = rackSmoothing(c.half, c.j);
      expect(m).toEqual(c.out);
      expect(smoothingSteps(m)).toEqual(c.steps);
    }
  });

  it("cooling: heat balance, the loop and its frames", () => {
    expect(waterCp()).toBe(fx.waterCp);
    expect(airCp()).toBe(fx.airCp);
    for (const c of fx.heatFlow)
      expect(heatFlow(c.q, c.dl, c.da)).toEqual(c.out);
    for (const c of fx.coolingLoop)
      expect(coolingLoop(c.q, c.frac, c.tfac, c.dt)).toEqual(c.out);
    for (const c of fx.loopSteps)
      expect(loopSteps(coolingLoop(c.q, c.frac, c.tfac, c.dt))).toEqual(c.out);
  });

  it("training: failure rate, Young's interval, layouts and their frames", () => {
    expect(failureRate()).toBe(fx.failureRate);
    for (const c of fx.checkpoint)
      expect(checkpoint(c.n, c.save)).toEqual(c.out);
    for (const c of fx.layout)
      expect(trainingLayout(c.tp, c.pp, c.dp, c.domain)).toEqual(c.out);
    for (const c of fx.layoutSteps)
      expect(layoutSteps(c.tp, c.pp, c.dp, c.domain)).toEqual(c.out);
  });

  it("other designs: records, tori, the TPU comparison", () => {
    for (const o of OTHER_ORDER) {
      expect(other(o)).toEqual((fx.others as Record<string, unknown>)[o]);
      expect(scaleupPerChip(o)).toBe(
        (fx.scaleup as Record<string, number | null>)[o],
      );
    }
    for (const c of fx.torus) {
      expect(torus(c.k)).toEqual(c.out);
      expect(torusShells(c.k)).toEqual(c.shells);
      expect(torusSteps(c.k)).toEqual(c.steps);
    }
    for (const c of fx.tpuCompare) expect(tpuCompare(c.size)).toEqual(c);
    expect(a2aTorus(4, 3, 64e6, 100e9)).toBe(
      fx.tpuCompare.find((c) => c.size === 64e6)!.t_torus,
    );
  });

  it("cost: every grid point and the quarter-by-quarter frames", () => {
    const ci = fx.costInputs;
    for (const c of fx.tco)
      expect(
        tco(c.capex, ci.years, ci.rack_w, ci.pue, c.kwh, ci.tok_s, c.util),
      ).toEqual(c.out);
    for (const c of fx.tcoSteps)
      expect(
        tcoSteps(c.capex, ci.years, ci.rack_w, ci.pue, c.kwh, ci.tok_s, c.util),
      ).toEqual(c.out);
  });
});

describe("brief 42: the latency term and the measured check", () => {
  it("calibrates the same alphas and sweeps the same sizes", () => {
    expect({ ring: alphaOf("ring"), switch: alphaOf("switch") }).toEqual(
      fx.alpha,
    );
    for (const c of fx.ab as { gpu: GpuId; n: number; out: unknown }[])
      expect(abSweep(c.gpu, c.n)).toEqual(c.out);
    for (const c of fx.decodeAllreduce as {
      batch: number;
      n: number;
      gpu: GpuId;
      out: unknown;
    }[])
      expect(decodeAllreduce(c.batch, c.n, c.gpu)).toEqual(c.out);
  });

  it("a decode all-reduce is latency-bound; a gigabyte is bandwidth-bound", () => {
    const d = decodeAllreduce(8, 8);
    expect(d.ring.latShare).toBeGreaterThan(0.9);
    expect(d.ring.t / d.bwOnly).toBeGreaterThan(10);
    const big = abSweep("b200", 8).at(-1)!;
    expect(big.ring.latShare).toBeLessThan(0.01);
  });

  it("labels every check by what it tests, with one measurement", () => {
    const v = validation();
    expect(v.filter((x) => x.kind === "measured").map((x) => x.id)).toEqual([
      "nccl-nvls-h200",
    ]);
    const m = v.find((x) => x.id === "nccl-nvls-h200")!;
    // NCCL reaches about 60% of the in-switch bound
    expect(1 / m.ratio).toBeGreaterThan(0.55);
    expect(1 / m.ratio).toBeLessThan(0.7);
  });
});

describe("brief 42: the latency term's captions", () => {
  it("call a small all-reduce latency-bound and a large one bandwidth-bound", () => {
    const sw = abSweep("b200", 8);
    expect(abCaption(sw[0]!, 8, "B200")).toContain("latency-bound");
    expect(abCaption(sw[sw.length - 1]!, 8, "B200")).toContain(
      "bandwidth-bound",
    );
  });
});
