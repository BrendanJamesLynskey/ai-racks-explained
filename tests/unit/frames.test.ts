/**
 * Frame tests (visual standard §4): for key frames of every animation, the
 * state the site draws equals the Python reference's state for that frame
 * (from the fixtures), and the caption built from the reference's state is
 * the caption the site shows. tests/e2e/frames.spec.ts then checks the page.
 */
import { describe, expect, it } from "vitest";

import fx from "../fixtures/rack_fixtures.json";

import {
  fillCaption,
  ladderCaption,
  pipeCaption,
  ringCaption,
  treeCaption,
} from "@/lib/racks/captions";
import {
  fatTree,
  fillSteps,
  fit,
  gpu,
  ladder,
  model,
  packageOf,
  paths,
  pipeline,
  pipelineSteps,
  ringAllreduceSteps,
  treeSteps,
  type FillStep,
  type PipeStep,
  type Ring,
  type Rung,
  type TreeStep,
} from "@/lib/racks/model";

describe("chapter 1: ladder frames", () => {
  const ts = ladder();
  const py = fx.ladder as Rung[];
  for (const k of [0, 2, 3, 5])
    it(`rung ${k + 1}`, () => {
      expect(ts[k]).toEqual(py[k]);
      expect(ladderCaption(ts[k]!, 6, 1e9)).toBe(ladderCaption(py[k]!, 6, 1e9));
    });
  it("says what the frames show", () => {
    expect(ladderCaption(py[0]!, 6, 1e9)).toBe(
      "Rung 1 of 6, the package: one GPU of 2 dies and its HBM. Each GPU moves data over HBM at 8 TB/s, so 1 GB takes 125 µs. Rack power of these GPUs: 1.67 kW.",
    );
    expect(ladderCaption(py[3]!, 6, 1e9)).toContain(
      "That is 18 times less than the rung below.",
    );
    expect(ladderCaption(py[2]!, 6, 1e9)).toContain("72 GPUs in 18 trays");
  });
});

describe("chapter 2: package frames", () => {
  const c = fx.fill.find(
    (x) => x.gpu === "b300" && x.model === "llama3-405b" && x.fmt === "fp8",
  )!;
  const py = c.out as FillStep[];
  const ts = fillSteps("b300", "llama3-405b", "fp8");
  const f = fit("b300", "llama3-405b", "fp8");
  const pk = packageOf("b300");
  const cap = (s: FillStep) =>
    fillCaption(
      s,
      pk.stacks as number,
      pk.per_stack_bytes as number,
      f,
      gpu("b300").name,
      model("llama3-405b").name,
    );
  for (const k of [0, 3, 6, 8])
    it(`stack ${k}`, () => {
      expect(ts[k]).toEqual(py[k]);
      expect(cap(ts[k]!)).toBe(cap(py[k]!));
    });
  it("fills 202.5 GB as five full stacks and part of a sixth", () => {
    expect(py[6]!.full).toBe(5);
    expect(py[6]!.done).toBe(true);
    expect(cap(py[6]!)).toContain("Done: 70% of HBM holds weights.");
    expect(cap(py[3]!)).toBe("Stack 3 of 8: 108 GB placed, 94.5 GB to go.");
  });
});

describe("chapter 3: path frames", () => {
  const hops = paths().grace.hops;
  const c = fx.pipelineSteps.find((x) => x.path === "grace" && x.chunks === 8)!;
  const py = c.out as PipeStep[];
  const ts = pipelineSteps(hops, 2e9, 8, 48);
  const p = pipeline(hops, 2e9, 8);
  for (const k of [0, 12, 30, 48])
    it(`frame ${k}`, () => {
      expect(ts[k]).toEqual(py[k]);
      expect(pipeCaption(hops, p, ts[k]!, 8)).toBe(
        pipeCaption(hops, p, py[k]!, 8),
      );
    });
  it("says what the frames show", () => {
    expect(pipeCaption(hops, p, py[48]!, 8)).toMatch(
      /^Done at .*: 2 GB delivered, 90% of the speed of NVLink-C2C alone\. The slowest link is NVLink-C2C at 450 GB\/s\.$/,
    );
    expect(py[12]!.busy).toEqual([true, true, false]);
  });
});

describe("chapter 4: ring frames", () => {
  const c = fx.ring.find((x) => x.n === 4 && x.seed === 7)!;
  const py = c.out as Ring;
  const ts = ringAllreduceSteps(4, 7);
  for (const k of [0, 1, 3, 6])
    it(`step ${k}`, () => {
      expect(ts.steps[k]).toEqual(py.steps[k]);
      expect(ringCaption(ts, k)).toBe(ringCaption(py, k));
    });
  it("says what the frames show", () => {
    expect(ringCaption(py, 3)).toContain(
      "Each GPU now owns one complete chunk of the sum.",
    );
    expect(ringCaption(py, 6)).toContain(
      `Every GPU now holds the full sum: ${py.total.join(", ")}.`,
    );
    expect(py.steps[3]!.count[0]![1]).toBe(4);
  });
});

describe("chapter 5: fabric frames", () => {
  const c = fx.treeSteps.find(
    (x) => x.n === 9216 && x.k === 64 && x.oversub === 1,
  )!;
  const py = c.out as TreeStep[];
  const ts = treeSteps(9216, 64, 1);
  const t = fatTree(9216, 64, 1);
  for (const k of [0, 1, 3, 5])
    it(`step ${k + 1}`, () => {
      expect(ts[k]).toEqual(py[k]);
      expect(treeCaption(t, ts[k]!, ts.length)).toBe(
        treeCaption(t, py[k]!, py.length),
      );
    });
  it("says what the frames show", () => {
    expect(treeCaption(t, py[3]!, 6)).toBe(
      "Step 4 of 6: 144 core switches over 9 pods. So far: 720 switches, 27,648 links, 55,296 transceivers.",
    );
    expect(treeCaption(t, py[5]!, 6)).toContain(
      "Total 720 switches and 55,296 transceivers, 6 per GPU.",
    );
  });
});
