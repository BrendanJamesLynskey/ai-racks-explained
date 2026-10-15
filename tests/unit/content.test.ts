/**
 * The chapters' MDX: every ```ts block is cut from the file the chapter
 * names (whitespace-collapsed, because Prettier reformats MDX code blocks);
 * every CUDA block is labelled as not compiled here; every equation
 * compiles in KaTeX; internal links point at real pages; deck links point
 * at the owner's NVIDIA GPU and InfSim decks with a slide anchor; links to
 * the companion sites name real chapters.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import katex from "katex";
import { describe, expect, it } from "vitest";

import { SECTIONS } from "@/lib/mdx/sections";

const ROOT = path.join(__dirname, "../..");
const DIR = path.join(ROOT, "content/chapters");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".mdx"));
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** The companion sites' chapter slugs this site links to (checked by hand, 2026-10-13). */
const SISTER_SLUGS: Record<string, string[]> = {
  "gpu-kernels-explained": [
    "01-memory-hierarchy",
    "02-roofline",
    "08-reductions",
  ],
  "systolic-arrays-explained": ["07-the-tpu"],
  "ai-accelerators-explained": ["10-choosing"],
  "transformer-training-explained": [
    "10-memory",
    "11-data-parallelism",
    "12-model-parallelism",
    "13-slow-links",
    "15-running-a-real-job",
  ],
  "llm-inference-explained": [
    "02-kv-cache",
    "03-roofline",
    "09-parallelism",
    "11-why-disaggregate",
    "12-moving-the-kv-cache",
    "13-live-simulator",
  ],
  "inference-tradeoffs-explained": [
    "04-disaggregation",
    "05-heterogeneous-and-optical-pools",
    "06-kv-handoff-and-compression",
    "11-power-and-energy",
    "12-hardware-and-cost",
  ],
};

describe("chapter files", () => {
  it("there is one per section, in order", () => {
    expect(FILES.sort()).toEqual(SECTIONS.map((s) => `${s.slug}.mdx`));
  });
});

for (const f of FILES) {
  const src = readFileSync(path.join(DIR, f), "utf8");
  describe(f, () => {
    it("opens with its animation (the hero comes before any prose)", () => {
      expect(src.trimStart()).toMatch(/^<[A-Z][a-zA-Z]+Widget>/);
    });

    it("cuts every TypeScript block from the model or engine source", () => {
      const model = squash(
        ["model.ts", "disagg.ts"]
          .map((f) => readFileSync(path.join(ROOT, "src/lib/racks", f), "utf8"))
          .join("\n"),
      );
      const blocks = [...src.matchAll(/```ts\n([\s\S]*?)```/g)].map(
        (m) => m[1]!,
      );
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) expect(model, b).toContain(squash(b));
    });

    it("links the companion sites' chapters by their real slugs", () => {
      for (const m of src.matchAll(
        /https:\/\/([a-z-]+)\.vercel\.app\/(learn|training)\/([a-z0-9-]+)/g,
      )) {
        const known = SISTER_SLUGS[m[1]!];
        expect(known, m[0]).toBeDefined();
        expect(known, m[0]).toContain(m[3]);
      }
    });

    it("compiles every animation equation", () => {
      for (const m of src.matchAll(/tex="([^"]+)"/g)) {
        expect(() =>
          katex.renderToString(m[1]!, {
            displayMode: true,
            throwOnError: true,
            strict: "ignore",
            trust: (ctx) => ctx.command === "\\htmlClass",
          }),
        ).not.toThrow();
      }
    });

    it("links only to real pages and to deck slides", () => {
      const slugs = new Set<string>(SECTIONS.map((s) => s.slug));
      for (const m of src.matchAll(/\]\((\/[^)]+)\)/g)) {
        const href = m[1]!;
        if (href.startsWith("/learn/"))
          expect(slugs.has(href.slice(7)), href).toBe(true);
        else
          expect(["/specs", "/about", "/learn"]).toContain(href.split("#")[0]);
      }
      for (const m of src.matchAll(
        /https:\/\/brendanjameslynskey\.github\.io\/([A-Za-z0-9_]+)\/(#slide-\d\d)?/g,
      )) {
        expect(m[1], m[0]).toMatch(/^(NVIDIA_GPU|InfSim)_\d\d_/);
        expect(m[2], m[0]).toBeDefined();
      }
    });
  });
}
