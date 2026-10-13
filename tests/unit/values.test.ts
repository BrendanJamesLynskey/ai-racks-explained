/**
 * The numbers the chapters print: every <V of="…" /> path in the MDX
 * resolves in the model, the formatters behave, and the few numbers written
 * into the prose in words are recomputed here from the model.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  fmtBits,
  fmtBytes,
  fmtInt,
  fmtRate,
  fmtTime,
  fmtWatts,
  pct,
} from "@/lib/format";
import {
  HALL_W,
  SUPERPOD_RULES,
  fatTree,
  gpu,
  ladder,
  railAligned,
} from "@/lib/racks/model";
import { SIZE_LABELS, formatValue, lookup, type Fmt } from "@/lib/racks/values";

const DIR = path.join(__dirname, "../../content/chapters");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".mdx"));

describe("model values quoted in the chapters", () => {
  const uses: { file: string; of: string; fmt: string }[] = [];
  for (const f of FILES) {
    const src = readFileSync(path.join(DIR, f), "utf8");
    for (const m of src.matchAll(/<V of="([^"]+)"(?: fmt="([^"]+)")? \/>/g))
      uses.push({ file: f, of: m[1]!, fmt: m[2] ?? "num" });
  }
  it("are used in every chapter", () => {
    expect(uses.length).toBeGreaterThan(60);
    for (const f of FILES)
      expect(uses.filter((u) => u.file === f).length, f).toBeGreaterThan(5);
  });
  it("all resolve to a number or string", () => {
    for (const u of uses) {
      const v = lookup(u.of);
      expect(["number", "string"], `${u.file}: ${u.of}`).toContain(typeof v);
      expect(formatValue(v, u.fmt as Fmt).length).toBeGreaterThan(0);
    }
  });
  it("print what the sources state", () => {
    expect(formatValue(lookup("ladder.package.bw"), "rate")).toBe("8 TB/s");
    expect(formatValue(lookup("ladder.rack.bw"), "rate")).toBe("900 GB/s");
    expect(formatValue(lookup("ladder.su.bw"), "rate")).toBe("50 GB/s");
    expect(formatValue(lookup("ladder.su.drop"), "num")).toBe("18");
    expect(formatValue(lookup("sys.gb200-nvl72.nic_bps"), "bits")).toBe(
      "400 Gb/s",
    );
    expect(formatValue(lookup("sys.gb200-nvl72.rack_power_w"), "watts")).toBe(
      "120 kW",
    );
    expect(formatValue(lookup("ladder.hall.children"), "int")).toBe("833");
    expect(formatValue(lookup("pkg.b300.per_stack_bytes"), "bytes")).toBe(
      "36 GB",
    );
    expect(formatValue(lookup("nvl.tray_bits_dir"), "bits")).toBe("57.6 Tb/s");
    expect(lookup("tree.n9216.k64.o1.switches")).toBe(720);
    expect(lookup("tree.n9216.k144.o1.switches")).toBe(192);
    expect(lookup("rail.16.leaves")).toBe(512);
    expect(lookup("tp.n8.64MB.ratio")).toBe(18);
  });
  it("rejects bad paths", () => {
    expect(() => lookup("gpu.v100.hbm_bw")).toThrow();
    expect(() => lookup("ladder.rack.nope")).toThrow();
    expect(() => lookup("ladder.rack")).toThrow();
  });
});

describe("formatting", () => {
  it("formats every kind", () => {
    expect(formatValue(1.5e12, "rate")).toBe("1.5 TB/s");
    expect(formatValue(4e11, "bits")).toBe("400 Gb/s");
    expect(formatValue(2e9, "bytes")).toBe("2 GB");
    expect(formatValue(5e15, "flops")).toBe("5,000 TFLOP/s");
    expect(formatValue(0.0025, "time")).toBe("2.5 ms");
    expect(formatValue(1.2e5, "watts")).toBe("120 kW");
    expect(formatValue(0.375, "pct")).toBe("38%");
    expect(formatValue(65536, "int")).toBe("65,536");
    expect(formatValue(3.14159, "raw")).toBe("3.14159");
    expect(formatValue(3.14159, "num")).toBe("3.14");
    expect(formatValue("x", "num")).toBe("x");
  });
  it("covers the unit ranges", () => {
    expect(fmtBits(3e12)).toBe("3 Tb/s");
    expect(fmtBits(3e6)).toBe("3 Mb/s");
    expect(fmtBits(3)).toBe("3 b/s");
    expect(fmtWatts(1e8)).toBe("100 MW");
    expect(fmtWatts(500)).toBe("500 W");
    expect(fmtInt(1234.4)).toBe("1,234");
    expect(fmtBytes(5e3)).toBe("5 kB");
    expect(fmtRate(5e6)).toBe("5 MB/s");
    expect(fmtTime(2.5e-6)).toBe("2.5 µs");
    expect(fmtTime(2.5e-9)).toBe("2.5 ns");
    expect(pct(0.3751, 1)).toBe("37.5%");
  });
});

/**
 * Numbers the chapters state in words (not through <V />): each is
 * recomputed here from the model, so the prose cannot drift from it.
 */
describe("numbers written into the prose", () => {
  it("chapter 1: a 100 MW hall, and one gigabyte", () => {
    expect(HALL_W).toBe(100e6);
    expect(ladder()[0]!.time).toBe(1e9 / gpu("b200").hbm_bw);
  });
  it("chapter 2: 1,024-bit stacks, 10 TB/s between the dies", () => {
    // 16 x 512-bit controllers over 8 stacks; 10 x 512-bit over 5 stacks
    expect((16 * 512) / (gpu("b300").hbm_stacks as number)).toBe(1024);
    expect((10 * 512) / (gpu("h100").hbm_stacks as number)).toBe(1024);
    expect(gpu("b300").dies).toBe(2);
  });
  it("chapter 3: a 2 GB payload, 16 chunks", () => {
    expect(lookup("pipe.grace.c16.total")).toBeLessThan(
      lookup("pipe.grace.c1.total") as number,
    );
  });
  it("chapter 4: 64 MB over 8 GPUs; 72 x 18 = 18 x 72 = 1296; 50 GB/s per link direction", () => {
    expect(SIZE_LABELS["64MB"]).toBe(64e6);
    expect(lookup("nvl.links")).toBe(72 * 18);
    expect(lookup("nvl.ports")).toBe(18 * 72);
    expect((lookup("sys.gb200-nvl72.link_bidir") as number) / 2).toBe(50e9);
  });
  it("chapter 5: sizes, rails and hops", () => {
    expect(railAligned(16).gpus).toBe(9216);
    expect(railAligned(1).leaves).toBe(8 * 4);
    expect(SUPERPOD_RULES.spines_per_slg!.v).toBe(6);
    expect(fatTree(2048, 64).hops_worst).toBe(4);
    expect(fatTree(9216, 64).hops_worst).toBe(6);
    expect(fatTree(9216, 64).per_gpu_transceivers).toBe(6);
    expect(fatTree(9216, 144).per_gpu_transceivers).toBe(4);
    // 2:1: about two-thirds of a leaf's ports face GPUs
    const o = fatTree(9216, 64, 2);
    expect(o.down / o.k).toBeCloseTo(2 / 3, 1);
    // the generic tree of 64-port switches, 9,216 GPUs, versus rail-aligned
    const r = railAligned(16);
    expect(r.leaves + r.spines + r.cores).toBeGreaterThan(
      fatTree(9216, 64).switches,
    );
    expect(r.leaf_ports_used).toBe(36);
  });
});
