"use client";

/**
 * Chapter 1's hero: an animated zoom from one GPU package out to a hall of
 * racks. Each rung is drawn as its parts (dies, GPUs and CPUs, trays,
 * racks, scalable units); the part the previous rung lives in is outlined,
 * and moving to the next step zooms the camera out of it. Below, the
 * bandwidth each GPU has at every rung, on a log scale. Every number comes
 * from `ladder` (the model, checked against the Python reference).
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBytes, fmtInt, fmtRate, fmtTime, fmtWatts } from "@/lib/format";
import { ladderCaption } from "@/lib/racks/captions";
import { ladder, type Rung, type RungKey } from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR, linkKind } from "@/lib/viz/palette";

const W = 360;
const H = 200;
/** Every part a rung zooms out of has this aspect, so the zoom is exact. */
const ASPECT = W / H;

type Cell = { x: number; y: number; w: number; h: number; kind: string };

/** A grid of `count` cells of aspect ASPECT, centred in the frame. */
function grid(
  count: number,
  cols: number,
  kind: (i: number) => string,
  fill = 0.86,
): Cell[] {
  const rows = Math.ceil(count / cols);
  const gap = 0.12;
  const cw = Math.min(
    (W * fill) / (cols + (cols - 1) * gap),
    (H * fill * ASPECT) / (rows + (rows - 1) * gap),
  );
  const ch = cw / ASPECT;
  const tw = cols * cw + (cols - 1) * gap * cw;
  const th = rows * ch + (rows - 1) * gap * ch;
  const x0 = (W - tw) / 2;
  const y0 = (H - th) / 2 + 6;
  const out: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out.push({
      x: x0 + c * cw * (1 + gap),
      y: y0 + r * ch * (1 + gap),
      w: cw,
      h: ch,
      kind: kind(i),
    });
  }
  return out;
}

/** The parts of each rung; cell 0 is where the rung below lives. */
function cellsOf(r: Rung): Cell[] {
  switch (r.key as RungKey) {
    case "package":
      return [];
    case "tray":
      // 4 GPUs (top two rows) and 2 Grace CPUs (bottom row)
      return grid(6, 2, (i) => (i < 4 ? "gpu" : "cpu"), 0.8);
    case "rack":
      // 18 compute trays and 9 NVLink switch trays (centre column)
      return grid(27, 3, (i) => (i % 3 === 1 ? "switch" : "tray"), 0.9).sort(
        (a, b) => (a.kind === "tray" ? 0 : 1) - (b.kind === "tray" ? 0 : 1),
      );
    case "su":
      return grid(r.children, 4, () => "rack");
    case "pod":
      return grid(r.children, 4, () => "su");
    default:
      return grid(
        r.children,
        Math.ceil(Math.sqrt(r.children * ASPECT)),
        () => "rack",
        0.95,
      );
  }
}

const KIND_FILL: Record<string, string> = {
  gpu: LINK_COLOUR.hbm,
  cpu: "#525252",
  tray: "#a3a3a3",
  switch: LINK_COLOUR.nvlink,
  rack: "#a3a3a3",
  su: "#a3a3a3",
};

/** The package: two dies between HBM sites (stack count not drawn). */
function packageShapes(): ReactNode {
  const die = { w: 92, h: 120 };
  const y = (H - die.h) / 2 + 6;
  return (
    <g>
      <rect
        x={60}
        y={y - 16}
        width={240}
        height={die.h + 32}
        rx={8}
        fill="none"
        stroke="#a3a3a3"
        strokeWidth={1.5}
      />
      {[0, 1].map((d) => (
        <rect
          key={d}
          x={84 + d * (die.w + 8)}
          y={y}
          width={die.w}
          height={die.h}
          rx={4}
          fill={STATE_COLOUR.compute}
          opacity={0.75}
        />
      ))}
      {[0, 1].map((side) => (
        <rect
          key={`hbm${side}`}
          x={side ? 84 + 2 * die.w + 8 + 4 : 66}
          y={y}
          width={14}
          height={die.h}
          rx={2}
          fill={LINK_COLOUR.hbm}
        />
      ))}
    </g>
  );
}

function sceneShapes(r: Rung, depth: number): ReactNode {
  if (r.key === "package") return packageShapes();
  const cells = cellsOf(r);
  return (
    <g>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          rx={Math.min(3, c.w / 8)}
          fill={KIND_FILL[c.kind]}
          fillOpacity={i === 0 && depth <= 1 ? 0.08 : 0.55}
          stroke={i === 0 && depth <= 1 ? STATE_COLOUR.active : "none"}
          strokeWidth={i === 0 && depth <= 1 ? 2 : 0}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export default function LadderWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [payload, setPayload] = useState<string>("1e9");
  const P = Number(payload);
  const rungs = useMemo(() => ladder("gb200-nvl72", P), [P]);
  const st = useStepper(rungs.length, {
    stepMs: 1600,
    smooth: true,
    resetKey: payload,
  });
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const i = st.step;
  const r = rungs[i]!;
  const next = rungs[i + 1];
  const f = next ? st.frac : 0;

  // the camera: at f = 0 it frames cell 0 of the next rung (where this rung
  // lives), at f = 1 the whole next rung; widths interpolate geometrically
  let view: ReactNode;
  if (next) {
    const cell = cellsOf(next)[0]!;
    const cw = Math.pow(cell.w, 1 - f) * Math.pow(W, f);
    const t = (cw - cell.w) / (W - cell.w);
    const camX = cell.x * (1 - t);
    const camY = cell.y * (1 - t);
    const k = W / cw;
    view = (
      <g transform={`scale(${k}) translate(${-camX} ${-camY})`}>
        {sceneShapes(next, 0)}
        <g transform={`translate(${cell.x} ${cell.y}) scale(${cell.w / W})`}>
          {sceneShapes(r, 1)}
        </g>
      </g>
    );
  } else view = sceneShapes(r, 0);

  const shown = next && f >= 0.5 ? next : r;
  const kindNow = linkKind(r.link);
  const maxBw = rungs[0]!.bw;
  const minBw = Math.min(...rungs.map((x) => x.bw));
  const lo = Math.log10(minBw) - 0.6;
  const hi = Math.log10(maxBw) + 0.05;
  const barPct = (bw: number) => ((Math.log10(bw) - lo) / (hi - lo)) * 100;

  const visual = (
    <div className="mx-auto max-w-xl">
      <p className="mb-1 flex justify-between gap-2 text-sm">
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
          {shown.name}
        </span>
        <span className="font-mono text-neutral-700 dark:text-neutral-300">
          {fmtInt(shown.gpus)} GPU{shown.gpus > 1 ? "s" : ""}
        </span>
      </p>
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full rounded bg-white dark:bg-neutral-950"
        role="img"
        aria-label={`Zoom from one GPU to a hall: now showing the ${shown.name.toLowerCase()}, ${fmtInt(shown.gpus)} GPUs.`}
      >
        <defs>
          <clipPath id="ladder-clip">
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#ladder-clip)">{view}</g>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        {[
          ["GPU die", STATE_COLOUR.compute],
          ["HBM / GPU", LINK_COLOUR.hbm],
          ["Grace CPU", "#525252"],
          ["NVLink switch tray", LINK_COLOUR.nvlink],
          ["tray / rack / SU", "#a3a3a3"],
        ].map(([label, c]) => (
          <li key={label} className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: c }}
            />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm border-2"
            style={{ borderColor: STATE_COLOUR.active }}
          />
          where the rung below sits
        </li>
      </ul>
      <ol
        className="mt-3 space-y-1"
        aria-label="Bandwidth per GPU at each rung (log scale)"
      >
        {rungs.map((x) => {
          const kind = linkKind(x.link);
          const on = x.i === i;
          return (
            <li
              key={x.key}
              data-rung={x.key}
              className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs"
            >
              <span
                className={
                  on
                    ? "font-semibold text-neutral-900 dark:text-neutral-100"
                    : "text-neutral-600 dark:text-neutral-400"
                }
              >
                {x.name.replace(" (NVLink domain)", "")}
              </span>
              <span className="relative block h-5 rounded bg-neutral-100 dark:bg-neutral-800">
                <span
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${barPct(x.bw)}%`,
                    background: LINK_COLOUR[kind],
                    opacity: on ? 1 : 0.45,
                    outline: on
                      ? `2px solid ${STATE_COLOUR.active}`
                      : undefined,
                  }}
                />
                <span className="absolute inset-y-0 left-1 flex items-center font-mono text-[0.7rem] text-neutral-950">
                  {x.link} {fmtRate(x.bw)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Bars: bandwidth per GPU, log scale (each tick of length is a factor of
        10). HBM is a read or write rate; NVLink and the network are per
        direction.
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="GPUs" value={fmtInt(r.gpus)} />
      <Stat label="Per GPU" value={fmtRate(r.bw)} hint={r.link} />
      <Stat label={`${fmtBytes(P)} takes`} value={fmtTime(r.time)} />
      <Stat
        label="Rack power"
        value={fmtWatts(r.power_w)}
        hint="of these GPUs"
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="ladder-widget"
      title="From one GPU to a hall"
      summary="GB200 NVL72 racks in NVIDIA's published SuperPOD design, then a hall sized by power. Each step zooms out one rung; the bars show how fast one GPU can move data at that rung."
      stepper={st}
      stepLabel="rung"
      caption={ladderCaption(r, rungs.length, P)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? (kindNow === "nvlink" ? "nvl" : kindNow)}
      onEquationHover={setHover}
      countFrom={1}
      params={
        <Segmented
          label="Payload"
          value={payload}
          options={[
            { value: "1e9", label: "1 GB" },
            { value: String(0.5e9), label: "0.5 GB" },
            { value: String(2e9), label: "2 GB" },
          ]}
          onChange={setPayload}
        />
      }
    />
  );
}
