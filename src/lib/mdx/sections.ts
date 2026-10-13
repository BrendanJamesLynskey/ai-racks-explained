/**
 * Chapter catalogue + filesystem loader for /learn content.
 *
 * MDX sources live under `/content/chapters/`, one per rung of the machine,
 * each built around an animation. Their slugs and order are defined here (single source
 * of truth); the `[slug]` route validates incoming params against this list
 * before reading from disk. Same shape as the companion sites'
 * `src/lib/mdx/sections.ts`.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SECTIONS = [
  {
    slug: "01-chip-to-data-centre",
    title: "From chip to data centre",
    summary:
      "The ladder from one GPU package to a hall of racks: how many GPUs each rung holds, and how fast one GPU can move data at each.",
  },
  {
    slug: "02-the-package",
    title: "The package",
    summary:
      "Compute dies and HBM stacks on one package: why memory bandwidth and capacity set the shape, and how many GPUs a model's weights need.",
  },
  {
    slug: "03-trays-and-nodes",
    title: "Trays and nodes",
    summary:
      "A compute tray's GPUs, Grace CPUs and network cards, and the paths data takes between them: network, CPU memory, another GPU.",
  },
  {
    slug: "04-scale-up-nvlink",
    title: "Scale-up: NVLink and NVSwitch",
    summary:
      "72 GPUs, 18 switch chips, one link from every GPU to every chip: why an NVL72 rack behaves like one big GPU for all-reduce and all-to-all.",
  },
  {
    slug: "05-scale-out-network",
    title: "Scale-out: the network",
    summary:
      "Leaf, spine and core switches, rail-aligned fabrics, oversubscription, and the transceivers every link needs.",
  },
  {
    slug: "06-power",
    title: "Power",
    summary:
      "Power shelves, busbars and the move to 800 V DC; why a training job's synchronised swings need storage in the rack; tokens per megawatt.",
  },
  {
    slug: "07-cooling",
    title: "Cooling",
    summary:
      "Why air runs out at rack scale: cold plates, the coolant loop, CDUs and facility water, sized with Q = ṁ c_p ΔT.",
  },
  {
    slug: "08-disaggregated-inference",
    title: "Disaggregated inference on a rack",
    summary:
      "Prefill and decode as separate pools in one NVL72-sized rack, the KV hand-off between them, pool sizing and context-optimised parts, run live on a tested simulator.",
  },
  {
    slug: "09-training-clusters",
    title: "Training clusters",
    summary:
      "How a training job's tensor, pipeline and data parallelism land on NVLink domains and the network, and how often a large job is interrupted.",
  },
  {
    slug: "10-other-designs",
    title: "Other designs",
    summary:
      "TPU pods built from torus cubes and optical switches, and other vendors' rack-scale systems: what each changes about the ladder.",
  },
  {
    slug: "11-cost",
    title: "Cost per token",
    summary:
      "Capital, electricity and utilisation turned into cost per million tokens and tokens per megawatt, with every price marked illustrative.",
  },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];

const SLUG_SET = new Set<string>(SECTIONS.map((s) => s.slug));

export function isValidSlug(slug: string): slug is SectionSlug {
  return SLUG_SET.has(slug);
}

export function getSectionMeta(slug: SectionSlug): (typeof SECTIONS)[number] {
  return SECTIONS.find((s) => s.slug === slug) ?? SECTIONS[0];
}

/** Read the raw MDX source for a chapter, or `null` if it doesn't exist. */
export async function readSectionMdx(
  slug: SectionSlug,
): Promise<string | null> {
  const path = join(process.cwd(), "content", "chapters", `${slug}.mdx`);
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}
