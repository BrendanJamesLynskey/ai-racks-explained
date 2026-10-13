"""
Rack-scale model: the Python reference.

A teaching model of the machines that train and serve large models, from one
GPU package to a hall of racks. It is not a simulator of any product. Every
hardware figure is a field with a value, a status and a source (``GPUS``,
``SYSTEMS``, ``SWITCHES``, ``LINKS`` below), and every source carries the date
it was read. Every derived figure is a closed form of those fields. The
TypeScript port, ``src/lib/racks/model.ts``, repeats each function with the
same operations in the same order, and must reproduce the fixtures written by
``scripts/make_fixtures.py`` exactly.

What it computes (chapters 1-5):
  - the scale ladder: GPUs, bandwidth per GPU and power at each rung, from the
    package to a hall (``ladder``);
  - the package: HBM stacks, capacity and bandwidth per stack, the time to
    read the whole memory once, and how a model's weights fill it
    (``package``, ``fill_steps``);
  - data paths through a tray: a payload cut into chunks crossing a chain of
    links, store-and-forward per chunk (``pipeline``, ``pipeline_steps``);
  - scale-up: the NVLink domain's wiring and bandwidth (``nvlink_domain``),
    ring all-reduce on real numbers (``ring_allreduce_steps``) and its time
    on NVLink against the network (``allreduce_time``, ``tp_compare``);
  - scale-out: leaf-spine(-core) fat trees and the switches, links and
    transceivers they need (``fat_tree``, ``tree_steps``), and the rail-aligned
    design rules of a published reference architecture (``rail_aligned``).

Conventions:
  - bytes and bits are SI (1 GB = 1e9 B, 1 Tb/s = 1e12 bit/s);
  - vendors quote NVLink and NVLink-C2C bandwidth as bidirectional totals;
    the model works per direction (half), and says so;
  - network ports are quoted in bits per second; the model converts to bytes;
  - latency is not modelled: every time is a bandwidth term only.
"""
from __future__ import annotations

import math
from typing import Any

ACCESSED = "2026-10-13"

# ---------------------------------------------------------------------------
# Sources (every one read on ACCESSED)
# ---------------------------------------------------------------------------


def _s(title: str, url: str, kind: str) -> dict[str, str]:
    return {"title": title, "url": url, "kind": kind, "accessed": ACCESSED}


SOURCES: dict[str, dict[str, str]] = {
    "h100-page": _s(
        "NVIDIA H100 product page, Product Specifications (H100 SXM column)",
        "https://www.nvidia.com/en-us/data-center/h100/",
        "vendor product page",
    ),
    "h200-page": _s(
        "NVIDIA H200 product page, Specifications (H200 SXM column)",
        "https://www.nvidia.com/en-us/data-center/h200/",
        "vendor product page",
    ),
    "hopper-blog": _s(
        "NVIDIA Hopper Architecture In-Depth (NVIDIA Technical Blog)",
        "https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/",
        "vendor technical blog",
    ),
    "bwu-blog": _s(
        "Inside NVIDIA Blackwell Ultra: The Chip Powering the AI Factory Era (NVIDIA Technical Blog; updated 2025-09-24)",
        "https://developer.nvidia.com/blog/inside-nvidia-blackwell-ultra-the-chip-powering-the-ai-factory-era/",
        "vendor technical blog",
    ),
    "bw-arch": _s(
        "NVIDIA Blackwell Architecture page",
        "https://www.nvidia.com/en-us/data-center/technologies/blackwell-architecture/",
        "vendor product page",
    ),
    "gb200-page": _s(
        "NVIDIA GB200 NVL72 product page, Specifications",
        "https://www.nvidia.com/en-us/data-center/gb200-nvl72/",
        "vendor product page",
    ),
    "gb200-blog": _s(
        "NVIDIA GB200 NVL72 Delivers Trillion-Parameter LLM Training and Real-Time Inference (NVIDIA Technical Blog)",
        "https://developer.nvidia.com/blog/nvidia-gb200-nvl72-delivers-trillion-parameter-llm-training-and-real-time-inference/",
        "vendor technical blog",
    ),
    "gb300-page": _s(
        "NVIDIA GB300 NVL72 product page, Specifications",
        "https://www.nvidia.com/en-us/data-center/gb300-nvl72/",
        "vendor product page",
    ),
    "vr-page": _s(
        "NVIDIA Vera Rubin NVL72 product page, Specifications (marked 'Available Now' on the access date)",
        "https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/",
        "vendor product page",
    ),
    "nvlink-page": _s(
        "NVIDIA NVLink and NVLink Switch page, Specifications ('Preliminary specifications; may be subject to change')",
        "https://www.nvidia.com/en-us/data-center/nvlink/",
        "vendor product page",
    ),
    "hgx-page": _s(
        "NVIDIA HGX platform page, Specifications",
        "https://www.nvidia.com/en-us/data-center/hgx/",
        "vendor product page",
    ),
    "dgx-b200-page": _s(
        "NVIDIA DGX B200 product page, Specifications",
        "https://www.nvidia.com/en-us/data-center/dgx-b200/",
        "vendor product page",
    ),
    "dgx-gb200-guide": _s(
        "NVIDIA DGX GB200 User Guide, Hardware",
        "https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html",
        "vendor documentation",
    ),
    "superpod-components": _s(
        "NVIDIA DGX SuperPOD Reference Architecture (DGX GB200), Key Components",
        "https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/dgx-superpod-components.html",
        "vendor reference architecture",
    ),
    "superpod-network": _s(
        "NVIDIA DGX SuperPOD Reference Architecture (DGX GB200), Network Fabrics (Table 3)",
        "https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/network-fabrics.html",
        "vendor reference architecture",
    ),
    "quantum2-page": _s(
        "NVIDIA Quantum-2 InfiniBand platform page (switches and ConnectX-7 adapters)",
        "https://www.nvidia.com/en-us/networking/quantum2/",
        "vendor product page",
    ),
    "qx800-page": _s(
        "NVIDIA Quantum-X800 InfiniBand platform page",
        "https://www.nvidia.com/en-us/networking/products/infiniband/quantum-x800/",
        "vendor product page",
    ),
    "eth-switch-page": _s(
        "NVIDIA Ethernet switching page (Spectrum-4 and Spectrum-6 switch tables)",
        "https://www.nvidia.com/en-us/networking/ethernet-switching/",
        "vendor product page",
    ),
    "photonics-page": _s(
        "NVIDIA Silicon Photonics page (co-packaged optics switches)",
        "https://www.nvidia.com/en-us/networking/products/silicon-photonics/",
        "vendor product page",
    ),
    "cpo-blog": _s(
        "Scaling AI Factories with Co-Packaged Optics for Better Power Efficiency (NVIDIA Technical Blog, 2025-08-18)",
        "https://developer.nvidia.com/blog/scaling-ai-factories-with-co-packaged-optics-for-better-power-efficiency/",
        "vendor technical blog",
    ),
    "supernic-page": _s(
        "NVIDIA Ethernet SuperNIC page (ConnectX-8)",
        "https://www.nvidia.com/en-us/networking/products/ethernet/supernic/",
        "vendor product page",
    ),
    "alfares2008": _s(
        "Al-Fares, Loukissas and Vahdat, A scalable, commodity data center network architecture, SIGCOMM 2008 (doi:10.1145/1402946.1402967)",
        "https://doi.org/10.1145/1402946.1402967",
        "paper",
    ),
    "leiserson1985": _s(
        "Leiserson, Fat-trees: universal networks for hardware-efficient supercomputing, IEEE Trans. Computers 1985 (doi:10.1109/TC.1985.6312192)",
        "https://doi.org/10.1109/TC.1985.6312192",
        "paper",
    ),
    "patarasuk2009": _s(
        "Patarasuk and Yuan, Bandwidth optimal all-reduce algorithms for clusters of workstations, JPDC 2009 (doi:10.1016/j.jpdc.2008.09.002)",
        "https://doi.org/10.1016/j.jpdc.2008.09.002",
        "paper",
    ),
    "llama3": _s(
        "Grattafiori et al., The Llama 3 Herd of Models (arXiv 2407.21783)",
        "https://arxiv.org/abs/2407.21783",
        "paper",
    ),
    "deepseekv3": _s(
        "DeepSeek-AI, DeepSeek-V3 Technical Report (arXiv 2412.19437)",
        "https://arxiv.org/abs/2412.19437",
        "paper",
    ),
    # chapters 6-11 (brief 31B)
    "800v-blog": _s(
        "NVIDIA 800 VDC Architecture Will Power the Next Generation of AI Factories (NVIDIA Technical Blog, 2025-05-20, updated 2025-07-31)",
        "https://developer.nvidia.com/blog/nvidia-800-v-hvdc-architecture-will-power-the-next-generation-of-ai-factories/",
        "vendor technical blog",
    ),
    "smooth-blog": _s(
        "How New GB300 NVL72 Features Provide Steady Power for AI (NVIDIA Technical Blog)",
        "https://developer.nvidia.com/blog/how-new-gb300-nvl72-features-provide-steady-power-for-ai/",
        "vendor technical blog",
    ),
    "water-blog": _s(
        "Chill Factor: NVIDIA Blackwell Platform Boosts Water Efficiency by Over 300x (NVIDIA Blog)",
        "https://blogs.nvidia.com/blog/blackwell-platform-water-efficiency-liquid-cooling-data-centers-ai-factories/",
        "vendor blog",
    ),
    "nist-water": _s(
        "NIST Chemistry WebBook, SRD 69: Water, condensed phase thermochemistry (liquid-phase Shomate equation, Chase 1998)",
        "https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=2",
        "reference data",
    ),
    "nasa-air": _s(
        "NASA Glenn Research Center, Air Properties Definitions (sea-level standard day)",
        "https://www.grc.nasa.gov/www/k-12/airplane/airprop.html",
        "reference data",
    ),
    "nasa-gas": _s(
        "NASA Glenn Research Center, Equation of State (specific gas constant of air) and Specific Heats (ratio for air)",
        "https://www.grc.nasa.gov/www/k-12/airplane/eqstat.html",
        "reference data",
    ),
    "cpx-news": _s(
        "NVIDIA Unveils Rubin CPX: A New Class of GPU Designed for Massive-Context Inference (NVIDIA Newsroom, 2025-09-09)",
        "https://nvidianews.nvidia.com/news/nvidia-unveils-rubin-cpx-a-new-class-of-gpu-designed-for-massive-context-inference",
        "vendor press release",
    ),
    "dynamo-gh": _s(
        "NVIDIA Dynamo, the open-source datacenter-scale inference stack (GitHub repository README)",
        "https://github.com/ai-dynamo/dynamo",
        "vendor software documentation",
    ),
    "distserve": _s(
        "Zhong et al., DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving (arXiv 2401.09670)",
        "https://arxiv.org/abs/2401.09670",
        "paper",
    ),
    "splitwise": _s(
        "Patel et al., Splitwise: Efficient generative LLM inference using phase splitting (arXiv 2311.18677)",
        "https://arxiv.org/abs/2311.18677",
        "paper",
    ),
    "disagg-sim": _s(
        "Disaggregated_Inference_Sim: a discrete-event simulator of prefill/decode serving (this author's; the engine this site vendors)",
        "https://github.com/BrendanJamesLynskey/Disaggregated_Inference_Sim",
        "simulator",
    ),
    "megatron2021": _s(
        "Narayanan et al., Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM (arXiv 2104.04473)",
        "https://arxiv.org/abs/2104.04473",
        "paper",
    ),
    "young1974": _s(
        "Young, A first order approximation to the optimum checkpoint interval, Communications of the ACM 1974 (doi:10.1145/361147.361115)",
        "https://doi.org/10.1145/361147.361115",
        "paper",
    ),
    "tpu-v4": _s(
        "Jouppi et al., TPU v4: An Optically Reconfigurable Supercomputer for Machine Learning with Hardware Support for Embeddings (arXiv 2304.01433)",
        "https://arxiv.org/abs/2304.01433",
        "paper",
    ),
    "tpu-v5p": _s(
        "Google Cloud documentation, TPU v5p (system architecture and configurations)",
        "https://cloud.google.com/tpu/docs/v5p",
        "vendor documentation",
    ),
    "tpu-7x": _s(
        "Google Cloud documentation, TPU7x (Ironwood) (system architecture)",
        "https://cloud.google.com/tpu/docs/tpu7x",
        "vendor documentation",
    ),
    "helios-blog": _s(
        "AMD 'Helios': Advancing Openness in AI Infrastructure Built on Meta's 2025 OCP Open Rack for AI Design (AMD blog, 2025-10-14)",
        "https://www.amd.com/en/blogs/2025/amd-helios-ai-rack-built-on-metas-2025-ocp-design.html",
        "vendor blog",
    ),
    "trn2-page": _s(
        "Amazon EC2 Trn2 instances and UltraServers (product page)",
        "https://aws.amazon.com/ec2/instance-types/trn2/",
        "vendor product page",
    ),
    "trainium-page": _s(
        "AWS Trainium (product page; Trainium3 UltraServers)",
        "https://aws.amazon.com/ai/machine-learning/trainium/",
        "vendor product page",
    ),
}


def _f(v: Any, st: str, src: str, ref: str) -> dict[str, Any]:
    """One field: value, status, source id, where in the source."""
    return {"v": v, "st": st, "src": src, "ref": ref}


# Statuses:
#   spec          the vendor states it (product page, datasheet, documentation)
#   derived       computed from other sourced figures; the formula is in `ref`
#   rule          a standard or a published design rule
#   illustrative  a model parameter chosen for the picture, labelled as such
#   undisclosed   not disclosed in the sources used (value null)
#
# Availability of a product (``avail``):
#   product       a vendor product page lists its specifications
#   preliminary   the vendor marks the specifications preliminary or projected
#   planned       the vendor states a future availability date

GPUS: dict[str, dict[str, Any]] = {
    "h100": {
        "id": "h100",
        "name": "H100 SXM5",
        "arch": "Hopper",
        "avail": _f("product", "spec", "h100-page", "product page with specifications"),
        "fields": {
            "hbm_bytes": _f(80e9, "spec", "h100-page", "GPU Memory 80GB"),
            "hbm_bw": _f(3.35e12, "spec", "h100-page", "GPU Memory Bandwidth 3.35TB/s"),
            "hbm_stacks": _f(5, "spec", "hopper-blog", "H100 SXM5: '80 GB HBM3, 5 HBM3 stacks, 10 512-bit memory controllers' (the full GH100 has 6 sites)"),
            "hbm_gen": _f("HBM3", "spec", "hopper-blog", "H100 SXM5 memory"),
            "tdp_w": _f(700, "spec", "h100-page", "Max Thermal Design Power: up to 700W (configurable)"),
            "nvlink_bidir": _f(900e9, "spec", "nvlink-page", "fourth generation: 900 GB/s per GPU"),
            "nvlink_links": _f(18, "spec", "nvlink-page", "fourth generation: maximum 18 links per GPU"),
            "pcie_bidir": _f(128e9, "spec", "bwu-blog", "Table 1: PCIe 128 GB/s (Gen 5), bidirectional"),
            "dense_fp8": _f(1979e12, "derived", "h100-page", "FP8 Tensor Core 3,958 teraFLOPS is with sparsity; dense is half"),
            "dense_bf16": _f(989.5e12, "derived", "h100-page", "BF16 Tensor Core 1,979 teraFLOPS is with sparsity; dense is half"),
            "dies": _f(1, "spec", "bwu-blog", "Table 2: dies per GPU 1"),
            "transistors": _f(80e9, "spec", "bwu-blog", "Table 2: 80B transistors"),
        },
    },
    "h200": {
        "id": "h200",
        "name": "H200 SXM",
        "arch": "Hopper",
        "avail": _f("product", "spec", "h200-page", "product page with specifications"),
        "fields": {
            "hbm_bytes": _f(141e9, "spec", "h200-page", "GPU Memory 141GB"),
            "hbm_bw": _f(4.8e12, "spec", "h200-page", "GPU Memory Bandwidth 4.8TB/s"),
            "hbm_stacks": _f(None, "undisclosed", "h200-page", "stack count not given in the sources used"),
            "hbm_gen": _f("HBM3E", "spec", "bwu-blog", "Table 2: 141 GB HBM3E (H200)"),
            "tdp_w": _f(700, "spec", "h200-page", "Max Thermal Design Power: up to 700W (configurable)"),
            "nvlink_bidir": _f(900e9, "spec", "h200-page", "Interconnect: NVIDIA NVLink 900GB/s"),
            "nvlink_links": _f(18, "spec", "nvlink-page", "fourth generation: maximum 18 links per GPU"),
            "pcie_bidir": _f(128e9, "spec", "h200-page", "Interconnect: PCIe Gen5 128GB/s"),
            "dense_fp8": _f(1979e12, "derived", "h200-page", "FP8 Tensor Core 3,958 TFLOPS is with sparsity; dense is half"),
            "dense_bf16": _f(989.5e12, "derived", "h200-page", "BF16 Tensor Core 1,979 TFLOPS is with sparsity; dense is half"),
            "dies": _f(1, "spec", "bwu-blog", "Table 2 (Hopper): dies per GPU 1"),
            "transistors": _f(80e9, "spec", "bwu-blog", "Table 2 (Hopper): 80B transistors"),
        },
    },
    "b200": {
        "id": "b200",
        "name": "Blackwell (GB200 NVL72)",
        "arch": "Blackwell",
        "avail": _f("product", "spec", "gb200-page", "product page with specifications"),
        "fields": {
            "hbm_bytes": _f(186e9, "derived", "gb200-page", "GB200 Superchip: 372 GB HBM3E for 2 GPUs, so 186 GB per GPU (Blackwell's maximum is 192 GB, bwu-blog Table 2)"),
            "hbm_bw": _f(8e12, "derived", "gb200-page", "GB200 Superchip: 16 TB/s for 2 GPUs, so 8 TB/s per GPU (bwu-blog Table 2: 8 TB/s)"),
            "hbm_stacks": _f(None, "undisclosed", "bwu-blog", "the sources used give the stack count for Blackwell Ultra (8), not for Blackwell"),
            "hbm_gen": _f("HBM3E", "spec", "gb200-page", "GPU memory: HBM3E"),
            "tdp_w": _f(1200, "spec", "bwu-blog", "Table 2: Max power (TGP) up to 1,200W"),
            "nvlink_bidir": _f(1.8e12, "spec", "nvlink-page", "fifth generation: 1,800 GB/s per GPU"),
            "nvlink_links": _f(18, "spec", "nvlink-page", "fifth generation: maximum 18 links per GPU"),
            "pcie_bidir": _f(256e9, "spec", "bwu-blog", "Table 1: PCIe 256 GB/s (Gen 6), bidirectional"),
            "dense_fp8": _f(5e15, "spec", "bwu-blog", "Table 2: FP8 dense 5 petaFLOPS"),
            "dense_bf16": _f(2.5e15, "derived", "gb200-page", "GB200 Superchip FP16/BF16 10 PFLOPS is sparse for 2 GPUs: dense per GPU = 10 / 2 / 2"),
            "dies": _f(2, "spec", "bw-arch", "two reticle-limited dies connected by a 10 TB/s chip-to-chip interconnect"),
            "transistors": _f(208e9, "spec", "bw-arch", "208 billion transistors, TSMC 4NP"),
        },
    },
    "b300": {
        "id": "b300",
        "name": "Blackwell Ultra (GB300 NVL72)",
        "arch": "Blackwell Ultra",
        "avail": _f("product", "spec", "gb300-page", "product page with specifications"),
        "fields": {
            "hbm_bytes": _f(288e9, "spec", "bwu-blog", "High bandwidth memory features: max capacity 288 GB"),
            "hbm_bw": _f(8e12, "spec", "bwu-blog", "Bandwidth: 8 TB/s per GPU"),
            "hbm_stacks": _f(8, "spec", "bwu-blog", "HBM configuration: eight 12-Hi stacks, 16 x 512-bit controllers (8,192-bit total). The post's 2025-09-24 correction note mentions '12 HBM stacks'; the 8,192-bit width is eight 1,024-bit stacks"),
            "hbm_gen": _f("HBM3E", "spec", "bwu-blog", "288 GB HBM3E"),
            "tdp_w": _f(1400, "spec", "bwu-blog", "Table 2: Max power (TGP) up to 1,400W"),
            "nvlink_bidir": _f(1.8e12, "spec", "bwu-blog", "Table 1: NVLink 1,800 GB/s, bidirectional"),
            "nvlink_links": _f(18, "spec", "nvlink-page", "fifth generation: maximum 18 links per GPU"),
            "pcie_bidir": _f(256e9, "spec", "bwu-blog", "Table 1: PCIe 256 GB/s (Gen 6), bidirectional"),
            "dense_fp8": _f(5e15, "spec", "bwu-blog", "Table 2: FP8 dense 5 petaFLOPS"),
            "dense_bf16": _f(2.5e15, "derived", "gb300-page", "GB300 NVL72 FP16/BF16 360 PFLOPS is sparse for 72 GPUs: dense per GPU = 360 / 72 / 2"),
            "dies": _f(2, "spec", "bwu-blog", "Table 2: dies per GPU 2"),
            "transistors": _f(208e9, "spec", "bwu-blog", "Table 2: 208B transistors"),
        },
    },
    "rubin": {
        "id": "rubin",
        "name": "Rubin (Vera Rubin NVL72)",
        "arch": "Rubin",
        "avail": _f("preliminary", "spec", "nvlink-page", "NVLink 6 figures are marked 'Preliminary specifications'; the Vera Rubin NVL72 page says 'Available Now'"),
        "fields": {
            "hbm_bytes": _f(288e9, "spec", "vr-page", "NVIDIA Rubin GPU: GPU Memory 288 GB HBM4"),
            "hbm_bw": _f(19.2e12, "spec", "vr-page", "NVIDIA Rubin GPU: Bandwidth 19.2 TB/s (the rack figure, 1,400 TB/s, is 1.3% more than 72 x 19.2)"),
            "hbm_stacks": _f(None, "undisclosed", "vr-page", "stack count not given in the sources used"),
            "hbm_gen": _f("HBM4", "spec", "vr-page", "288 GB HBM4"),
            "tdp_w": _f(None, "undisclosed", "vr-page", "not given in the sources used"),
            "nvlink_bidir": _f(3e12, "spec", "vr-page", "NVIDIA Rubin GPU: NVLink Bandwidth 3 TB/s (nvlink-page: 3,000 GB/s per GPU, preliminary)"),
            "nvlink_links": _f(36, "spec", "nvlink-page", "sixth generation: maximum 36 links per GPU (preliminary)"),
            "pcie_bidir": _f(None, "undisclosed", "vr-page", "not given in the sources used"),
            "dense_fp8": _f(17.5e15, "spec", "vr-page", "NVIDIA Rubin GPU: FP8/FP6 Training 17.5 PFLOPS (dense)"),
            "dense_bf16": _f(4e15, "spec", "vr-page", "NVIDIA Rubin GPU: FP16/BF16 4 PFLOPS (dense)"),
            "dies": _f(None, "undisclosed", "vr-page", "not given in the sources used"),
            "transistors": _f(None, "undisclosed", "vr-page", "not given in the sources used"),
        },
    },
}

GPU_ORDER = ("h100", "h200", "b200", "b300", "rubin")

# Rack-scale and node systems.
SYSTEMS: dict[str, dict[str, Any]] = {
    "gb200-nvl72": {
        "id": "gb200-nvl72",
        "name": "GB200 NVL72",
        "gpu": "b200",
        "avail": _f("product", "spec", "gb200-page", "product page with specifications"),
        "fields": {
            "gpus": _f(72, "spec", "gb200-page", "Configuration: 36 Grace CPUs, 72 Blackwell GPUs"),
            "cpus": _f(36, "spec", "gb200-page", "Configuration: 36 Grace CPUs"),
            "compute_trays": _f(18, "spec", "dgx-gb200-guide", "18x 1RU compute trays"),
            "gpus_per_tray": _f(4, "spec", "dgx-gb200-guide", "each tray contains 2x Grace CPUs and 4x Blackwell GPUs"),
            "cpus_per_tray": _f(2, "spec", "dgx-gb200-guide", "each tray contains 2x Grace CPUs"),
            "switch_trays": _f(9, "spec", "dgx-gb200-guide", "9x 1RU NVLink switch trays"),
            "switch_chips_per_tray": _f(2, "spec", "dgx-gb200-guide", "each tray has 2x NVSwitches"),
            "ports_per_switch_chip": _f(72, "spec", "dgx-gb200-guide", "each NVSwitch has 72 NVLink ports"),
            "link_bidir": _f(100e9, "spec", "gb200-blog", "144 NVLink ports at 100 GB per switch tray"),
            "tray_tbps_dir": _f(57.6e12, "spec", "dgx-gb200-guide", "57.6 Tbps of full-duplex bandwidth for fifth-generation NVLink in a 1U design"),
            "nvlink_total": _f(130e12, "spec", "gb200-page", "NVLink bandwidth 130 TB/s"),
            "hbm_total": _f(13.4e12, "spec", "gb200-page", "GPU memory 13.4 TB HBM3E"),
            "hbm_bw_total": _f(576e12, "spec", "gb200-page", "GPU memory bandwidth 576 TB/s"),
            "c2c_bidir": _f(900e9, "spec", "gb200-blog", "NVLink-C2C delivers 900 GB/s of bidirectional bandwidth"),
            "lpddr_per_cpu": _f(480e9, "spec", "gb200-page", "GB200 Superchip: CPU memory up to 480 GB LPDDR5X"),
            "lpddr_bw_per_cpu": _f(512e9, "spec", "gb200-page", "GB200 Superchip: CPU memory bandwidth up to 512 GB/s"),
            "nics_per_tray": _f(4, "spec", "dgx-gb200-guide", "cluster network: 4x ConnectX-7 single-port 400G OSFP NICs"),
            "nic_bps": _f(400e9, "spec", "dgx-gb200-guide", "ConnectX-7 single-port 400G"),
            "dpus_per_tray": _f(2, "spec", "dgx-gb200-guide", "2x BlueField-3 DPUs, each dual-port 400G"),
            "rack_power_w": _f(120e3, "spec", "dgx-gb200-guide", "rack power consumption is approximately 120kW"),
            "power_shelves": _f(8, "spec", "dgx-gb200-guide", "eight power shelves, each requiring 33kW of input power"),
            "shelf_input_w": _f(33e3, "spec", "dgx-gb200-guide", "each requiring 33kW of input power"),
            "psus_per_shelf": _f(6, "spec", "dgx-gb200-guide", "six air-cooled 5.5kW PSUs, N+N redundancy"),
            "psu_w": _f(5.5e3, "spec", "dgx-gb200-guide", "5.5kW PSUs"),
            "dc_volts": _f(50, "spec", "dgx-gb200-guide", "AC to a nominal 50V-51V DC output, bus bar in the rack"),
            "cooling": _f("liquid to cold plates on CPUs and GPUs; networking and storage air-cooled", "spec", "dgx-gb200-guide", "Cooling"),
        },
    },
    "gb300-nvl72": {
        "id": "gb300-nvl72",
        "name": "GB300 NVL72",
        "gpu": "b300",
        "avail": _f("product", "spec", "gb300-page", "product page with specifications"),
        "fields": {
            "gpus": _f(72, "spec", "gb300-page", "Configuration: 72 Blackwell Ultra GPUs, 36 Grace CPUs"),
            "nvlink_total": _f(130e12, "spec", "gb300-page", "NVLink bandwidth 130 TB/s"),
            "hbm_total": _f(20e12, "spec", "gb300-page", "GPU memory 20 TB"),
            "hbm_bw_total": _f(576e12, "spec", "gb300-page", "GPU memory bandwidth up to 576 TB/s"),
            "nic_bps": _f(800e9, "spec", "gb300-page", "800 Gb/s per GPU through ConnectX-8 SuperNICs"),
            "rack_power_w": _f(None, "undisclosed", "gb300-page", "not given in the sources used"),
        },
    },
    "vr-nvl72": {
        "id": "vr-nvl72",
        "name": "Vera Rubin NVL72",
        "gpu": "rubin",
        "avail": _f("preliminary", "spec", "vr-page", "'Available Now' on the product page; NVLink 6 specifications marked preliminary (nvlink-page)"),
        "fields": {
            "gpus": _f(72, "spec", "vr-page", "Configuration: 72 Rubin GPUs, 36 Vera CPUs"),
            "nvlink_total": _f(216e12, "spec", "vr-page", "NVLink bandwidth 216 TB/s"),
            "hbm_total": _f(20.7e12, "spec", "vr-page", "GPU memory 20.7 TB HBM4"),
            "hbm_bw_total": _f(1400e12, "spec", "vr-page", "bandwidth 1,400 TB/s"),
            "net_bidir_per_gpu": _f(0.45e12, "spec", "vr-page", "networking bandwidth 0.45 TB/s per GPU, bi-directional"),
            "factory_gpus": _f(40000, "spec", "vr-page", "100 MW AI factory reference: 40K Rubin GPUs"),
            "factory_w": _f(100e6, "spec", "vr-page", "100 MW AI factory (NVIDIA DSX with MaxLPS)"),
            "inlet_c": _f(45, "spec", "vr-page", "Inlet temp 45°C"),
            "rack_power_w": _f(None, "undisclosed", "vr-page", "not given in the sources used"),
        },
    },
    "dgx-b200": {
        "id": "dgx-b200",
        "name": "DGX B200 (8-GPU node)",
        "gpu": "b200",
        "avail": _f("product", "spec", "dgx-b200-page", "product page with specifications"),
        "fields": {
            "gpus": _f(8, "spec", "dgx-b200-page", "eight NVIDIA Blackwell GPUs"),
            "hbm_total": _f(1440e9, "spec", "dgx-b200-page", "1,440 GB total GPU memory"),
            "hbm_bw_total": _f(64e12, "spec", "dgx-b200-page", "64 TB/s HBM3e bandwidth"),
            "nvlink_total": _f(14.4e12, "spec", "dgx-b200-page", "14.4 TB/s aggregate NVLink bandwidth"),
            "nvswitch_chips": _f(2, "spec", "dgx-b200-page", "2x NVSwitch"),
            "nic_bps": _f(400e9, "spec", "dgx-b200-page", "8x single-port ConnectX-7, up to 400 Gb/s"),
            "node_power_w": _f(14.3e3, "spec", "dgx-b200-page", "about 14.3 kW maximum system power"),
            "rack_units": _f(10, "spec", "dgx-b200-page", "10 RU"),
        },
    },
}

# Scale-out switches (ports at the stated speed).
SWITCHES: dict[str, dict[str, Any]] = {
    "quantum2": {
        "id": "quantum2",
        "name": "Quantum-2 (QM9700 class), InfiniBand NDR",
        "avail": _f("product", "spec", "quantum2-page", "product page"),
        "ports": _f(64, "spec", "quantum2-page", "Quantum-2 switches: 64 400Gb/s ports"),
        "port_bps": _f(400e9, "spec", "quantum2-page", "400Gb/s ports"),
        "cpo": False,
    },
    "q3400": {
        "id": "q3400",
        "name": "Quantum-X800, InfiniBand XDR",
        "avail": _f("product", "spec", "qx800-page", "product page"),
        "ports": _f(144, "spec", "qx800-page", "144 ports of 800 Gb/s connectivity per port"),
        "port_bps": _f(800e9, "spec", "qx800-page", "800 Gb/s per port"),
        "cpo": False,
    },
    "sn5600": {
        "id": "sn5600",
        "name": "Spectrum-4 SN5600, Ethernet",
        "avail": _f("product", "spec", "eth-switch-page", "switch table"),
        "ports": _f(64, "spec", "eth-switch-page", "SN5600: 64x OSFP 800GbE, 51.2Tb/s"),
        "port_bps": _f(800e9, "spec", "eth-switch-page", "800GbE"),
        "cpo": False,
    },
    "q3450": {
        "id": "q3450",
        "name": "Quantum-X Photonics Q3450, InfiniBand (co-packaged optics)",
        "avail": _f("planned", "spec", "cpo-blog", "commercial availability planned for early 2026 (blog dated 2025-08-18)"),
        "ports": _f(144, "spec", "photonics-page", "Q3450-LD: 144 ports of 800 Gb/s InfiniBand"),
        "port_bps": _f(800e9, "spec", "photonics-page", "800 Gb/s"),
        "cpo": True,
    },
    "sn6810": {
        "id": "sn6810",
        "name": "Spectrum-X Photonics SN6810, Ethernet (co-packaged optics)",
        "avail": _f("planned", "spec", "photonics-page", "available in the second half of 2026"),
        "ports": _f(128, "spec", "cpo-blog", "SN6810: 102.4 Tb/s, 128 ports at 800 Gb/s"),
        "port_bps": _f(800e9, "spec", "cpo-blog", "800 Gb/s"),
        "cpo": True,
    },
    "sn6800": {
        "id": "sn6800",
        "name": "Spectrum-X Photonics SN6800, Ethernet (co-packaged optics, four ASICs)",
        "avail": _f("planned", "spec", "photonics-page", "available in the second half of 2026"),
        "ports": _f(512, "spec", "cpo-blog", "SN6800: 409.6 Tb/s, 512 ports at 800 Gb/s"),
        "port_bps": _f(800e9, "spec", "cpo-blog", "800 Gb/s"),
        "cpo": True,
    },
}

SWITCH_ORDER = ("quantum2", "q3400", "sn5600", "q3450", "sn6810", "sn6800")

# Chapters 6-7: power and cooling figures beyond the system records.
FACILITY: dict[str, dict[str, Any]] = {
    "power": {
        "id": "power",
        "name": "Rack power delivery",
        "avail": _f("product", "spec", "800v-blog", "54 V racks ship today; 800 VDC is planned for 2027"),
        "fields": {
            "busbar_v": _f(54, "spec", "800v-blog", "'Today's racks in AI factories rely on 54 VDC power distribution'"),
            "hvdc_v": _f(800, "spec", "800v-blog", "800 VDC to the compute rack, 'starting in 2027' (planned)"),
            "mw_rack_w": _f(1e6, "spec", "800v-blog", "'to support 1 MW IT racks and beyond, starting in 2027' (planned)"),
            "copper_1mw_kg": _f(200, "spec", "800v-blog", "'a single 1 MW rack requires up to 200 kg of copper busbar' at 54 VDC"),
            "storage_j_per_gpu": _f(65, "spec", "smooth-blog", "GB300 NVL72 power supplies: '65 joules/GPU of energy storage' (capacitors)"),
        },
    },
    "cooling": {
        "id": "cooling",
        "name": "Rack cooling",
        "avail": _f("product", "spec", "water-blog", "figures quoted for shipping GB200 / GB300 NVL72 deployments"),
        "fields": {
            "legacy_rack_w": _f(20e3, "spec", "water-blog", "'data centers once operated at 20 kW per rack'"),
            "hyperscale_rack_w": _f(135e3, "spec", "water-blog", "'today's hyperscale facilities can support over 135 kW per rack'"),
            "cdu_w": _f(2e6, "spec", "water-blog", "a liquid-to-liquid CDU for GB300 NVL72: '2MW cooling capacity at 5°C approach temperature'"),
            "cdu_approach_k": _f(5, "spec", "water-blog", "'5°C approach temperature'"),
            "coldplate_w": _f(4000, "spec", "water-blog", "cold plates for 'over 4,000W thermal design power'"),
            "liquid_parts": _f("CPUs and GPUs on cold plates; networking and storage air-cooled", "spec", "dgx-gb200-guide", "Compute Trays"),
        },
    },
}

# Physical properties (chapter 7). The water value is the NIST Shomate equation at 298.15 K (computed below).
PHYS: dict[str, dict[str, Any]] = {
    "shomate": {
        "A": -203.6060, "B": 1523.290, "C": -3196.413, "D": 2474.455, "E": 3.855326,
        "T": 298.15, "molar_mass_g": 18.0153,
    },
    "fields": {
        "air_density": _f(1.229, "spec", "nasa-air", "sea-level standard day: 1.229 kg/m³"),
        "air_r": _f(286.0, "spec", "nasa-gas", "gas constant of air: .286 kJ/(kg K)"),
        "air_gamma": _f(1.4, "spec", "nasa-gas", "Specific Heats page: 'For air, gamma = 1.4 for standard day conditions'"),
        "water_kg_per_l": _f(1.0, "illustrative", "nist-water", "one litre of water taken as 1 kg (0.997 kg at 25 °C)"),
    },
}

# Chapter 10: other rack- and pod-scale designs (neutral; vendor figures as stated).
OTHERS: dict[str, dict[str, Any]] = {
    "tpu-v5p": {
        "id": "tpu-v5p",
        "name": "Google TPU v5p pod",
        "avail": _f("product", "spec", "tpu-v5p", "Cloud TPU documentation"),
        "fields": {
            "chips": _f(8960, "spec", "tpu-v5p", "'There are 8960 chips in a v5p Pod'"),
            "topology": _f("3D torus; 4x4x4 cubes joined by optical circuit switches", "spec", "tpu-v5p", "Interconnect topology: 3D torus; ICI resiliency section: OCS connect TPUs between cubes, copper within a cube"),
            "scaleup_bidir": _f(1200e9, "spec", "tpu-v5p", "Bidirectional ICI bandwidth per chip 1200 GBps"),
            "hbm_bw": _f(2765e9, "spec", "tpu-v5p", "HBM bandwidth per chip 2765 GBps"),
            "dense_bf16": _f(459e12, "spec", "tpu-v5p", "Peak compute per chip (BF16) 459 TFLOPs"),
        },
    },
    "tpu-7x": {
        "id": "tpu-7x",
        "name": "Google TPU7x (Ironwood) pod",
        "avail": _f("product", "spec", "tpu-7x", "Cloud TPU documentation"),
        "fields": {
            "chips": _f(9216, "spec", "tpu-7x", "'a 9,216-chip footprint per Pod'"),
            "topology": _f(None, "undisclosed", "tpu-7x", "the page used does not state the pod topology"),
            "scaleup_bidir": _f(1200e9, "spec", "tpu-7x", "Bidirectional ICI bandwidth per chip 1200 GBps"),
            "hbm_bw": _f(7380e9, "spec", "tpu-7x", "HBM bandwidth per chip 7380 GBps"),
            "dense_bf16": _f(2307e12, "spec", "tpu-7x", "Peak compute per chip (BF16) 2307 TFLOPs"),
        },
    },
    "helios": {
        "id": "helios",
        "name": "AMD Helios (72 x Instinct MI450)",
        "avail": _f("planned", "spec", "helios-blog", "reference design, 'volume deployment expected in 2026'"),
        "fields": {
            "chips": _f(72, "spec", "helios-blog", "'a Helios system with 72 MI450 Series GPUs'"),
            "topology": _f(None, "undisclosed", "helios-blog", "the scale-up fabric's topology is not stated in the source used"),
            "scaleup_total": _f(260e12, "spec", "helios-blog", "'up to 260 TB/s of scale-up interconnect bandwidth'"),
            "scaleout_total": _f(43e12, "spec", "helios-blog", "'43 TB/s of Ethernet-based scale-out bandwidth'"),
            "hbm_bytes": _f(432e9, "spec", "helios-blog", "'up to 432 GB of HBM4 memory' per GPU"),
            "hbm_bw": _f(19.6e12, "spec", "helios-blog", "'19.6 TB/s of memory bandwidth' per GPU"),
            "hbm_total": _f(31e12, "spec", "helios-blog", "'31 TB of total HBM4 memory'"),
            "hbm_bw_total": _f(1.4e15, "spec", "helios-blog", "'1.4 PB/s of aggregate bandwidth'"),
            "rack_form": _f("Open Rack Wide (double-wide), liquid-cooled", "spec", "helios-blog", "ORW specification; 'backside quick-disconnect liquid cooling'"),
        },
    },
    "trn2-ultra": {
        "id": "trn2-ultra",
        "name": "AWS Trn2 UltraServer (64 x Trainium2)",
        "avail": _f("product", "spec", "trn2-page", "the page says both 'available now' and 'available in preview'"),
        "fields": {
            "chips": _f(64, "spec", "trn2-page", "'64 Trainium2 chips across four Trn2 instances'"),
            "topology": _f("NeuronLink across four 16-chip instances", "spec", "trn2-page", "NeuronLink, 'our proprietary chip-to-chip interconnect'"),
            "instance_chips": _f(16, "spec", "trn2-page", "'16 Trainium2 chips' per Trn2 instance"),
            "instance_fp8": _f(20.8e15, "spec", "trn2-page", "Trn2 instance: 'up to 20.8 FP8 petaflops'"),
            "fp8_total": _f(83.2e15, "spec", "trn2-page", "UltraServer: 'up to 83.2 FP8 petaflops'"),
            "instance_hbm_bw": _f(46e12, "spec", "trn2-page", "Trn2 instance: '46 TBps of total memory bandwidth'"),
            "hbm_bw_total": _f(185e12, "spec", "trn2-page", "UltraServer: '185 TBps of total memory bandwidth'"),
            "scaleout_bps": _f(12.8e12, "spec", "trn2-page", "UltraServers: '12.8 Tbps of EFAv3 networking'"),
            "scaleup_bidir": _f(None, "undisclosed", "trn2-page", "NeuronLink bandwidth per chip not stated on the page used"),
        },
    },
    "trn3-ultra": {
        "id": "trn3-ultra",
        "name": "AWS Trainium3 UltraServer (144 x Trainium3)",
        "avail": _f("product", "spec", "trainium-page", "product page lists the specifications"),
        "fields": {
            "chips": _f(144, "spec", "trainium-page", "'scale up to 144 Trainium chips'"),
            "topology": _f("NeuronSwitch all-to-all fabric", "spec", "trainium-page", "'NeuronSwitch provides an all-to-all fabric'"),
            "hbm_bytes": _f(144e9, "spec", "trainium-page", "'144 GB HBM3e per chip'"),
            "hbm_bw": _f(4.9e12, "spec", "trainium-page", "'4.9 TB/s bandwidth' per chip"),
            "hbm_total": _f(20.7e12, "spec", "trainium-page", "'20.7 TB of HBM3e'"),
            "hbm_bw_total": _f(706e12, "spec", "trainium-page", "'706 TB/s of aggregate memory bandwidth'"),
            "scaleup_bidir": _f(None, "undisclosed", "trainium-page", "interchip bandwidth per chip not stated on the page used"),
        },
    },
}
OTHER_ORDER = ("tpu-v5p", "tpu-7x", "helios", "trn2-ultra", "trn3-ultra")

# Quoted claims: shown on the site, attributed, never used as model inputs.
CLAIMS: dict[str, dict[str, str]] = {
    "cpo-power": {
        "text": "co-packaged optics: '3.5x power efficiency' compared with pluggable transceivers",
        "src": "cpo-blog",
    },
    "q3450-scale": {
        "text": "'connecting over 10,000 GPUs in a non-blocking, two-level fat-tree topology'",
        "src": "photonics-page",
    },
    "nvl72-one-gpu": {
        "text": "the 72 GPUs of an NVL72 'communicate as one' (all-to-all at 1.8 TB/s per GPU)",
        "src": "gb200-blog",
    },
    "800v-conductor": {
        "text": "800 VDC 'enables 85% more power to be transmitted through the same conductor size' than 415 VAC, and 'up to 5%' better end-to-end efficiency than 54 V systems",
        "src": "800v-blog",
    },
    "smooth-peak": {
        "text": "energy-storage power shelves: 'the peak power demand seen by the grid is reduced by 30% when training the Megatron LLM'",
        "src": "smooth-blog",
    },
    "vr-tokens-mw": {
        "text": "Vera Rubin NVL72 'delivers up to 10x more tokens per megawatt than NVIDIA GB200 NVL72' (Kimi-K2 Thinking, 32K/8K input/output)",
        "src": "vr-page",
    },
    "cpx-attention": {
        "text": "Rubin CPX: 'up to 30 petaflops of compute with NVFP4 precision', '128GB of cost-efficient GDDR7', '3x faster attention' than GB300 NVL72; 'expected to be available at the end of 2026'",
        "src": "cpx-news",
    },
    "liquid-300x": {
        "text": "GB200 NVL72: '25x more energy efficiency and 300x more water efficiency than traditional air-cooled architectures'",
        "src": "water-blog",
    },
    "distserve-goodput": {
        "text": "DistServe 'can serve 7.4x more requests or 12.6x tighter SLO' than state-of-the-art systems (in its own evaluation)",
        "src": "distserve",
    },
}

# Published reference-architecture counts (validation targets, not inputs).
SUPERPOD_TABLE3: list[dict[str, int]] = [
    # GPUs, SUs, core switches, leaf (total), spine (total)
    {"gpus": 1152, "sus": 2, "core": 18, "leaf": 64, "spine": 48},
    {"gpus": 2304, "sus": 4, "core": 36, "leaf": 128, "spine": 96},
    {"gpus": 4608, "sus": 8, "core": 72, "leaf": 256, "spine": 192},
    {"gpus": 9216, "sus": 16, "core": 144, "leaf": 512, "spine": 384},
]
SUPERPOD_RULES: dict[str, dict[str, Any]] = {
    "systems_per_su": _f(8, "spec", "superpod-network", "each SU contains 8 DGX GB200 systems (racks)"),
    "rails": _f(4, "spec", "superpod-network", "4 SLGs to match the number of IB rails (GPUs per compute tray)"),
    "leaves_per_slg": _f(8, "spec", "superpod-network", "8 leaf switches (one for each compute rack) in each SLG"),
    "spines_per_slg": _f(6, "spec", "superpod-network", "6 spine switches in each SLG"),
    "radix": _f(64, "spec", "quantum2-page", "Quantum-2 (QM9700) switches: 64 400Gb/s ports"),
    "max_sus": _f(16, "spec", "superpod-network", "scalability for up to and including 16 SUs"),
}

# Models whose weights chapter 2 places in HBM (parameter counts from their papers).
MODELS: dict[str, dict[str, Any]] = {
    "llama3-70b": {"id": "llama3-70b", "name": "Llama 3 70B", "params": 70e9, "src": "llama3"},
    "llama3-405b": {"id": "llama3-405b", "name": "Llama 3.1 405B", "params": 405e9, "src": "llama3"},
    "deepseek-v3": {"id": "deepseek-v3", "name": "DeepSeek-V3 (671B total)", "params": 671e9, "src": "deepseekv3"},
}
MODEL_ORDER = ("llama3-70b", "llama3-405b", "deepseek-v3")

# Bytes per parameter for each weight format (the format's width; no scales).
FORMATS: dict[str, float] = {"bf16": 2.0, "fp8": 1.0, "fp4": 0.5}


def gpu(gid: str) -> dict[str, Any]:
    """Flat dict of a GPU's values."""
    g = GPUS[gid]
    out: dict[str, Any] = {"id": g["id"], "name": g["name"], "arch": g["arch"], "avail": g["avail"]["v"]}
    for k, f in g["fields"].items():
        out[k] = f["v"]
    return out


def system(sid: str) -> dict[str, Any]:
    """Flat dict of a system's values."""
    s = SYSTEMS[sid]
    out: dict[str, Any] = {"id": s["id"], "name": s["name"], "gpu": s["gpu"], "avail": s["avail"]["v"]}
    for k, f in s["fields"].items():
        out[k] = f["v"]
    return out


def switch(wid: str) -> dict[str, Any]:
    w = SWITCHES[wid]
    return {
        "id": w["id"],
        "name": w["name"],
        "avail": w["avail"]["v"],
        "ports": w["ports"]["v"],
        "port_bps": w["port_bps"]["v"],
        "cpo": w["cpo"],
    }


def per_dir(bidir: float) -> float:
    """A bidirectional figure, per direction."""
    return bidir / 2


# ---------------------------------------------------------------------------
# Chapter 1: the scale ladder
# ---------------------------------------------------------------------------

LADDER_PAYLOAD = 1e9  # the payload each rung's bar times: 1 GB
HALL_W = 100e6  # the hall rung: 100 MW of rack power (illustrative size)


def ladder(sid: str = "gb200-nvl72", payload: float = LADDER_PAYLOAD, hall_w: float = HALL_W) -> list[dict[str, Any]]:
    """
    The rungs from one GPU to a hall, for GB200 NVL72 racks in the published
    SuperPOD design. Each rung: how many GPUs it holds, how many of the rung
    below, the link that carries traffic between GPUs at that rung, the
    bandwidth per GPU per direction on it, the time one GPU needs to move
    `payload` bytes over it, and the rack power of that many GPUs.

    The hall is sized by power: `hall_w` divided by the rack's power, rounded
    down to whole racks (rack power only: no cooling, network or facility
    overhead).
    """
    s = system(sid)
    g = gpu(s["gpu"])
    rp = s["rack_power_w"]
    per_gpu_w = rp / s["gpus"]
    nvl = per_dir(g["nvlink_bidir"])
    nic = s["nic_bps"] / 8
    su = SUPERPOD_RULES["systems_per_su"]["v"]
    max_sus = SUPERPOD_RULES["max_sus"]["v"]
    hall_racks = math.floor(hall_w / rp)
    rungs = [
        {"key": "package", "name": "Package", "gpus": 1, "children": g["dies"], "child": "die",
         "link": "HBM", "bw": g["hbm_bw"]},
        {"key": "tray", "name": "Compute tray", "gpus": s["gpus_per_tray"], "children": s["gpus_per_tray"], "child": "GPU",
         "link": "NVLink", "bw": nvl},
        {"key": "rack", "name": "Rack (NVLink domain)", "gpus": s["gpus"], "children": s["compute_trays"], "child": "tray",
         "link": "NVLink", "bw": nvl},
        {"key": "su", "name": "Scalable unit", "gpus": s["gpus"] * su, "children": su, "child": "rack",
         "link": "InfiniBand", "bw": nic},
        {"key": "pod", "name": "SuperPOD", "gpus": s["gpus"] * su * max_sus, "children": max_sus, "child": "SU",
         "link": "InfiniBand", "bw": nic},
        {"key": "hall", "name": "Hall", "gpus": s["gpus"] * hall_racks, "children": hall_racks, "child": "rack",
         "link": "InfiniBand", "bw": nic},
    ]
    out = []
    for i, r in enumerate(rungs):
        r = dict(r)
        r["i"] = i
        r["time"] = payload / r["bw"]
        r["power_w"] = r["gpus"] * per_gpu_w
        r["aggregate"] = r["gpus"] * r["bw"]
        r["drop"] = (rungs[i - 1]["bw"] / r["bw"]) if i > 0 else 1.0
        out.append(r)
    return out


# ---------------------------------------------------------------------------
# Chapter 2: the package
# ---------------------------------------------------------------------------


def package(gid: str) -> dict[str, Any]:
    """HBM per stack, the time to read all of HBM once, and the ridge point."""
    g = gpu(gid)
    stacks = g["hbm_stacks"]
    per_stack = g["hbm_bytes"] / stacks if stacks else None
    per_stack_bw = g["hbm_bw"] / stacks if stacks else None
    return {
        "id": gid,
        "stacks": stacks,
        "per_stack_bytes": per_stack,
        "per_stack_bw": per_stack_bw,
        "sweep_time": g["hbm_bytes"] / g["hbm_bw"],
        "ridge_fp8": g["dense_fp8"] / g["hbm_bw"],
        "bytes_per_flop": g["hbm_bw"] / g["dense_fp8"],
        "w_per_tbs": (g["tdp_w"] / (g["hbm_bw"] / 1e12)) if g["tdp_w"] is not None else None,
    }


def weights_bytes(mid: str, fmt: str) -> float:
    return MODELS[mid]["params"] * FORMATS[fmt]


def fit(gid: str, mid: str, fmt: str) -> dict[str, Any]:
    """
    Weights only (no KV cache, activations or runtime): how many GPUs hold
    them, and the time each GPU needs to read its share once, which bounds a
    batch-1 decode step from below.
    """
    g = gpu(gid)
    wb = weights_bytes(mid, fmt)
    n = math.ceil(wb / g["hbm_bytes"])
    share = wb / n
    return {
        "weights": wb,
        "gpus": n,
        "share": share,
        "fill": share / g["hbm_bytes"],
        "read_time": share / g["hbm_bw"],
        "tokens_per_s": g["hbm_bw"] / share,
    }


def fill_steps(gid: str, mid: str, fmt: str) -> list[dict[str, Any]]:
    """
    The package animation: the first GPU's share of the weights fills its HBM
    stack by stack. Step i has i stacks written (the last one partly).
    """
    g = gpu(gid)
    stacks = g["hbm_stacks"]
    f = fit(gid, mid, fmt)
    per = g["hbm_bytes"] / stacks
    out = []
    for i in range(stacks + 1):
        placed = min(f["share"], per * i)
        full = math.floor(placed / per)
        out.append(
            {
                "i": i,
                "placed": placed,
                "full": full,
                "last": (placed - full * per) / per,
                "left": f["share"] - placed,
                "done": placed >= f["share"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# Chapter 3: data paths through a tray (chunked, store-and-forward)
# ---------------------------------------------------------------------------

def paths(sid: str = "gb200-nvl72") -> dict[str, dict[str, Any]]:
    """
    The paths a GB200 compute tray's data takes, as chains of links with a
    bandwidth per direction each.
    """
    s = system(sid)
    g = gpu(s["gpu"])
    nvl = per_dir(g["nvlink_bidir"])
    c2c = per_dir(s["c2c_bidir"])
    pcie5 = per_dir(GPUS["h100"]["fields"]["pcie_bidir"]["v"])
    return {
        "rdma": {
            "label": "Network to GPU memory (GPUDirect RDMA)",
            "hops": [
                {"name": "InfiniBand port (ConnectX-7)", "bw": s["nic_bps"] / 8},
                {"name": "PCIe Gen5 x16", "bw": pcie5},
                {"name": "HBM write", "bw": g["hbm_bw"]},
            ],
        },
        "grace": {
            "label": "Grace memory to GPU memory (NVLink-C2C)",
            "hops": [
                {"name": "LPDDR5X read", "bw": s["lpddr_bw_per_cpu"]},
                {"name": "NVLink-C2C", "bw": c2c},
                {"name": "HBM write", "bw": g["hbm_bw"]},
            ],
        },
        "peer": {
            "label": "GPU to GPU in the rack (NVLink via a switch tray)",
            "hops": [
                {"name": "HBM read", "bw": g["hbm_bw"]},
                {"name": "NVLink to the switches", "bw": nvl},
                {"name": "NVLink to the peer", "bw": nvl},
                {"name": "HBM write", "bw": g["hbm_bw"]},
            ],
        },
    }


PATH_ORDER = ("rdma", "grace", "peer")


def pipeline(hops: list[dict[str, Any]], payload: float, chunks: int) -> dict[str, Any]:
    """
    Each chunk crosses each link in turn; a link carries one chunk at a time.
    start[c][i] = max(finish[c][i-1], finish[c-1][i]); finish = start + chunk / bw_i.
    """
    size = payload / chunks
    h = len(hops)
    start = [[0.0] * h for _ in range(chunks)]
    finish = [[0.0] * h for _ in range(chunks)]
    for c in range(chunks):
        for i in range(h):
            a = finish[c][i - 1] if i > 0 else 0.0
            b = finish[c - 1][i] if c > 0 else 0.0
            s0 = a if a > b else b
            start[c][i] = s0
            finish[c][i] = s0 + size / hops[i]["bw"]
    total = finish[chunks - 1][h - 1]
    slow = 0
    for i in range(1, h):
        if hops[i]["bw"] < hops[slow]["bw"]:
            slow = i
    return {
        "chunk": size,
        "start": start,
        "finish": finish,
        "total": total,
        "bottleneck": slow,
        "ideal": payload / hops[slow]["bw"],
        "rate": payload / total,
    }


def pipeline_steps(hops: list[dict[str, Any]], payload: float, chunks: int, frames: int) -> list[dict[str, Any]]:
    """
    Frame k is time total * k / frames. Each chunk is at a hop (0..h-1, or h
    when delivered), moving (progress in [0, 1)) or waiting for the link.
    """
    p = pipeline(hops, payload, chunks)
    h = len(hops)
    out = []
    for k in range(frames + 1):
        t = p["total"] * k / frames
        pos = []
        done = 0
        for c in range(chunks):
            if t >= p["finish"][c][h - 1]:
                pos.append({"hop": h, "frac": 0.0, "wait": False})
                done += 1
                continue
            for i in range(h):
                if t < p["finish"][c][i]:
                    s0 = p["start"][c][i]
                    if t < s0:
                        pos.append({"hop": i, "frac": 0.0, "wait": True})
                    else:
                        pos.append({"hop": i, "frac": (t - s0) / (p["finish"][c][i] - s0), "wait": False})
                    break
        busy = []
        for i in range(h):
            b = False
            for c in range(chunks):
                if p["start"][c][i] <= t < p["finish"][c][i]:
                    b = True
            busy.append(b)
        out.append({"k": k, "t": t, "pos": pos, "done": done, "delivered": done * p["chunk"], "busy": busy})
    return out


# ---------------------------------------------------------------------------
# Chapter 4: scale-up, the NVLink domain
# ---------------------------------------------------------------------------


def nvlink_domain(sid: str = "gb200-nvl72") -> dict[str, Any]:
    """The wiring of an NVL72 rack: every GPU has one link to every switch chip."""
    s = system(sid)
    g = gpu(s["gpu"])
    chips = s["switch_trays"] * s["switch_chips_per_tray"]
    links = s["gpus"] * g["nvlink_links"]
    ports = chips * s["ports_per_switch_chip"]
    per_gpu = g["nvlink_links"] * s["link_bidir"]
    return {
        "chips": chips,
        "links": links,
        "ports": ports,
        "links_per_chip_per_gpu": links / (chips * s["gpus"]),
        "per_gpu_bidir": per_gpu,
        "per_gpu_dir": per_dir(per_gpu),
        "total_bidir": s["gpus"] * per_gpu,
        "chip_bidir": s["ports_per_switch_chip"] * s["link_bidir"],
        "tray_bits_dir": s["switch_chips_per_tray"] * s["ports_per_switch_chip"] * per_dir(s["link_bidir"]) * 8,
    }


def xorshift32(x: int) -> int:
    x ^= (x << 13) & 0xFFFFFFFF
    x ^= x >> 17
    x ^= (x << 5) & 0xFFFFFFFF
    return x & 0xFFFFFFFF


def ring_values(n: int, seed: int = 7) -> list[list[int]]:
    """GPU g's vector of n chunk values (small integers, so sums are exact)."""
    x = seed
    out = []
    for _ in range(n):
        row = []
        for _ in range(n):
            x = xorshift32(x)
            row.append(x % 10)
        out.append(row)
    return out


def ring_allreduce_steps(n: int, seed: int = 7) -> dict[str, Any]:
    """
    Ring all-reduce (Patarasuk and Yuan 2009): n GPUs in a ring, each vector
    cut into n chunks. Reduce-scatter: at step s, GPU g sends chunk
    (g - s) mod n to GPU g + 1, which adds it to its own. All-gather: at step
    s, GPU g sends chunk (g + 1 - s) mod n, now complete, which the next GPU
    copies. 2(n - 1) steps; each GPU sends 2(n - 1)/n of its vector.
    """
    v = ring_values(n, seed)
    cur = [row[:] for row in v]
    total = [sum(v[g][c] for g in range(n)) for c in range(n)]
    cnt = [[1] * n for _ in range(n)]
    steps = [{"s": 0, "phase": "start", "sends": [], "values": [row[:] for row in cur], "count": [row[:] for row in cnt]}]
    for s in range(n - 1):
        sends = []
        for g in range(n):
            c = (g - s) % n
            sends.append({"from": g, "to": (g + 1) % n, "chunk": c, "value": cur[g][c]})
        add = [cnt[m["from"]][m["chunk"]] for m in sends]
        for j, m in enumerate(sends):
            cur[m["to"]][m["chunk"]] = cur[m["to"]][m["chunk"]] + m["value"]
            cnt[m["to"]][m["chunk"]] = cnt[m["to"]][m["chunk"]] + add[j]
        steps.append({"s": s + 1, "phase": "reduce-scatter", "sends": sends, "values": [row[:] for row in cur],
                      "count": [row[:] for row in cnt]})
    for s in range(n - 1):
        sends = []
        for g in range(n):
            c = (g + 1 - s) % n
            sends.append({"from": g, "to": (g + 1) % n, "chunk": c, "value": cur[g][c]})
        for m in sends:
            cur[m["to"]][m["chunk"]] = m["value"]
            cnt[m["to"]][m["chunk"]] = n
        steps.append({"s": n + s, "phase": "all-gather", "sends": sends, "values": [row[:] for row in cur],
                      "count": [row[:] for row in cnt]})
    return {"n": n, "input": v, "total": total, "steps": steps}


def allreduce_time(n: int, size: float, bw: float, algo: str) -> float:
    """
    Bandwidth term only (no latency). ring: each GPU sends and receives
    2(n-1)/n of the vector. switch: the switch reduces in the network
    (in-network reduction), so each GPU sends its vector once and receives the
    result once.
    """
    if algo == "ring":
        return 2 * (n - 1) / n * size / bw
    return size / bw


def tp_compare(sid: str, size: float, n: int) -> dict[str, Any]:
    """The same all-reduce over NVLink and over the GPU's network port."""
    s = system(sid)
    g = gpu(s["gpu"])
    nvl = per_dir(g["nvlink_bidir"])
    nic = s["nic_bps"] / 8
    t_nvl = allreduce_time(n, size, nvl, "ring")
    t_nic = allreduce_time(n, size, nic, "ring")
    return {
        "size": size,
        "n": n,
        "nvlink_bw": nvl,
        "nic_bw": nic,
        "t_nvlink": t_nvl,
        "t_switch": allreduce_time(n, size, nvl, "switch"),
        "t_nic": t_nic,
        "ratio": t_nic / t_nvl,
    }


def alltoall_time(n: int, size: float, bw: float) -> float:
    """Each GPU keeps 1/n of its data and sends the rest: (n-1)/n of it."""
    return (n - 1) / n * size / bw


# ---------------------------------------------------------------------------
# Chapter 5: scale-out, fat trees
# ---------------------------------------------------------------------------


def fat_tree(n: int, k: int, oversub: int = 1, endpoint_optics: bool = True) -> dict[str, Any]:
    """
    A folded-Clos (fat-tree) fabric of radix-k switches for n endpoints (one
    per GPU NIC port). Leaves give `down` ports to endpoints and `up` ports to
    the layer above, with down:up = oversub:1 (1 = non-blocking).

    Two tiers while n <= k * down (each spine reaches every leaf, k leaves at
    most). Beyond that, three tiers: pods of k/2 leaves and k/2 aggregation
    switches under a core (Al-Fares et al. 2008; non-blocking, k^3/4
    endpoints at most).

    Every switch-to-switch link is optical (two transceivers); the endpoint
    links too when `endpoint_optics`.
    """
    down = (k * oversub) // (oversub + 1)
    up = k - down
    two_max = k * down
    if n <= two_max:
        leaves = math.ceil(n / down)
        spines = math.ceil(leaves * up / k)
        tiers = 2
        aggs = 0
        cores = 0
        pods = 0
        l_up = leaves * up
        l_core = 0
    else:
        pod_leaves = k // 2
        per_pod = pod_leaves * down
        pods = math.ceil(n / per_pod)
        leaves = math.ceil(n / down)
        aggs = pods * (k // 2)
        spines = aggs
        cores = math.ceil(aggs * (k // 2) / k)
        tiers = 3
        l_up = leaves * up
        l_core = aggs * (k // 2)
    switch_links = l_up + l_core
    switches = leaves + spines + cores
    transceivers = 2 * switch_links + (2 * n if endpoint_optics else 0)
    return {
        "n": n,
        "k": k,
        "oversub": oversub,
        "tiers": tiers,
        "down": down,
        "up": up,
        "leaves": leaves,
        "spines": spines,
        "cores": cores,
        "pods": pods,
        "switches": switches,
        "endpoint_links": n,
        "switch_links": switch_links,
        "leaf_links": l_up,
        "core_links": l_core,
        "transceivers": transceivers,
        "per_gpu_transceivers": transceivers / n,
        "two_tier_max": two_max,
        "three_tier_max": k * k * k // 4 if oversub == 1 else None,
        "hops_worst": 2 * tiers,
    }


def optics_power(tree: dict[str, Any], w_per_transceiver: float) -> dict[str, Any]:
    """Pluggable-optics power at an illustrative watts-per-transceiver."""
    total = tree["transceivers"] * w_per_transceiver
    return {"w": w_per_transceiver, "total_w": total, "per_gpu_w": total / tree["n"]}


def tree_steps(n: int, k: int, oversub: int = 1) -> list[dict[str, Any]]:
    """
    The fat-tree animation: the fabric is built tier by tier, then a packet is
    routed within a leaf and across the top. Each step carries the running
    counts of switches, links and transceivers.
    """
    t = fat_tree(n, k, oversub)
    out = []
    acc = {"switches": 0, "links": 0, "transceivers": 0}

    def push(key: str, label: str, sw: int, links: int) -> None:
        acc["switches"] += sw
        acc["links"] += links
        acc["transceivers"] += 2 * links
        out.append({"i": len(out), "key": key, "label": label, "switches": acc["switches"], "links": acc["links"],
                    "transceivers": acc["transceivers"], "add_switches": sw, "add_links": links})

    push("gpus", f"{n} GPU network ports", 0, 0)
    push("leaves", f"{t['leaves']} leaf switches, {t['down']} ports down each", t["leaves"], t["endpoint_links"])
    push("spines", f"{t['spines']} {'spine' if t['tiers'] == 2 else 'aggregation'} switches, {t['up']} links up from each leaf",
         t["spines"], t["leaf_links"])
    if t["tiers"] == 3:
        push("cores", f"{t['cores']} core switches over {t['pods']} pods", t["cores"], t["core_links"])
    push("route-local", "same leaf: GPU, leaf, GPU (2 links)", 0, 0)
    push("route-far", f"different leaves: up to the top and back ({2 * t['tiers']} links)", 0, 0)
    return out


def rail_aligned(sus: int) -> dict[str, Any]:
    """
    The DGX SuperPOD (GB200) compute fabric's design rules (superpod-network):
    per SU, one leaf per rack per rail (8 racks x 4 rails), 6 spines per
    rail group; each leaf has as many links up as compute trays down
    (non-blocking); the spines' up-links all go to radix-64 core switches.
    """
    r = SUPERPOD_RULES
    trays = SYSTEMS["gb200-nvl72"]["fields"]["compute_trays"]["v"]
    racks = r["systems_per_su"]["v"]
    rails = r["rails"]["v"]
    spg = r["spines_per_slg"]["v"]
    k = r["radix"]["v"]
    leaves = sus * racks * rails
    spines = sus * rails * spg
    leaf_down = trays
    leaf_up = trays
    spine_down = r["leaves_per_slg"]["v"] * leaf_up // spg
    spine_up = spine_down
    cores = math.ceil(spines * spine_up / k) if sus > 1 else 0
    return {
        "sus": sus,
        "gpus": sus * racks * SYSTEMS["gb200-nvl72"]["fields"]["gpus"]["v"],
        "leaves": leaves,
        "spines": spines,
        "cores": cores,
        "leaf_down": leaf_down,
        "leaf_up": leaf_up,
        "spine_down": spine_down,
        "spine_up": spine_up,
        "leaf_ports_used": leaf_down + leaf_up,
        "spine_ports_used": spine_down + spine_up,
    }


# ---------------------------------------------------------------------------
# Records for chapters 6-11
# ---------------------------------------------------------------------------


def facility(fid: str) -> dict[str, Any]:
    """Flat dict of a facility record's values (power, cooling)."""
    r = FACILITY[fid]
    out: dict[str, Any] = {"id": r["id"], "name": r["name"], "avail": r["avail"]["v"]}
    for k, f in r["fields"].items():
        out[k] = f["v"]
    return out


def other(oid: str) -> dict[str, Any]:
    """Flat dict of another vendor's design (chapter 10)."""
    r = OTHERS[oid]
    out: dict[str, Any] = {"id": r["id"], "name": r["name"], "avail": r["avail"]["v"]}
    for k, f in r["fields"].items():
        out[k] = f["v"]
    return out


# ---------------------------------------------------------------------------
# Chapter 6: power
# ---------------------------------------------------------------------------


def power_chain(sid: str = "gb200-nvl72") -> dict[str, Any]:
    """The rack's power shelves against its load: installed supply, what survives N+N, the bus current."""
    s = system(sid)
    psus = s["power_shelves"] * s["psus_per_shelf"]
    installed = psus * s["psu_w"]
    usable = installed / 2  # N+N: either half of the supplies carries the rack
    return {
        "shelves": s["power_shelves"],
        "psus": psus,
        "installed_w": installed,
        "usable_w": usable,
        "input_w": s["power_shelves"] * s["shelf_input_w"],
        "rack_w": s["rack_power_w"],
        "margin": usable / s["rack_power_w"],
        "per_gpu_w": s["rack_power_w"] / s["gpus"],
        "dc_v": s["dc_volts"],
        "busbar_a": s["rack_power_w"] / s["dc_volts"],
    }


def busbar(p_w: float, volts: float) -> dict[str, Any]:
    """
    Current on a DC bus, the resistive loss in the same conductor relative to 54 V (I^2 R, so the square of the
    voltage ratio), and the copper a bus needs if it is sized for the same current density as NVIDIA's 1 MW,
    54 V example (derived: copper in proportion to current).
    """
    p = facility("power")
    amps = p_w / volts
    r = p["busbar_v"] / volts
    ref_amps = p["mw_rack_w"] / p["busbar_v"]
    return {"p_w": p_w, "volts": volts, "amps": amps, "loss_rel": r * r, "copper_kg": p["copper_1mw_kg"] * amps / ref_amps}


BUSBAR_CASES = ((120e3, 50.0), (120e3, 54.0), (120e3, 800.0), (1e6, 54.0), (1e6, 800.0))

SMOOTH_LOW = 0.5  # illustrative: the low phase of a training step draws half the high phase's power


def smoothing(p_hi: float, p_lo: float, t_hi: float, t_lo: float, e_store: float) -> dict[str, Any]:
    """
    A rack whose load alternates between p_hi for t_hi seconds and p_lo for t_lo seconds, with e_store joules of
    storage in its power shelves. The store holds the grid's draw at a flat level through the high phase for as
    long as it lasts, and is refilled in the low phase. Best flat level: the average, or p_hi less what the store
    can supply over t_hi, whichever is higher.
    """
    period = t_hi + t_lo
    p_avg = (p_hi * t_hi + p_lo * t_lo) / period
    level = max(p_avg, p_hi - e_store / t_hi)
    used = (p_hi - level) * t_hi
    low = p_lo + used / t_lo
    return {
        "p_hi": p_hi,
        "p_lo": p_lo,
        "t_hi": t_hi,
        "t_lo": t_lo,
        "e_store": e_store,
        "p_avg": p_avg,
        "grid_hi": level,
        "grid_lo": low,
        "used_j": used,
        "peak_cut": (p_hi - level) / p_hi,
        "swing": level - low,
        "raw_swing": p_hi - p_lo,
        "store_use": used / e_store if e_store > 0 else 0.0,
    }


def rack_smoothing(half_period: float, j_per_gpu: float, sid: str = "gb200-nvl72") -> dict[str, Any]:
    """smoothing() for one rack: its stated power as the high phase, SMOOTH_LOW of it as the low phase."""
    s = system(sid)
    p_hi = s["rack_power_w"]
    return smoothing(p_hi, SMOOTH_LOW * p_hi, half_period, half_period, j_per_gpu * s["gpus"])


def smoothing_steps(sm: dict[str, Any], periods: int = 2, per_phase: int = 6) -> list[dict[str, Any]]:
    """The load, the grid's draw and the stored energy through `periods` steps, `per_phase` frames a phase."""
    stored = sm["e_store"]
    t = 0.0
    out = [{"i": 0, "t": t, "phase": "high", "load": sm["p_hi"], "grid": sm["grid_hi"], "stored": stored}]
    i = 0
    for _ in range(periods):
        for phase in ("high", "low"):
            dt = (sm["t_hi"] if phase == "high" else sm["t_lo"]) / per_phase
            for _k in range(per_phase):
                i += 1
                t = t + dt
                if phase == "high":
                    stored = stored - (sm["p_hi"] - sm["grid_hi"]) * dt
                    out.append({"i": i, "t": t, "phase": phase, "load": sm["p_hi"], "grid": sm["grid_hi"], "stored": stored})
                else:
                    stored = stored + (sm["grid_lo"] - sm["p_lo"]) * dt
                    out.append({"i": i, "t": t, "phase": phase, "load": sm["p_lo"], "grid": sm["grid_lo"], "stored": stored})
    return out


# ---------------------------------------------------------------------------
# Chapter 7: cooling
# ---------------------------------------------------------------------------

CFM_PER_M3S = 60 / (0.3048 * 0.3048 * 0.3048)  # cubic feet per minute in one cubic metre per second (exact foot)


def water_cp() -> float:
    """Specific heat of liquid water at 298.15 K, J/(kg K): NIST's Shomate equation, per mole, over molar mass."""
    c = PHYS["shomate"]
    t = c["T"] / 1000
    cp_mol = c["A"] + c["B"] * t + c["C"] * t * t + c["D"] * t * t * t + c["E"] / (t * t)
    return cp_mol / c["molar_mass_g"] * 1000


def air_cp() -> float:
    """Specific heat of air at constant pressure, J/(kg K): gamma R / (gamma - 1)."""
    f = PHYS["fields"]
    g = f["air_gamma"]["v"]
    return g * f["air_r"]["v"] / (g - 1)


def heat_flow(q_w: float, dt_liquid: float, dt_air: float) -> dict[str, Any]:
    """What carries q_w of heat: water warming by dt_liquid, or air warming by dt_air (Q = m cp dT)."""
    f = PHYS["fields"]
    cw = water_cp()
    ca = air_cp()
    kg_s = q_w / (cw * dt_liquid)
    l_s = kg_s / f["water_kg_per_l"]["v"]
    air_m3s = q_w / (f["air_density"]["v"] * ca * dt_air)
    return {
        "q_w": q_w,
        "water_kg_s": kg_s,
        "water_l_min": l_s * 60,
        "air_m3_s": air_m3s,
        "air_cfm": air_m3s * CFM_PER_M3S,
        "vol_ratio": air_m3s / (l_s / 1000),
    }


def cooling_loop(q_w: float, liquid_frac: float, t_fac: float, dt: float, sid: str = "gb200-nvl72") -> dict[str, Any]:
    """
    The rack's liquid loop: the CDU's exchanger delivers coolant `approach` kelvin above the facility water, the
    cold plates warm it by dt, and the flow is whatever carries the liquid-cooled share of the heat.
    """
    s = system(sid)
    c = facility("cooling")
    q_liq = q_w * liquid_frac
    t_sup = t_fac + c["cdu_approach_k"]
    t_ret = t_sup + dt
    kg_s = q_liq / (water_cp() * dt)
    return {
        "q_w": q_w,
        "q_liquid": q_liq,
        "q_air": q_w - q_liq,
        "t_fac": t_fac,
        "t_fac_ret": t_fac + dt,
        "t_sup": t_sup,
        "t_ret": t_ret,
        "kg_s": kg_s,
        "l_min": kg_s / PHYS["fields"]["water_kg_per_l"]["v"] * 60,
        "per_tray_kg_s": kg_s / s["compute_trays"],
        "racks_per_cdu": math.floor(c["cdu_w"] / q_liq),
    }


LOOP_STEPS = 24  # frames round the loop
LOOP_PARCELS = 8  # coolant parcels drawn, evenly spaced
SEGMENTS = ("supply", "cold plates", "return", "CDU")


def loop_temp(loop: dict[str, Any], k: int) -> float:
    """Coolant temperature at position k of LOOP_STEPS: flat in the manifolds, linear across plates and exchanger."""
    seg = k // (LOOP_STEPS // 4)
    x = (k % (LOOP_STEPS // 4)) / (LOOP_STEPS // 4)
    if seg == 0:
        return loop["t_sup"]
    if seg == 1:
        return loop["t_sup"] + (loop["t_ret"] - loop["t_sup"]) * x
    if seg == 2:
        return loop["t_ret"]
    return loop["t_ret"] - (loop["t_ret"] - loop["t_sup"]) * x


def loop_steps(loop: dict[str, Any]) -> list[dict[str, Any]]:
    """Each frame: every parcel's position round the loop, its segment and its temperature."""
    gap = LOOP_STEPS // LOOP_PARCELS
    out = []
    for i in range(LOOP_STEPS):
        parcels = []
        for j in range(LOOP_PARCELS):
            k = (i + j * gap) % LOOP_STEPS
            parcels.append({"k": k, "seg": SEGMENTS[k // (LOOP_STEPS // 4)], "temp": loop_temp(loop, k)})
        out.append({"i": i, "parcels": parcels})
    return out


# ---------------------------------------------------------------------------
# Chapter 9: training clusters
# ---------------------------------------------------------------------------

# Llama 3 405B pre-training (arXiv 2407.21783): the published layout and reliability record.
LLAMA3_RUN: dict[str, dict[str, Any]] = {
    "gpus": _f(16384, "spec", "llama3", "Table 4: 16,384 GPUs, TP 8, CP 1, PP 16, DP 128 (H100, eight per server)"),
    "tp": _f(8, "spec", "llama3", "Table 4"),
    "pp": _f(16, "spec", "llama3", "Table 4"),
    "dp": _f(128, "spec", "llama3", "Table 4"),
    "days": _f(54, "spec", "llama3", "section 3.3.4: 'a 54-day snapshot period of pre-training'"),
    "unexpected": _f(419, "spec", "llama3", "section 3.3.4: '419 were unexpected interruptions' (of 466)"),
    "server_gpus": _f(8, "spec", "llama3", "'Each server is equipped with eight GPUs ... connected via NVLink'"),
}


def failure_rate() -> float:
    """Unexpected interruptions per GPU-hour in the Llama 3 run (all causes, as one rate)."""
    r = LLAMA3_RUN
    return r["unexpected"]["v"] / (r["gpus"]["v"] * r["days"]["v"] * 24)


def checkpoint(n_gpus: int, save_s: float) -> dict[str, Any]:
    """
    Young (1974): with a mean time between failures M and a checkpoint that takes save_s, the interval that
    minimises lost time is about sqrt(2 save_s M); the fraction lost is about save_s / tau + tau / (2 M).
    """
    lam = failure_rate() / 3600
    mtbf = 1 / (lam * n_gpus)
    tau = math.sqrt(2 * save_s * mtbf)
    return {
        "gpus": n_gpus,
        "save_s": save_s,
        "mtbf_s": mtbf,
        "per_day": 86400 / mtbf,
        "tau_s": tau,
        "waste": save_s / tau + tau / (2 * mtbf),
    }


def layout_rank(d: int, p: int, t: int, pp: int, tp: int) -> int:
    """A GPU's rank: tensor-parallel innermost, then pipeline stage, then data-parallel replica (Llama 3's order)."""
    return (d * pp + p) * tp + t


def training_layout(tp: int, pp: int, dp: int, domain: int = 72) -> dict[str, Any]:
    """Where each kind of parallel traffic runs when ranks fill NVLink domains of `domain` GPUs in order."""
    n = tp * pp * dp
    tp_in = 0
    for d in range(dp):
        for p in range(pp):
            racks = {layout_rank(d, p, t, pp, tp) // domain for t in range(tp)}
            tp_in += 1 if len(racks) == 1 else 0
    pp_net = 0
    for d in range(dp):
        for p in range(pp - 1):
            cross = any(layout_rank(d, p, t, pp, tp) // domain != layout_rank(d, p + 1, t, pp, tp) // domain for t in range(tp))
            pp_net += 1 if cross else 0
    dp_net = 0
    for p in range(pp):
        for t in range(tp):
            racks = {layout_rank(d, p, t, pp, tp) // domain for d in range(dp)}
            dp_net += 1 if len(racks) > 1 else 0
    return {
        "tp": tp,
        "pp": pp,
        "dp": dp,
        "gpus": n,
        "domain": domain,
        "domains": (n + domain - 1) // domain,
        "tp_groups": dp * pp,
        "tp_inside": tp_in,
        "pp_hops": dp * (pp - 1),
        "pp_net": pp_net,
        "dp_groups": pp * tp,
        "dp_net": dp_net,
    }


def layout_steps(tp: int, pp: int, dp: int, domain: int = 72) -> list[dict[str, Any]]:
    """One frame per tensor-parallel group placed (replica by replica, stage by stage)."""
    out = []
    i = 0
    for d in range(dp):
        for p in range(pp):
            ranks = [layout_rank(d, p, t, pp, tp) for t in range(tp)]
            if p == 0:
                link = None
            else:
                prev = [layout_rank(d, p - 1, t, pp, tp) for t in range(tp)]
                link = "net" if any(a // domain != b // domain for a, b in zip(prev, ranks)) else "nvlink"
            out.append({"i": i, "d": d, "p": p, "first": ranks[0], "last": ranks[-1],
                        "domain": ranks[0] // domain, "split": ranks[0] // domain != ranks[-1] // domain, "link": link})
            i += 1
    return out


# ---------------------------------------------------------------------------
# Chapter 10: other designs (a torus against a switch)
# ---------------------------------------------------------------------------


def torus(k: int, n: int = 3) -> dict[str, Any]:
    """A k-ary n-cube with wrap-around links (k even): size, hops and the links a bisection cuts."""
    nodes = k**n
    ring_sum = (k * k) // 4  # sum of the distances from one node of a k-ring to all of its nodes
    total = n * k ** (n - 1) * ring_sum
    return {
        "k": k,
        "n": n,
        "nodes": nodes,
        "links_per_node": 2 * n,
        "mean_hops": total / (nodes - 1),
        "diameter": n * (k // 2),
        "bisection_links": 2 * k ** (n - 1),
    }


def torus_shells(k: int, n: int = 3) -> list[int]:
    """How many nodes lie at each hop distance from one node (dimension-order routing, wrap-around)."""
    counts = [0] * (n * (k // 2) + 1)
    for idx in range(k**n):
        d = 0
        x = idx
        for _ in range(n):
            c = x % k
            d += min(c, k - c)
            x //= k
        counts[d] += 1
    return counts


def torus_steps(k: int, n: int = 3) -> list[dict[str, Any]]:
    """Frame d: the nodes first reached at hop d, and how many have been reached so far."""
    shells = torus_shells(k, n)
    out = []
    reached = 0
    for d, c in enumerate(shells):
        reached += c
        out.append({"d": d, "new": c, "reached": reached})
    return out


def a2a_torus(k: int, n: int, size: float, link_dir: float) -> float:
    """All-to-all lower bound on a torus: each half sends N size / 4 bytes across the bisection, each way."""
    t = torus(k, n)
    return t["nodes"] * size / (4 * t["bisection_links"] * link_dir)


def tpu_compare(size: float) -> dict[str, Any]:
    """A TPU v5p cube (4x4x4 torus) against a GB200 NVL72 rack (one switch hop), all-to-all of `size` per chip."""
    o = other("tpu-v5p")
    t = torus(4, 3)
    link_dir = o["scaleup_bidir"] / t["links_per_node"] / 2  # derived: the chip's ICI split equally over six links
    nvl = per_dir(gpu("b200")["nvlink_bidir"])
    return {
        "size": size,
        "cube": t["nodes"],
        "link_dir": link_dir,
        "chip_dir": per_dir(o["scaleup_bidir"]),
        "t_torus": a2a_torus(4, 3, size, link_dir),
        "t_nvl72": alltoall_time(72, size, nvl),
        "nvl_dir": nvl,
    }


def scaleup_per_chip(oid: str) -> float | None:
    """A design's stated scale-up bandwidth per chip (both directions); total over chips where only a total is stated."""
    o = other(oid)
    if o.get("scaleup_bidir") is not None:
        return o["scaleup_bidir"]
    if o.get("scaleup_total") is not None:
        return o["scaleup_total"] / o["chips"]
    return None


# ---------------------------------------------------------------------------
# Chapter 11: cost (every price illustrative)
# ---------------------------------------------------------------------------

COST_ILLUSTRATIVE: dict[str, dict[str, Any]] = {
    "capex_rack_usd": _f(3.5e6, "illustrative", "", "a round number for one 72-GPU rack with its share of network and facility; not a price"),
    "years": _f(4, "illustrative", "", "straight-line write-off period"),
    "pue": _f(1.2, "illustrative", "", "facility power over IT power (cooling and conversion overhead)"),
    "usd_per_kwh": _f(0.10, "illustrative", "", "electricity price"),
    "utilisation": _f(0.7, "illustrative", "", "fraction of the year the rack serves at the simulated load"),
}
HOURS_PER_YEAR = 8766  # 365.25 days


def tco(capex: float, years: int, rack_w: float, pue: float, usd_per_kwh: float, tok_s: float, util: float) -> dict[str, Any]:
    """Cost per million output tokens: capex written off over `years` plus energy at the rack's power, all year."""
    energy_kwh = rack_w / 1000 * pue * HOURS_PER_YEAR
    energy_usd = energy_kwh * usd_per_kwh
    capex_yr = capex / years
    tokens_yr = tok_s * util * HOURS_PER_YEAR * 3600
    total = capex_yr + energy_usd
    return {
        "capex_yr": capex_yr,
        "energy_usd_yr": energy_usd,
        "energy_kwh_yr": energy_kwh,
        "tokens_yr": tokens_yr,
        "usd_per_mtok": total / tokens_yr * 1e6,
        "capex_share": capex_yr / total,
        "tok_s_per_mw": tok_s * util / (rack_w * pue / 1e6),
    }


def tco_steps(capex: float, years: int, rack_w: float, pue: float, usd_per_kwh: float, tok_s: float, util: float) -> list[dict[str, Any]]:
    """Quarter by quarter: what has been written off, spent on energy and served so far."""
    c = tco(capex, years, rack_w, pue, usd_per_kwh, tok_s, util)
    out = []
    for q in range(years * 4 + 1):
        f = q / 4
        cap = c["capex_yr"] * f
        en = c["energy_usd_yr"] * f
        tok = c["tokens_yr"] * f
        out.append({"q": q, "capex": cap, "energy": en, "tokens": tok, "usd_per_mtok": (cap + en) / tok * 1e6 if q > 0 else None})
    return out


# ---------------------------------------------------------------------------
# Validation band: the model against published figures
# ---------------------------------------------------------------------------


def validation() -> list[dict[str, Any]]:
    """Each row: what is compared, the model's value, the published value."""
    s = system("gb200-nvl72")
    d = nvlink_domain("gb200-nvl72")
    rows = [
        {"id": "nvl72-nvlink-total", "what": "GB200 NVL72 total NVLink bandwidth (B/s)", "model": d["total_bidir"],
         "published": s["nvlink_total"], "src": "gb200-page"},
        {"id": "nvl72-links-ports", "what": "NVLink links from 72 GPUs = switch ports in 18 chips", "model": d["links"],
         "published": d["ports"], "src": "dgx-gb200-guide"},
        {"id": "nvl72-tray-bits", "what": "NVLink switch tray, full-duplex (bit/s per direction)", "model": d["tray_bits_dir"],
         "published": s["tray_tbps_dir"], "src": "dgx-gb200-guide"},
        {"id": "nvl72-hbm-bw", "what": "GB200 NVL72 total HBM bandwidth (B/s)", "model": s["gpus"] * gpu("b200")["hbm_bw"],
         "published": s["hbm_bw_total"], "src": "gb200-page"},
        {"id": "nvl72-hbm", "what": "GB200 NVL72 total HBM (B)", "model": s["gpus"] * gpu("b200")["hbm_bytes"],
         "published": s["hbm_total"], "src": "gb200-page"},
        {"id": "vr-hbm-bw", "what": "Vera Rubin NVL72 total HBM bandwidth (B/s)", "model": 72 * gpu("rubin")["hbm_bw"],
         "published": system("vr-nvl72")["hbm_bw_total"], "src": "vr-page"},
        {"id": "vr-nvlink-total", "what": "Vera Rubin NVL72 total NVLink bandwidth (B/s)", "model": 72 * gpu("rubin")["nvlink_bidir"],
         "published": system("vr-nvl72")["nvlink_total"], "src": "vr-page"},
        {"id": "dgx-b200-nvlink", "what": "DGX B200 aggregate NVLink (B/s)", "model": 8 * gpu("b200")["nvlink_bidir"],
         "published": system("dgx-b200")["nvlink_total"], "src": "dgx-b200-page"},
        {"id": "q3450-two-tier", "what": "two-tier non-blocking fat tree of 144-port switches (endpoints)",
         "model": fat_tree(10000, 144)["two_tier_max"], "published": 10000, "src": "photonics-page",
         "note": "published as 'over 10,000 GPUs'"},
    ]
    h, t2, t3 = other("helios"), other("trn2-ultra"), other("trn3-ultra")
    rows += [
        {"id": "helios-hbm", "what": "AMD Helios total HBM (B): 72 x per-GPU", "model": h["chips"] * h["hbm_bytes"],
         "published": h["hbm_total"], "src": "helios-blog"},
        {"id": "helios-hbm-bw", "what": "AMD Helios total HBM bandwidth (B/s): 72 x per-GPU", "model": h["chips"] * h["hbm_bw"],
         "published": h["hbm_bw_total"], "src": "helios-blog"},
        {"id": "trn2-fp8", "what": "Trn2 UltraServer FP8 (FLOP/s): 4 x a 16-chip instance",
         "model": t2["chips"] // t2["instance_chips"] * t2["instance_fp8"], "published": t2["fp8_total"], "src": "trn2-page"},
        {"id": "trn2-hbm-bw", "what": "Trn2 UltraServer HBM bandwidth (B/s): 4 x a 16-chip instance",
         "model": t2["chips"] // t2["instance_chips"] * t2["instance_hbm_bw"], "published": t2["hbm_bw_total"], "src": "trn2-page"},
        {"id": "trn3-hbm", "what": "Trainium3 UltraServer HBM (B): 144 x per-chip", "model": t3["chips"] * t3["hbm_bytes"],
         "published": t3["hbm_total"], "src": "trainium-page"},
        {"id": "trn3-hbm-bw", "what": "Trainium3 UltraServer HBM bandwidth (B/s): 144 x per-chip", "model": t3["chips"] * t3["hbm_bw"],
         "published": t3["hbm_bw_total"], "src": "trainium-page"},
    ]
    for row in SUPERPOD_TABLE3:
        m = rail_aligned(row["sus"])
        for key in ("leaf", "spine", "core"):
            mk = {"leaf": "leaves", "spine": "spines", "core": "cores"}[key]
            rows.append({"id": f"superpod-{row['sus']}su-{key}", "what": f"SuperPOD {row['gpus']} GPUs: {key} switches",
                         "model": m[mk], "published": row[key], "src": "superpod-network"})
    for r in rows:
        r["ratio"] = r["model"] / r["published"]
    return rows
