/**
 * Frame tests on the page (visual standard §4): set key frames of every
 * animation and require the caption on screen to be the caption built from
 * the Python reference's state for that frame (tests/fixtures), and the
 * picture to show that state.
 */
import { expect, test, type Locator } from "@playwright/test";

import fx from "../fixtures/rack_fixtures.json";

import {
  fillCaption,
  ladderCaption,
  pipeCaption,
  ringCaption,
  treeCaption,
} from "@/lib/racks/captions";
import {
  fatTree,
  fit,
  gpu,
  model,
  packageOf,
  paths,
  pipeline,
  type FillStep,
  type PipeStep,
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
