"use client";

/**
 * Chapter 5's hero: a fat-tree fabric built tier by tier for the number of
 * GPUs and the switch you pick, then a packet routed inside one leaf and
 * across the top. Rows with more switches than fit are drawn as a sample
 * with a count. The counts of switches, links and transceivers are
 * `treeSteps` and `fatTree` (checked against the Python reference); the
 * optics power uses a watts-per-transceiver you set, which is illustrative.
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Slider, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBits, fmtInt, fmtWatts, trim } from "@/lib/format";
import { treeCaption } from "@/lib/racks/captions";
import {
  fatTree,
  opticsPower,
  switchOf,
  treeSteps,
  type SwitchId,
} from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const H = 272;
const X0 = 78;
const XW = W - X0 - 10;

type Row = { key: string; label: string; count: number; y: number };

/** x of drawn item j of `shown` items in a row. */
const xOf = (j: number, shown: number) =>
  X0 + ((j + 0.5) * XW) / Math.max(1, shown);

export default function FabricWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [nS, setN] = useState<string>("9216");
  const [wid, setWid] = useState<SwitchId>("quantum2");
  const [oS, setO] = useState<string>("1");
  const [watts, setWatts] = useState(15);
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const n = Number(nS);
  // phones draw fewer of each row (the same story, fewer elements)
  const MAXB = font.narrow ? 6 : 10;
  const MAXDOTS = font.narrow ? 12 : 20;
  const o = Number(oS);
  const sw = useMemo(() => switchOf(wid), [wid]);
  const k = sw.ports;
  const t = useMemo(() => fatTree(n, k, o), [n, k, o]);
  const steps = useMemo(() => treeSteps(n, k, o), [n, k, o]);
  const st = useStepper(steps.length, {
    stepMs: 1500,
    resetKey: `${n}-${k}-${o}`,
  });
  const s = steps[st.step]!;
  const power = opticsPower(t, watts);
  const reached = (key: string) =>
    steps.findIndex((x) => x.key === key) <= st.step &&
    steps.some((x) => x.key === key);

  const rows: Row[] = [
    { key: "gpus", label: "GPUs", count: n, y: H - 40 },
    { key: "leaves", label: "Leaves", count: t.leaves, y: H - 100 },
    {
      key: "spines",
      label: t.tiers === 2 ? "Spines" : font.narrow ? "Aggr." : "Aggregation",
      count: t.spines,
      y: t.tiers === 2 ? 60 : H - 160,
    },
  ];
  if (t.tiers === 3)
    rows.push({ key: "cores", label: "Cores", count: t.cores, y: 20 });
  const shownOf = (r: Row) =>
    r.key === "gpus" ? Math.min(r.count, MAXDOTS) : Math.min(r.count, MAXB);

  const routeLocal = s.key === "route-local";
  const routeFar = s.key === "route-far";
  const rowByKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const at = (key: string, j: number) => {
    const r = rowByKey[key]!;
    return { x: xOf(j, shownOf(r)), y: r.y };
  };
  // the route: indices of drawn items
  const route: { x: number; y: number }[] = [];
  if (routeLocal) {
    route.push(at("gpus", 0), at("leaves", 0), at("gpus", 1));
  } else if (routeFar) {
    const g = shownOf(rowByKey.gpus!);
    const l = shownOf(rowByKey.leaves!);
    const sp = shownOf(rowByKey.spines!);
    route.push(at("gpus", 0), at("leaves", 0), at("spines", 0));
    if (t.tiers === 3) route.push(at("cores", 0), at("spines", sp - 1));
    route.push(at("leaves", l - 1), at("gpus", g - 1));
  }

  const lines = (from: Row, to: Row, local: boolean) => {
    const a = shownOf(from);
    const b = shownOf(to);
    const out: ReactNode[] = [];
    for (let i = 0; i < a; i++)
      for (let j = 0; j < b; j++) {
        // GPU dots connect to the leaf under them; 3-tier leaves to the
        // aggregation switches of their pod (roughly: the nearest ones)
        if (local && Math.floor((i * b) / a) !== j) continue;
        if (
          !local &&
          t.tiers === 3 &&
          from.key === "leaves" &&
          Math.abs(i / a - j / b) > 0.25
        )
          continue;
        out.push(
          <line
            key={`${from.key}${i}-${j}`}
            x1={xOf(i, a)}
            y1={from.y}
            x2={xOf(j, b)}
            y2={to.y}
            stroke={LINK_COLOUR.net}
            strokeWidth={0.6}
            opacity={0.45}
          />,
        );
      }
    return out;
  };

  const visual = (
    <div className="mx-auto max-w-xl">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`A ${t.tiers}-tier fat tree for ${fmtInt(n)} GPUs with ${k}-port switches: ${fmtInt(t.switches)} switches.`}
      >
        {reached("leaves") && lines(rows[0]!, rows[1]!, true)}
        {reached("spines") && lines(rows[1]!, rows[2]!, false)}
        {t.tiers === 3 && reached("cores") && lines(rows[2]!, rows[3]!, false)}
        {route.length > 1 && (
          <polyline
            points={route.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={STATE_COLOUR.active}
            strokeWidth={3}
            strokeLinejoin="round"
            data-route={routeLocal ? "local" : "far"}
          />
        )}
        {rows.map((r) => {
          if (!reached(r.key)) return null;
          const shown = shownOf(r);
          const more = r.count - shown;
          return (
            <g key={r.key} data-row={r.key} data-count={r.count}>
              <text
                x={4}
                y={r.y + 4}
                style={{ fontSize: fs(10.5) }}
                className="fill-neutral-900 font-medium dark:fill-neutral-100"
              >
                {r.label}
              </text>
              <text
                x={4}
                y={r.y + 4 + fs(12)}
                style={{ fontSize: fs(10) }}
                className="fill-neutral-600 font-mono dark:fill-neutral-400"
              >
                {fmtInt(r.count)}
              </text>
              {Array.from({ length: shown }, (_, j) =>
                r.key === "gpus" ? (
                  <circle
                    key={j}
                    cx={xOf(j, shown)}
                    cy={r.y}
                    r={4}
                    fill={LINK_COLOUR.hbm}
                  />
                ) : (
                  <rect
                    key={j}
                    x={xOf(j, shown) - 9}
                    y={r.y - 7}
                    width={18}
                    height={14}
                    rx={2}
                    fill={LINK_COLOUR.net}
                    stroke="#525252"
                    strokeWidth={0.6}
                  />
                ),
              )}
              {more > 0 && (
                <text
                  x={4}
                  y={r.y + 4 + fs(24)}
                  style={{ fontSize: fs(10) }}
                  className="fill-neutral-600 dark:fill-neutral-400"
                >
                  {shown} drawn
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        A sample of each row is drawn; the counts are the whole fabric. Blue
        line: the route of the current step.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Switches"
        value={fmtInt(s.switches)}
        hint={`${t.tiers} tiers when done`}
      />
      <Stat label="Links" value={fmtInt(s.links)} />
      <Stat
        label="Transceivers"
        value={fmtInt(t.transceivers)}
        hint={`${trim(t.per_gpu_transceivers, 3)} per GPU`}
      />
      <Stat
        label="Optics power"
        value={fmtWatts(power.total_w)}
        hint={`illustrative, at ${watts} W each`}
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="fabric-widget"
      title="Building a fat tree"
      summary={`A folded-Clos fabric of ${k}-port switches (${sw.name}, ${fmtBits(sw.port_bps)} per port), one port per GPU. Every link above the GPUs is optical here (two transceivers), and so are the GPU links.`}
      stepper={st}
      stepLabel="step"
      caption={treeCaption(t, s, steps.length)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={
        hover ??
        (s.key === "leaves"
          ? "leaf"
          : s.key === "spines"
            ? "spine"
            : s.key === "cores"
              ? "core"
              : "optics")
      }
      onEquationHover={setHover}
      countFrom={1}
      params={
        <>
          <Segmented
            label="GPUs"
            value={nS}
            options={[
              { value: "576", label: "576" },
              { value: "2048", label: "2,048" },
              { value: "9216", label: "9,216" },
              { value: "32768", label: "32,768" },
            ]}
            onChange={setN}
          />
          <Segmented
            label="Switch"
            value={wid}
            options={[
              { value: "quantum2", label: "64-port" },
              { value: "q3400", label: "144-port" },
            ]}
            onChange={setWid}
          />
          <Segmented
            label="Leaf down:up"
            value={oS}
            options={[
              { value: "1", label: "1:1" },
              { value: "2", label: "2:1" },
            ]}
            onChange={setO}
          />
          <Slider
            label="Watts per transceiver (illustrative)"
            value={watts}
            min={5}
            max={30}
            step={5}
            onChange={setWatts}
            format={(v) => `${v} W`}
          />
        </>
      }
    />
  );
}
