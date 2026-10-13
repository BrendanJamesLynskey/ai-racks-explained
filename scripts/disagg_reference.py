"""Chapter 8's numbers and engine-parity fixtures, from Disaggregated_Inference_Sim at the vendored commit.

Chapter 8 runs the simulator's own JavaScript engine (`web/sim_engine.js`, vendored byte for byte at the commit in
`src/lib/racks/vendor/VENDORED.json` by `pnpm vendor <commit>`) in a Web Worker. This script runs the simulator's
Python package at that same commit, on one GB200 NVL72-sized rack of the simulator's B200 preset, and writes:

* `public/racks/disagg/workload.json`: the requests (seeded Poisson arrivals, lognormal lengths), recorded so the
  browser replays exactly the requests Python used;
* `src/data/disagg.json`: the rack's configurations (pool split x KV link x which pool gets the context-optimised
  part), the links and the illustrative part registered with the engine at run time, every configuration's summary
  (the chapter quotes these through <V of="dis.…" />), and the validation the simulator records about itself;
* `tests/fixtures/disagg_parity.json`: engine parity. For six configurations, the SHA-256 of every request's seven
  timestamps as IEEE-754 doubles and the stage counts at a few animation frames; the unit tests run the vendored
  engine on the same rows and configuration and require the same digest and summary, bit for bit.

Run with the simulator's virtualenv (simpy), the simulator checked out at the vendored commit:

    ../Disaggregated_Inference_Sim/.venv/bin/python scripts/disagg_reference.py [path/to/sim] [--check]

`--check` writes nothing: it regenerates everything in memory, checks the checkout is the vendored commit and the
vendored files have the recorded hashes, and fails if any committed file differs.
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
SIM = Path(args[0]).resolve() if args else ROOT.parent / "Disaggregated_Inference_Sim"
sys.path.insert(0, str(SIM / "src"))

from disagg_sim.hardware import B200, LLAMA3_70B, Link, Parallel  # noqa: E402
from disagg_sim.metrics import summarise  # noqa: E402
from disagg_sim.sim import SimConfig, simulate  # noqa: E402
from disagg_sim.workload import LengthDist, poisson_workload, workload_rows  # noqa: E402

VENDOR = ROOT / "src/lib/racks/vendor"
VENDORED = json.loads((VENDOR / "VENDORED.json").read_text())
OUT_WL = ROOT / "public/racks/disagg/workload.json"
OUT_DATA = ROOT / "src/data/disagg.json"
OUT_FIX = ROOT / "tests/fixtures/disagg_parity.json"

# The rack: 72 GPUs as 18 instances of 4 (tensor-parallel 4 over NVLink 5, the simulator's B200 preset).
GPUS = 72
TP = 4
INSTANCES = GPUS // TP
SPLITS = ((6, 12), (9, 9), (12, 6), (14, 4))  # prefill instances : decode instances
# The KV hand-off from a prefill instance: its four GPUs' ports, per direction. NVLink 5 at 900 GB/s a GPU (NVIDIA's
# 1.8 TB/s both ways, halved), one 400 Gb/s ConnectX-7 per GPU (50 GB/s), or one shared 100 GbE port. Latency and
# energy per bit are the simulator's own illustrative values for NVLink, InfiniBand NDR and Ethernet.
LINKS = {
    "nvlink": {"name": "NVLink 5, four GPUs' links (in the rack)", "bw": TP * 900e9, "lat": 5e-6, "pjBit": 5.0},
    "ib": {"name": "Four 400 Gb/s network ports (between racks)", "bw": TP * 50e9, "lat": 10e-6, "pjBit": 15.0},
    "eth100": {"name": "One 100 GbE port", "bw": 12.5e9, "lat": 20e-6, "pjBit": 15.0},
}
LINK_ORDER = ("nvlink", "ib", "eth100")
# An illustrative context-optimised part: the B200 preset's compute and power, with 128 GB of memory (Rubin CPX's
# stated capacity) at 2 TB/s (an illustrative GDDR7-class bandwidth: the vendor gives none). Not a model of any product.
CTX = {"name": "Context-optimised part (illustrative)", "B": 2e12, "M": 128e9}
PARTS = ("b200", "ctx-prefill", "ctx-decode")
RATE = 90.0  # requests per second offered to the rack
N = 1500
SEED = 1
PROMPT = LengthDist(3000, 0.5, hi=16384)
OUTPUT = LengthDist(600, 0.5, hi=4096)
TTFT_SLO = 2.0
TPOT_SLO = 0.05
FRAME_DT = 0.25  # seconds between animation frames
FIXTURE_CASES = (
    ((12, 6), "nvlink", "b200"),
    ((12, 6), "ib", "b200"),
    ((12, 6), "eth100", "b200"),
    ((6, 12), "nvlink", "b200"),
    ((12, 6), "nvlink", "ctx-prefill"),
    ((12, 6), "nvlink", "ctx-decode"),
)
FIXTURE_FRAMES = (8, 24, 40, 64)
STAMPS = ("arrival", "prefill_start", "first_token", "kv_start", "kv_ready", "decode_start", "finish")
NAN = struct.pack("<Q", 0x7FF8000000000000)
CTX_DEVICE = replace(B200, name=CTX["name"], mem_bw=CTX["B"], mem_capacity=CTX["M"])


def git(*a: str) -> str:
    return subprocess.run(["git", "-C", str(SIM), *a], capture_output=True, text=True, check=True).stdout.strip()


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def stamp_digest(reqs) -> str:
    """SHA-256 of every request's seven timestamps as little-endian doubles (None as the canonical NaN)."""
    h = hashlib.sha256()
    for r in reqs:
        for k in STAMPS:
            v = getattr(r, k)
            h.update(NAN if v is None else struct.pack("<d", float(v)))
    return h.hexdigest()


def clean(x):
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    return x


def dumps(obj) -> str:
    return json.dumps(clean(obj), separators=(",", ":")) + "\n"


def key(split, link: str, part: str) -> str:
    return f"{split[0]}-{split[1]}.{link}.{part}"


def js_cfg(split, link: str, part: str) -> dict:
    """The engine's configuration (camelCase SimConfig keys); custom link and device keys are registered at run time."""
    cfg = {
        "model": "llama3-70b",
        "device": "b200",
        "devicesPerInstance": TP,
        "mode": "disagg",
        "nPrefill": split[0],
        "nDecode": split[1],
        "link": f"rack-{link}",
        "linkChannels": split[0],
        "parallel": {"tp": TP, "pp": 1, "ep": 1, "microbatches": None, "expertImbalance": 1.0, "link": None},
        "ttftSlo": TTFT_SLO,
        "tpotSlo": TPOT_SLO,
    }
    if part == "ctx-prefill":
        cfg["prefillDevice"] = "rack-ctx"
    if part == "ctx-decode":
        cfg["decodeDevice"] = "rack-ctx"
    return cfg


def py_cfg(split, link: str, part: str) -> SimConfig:
    lk = LINKS[link]
    return SimConfig(
        model=LLAMA3_70B,
        device=B200,
        devices_per_instance=TP,
        mode="disagg",
        n_prefill=split[0],
        n_decode=split[1],
        link=Link(lk["name"], lk["bw"], lk["lat"], channels=split[0], pj_per_bit=lk["pjBit"]),
        parallel=Parallel(tp=TP),
        ttft_slo=TTFT_SLO,
        tpot_slo=TPOT_SLO,
        prefill_device=CTX_DEVICE if part == "ctx-prefill" else None,
        decode_device=CTX_DEVICE if part == "ctx-decode" else None,
    )


def stage_counts(reqs, t: float) -> dict[str, int]:
    """How many requests are in each stage at time t (src/lib/racks/disagg.ts `countsAt` repeats this)."""
    c = {"waiting": 0, "prefill": 0, "handoff": 0, "decode_queue": 0, "decode": 0, "done": 0}
    for r in reqs:
        if r.arrival > t:
            continue
        if r.finish is not None and t >= r.finish:
            c["done"] += 1
        elif r.decode_start is not None and t >= r.decode_start:
            c["decode"] += 1
        elif r.kv_ready is not None and t >= r.kv_ready:
            c["decode_queue"] += 1
        elif r.first_token is not None and t >= r.first_token:
            c["handoff"] += 1
        elif r.prefill_start is not None and t >= r.prefill_start:
            c["prefill"] += 1
        else:
            c["waiting"] += 1
    return c


def handoff_mean(reqs) -> float:
    """Mean seconds from first token to the KV cache landing on the decode pool, over every request that got there.
    A plain left-to-right sum (not fmean or sum(), which compensate): src/lib/racks/disagg.ts repeats it exactly."""
    total = 0.0
    n = 0
    for r in reqs:
        if r.kv_ready is not None and r.first_token is not None:
            total = total + (r.kv_ready - r.first_token)
            n += 1
    return total / n


def summary_of(m: dict, res) -> dict:
    lat = m["latency_s"]
    e = m["energy"]
    out_tok_s = m["throughput"]["output_tok_per_s"]
    avg_w = e["avg_power_W"]
    return {
        "ttft_p50": lat["ttft"]["p50"],
        "ttft_p99": lat["ttft"]["p99"],
        "tpot_p50": lat["tpot"]["p50"],
        "tpot_p99": lat["tpot"]["p99"],
        "slo": m["throughput"]["slo_attainment"],
        "out_tok_s": out_tok_s,
        "avg_w": avg_w,
        "j_per_tok": e["J_per_output_token"],
        "handoff_mean": handoff_mean(res.requests),
        "tok_s_per_mw": out_tok_s / (avg_w / 1e6),
        "completed": m["requests"]["completed"],
        "rejected": m["requests"]["rejected"],
        "horizon": res.horizon,
    }


def main() -> int:
    commit = VENDORED["commit"]
    head = git("rev-parse", "HEAD")
    if head != commit:
        print(f"the simulator checkout is at {head[:7]}, the vendored commit is {commit[:7]}", file=sys.stderr)
        return 1
    for f in VENDORED["files"]:
        src = (SIM / f["path"]).read_bytes()
        if sha(src) != f["sha256"] or (VENDOR / f["file"]).read_bytes() != src:
            print(f"{f['path']}: the vendored copy or its recorded hash differs from the simulator's", file=sys.stderr)
            return 1

    files: dict[Path, str] = {}
    reqs0 = poisson_workload(RATE, N, PROMPT, OUTPUT, seed=SEED)
    rows = workload_rows(reqs0)
    files[OUT_WL] = dumps({"commit": commit, "rate": RATE, "n": N, "seed": SEED, "rows": rows})

    runs: dict[str, dict] = {}
    results: dict[str, list] = {}
    for split in SPLITS:
        for link in LINK_ORDER:
            for part in PARTS:
                reqs = poisson_workload(RATE, N, PROMPT, OUTPUT, seed=SEED)
                res = simulate(py_cfg(split, link, part), reqs)
                k = key(split, link, part)
                runs[k] = summary_of(summarise(res), res)
                results[k] = res.requests
                print(f"  {k}: ttft p99 {runs[k]['ttft_p99']:.3f} s, tpot p50 {runs[k]['tpot_p50'] * 1e3:.1f} ms",
                      file=sys.stderr)

    # the summaries the chapter quotes, nested as split -> link -> part (values.ts reads "dis.12-6.nvlink.b200.ttft_p99")
    nested: dict = {}
    for k, v in runs.items():
        s, link, part = k.split(".")
        nested.setdefault(s, {}).setdefault(link, {})[part] = v
    data = {
        "simulator": VENDORED["repository"],
        "commit": commit,
        "gpus": GPUS,
        "tp": TP,
        "instances": INSTANCES,
        "model": "llama3-70b",
        "modelName": LLAMA3_70B.name,
        "kvBytesPerToken": LLAMA3_70B.kv_bytes_per_token,
        "rate": RATE,
        "n": N,
        # the output tokens the rack must serve per second to keep up: every request's output over the arrival span
        "offeredTokS": sum(r.output_len for r in reqs0) / reqs0[-1].arrival,
        "promptTokS": sum(r.prompt_len for r in reqs0) / reqs0[-1].arrival,
        "seed": SEED,
        "promptMean": PROMPT.mean,
        "promptCv": PROMPT.cv,
        "outputMean": OUTPUT.mean,
        "outputCv": OUTPUT.cv,
        "ttftSlo": TTFT_SLO,
        "tpotSlo": TPOT_SLO,
        "frameDt": FRAME_DT,
        "splits": [list(s) for s in SPLITS],
        "links": LINKS,
        "linkOrder": list(LINK_ORDER),
        "ctx": CTX,
        "parts": list(PARTS),
        "b200": {"F": B200.peak_flops, "B": B200.mem_bw, "M": B200.mem_capacity, "tdp": B200.tdp_w},
        "cfgs": {key(s, lk, p): js_cfg(s, lk, p) for s in SPLITS for lk in LINK_ORDER for p in PARTS},
        "runs": nested,
    }
    files[OUT_DATA] = json.dumps(clean(data), indent=1) + "\n"

    cases = []
    for split, link, part in FIXTURE_CASES:
        k = key(split, link, part)
        reqs = results[k]
        frames = []
        for f in FIXTURE_FRAMES:
            t = f * FRAME_DT
            frames.append({"frame": f, "t": t, "counts": stage_counts(reqs, t)})
        cases.append({"key": k, "cfg": js_cfg(split, link, part), "stamps_sha256": stamp_digest(reqs),
                      "first": [[getattr(r, s) for s in STAMPS] for r in reqs[:3]], "frames": frames,
                      "summary": runs[k]})
    files[OUT_FIX] = dumps({"simulator": VENDORED["repository"], "commit": commit, "cases": cases})

    bad = 0
    for path, text in files.items():
        if CHECK:
            if not path.exists() or path.read_text() != text:
                print(f"out of date: {path.relative_to(ROOT)}", file=sys.stderr)
                bad += 1
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            print(f"wrote {path.relative_to(ROOT)} ({len(text):,} bytes)")
    if CHECK and not bad:
        print(f"up to date: {len(files)} files at {commit[:7]}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
