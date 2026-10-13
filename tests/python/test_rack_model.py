"""Tests of the rack-scale reference model (reference/rack_model.py)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "reference"))

import rack_model as r  # noqa: E402


def test_every_field_has_a_known_source_and_status():
    statuses = {"spec", "derived", "rule", "illustrative", "undisclosed"}
    groups = [g["fields"] for g in r.GPUS.values()] + [s["fields"] for s in r.SYSTEMS.values()]
    groups.append(r.SUPERPOD_RULES)
    for fields in groups:
        for k, f in fields.items():
            assert f["st"] in statuses, k
            assert f["src"] in r.SOURCES, (k, f["src"])
            assert f["ref"], k
            assert (f["v"] is None) == (f["st"] == "undisclosed"), k
    for w in r.SWITCHES.values():
        for key in ("ports", "port_bps", "avail"):
            assert w[key]["src"] in r.SOURCES
    for c in r.CLAIMS.values():
        assert c["src"] in r.SOURCES


def test_every_source_has_an_access_date_and_https_url():
    for s in r.SOURCES.values():
        assert s["accessed"] == r.ACCESSED == "2026-10-13"
        assert s["url"].startswith("https://")


def test_availability_is_marked():
    for g in list(r.GPUS.values()) + list(r.SYSTEMS.values()) + list(r.SWITCHES.values()):
        assert g["avail"]["v"] in {"product", "preliminary", "planned"}
    assert r.GPUS["rubin"]["avail"]["v"] == "preliminary"
    assert r.SWITCHES["sn6800"]["avail"]["v"] == "planned"


def test_ladder_gb200():
    rungs = r.ladder()
    assert [x["key"] for x in rungs] == ["package", "tray", "rack", "su", "pod", "hall"]
    assert [x["gpus"] for x in rungs[:5]] == [1, 4, 72, 576, 9216]
    # 100 MW at 120 kW per rack: 833 racks
    assert rungs[5]["children"] == 833 and rungs[5]["gpus"] == 833 * 72
    assert rungs[0]["bw"] == 8e12 and rungs[2]["bw"] == 900e9 and rungs[3]["bw"] == 50e9
    assert rungs[3]["drop"] == 18.0
    assert rungs[2]["power_w"] == 120e3
    assert rungs[0]["time"] == 1e9 / 8e12


def test_package_and_fit():
    h = r.package("h100")
    assert h["stacks"] == 5 and h["per_stack_bytes"] == 16e9 and h["per_stack_bw"] == 670e9
    b = r.package("b300")
    assert b["per_stack_bytes"] == 36e9 and b["per_stack_bw"] == 1e12 and b["sweep_time"] == 0.036
    assert r.package("rubin")["stacks"] is None
    f = r.fit("h100", "llama3-405b", "fp8")
    assert f["gpus"] == 6 and f["share"] == 405e9 / 6
    assert r.fit("b300", "llama3-70b", "bf16")["gpus"] == 1
    steps = r.fill_steps("b300", "llama3-405b", "fp8")
    assert len(steps) == 9 and steps[0]["placed"] == 0
    assert steps[-1]["done"] and steps[-1]["left"] == 0
    # 202.5 GB over 36 GB stacks: 5 full and a quarter of the sixth
    assert steps[-1]["full"] == 5 and steps[-1]["last"] == pytest.approx(0.625)


def test_pipeline_is_bounded_by_the_slowest_link():
    for pid in r.PATH_ORDER:
        hops = r.paths()[pid]["hops"]
        p = r.pipeline(hops, 2e9, 8)
        assert p["total"] >= p["ideal"]
        # with one chunk, store-and-forward is the sum of the link times
        one = r.pipeline(hops, 2e9, 1)
        assert one["total"] == pytest.approx(sum(2e9 / h["bw"] for h in hops))
        # more chunks approach the bottleneck time
        many = r.pipeline(hops, 2e9, 64)
        assert many["total"] < p["total"] <= one["total"]
    rd = r.pipeline(r.paths()["rdma"]["hops"], 2e9, 8)
    assert rd["bottleneck"] == 0 and rd["ideal"] == 2e9 / 50e9


def test_pipeline_steps():
    hops = r.paths()["grace"]["hops"]
    st = r.pipeline_steps(hops, 2e9, 8, 48)
    assert len(st) == 49
    assert st[0]["done"] == 0 and st[-1]["done"] == 8 and st[-1]["delivered"] == 2e9
    for s in st:
        assert sum(s["busy"]) >= (1 if 0 < s["k"] < 48 else 0)
        for p in s["pos"]:
            assert 0 <= p["frac"] < 1
    # at most one chunk moving on each link at once
    for s in st:
        for i in range(len(hops)):
            assert sum(1 for p in s["pos"] if p["hop"] == i and not p["wait"] and p["frac"] > 0) <= 1


def test_nvlink_domain_wiring():
    d = r.nvlink_domain()
    assert d["chips"] == 18 and d["links"] == d["ports"] == 1296
    assert d["links_per_chip_per_gpu"] == 1.0
    assert d["per_gpu_bidir"] == 1.8e12 and d["tray_bits_dir"] == 57.6e12


@pytest.mark.parametrize("n", [2, 3, 4, 6, 8])
def test_ring_allreduce(n):
    out = r.ring_allreduce_steps(n)
    steps = out["steps"]
    assert len(steps) == 2 * (n - 1) + 1
    final = steps[-1]
    assert all(row == out["total"] for row in final["values"])
    assert all(c == n for row in final["count"] for c in row)
    # after reduce-scatter, GPU g holds the full sum of chunk (g + 1) mod n
    rs = steps[n - 1]
    for g in range(n):
        c = (g + 1) % n
        assert rs["count"][g][c] == n and rs["values"][g][c] == out["total"][c]
    # every GPU sends one chunk per step
    for s in steps[1:]:
        assert sorted(m["from"] for m in s["sends"]) == list(range(n))


def test_allreduce_times():
    assert r.allreduce_time(8, 1e9, 1e9, "ring") == 2 * 7 / 8
    assert r.allreduce_time(8, 1e9, 1e9, "switch") == 1.0
    c = r.tp_compare("gb200-nvl72", 64e6, 8)
    assert c["ratio"] == 18.0
    assert r.alltoall_time(72, 72e6, 1e9) == 71e6 / 1e9


def test_fat_tree():
    t = r.fat_tree(2048, 64)
    assert t["tiers"] == 2 and t["leaves"] == 64 and t["spines"] == 32 and t["two_tier_max"] == 2048
    assert r.fat_tree(2049, 64)["tiers"] == 3
    assert t["three_tier_max"] == 65536
    # Al-Fares: a full three-tier fat tree of k-port switches holds k^3/4 hosts
    # with 5k^2/4 switches
    k = 16
    full = r.fat_tree(k**3 // 4, k)
    assert full["switches"] == 5 * k * k // 4
    # 2:1 oversubscription: more ports down, fewer up
    o = r.fat_tree(1000, 64, 2)
    assert o["down"] == 42 and o["up"] == 22
    assert r.fat_tree(144 * 72, 144)["tiers"] == 2
    assert r.fat_tree(576, 64, endpoint_optics=False)["transceivers"] == 2 * 576
    p = r.optics_power(t, 10.0)
    assert p["total_w"] == t["transceivers"] * 10.0


def test_tree_steps():
    st = r.tree_steps(9216, 64)
    assert [s["key"] for s in st] == ["gpus", "leaves", "spines", "cores", "route-local", "route-far"]
    t = r.fat_tree(9216, 64)
    assert st[3]["switches"] == t["switches"] and st[3]["links"] == t["endpoint_links"] + t["switch_links"]
    assert [s["key"] for s in r.tree_steps(576, 64)] == ["gpus", "leaves", "spines", "route-local", "route-far"]


def test_rail_aligned_reproduces_superpod_table3():
    for row in r.SUPERPOD_TABLE3:
        m = r.rail_aligned(row["sus"])
        assert (m["gpus"], m["leaves"], m["spines"], m["cores"]) == (row["gpus"], row["leaf"], row["spine"], row["core"])
        assert m["leaf_ports_used"] <= 64 and m["spine_ports_used"] <= 64


def test_validation_band():
    rows = r.validation()
    assert len(rows) == 9 + 6 + 12
    for row in rows:
        assert 0.98 <= row["ratio"] <= 1.04, row["id"]
        assert row["src"] in r.SOURCES
    worst = min(rows, key=lambda x: x["ratio"])
    assert worst["id"] == "vr-hbm-bw" and math.isclose(worst["ratio"], 0.9874285714285714)


def test_pipeline_matches_the_flow_shop_closed_form():
    # identical chunks through a chain: sum of one chunk's link times plus
    # (C - 1) times the slowest link's
    for pid in r.PATH_ORDER:
        hops = r.paths()[pid]["hops"]
        for c in (1, 4, 8, 16):
            p = r.pipeline(hops, 2e9, c)
            d = [2e9 / c / h["bw"] for h in hops]
            assert p["total"] == pytest.approx(sum(d) + (c - 1) * max(d), rel=1e-12)


# --- chapters 6-11 (brief 31B) ---------------------------------------------------


def test_new_sources_dated_and_records_sourced():
    for rec in list(r.FACILITY.values()) + list(r.OTHERS.values()):
        assert rec["avail"]["v"] in ("product", "preliminary", "planned")
        for k, f in rec["fields"].items():
            assert f["src"] in r.SOURCES, k
            assert f["st"] in ("spec", "derived", "rule", "illustrative", "undisclosed"), k
            assert (f["v"] is None) == (f["st"] == "undisclosed"), k
    for f in list(r.PHYS["fields"].values()) + list(r.LLAMA3_RUN.values()):
        assert f["src"] in r.SOURCES
    for f in r.COST_ILLUSTRATIVE.values():
        assert f["st"] == "illustrative"


def test_power_chain_from_the_dgx_guide():
    p = r.power_chain()
    assert p["psus"] == 48 and p["installed_w"] == 264e3 and p["usable_w"] == 132e3
    assert p["input_w"] == 264e3  # eight shelves of 33 kW input: the supplies' rating
    assert p["busbar_a"] == 2400 and p["margin"] == pytest.approx(1.1)
    assert r.busbar(1e6, 54)["copper_kg"] == pytest.approx(200)  # the blog's own figure comes back
    assert r.busbar(1e6, 800)["loss_rel"] == pytest.approx((54 / 800) ** 2)


def test_smoothing_conserves_the_store_and_the_average():
    for h in (0.05, 0.25, 1.0):
        for j in (0.0, 65.0, 650.0):
            m = r.rack_smoothing(h, j)
            # the grid supplies the same energy per period as the load uses
            assert m["grid_hi"] * m["t_hi"] + m["grid_lo"] * m["t_lo"] == pytest.approx(m["p_hi"] * m["t_hi"] + m["p_lo"] * m["t_lo"])
            assert m["used_j"] <= m["e_store"] + 1e-9
            assert m["p_avg"] <= m["grid_hi"] <= m["p_hi"]
            steps = r.smoothing_steps(m)
            assert len(steps) == 1 + 2 * 2 * 6
            assert steps[-1]["stored"] == pytest.approx(m["e_store"], abs=1e-6)
            assert min(s["stored"] for s in steps) >= -1e-6
    assert r.rack_smoothing(0.05, 65)["swing"] == 0  # a fast swing is flattened completely
    assert r.rack_smoothing(1.0, 0)["peak_cut"] == 0


def test_heat_balance():
    assert r.water_cp() == pytest.approx(4184, abs=1)  # NIST's 75.4 J/(mol K) over 18.015 g/mol
    assert r.air_cp() == pytest.approx(1001)
    h = r.heat_flow(120e3, 10, 15)
    assert h["water_kg_s"] * r.water_cp() * 10 == pytest.approx(120e3)
    assert h["air_m3_s"] * 1.229 * r.air_cp() * 15 == pytest.approx(120e3)
    c = r.cooling_loop(120e3, 0.9, 35, 10)
    assert (c["t_sup"], c["t_ret"]) == (40, 50) and c["racks_per_cdu"] == 18
    for st in r.loop_steps(c):
        for p in st["parcels"]:
            assert c["t_sup"] <= p["temp"] <= c["t_ret"]


def test_training_layout_and_young():
    x = r.training_layout(8, 16, 128, 72)
    assert x["domains"] == 228 and x["tp_inside"] == x["tp_groups"] == 2048
    assert 0 < x["pp_net"] < x["pp_hops"] and x["dp_net"] == 128
    assert r.training_layout(8, 16, 128, 8)["pp_net"] == 1920  # 8-GPU servers: every stage boundary leaves the server
    c = r.checkpoint(16384, 60)
    assert c["per_day"] == pytest.approx(419 / 54)  # the run's own rate comes back at its own size
    # tau minimises the first-order waste
    f = lambda t: 60 / t + t / (2 * c["mtbf_s"])  # noqa: E731
    assert f(c["tau_s"]) <= min(f(c["tau_s"] * 0.9), f(c["tau_s"] * 1.1))


def test_torus_counts():
    for k in (2, 4, 6, 8):
        t = r.torus(k)
        sh = r.torus_shells(k)
        assert sum(sh) == t["nodes"] and len(sh) - 1 == t["diameter"]
        assert sum(d * c for d, c in enumerate(sh)) / (t["nodes"] - 1) == pytest.approx(t["mean_hops"])
    assert r.torus_shells(4) == [1, 6, 15, 20, 15, 6, 1]
    c = r.tpu_compare(64e6)
    assert c["link_dir"] == 100e9 and c["t_torus"] > c["t_nvl72"]


def test_tco_adds_up():
    x = r.tco(3.5e6, 4, 120e3, 1.2, 0.1, 50000, 0.7)
    assert x["usd_per_mtok"] == pytest.approx((x["capex_yr"] + x["energy_usd_yr"]) / x["tokens_yr"] * 1e6)
    steps = r.tco_steps(3.5e6, 4, 120e3, 1.2, 0.1, 50000, 0.7)
    assert steps[-1]["capex"] == pytest.approx(3.5e6) and steps[-1]["usd_per_mtok"] == pytest.approx(x["usd_per_mtok"])
