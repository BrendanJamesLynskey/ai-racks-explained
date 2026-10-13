/**
 * Chapters 6-11: every caption branch, the new formats, and the values the
 * chapters quote (spot checks against the recorded model and simulator).
 */
import { describe, expect, it } from "vitest";

import fx from "../fixtures/rack_fixtures.json";

import { fmtJoules, fmtTemp, fmtTokens, fmtUsd } from "@/lib/format";
import {
  disaggCaption,
  layoutCaption,
  loopCaption,
  smoothCaption,
  tcoCaption,
  torusCaption,
} from "@/lib/racks/captions";
import {
  coolingLoop,
  facility,
  layoutSteps,
  loopSteps,
  other,
  rackSmoothing,
  scaleupPerChip,
  smoothingSteps,
  tcoSteps,
  torus,
  torusSteps,
  trainingLayout,
} from "@/lib/racks/model";
import { costInputs, formatValue, lookup } from "@/lib/racks/values";

describe("formats", () => {
  it("prints temperatures, dollars, joules and token counts", () => {
    expect(fmtTemp(40)).toBe("40 °C");
    expect(fmtUsd(3.5e6)).toBe("$3.5M");
    expect(fmtUsd(126230.4)).toBe("$126k");
    expect(fmtUsd(2.158)).toBe("$2.16");
    expect(fmtJoules(4680)).toBe("4.68 kJ");
    expect(fmtJoules(65)).toBe("65 J");
    expect(fmtJoules(2e6)).toBe("2 MJ");
    expect(fmtTokens(4.64e11)).toBe("464 billion");
    expect(fmtTokens(2e12)).toBe("2 trillion");
    expect(fmtTokens(3e6)).toBe("3 million");
    expect(fmtTokens(500)).toBe("500");
  });
  it("formats values by kind", () => {
    expect(formatValue(lookup("loop.t30.d10.t_sup"), "temp")).toBe("35 °C");
    expect(formatValue(lookup("tco.base.usd_per_mtok"), "usd")).toMatch(/^\$/);
    expect(formatValue(lookup("smooth.mid.gb300.used_j"), "joules")).toBe(
      "4.68 kJ",
    );
    expect(formatValue(lookup("tco.base.tokens_yr"), "tokens")).toMatch(
      /trillion$/,
    );
  });
});

describe("values the chapters quote", () => {
  it("power: the DGX guide's shelves and NVIDIA's storage figure", () => {
    expect(lookup("pow.installed_w")).toBe(264e3);
    expect(lookup("pow.busbar_a")).toBe(2400);
    expect(lookup("bus.w1000k_v54.copper_kg")).toBe(200);
    expect(lookup("smooth.fast.gb300.peak_cut")).toBe(0.25);
    expect(lookup("smooth.fast.gb300.swing")).toBe(0);
    expect(lookup("fac.power.storage_j_per_gpu")).toBe(65);
  });
  it("cooling: heat balance and the CDU", () => {
    expect(lookup("loop.t30.d10.racks_per_cdu")).toBe(18);
    expect(Math.round(lookup("phys.water_cp") as number)).toBe(4184);
    expect(lookup("phys.air_cp")).toBeCloseTo(1001, 9);
  });
  it("disaggregation: the recorded runs and their shape", () => {
    const ttft = (s: string) =>
      lookup(`dis.${s}.nvlink.b200.ttft_p99`) as number;
    expect(ttft("6-12")).toBeGreaterThan(lookup("dis.meta.ttft_slo") as number);
    expect(ttft("12-6")).toBeLessThan(ttft("9-9"));
    const tpot = (s: string) =>
      lookup(`dis.${s}.nvlink.b200.tpot_p99`) as number;
    expect(tpot("14-4")).toBeGreaterThan(tpot("12-6"));
    expect(lookup("dis.12-6.nvlink.ctx-decode.slo")).toBeLessThan(0.5);
    expect(lookup("dis.12-6.nvlink.b200.slo")).toBe(1);
    expect(lookup("dis.meta.kv_per_token")).toBe(327680);
    expect(lookup("dis.link.eth100.kv_time")).toBeGreaterThan(
      lookup("dis.link.ib.kv_time") as number,
    );
  });
  it("training, other designs and cost", () => {
    expect(lookup("lay.l8x16x128.d8.pp_net")).toBe(1920);
    expect(lookup("lay.l8x16x128.d72.domains")).toBe(228);
    expect(lookup("ckpt.n16384.s60.per_day")).toBeCloseTo(419 / 54, 9);
    expect(lookup("torus.k4.shell_max")).toBe(20);
    expect(lookup("tpu.64MB.link_dir")).toBe(100e9);
    expect(lookup("other.trn2-ultra.scaleup_per_chip")).toBe("not disclosed");
    expect(scaleupPerChip("helios")).toBe(260e12 / 72);
    expect(other("helios").avail).toBe("planned");
    expect(costInputs()).toEqual(fx.costInputs);
    expect(lookup("cost.hours")).toBe(8766);
  });
  it("names unknown records", () => {
    expect(() => facility("nope" as "power")).toThrow(/unknown facility/);
    expect(() => other("nope" as "helios")).toThrow(/unknown design/);
    expect(() => lookup("dis.12-6.nvlink.nope")).toThrow();
  });
});

describe("captions", () => {
  it("power: the store supplying, refilling, idle, and absent", () => {
    const sm = rackSmoothing(0.25, 65);
    const st = smoothingSteps(sm);
    expect(smoothCaption(sm, st[1]!, st.length)).toMatch(/store supplies/);
    expect(smoothCaption(sm, st[8]!, st.length)).toMatch(/refills/);
    const flat = rackSmoothing(0.05, 65);
    const fs = smoothingSteps(flat);
    expect(smoothCaption(flat, fs[1]!, fs.length)).toMatch(/store supplies/);
    const none = rackSmoothing(1, 0);
    const ns = smoothingSteps(none);
    expect(smoothCaption(none, ns[3]!, ns.length)).toMatch(/no store/);
    expect(smoothCaption(none, ns[3]!, ns.length)).not.toMatch(
      /store supplies|refills/,
    );
  });
  it("cooling: every segment of the loop", () => {
    const loop = coolingLoop(120e3, 0.9, 30, 10);
    const steps = loopSteps(loop);
    const seen = new Set<string>();
    for (const s of steps) {
      const c = loopCaption(loop, s, steps.length);
      seen.add(c.split(" at ")[0]!.split("is ")[1]!);
    }
    expect(seen.size).toBe(4);
  });
  it("disaggregation", () => {
    expect(
      disaggCaption(
        3,
        10,
        0.75,
        {
          waiting: 1,
          prefill: 2,
          handoff: 3,
          decode_queue: 4,
          decode: 5,
          done: 6,
        },
        1500,
      ),
    ).toBe(
      "Frame 4 of 10, t = 0.75 s: 1 waiting for prefill, 2 in prefill, 3 handing their KV cache over, 4 queued for decode, 5 decoding; 6 of 1,500 done.",
    );
  });
  it("training: first stage, NVLink, network, split groups, the summary", () => {
    for (const [tp, pp, dp, dom] of [
      [8, 4, 4, 72],
      [8, 4, 4, 8],
      [4, 2, 2, 72],
    ] as const) {
      const l = trainingLayout(tp, pp, dp, dom);
      const steps = layoutSteps(tp, pp, dp, dom);
      const caps = steps.map((s) => layoutCaption(l, s, steps.length));
      expect(caps[0]).toMatch(/first stage/);
      expect(caps[caps.length - 1]).toMatch(/In all:/);
      if (dom === 8) expect(caps.join(" ")).toMatch(/over the network/);
      if (dom === 72 && tp === 4) expect(caps.join(" ")).toMatch(/over NVLink/);
    }
    // a 128-GPU job on 72-GPU racks splits a group across two racks
    const l = trainingLayout(8, 4, 4, 72);
    const steps = layoutSteps(8, 4, 4, 72);
    expect(
      steps.some((s) => /split across/.test(layoutCaption(l, s, steps.length))),
    ).toBe(false);
    const odd = trainingLayout(4, 4, 4, 72);
    const os = layoutSteps(4, 4, 4, 72);
    expect(os.some((s) => s.split)).toBe(false);
    void odd;
    const big = layoutSteps(8, 2, 9, 12).find((s) => s.split)!;
    expect(layoutCaption(trainingLayout(8, 2, 9, 12), big, 18)).toMatch(
      /split across NVLink domains/,
    );
  });
  it("torus: the source, a shell, the farthest", () => {
    const t = torus(4);
    const s = torusSteps(4);
    expect(torusCaption(s[0]!, t.nodes, 6)).toMatch(/source chip/);
    expect(torusCaption(s[2]!, t.nodes, 6)).toMatch(/15 more chips/);
    expect(torusCaption(s[6]!, t.nodes, 6)).toMatch(
      /1 more chip reached.*6 hops away/,
    );
  });
  it("cost: before and after the first quarter", () => {
    const ci = costInputs();
    const st = tcoSteps(3.5e6, ci.years, ci.rack_w, ci.pue, 0.1, ci.tok_s, 0.7);
    expect(tcoCaption(st[0]!, st.length)).toMatch(/nothing written off/);
    expect(tcoCaption(st[4]!, st.length)).toMatch(
      /Quarter 4 of 16: \$875k written off/,
    );
  });
});
