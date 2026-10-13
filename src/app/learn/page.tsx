/**
 * /learn — index of chapters.
 *
 * Server Component, statically rendered. Same layout as the companion
 * sites' /learn, plus the chapters still to come.
 */
import Link from "next/link";

import { SECTIONS } from "@/lib/mdx/sections";
import { PLANNED } from "@/lib/planned";
import { KERNELS_URL, NVIDIA_GPU_HUB } from "@/lib/site";

export const metadata = {
  title: "Learn",
  description:
    "Chapters on the machines that train and serve large models, from one GPU package to a hall of racks, each built around an animation driven by a tested model.",
};

const A =
  "focus-ring rounded text-accent underline underline-offset-2 dark:text-indigo-300";

export default function LearnIndex(): JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-accent dark:text-indigo-300">
        /learn
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        From one GPU to a hall of racks
      </h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-300">
        One chapter per rung of the machine, each opening with an animation.
        Every frame is computed by this site&apos;s model (checked against its
        Python reference), and every hardware figure links its source. Toggle
        layers (Concept / Maths / Code) inside any chapter to choose how deep to
        go. What happens inside one GPU is on{" "}
        <a href={KERNELS_URL} className={A}>
          GPU Kernels Explained
        </a>
        ; for slides on the same hardware, see the{" "}
        <a href={NVIDIA_GPU_HUB} className={A}>
          NVIDIA GPU
        </a>{" "}
        series.
      </p>

      <ol className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800">
        {SECTIONS.map((s, i) => (
          <li key={s.slug} className="py-5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Link
                href={`/learn/${s.slug}`}
                className="focus-ring rounded text-lg font-medium text-neutral-900 hover:text-accent dark:text-neutral-100"
              >
                {s.title}
              </Link>
            </div>
            <p className="mt-1 pl-9 text-sm text-neutral-600 dark:text-neutral-400">
              {s.summary}
            </p>
          </li>
        ))}
        {PLANNED.map((p, i) => (
          <li key={p} className="py-4" data-planned>
            <div className="flex items-baseline gap-3 text-neutral-500 dark:text-neutral-400">
              <span className="font-mono text-xs">
                {String(SECTIONS.length + i + 1).padStart(2, "0")}
              </span>
              <span>
                {p} <span className="text-xs">(coming)</span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
