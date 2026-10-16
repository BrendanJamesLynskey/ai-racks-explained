/**
 * /about: what the site is, what the model computes and what it leaves
 * out, how hardware figures are sourced, the checks against published figures, and how the
 * animations are driven and checked. Server Component, static.
 */
import Link from "next/link";

import { ValidationTable } from "@/components/mdx/Tables";
import { DISAGG } from "@/lib/racks/disagg";
import { ACCESSED, validation } from "@/lib/racks/model";
import { formatValue, lookup } from "@/lib/racks/values";
import { pct } from "@/lib/format";
import {
  AUTHOR,
  GITHUB_URL,
  INFERENCE_URL,
  KERNELS_URL,
  NVIDIA_GPU_HUB,
  SILICON_URL,
  TRAINING_URL,
  repoFile,
} from "@/lib/site";
import { withShare } from "@/lib/share";

export const metadata = withShare("/about", {
  title: "About",
  description:
    "What AI Racks Explained's model computes, how every hardware figure is sourced and dated, its spec cross-checks, structural rules and a measured check against published figures, and how the animations are checked.",
});

const A =
  "focus-ring rounded text-accent underline underline-offset-2 dark:text-indigo-300";

export default function AboutPage(): JSX.Element {
  const rows = validation().filter((r) => r.kind !== "measured");
  const lo = Math.min(...rows.map((r) => r.ratio));
  const hi = Math.max(...rows.map((r) => r.ratio));
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-accent dark:text-indigo-300">
        /about
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        About this site
      </h1>
      <div className="mdx-content mt-6">
        <p>
          AI Racks Explained shows the physical machines that train and serve
          large models, from one GPU package to a hall of racks, one rung per
          chapter, each around an animation. It sits in the companion
          sites&apos; Hardware track beside{" "}
          <a href={KERNELS_URL} className={A}>
            GPU Kernels Explained
          </a>{" "}
          and{" "}
          <a href={SILICON_URL} className={A}>
            Systolic Arrays Explained
          </a>
          , and builds on the{" "}
          <a href={`${TRAINING_URL}/training`} className={A}>
            Training
          </a>{" "}
          and{" "}
          <a href={INFERENCE_URL} className={A}>
            Serving
          </a>{" "}
          sites. Chapters link the matching slides of the{" "}
          <a href={NVIDIA_GPU_HUB} className={A}>
            NVIDIA GPU
          </a>{" "}
          series. NVIDIA&apos;s rack-scale systems are the main worked example
          because their specifications and reference designs are published in
          detail; chapter 10 covers other designs. Chapter 8, on disaggregated
          inference, runs a separate, tested simulator in the browser.
        </p>

        <h2>The model</h2>
        <p>
          <a href={repoFile("reference/rack_model.py")} className={A}>
            reference/rack_model.py
          </a>{" "}
          is a <strong>teaching model</strong>, not a simulator of any product.
          It computes the scale ladder (GPUs and bandwidth per GPU at each
          rung), what an HBM package holds and how fast it can be read, chunked
          store-and-forward transfers along a chain of links, the wiring and
          bandwidth of an NVLink domain, ring all-reduce on real numbers, and
          the switches, links and transceivers of fat-tree fabrics, including
          the rail-aligned rules of a published reference architecture. For
          chapters 6 to 11 it adds a rack&apos;s power shelves and bus currents,
          power smoothing with stored energy, the coolant loop from Q = ṁ c
          <sub>p</sub> ΔT, where a training job&apos;s traffic lands on NVLink
          domains, checkpoint intervals by Young&apos;s rule, hop counts and
          bisections of a torus, and cost per token.
        </p>
        <p>
          Chapter 8 does not use this model. It runs{" "}
          <a href={DISAGG.simulator} className={A}>
            Disaggregated_Inference_Sim
          </a>
          &apos;s own JavaScript engine, vendored byte for byte at commit{" "}
          <code>{DISAGG.commit.slice(0, 7)}</code>, in a Web Worker, on the
          simulator&apos;s GB200 preset (one GPU of a GB200 superchip, from
          NVIDIA&apos;s per-GPU figures; its section 28 compares it with the
          H100, H200 and B200 presets).{" "}
          <a href={repoFile("scripts/disagg_reference.py")} className={A}>
            scripts/disagg_reference.py
          </a>{" "}
          runs the simulator&apos;s Python package at the same commit on the
          same requests, and the unit tests require the browser engine to
          reproduce every request&apos;s timestamps bit for bit and every
          recorded summary the chapter quotes. The simulator&apos;s own
          validation against published serving results is section 22 of its{" "}
          <a
            href={`${DISAGG.simulator}/blob/${DISAGG.commit}/examples/results.md`}
            className={A}
          >
            results.md
          </a>
          .
        </p>
        <ul>
          <li>
            Every time is a bandwidth term: latency, protocol overhead,
            congestion and achieved-versus-peak efficiency are not modelled.
          </li>
          <li>
            NVIDIA quotes NVLink and NVLink-C2C bandwidth as the sum of both
            directions; the model works per direction (half) and says which it
            prints.
          </li>
          <li>
            Weights-only memory sizing ignores the KV cache, activations and the
            runtime; FP4 is counted at half a byte per weight, without its block
            scales.
          </li>
          <li>
            Optics power uses a watts-per-transceiver you choose: it is
            illustrative, because the sources used do not publish per-port
            power.
          </li>
          <li>
            Power smoothing assumes a square-wave load and a perfect store; the
            coolant loop takes an illustrative share of heat on cold plates and
            illustrative temperature rises; checkpoint intervals apply one
            published run&apos;s interruption rate to every job size; every
            price in the cost chapter is illustrative.
          </li>
        </ul>

        <h2>How hardware figures are sourced</h2>
        <p>
          Every figure is a field with a value, a status and a source, read on{" "}
          {ACCESSED} (
          <Link href="/specs" className={A}>
            the full list
          </Link>
          ). Vendor product pages, documentation, reference architectures and
          technical blogs come first; papers are checked by DOI or arXiv ID.
          Where the sources used do not give a figure, the site says &ldquo;not
          disclosed&rdquo; rather than estimating it. Products whose
          specifications the vendor marks preliminary, or gives a future date
          for, are labelled. Marketing claims (&ldquo;up to N×&rdquo;) are
          quoted and attributed, never used as model inputs.
        </p>

        <h2 id="validation">Spec cross-checks, rules and a measurement</h2>
        <p>
          The model is compared with published figures that it does not take as
          inputs, and each comparison is labelled by what it actually tests.
          Most are <strong>spec cross-checks</strong> (
          {formatValue(lookup("kinds.consistency"), "int")} of them): the
          model&apos;s arithmetic on a vendor&apos;s per-GPU or per-chip figures
          against the same vendor&apos;s rack or system total (rack NVLink and
          HBM totals, a switch tray&apos;s bandwidth, AMD&apos;s and AWS&apos;s
          system totals). They show that the specifications agree with each
          other and that the model reads them correctly; they do not show that
          it predicts performance. <strong>Rules</strong> (
          {formatValue(lookup("kinds.rule"), "int")}) test a structural rule the
          model applies: the NVL72 wiring (links equal switch ports), the size
          of a two-tier fat tree, and the leaf, spine and core switch counts of
          the published SuperPOD design, which the model derives from the
          rail-aligned rules rather than reading. Across these the model is
          between {lo.toFixed(4)} and {hi.toFixed(4)} of the published value.
          The largest gaps are rounding in the published figures: Vera Rubin
          NVL72&apos;s rack HBM bandwidth (
          {formatValue(lookup("val.vr-hbm-bw.published"), "rate")}) is{" "}
          {pct(1 / (lookup("val.vr-hbm-bw.ratio") as number) - 1, 1)} more than
          72 times its per-GPU figure, and &ldquo;over 10,000 GPUs&rdquo; for a
          two-tier fabric of 144-port switches is the model&apos;s{" "}
          {formatValue(lookup("val.q3450-two-tier.model"), "int")} rounded down.
        </p>
        <p>
          One row is a <strong>measurement</strong>: NCCL&apos;s in-switch
          (NVLS) all-reduce of large messages on an eight-GPU NVLink 4 node,{" "}
          {formatValue(lookup("val.nccl-nvls-h200.published"), "rate")} in a
          2026 study, against the model&apos;s in-switch bound of{" "}
          {formatValue(lookup("val.nccl-nvls-h200.model"), "rate")}: the bound
          is {formatValue(lookup("val.nccl-nvls-h200.ratio"), "num")} times what
          the software reaches. Chapter 4 also takes the latency term of its
          collectives from the same measurements. The rack simulator of chapter
          8 has its own validation against published serving results (above).
        </p>
        <ValidationTable />

        <h2>How it is checked</h2>
        <ul>
          <li>
            <strong>Reference tests.</strong>{" "}
            <a href={repoFile("tests/python/test_rack_model.py")} className={A}>
              tests/python/test_rack_model.py
            </a>{" "}
            checks every field has a known source and status, the ladder, the
            package and fit sums, the store-and-forward pipeline against its
            closed form, ring all-reduce ending with every GPU holding the sum,
            the fat-tree sizes against Al-Fares et al. (k³/4 hosts with 5k²/4
            switches), and the SuperPOD counts.
          </li>
          <li>
            <strong>Exact parity.</strong> The TypeScript port,{" "}
            <a href={repoFile("src/lib/racks/model.ts")} className={A}>
              src/lib/racks/model.ts
            </a>
            , repeats every function with the same operations in the same order;{" "}
            <a href={repoFile("scripts/make_fixtures.py")} className={A}>
              scripts/make_fixtures.py
            </a>{" "}
            writes the reference&apos;s results over every parameter the widgets
            offer, and the unit tests require the port to reproduce all of them
            exactly, with no tolerance. CI fails if the fixtures, the site data
            or{" "}
            <a href={repoFile("results.md")} className={A}>
              results.md
            </a>{" "}
            are out of date.
          </li>
          <li>
            <strong>Animations from the model.</strong> Every animation draws a
            sequence of states the model computes; a frame is a pure function of
            one state. The end-to-end tests set chosen frames of every animation
            and require the caption to match the caption built from the Python
            reference&apos;s state for that frame.
          </li>
          <li>
            <strong>Numbers in the prose</strong> are printed from the model
            when the page is built, not typed.
          </li>
        </ul>

        <h2>The animations</h2>
        <p>
          Every animation has play and pause, step back and forward, a scrub
          bar, speeds from 0.25× to 4× and reset; with the animation focused,
          Space plays or pauses and the arrow keys step. Each step has a
          one-line caption, also announced to screen readers. With{" "}
          <em>reduce motion</em> set in your system, nothing plays by itself.
          Animations pause when scrolled out of view. Colours come from Okabe
          and Ito&apos;s colour-blind-safe palette, the same in light and dark
          mode: HBM purple (as on every companion site), scale-up links (NVLink,
          NVLink-C2C) green, the scale-out network sky blue, PCIe orange, CPU
          memory yellow; waiting is always a hatched pattern as well as a
          warning colour.
        </p>

        <h2>Source</h2>
        <p>
          The code, the model and the tests are on{" "}
          <a href={GITHUB_URL} className={A}>
            GitHub
          </a>{" "}
          (MIT licence). The design system is copied from the companion sites;
          the README records where each piece came from.
        </p>
      </div>
      <p
        className="mt-12 text-sm text-neutral-600 dark:text-neutral-400"
        data-author-credit
      >
        Built by{" "}
        <a className={A} href={AUTHOR.url}>
          {AUTHOR.name}
        </a>
      </p>
    </main>
  );
}
