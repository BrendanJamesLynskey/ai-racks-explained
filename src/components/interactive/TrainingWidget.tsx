"use client";

/**
 * Chapter 9's hero: a training job's GPUs placed into NVLink domains, one
 * tensor-parallel group per frame (replica by replica, stage by stage),
 * with the link each pipeline hop uses. Every frame is a state of
 * `layoutSteps`, and the totals are `trainingLayout` (both checked against
 * the Python reference).
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { layoutCaption } from "@/lib/racks/captions";
import { layoutSteps, trainingLayout } from "@/lib/racks/model";
import { LINK_COLOUR, MUTED, OKABE_ITO, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const REPLICA = [
  OKABE_ITO.blue,
  OKABE_ITO.orange,
  OKABE_ITO.green,
  OKABE_ITO.purple,
];

export default function TrainingWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [tpS, setTp] = useState<string>("8");
  const [ppS, setPp] = useState<string>("4");
  const [dpS, setDp] = useState<string>("4");
  const [domS, setDom] = useState<string>("72");
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const tp = Number(tpS);
  const pp = Number(ppS);
  const dp = Number(dpS);
  const dom = Number(domS);

  const layout = useMemo(
    () => trainingLayout(tp, pp, dp, dom),
    [tp, pp, dp, dom],
  );
  const steps = useMemo(() => layoutSteps(tp, pp, dp, dom), [tp, pp, dp, dom]);
  const st = useStepper(steps.length, {
    stepMs: 900,
    resetKey: `${tp}|${pp}|${dp}|${dom}`,
  });
  const k = st.step;
  const s = steps[k]!;

  // geometry: a 72-GPU rack is 18 trays (columns) of 4; an 8-GPU server is 2 x 4
  const cols = dom === 72 ? 18 : 4;
  const cell = dom === 72 ? 17 : 13;
  const blockW = cols * cell;
  const rows = dom / cols;
  const blockH = rows * cell;
  const perRow = dom === 72 ? 1 : 5;
  const gapX = 12;
  const gapY = dom === 72 ? 22 : 18;
  const domains = layout.domains;
  const H = 28 + Math.ceil(domains / perRow) * (blockH + gapY);
  const origin = (d: number) => ({
    x: 10 + (d % perRow) * (blockW + gapX),
    y: 28 + Math.floor(d / perRow) * (blockH + gapY),
  });
  const pos = (rank: number) => {
    const d = Math.floor(rank / dom);
    const r = rank % dom;
    const o = origin(d);
    return { x: o.x + (r % cols) * cell, y: o.y + Math.floor(r / cols) * cell };
  };
  // which group each placed rank belongs to (placed through frame k)
  const owner = new Map<number, { d: number; p: number; cur: boolean }>();
  for (let i = 0; i <= k; i++) {
    const g = steps[i]!;
    for (let r = g.first; r <= g.last; r++)
      owner.set(r, { d: g.d, p: g.p, cur: i === k });
  }
  const centre = (first: number, last: number) => {
    const a = pos(first);
    const b = pos(last);
    return { x: (a.x + b.x) / 2 + cell / 2, y: (a.y + b.y) / 2 + cell / 2 };
  };
  const prev = s.p > 0 ? steps[k - 1] : undefined;

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`A ${tp} x ${pp} x ${dp} job placed in NVLink domains of ${dom} GPUs; group ${k + 1} of ${steps.length}.`}
      >
        <text
          x={10}
          y={14}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          {layout.gpus} GPUs in {domains}{" "}
          {dom === 72 ? "NVL72 racks" : "8-GPU servers"}
        </text>
        {Array.from({ length: domains }, (_, d) => {
          const o = origin(d);
          return (
            <g key={d}>
              <rect
                x={o.x - 3}
                y={o.y - 3}
                width={blockW + 5}
                height={blockH + 5}
                rx={3}
                fill="none"
                stroke={LINK_COLOUR.nvlink}
                strokeWidth={1.5}
              />
              {Array.from({ length: dom }, (_, r) => {
                const rank = d * dom + r;
                const p = pos(rank);
                const o2 = owner.get(rank);
                return (
                  <rect
                    key={r}
                    x={p.x + 1}
                    y={p.y + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={1.5}
                    fill={o2 ? REPLICA[o2.d % REPLICA.length] : MUTED.light}
                    fillOpacity={o2 ? 0.45 + (0.55 * (o2.p + 1)) / pp : 0.25}
                    stroke={o2?.cur ? STATE_COLOUR.active : "none"}
                    strokeWidth={o2?.cur ? 1.5 : 0}
                    data-rank={rank}
                  />
                );
              })}
            </g>
          );
        })}
        {prev && (
          <line
            {...(() => {
              const a = centre(prev.first, prev.last);
              const b = centre(s.first, s.last);
              return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
            })()}
            stroke={s.link === "net" ? LINK_COLOUR.net : LINK_COLOUR.nvlink}
            strokeWidth={3}
            strokeDasharray={s.link === "net" ? "6 4" : undefined}
            data-link={s.link ?? ""}
          />
        )}
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Green boxes: NVLink domains. Each colour is one data-parallel replica;
        darker = a later pipeline stage. The line joins the group just placed to
        the stage before it: solid green over NVLink, dashed sky blue over the
        network.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="TP groups in one domain"
        value={`${layout.tp_inside} of ${layout.tp_groups}`}
        hint="all-reduces every layer"
      />
      <Stat
        label="PP hops on the network"
        value={`${layout.pp_net} of ${layout.pp_hops}`}
        hint="activations, every micro-batch"
      />
      <Stat
        label="DP groups on the network"
        value={`${layout.dp_net} of ${layout.dp_groups}`}
        hint="gradients, once a step"
      />
      <Stat label="Domains" value={String(domains)} hint={`${dom} GPUs each`} />
    </div>
  );

  return (
    <AnimationPanel
      testId="training-widget"
      title="Placing a training job on NVLink domains"
      summary="Ranks fill the domains in order, tensor-parallel innermost (Llama 3's order). Which traffic stays on NVLink and which crosses the network follows from the layout alone."
      stepper={st}
      stepLabel="group"
      caption={layoutCaption(layout, s, steps.length)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (s.link === null ? "tp" : "tp pp")}
      onEquationHover={setHover}
      params={
        <>
          <Segmented
            label="Tensor parallel"
            value={tpS}
            options={[
              { value: "4", label: "4" },
              { value: "8", label: "8" },
            ]}
            onChange={setTp}
          />
          <Segmented
            label="Pipeline stages"
            value={ppS}
            options={[
              { value: "2", label: "2" },
              { value: "4", label: "4" },
            ]}
            onChange={setPp}
          />
          <Segmented
            label="Data-parallel replicas"
            value={dpS}
            options={[
              { value: "2", label: "2" },
              { value: "4", label: "4" },
            ]}
            onChange={setDp}
          />
          <Segmented
            label="NVLink domain"
            value={domS}
            options={[
              { value: "72", label: "NVL72 rack" },
              { value: "8", label: "8-GPU server" },
            ]}
            onChange={setDom}
          />
        </>
      }
    />
  );
}
