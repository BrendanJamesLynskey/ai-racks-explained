/**
 * Frame tests on the page (visual standard §4): set key frames of every
 * animation and require the caption on screen to be the caption built from
 * the Python reference's state for that frame (tests/fixtures), and the
 * picture to show that state.
 */
import { expect, test, type Locator } from "@playwright/test";

import fx from "../fixtures/rack_fixtures.json";
import dfx from "../fixtures/disagg_parity.json";

import {
  disaggCaption,
  fillCaption,
  ladderCaption,
  layoutCaption,
  loopCaption,
  pipeCaption,
  ringCaption,
  smoothCaption,
  tcoCaption,
  torusCaption,
  treeCaption,
} from "@/lib/racks/captions";
import type { Counts } from "@/lib/racks/disagg";
import {
  fatTree,
  fit,
  gpu,
  model,
  packageOf,
  paths,
  pipeline,
  type CoolingLoop,
  type FillStep,
  type Layout,
  type LayoutStep,
  type LoopStep,
  type PipeStep,
  type SmoothStep,
  type Smoothing,
  type TcoStep,
  type TorusStep,
  type Ring,
  type Rung,
  type TreeStep,
} from "@/lib/racks/model";

// No autoplay (reduced motion): the test sets each frame itself.
test.use({ contextOptions: { reducedMotion: "reduce" } });

/**
 * Change a parameter and wait until the animation has restarted for it
 * (its data-key changes in the reset itself), so a following scrub cannot
 * be undone by the reset.
 */
async function change(fig: Locator, act: () => Promise<void>): Promise<void> {
  const before = (await fig.getAttribute("data-key")) ?? "";
  await act();
  await expect(fig).not.toHaveAttribute("data-key", before);
}

async function show(fig: Locator, s: number): Promise<void> {
  // pause first: the animation starts by itself when it scrolls into view
  if ((await fig.getAttribute("data-playing")) === "true")
    await fig.getByTestId("play").click();
  await fig.getByTestId("scrub").fill(String(s));
  await expect(fig).toHaveAttribute("data-step", String(s));
  await expect(fig).toHaveAttribute("data-playing", "false");
}

test("ladder: every rung, then a 2 GB payload", async ({ page }) => {
  await page.goto("/learn/01-chip-to-data-centre");
  const fig = page.getByTestId("ladder-widget");
  const rungs = fx.ladder as Rung[];
  for (const s of [0, 2, 3, 5]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      ladderCaption(rungs[s]!, 6, 1e9),
    );
  }
  await change(fig, () => fig.getByRole("radio", { name: "2 GB" }).click());
  const two = fx.ladderHalls.find(
    (c) => c.payload === 2e9 && c.hall_w === 100e6,
  )!.out as Rung[];
  await show(fig, 3);
  await expect(fig.getByTestId("caption")).toHaveText(
    ladderCaption(two[3]!, 6, 2e9),
  );
});

test("package: Llama 3.1 405B in FP8 on Blackwell Ultra, then H100", async ({
  page,
}) => {
  await page.goto("/learn/02-the-package");
  const fig = page.getByTestId("package-widget");
  const cap = (gid: "b300" | "h100", s: FillStep) => {
    const pk = packageOf(gid);
    return fillCaption(
      s,
      pk.stacks as number,
      pk.per_stack_bytes as number,
      fit(gid, "llama3-405b", "fp8"),
      gpu(gid).name,
      model("llama3-405b").name,
    );
  };
  const b300 = fx.fill.find(
    (c) => c.gpu === "b300" && c.model === "llama3-405b" && c.fmt === "fp8",
  )!.out as FillStep[];
  for (const s of [0, 3, 6, 8]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(cap("b300", b300[s]!));
  }
  // eight stacks drawn for Blackwell Ultra, six sites (one unused) for H100
  await expect(fig.locator("[data-stack]")).toHaveCount(8);
  await expect(fig.locator("[data-gpu-slot]")).toHaveCount(2);
  await change(fig, () => fig.getByRole("radio", { name: "H100" }).click());
  const h100 = fx.fill.find(
    (c) => c.gpu === "h100" && c.model === "llama3-405b" && c.fmt === "fp8",
  )!.out as FillStep[];
  await show(fig, 5);
  await expect(fig.getByTestId("caption")).toHaveText(cap("h100", h100[5]!));
  await expect(fig.locator("[data-stack]")).toHaveCount(6);
  await expect(fig.locator("[data-gpu-slot]")).toHaveCount(6);
});

test("paths: Grace to GPU in 8 chunks, then the network in 16", async ({
  page,
}) => {
  await page.goto("/learn/03-trays-and-nodes");
  const fig = page.getByTestId("path-widget");
  await change(fig, () =>
    fig.getByRole("radio", { name: "Grace → GPU" }).click(),
  );
  const g = paths().grace.hops;
  const steps = fx.pipelineSteps.find(
    (c) => c.path === "grace" && c.chunks === 8,
  )!.out as PipeStep[];
  for (const s of [0, 12, 30, 48]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      pipeCaption(g, pipeline(g, 2e9, 8), steps[s]!, 8),
    );
    await expect(fig.locator("[data-hop='0']")).toHaveAttribute(
      "data-busy",
      String(steps[s]!.busy[0]),
    );
  }
  await change(fig, () =>
    fig.getByRole("radio", { name: "network → GPU" }).click(),
  );
  await change(fig, () => fig.getByRole("radio", { name: "16" }).click());
  const r = paths().rdma.hops;
  const rs = fx.pipelineSteps.find((c) => c.path === "rdma" && c.chunks === 16)!
    .out as PipeStep[];
  await show(fig, 24);
  await expect(fig.getByTestId("caption")).toHaveText(
    pipeCaption(r, pipeline(r, 2e9, 16), rs[24]!, 16),
  );
});

test("ring all-reduce: 4 GPUs, then 8", async ({ page }) => {
  await page.goto("/learn/04-scale-up-nvlink");
  const fig = page.getByTestId("ring-widget");
  const r4 = fx.ring.find((c) => c.n === 4 && c.seed === 7)!.out as Ring;
  for (const s of [0, 1, 3, 6]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(ringCaption(r4, s));
  }
  // at the end every GPU's cells hold the full sum
  for (let gi = 0; gi < 4; gi++)
    await expect(
      fig.locator(`[data-gpu='${gi}'] [data-count='4']`),
    ).toHaveCount(4);
  await change(fig, () => fig.getByRole("radio", { name: "8" }).click());
  const r8 = fx.ring.find((c) => c.n === 8 && c.seed === 7)!.out as Ring;
  await show(fig, 7);
  await expect(fig.getByTestId("caption")).toHaveText(ringCaption(r8, 7));
});

test("fabric: 9,216 GPUs on 64-port switches, then 144-port", async ({
  page,
}) => {
  await page.goto("/learn/05-scale-out-network");
  const fig = page.getByTestId("fabric-widget");
  const t = fatTree(9216, 64, 1);
  const st = fx.treeSteps.find(
    (c) => c.n === 9216 && c.k === 64 && c.oversub === 1,
  )!.out as TreeStep[];
  for (const s of [0, 1, 3, 5]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      treeCaption(t, st[s]!, st.length),
    );
  }
  await expect(fig.locator("[data-row='cores']")).toHaveAttribute(
    "data-count",
    "144",
  );
  await expect(fig.locator("[data-route='far']")).toHaveCount(1);
  await change(fig, () => fig.getByRole("radio", { name: "144-port" }).click());
  const t2 = fatTree(9216, 144, 1);
  const st2 = fx.treeSteps.find(
    (c) => c.n === 9216 && c.k === 144 && c.oversub === 1,
  )!.out as TreeStep[];
  await show(fig, st2.length - 1);
  await expect(fig.getByTestId("caption")).toHaveText(
    treeCaption(t2, st2[st2.length - 1]!, st2.length),
  );
  await expect(fig.locator("[data-row='cores']")).toHaveCount(0);
});

test("power smoothing: 0.25 s swings with 65 J a GPU, then none", async ({
  page,
}) => {
  await page.goto("/learn/06-power");
  const fig = page.getByTestId("power-widget");
  const c = fx.smoothing.find((x) => x.half === 0.25 && x.j === 65)!;
  const steps = c.steps as SmoothStep[];
  for (const s of [0, 3, 8, 24]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      smoothCaption(c.out as Smoothing, steps[s]!, steps.length),
    );
  }
  await change(fig, () => fig.getByRole("radio", { name: "none" }).click());
  const n = fx.smoothing.find((x) => x.half === 0.25 && x.j === 0)!;
  await show(fig, 9);
  await expect(fig.getByTestId("caption")).toHaveText(
    smoothCaption(n.out as Smoothing, (n.steps as SmoothStep[])[9]!, 25),
  );
});

test("cooling loop: 120 kW with 30 °C water, then 1 MW with 40 °C", async ({
  page,
}) => {
  await page.goto("/learn/07-cooling");
  const fig = page.getByTestId("cooling-widget");
  const loop = (q: number, t: number, d: number) =>
    fx.coolingLoop.find(
      (x) => x.q === q && x.frac === 0.9 && x.tfac === t && x.dt === d,
    )!.out as CoolingLoop;
  const steps = (q: number, t: number, d: number) =>
    fx.loopSteps.find((x) => x.q === q && x.tfac === t && x.dt === d)!
      .out as LoopStep[];
  const a = steps(120e3, 30, 10);
  for (const s of [0, 7, 13, 22]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      loopCaption(loop(120e3, 30, 10), a[s]!, 24),
    );
    await expect(fig.locator("[data-parcel='0']")).toHaveAttribute(
      "data-seg",
      a[s]!.parcels[0]!.seg,
    );
  }
  await change(fig, () => fig.getByRole("radio", { name: "1 MW" }).click());
  await change(fig, () => fig.getByRole("radio", { name: "40 °C" }).click());
  await change(fig, () =>
    fig.getByRole("radio", { name: "5 K", exact: true }).click(),
  );
  await show(fig, 10);
  await expect(fig.getByTestId("caption")).toHaveText(
    loopCaption(loop(1e6, 40, 5), steps(1e6, 40, 5)[10]!, 24),
  );
});

test("disaggregated inference: the recorded stage counts on the page", async ({
  page,
}) => {
  await page.goto("/learn/08-disaggregated-inference");
  const fig = page.getByTestId("disagg-widget");
  const sim = fig.locator("[data-sim]");
  const check = async (key: string) => {
    await expect(sim).toHaveAttribute("data-sim", "ready", { timeout: 30000 });
    const c = dfx.cases.find((x) => x.key === key)!;
    const n = Number(await fig.getByTestId("scrub").getAttribute("max")) + 1;
    for (const f of c.frames) {
      await show(fig, f.frame);
      await expect(fig.getByTestId("caption")).toHaveText(
        disaggCaption(f.frame, n, f.t, f.counts as Counts, 1500),
      );
    }
  };
  await check("12-6.nvlink.b200");
  await change(fig, () => fig.getByRole("radio", { name: "100GbE" }).click());
  await check("12-6.eth100.b200");
  await change(fig, () => fig.getByRole("radio", { name: "NVLink" }).click());
  await change(fig, () => fig.getByRole("radio", { name: "decode" }).click());
  await check("12-6.nvlink.ctx-decode");
  await expect(fig.locator("[data-instance='decode']")).toHaveCount(6);
});

test("training layout: 8 x 4 x 4 on NVL72 racks, then on 8-GPU servers", async ({
  page,
}) => {
  await page.goto("/learn/09-training-clusters");
  const fig = page.getByTestId("training-widget");
  const find = (dom: number) => {
    const l = fx.layout.find(
      (x) => x.tp === 8 && x.pp === 4 && x.dp === 4 && x.domain === dom,
    )!.out as Layout;
    const st = fx.layoutSteps.find(
      (x) => x.tp === 8 && x.pp === 4 && x.dp === 4 && x.domain === dom,
    )!.out as LayoutStep[];
    return { l, st };
  };
  const a = find(72);
  for (const s of [0, 5, 15]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      layoutCaption(a.l, a.st[s]!, a.st.length),
    );
  }
  await change(fig, () =>
    fig.getByRole("radio", { name: "8-GPU server" }).click(),
  );
  const b = find(8);
  await show(fig, 6);
  await expect(fig.getByTestId("caption")).toHaveText(
    layoutCaption(b.l, b.st[6]!, b.st.length),
  );
  await expect(fig.locator("[data-link='net']")).toHaveCount(1);
});

test("torus: hop shells of a 4x4x4 cube, then 8x8x8", async ({ page }) => {
  await page.goto("/learn/10-other-designs");
  const fig = page.getByTestId("torus-widget");
  const k4 = fx.torus.find((x) => x.k === 4)!;
  for (const s of [0, 2, 6]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      torusCaption((k4.steps as TorusStep[])[s]!, 64, 6),
    );
  }
  await expect(fig.locator("[data-hops='6']")).toHaveCount(1);
  await change(fig, () => fig.getByRole("radio", { name: "8×8×8" }).click());
  const k8 = fx.torus.find((x) => x.k === 8)!;
  await show(fig, 5);
  await expect(fig.getByTestId("caption")).toHaveText(
    torusCaption((k8.steps as TorusStep[])[5]!, 512, 12),
  );
});

test("cost: quarter by quarter at $3.5M, then $2M", async ({ page }) => {
  await page.goto("/learn/11-cost");
  const fig = page.getByTestId("cost-widget");
  const steps = (capex: number) =>
    fx.tcoSteps.find((x) => x.capex === capex)!.out as TcoStep[];
  const a = steps(3.5e6);
  for (const s of [0, 4, 16]) {
    await show(fig, s);
    await expect(fig.getByTestId("caption")).toHaveText(
      tcoCaption(a[s]!, a.length),
    );
  }
  await change(fig, () => fig.getByRole("radio", { name: "$2M" }).click());
  await show(fig, 9);
  await expect(fig.getByTestId("caption")).toHaveText(
    tcoCaption(steps(2e6)[9]!, 17),
  );
});
