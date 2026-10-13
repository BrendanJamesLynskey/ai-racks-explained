"use client";

/**
 * Chapter 11's hero: what a rack costs per token, quarter by quarter. The
 * capital cost is written off in a straight line, electricity is paid at
 * the rack's stated power times a facility overhead, and the rack serves
 * the output rate chapter 8's simulation sustained. Every price is
 * illustrative. Frames are `tcoSteps` (checked against the Python
 * reference).
 */
import { useMemo, useState, type ReactNode } from "react";

import { AnimationPanel } from "@/components/anim/AnimationPanel";
import { useStepper } from "@/components/anim/useStepper";
import { Segmented, Stat } from "@/components/ui/Controls";
import { useSvgFont } from "@/components/viz/useSvgFont";
import { fmtTokens, fmtUsd, pct, trim } from "@/lib/format";
import { tcoCaption } from "@/lib/racks/captions";
import { tco, tcoSteps } from "@/lib/racks/model";
import { costInputs } from "@/lib/racks/values";
import { MUTED, OKABE_ITO, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const H = 200;
const X0 = 46;
const X1 = 350;
const Y0 = 18;
const Y1 = 168;
const CAPEX = OKABE_ITO.blue;
const ENERGY = OKABE_ITO.orange;

export default function CostWidget({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const ci = costInputs();
  const [capex, setCapex] = useState<string>(String(ci.capex_rack_usd));
  const [kwh, setKwh] = useState<string>(String(ci.usd_per_kwh));
  const [util, setUtil] = useState<string>(String(ci.utilisation));
  const [hover, setHover] = useState<string | null>(null);
  const font = useSvgFont(W);
  const fs = font.fs;

  const cap = Number(capex);
  const e = Number(kwh);
  const u = Number(util);
  const { years, rack_w: rackW, pue, tok_s: tokS } = ci;
  const c = useMemo(
    () => tco(cap, years, rackW, pue, e, tokS, u),
    [cap, years, rackW, pue, e, tokS, u],
  );
  const steps = useMemo(
    () => tcoSteps(cap, years, rackW, pue, e, tokS, u),
    [cap, years, rackW, pue, e, tokS, u],
  );
  const st = useStepper(steps.length, {
    stepMs: 600,
    resetKey: `${capex}|${kwh}|${util}`,
  });
  const k = st.step;
  const s = steps[k]!;
  const last = steps[steps.length - 1]!;
  const top = (last.capex + last.energy) * 1.05;
  const bw = (X1 - X0) / steps.length;
  const y = (v: number) => Y1 - ((Y1 - Y0) * v) / top;

  const visual = (
    <div className="mx-auto max-w-md">
      <svg
        ref={font.ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Cumulative cost of one rack by quarter, quarter ${k} of ${steps.length - 1}.`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={X0}
              x2={X1}
              y1={y(f * top)}
              y2={y(f * top)}
              stroke={MUTED.light}
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text
              x={X0 - 4}
              y={y(f * top) + 3.5}
              textAnchor="end"
              style={{ fontSize: fs(10) }}
              className="fill-neutral-600 font-mono dark:fill-neutral-400"
            >
              {fmtUsd(f * top)}
            </text>
          </g>
        ))}
        {steps.slice(0, k + 1).map((q) => (
          <g key={q.q} data-quarter={q.q}>
            <rect
              x={X0 + q.q * bw + 1}
              y={y(q.capex)}
              width={bw - 2}
              height={Y1 - y(q.capex)}
              fill={CAPEX}
              fillOpacity={q.q === k ? 1 : 0.6}
            />
            <rect
              x={X0 + q.q * bw + 1}
              y={y(q.capex + q.energy)}
              width={bw - 2}
              height={y(q.capex) - y(q.capex + q.energy)}
              fill={ENERGY}
              fillOpacity={q.q === k ? 1 : 0.6}
            />
          </g>
        ))}
        <line
          x1={X0 + (k + 0.5) * bw}
          x2={X0 + (k + 0.5) * bw}
          y1={Y0 - 4}
          y2={Y1}
          stroke={STATE_COLOUR.active}
          strokeWidth={1}
          opacity={0.5}
        />
        <text
          x={X0}
          y={Y1 + fs(13)}
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          year 0
        </text>
        <text
          x={X1}
          y={Y1 + fs(13)}
          textAnchor="end"
          style={{ fontSize: fs(10) }}
          className="fill-neutral-600 font-mono dark:fill-neutral-400"
        >
          year {ci.years}
        </text>
        <text
          x={X0 + 4}
          y={Y0 + 6}
          style={{ fontSize: fs(11) }}
          className="fill-neutral-800 font-medium dark:fill-neutral-200"
        >
          {s.usd_per_mtok === null
            ? "nothing served yet"
            : `${fmtUsd(s.usd_per_mtok)} per million tokens`}
        </text>
      </svg>
      <p className="mt-1 text-[0.7rem] text-neutral-600 dark:text-neutral-400">
        Blue: capital written off so far. Orange: electricity so far. One bar a
        quarter; the running cost per token is the total over the tokens served
        ({fmtTokens(s.tokens)} by this quarter).
      </p>
    </div>
  );

  const stats = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Per million tokens"
        value={fmtUsd(c.usd_per_mtok)}
        hint="illustrative prices"
      />
      <Stat
        label="Capital's share"
        value={pct(c.capex_share)}
        hint={`${fmtUsd(c.capex_yr)} a year`}
      />
      <Stat
        label="Electricity"
        value={`${fmtUsd(c.energy_usd_yr)} a year`}
        hint={`${trim(c.energy_kwh_yr / 1e6, 3)} GWh at PUE ${ci.pue}`}
      />
      <Stat
        label="Tokens/s per MW"
        value={`${trim(c.tok_s_per_mw / 1e3, 3)}k`}
        hint="facility power, rack at its stated draw"
      />
    </div>
  );

  return (
    <AnimationPanel
      testId="cost-widget"
      title="A rack's cost per token, quarter by quarter"
      summary={`One GB200 NVL72-class rack serving chapter 8's sustained ${trim(ci.tok_s / 1e3, 3)}k output tokens a second. Capital cost, electricity price, utilisation and PUE are illustrative round numbers, not prices.`}
      stepper={st}
      stepLabel="quarter"
      countFrom={0}
      caption={tcoCaption(s, steps.length)}
      visual={visual}
      stats={stats}
      equation={children}
      hl={hover ?? "capex energy tokens"}
      onEquationHover={setHover}
      params={
        <>
          <Segmented
            label="Capital cost per rack"
            value={capex}
            options={[
              { value: String(2e6), label: "$2M" },
              { value: String(3.5e6), label: "$3.5M" },
              { value: String(5e6), label: "$5M" },
            ]}
            onChange={setCapex}
          />
          <Segmented
            label="Electricity per kWh"
            value={kwh}
            options={[
              { value: "0.05", label: "$0.05" },
              { value: "0.1", label: "$0.10" },
              { value: "0.15", label: "$0.15" },
            ]}
            onChange={setKwh}
          />
          <Segmented
            label="Utilisation"
            value={util}
            options={[
              { value: "0.5", label: "50%" },
              { value: "0.7", label: "70%" },
              { value: "0.9", label: "90%" },
            ]}
            onChange={setUtil}
          />
        </>
      }
    />
  );
}
