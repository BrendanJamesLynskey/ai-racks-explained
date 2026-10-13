"use client";

/**
 * Chapter 2's hero: a GPU package seen from above, the compute dies in the
 * middle and the HBM stacks around them, drawn to the stack count the
 * vendor states. A model's weights fill this GPU's share stack by stack;
 * the readouts give how many GPUs the weights need and how long one GPU
 * takes to read its share once (the floor under a batch-1 decode step).
 * Every frame is a state from `fillSteps` and `fit` (checked against the
 * Python reference).
 */
import { useId, useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBytes, fmtRate, fmtTime, pct, trim } from "@/lib/format";
import { fillCaption } from "@/lib/racks/captions";
import {
  fillSteps,
  fit,
  gpu,
  model,
  packageOf,
  type Fmt,
  type GpuId,
  type ModelId,
} from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR } from "@/lib/viz/palette";

import { Hatch } from "./Hatch";

const W = 360;
const H = 220;

export default function PackageWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [gid, setGid] = useState<GpuId>("b300");
  const [mid, setMid] = useState<ModelId>("llama3-405b");
  const [fmt, setFmt] = useState<Fmt>("fp8");
  const [hover, setHover] = useState<string | null>(null);
  const hatchId = useId().replace(/:/g, "");
  const font = useSvgFont(W);
  const fs = font.fs;

  const g = useMemo(() => gpu(gid), [gid]);
  const pk = useMemo(() => packageOf(gid), [gid]);
  const f = useMemo(() => fit(gid, mid, fmt), [gid, mid, fmt]);
  const steps = useMemo(() => fillSteps(gid, mid, fmt), [gid, mid, fmt]);
  const st = useStepper(steps.length, {
    stepMs: 900,
    resetKey: `${gid}-${mid}-${fmt}`,
  });
  const s = steps[st.step]!;
  const stacks = pk.stacks as number;
  const perStack = pk.per_stack_bytes as number;
  // H100 SXM5 uses 5 of the GH100 die's 6 HBM sites (Hopper in-depth blog)
  const sites = gid === "h100" ? 6 : stacks;

  // dies in the middle; sites split left and right of them
  const dies = (g.dies as number) || 1;
  const dieW = dies === 2 ? 70 : 120;
  const dieH = 120;
  const midX = W / 2;
  const top = 48;
  const perSide = Math.ceil(sites / 2);
  const stackW = 30;
  const stackGap = 6;
  const stackH = (dieH - (perSide - 1) * stackGap) / perSide;
  const diesW = dies * dieW + (dies - 1) * 6;
  const leftX = midX - diesW / 2 - 12 - stackW;
  const rightX = midX + diesW / 2 + 12;

  const site = (j: number) => {
    const side = j < perSide ? 0 : 1;
    const row = j % perSide;
    return {
      x: side ? rightX : leftX,
      y: top + row * (stackH + stackGap),
    };
  };

  const visual = (
    <div className="mx-auto max-w-xl">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${g.name} package: ${dies} compute die${dies > 1 ? "s" : ""} and ${stacks} HBM stacks of ${fmtBytes(perStack)}; ${s.full} full.`}
      >
        <defs>
          <Hatch id={hatchId} />
        </defs>
        <text
          x={8}
          y={fs(14)}
          style={{ fontSize: fs(12) }}
          className="fill-neutral-900 font-semibold dark:fill-neutral-100"
        >
          {g.name}
        </text>
        <text
          x={W - 8}
          y={fs(14)}
          textAnchor="end"
          style={{ fontSize: fs(11) }}
          className="fill-neutral-700 font-mono dark:fill-neutral-300"
        >
          {fmtBytes(g.hbm_bytes)} · {fmtRate(g.hbm_bw)}
        </text>
        {/* the package substrate and interposer */}
        <rect
          x={leftX - 10}
          y={top - 10}
          width={rightX + stackW + 10 - (leftX - 10)}
          height={dieH + 20}
          rx={6}
          className="fill-neutral-100 stroke-neutral-400 dark:fill-neutral-900 dark:stroke-neutral-600"
          strokeWidth={1}
        />
        {Array.from({ length: dies }, (_, d) => (
          <g key={`die${d}`}>
            <rect
              x={midX - diesW / 2 + d * (dieW + 6)}
              y={top}
              width={dieW}
              height={dieH}
              rx={4}
              fill={STATE_COLOUR.compute}
              opacity={0.8}
            />
            <text
              x={midX - diesW / 2 + d * (dieW + 6) + dieW / 2}
              y={top + dieH / 2 + 4}
              textAnchor="middle"
              style={{ fontSize: fs(10.5) }}
              className="fill-neutral-900 font-medium"
            >
              {dies > 1 ? `die ${d + 1}` : "die"}
            </text>
          </g>
        ))}
        {Array.from({ length: sites }, (_, j) => {
          const p = site(j);
          const used = j < stacks;
          const fill = !used ? 0 : j < s.full ? 1 : j === s.full ? s.last : 0;
          return (
            <g key={`s${j}`} data-stack={j}>
              <rect
                x={p.x}
                y={p.y}
                width={stackW}
                height={stackH}
                rx={2}
                fill={used ? "none" : `url(#${hatchId})`}
                stroke={LINK_COLOUR.hbm}
                strokeWidth={1.5}
              />
              {used && fill > 0 && (
                <rect
                  x={p.x + 2}
                  y={p.y + stackH - 2 - (stackH - 4) * fill}
                  width={stackW - 4}
                  height={(stackH - 4) * fill}
                  fill={LINK_COLOUR.hbm}
                  opacity={hover === "stacks" || st.step === j + 1 ? 1 : 0.7}
                />
              )}
            </g>
          );
        })}
        <text
          x={midX}
          y={top + dieH + 30}
          textAnchor="middle"
          style={{ fontSize: fs(10.5) }}
          className="fill-neutral-700 font-mono dark:fill-neutral-300"
        >
          {stacks} × {fmtBytes(perStack)} HBM stacks,{" "}
          {fmtRate(pk.per_stack_bw as number)} each
        </text>
        {sites > stacks && (
          <text
            x={midX}
            y={top + dieH + 30 + fs(13)}
            textAnchor="middle"
            style={{ fontSize: fs(10) }}
            className="fill-neutral-600 dark:fill-neutral-400"
          >
            hatched: an unused HBM site
          </text>
        )}
      </svg>
      <div className="mt-2" aria-label="GPUs the weights need">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          {model(mid).name}, {fmt.toUpperCase()}: {fmtBytes(f.weights)} of
          weights → {f.gpus} GPU{f.gpus > 1 ? "s" : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.from({ length: f.gpus }, (_, n) => (
            <span
              key={n}
              data-gpu-slot={n}
              className="inline-block h-4 w-6 rounded-sm"
              style={{
                background: LINK_COLOUR.hbm,
                opacity: n === 0 ? 1 : 0.35,
                outline:
                  n === 0 ? `2px solid ${STATE_COLOUR.active}` : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="This GPU's share"
        value={fmtBytes(f.share)}
        hint={`${pct(f.fill)} of HBM`}
      />
      <Stat label="Placed" value={fmtBytes(s.placed)} />
      <Stat
        label="Read it once"
        value={fmtTime(f.read_time)}
        hint="share ÷ HBM bandwidth"
      />
      <Stat
        label="Batch-1 ceiling"
        value={`${trim(f.tokens_per_s, 3)} tok/s`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="package-widget"
      title="Filling a package with weights"
      summary="Weights only (no KV cache, activations or runtime), split evenly over as many GPUs as they need. HBM figures are the vendors'; the stack count is drawn only where the vendor states it."
      stepper={st}
      stepLabel="stack"
      caption={fillCaption(s, stacks, perStack, f, g.name, model(mid).name)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (s.done ? "hbm" : "stacks")}
      onEquationHover={setHover}
      countFrom={0}
      params={
        <>
          <Segmented
            label="GPU"
            value={gid}
            options={[
              { value: "h100", label: "H100" },
              { value: "b300", label: "Blackwell Ultra" },
            ]}
            onChange={setGid}
          />
          <Segmented
            label="Model"
            value={mid}
            options={[
              { value: "llama3-70b", label: "70B" },
              { value: "llama3-405b", label: "405B" },
              { value: "deepseek-v3", label: "671B" },
            ]}
            onChange={setMid}
          />
          <Segmented
            label="Weight format"
            value={fmt}
            options={[
              { value: "bf16", label: "BF16" },
              { value: "fp8", label: "FP8" },
              { value: "fp4", label: "FP4" },
            ]}
            onChange={setFmt}
          />
        </>
      }
    />
  );
}
