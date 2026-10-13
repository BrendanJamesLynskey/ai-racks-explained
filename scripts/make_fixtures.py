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
