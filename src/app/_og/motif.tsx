/**
 * This site's favicon glyph (src/app/icon.svg) and its card's graphic.
 * Glyph: the chip of the Hardware track, the letter R, #7c3aed.
 */
import { ladder } from "@/lib/racks/model";
import { LINK_COLOUR, linkKind } from "@/lib/viz/palette";

export function Glyph({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect x="3.5" y="3.5" width="25" height="25" rx="2.5" fill="#7c3aed" />
      <path
        d="M9 0h3v4h-3zM20 0h3v4h-3zM9 28h3v4h-3zM20 28h3v4h-3zM0 9h4v3h-4zM0 20h4v3h-4zM28 9h4v3h-4zM28 20h4v3h-4z"
        fill="#7c3aed"
      />
      <path
        d="M14.49 9Q17.35 9 18.72 10.04Q20.08 11.08 20.08 13.2Q20.08 14.16 19.72 14.87Q19.35 15.59 18.75 16.09Q18.16 16.59 17.47 16.9L21.59 23H18.29L14.96 17.63H13.37V23H10.41V9ZM14.27 11.43H13.37V15.22H14.33Q15.8 15.22 16.44 14.73Q17.08 14.24 17.08 13.27Q17.08 12.27 16.4 11.85Q15.73 11.43 14.27 11.43Z"
        fill="#fff"
      />
    </svg>
  );
}

/**
 * The landing hero's ladder: the bandwidth one GPU has at each rung of a GB200 NVL72 cluster,
 * log scale, coloured by link, from the model at build time.
 */
export function Motif(): JSX.Element {
  const rungs = ladder();
  const lo = Math.log10(Math.min(...rungs.map((r) => r.bw))) - 0.6;
  const hi = Math.log10(Math.max(...rungs.map((r) => r.bw))) + 0.05;
  const h = Math.min(56, 380 / rungs.length - 12);
  return (
    <svg width="440" height="420" viewBox="0 0 440 420">
      {rungs.map((r, i) => (
        <g key={r.key}>
          <rect
            x={10}
            y={20 + i * (h + 12)}
            width={420}
            height={h}
            rx={8}
            fill="#1e293b"
          />
          <rect
            x={10}
            y={20 + i * (h + 12)}
            width={(420 * (Math.log10(r.bw) - lo)) / (hi - lo)}
            height={h}
            rx={8}
            fill={LINK_COLOUR[linkKind(r.link)]}
          />
        </g>
      ))}
    </svg>
  );
}
