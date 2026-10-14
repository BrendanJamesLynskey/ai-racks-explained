/**
 * Chapter 8's engine: the vendored copy is byte for byte the simulator's
 * at the recorded commit, and on the rack's own configurations the engine
 * reproduces the Python package (scripts/disagg_reference.py) bit for bit:
 * every request's seven timestamps (SHA-256 of the doubles), the summary
 * and the stage counts the animation draws. Every recorded summary the
 * chapter quotes is re-run here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import fx from "../fixtures/disagg_parity.json";

import {
  DISAGG,
  STAMP_KEYS,
  configFor,
  countsAt,
  frameCount,
  laneSlice,
  recorded,
  register,
  engine,
  runKey,
  runRack,
  stageAt,
  type Row,
  type RunKey,
  type Split,
  type Stamps,
} from "@/lib/racks/disagg";

const ROOT = path.join(__dirname, "../..");
const VENDOR = path.join(ROOT, "src/lib/racks/vendor");
const vendored = JSON.parse(
  readFileSync(path.join(VENDOR, "VENDORED.json"), "utf8"),
) as {
  commit: string;
  files: { path: string; file: string; sha256: string }[];
};
const workload = JSON.parse(
  readFileSync(path.join(ROOT, "public/racks/disagg/workload.json"), "utf8"),
) as { commit: string; rows: Row[]; n: number };

function digest(reqs: Stamps[]): string {
  const h = createHash("sha256");
  const b = Buffer.alloc(8);
  for (const r of reqs)
    for (const k of STAMP_KEYS) {
      const v = r[k];
      if (v === null) b.writeBigUInt64LE(0x7ff8000000000000n);
      else b.writeDoubleLE(v);
      h.update(b);
    }
  return h.digest("hex");
}

describe("the vendored simulator", () => {
  it("is byte for byte the recorded commit's files", () => {
    for (const f of vendored.files) {
      const sha = createHash("sha256")
        .update(readFileSync(path.join(VENDOR, f.file)))
        .digest("hex");
      expect(sha, f.path).toBe(f.sha256);
    }
  });
  it("is the commit the data, the workload and the fixtures were made at", () => {
    expect(DISAGG.commit).toBe(vendored.commit);
    expect(workload.commit).toBe(vendored.commit);
    expect(fx.commit).toBe(vendored.commit);
    expect(workload.rows.length).toBe(DISAGG.n);
  });
  it("registers the rack's links and part once, idempotently", () => {
    register();
    register();
    expect(engine.LINKS["rack-nvlink"]).toEqual(DISAGG.links.nvlink);
    expect(engine.DEVICES["rack-ctx"]!["B"]).toBe(DISAGG.ctx.B);
    expect(engine.DEVICES["rack-ctx"]!["F"]).toBe(
      engine.DEVICES["gb200"]!["F"],
    );
  });
});

describe("parity with the Python package", () => {
  for (const c of fx.cases) {
    it(`${c.key}: every timestamp, the summary and the frames`, () => {
      expect(configFor(c.key as RunKey)).toEqual(c.cfg);
      const run = runRack(c.cfg, workload.rows);
      expect(digest(run.reqs)).toBe(c.stamps_sha256);
      expect(
        run.reqs.slice(0, 3).map((r) => STAMP_KEYS.map((k) => r[k])),
      ).toEqual(c.first);
      expect(run.summary).toEqual(c.summary);
      for (const f of c.frames)
        expect(countsAt(run.reqs, f.t)).toEqual(f.counts);
    });
  }

  it("every recorded configuration the chapter quotes re-runs to the same summary", () => {
    for (const [s, d] of DISAGG.splits.map((x) => [x, x] as const)) {
      void d;
      for (const l of DISAGG.linkOrder)
        for (const p of DISAGG.parts) {
          const k = runKey(`${s[0]}-${s[1]}` as Split, l, p);
          expect(runRack(configFor(k), workload.rows).summary, k).toEqual(
            recorded(k),
          );
        }
    }
  }, 180_000);
});

describe("frames", () => {
  const run = runRack(configFor("12-6.nvlink.gb200"), workload.rows);
  it("counts every arrived request once", () => {
    for (const t of [0, 1, 5, 20]) {
      const c = countsAt(run.reqs, t);
      const arrived = run.reqs.filter((r) => r.arrival <= t).length;
      expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(arrived);
    }
    expect(stageAt(run.reqs[0]!, -1)).toBeNull();
  });
  it("runs until the last request finishes, and draws lanes from the middle", () => {
    const n = frameCount(run.reqs);
    expect(countsAt(run.reqs, (n - 1) * DISAGG.frameDt).done).toBe(DISAGG.n);
    expect(countsAt(run.reqs, (n - 2) * DISAGG.frameDt).done).toBeLessThan(
      DISAGG.n,
    );
    const l = laneSlice(run.reqs);
    expect(l.start).toBe(500);
    expect(l.lanes.length).toBe(16);
  });
  it("names unknown configurations", () => {
    expect(() => configFor("1-1.nvlink.gb200" as RunKey)).toThrow(
      /no configuration/,
    );
  });
});
