"use client";

/**
 * Chapter 7's hero: a rack's liquid loop. Coolant parcels leave the CDU,
 * rise through the supply manifold, cross a compute tray's cold plates
 * (warming by ΔT), fall through the return manifold and give their heat to
 * the facility water in the CDU's exchanger. Every parcel's position and
 * temperature is a frame of `loopSteps` (checked against the Python
 * reference); the flow is Q = ṁ c_p ΔT.
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtInt, fmtTemp, fmtWatts, trim } from "@/lib/format";
import { loopCaption } from "@/lib/racks/captions";
import {
  LOOP_STEPS,
  coolingLoop,
  heatFlow,
  loopSteps,
  num,
  system,
  type Parcel,
} from "@/lib/racks/model";
import { MUTED, OKABE_ITO } from "@/lib/viz/palette";

const W = 360;
const H = 262;
const RX0 = 112;
const RX1 = 248;
const RY0 = 34;
const RY1 = 170;
const SUP_X = 96;
const RET_X = 264;
const CDU_Y = 204;
const Q = LOOP_STEPS / 4;
const LIQUID_FRAC = 0.9; // illustrative

function mix(a: string, b: string, f: number): string {
  const p = (h: string, i: number) =>
    parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  const c = [0, 1, 2].map((i) =>
    Math.round(p(a, i) + (p(b, i) - p(a, i)) * Math.min(1, Math.max(0, f))),
  );
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function CoolingWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [q, setQ] = useState<string>(String(120e3));
  const [tf, setTf] = useState<string>("30");
  const [dt, setDt] = useState<string>("10");
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const trays = num(system("gb200-nvl72"), "compute_trays");

  const loop = useMemo(
    () => coolingLoop(Number(q), LIQUID_FRAC, Number(tf), Number(dt)),
    [q, tf, dt],
  );
  const air = useMemo(() => heatFlow(Number(q), Number(dt), 15), [q, dt]);
  const steps = useMemo(() => loopSteps(loop), [loop]);
  const st = useStepper(steps.length, {
    stepMs: 380,
    resetKey: `${q}|${tf}|${dt}`,
  });
  const k = st.step;
  const s = steps[k]!;
  const rowH = (RY1 - RY0) / trays;
  const rowY = (j: number) => RY0 + rowH * ((j * 5) % trays) + rowH / 2;

  const where = (p: Parcel, j: number) => {
    const m = (p.k % Q) / Q;
    const ty = rowY(j);
    switch (p.seg) {
      case "supply":
        return { x: SUP_X, y: CDU_Y - (CDU_Y - ty) * m };
      case "cold plates":
        return { x: RX0 + (RX1 - RX0) * m, y: ty };
      case "return":
        return { x: RET_X, y: ty + (CDU_Y - ty) * m };
      default:
        return { x: RET_X - (RET_X - SUP_X) * m, y: CDU_Y };
    }
  };
  const colour = (t: number) =>
    mix(
      OKABE_ITO.sky,
      OKABE_ITO.vermillion,
      (t - loop.t_sup) / (loop.t_ret - loop.t_sup),
    );
  const seg0 = s.parcels[0]!.seg;

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`A rack's liquid loop, frame ${k + 1} of ${steps.length}: coolant from ${fmtTemp(loop.t_sup)} to ${fmtTemp(loop.t_ret)}.`}
      >
        {/* rack and trays */}
        <rect
          x={RX0}
          y={RY0}
          width={RX1 - RX0}
          height={RY1 - RY0}
          rx={3}
          className="fill-white dark:fill-neutral-950"
          stroke="#737373"
        />
        {Array.from({ length: trays }, (_, i) => (
          <rect
            key={i}
            x={RX0 + 4}
            y={RY0 + rowH * i + 1}
            width={RX1 - RX0 - 8}
            height={rowH - 2}
            fill={MUTED.light}
            opacity={0.35}
          />
        ))}
        <text
          x={(RX0 + RX1) / 2}
          y={RY0 - 10}
          textAnchor="middle"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          {trays} compute trays (cold plates)
        </text>
        {/* pipes */}
        <path
          d={`M ${SUP_X} ${CDU_Y} L ${SUP_X} ${RY0} M ${RET_X} ${RY0} L ${RET_X} ${CDU_Y} M ${SUP_X} ${CDU_Y} L ${RET_X} ${CDU_Y}`}
          stroke={MUTED.light}
          strokeWidth={6}
          fill="none"
          opacity={0.6}
        />
        <rect
          x={SUP_X + 30}
          y={CDU_Y - 12}
          width={RET_X - SUP_X - 60}
          height={24}
          rx={3}
          fill="none"
          stroke="#737373"
        />
        <text
          x={(SUP_X + RET_X) / 2}
          y={CDU_Y + 12 + fs(12)}
          textAnchor="middle"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          CDU exchanger
        </text>
        <text
          x={SUP_X - 6}
          y={(RY0 + CDU_Y) / 2}
          textAnchor="end"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          {fmtTemp(loop.t_sup)}
        </text>
        <text
          x={RET_X + 6}
          y={(RY0 + CDU_Y) / 2}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          {fmtTemp(loop.t_ret)}
        </text>
        <text
          x={W / 2}
          y={H - 4}
          textAnchor="middle"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 dark:fill-neutral-400"
        >
          facility water {fmtTemp(loop.t_fac)} in, {fmtTemp(loop.t_fac_ret)} out
        </text>
        {/* parcels */}
        {s.parcels.map((p, j) => {
          const c = where(p, j);
          return (
            <circle
              key={j}
              cx={c.x}
              cy={c.y}
              r={j === 0 ? 7 : 5.5}
              fill={colour(p.temp)}
              stroke={j === 0 ? "#000" : "none"}
              strokeWidth={j === 0 ? 2 : 0}
              className={j === 0 ? "dark:stroke-white" : undefined}
              data-parcel={j}
              data-seg={p.seg}
              data-temp={trim(p.temp, 4)}
            />
          );
        })}
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Eight coolant parcels, coloured from cool (sky blue) to warm
        (vermillion); the outlined one is the parcel the caption follows. Each
        crosses one tray&apos;s cold plates; the trays share the flow.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Coolant flow"
        value={`${trim(loop.l_min, 3)} L/min`}
        hint={`${trim(loop.kg_s, 3)} kg/s for ${fmtWatts(loop.q_liquid)}`}
      />
      <Stat
        label="Per tray"
        value={`${trim(loop.per_tray_kg_s, 3)} kg/s`}
        hint={`${trays} trays in parallel`}
      />
      <Stat
        label="Air instead"
        value={`${fmtInt(air.air_cfm)} CFM`}
        hint={`${trim(air.air_m3_s, 3)} m³/s, warming 15 K`}
      />
      <Stat
        label="Racks per 2 MW CDU"
        value={fmtInt(loop.racks_per_cdu)}
        hint={`air still carries ${fmtWatts(loop.q_air)} a rack`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="cooling-widget"
      title="A rack's liquid loop"
      summary="Coolant temperatures and flow from Q = ṁ c_p ΔT for a rack of GB200 NVL72's layout, with 90% of the heat on cold plates (illustrative) and the CDU's 5 K approach from NVIDIA's partner figure."
      stepper={st}
      stepLabel="frame"
      caption={loopCaption(loop, s, steps.length)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={
        hover ??
        (seg0 === "cold plates"
          ? "heat rise"
          : seg0 === "CDU"
            ? "heat"
            : "flow")
      }
      onEquationHover={setHover}
      params={
        <>
          <Segmented
            label="Rack power"
            value={q}
            options={[
              { value: String(120e3), label: "120 kW" },
              { value: String(135e3), label: "135 kW" },
              { value: String(1e6), label: "1 MW" },
            ]}
            onChange={setQ}
          />
          <Segmented
            label="Facility water in"
            value={tf}
            options={[
              { value: "20", label: "20 °C" },
              { value: "30", label: "30 °C" },
              { value: "40", label: "40 °C" },
            ]}
            onChange={setTf}
          />
          <Segmented
            label="Coolant warms by"
            value={dt}
            options={[
              { value: "5", label: "5 K" },
              { value: "10", label: "10 K" },
              { value: "15", label: "15 K" },
            ]}
            onChange={setDt}
          />
        </>
      }
    />
  );
}
