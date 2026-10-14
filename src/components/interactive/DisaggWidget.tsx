"use client";

/**
 * Chapter 8's hero, the site's centrepiece: one rack serving with prefill
 * and decode in separate pools. Every change of split, KV link or part
 * re-runs Disaggregated_Inference_Sim's own engine (vendored, bit-exact with
 * its Python package) in a Web Worker on 1,500 recorded requests; each frame
 * is `countsAt(requests, t)`, the stage every request is in at time t, and
 * the chart beneath stacks those counts frame by frame.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Hatch } from "@/components/interactive/Hatch";
import { loadRows, simulate } from "@/components/interactive/sim/runner";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtTime, pct, trim } from "@/lib/format";
import { disaggCaption } from "@/lib/racks/captions";
import {
  DISAGG,
  configFor,
  countsAt,
  frameCount,
  runKey,
  type Counts,
  type LinkKey,
  type Part,
  type Run,
  type RunKey,
  type Split,
} from "@/lib/racks/disagg";
import { LINK_COLOUR, MUTED, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const H = 250;
const POOL_Y = 24;
const BOX = 32;
const CH_Y0 = 124;
const CH_Y1 = 220;
const X0 = 34;
const X1 = 352;

/** Stage colours: compute for prefill, HBM for decode, the link for the hand-off. */
const STAGE_FILL = (link: LinkKey): Record<keyof Counts, string> => ({
  waiting: "url(#dis-hatch)",
  prefill: STATE_COLOUR.compute,
  handoff: link === "nvlink" ? LINK_COLOUR.nvlink : LINK_COLOUR.net,
  decode_queue: "url(#dis-hatch)",
  decode: LINK_COLOUR.hbm,
  done: MUTED.light,
});
const DRAWN: (keyof Counts)[] = [
  "decode",
  "decode_queue",
  "handoff",
  "prefill",
  "waiting",
];
const LABEL: Record<keyof Counts, string> = {
  waiting: "waiting",
  prefill: "prefill",
  handoff: "KV hand-off",
  decode_queue: "decode queue",
  decode: "decoding",
  done: "done",
};

export default function DisaggWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [split, setSplit] = useState<Split>("12-6");
  const [link, setLink] = useState<LinkKey>("nvlink");
  const [part, setPart] = useState<Part>("gb200");
  const [hover, setHover] = useState<string | null>(null);
  const [run, setRun] = useState<{ key: RunKey; run: Run } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const key = runKey(split, link, part);
  const busy = !run || run.key !== key;

  useEffect(() => {
    let live = true;
    setError(null);
    loadRows()
      .then((rows) => simulate(rows, configFor(key)))
      .then((r) => {
        if (live) setRun({ key, run: r });
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [key]);

  const reqs = useMemo(() => run?.run.reqs ?? [], [run]);
  const n = run ? frameCount(reqs) : 1;
  const frames = useMemo(
    () =>
      run
        ? Array.from({ length: n }, (_, f) =>
            countsAt(reqs, f * DISAGG.frameDt),
          )
        : [],
    [run, reqs, n],
  );
  const st = useStepper(n, { stepMs: 110, resetKey: run?.key ?? "none" });
  const k = st.step;
  const c = frames[k];
  const t = k * DISAGG.frameDt;
  const shown = run?.key ?? key;
  const [sp, lk, pt] = shown.split(".") as [Split, LinkKey, Part];
  const [np, nd] = sp.split("-").map(Number) as [number, number];
  const fill = STAGE_FILL(lk);
  const peak = useMemo(
    () =>
      Math.max(
        1,
        ...frames.map(
          (x) => x.waiting + x.prefill + x.handoff + x.decode_queue + x.decode,
        ),
      ),
    [frames],
  );
  const bw = (X1 - X0) / Math.max(1, n);
  const yv = (v: number) => CH_Y1 - ((CH_Y1 - CH_Y0) * v) / peak;
  const sum = run?.run.summary;
  const active =
    c === undefined
      ? "prefill handoff decode"
      : (["prefill", "handoff", "decode"] as const)
          .filter((s) => c[s] > 0)
          .join(" ");

  const box = (i: number) => {
    const row = Math.floor(i / 9);
    const col = i % 9;
    return { x: 12 + col * (BOX + 6), y: POOL_Y + row * (BOX + 8) };
  };

  const visual = (
    <div className="mx-auto max-w-md" data-sim={busy ? "running" : "ready"}>
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`One rack as ${np} prefill and ${nd} decode instances; requests by stage over time, frame ${k + 1} of ${n}.`}
      >
        <defs>
          <Hatch id="dis-hatch" />
        </defs>
        <text
          x={12}
          y={14}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          {DISAGG.gpus} GPUs = {DISAGG.instances} instances of {DISAGG.tp}: {np}{" "}
          prefill, {nd} decode
        </text>
        {Array.from({ length: DISAGG.instances }, (_, i) => {
          const b = box(i);
          const isP = i < np;
          const ctx =
            (isP && pt === "ctx-prefill") || (!isP && pt === "ctx-decode");
          return (
            <g key={i} data-instance={isP ? "prefill" : "decode"}>
              <rect
                x={b.x}
                y={b.y}
                width={BOX}
                height={BOX}
                rx={4}
                fill={isP ? STATE_COLOUR.compute : LINK_COLOUR.hbm}
                fillOpacity={0.75}
                stroke="#404040"
                strokeDasharray={ctx ? "3 2" : undefined}
                strokeWidth={ctx ? 2 : 1}
              />
              <text
                x={b.x + BOX / 2}
                y={b.y + BOX / 2 + 4}
                textAnchor="middle"
                style={{ fontSize: fs(10) }}
                className="fill-neutral-900 font-mono"
              >
                {isP ? "P" : "D"}
                {ctx ? "*" : ""}
              </text>
            </g>
          );
        })}
        {/* stage occupancy over time, revealed up to the current frame */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={X0}
              x2={X1}
              y1={yv(f * peak)}
              y2={yv(f * peak)}
              stroke={MUTED.light}
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={X0 - 4}
              y={yv(f * peak) + 3.5}
              textAnchor="end"
              style={{ fontSize: fs(9) }}
              className="fill-neutral-600 font-mono dark:fill-neutral-400"
            >
              {Math.round(f * peak)}
            </text>
          </g>
        ))}
        {frames.slice(0, k + 1).map((x, f) => {
          let base = 0;
          return (
            <g key={f}>
              {DRAWN.map((s) => {
                const v = x[s];
                const y0 = yv(base);
                base += v;
                return v > 0 ? (
                  <rect
                    key={s}
                    x={X0 + f * bw}
                    y={yv(base)}
                    width={Math.max(bw, 0.6)}
                    height={y0 - yv(base)}
                    fill={fill[s]}
                  />
                ) : null;
              })}
            </g>
          );
        })}
        <line
          x1={X0 + (k + 0.5) * bw}
          x2={X0 + (k + 0.5) * bw}
          y1={CH_Y0 - 4}
          y2={CH_Y1}
          stroke={STATE_COLOUR.active}
          strokeWidth={1}
        />
        <text
          x={X0}
          y={CH_Y1 + fs(12)}
          style={{ fontSize: fs(9) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          0 s
        </text>
        <text
          x={X1}
          y={CH_Y1 + fs(12)}
          textAnchor="end"
          style={{ fontSize: fs(9) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          {trim((n - 1) * DISAGG.frameDt, 3)} s
        </text>
        <text
          x={X0}
          y={CH_Y0 - 8}
          style={{ fontSize: fs(9) }}
          className="fill-neutral-600 dark:fill-neutral-400"
        >
          requests in the rack, by stage
        </text>
      </svg>
      <p
        className="mt-1 text-xs text-neutral-700 dark:text-neutral-300"
        data-handoff={c ? c.handoff : 0}
      >
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-1 w-5 align-middle"
          style={{ backgroundColor: fill.handoff }}
        />
        KV caches in flight now: {c ? c.handoff : 0}, over{" "}
        {DISAGG.links[lk].name}.
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-neutral-700 dark:text-neutral-300">
        {(["prefill", "handoff", "decode", "waiting"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <svg width={12} height={12} aria-hidden="true">
              <defs>
                <Hatch id={`dis-key-${s}`} />
              </defs>
              <rect
                width={12}
                height={12}
                fill={s === "waiting" ? `url(#dis-key-${s})` : fill[s]}
              />
            </svg>
            {s === "waiting" ? "waiting or queued (hatched)" : LABEL[s]}
          </li>
        ))}
        <li>P* / D*: the illustrative context-optimised part</li>
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
          The simulation failed: {error}
        </p>
      )}
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="TTFT p99"
        value={sum ? fmtTime(sum.ttft_p99) : "…"}
        hint={`SLO ${fmtTime(DISAGG.ttftSlo)}`}
      />
      <Stat
        label="TPOT p50 / p99"
        value={
          sum ? `${fmtTime(sum.tpot_p50)} / ${fmtTime(sum.tpot_p99)}` : "…"
        }
        hint={`SLO ${fmtTime(DISAGG.tpotSlo)}`}
      />
      <Stat
        label="Met both SLOs"
        value={sum ? pct(sum.slo, 1) : "…"}
        hint={sum ? `KV hand-off ${fmtTime(sum.handoff_mean)} mean` : ""}
      />
      <Stat
        label="Energy"
        value={sum ? `${trim(sum.j_per_tok, 3)} J/token` : "…"}
        hint={
          sum
            ? `${trim(sum.tok_s_per_mw / 1e3, 3)}k tokens/s per MW (GPU power)`
            : ""
        }
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="disagg-widget"
      title="Prefill and decode pools in one rack"
      summary={`Disaggregated_Inference_Sim's own engine (commit ${DISAGG.commit.slice(0, 7)}), run in your browser on ${DISAGG.n.toLocaleString("en-GB")} requests arriving at ${DISAGG.rate} a second: ${DISAGG.modelName} on the simulator's GB200 preset. Power coefficients and the context-optimised part are illustrative.`}
      stepper={st}
      stepLabel="frame"
      caption={
        c
          ? disaggCaption(k, n, t, c, DISAGG.n)
          : error
            ? "The simulation failed."
            : "Simulating the rack…"
      }
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? active}
      onEquationHover={setHover}
      params={
        <>
          <Segmented
            label="Prefill : decode instances"
            value={split}
            options={DISAGG.splits.map(([a, b]) => ({
              value: `${a}-${b}` as Split,
              label: `${a}:${b}`,
            }))}
            onChange={setSplit}
          />
          <Segmented
            label="KV hand-off over"
            value={link}
            options={[
              { value: "nvlink", label: "NVLink" },
              { value: "ib", label: "4×400G" },
              { value: "eth100", label: "100GbE" },
            ]}
            onChange={setLink}
          />
          <Segmented
            label="Context-optimised part in"
            value={part}
            options={[
              { value: "gb200", label: "neither" },
              { value: "ctx-prefill", label: "prefill" },
              { value: "ctx-decode", label: "decode" },
            ]}
            onChange={setPart}
          />
        </>
      }
    />
  );
}
