"use client";

/**
 * Chapter 3's hero: a 2 GB payload cut into chunks crossing the links of a
 * GB200 compute tray, one lane per link. A link carries one chunk at a time;
 * a chunk that has arrived but finds its next link busy waits (hatched).
 * Every frame is a state of `pipelineSteps` (the model, checked against the
 * Python reference).
 */
import { useId, useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBytes, fmtRate, fmtTime, pct } from "@/lib/format";
import { pipeCaption } from "@/lib/racks/captions";
import { paths, pipeline, pipelineSteps, type PathId } from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR, linkKind } from "@/lib/viz/palette";

import { Hatch } from "./Hatch";

const W = 360;
const LANE = 52;
const TOP = 22;
const X0 = 70;
/** Waiting chunks drawn at a lane's entrance (the rest are counted). */
const MAX_Q = 7;
const LW = W - X0 - 8;
const PATH_PAYLOAD = 2e9;
const PATH_FRAMES = 48;

const HL: Record<string, string> = {
  hbm: "hbm",
  nvlink: "nvl",
  c2c: "c2c",
  net: "net",
  pcie: "pcie",
  lpddr: "lpddr",
};

export default function PathWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [pid, setPid] = useState<PathId>("rdma");
  const [chunksS, setChunks] = useState<string>("8");
  const chunks = Number(chunksS);
  const [hover, setHover] = useState<string | null>(null);
  const hatchId = useId().replace(/:/g, "");
  const font = useSvgFont(W);
  const fs = font.fs;

  const def = useMemo(() => paths()[pid], [pid]);
  const p = useMemo(
    () => pipeline(def.hops, PATH_PAYLOAD, chunks),
    [def, chunks],
  );
  const steps = useMemo(
    () => pipelineSteps(def.hops, PATH_PAYLOAD, chunks, PATH_FRAMES),
    [def, chunks],
  );
  const st = useStepper(steps.length, {
    stepMs: 160,
    resetKey: `${pid}-${chunks}`,
  });
  const s = steps[st.step]!;
  const h = def.hops.length;
  const H = TOP + (h + 1) * LANE + 8;
  const sq = Math.min(14, (LW - 8) / (chunks + 1));

  const visual = (
    <div className="mx-auto max-w-xl">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${def.label}: ${chunks} chunks of ${fmtBytes(p.chunk)} over ${h} links; ${s.done} delivered.`}
      >
        <defs>
          <Hatch id={hatchId} />
        </defs>
        {def.hops.map((hop, i) => {
          const y = TOP + i * LANE;
          const kind = linkKind(hop.name);
          const slow = i === p.bottleneck;
          const queued = s.pos
            .map((q, c) => ({ ...q, c }))
            .filter((q) => q.hop === i && q.wait);
          const moving = s.pos
            .map((q, c) => ({ ...q, c }))
            .filter((q) => q.hop === i && !q.wait);
          return (
            <g key={i} data-hop={i} data-busy={s.busy[i] ? "true" : "false"}>
              <text
                x={4}
                y={y + 13}
                style={{ fontSize: fs(10) }}
                className="fill-neutral-900 font-medium dark:fill-neutral-100"
              >
                {font.narrow
                  ? hop.name
                      .replace(" (ConnectX-7)", "")
                      .replace("NVLink to the ", "NVLink→")
                  : hop.name}
              </text>
              <text
                x={W - 6}
                y={y + 13}
                textAnchor="end"
                style={{ fontSize: fs(10) }}
                className="fill-neutral-700 font-mono dark:fill-neutral-300"
              >
                {fmtRate(hop.bw)}
                {slow ? " (slowest)" : ""}
              </text>
              <rect
                x={X0}
                y={y + 18}
                width={LW}
                height={sq + 6}
                rx={3}
                fill={LINK_COLOUR[kind]}
                fillOpacity={0.18}
                stroke={slow ? STATE_COLOUR.stalled : LINK_COLOUR[kind]}
                strokeWidth={slow ? 2 : 1}
              />
              {/* waiting for this link: queued at its entrance, hatched */}
              {queued.slice(0, MAX_Q).map((q, j) => (
                <rect
                  key={`q${q.c}`}
                  x={X0 - 4 - (j + 1) * (sq * 0.55)}
                  y={y + 21}
                  width={sq * 0.5}
                  height={sq}
                  fill={`url(#${hatchId})`}
                  stroke={STATE_COLOUR.stalled}
                  strokeWidth={0.8}
                />
              ))}
              {queued.length > 0 && (
                <text
                  x={X0 - 4}
                  y={y + 21 + sq + fs(10)}
                  textAnchor="end"
                  style={{ fontSize: fs(10) }}
                  className="fill-neutral-700 font-mono dark:fill-neutral-300"
                >
                  {queued.length} waiting
                </text>
              )}
              {moving.map((q) => (
                <rect
                  key={`m${q.c}`}
                  x={X0 + 3 + q.frac * (LW - sq - 6)}
                  y={y + 21}
                  width={sq}
                  height={sq}
                  rx={2}
                  fill={STATE_COLOUR.active}
                />
              ))}
            </g>
          );
        })}
        {/* delivered */}
        <g data-hop="done">
          <text
            x={4}
            y={TOP + h * LANE + 13}
            style={{ fontSize: fs(10) }}
            className="fill-neutral-900 font-medium dark:fill-neutral-100"
          >
            Delivered: {s.done} of {chunks}
          </text>
          {Array.from({ length: s.done }, (_, c) => (
            <rect
              key={c}
              x={X0 + 3 + c * (sq + 2)}
              y={TOP + h * LANE + 21}
              width={sq}
              height={sq}
              rx={2}
              fill={LINK_COLOUR.hbm}
            />
          ))}
        </g>
        <text
          x={4}
          y={11}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 dark:fill-neutral-400"
        >
          t = {fmtTime(s.t)} of {fmtTime(p.total)}
        </text>
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Blue: a chunk on a link. Hatched: a chunk waiting for the link. Red
        outline: the slowest link. Lane colours are the link kinds used on every
        chart here.
      </p>
    </div>
  );

  const slow = def.hops[p.bottleneck]!;
  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Total" value={fmtTime(p.total)} />
      <Stat
        label="Slowest link alone"
        value={fmtTime(p.ideal)}
        hint={slow.name}
      />
      <Stat
        label="Efficiency"
        value={pct(p.ideal / p.total)}
        hint="ideal ÷ total"
      />
      <Stat label="Chunk" value={fmtBytes(p.chunk)} />
    </div>
  );

  return (
    <AnimationPanel
      testId="path-widget"
      title="A payload crossing a tray"
      summary={`${fmtBytes(PATH_PAYLOAD)} cut into chunks, store-and-forward per chunk: each link carries one chunk at a time at its bandwidth per direction. Latency is not modelled.`}
      stepper={st}
      stepLabel="time step"
      caption={pipeCaption(def.hops, p, s, chunks)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? `slow chunk ${HL[linkKind(slow.name)]}`}
      onEquationHover={setHover}
      countFrom={0}
      params={
        <>
          <Segmented
            label="Path"
            value={pid}
            options={[
              { value: "rdma", label: "network → GPU" },
              { value: "grace", label: "Grace → GPU" },
              { value: "peer", label: "GPU → GPU" },
            ]}
            onChange={setPid}
          />
          <Segmented
            label="Chunks"
            value={chunksS}
            options={[
              { value: "1", label: "1" },
              { value: "4", label: "4" },
              { value: "8", label: "8" },
              { value: "16", label: "16" },
            ]}
            onChange={setChunks}
          />
        </>
      }
    />
  );
}
