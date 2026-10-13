/**
 * Number formatting for the captions and readouts: SI prefixes for bytes,
 * byte rates, bit rates, watts and FLOPs.
 */

function si(v: number, units: [number, string][], digits = 3): string {
  for (const [scale, unit] of units) {
    if (Math.abs(v) >= scale) return `${trim(v / scale, digits)} ${unit}`;
  }
  const last = units[units.length - 1] as [number, string];
  return `${trim(v / last[0], digits)} ${last[1]}`;
}

/** Up to `digits` significant figures, without trailing zeros. */
export function trim(v: number, digits = 3): string {
  if (v === 0) return "0";
  const s = Number(v.toPrecision(digits));
  return s.toLocaleString("en-GB", { maximumFractionDigits: 6 });
}

export function fmtBytes(b: number): string {
  return si(b, [
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "kB"],
    [1, "B"],
  ]);
}

/** Binary sizes as the vendors state them (KB = 1024 bytes). */
export function fmtKiB(b: number): string {
  if (b >= 1024 * 1024) return `${trim(b / (1024 * 1024))} MB`;
  if (b >= 1024) return `${trim(b / 1024)} KB`;
  return `${b} B`;
}

export function fmtRate(bps: number): string {
  return si(
    bps,
    [
      [1e12, "TB/s"],
      [1e9, "GB/s"],
      [1e6, "MB/s"],
      [1, "B/s"],
    ],
    4,
  );
}

export function fmtFlops(f: number): string {
  return si(f, [
    [1e12, "TFLOP/s"],
    [1e9, "GFLOP/s"],
    [1e6, "MFLOP/s"],
    [1, "FLOP/s"],
  ]);
}

export function fmtTime(s: number): string {
  if (s === 0) return "0 s";
  if (s >= 1) return `${trim(s)} s`;
  if (s >= 1e-3) return `${trim(s * 1e3)} ms`;
  if (s >= 1e-6) return `${trim(s * 1e6)} µs`;
  return `${trim(s * 1e9)} ns`;
}

export function pct(f: number, digits = 0): string {
  return `${(f * 100).toFixed(digits)}%`;
}

/** Arithmetic intensity, flop per byte. */
export function fmtAi(ai: number): string {
  return `${trim(ai, 3)} flop/byte`;
}

/** A link speed in bits per second (network ports are quoted in bits). */
export function fmtBits(bps: number): string {
  return si(bps, [
    [1e12, "Tb/s"],
    [1e9, "Gb/s"],
    [1e6, "Mb/s"],
    [1, "b/s"],
  ]);
}

export function fmtWatts(w: number): string {
  return si(w, [
    [1e6, "MW"],
    [1e3, "kW"],
    [1, "W"],
  ]);
}

/** A whole count with thousands separators. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** A temperature in degrees Celsius. */
export function fmtTemp(c: number): string {
  return `${trim(c, 3)} °C`;
}

/** A price in US dollars (illustrative figures only on this site). */
export function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1e6) return `$${trim(v / 1e6, 3)}M`;
  if (Math.abs(v) >= 1e3) return `$${trim(v / 1e3, 3)}k`;
  return `$${trim(v, 3)}`;
}

/** Energy in joules. */
export function fmtJoules(j: number): string {
  return si(j, [
    [1e6, "MJ"],
    [1e3, "kJ"],
    [1, "J"],
  ]);
}

/** A large count of tokens (millions, billions, trillions). */
export function fmtTokens(n: number): string {
  return si(n, [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1, ""],
  ]).trim();
}
