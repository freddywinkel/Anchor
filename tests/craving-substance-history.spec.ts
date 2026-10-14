import { expect, test, type Page } from "@playwright/test";
import { applyHistoryFilters } from "./history-filters";
import { readFile } from "node:fs/promises";
import {
  createEmptyState,
  today,
  STORAGE_KEY,
  type CravingRecord,
} from "../src/lib/storage";

const customSubstance = "Kratom <img src=x onerror=alert(1)> & thee";
function fixture() {
  const state = createEmptyState();
  const base: CravingRecord = {
    id: "historic",
    date: today(),
    time: "10:00",
    situation: "Historische situatie in de keuken",
    thought: "Een eerdere gedachte",
    bodySensation: "Onrust in mijn buik",
    emotion: "Onrustig",
    behavior: "Een glas water gepakt",
  };
  state.cravings = [
    base,
    {
      ...base,
      id: "known",
      time: "11:00",
      situation: "Bekend middel bij de halte",
      substance: "Cocaine",
    },
    {
      ...base,
      id: "numbered",
      time: "12:00",
      situation: "Een eigen situatie op de bank",
      substance: "3-MMC",
    },
    {
      ...base,
      id: "custom",
      time: "13:00",
      situation: "Eigen middel op het balkon",
      substance: customSubstance,
    },
  ];
  state.goals = [
    {
      id: "unrelated-goal",
      target: "Alcohol",
      name: "Alcohol",
      direction: "Stoppen",
      note: "Geen bron voor het middel van een craving",
    },
  ];
  return state;
}
const rawState = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
async function history(page: Page) {
  await page.goto("./#/history");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
  await applyHistoryFilters(page, { kind: "craving" });
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: fixture() },
  );
});

test("bekende en eigen middelen zijn zichtbaar en doorzoekbaar zonder oude registraties aan te vullen", async ({
  page,
}) => {
  await history(page);
  const original = await rawState(page);
  const rows = page.locator(".dp-history-list > li");
  await expect(rows).toHaveCount(4);
  const historic = rows.filter({
    has: page.locator("summary", { hasText: /Middel.*niet ingevuld/i }),
  });
  await expect(historic).toHaveCount(1);
  await expect(historic).not.toContainText("Alcohol");
  for (const [query, value] of [
    ["cOcAiNe", "Cocaine"],
    ["3-mmc", "3-MMC"],
    ["KRATOM", customSubstance],
  ]) {
    await applyHistoryFilters(page, { query });
    await expect(rows).toHaveCount(1);
    await expect(rows.locator("summary")).toContainText(value);
  }
  await applyHistoryFilters(page, { query: "keuken" });
  await expect(rows).toHaveCount(1);
  await rows.locator("summary").click();
  await expect(rows).toContainText("Historische situatie");
  await applyHistoryFilters(page, { query: "undefined" });
  await expect(rows).toHaveCount(0);
  expect(await rawState(page)).toBe(original);
});

test("een eigen middel blijft veilige tekst en past in de smalle geschiedenis", async ({
  page,
}, testInfo) => {
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  await history(page);
  await applyHistoryFilters(page, { query: "kratom" });
  const row = page.locator(".dp-history-list > li");
  await expect(row).toContainText(customSubstance);
  await row.locator("summary").click();
  await expect(row.locator("img, script")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
  const bounds = await row.evaluate((element) => ({
    viewport: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    values: [...element.querySelectorAll("dd")].map((value) => ({
      width: value.clientWidth,
      scroll: value.scrollWidth,
    })),
  }));
  expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewport);
  for (const value of bounds.values)
    expect(value.scroll).toBeLessThanOrEqual(value.width + 1);
  await row
    .locator("dl > div")
    .first()
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.screenshot({
    path: testInfo.outputPath("custom-substance-history-320.png"),
  });
  expect(dialogs).toBe(0);
});

test("back-up behoudt ingevulde middelen en ontbrekende historische velden exact", async ({
  page,
}) => {
  await history(page);
  await page.goto("./#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up downloaden", exact: true })
    .click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.state.cravings).toEqual(fixture().cravings);
  expect(Object.hasOwn(backup.state.cravings[0], "substance")).toBe(false);
  expect(backup.state.cravings[3].substance).toBe(customSubstance);
});
