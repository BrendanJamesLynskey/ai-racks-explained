"use client";

/**
 * Chapter 4's second animation: the latency term. The same all-reduce, from
 * a kilobyte to a gigabyte, on one NVLink domain: the bandwidth-only time
 * (dashed), the alpha-beta time for the ring (2(n - 1) steps, each paying a
 * fixed alpha) and for the in-switch reduction (one fixed cost). Alpha is
 * calibrated on measured NCCL all-reduces of small messages. Every frame is
 * one message size of `abSweep` (checked against the Python reference); the
 * bar underneath splits the ring's time into latency and bandwidth.
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtBytes, fmtTime, pct } from "@/lib/format";
import { abCaption } from "@/lib/racks/captions";
import { abSweep, decodeAllreduce, type GpuId } from "@/lib/racks/model";
import { LINK_COLOUR, MUTED, OKABE_ITO, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;

export default function AlphaBetaWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [gid, setGid] = useState<GpuId>("b200");
  const [nS, setN] = useState<string>("8");
  const n = Number(nS);
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;
  const sweep = useMemo(() => abSweep(gid, n), [gid, n]);
  const dec = useMemo(() => decodeAllreduce(8, n, gid), [gid, n]);
  const st = useStepper(sweep.length, {
    stepMs: 1100,
    resetKey: `${gid}-${n}`,
  });
  const x = sweep[st.step]!;
  const name = gid === "b200" ? "B200" : "H200";

  // log-log axes
  const L = 40;
  const R = W - 8;
  const T = 10;
  const B = 150;
  const sx0 = Math.log10(sweep[0]!.size);
  const sx1 = Math.log10(sweep[sweep.length - 1]!.size);
  let tmin = Infinity;
  let tmax = 0;
  for (const p of sweep) {
    tmin = Math.min(tmin, p.ringBwOnly, p.switchBwOnly);
    tmax = Math.max(tmax, p.ring.t);
  }
  const ty0 = Math.floor(Math.log10(tmin));
  const ty1 = Math.ceil(Math.log10(tmax));
  const X = (s: number) => L + ((Math.log10(s) - sx0) / (sx1 - sx0)) * (R - L);
  const Y = (t: number) => B - ((Math.log10(t) - ty0) / (ty1 - ty0)) * (B - T);
  const line = (f: (p: (typeof sweep)[number]) => number) =>
    sweep.map((p) => `${X(p.size)},${Y(f(p))}`).join(" ");
  const barY = B + 40;
  const H = barY + 40;

  const visual = (
    <div className="mx-auto max-w-lg">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`All-reduce time against message size on ${n} ${name}s, log-log: at ${fmtBytes(x.size)} the ring takes ${fmtTime(x.ring.t)}.`}
        data-size={x.size}
      >
        {Array.from({ length: ty1 - ty0 + 1 }, (_, i) => ty0 + i).map((e) => (
          <g key={e}>
            <line
              x1={L}
              x2={R}
              y1={Y(10 ** e)}
              y2={Y(10 ** e)}
              stroke={MUTED.light}
              strokeWidth={0.3}
            />
            <text
              x={L - 3}
              y={Y(10 ** e) + 3}
              textAnchor="end"
              style={{ fontSize: fs(8) }}
              className="fill-neutral-600 dark:fill-neutral-400"
            >
              {fmtTime(10 ** e)}
            </text>
          </g>
        ))}
        {[1e3, 1e6, 1e9].map((s) => (
          <text
            key={s}
            x={X(s)}
            y={B + 12}
            textAnchor={s === 1e9 ? "end" : s === 1e3 ? "start" : "middle"}
            style={{ fontSize: fs(8) }}
            className="fill-neutral-600 dark:fill-neutral-400"
          >
            {fmtBytes(s)}
          </text>
        ))}
        {/* the decode all-reduce of Llama 3 70B at batch 8 */}
        <line
          x1={X(dec.size)}
          x2={X(dec.size)}
          y1={T}
          y2={B}
          stroke={OKABE_ITO.orange}
          strokeDasharray="3 2"
        />
        <text
          x={X(dec.size) + 3}
          y={T + 8}
          style={{ fontSize: fs(8) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          decode, batch 8
        </text>
        <polyline
          points={line((p) => p.ringBwOnly)}
          fill="none"
          stroke={MUTED.light}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          data-curve="bw"
        />
        <polyline
          points={line((p) => p.ring.t)}
          fill="none"
          stroke={LINK_COLOUR.nvlink}
          strokeWidth={2}
          data-curve="ring"
        />
        <polyline
          points={line((p) => p.switch.t)}
          fill="none"
          stroke={OKABE_ITO.blue}
          strokeWidth={2}
          data-curve="switch"
        />
        <line
          x1={X(x.size)}
          x2={X(x.size)}
          y1={T}
          y2={B}
          stroke={STATE_COLOUR.active}
          strokeWidth={1.2}
        />
        <circle
          cx={X(x.size)}
          cy={Y(x.ring.t)}
          r={3.5}
          fill={LINK_COLOUR.nvlink}
        />
        <circle
          cx={X(x.size)}
          cy={Y(x.switch.t)}
          r={3.5}
          fill={OKABE_ITO.blue}
        />
        <circle
          cx={X(x.size)}
          cy={Y(x.ringBwOnly)}
          r={3}
          fill="none"
          stroke={MUTED.light}
        />
        {/* the ring's time split */}
        <text
          x={L}
          y={barY - 6}
          style={{ fontSize: fs(9) }}
          className="fill-neutral-800 dark:fill-neutral-200"
        >
          ring at {fmtBytes(x.size)}: latency {pct(x.ring.latShare)} · bandwidth{" "}
          {pct(1 - x.ring.latShare)}
        </text>
        <rect
          x={L}
          y={barY}
          width={(R - L) * x.ring.latShare}
          height={12}
          fill={OKABE_ITO.vermillion}
          data-term="lat"
        />
        <rect
          x={L + (R - L) * x.ring.latShare}
          y={barY}
          width={(R - L) * (1 - x.ring.latShare)}
          height={12}
          fill={LINK_COLOUR.nvlink}
          data-term="bw"
        />
        <text
          x={L}
          y={barY + 26}
          style={{ fontSize: fs(8) }}
          className="fill-neutral-700 dark:fill-neutral-300"
        >
          green ring · blue in-switch · dashed bandwidth only
        </text>
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Log-log. Alpha comes from NCCL all-reduces measured on an eight-GPU
        NVLink 4 node; NVIDIA does not publish NVLink 5&apos;s latency, so the
        B200 curve assumes the same alpha.
      </p>
    </div>
  );

  return (
    <AnimationPanel
      testId="ab-widget"
      title="Small messages pay the latency term"
      summary={`An all-reduce on ${n} ${name}s of one NVLink domain, from a kilobyte to a gigabyte: ring and in-switch, with the latency term, against the bandwidth-only time.`}
      stepper={st}
      stepLabel="size"
      caption={abCaption(x, n, name)}
      visual={visual}
      equation={children}
      hl={hover ?? (x.ring.latShare >= 0.5 ? "rs" : "nvl")}
      onEquationHover={setHover}
      countFrom={0}
      stats={
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Ring" value={fmtTime(x.ring.t)} />
          <Stat label="Bandwidth only" value={fmtTime(x.ringBwOnly)} />
          <Stat label="In-switch" value={fmtTime(x.switch.t)} />
          <Stat
            label="Ring crossover"
            value={fmtBytes(x.ring.crossover)}
            hint="latency = bandwidth"
          />
        </div>
      }
      params={
        <>
          <Segmented
            label="GPU"
            value={gid}
            options={[
              { value: "b200", label: "B200 (NVLink 5)" },
              { value: "h200", label: "H200 (NVLink 4, measured)" },
            ]}
            onChange={(v) => {
              setGid(v as GpuId);
              if (v === "h200" && nS === "72") setN("8");
            }}
          />
          <Segmented
            label="GPUs"
            value={nS}
            options={(gid === "h200" ? ["4", "8"] : ["4", "8", "72"]).map(
              (v) => ({ value: v, label: v }),
            )}
            onChange={setN}
          />
        </>
      }
    />
  );
}
