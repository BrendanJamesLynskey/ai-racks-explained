/**
 * Chapter 4's wiring figure (static: the structure is the point). The 72
 * GPUs of a GB200 NVL72 sit in 18 compute trays; the 18 NVLink switch chips
 * sit in 9 switch trays. Every GPU has one link to every switch chip, so any
 * GPU reaches any other in one switch hop. Counts come from `nvlinkDomain`.
 * Server Component.
 */
import { fmtInt, fmtRate } from "@/lib/format";
import { gpu, nvlinkDomain, system } from "@/lib/racks/model";
import { LINK_COLOUR, STATE_COLOUR } from "@/lib/viz/palette";

const W = 360;
const H = 256;

export function Nvl72Diagram(): JSX.Element {
  const d = nvlinkDomain();
  const s = system("gb200-nvl72");
  const g = gpu("b200");
  const chips = d.chips;
  const trays = s.compute_trays as number;
  const perTray = s.gpus_per_tray as number;
  const chipW = (W - 24) / chips;
  const chipY = 40;
  const trayW = (W - 24) / trays;
  const gpuY = 190;
  const chipX = (c: number) => 12 + c * chipW + chipW / 2;
  const gpuX = (t: number, j: number) =>
    12 + t * trayW + ((j + 0.5) * trayW) / perTray;
  return (
    <figure className="my-6 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`NVL72 wiring: ${fmtInt(s.gpus as number)} GPUs, each with one NVLink to each of ${chips} switch chips; ${fmtInt(d.links)} links in all.`}
      >
        <text
          x={12}
          y={16}
          className="fill-neutral-900 font-semibold dark:fill-neutral-100"
          style={{ fontSize: 12 }}
        >
          {chips} NVLink switch chips ({s.switch_trays as number} trays ×{" "}
          {s.switch_chips_per_tray as number})
        </text>
        {Array.from({ length: chips }, (_, c) => (
          <rect
            key={c}
            x={12 + c * chipW + 1}
            y={chipY - 14}
            width={chipW - 2}
            height={18}
            rx={2}
            fill={LINK_COLOUR.nvlink}
            opacity={0.85}
          />
        ))}
        {/* GPU 0's links: one to every chip */}
        {Array.from({ length: chips }, (_, c) => (
          <line
            key={`l${c}`}
            x1={gpuX(0, 0)}
            y1={gpuY - 6}
            x2={chipX(c)}
            y2={chipY + 4}
            stroke={STATE_COLOUR.active}
            strokeWidth={1}
            opacity={0.8}
          />
        ))}
        {/* and GPU 71's, faint */}
        {Array.from({ length: chips }, (_, c) => (
          <line
            key={`m${c}`}
            x1={gpuX(trays - 1, perTray - 1)}
            y1={gpuY - 6}
            x2={chipX(c)}
            y2={chipY + 4}
            stroke="#737373"
            strokeWidth={0.6}
            opacity={0.5}
          />
        ))}
        {Array.from({ length: trays }, (_, t) =>
          Array.from({ length: perTray }, (_, j) => (
            <rect
              key={`${t}-${j}`}
              x={gpuX(t, j) - trayW / perTray / 2 + 0.5}
              y={gpuY - 6}
              width={trayW / perTray - 1}
              height={14}
              fill={LINK_COLOUR.hbm}
              opacity={t === 0 && j === 0 ? 1 : 0.55}
              stroke={t === 0 && j === 0 ? STATE_COLOUR.active : "none"}
              strokeWidth={1.5}
            />
          )),
        )}
        <text
          x={12}
          y={gpuY + 26}
          className="fill-neutral-900 font-semibold dark:fill-neutral-100"
          style={{ fontSize: 12 }}
        >
          {fmtInt(s.gpus as number)} GPUs ({trays} trays × {perTray})
        </text>
        <text
          x={12}
          y={gpuY + 44}
          className="fill-neutral-700 dark:fill-neutral-300"
          style={{ fontSize: 11 }}
        >
          {g.nvlink_links} links per GPU × {fmtRate(s.link_bidir as number)} ={" "}
          {fmtRate(d.per_gpu_bidir)}
        </text>
        <text
          x={12}
          y={gpuY + 60}
          className="fill-neutral-700 dark:fill-neutral-300"
          style={{ fontSize: 11 }}
        >
          {fmtInt(d.links)} links fill the chips&apos; {fmtInt(d.ports)} ports
          exactly
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        Blue: GPU 0&apos;s {g.nvlink_links} links, one to each switch chip;
        grey: the last GPU&apos;s. Every GPU is wired the same way, so every
        pair of GPUs is one switch hop apart (NVIDIA DGX GB200 user guide; GB200
        NVL72 technical blog). Link speeds are bidirectional totals, as NVIDIA
        quotes them.
      </figcaption>
    </figure>
  );
}
