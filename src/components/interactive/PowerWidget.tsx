"use client";

/**
 * Chapter 6's hero: power smoothing. A training rack's load swings between
 * a high phase (compute) and a low phase (waiting on communication); the
 * energy stored in its power shelves lets the grid see a flatter draw. The
 * trace is drawn frame by frame from `smoothingSteps` (checked against the
 * Python reference); the store's level is the bar on the right.
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtJoules, fmtTime, fmtWatts, pct } from "@/lib/format";
import { smoothCaption } from "@/lib/racks/captions";
import { rackSmoothing, smoothingSteps } from "@/lib/racks/model";
import { MUTED, OKABE_ITO, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const H = 210;
const X0 = 44;
const X1 = 300;
const Y0 = 22;
const Y1 = 172;
const STORE = OKABE_ITO.orange;

export default function PowerWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [half, setHalf] = useState<string>("0.25");
  const [j, setJ] = useState<string>("65");
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;

  const sm = useMemo(() => rackSmoothing(Number(half), Number(j)), [half, j]);
  const steps = useMemo(() => smoothingSteps(sm), [sm]);
  const st = useStepper(steps.length, {
    stepMs: 520,
    resetKey: `${half}|${j}`,
  });
  const k = st.step;
  const s = steps[k]!;
  const tEnd = steps[steps.length - 1]!.t;
  const pMax = sm.p_hi * 1.1;
  const x = (t: number) => X0 + ((X1 - X0) * t) / tEnd;
  const y = (p: number) => Y1 - ((Y1 - Y0) * p) / pMax;

  // step-function traces up to the current frame
  const seg = (key: "load" | "grid") => {
    let d = `M ${x(0)} ${y(steps[0]![key])}`;
    for (let i = 1; i <= k; i++) {
      const a = steps[i - 1]!;
      const b = steps[i]!;
      d += ` L ${x(a.t)} ${y(b[key])} L ${x(b.t)} ${y(b[key])}`;
    }
    return d;
  };
  const fill = sm.e_store > 0 ? s.stored / sm.e_store : 0;
  const ticks = [0, 0.5, 1].map((f) => f * sm.p_hi);

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Rack load and grid draw over time, frame ${k + 1} of ${steps.length}.`}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line
              x1={X0}
              x2={X1}
              y1={y(p)}
              y2={y(p)}
              stroke={MUTED.light}
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={X0 - 4}
              y={y(p) + 3.5}
              textAnchor="end"
              style={{ fontSize: fs(10) }}
              className="fill-neutral-600 font-mono dark:fill-neutral-400"
            >
              {fmtWatts(p)}
            </text>
          </g>
        ))}
        <line
          x1={X0}
          x2={X0}
          y1={Y0}
          y2={Y1}
          stroke={MUTED.light}
          strokeWidth={1}
        />
        <text
          x={X1}
          y={Y1 + fs(13)}
          textAnchor="end"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          {fmtTime(tEnd)}
        </text>
        <text
          x={X0}
          y={Y1 + fs(13)}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          0
        </text>
        <path
          d={seg("load")}
          fill="none"
          stroke={MUTED.dark}
          strokeWidth={2}
          className="dark:stroke-neutral-300"
          data-trace="load"
        />
        <path
          d={seg("grid")}
          fill="none"
          stroke={STATE_COLOUR.active}
          strokeWidth={2.5}
          strokeDasharray={sm.e_store > 0 ? undefined : "5 3"}
          data-trace="grid"
        />
        <line
          x1={x(s.t)}
          x2={x(s.t)}
          y1={Y0 - 4}
          y2={Y1}
          stroke={STATE_COLOUR.active}
          strokeWidth={1}
          opacity={0.5}
        />
        {/* the store */}
        <rect
          x={316}
          y={Y0}
          width={30}
          height={Y1 - Y0}
          rx={3}
          fill="none"
          stroke={STORE}
          strokeWidth={1.5}
        />
        <rect
          x={316}
          y={Y1 - (Y1 - Y0) * fill}
          width={30}
          height={(Y1 - Y0) * fill}
          rx={3}
          fill={STORE}
          opacity={0.7}
          data-store={fill.toFixed(4)}
        />
        <text
          x={331}
          y={Y0 - 6}
          textAnchor="middle"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          store
        </text>
        <text
          x={331}
          y={Y1 + fs(13)}
          textAnchor="middle"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          {sm.e_store > 0 ? pct(fill) : "none"}
        </text>
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Grey: what the rack draws. Blue: what the grid supplies (dashed when
        there is no store). Orange: the energy in the power shelves&apos;
        capacitors. One frame per sixth of a phase, two swings in all.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Grid peak"
        value={fmtWatts(sm.grid_hi)}
        hint={`rack peak ${fmtWatts(sm.p_hi)}`}
      />
      <Stat
        label="Peak cut"
        value={pct(sm.peak_cut, 1)}
        hint="of the rack's peak"
      />
      <Stat
        label="Grid swing"
        value={fmtWatts(sm.swing)}
        hint={`load swing ${fmtWatts(sm.raw_swing)}`}
      />
      <Stat
        label="Store used"
        value={sm.e_store > 0 ? pct(sm.store_use) : "none"}
        hint={`of ${fmtJoules(sm.e_store)} a swing`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="power-widget"
      title="Smoothing a training rack's power"
      summary="One GB200 NVL72-sized rack swinging between its stated power and half of it (the swing and the storage options other than 65 J per GPU are illustrative). The power shelves' store holds the grid's draw flat for as long as it lasts."
      stepper={st}
      stepLabel="frame"
      caption={smoothCaption(sm, s, steps.length)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (s.phase === "high" ? "store grid" : "grid")}
      onEquationHover={setHover}
      params={
        <>
          <Segmented
            label="Load swings every"
            value={half}
            options={[
              { value: "0.05", label: "0.05 s" },
              { value: "0.25", label: "0.25 s" },
              { value: "1", label: "1 s" },
            ]}
            onChange={setHalf}
          />
          <Segmented
            label="Storage per GPU"
            value={j}
            options={[
              { value: "0", label: "none" },
              { value: "65", label: "65 J" },
              { value: "650", label: "650 J" },
            ]}
            onChange={setJ}
          />
        </>
      }
    />
  );
}
