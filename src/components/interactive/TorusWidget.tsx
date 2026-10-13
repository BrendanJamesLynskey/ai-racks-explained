"use client";

/**
 * Chapter 10's hero: how far apart chips are in a 3D torus (the TPU pod's
 * building block) and in a switched rack. From one source chip, each frame
 * lights the chips first reached at that hop, wrap-around links included;
 * in a switched NVL72 rack every GPU is reached at once. Frames are
 * `torusSteps`, each chip's hop count `torusDistance` (both checked against
 * the Python reference).
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtTime, trim } from "@/lib/format";
import { torusCaption } from "@/lib/racks/captions";
import {
  torus,
  torusDistance,
  torusSteps,
  tpuCompare,
} from "@/lib/racks/model";
import { LINK_COLOUR, MUTED, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;

export default function TorusWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [kS, setK] = useState<string>("4");
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const k = Number(kS);
  const t = useMemo(() => torus(k), [k]);
  const steps = useMemo(() => torusSteps(k), [k]);
  const cmp = useMemo(() => tpuCompare(64e6), []);
  const st = useStepper(steps.length, { stepMs: 1100, resetKey: kS });
  const d = st.step;
  const s = steps[d]!;

  // k layers of k x k, laid out in rows of layers
  const perRow = 4;
  const cell = k === 4 ? 16 : 9;
  const layerW = k * cell;
  const gap = 10;
  const layerRows = Math.ceil(k / perRow);
  const pitch = layerW + (W - 20 - perRow * layerW) / (perRow - 1);
  const H = 24 + layerRows * (layerW + gap + 12) + 46;
  const nvlY = H - 34;

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`A ${k} by ${k} by ${k} torus: chips reached within ${d} hops of the source.`}
      >
        <text
          x={10}
          y={14}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          {k}×{k}×{k} torus, {t.nodes} chips, shown as {k} layers
        </text>
        {Array.from({ length: k }, (_, z) => {
          const ox = 10 + (z % perRow) * pitch;
          const oy = 24 + Math.floor(z / perRow) * (layerW + gap + 12);
          return (
            <g key={z}>
              <text
                x={ox}
                y={oy + layerW + 11}
                style={{ fontSize: fs(9) }}
                className="fill-neutral-600 dark:fill-neutral-400"
              >
                layer {z}
              </text>
              {Array.from({ length: k * k }, (_, i) => {
                const idx = z * k * k + i;
                const h = torusDistance(idx, k);
                const lit = h <= d;
                const now = h === d;
                return (
                  <rect
                    key={i}
                    x={ox + (i % k) * cell + 1}
                    y={oy + Math.floor(i / k) * cell + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={1.5}
                    fill={
                      idx === 0
                        ? STATE_COLOUR.active
                        : lit
                          ? LINK_COLOUR.nvlink
                          : MUTED.light
                    }
                    fillOpacity={idx === 0 ? 1 : lit ? (now ? 1 : 0.45) : 0.25}
                    stroke={now && idx !== 0 ? "#000" : "none"}
                    className={now ? "dark:stroke-white" : undefined}
                    data-hops={h}
                  />
                );
              })}
            </g>
          );
        })}
        {/* the switched rack: everything at one hop */}
        <text
          x={10}
          y={nvlY - 6}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          NVL72 rack (switched): all 71 other GPUs at 1 hop
        </text>
        {Array.from({ length: 72 }, (_, i) => (
          <rect
            key={i}
            x={10 + i * 4.7}
            y={nvlY}
            width={3.6}
            height={12}
            fill={i === 0 ? STATE_COLOUR.active : LINK_COLOUR.nvlink}
            fillOpacity={i === 0 || d >= 1 ? 1 : 0.25}
          />
        ))}
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Blue: the source chip. Green: chips reached so far, outlined at this
        hop. Wrap-around links make the far edge of each layer a neighbour, so
        no chip is more than {t.diameter} hops away.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Mean hops"
        value={trim(t.mean_hops, 3)}
        hint={`farthest ${t.diameter}; switched rack: 1`}
      />
      <Stat
        label="Links per chip"
        value={String(t.links_per_node)}
        hint="to its six neighbours"
      />
      <Stat
        label="Bisection links"
        value={String(t.bisection_links)}
        hint="cut by halving the torus"
      />
      <Stat
        label="All-to-all, 64 MB a chip"
        value={fmtTime(cmp.t_torus)}
        hint={`TPU v5p cube; NVL72 ${fmtTime(cmp.t_nvl72)}`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="torus-widget"
      title="Hops in a torus and in a switched rack"
      summary="Hop counts from one chip with wrap-around links in every dimension. The all-to-all times are bandwidth bounds for a TPU v5p cube (its stated per-chip ICI, split equally over six links: our assumption) and a GB200 NVL72 rack."
      stepper={st}
      stepLabel="hop"
      countFrom={0}
      caption={torusCaption(s, t.nodes, steps.length - 1)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (d === steps.length - 1 ? "hops bisect" : "hops")}
      onEquationHover={setHover}
      params={
        <Segmented
          label="Torus size"
          value={kS}
          options={[
            { value: "4", label: "4×4×4 (a TPU cube)" },
            { value: "8", label: "8×8×8" },
          ]}
          onChange={setK}
        />
      }
    />
  );
}
