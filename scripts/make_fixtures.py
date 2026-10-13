"""
Writes the site's model data, the parity fixtures and results.md from the
Python reference (reference/rack_model.py):

  src/data/racks.json               the sourced specifications, claims and
                                    model inputs the site shows
  tests/fixtures/rack_fixtures.json reference results the TypeScript port must
                                    reproduce exactly (tests/unit/model.test.ts)
  results.md                        every hardware figure with its source and
                                    access date, the numbers the chapters
                                    quote, and the validation band

    python3 scripts/make_fixtures.py          # write all three
    python3 scripts/make_fixtures.py --check  # fail if any is out of date (CI)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

import rack_model as r  # noqa: E402

# The parameter grids the fixtures cover (the widgets' controls stay inside them).
STACKED = [g for g in r.GPU_ORDER if r.GPUS[g]["fields"]["hbm_stacks"]["v"] is not None]
PAYLOADS = (0.5e9, 2e9)
CHUNKS = (1, 4, 8, 16)
FRAMES = 48
RING_N = (2, 3, 4, 5, 6, 8)
RING_SEEDS = (7, 11)
SIZES = (16e6, 64e6, 256e6, 1e9)
TREE_N = (72, 576, 1152, 2048, 2049, 4608, 9216, 10368, 32768, 50000)
TREE_K = (64, 128, 144, 512)
TREE_STEPS = [(n, k, o) for n in (576, 2048, 9216, 32768) for k in (64, 144) for o in (1, 2)]
HALLS = (20e6, 100e6, 300e6)
W_PER_TRANSCEIVER = (5.0, 10.0, 15.0, 20.0, 30.0)
# chapters 6-11 (the widgets' controls stay inside these grids)
HALF_PERIODS = (0.05, 0.25, 1.0)
J_PER_GPU = (0.0, 65.0, 650.0)
RACK_W = (120e3, 135e3, 1e6)
LIQUID_FRAC = (0.8, 0.9, 1.0)
T_FAC = (20.0, 30.0, 40.0)
DT_LIQUID = (5.0, 10.0, 15.0)
DT_AIR = (10.0, 15.0, 20.0)
LAYOUTS = [(t, p, d) for t in (4, 8) for p in (2, 4) for d in (2, 4)] + [(8, 16, 128)]
CKPT_GPUS = (1024, 4096, 16384, 100000)
CKPT_SAVE = (10.0, 60.0, 300.0)
TORUS_K = (2, 4, 6, 8)
CAPEX = (2e6, 3.5e6, 5e6)
KWH = (0.05, 0.10, 0.15)
UTIL = (0.5, 0.7, 0.9)
DISAGG = json.loads((ROOT / "src" / "data" / "disagg.json").read_text())


def cost_inputs() -> dict:
    """The illustrative cost inputs, and the rack's sustained output from chapter 8's recorded run."""
    c = {k: f["v"] for k, f in r.COST_ILLUSTRATIVE.items()}
    c["rack_w"] = r.system("gb200-nvl72")["rack_power_w"]
    c["tok_s"] = DISAGG["offeredTokS"]
    return c


def site_data() -> dict:
    return {
        "accessed": r.ACCESSED,
        "sources": r.SOURCES,
        "gpus": [r.GPUS[g] for g in r.GPU_ORDER],
        "systems": [r.SYSTEMS[s] for s in r.SYSTEMS],
        "switches": [r.SWITCHES[w] for w in r.SWITCH_ORDER],
        "claims": r.CLAIMS,
        "superpodTable3": r.SUPERPOD_TABLE3,
        "superpodRules": r.SUPERPOD_RULES,
        "models": [r.MODELS[m] for m in r.MODEL_ORDER],
        "formats": r.FORMATS,
        "ladderPayload": r.LADDER_PAYLOAD,
        "hallW": r.HALL_W,
        "facility": [r.FACILITY[f] for f in r.FACILITY],
        "phys": r.PHYS,
        "others": [r.OTHERS[o] for o in r.OTHER_ORDER],
        "llama3Run": r.LLAMA3_RUN,
        "cost": r.COST_ILLUSTRATIVE,
        "smoothLow": r.SMOOTH_LOW,
        "busbarCases": [list(c) for c in r.BUSBAR_CASES],
        "loopSteps": r.LOOP_STEPS,
        "loopParcels": r.LOOP_PARCELS,
        "segments": list(r.SEGMENTS),
        "hoursPerYear": r.HOURS_PER_YEAR,
    }


def fixtures() -> dict:
    out: dict = {}
    out["gpus"] = {g: r.gpu(g) for g in r.GPU_ORDER}
    out["systems"] = {s: r.system(s) for s in r.SYSTEMS}
    out["switches"] = {w: r.switch(w) for w in r.SWITCH_ORDER}
    out["ladder"] = r.ladder()
    out["ladderHalls"] = [{"hall_w": h, "payload": p, "out": r.ladder("gb200-nvl72", p, h)} for h in HALLS for p in PAYLOADS]
    out["package"] = {g: r.package(g) for g in r.GPU_ORDER}
    out["fit"] = [
        {"gpu": g, "model": m, "fmt": f, "out": r.fit(g, m, f)} for g in r.GPU_ORDER for m in r.MODEL_ORDER for f in r.FORMATS
    ]
    out["fill"] = [
        {"gpu": g, "model": m, "fmt": f, "out": r.fill_steps(g, m, f)} for g in STACKED for m in r.MODEL_ORDER for f in r.FORMATS
    ]
    paths = r.paths()
    out["paths"] = paths
    out["pipeline"] = [
        {"path": pid, "payload": p, "chunks": c, "out": r.pipeline(paths[pid]["hops"], p, c)}
        for pid in r.PATH_ORDER
        for p in PAYLOADS
        for c in CHUNKS
    ]
    out["pipelineSteps"] = [
        {"path": pid, "chunks": c, "out": r.pipeline_steps(paths[pid]["hops"], 2e9, c, FRAMES)}
        for pid in r.PATH_ORDER
        for c in CHUNKS
    ]
    out["nvlinkDomain"] = r.nvlink_domain()
    out["ringValues"] = [{"n": n, "seed": s, "out": r.ring_values(n, s)} for n in RING_N for s in RING_SEEDS]
    out["ring"] = [{"n": n, "seed": s, "out": r.ring_allreduce_steps(n, s)} for n in RING_N for s in RING_SEEDS]
    out["allreduce"] = [
        {"n": n, "size": z, "bw": bw, "algo": a, "out": r.allreduce_time(n, z, bw, a)}
        for n in (2, 4, 8, 72)
        for z in SIZES
        for bw in (50e9, 900e9)
        for a in ("ring", "switch")
    ]
    out["alltoall"] = [{"n": n, "size": z, "bw": 900e9, "out": r.alltoall_time(n, z, 900e9)} for n in (8, 72) for z in SIZES]
    out["tp"] = [{"n": n, "size": z, "out": r.tp_compare("gb200-nvl72", z, n)} for n in (4, 6, 8, 72) for z in SIZES]
    out["fatTree"] = [
        {"n": n, "k": k, "oversub": o, "optics": e, "out": r.fat_tree(n, k, o, e)}
        for n in TREE_N
        for k in TREE_K
        for o in (1, 2, 3)
        for e in (True, False)
    ]
    out["opticsPower"] = [
        {"n": n, "k": k, "w": w, "out": r.optics_power(r.fat_tree(n, k), w)} for n in (576, 9216) for k in (64, 144) for w in W_PER_TRANSCEIVER
    ]
    out["treeSteps"] = [{"n": n, "k": k, "oversub": o, "out": r.tree_steps(n, k, o)} for n, k, o in TREE_STEPS]
    out["railAligned"] = [r.rail_aligned(s) for s in range(1, 17)]
    out["validation"] = r.validation()
    # chapter 6: power
    out["facility"] = {f: r.facility(f) for f in r.FACILITY}
    out["powerChain"] = r.power_chain()
    out["busbar"] = [{"p": p, "v": v, "out": r.busbar(p, v)} for p, v in r.BUSBAR_CASES]
    out["smoothing"] = [
        {"half": h, "j": j, "out": r.rack_smoothing(h, j), "steps": r.smoothing_steps(r.rack_smoothing(h, j))}
        for h in HALF_PERIODS
        for j in J_PER_GPU
    ]
    # chapter 7: cooling
    out["waterCp"] = r.water_cp()
    out["airCp"] = r.air_cp()
    out["heatFlow"] = [
        {"q": q, "dl": dl, "da": da, "out": r.heat_flow(q, dl, da)} for q in RACK_W for dl in DT_LIQUID for da in DT_AIR
    ]
    out["coolingLoop"] = [
        {"q": q, "frac": f, "tfac": t, "dt": d, "out": r.cooling_loop(q, f, t, d)}
        for q in RACK_W
        for f in LIQUID_FRAC
        for t in T_FAC
        for d in DT_LIQUID
    ]
    out["loopSteps"] = [
        {"q": q, "frac": 0.9, "tfac": t, "dt": d, "out": r.loop_steps(r.cooling_loop(q, 0.9, t, d))}
        for q in (120e3, 1e6)
        for t in (30.0, 40.0)
        for d in (5.0, 10.0)
    ]
    # chapter 9: training
    out["failureRate"] = r.failure_rate()
    out["checkpoint"] = [{"n": n, "save": z, "out": r.checkpoint(n, z)} for n in CKPT_GPUS for z in CKPT_SAVE]
    out["layout"] = [
        {"tp": t, "pp": p, "dp": d, "domain": m, "out": r.training_layout(t, p, d, m)} for t, p, d in LAYOUTS for m in (8, 72)
    ]
    out["layoutSteps"] = [
        {"tp": t, "pp": p, "dp": d, "domain": m, "out": r.layout_steps(t, p, d, m)} for t, p, d in LAYOUTS[:-1] for m in (8, 72)
    ]
    # chapter 10: other designs
    out["others"] = {o: r.other(o) for o in r.OTHER_ORDER}
    out["torus"] = [{"k": k, "out": r.torus(k), "shells": r.torus_shells(k), "steps": r.torus_steps(k)} for k in TORUS_K]
    out["tpuCompare"] = [r.tpu_compare(z) for z in SIZES]
    out["scaleup"] = {o: r.scaleup_per_chip(o) for o in r.OTHER_ORDER}
    # chapter 11: cost
    c = cost_inputs()
    out["costInputs"] = c
    out["tco"] = [
        {"capex": k, "kwh": e, "util": u, "out": r.tco(k, c["years"], c["rack_w"], c["pue"], e, c["tok_s"], u)}
        for k in CAPEX
        for e in KWH
        for u in UTIL
    ]
    out["tcoSteps"] = [
        {"capex": k, "kwh": e, "util": u, "out": r.tco_steps(k, c["years"], c["rack_w"], c["pue"], e, c["tok_s"], u)}
        for k in CAPEX
        for e in (0.10,)
        for u in (0.7,)
    ]
    return out


# ---------------------------------------------------------------------------
# results.md
# ---------------------------------------------------------------------------


def _num(v) -> str:
    if v is None:
        return "not disclosed"
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, int):
        return f"{v:,}"
    if v == int(v) and abs(v) < 1e6:
        return f"{int(v):,}"
    return f"{v:.6g}"


def _src(sid: str) -> str:
    s = r.SOURCES[sid]
    return f"[{sid}]({s['url']})"


def _field_rows(fields: dict) -> list[str]:
    rows = []
    for k, f in fields.items():
        ref = f["ref"].replace("|", "/")
        rows.append(f"| `{k}` | {_num(f['v'])} | {f['st']} | {_src(f['src'])} | {ref} |")
    return rows


def results_md() -> str:
    L: list[str] = []
    L.append("# Results and sources")
    L.append("")
    L.append(
        "Generated by `python3 scripts/make_fixtures.py` from `reference/rack_model.py`; do not edit by hand. "
        f"Every source below was read on **{r.ACCESSED}**. Statuses: `spec` (the vendor states it), `derived` "
        "(computed from sourced figures; the formula is in the reference), `rule` (a standard or published design "
        "rule), `illustrative` (a model parameter, labelled on the site), `undisclosed` (not disclosed in the sources "
        "used). Availability: `product` (a vendor product page lists the specifications), `preliminary` (the vendor "
        "marks them preliminary), `planned` (the vendor states a future date)."
    )
    L.append("")
    L.append("## Sources")
    L.append("")
    L.append("| id | source | kind | accessed |")
    L.append("| --- | --- | --- | --- |")
    for sid, s in r.SOURCES.items():
        L.append(f"| `{sid}` | [{s['title']}]({s['url']}) | {s['kind']} | {s['accessed']} |")
    L.append("")
    L.append("## GPUs")
    for g in r.GPU_ORDER:
        rec = r.GPUS[g]
        L.append("")
        L.append(f"### {rec['name']} (`{g}`), availability: {rec['avail']['v']}")
        L.append("")
        L.append(f"Availability: {rec['avail']['ref']} ({_src(rec['avail']['src'])}).")
        L.append("")
        L.append("| field | value | status | source | where |")
        L.append("| --- | --- | --- | --- | --- |")
        L.extend(_field_rows(rec["fields"]))
    L.append("")
    L.append("## Systems")
    for sid, rec in r.SYSTEMS.items():
        L.append("")
        L.append(f"### {rec['name']} (`{sid}`), availability: {rec['avail']['v']}")
        L.append("")
        L.append("| field | value | status | source | where |")
        L.append("| --- | --- | --- | --- | --- |")
        L.extend(_field_rows(rec["fields"]))
    L.append("")
    L.append("## Scale-out switches")
    L.append("")
    L.append("| switch | ports | port speed (bit/s) | co-packaged optics | availability | source |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for w in r.SWITCH_ORDER:
        s = r.SWITCHES[w]
        L.append(
            f"| {s['name']} | {s['ports']['v']} | {_num(s['port_bps']['v'])} | {'yes' if s['cpo'] else 'no'} | "
            f"{s['avail']['v']} ({s['avail']['ref']}) | {_src(s['ports']['src'])} |"
        )
    L.append("")
    L.append("## DGX SuperPOD (GB200) design rules")
    L.append("")
    L.append("| field | value | status | source | where |")
    L.append("| --- | --- | --- | --- | --- |")
    L.extend(_field_rows(r.SUPERPOD_RULES))
    L.append("")
    L.append("## Power and cooling records")
    for fid, rec in r.FACILITY.items():
        L.append("")
        L.append(f"### {rec['name']} (`{fid}`)")
        L.append("")
        L.append("| field | value | status | source | where |")
        L.append("| --- | --- | --- | --- | --- |")
        L.extend(_field_rows(rec["fields"]))
    L.append("")
    L.append("### Physical properties")
    L.append("")
    L.append("| field | value | status | source | where |")
    L.append("| --- | --- | --- | --- | --- |")
    L.extend(_field_rows(r.PHYS["fields"]))
    sh = r.PHYS["shomate"]
    L.append("")
    L.append(f"Water, NIST Shomate coefficients ({_src('nist-water')}): " + ", ".join(f"{k} = {v}" for k, v in sh.items()) + ".")
    L.append("")
    L.append("## Other rack- and pod-scale designs")
    for oid in r.OTHER_ORDER:
        rec = r.OTHERS[oid]
        L.append("")
        L.append(f"### {rec['name']} (`{oid}`), availability: {rec['avail']['v']}")
        L.append("")
        L.append(f"Availability: {rec['avail']['ref']} ({_src(rec['avail']['src'])}).")
        L.append("")
        L.append("| field | value | status | source | where |")
        L.append("| --- | --- | --- | --- | --- |")
        L.extend(_field_rows(rec["fields"]))
    L.append("")
    L.append("## Llama 3 405B pre-training (chapter 9)")
    L.append("")
    L.append("| field | value | status | source | where |")
    L.append("| --- | --- | --- | --- | --- |")
    L.extend(_field_rows(r.LLAMA3_RUN))
    L.append("")
    L.append("## Illustrative cost inputs (chapter 11; not prices)")
    L.append("")
    L.append("| field | value | status | where |")
    L.append("| --- | --- | --- | --- |")
    for k, f in r.COST_ILLUSTRATIVE.items():
        L.append(f"| `{k}` | {_num(f['v'])} | {f['st']} | {f['ref']} |")
    L.append("")
    L.append("## Quoted claims (shown, attributed, never model inputs)")
    L.append("")
    for cid, c in r.CLAIMS.items():
        L.append(f"- `{cid}`: {c['text']} ({_src(c['src'])})")
    L.append("")
    L.append("## Numbers the chapters use")
    L.append("")
    L.append("### Chapter 1: the scale ladder (GB200 NVL72, SuperPOD, a 100 MW hall)")
    L.append("")
    L.append("| rung | GPUs | link | bandwidth per GPU per direction (B/s) | 1 GB takes (s) | rack power of these GPUs (W) | drop from the rung below |")
    L.append("| --- | --- | --- | --- | --- | --- | --- |")
    for x in r.ladder():
        L.append(f"| {x['name']} | {x['gpus']:,} | {x['link']} | {_num(x['bw'])} | {x['time']:.6g} | {_num(x['power_w'])} | {x['drop']:.4g} |")
    L.append("")
    L.append("### Chapter 2: the package")
    L.append("")
    L.append("| GPU | stacks | per stack (B) | per stack (B/s) | read all HBM once (s) | FP8 ridge (flop/B) |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for g in r.GPU_ORDER:
        p = r.package(g)
        L.append(
            f"| {r.GPUS[g]['name']} | {_num(p['stacks'])} | {_num(p['per_stack_bytes'])} | {_num(p['per_stack_bw'])} | "
            f"{p['sweep_time']:.6g} | {p['ridge_fp8']:.6g} |"
        )
    L.append("")
    L.append("Weights only (FP8): GPUs needed, and the batch-1 read floor per token (s).")
    L.append("")
    L.append("| GPU | " + " | ".join(r.MODELS[m]["name"] for m in r.MODEL_ORDER) + " |")
    L.append("| --- | " + " | ".join("---" for _ in r.MODEL_ORDER) + " |")
    for g in r.GPU_ORDER:
        cells = []
        for m in r.MODEL_ORDER:
            f = r.fit(g, m, "fp8")
            cells.append(f"{f['gpus']} GPUs, {f['read_time']:.4g} s")
        L.append(f"| {r.GPUS[g]['name']} | " + " | ".join(cells) + " |")
    L.append("")
    L.append("### Chapter 3: paths through a GB200 tray (2 GB, 8 chunks)")
    L.append("")
    L.append("| path | slowest link | its bandwidth (B/s) | total (s) | ideal (s) |")
    L.append("| --- | --- | --- | --- | --- |")
    for pid in r.PATH_ORDER:
        hops = r.paths()[pid]["hops"]
        p = r.pipeline(hops, 2e9, 8)
        L.append(f"| {r.paths()[pid]['label']} | {hops[p['bottleneck']]['name']} | {_num(hops[p['bottleneck']]['bw'])} | {p['total']:.6g} | {p['ideal']:.6g} |")
    L.append("")
    L.append("### Chapter 4: the NVLink domain")
    L.append("")
    d = r.nvlink_domain()
    for k, v in d.items():
        L.append(f"- `{k}`: {_num(v)}")
    L.append("")
    L.append("Ring all-reduce over 8 GPUs, NVLink against the network port (bandwidth term only):")
    L.append("")
    L.append("| size (B) | NVLink ring (s) | NVLink, in-switch reduction (s) | network ring (s) | ratio |")
    L.append("| --- | --- | --- | --- | --- |")
    for z in SIZES:
        c = r.tp_compare("gb200-nvl72", z, 8)
        L.append(f"| {_num(z)} | {c['t_nvlink']:.6g} | {c['t_switch']:.6g} | {c['t_nic']:.6g} | {c['ratio']:.4g} |")
    L.append("")
    L.append("### Chapter 5: fat trees")
    L.append("")
    L.append("| GPUs | radix | tiers | leaves | spines/aggregation | cores | switches | transceivers | per GPU |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for n in (576, 2048, 9216, 32768):
        for k in (64, 144):
            t = r.fat_tree(n, k)
            L.append(
                f"| {n:,} | {k} | {t['tiers']} | {t['leaves']:,} | {t['spines']:,} | {t['cores']:,} | {t['switches']:,} | "
                f"{t['transceivers']:,} | {t['per_gpu_transceivers']:.4g} |"
            )
    L.append("")
    L.append("Rail-aligned SuperPOD rules (`rail_aligned`) against the generic tree of the same radix (64):")
    L.append("")
    L.append("| SUs | GPUs | rail-aligned switches (leaf + spine + core) | generic fat tree switches |")
    L.append("| --- | --- | --- | --- |")
    for row in r.SUPERPOD_TABLE3:
        m = r.rail_aligned(row["sus"])
        g = r.fat_tree(m["gpus"], 64)
        L.append(f"| {row['sus']} | {m['gpus']:,} | {m['leaves'] + m['spines'] + m['cores']:,} | {g['switches']:,} |")
    L.append("")
    L.append("### Chapter 6: power (GB200 NVL72)")
    L.append("")
    for k, v in r.power_chain().items():
        L.append(f"- `{k}`: {_num(v)}")
    L.append("")
    L.append("Bus current, resistive loss in the same conductor (relative to 54 V) and copper at the same current density as NVIDIA's 1 MW / 54 V figure (derived):")
    L.append("")
    L.append("| rack power (W) | bus (V) | current (A) | loss vs 54 V | copper (kg) |")
    L.append("| --- | --- | --- | --- | --- |")
    for pw, v in r.BUSBAR_CASES:
        b = r.busbar(pw, v)
        L.append(f"| {_num(pw)} | {_num(v)} | {b['amps']:.6g} | {b['loss_rel']:.4g} | {b['copper_kg']:.4g} |")
    L.append("")
    L.append(f"Power smoothing: one rack, high phase at its stated power, low phase at {r.SMOOTH_LOW:g} of it (illustrative), equal halves:")
    L.append("")
    L.append("| half-period (s) | storage (J per GPU) | grid, high phase (W) | grid, low phase (W) | peak cut | grid swing (W) |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for h in HALF_PERIODS:
        for j in J_PER_GPU:
            m = r.rack_smoothing(h, j)
            L.append(f"| {h:g} | {j:g} | {m['grid_hi']:.6g} | {m['grid_lo']:.6g} | {m['peak_cut']:.4g} | {m['swing']:.6g} |")
    L.append("")
    L.append("### Chapter 7: cooling")
    L.append("")
    L.append(f"- water c_p (NIST Shomate, 298.15 K): {r.water_cp():.6g} J/(kg K)")
    L.append(f"- air c_p (gamma R / (gamma - 1)): {r.air_cp():.6g} J/(kg K)")
    L.append("")
    L.append("| heat (W) | water dT (K) | water (kg/s) | water (L/min) | air dT (K) | air (m3/s) | air (CFM) | air volume / water volume |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for q in RACK_W:
        h = r.heat_flow(q, 10.0, 15.0)
        L.append(f"| {_num(q)} | 10 | {h['water_kg_s']:.4g} | {h['water_l_min']:.4g} | 15 | {h['air_m3_s']:.4g} | {h['air_cfm']:.5g} | {h['vol_ratio']:.4g} |")
    L.append("")
    L.append("Liquid loop of a 120 kW rack, 90% of the heat to liquid (illustrative), CDU approach 5 K:")
    L.append("")
    L.append("| facility supply (°C) | coolant rise (K) | coolant supply (°C) | coolant return (°C) | flow (L/min) | per tray (kg/s) | racks per 2 MW CDU |")
    L.append("| --- | --- | --- | --- | --- | --- | --- |")
    for t in T_FAC:
        for d in DT_LIQUID:
            c = r.cooling_loop(120e3, 0.9, t, d)
            L.append(f"| {t:g} | {d:g} | {c['t_sup']:g} | {c['t_ret']:g} | {c['l_min']:.4g} | {c['per_tray_kg_s']:.4g} | {c['racks_per_cdu']} |")
    L.append("")
    L.append("### Chapter 8: disaggregated inference on one rack (Disaggregated_Inference_Sim)")
    L.append("")
    D = DISAGG
    L.append(
        f"Simulator {D['simulator']} at `{D['commit'][:7]}` (vendored; `scripts/disagg_reference.py`). {D['gpus']} GPUs of "
        f"the simulator's B200 preset as {D['instances']} instances of TP {D['tp']}, serving {D['modelName']}; "
        f"{D['n']:,} Poisson requests at {D['rate']:g}/s (seed {D['seed']}), prompts mean {D['promptMean']:g} (cv "
        f"{D['promptCv']:g}), outputs mean {D['outputMean']:g} (cv {D['outputCv']:g}); SLOs TTFT {D['ttftSlo']:g} s, "
        f"TPOT {D['tpotSlo'] * 1e3:g} ms. Offered output: {D['offeredTokS']:.6g} tokens/s. Power and energy use the "
        "simulator's illustrative coefficients (GPU power only)."
    )
    L.append("")
    L.append("| prefill:decode | KV link | parts | TTFT p99 (s) | TPOT p50 (ms) | TPOT p99 (ms) | SLO met | hand-off mean (ms) | J per token | tokens/s per MW (GPU power) |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for sp in D["splits"]:
        sk = f"{sp[0]}-{sp[1]}"
        for lk in D["linkOrder"]:
            for part in D["parts"]:
                x = D["runs"][sk][lk][part]
                L.append(
                    f"| {sp[0]}:{sp[1]} | {lk} | {part} | {x['ttft_p99']:.4g} | {x['tpot_p50'] * 1e3:.4g} | {x['tpot_p99'] * 1e3:.4g} | "
                    f"{x['slo']:.3f} | {x['handoff_mean'] * 1e3:.4g} | {x['j_per_tok']:.4g} | {x['tok_s_per_mw']:.6g} |"
                )
    L.append("")
    L.append("### Chapter 9: training clusters")
    L.append("")
    L.append(f"Unexpected interruptions per GPU-hour in the Llama 3 405B run: {r.failure_rate():.6g}.")
    L.append("")
    L.append("| GPUs | checkpoint save (s) | mean time between interruptions (s) | interruptions a day | Young interval (s) | time lost |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for n in CKPT_GPUS:
        for z in CKPT_SAVE:
            c = r.checkpoint(n, z)
            L.append(f"| {n:,} | {z:g} | {c['mtbf_s']:.6g} | {c['per_day']:.4g} | {c['tau_s']:.6g} | {c['waste']:.4g} |")
    L.append("")
    L.append("| TP x PP x DP | NVLink domain | domains | TP groups inside one domain | PP hops over the network | DP groups over the network |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for t, pp_, d in LAYOUTS:
        for m in (8, 72):
            x = r.training_layout(t, pp_, d, m)
            L.append(f"| {t} x {pp_} x {d} | {m} | {x['domains']:,} | {x['tp_inside']:,} of {x['tp_groups']:,} | {x['pp_net']:,} of {x['pp_hops']:,} | {x['dp_net']} of {x['dp_groups']} |")
    L.append("")
    L.append("### Chapter 10: a torus against a switch")
    L.append("")
    L.append("| k (k x k x k torus) | chips | mean hops | diameter | bisection links | nodes at each hop |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for k in TORUS_K:
        t = r.torus(k)
        L.append(f"| {k} | {t['nodes']} | {t['mean_hops']:.6g} | {t['diameter']} | {t['bisection_links']} | {', '.join(map(str, r.torus_shells(k)))} |")
    L.append("")
    L.append("All-to-all per chip: a TPU v5p cube (4 x 4 x 4, bisection bound, the chip's ICI split equally over six links) against a GB200 NVL72 rack:")
    L.append("")
    L.append("| size (B) | torus (s) | NVL72 (s) | ratio |")
    L.append("| --- | --- | --- | --- |")
    for z in SIZES:
        c = r.tpu_compare(z)
        L.append(f"| {_num(z)} | {c['t_torus']:.6g} | {c['t_nvl72']:.6g} | {c['t_torus'] / c['t_nvl72']:.4g} |")
    L.append("")
    L.append("### Chapter 11: cost (illustrative prices)")
    L.append("")
    ci = cost_inputs()
    L.append(", ".join(f"`{k}` = {_num(v)}" for k, v in ci.items()))
    L.append("")
    L.append("| capex per rack ($) | $ per kWh | utilisation | $ per million tokens | capex share | tokens/s per MW (facility) |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for k in CAPEX:
        for e in KWH:
            for u in UTIL:
                x = r.tco(k, ci["years"], ci["rack_w"], ci["pue"], e, ci["tok_s"], u)
                L.append(f"| {_num(k)} | {e:g} | {u:g} | {x['usd_per_mtok']:.4g} | {x['capex_share']:.4g} | {x['tok_s_per_mw']:.6g} |")
    L.append("")
    L.append("## Validation band")
    L.append("")
    L.append(
        "The model's structural and bandwidth figures against the published ones. Every row is computed from the "
        "model's inputs; none of the published values is an input to the figure it is compared with."
    )
    L.append("")
    L.append("| check | model | published | model / published | source |")
    L.append("| --- | --- | --- | --- | --- |")
    for v in r.validation():
        note = f" ({v['note']})" if v.get("note") else ""
        L.append(f"| {v['what']}{note} | {_num(v['model'])} | {_num(v['published'])} | {v['ratio']:.4f} | {_src(v['src'])} |")
    rows = r.validation()
    lo = min(x["ratio"] for x in rows)
    hi = max(x["ratio"] for x in rows)
    L.append("")
    L.append(f"Band: {lo:.4f} to {hi:.4f} across {len(rows)} checks.")
    L.append("")
    return "\n".join(L)


def dump(obj: dict, indent: int | None = 1) -> str:
    return json.dumps(obj, indent=indent, sort_keys=True, ensure_ascii=False) + "\n"


TARGETS = {
    ROOT / "src" / "data" / "racks.json": lambda: dump(site_data(), 1),
    ROOT / "tests" / "fixtures" / "rack_fixtures.json": lambda: dump(fixtures(), None),
    ROOT / "results.md": results_md,
}


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    for path, fn in TARGETS.items():
        text = fn()
        if check:
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            print(f"wrote {path.relative_to(ROOT)} ({len(text):,} bytes)")
    if stale:
        print("out of date (run python3 scripts/make_fixtures.py):", ", ".join(stale))
        return 1
    if check:
        print("fixtures, site data and results.md are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
