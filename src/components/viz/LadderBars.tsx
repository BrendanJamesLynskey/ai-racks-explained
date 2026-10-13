/**
 * The home page's picture: bandwidth per GPU at each rung of the ladder,
 * log scale, from the model (`ladder`). Server Component.
 */
import { fmtInt, fmtRate } from "@/lib/format";
import { ladder } from "@/lib/racks/model";
import { LINK_COLOUR, linkKind } from "@/lib/viz/palette";

export function LadderBars(): JSX.Element {
  const rungs = ladder();
  const lo = Math.log10(Math.min(...rungs.map((r) => r.bw))) - 0.6;
  const hi = Math.log10(Math.max(...rungs.map((r) => r.bw))) + 0.05;
  return (
    <ol
      className="space-y-1.5"
      aria-label="Bandwidth per GPU at each rung, log scale"
    >
      {rungs.map((r) => (
        <li key={r.key} className="text-xs">
          <div className="flex justify-between gap-2 text-neutral-700 dark:text-neutral-300">
            <span>{r.name.replace(" (NVLink domain)", "")}</span>
            <span className="font-mono">
              {fmtInt(r.gpus)} GPU{r.gpus > 1 ? "s" : ""}
            </span>
          </div>
          <span className="relative mt-0.5 block h-5 rounded bg-neutral-100 dark:bg-neutral-800">
            <span
              className="absolute inset-y-0 left-0 rounded"
              style={{
                width: `${((Math.log10(r.bw) - lo) / (hi - lo)) * 100}%`,
                background: LINK_COLOUR[linkKind(r.link)],
              }}
            />
            <span className="absolute inset-y-0 left-1 flex items-center font-mono text-[0.7rem] text-neutral-950">
              {r.link} {fmtRate(r.bw)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
