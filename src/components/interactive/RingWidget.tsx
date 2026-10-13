"use client";

/**
 * Chapter 4's hero: ring all-reduce on real numbers. n GPUs sit in a ring,
 * each holding n chunks of a vector; in each step every GPU sends one chunk
 * to its neighbour (reduce-scatter adds, all-gather copies). A chunk's cell
 * fills as more GPUs' contributions are summed into it. Beside it, the same
 * all-reduce timed over NVLink and over the GPU's network port. Every frame
 * is a state of `ringAllreduceSteps`; the times are `tpCompare` (both checked
 * against the Python reference).
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBits, fmtBytes, fmtRate, fmtTime, trim } from "@/lib/format";
import { ringCaption } from "@/lib/racks/captions";
import { ringAllreduceSteps, tpCompare } from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const CX = W / 2;

export default function RingWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [nS, setN] = useState<string>("4");
  const [size, setSize] = useState<string>(String(64e6));
  const n = Number(nS);
  const z = Number(size);
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;

  const ring = useMemo(() => ringAllreduceSteps(n), [n]);
  const tp = useMemo(() => tpCompare("gb200-nvl72", z, n), [z, n]);
  const st = useStepper(ring.steps.length, {
    stepMs: 1300,
    smooth: true,
    resetKey: `${n}`,
  });
  const k = st.step;
  const s = ring.steps[k]!;
  const nextStep = ring.steps[k + 1];
  // between steps, the next step's chunks travel along the ring
  const travel = nextStep ? st.frac : 0;

  const R = n <= 4 ? 100 : n <= 6 ? 112 : 118;
  const cell = n <= 4 ? 18 : n <= 6 ? 15 : 12.5;
  const boxW = n * cell + 8;
  const boxH = cell + 22;
  // the phase and the sum sit above the ring, so nothing crowds its middle
  const CY = 30 + R + boxH / 2;
  const H = CY + R + boxH / 2 + 6;
  const pos = (g: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * g) / n;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  };

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Ring all-reduce over ${n} GPUs, step ${k} of ${ring.steps.length - 1} (${s.phase}).`}
      >
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={LINK_COLOUR.nvlink}
          strokeWidth={2}
          strokeDasharray="4 4"
          opacity={0.6}
        />
        <text
          x={6}
          y={fs(13)}
          style={{ fontSize: fs(11) }}
          className="fill-neutral-700 font-medium dark:fill-neutral-300"
        >
          {s.phase === "start" ? "start" : s.phase}
        </text>
        <text
          x={W - 6}
          y={fs(13)}
          textAnchor="end"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          sum: {ring.total.join(" ")}
        </text>
        {/* chunks in flight to the next step */}
        {nextStep &&
          nextStep.sends.map((m) => {
            const a = pos(m.from);
            const b = pos(m.to);
            const x = a.x + (b.x - a.x) * travel;
            const y = a.y + (b.y - a.y) * travel;
            return (
              <g key={`f${m.from}`} data-send={`${m.from}-${m.to}-${m.chunk}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={STATE_COLOUR.active}
                  strokeWidth={1.5}
                  opacity={0.35}
                />
                <rect
                  x={x - 11}
                  y={y - 9}
                  width={22}
                  height={18}
                  rx={3}
                  fill={STATE_COLOUR.active}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  style={{ fontSize: fs(10) }}
                  className="fill-white font-mono"
                >
                  {m.value}
                </text>
              </g>
            );
          })}
        {Array.from({ length: n }, (_, g) => {
          const p = pos(g);
          return (
            <g
              key={g}
              data-gpu={g}
              transform={`translate(${p.x - boxW / 2} ${p.y - boxH / 2})`}
            >
              <rect
                width={boxW}
                height={boxH}
                rx={4}
                className="fill-white dark:fill-neutral-950"
                stroke="#737373"
                strokeWidth={1}
              />
              <text
                x={4}
                y={11}
                style={{ fontSize: fs(10) }}
                className="fill-neutral-800 font-medium dark:fill-neutral-200"
              >
                GPU {g}
              </text>
              {s.values[g]!.map((v, c) => {
                const cnt = s.count[g]![c]!;
                const done = cnt === n;
                const sending = s.sends.some(
                  (m) => m.to === g && m.chunk === c,
                );
                return (
                  <g key={c} data-chunk={c} data-count={cnt}>
                    <rect
                      x={4 + c * cell}
                      y={16}
                      width={cell - 1}
                      height={cell}
                      fill={LINK_COLOUR.nvlink}
                      fillOpacity={0.12 + (0.88 * cnt) / n}
                      stroke={
                        sending
                          ? STATE_COLOUR.active
                          : done
                            ? LINK_COLOUR.nvlink
                            : "none"
                      }
                      strokeWidth={sending ? 2 : 1}
                    />
                    <text
                      x={4 + c * cell + (cell - 1) / 2}
                      y={16 + cell / 2 + 3.5}
                      textAnchor="middle"
                      style={{ fontSize: fs(10) }}
                      className={
                        done
                          ? "fill-white font-mono"
                          : "fill-neutral-900 font-mono dark:fill-neutral-100"
                      }
                    >
                      {v}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Each GPU&apos;s row is its {n} chunks. A cell darkens as more GPUs&apos;
        values are summed into it; solid with white text = the full sum. Blue
        outline = the chunk this step delivered; between steps the next chunks
        travel round the ring.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Sent per GPU"
        value={`${trim((2 * (n - 1)) / n, 3)} × S`}
        hint={`${fmtBytes(((2 * (n - 1)) / n) * z)} of ${fmtBytes(z)}`}
      />
      <Stat
        label="NVLink ring"
        value={fmtTime(tp.t_nvlink)}
        hint={`${fmtRate(tp.nvlink_bw)} per direction`}
      />
      <Stat
        label="In-switch reduction"
        value={fmtTime(tp.t_switch)}
        hint="each GPU sends S once"
      />
      <Stat
        label="Network ring"
        value={fmtTime(tp.t_nic)}
        hint={`${trim(tp.ratio, 3)}× slower (${fmtBits(tp.nic_bw * 8)} port)`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="ring-widget"
      title="Ring all-reduce, step by step"
      summary="Real numbers summed across GPUs the way NCCL-style ring all-reduce does it. The times beside it are bandwidth terms only (no latency) for the message size you pick."
      stepper={st}
      stepLabel="step"
      caption={ringCaption(ring, k)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (s.phase === "all-gather" ? "ag nvl" : "rs nvl")}
      onEquationHover={setHover}
      countFrom={0}
      params={
        <>
          <Segmented
            label="GPUs in the ring"
            value={nS}
            options={[
              { value: "4", label: "4" },
              { value: "6", label: "6" },
              { value: "8", label: "8" },
            ]}
            onChange={setN}
          />
          <Segmented
            label="Message size S"
            value={size}
            options={[
              { value: String(16e6), label: "16 MB" },
              { value: String(64e6), label: "64 MB" },
              { value: String(256e6), label: "256 MB" },
              { value: String(1e9), label: "1 GB" },
            ]}
            onChange={setSize}
          />
        </>
      }
    />
  );
}
