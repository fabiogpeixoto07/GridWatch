import { expect, test } from "@playwright/test";
import type { AddressInfo } from "node:net";
import { createStaticServer } from "./static-server.mjs";

const server = createStaticServer();
let baseUrl: string;

test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("browser renders and navigates both creation tools", async ({ page }) => {
  await page.goto(baseUrl, { waitUntil: "load" });

  await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
  expect(await page.locator("body").innerText()).not.toMatch(/\u00c3.|\u00e2\u20ac|\u00c2\u00b7/);
  await expect(page.locator(".mode-options button")).toHaveCount(3);
  await page.evaluate(() => {
    window.__gridwatchButtonTextMutations = 0;
    const root = document.querySelector(".menu-shell");
    if (!root) throw new Error("Menu shell was not rendered");
    new MutationObserver((records) => {
      window.__gridwatchButtonTextMutations += records.filter(
        (record) => record.type === "characterData" && record.target.parentElement?.closest("button"),
      ).length;
    }).observe(root, { subtree: true, characterData: true });
  });
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__gridwatchButtonTextMutations)).toBe(0);

  await page.getByRole("button", { name: /Championship/ }).click();
  await expect(page.locator('.championship-playback-control button[aria-checked="true"]')).toContainText("MANUAL");
  await page.locator(".championship-playback-control button").filter({ hasText: "AUTO BROADCAST" }).click();
  await page.locator('select:has(option[value="mini-formula"])').selectOption("mini-formula");
  await expect(page.getByRole("button", { name: /START AUTO BROADCAST/ })).toBeVisible();
  await page.getByRole("button", { name: /START AUTO BROADCAST/ }).click();
  await expect(page.locator(".race-shell .auto-broadcast-pill")).toBeVisible();
  await expect(page.locator(".live-status")).toContainText("STARTING");
  await page.locator(".race-actions-trigger").click();
  await page.getByRole("menuitemcheckbox", { name: /PAUSE AUTO ADVANCE/ }).click();
  await expect(page.locator(".auto-broadcast-pill")).toContainText("PAUSED");
  await page.locator("#race-actions-menu .race-menu-exit").click();

  await page.getByRole("button", { name: /Settings/ }).click();
  await page.getByRole("button", { name: /Theme/ }).click();
  await page.locator(".theme-choice-card button").filter({ hasText: "LIGHT" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('.theme-choice-card button[aria-checked="true"]')).toContainText("LIGHT");
  await page.locator(".ghost-action").click();
  await page.getByRole("button", { name: /Circuit Editor/ }).click();
  await expect(page.locator(".track-editor-shell")).toBeVisible();
  await expect(page.locator(".scene-list")).toBeVisible();
  await expect(page.locator(".element-asset-glyph use")).toHaveCount(10);

  await page.locator(".editor-top-actions button").first().click();
  await page.getByRole("button", { name: /Competition Editor/ }).click();
  await expect(page.locator(".competition-editor-shell")).toBeVisible();
  await expect(page.locator(".competition-editor-actions .primary")).toBeDisabled();
  await page.locator(".competition-tabs").getByRole("button", { name: /SPRITES/ }).click();
  await expect(page.locator(".sprite-presets button")).toHaveCount(4);

  await page.locator(".competition-editor-actions button").first().click();
  await page.getByRole("button", { name: /MAIN MENU/ }).click();
  await page.getByRole("button", { name: /Single Race/ }).click();
  await page.locator('select:has(option[value="mini-formula"])').selectOption("mini-formula");
  await page.getByRole("button", { name: /CONFIRM RACE/ }).click();
  await expect(page.locator(".race-shell")).toBeVisible();
  await expect(page.locator(".leaderboard")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.locator(".control-deck")).toHaveCSS("display", "none");
  await expect(page.locator(".race-actions-trigger")).toBeVisible();
  await page.locator(".race-actions-trigger").click();
  await expect(page.locator(".race-actions-trigger")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#race-actions-menu section")).toHaveCount(4);
  await page.getByRole("menuitem", { name: /START RACE/ }).click();
  await expect(page.locator(".primary-controls button").filter({ hasText: "PAUSE" })).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator(".race-shell")).toHaveAttribute("data-physics-engine", "rapier");
  await expect.poll(() => page.evaluate(() => document.querySelector("canvas")?.getAttribute("data-physical-cars"))).toMatch(/[1-9]\d*/);
  await page.locator(".race-actions-trigger").click();
  await page.getByRole("menuitemradio", { name: "2×" }).click();
  await expect(page.locator('#race-actions-menu [aria-checked="true"]')).toHaveText("2×");
  expect(await page.evaluate(() => {
    const list = document.querySelector(".leaderboard-scroll");
    if (!list) return false;
    const rows = [...list.querySelectorAll(".driver-row")];
    for (let index = rows.length; index < 22; index += 1) {
      const source = rows[index % rows.length];
      if (!source) return false;
      list.append(source.cloneNode(true));
    }
    return list.querySelectorAll(".driver-row").length === 22
      && list.scrollHeight <= list.clientHeight
      && getComputedStyle(list).overflowY === "hidden";
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#race-actions-menu")).toHaveCount(0);
  await page.keyboard.press("F3");
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".race-canvas")
      ?? document.querySelector<HTMLCanvasElement>("canvas");
    return (canvas?.toDataURL().length ?? 0) > 1_000;
  })).toBe(true);
});

declare global {
  interface Window {
    __gridwatchButtonTextMutations: number;
  }
}
