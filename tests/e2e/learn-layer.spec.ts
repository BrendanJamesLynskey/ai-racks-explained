/**
 * Brief 44, the learning layer: a self-check waits for a committed answer,
 * then reveals the model's value and says whether the guess was right; a
 * choice and a slider work from the keyboard; with no JavaScript the answer
 * is still one click away (a native <details>); axe finds nothing serious
 * with every answer of a chapter revealed, at 390 px in dark mode.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { numericAnswer } from "@/lib/learn/answer";

async function check(page: Page, id: string) {
  const box = page.locator(`[data-self-check="${id}"]`);
  await expect(box).toBeVisible();
  return box;
}

test("ch 6: the reveal waits for an answer, then shows the model's", async ({
  page,
}) => {
  await page.goto("/learn/06-power");
  await expect(page.locator("[data-check-yourself-link]")).toHaveAttribute(
    "href",
    "#check-yourself",
  );
  const box = await check(page, "r06-q1");
  const summary = box.locator("summary");
  const details = box.locator("details");
  await summary.click();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(box).toContainText("Commit to an answer first");
  const want = numericAnswer("pow.busbar_a", undefined, "int");
  await box.getByRole("spinbutton").fill("100");
  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await expect(box.locator("[data-answer]")).toHaveText(
    `${want.display}${want.unit}`,
  );
  await expect(box.locator("[data-verdict]")).toHaveAttribute(
    "data-verdict",
    "wrong",
  );
  await box.getByRole("spinbutton").fill(String(want.value));
  await expect(box.locator("[data-verdict]")).toHaveAttribute(
    "data-verdict",
    "right",
  );
  const q2 = await check(page, "r06-q2");
  await q2.getByRole("radio").nth(1).check();
  await q2.locator("summary").press("Enter");
  await expect(q2.locator("details")).toHaveAttribute("open", "");
  await expect(q2.locator("[data-verdict]")).toHaveAttribute(
    "data-verdict",
    "right",
  );
});

test("ch 8: the SLO slider, by keyboard; the equation fits at 390 px", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto("/learn/08-disaggregated-inference");
  // the hero's equation is three rows now: it fits its box on a phone
  const eq = page.locator(".eq-panel .katex-display").first();
  const fits = await eq.evaluate((e) => e.scrollWidth <= e.clientWidth);
  expect(fits).toBe(true);
  const box = await check(page, "r08-q1");
  const want = numericAnswer("dis.6-12.nvlink.gb200.slo", undefined, "pct");
  const slider = box.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("Home");
  const steps = Math.round(want.value);
  for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowRight");
  await expect(box.locator("output")).toHaveText(`${steps}%`);
  await box.locator("summary").press("Enter");
  await expect(box.locator("[data-answer]")).toHaveText(`${want.display}%`);
  await expect(box.locator("[data-verdict]")).toHaveAttribute(
    "data-verdict",
    "right",
  );
  await ctx.close();
});

test("axe: nothing serious with every answer revealed (390 px, dark)", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 390, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto("/learn/11-cost");
  for (const id of ["r11-q1", "r11-q2", "r11-q3"]) {
    const box = await check(page, id);
    const slider = box.getByRole("slider");
    if (await slider.count()) {
      await slider.focus();
      await page.keyboard.press("ArrowRight");
    } else if (await box.getByRole("spinbutton").count()) {
      await box.getByRole("spinbutton").fill("4");
    } else {
      await box.getByRole("radio").first().check();
    }
    await box.locator("summary").click();
    await expect(box.locator("details")).toHaveAttribute("open", "");
  }
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .include("#check-yourself")
    .include("[data-remember]")
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  await ctx.close();
});

test("with no JavaScript the question and the answer are in the page", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/learn/01-chip-to-data-centre");
  const box = page.locator('[data-self-check="r01-q2"]');
  await expect(box).toContainText("Where is the big bandwidth cliff");
  await box.locator("summary").click();
  await expect(box.locator("[data-answer]")).toContainText(
    "At the rack boundary",
  );
  await expect(page.locator("[data-remember]")).toContainText(
    "What to remember",
  );
  await ctx.close();
});
