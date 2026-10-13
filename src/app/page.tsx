import Link from "next/link";

import { LadderBars } from "@/components/viz/LadderBars";
import { SECTIONS } from "@/lib/mdx/sections";
import { formatValue, lookup, type Fmt } from "@/lib/racks/values";
import {
  KERNELS_URL,
  SILICON_URL,
  TRAINING_URL,
  INFERENCE_URL,
} from "@/lib/site";

const LINK =
  "focus-ring rounded underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

/**
 * Landing page: what the site is, the picture behind every chapter (the
 * bandwidth ladder), and the ways in. Server Component with no client
 * JavaScript of its own.
 */
export default function HomePage(): JSX.Element {
  const v = (path: string, fmt: Fmt) => formatValue(lookup(path), fmt);
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <p className="font-mono text-xs uppercase tracking-widest text-accent dark:text-indigo-300">
        AI Racks Explained
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
        The machines underneath, chip to data centre.
      </h1>
      <div className="mt-8 grid items-center gap-8 md:grid-cols-[1fr_minmax(0,22rem)]">
        <div>
          <p className="max-w-2xl text-lg text-neutral-600 dark:text-neutral-300">
            A large model is trained and served by thousands of GPUs, and the
            way they are packaged, wired, powered and cooled decides what is
            fast. Inside one package a GPU reads its HBM at{" "}
            {v("ladder.package.bw", "rate")}. Inside an NVLink rack it reaches
            any of {v("ladder.rack.gpus", "int")} GPUs at{" "}
            {v("ladder.rack.bw", "rate")} per direction. One rung further out,
            over the network, it has {v("ladder.su.bw", "rate")}: a drop of{" "}
            {v("ladder.su.drop", "num")} times. Most of the design of a training
            or inference cluster is about which traffic crosses which boundary.
          </p>
          <p className="mt-4 max-w-2xl text-neutral-600 dark:text-neutral-300">
            Each chapter is built around an animation whose every frame comes
            from a small model tested against a Python reference. Every hardware
            figure carries its source and the date it was read, products whose
            specifications are preliminary or planned are marked, and the model
            is checked against published figures (
            <Link href="/about#validation" className={LINK}>
              its validation band
            </Link>
            ).
          </p>
        </div>
        <figure className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <LadderBars />
          <figcaption className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            Bandwidth one GPU has at each rung of a GB200 NVL72 cluster, log
            scale. HBM is a read rate; the rest are per direction.
          </figcaption>
        </figure>
      </div>
      <nav
        aria-label="Chapters"
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SECTIONS.map((s, i) => (
          <Link
            key={s.slug}
            href={`/learn/${s.slug}`}
            className="focus-ring group rounded-lg border border-neutral-200 p-5 hover:border-accent dark:border-neutral-800 dark:hover:border-indigo-400"
          >
            <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-1 font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {s.summary}
            </p>
          </Link>
        ))}
      </nav>
      <div className="mt-8 rounded-lg border border-accent/40 p-5 dark:border-indigo-400/40">
        <h2 className="text-sm font-semibold">The centrepiece</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          <Link href="/learn/08-disaggregated-inference" className={LINK}>
            Chapter 8
          </Link>{" "}
          serves {v("dis.meta.n", "int")} requests on one{" "}
          {v("dis.meta.gpus", "int")}-GPU rack with prefill and decode in
          separate pools, running a tested discrete-event simulator in your
          browser: split the rack, change the link the KV cache crosses, or put
          a cheaper context-optimised part in one pool, and watch latency and
          energy per token move.
        </p>
      </div>
      <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">
        Every hardware figure the model uses, with its source and access date:{" "}
        <Link href="/specs" className={LINK}>
          the specifications
        </Link>
        .
      </p>
      <p className="mt-12 text-sm text-neutral-600 dark:text-neutral-400">
        Part of the companion sites&apos; Hardware track, with{" "}
        <a href={KERNELS_URL} className={LINK}>
          GPU Kernels Explained
        </a>{" "}
        (how one GPU executes the maths) and{" "}
        <a href={SILICON_URL} className={LINK}>
          Systolic Arrays Explained
        </a>{" "}
        (inside a matrix engine). What runs on these machines:{" "}
        <a href={`${TRAINING_URL}/training`} className={LINK}>
          Training
        </a>{" "}
        and{" "}
        <a href={INFERENCE_URL} className={LINK}>
          Serving
        </a>
        . How this site was built, and how to check it:{" "}
        <Link href="/about" className={LINK}>
          about
        </Link>
        .
      </p>
    </main>
  );
}
