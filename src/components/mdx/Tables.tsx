/**
 * Sourced tables for the chapters and the /specs page. Server Components.
 *
 * <SpecTable kind="gpu" ids="h100,b300" fields="hbm_bytes,hbm_bw" /> prints
 * each field of each record with its status, and links its source (title
 * and access date on hover). <ValidationTable only="superpod" /> prints the
 * model against published figures.
 */
import {
  fmtBits,
  fmtBytes,
  fmtFlops,
  fmtInt,
  fmtRate,
  fmtWatts,
  trim,
} from "@/lib/format";
import {
  GPU_RECORDS,
  SOURCES,
  SWITCH_RECORDS,
  SYSTEM_RECORDS,
  validation,
  type Field,
} from "@/lib/racks/model";

/** How each field is printed, and its row label. */
export const FIELD_INFO: Record<
  string,
  { label: string; fmt: (v: number) => string }
> = {
  hbm_bytes: { label: "HBM capacity", fmt: fmtBytes },
  hbm_bw: { label: "HBM bandwidth", fmt: fmtRate },
  hbm_stacks: { label: "HBM stacks", fmt: fmtInt },
  tdp_w: { label: "Max power", fmt: fmtWatts },
  nvlink_bidir: { label: "NVLink per GPU (both directions)", fmt: fmtRate },
  nvlink_links: { label: "NVLink links per GPU", fmt: fmtInt },
  pcie_bidir: { label: "PCIe (both directions)", fmt: fmtRate },
  dense_fp8: { label: "FP8, dense", fmt: fmtFlops },
  dense_bf16: { label: "BF16, dense", fmt: fmtFlops },
  dies: { label: "Compute dies", fmt: fmtInt },
  transistors: { label: "Transistors", fmt: (v) => `${trim(v / 1e9)} billion` },
  gpus: { label: "GPUs", fmt: fmtInt },
  cpus: { label: "CPUs", fmt: fmtInt },
  compute_trays: { label: "Compute trays", fmt: fmtInt },
  gpus_per_tray: { label: "GPUs per tray", fmt: fmtInt },
  cpus_per_tray: { label: "CPUs per tray", fmt: fmtInt },
  switch_trays: { label: "NVLink switch trays", fmt: fmtInt },
  switch_chips_per_tray: { label: "Switch chips per tray", fmt: fmtInt },
  ports_per_switch_chip: { label: "NVLink ports per switch chip", fmt: fmtInt },
  link_bidir: { label: "One NVLink link (both directions)", fmt: fmtRate },
  tray_tbps_dir: { label: "Switch tray, per direction", fmt: fmtBits },
  nvlink_total: { label: "NVLink, whole rack", fmt: fmtRate },
  hbm_total: { label: "HBM, whole rack", fmt: fmtBytes },
  hbm_bw_total: { label: "HBM bandwidth, whole rack", fmt: fmtRate },
  c2c_bidir: { label: "NVLink-C2C (both directions)", fmt: fmtRate },
  lpddr_per_cpu: { label: "LPDDR5X per Grace", fmt: fmtBytes },
  lpddr_bw_per_cpu: { label: "LPDDR5X bandwidth per Grace", fmt: fmtRate },
  nics_per_tray: { label: "Network cards per tray", fmt: fmtInt },
  nic_bps: { label: "Network per GPU", fmt: fmtBits },
  dpus_per_tray: { label: "DPUs per tray", fmt: fmtInt },
  rack_power_w: { label: "Rack power", fmt: fmtWatts },
  power_shelves: { label: "Power shelves", fmt: fmtInt },
  shelf_input_w: { label: "Input per power shelf", fmt: fmtWatts },
  psus_per_shelf: { label: "Power supplies per shelf", fmt: fmtInt },
  psu_w: { label: "Power supply rating", fmt: fmtWatts },
  dc_volts: { label: "Rack DC bus", fmt: (v) => `${v} V` },
  net_bidir_per_gpu: {
    label: "Network per GPU (both directions)",
    fmt: fmtRate,
  },
  factory_gpus: { label: "GPUs in the reference factory", fmt: fmtInt },
  factory_w: { label: "Reference factory power", fmt: fmtWatts },
  inlet_c: { label: "Coolant inlet", fmt: (v) => `${v} °C` },
  nvswitch_chips: { label: "NVSwitch chips", fmt: fmtInt },
  node_power_w: { label: "System power", fmt: fmtWatts },
  rack_units: { label: "Rack units", fmt: fmtInt },
  systems_per_su: { label: "Racks per scalable unit", fmt: fmtInt },
  rails: { label: "Rails", fmt: fmtInt },
  leaves_per_slg: { label: "Leaves per rail group", fmt: fmtInt },
  spines_per_slg: { label: "Spines per rail group", fmt: fmtInt },
  radix: { label: "Switch ports (radix)", fmt: fmtInt },
  max_sus: { label: "Largest design (SUs)", fmt: fmtInt },
};

const STATUS_NOTE: Record<string, string> = {
  spec: "",
  derived: " (derived)",
  rule: " (rule)",
  illustrative: " (illustrative)",
  undisclosed: "",
};

export function FieldCell({ f, k }: { f: Field; k: string }): JSX.Element {
  const src = SOURCES[f.src];
  const info = FIELD_INFO[k];
  const text =
    f.v === null
      ? "not disclosed"
      : typeof f.v === "number"
        ? info
          ? info.fmt(f.v)
          : trim(f.v)
        : f.v;
  return (
    <span data-field={k} data-status={f.st}>
      {text}
      {STATUS_NOTE[f.st]}
      {src && (
        <a
          href={src.url}
          title={`${src.title}, read ${src.accessed}. ${f.ref}`}
          className="ml-1 align-super text-[0.65rem]"
        >
          [{f.src}]
        </a>
      )}
    </span>
  );
}

function records(kind: string) {
  if (kind === "gpu") return GPU_RECORDS;
  if (kind === "system") return SYSTEM_RECORDS;
  throw new Error(`unknown kind ${kind}`);
}

export function SpecTable({
  kind,
  ids,
  fields,
}: {
  kind: "gpu" | "system";
  ids: string;
  fields: string;
}): JSX.Element {
  const recs = ids.split(",").map((id) => {
    const r = records(kind).find((x) => x.id === id);
    if (!r) throw new Error(`no ${kind} ${id}`);
    return r;
  });
  const ks = fields.split(",");
  return (
    <div
      className="my-6 overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label="Specifications"
    >
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">&nbsp;</th>
            {recs.map((r) => (
              <th key={r.id} className="text-left">
                {r.name}
                {r.avail.v !== "product" && (
                  <span className="block text-[0.7rem] font-normal text-neutral-600 dark:text-neutral-400">
                    {r.avail.v}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ks.map((k) => (
            <tr key={k}>
              <th scope="row" className="text-left font-normal">
                {FIELD_INFO[k]?.label ?? k}
              </th>
              {recs.map((r) => {
                const f = r.fields[k];
                return (
                  <td key={r.id}>{f ? <FieldCell f={f} k={k} /> : "—"}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SwitchTable(): JSX.Element {
  return (
    <div
      className="my-6 overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label="Scale-out switches"
    >
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Switch</th>
            <th className="text-left">Ports</th>
            <th className="text-left">Optics</th>
            <th className="text-left">Availability</th>
          </tr>
        </thead>
        <tbody>
          {SWITCH_RECORDS.map((w) => (
            <tr key={w.id} data-switch={w.id}>
              <td>{w.name}</td>
              <td>
                <FieldCell f={w.ports} k="ports" /> ×{" "}
                {fmtBits(w.port_bps.v as number)}
              </td>
              <td>{w.cpo ? "co-packaged" : "pluggable"}</td>
              <td>
                {w.avail.v}
                {w.avail.v !== "product" && (
                  <span className="block text-[0.7rem] text-neutral-600 dark:text-neutral-400">
                    {w.avail.ref}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function plain(v: number): string {
  if (Number.isInteger(v) && v < 1e6) return fmtInt(v);
  return v.toExponential(4).replace("e+", "e");
}

export function ValidationTable({ only }: { only?: string }): JSX.Element {
  const rows = validation().filter((v) => !only || v.id.startsWith(only));
  return (
    <div
      className="my-6 overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label="Validation"
    >
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Check</th>
            <th className="text-right">Model</th>
            <th className="text-right">Published</th>
            <th className="text-right">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} data-check={v.id}>
              <td>
                {v.what}
                {v.note ? ` (${v.note})` : ""}{" "}
                <a href={SOURCES[v.src]!.url} className="text-[0.7rem]">
                  [{v.src}]
                </a>
              </td>
              <td className="text-right font-mono">{plain(v.model)}</td>
              <td className="text-right font-mono">{plain(v.published)}</td>
              <td className="text-right font-mono">{v.ratio.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
