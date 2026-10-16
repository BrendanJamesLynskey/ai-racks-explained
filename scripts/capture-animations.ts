/**
 * Records the README's animated GIFs (and WebM videos) of the hero
 * animations. Manual run, output committed; a heavy job, so run it alone:
 *
 *   pnpm build && pnpm start   # in another shell
 *   pnpm animations            # writes docs/media/*.gif and *.webm
 *
 * Every frame is a model state set by the animation's scrub bar (reduced
 * motion, so nothing plays by itself), screenshotted, then joined by
 * ffmpeg: the recordings are reproducible frame for frame. Needs ffmpeg on
 * the PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

const OUT = path.join(process.cwd(), "docs", "media");
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

type Clip = {
  name: string;
  path: string;
  widget: string;
  /** frames per second of the output */
  fps: number;
  /** a radio to press first (a parameter), if any */
  radio?: string;
  /** record every n-th frame only (long animations) */
  stride?: number;
};

const CLIPS: Clip[] = [
  {
    name: "ladder",
    path: "/learn/01-chip-to-data-centre",
    widget: "ladder-widget",
    fps: 2,
  },
  {
    name: "package",
    path: "/learn/02-the-package",
    widget: "package-widget",
    fps: 3,
  },
  {
    name: "paths",
    path: "/learn/03-trays-and-nodes",
    widget: "path-widget",
    fps: 10,
  },
  {
    name: "ring",
    path: "/learn/04-scale-up-nvlink",
    widget: "ring-widget",
    fps: 2,
  },
  {
    name: "latency-term",
    path: "/learn/04-scale-up-nvlink",
    widget: "ab-widget",
    fps: 2,
  },
  {
    name: "fabric",
    path: "/learn/05-scale-out-network",
    widget: "fabric-widget",
    fps: 1,
  },
  { name: "power", path: "/learn/06-power", widget: "power-widget", fps: 4 },
  {
    name: "cooling",
    path: "/learn/07-cooling",
    widget: "cooling-widget",
    fps: 6,
  },
  {
    name: "disagg",
    path: "/learn/08-disaggregated-inference",
    widget: "disagg-widget",
    fps: 10,
    stride: 2,
  },
  {
    name: "training",
    path: "/learn/09-training-clusters",
    widget: "training-widget",
    fps: 2,
  },
  {
    name: "torus",
    path: "/learn/10-other-designs",
    widget: "torus-widget",
    fps: 1,
  },
  { name: "cost", path: "/learn/11-cost", widget: "cost-widget", fps: 3 },
];

/** `ONLY=power,cost pnpm animations` records just those clips. */
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  for (const c of CLIPS.filter((x) => !ONLY.length || ONLY.includes(x.name))) {
    const dir = mkdtempSync(path.join(tmpdir(), `air-${c.name}-`));
    await page.goto(BASE + c.path, { waitUntil: "networkidle" });
    const fig = page.getByTestId(c.widget);
    await fig.waitFor();
    if (c.radio) await fig.getByRole("radio", { name: c.radio }).click();
    // chapter 8 draws once its simulation has run in the worker
    const sim = fig.locator("[data-sim]");
    if (await sim.count())
      await sim.and(page.locator("[data-sim='ready']")).waitFor();
    const scrub = fig.getByTestId("scrub");
    const max = Number(await scrub.getAttribute("max"));
    const visual = fig.getByTestId("visual");
    const stride = c.stride ?? 1;
    let i = 0;
    for (let s = 0; s <= max; s += stride) {
      await scrub.fill(String(s));
      await visual.screenshot({
        path: path.join(dir, `f${String(i++).padStart(4, "0")}.png`),
      });
    }
    const input = path.join(dir, "f%04d.png");
    const gif = path.join(OUT, `${c.name}.gif`);
    const webm = path.join(OUT, `${c.name}.webm`);
    // even dimensions for the video encoder; a shared palette for the GIF
    const scale = "scale=560:-2:flags=lanczos";
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(c.fps),
      "-i",
      input,
      "-vf",
      `${scale},split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none`,
      "-loop",
      "0",
      gif,
    ]);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(c.fps),
      "-i",
      input,
      "-vf",
      scale,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "40",
      "-pix_fmt",
      "yuv420p",
      webm,
    ]);
    rmSync(dir, { recursive: true, force: true });
    console.log(
      `wrote ${path.relative(process.cwd(), gif)} and .webm (${i} frames)`,
    );
  }
  await browser.close();
}

void main();
