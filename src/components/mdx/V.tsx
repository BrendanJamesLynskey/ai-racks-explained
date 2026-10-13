/**
 * <V of="gpu.b300.hbm_bw" fmt="rate" />: a number from the tested model,
 * formatted, in running prose. Server Component.
 */
import { formatValue, lookup, type Fmt } from "@/lib/racks/values";

export function V({ of, fmt = "num" }: { of: string; fmt?: Fmt }): JSX.Element {
  return <span data-v={of}>{formatValue(lookup(of), fmt)}</span>;
}
