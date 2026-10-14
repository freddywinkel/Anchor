import { expect, test, type Page } from "@playwright/test";
import { createEmptyState, type CravingRecord } from "../src/lib/storage";
import { applyHistoryFilters, openHistoryFilters } from "./history-filters";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const date = "2026-10-14";
function craving(id: string, index: number): CravingRecord {
  return {
    id,
    date,
    time: "10:15",
    substance: "Alcohol",
    situation: index < 30 ? "Ruimte en rust" : "Een ander moment",
    thought: "Synthetische gedachte",
    bodySensation: "",
    emotion: "",
    behavior: "",
  };
}
async function open(page: Page) {
  const state = createEmptyState();
  state.cravings = Array.from({ length: 60 }, (_, index) =>
    craving(`filter-${index}`, index),
  );
  state.cravings.push({ ...craving("old-craving", 0), date: "2026-10-01" });
  state.days = [
    {
      date,
      ratings: { mood: 0, eis: null },
      sleepHours: "",
      sleepMinutes: "",
      note: "Een rustige dag",
    },
  ];
  await page.clock.setFixedTime(new Date(`${date}T12:00:00+02:00`));
  await page.addInitScript(
    ({ state, DATA, DRAFTS, draft }) => {
      localStorage.setItem(DATA, JSON.stringify(state));
      localStorage.setItem(
        DRAFTS,
        JSON.stringify({ version: 1, records: { "craving:new": draft } }),
      );
    },
    { state, DATA, DRAFTS, draft: craving("unrelated-draft", 0) },
  );
  await page.goto("./#/history");
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
const stored = (page: Page) =>
  page.evaluate(
    ([data, drafts]) => [
      localStorage.getItem(data),
      localStorage.getItem(drafts),
    ],
    [DATA, DRAFTS],
  );
const entries = (page: Page) =>
  page.locator(
    '.dp-history-group[data-history-kind="craving"] .dp-history-record',
  );
const trigger = (page: Page) =>
  page.getByRole("button", { name: "Zoeken en filteren", exact: true });

for (const cancellation of [
  "Annuleren",
  "Venster sluiten",
  "Escape",
] as const) {
  test(`zoekdialoog ${cancellation} verwerpt tijdelijke filters en behoudt geopende kaart, paginatie en lokale gegevens`, async ({
    page,
  }) => {
    await open(page);
    const before = await stored(page);
    await page
      .getByRole("button", { name: "Meer cravings tonen", exact: true })
      .click();
    await expect(entries(page)).toHaveCount(61);
    const entry = page.locator('[data-history-id="filter-55"]');
    await entry.locator("summary").click();
    const dialog = await openHistoryFilters(page);
    await dialog
      .getByRole("combobox", { name: "Periode", exact: true })
      .selectOption("week");
    await dialog
      .getByRole("combobox", { name: "Soort registratie", exact: true })
      .selectOption("craving");
    await dialog
      .getByRole("searchbox", { name: "Zoeken", exact: true })
      .fill("rust");
    await expect(entries(page)).toHaveCount(61);
    await expect(entry.locator("details")).toHaveAttribute("open", "");
    if (cancellation === "Escape") await page.keyboard.press("Escape");
    else
      await dialog
        .getByRole("button", { name: cancellation, exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger(page)).toBeFocused();
    await expect(entries(page)).toHaveCount(61);
    await expect(entry.locator("details")).toHaveAttribute("open", "");
    const reopened = await openHistoryFilters(page);
    await expect(
      reopened.getByRole("combobox", { name: "Periode", exact: true }),
    ).toHaveValue("all");
    await expect(
      reopened.getByRole("combobox", {
        name: "Soort registratie",
        exact: true,
      }),
    ).toHaveValue("all");
    await expect(
      reopened.getByRole("searchbox", { name: "Zoeken", exact: true }),
    ).toHaveValue("");
    await reopened
      .getByRole("button", { name: "Annuleren", exact: true })
      .click();
    expect(await stored(page)).toEqual(before);
  });
}

test("resultaten tonen past de drie filters samen toe en een later geannuleerde zoekwijziging laat die selectie staan", async ({
  page,
}) => {
  await open(page);
  const before = await stored(page);
  await expect(
    page.getByRole("searchbox", { name: "Zoeken", exact: true }),
  ).not.toBeVisible();
  await applyHistoryFilters(page, {
    period: "week",
    kind: "craving",
    query: "RUST",
  });
  await expect(entries(page)).toHaveCount(30);
  await expect(
    page.locator('.dp-history-group[data-history-kind="day"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-history-id="old-craving"]')).toHaveCount(0);
  const dialog = await openHistoryFilters(page);
  await expect(
    dialog.getByRole("combobox", { name: "Periode", exact: true }),
  ).toHaveValue("week");
  await expect(
    dialog.getByRole("combobox", { name: "Soort registratie", exact: true }),
  ).toHaveValue("craving");
  await expect(
    dialog.getByRole("searchbox", { name: "Zoeken", exact: true }),
  ).toHaveValue("RUST");
  await dialog
    .getByRole("button", { name: "Criteria wissen", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Periode", exact: true }),
  ).toHaveValue("all");
  await expect(
    dialog.getByRole("combobox", { name: "Soort registratie", exact: true }),
  ).toHaveValue("all");
  await expect(
    dialog.getByRole("searchbox", { name: "Zoeken", exact: true }),
  ).toHaveValue("");
  await expect(entries(page)).toHaveCount(30);
  await dialog
    .getByRole("searchbox", { name: "Zoeken", exact: true })
    .fill("geen overeenkomst");
  await dialog.getByRole("button", { name: "Annuleren", exact: true }).click();
  await expect(entries(page)).toHaveCount(30);
  await page
    .getByRole("button", { name: "Filters wissen", exact: true })
    .click();
  await expect(entries(page)).toHaveCount(50);
  await expect(
    page.locator(
      '.dp-history-group[data-history-kind="day"] .dp-history-record',
    ),
  ).toHaveCount(1);
  expect(await stored(page)).toEqual(before);
});

test("zoekdialoog blijft met toetsenbord bruikbaar op 320 px en grote tekst", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const dialog = await openHistoryFilters(page);
  await expect(dialog).toHaveJSProperty("open", true);
  for (let index = 0; index < 12; index++) {
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
  }
  const geometry = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
    viewport: innerWidth,
    right: element.getBoundingClientRect().right,
    left: element.getBoundingClientRect().left,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  await dialog
    .getByRole("searchbox", { name: "Zoeken", exact: true })
    .fill("rust");
  await page.screenshot({
    path: testInfo.outputPath("history-search-dialog-320-large-text.png"),
  });
  await dialog
    .getByRole("button", { name: "Resultaten tonen", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(entries(page)).toHaveCount(31);
});

test("zoekdialoog brengt een programmatisch gefocust veld volledig in beeld zonder de pagina te verschuiven", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  const before = await stored(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const dialog = await openHistoryFilters(page);
  await dialog
    .getByRole("button", { name: "Criteria wissen", exact: true })
    .focus();
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const lowerPosition = await dialog.evaluate((element) => element.scrollTop);
  const pagePosition = await page.evaluate(() => scrollY);
  const search = dialog.getByRole("searchbox", { name: "Zoeken", exact: true });
  await search.fill("rust");
  await expect(search).toBeFocused();
  await expect
    .poll(() =>
      search.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const dialog = element.closest("dialog")!;
        const bounds = dialog.getBoundingClientRect();
        return (
          rect.top >= bounds.top + dialog.clientTop + 8 &&
          rect.bottom <= bounds.top + dialog.clientTop + dialog.clientHeight - 8
        );
      }),
    )
    .toBe(true);
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeLessThan(
    lowerPosition,
  );
  expect(await page.evaluate(() => scrollY)).toBe(pagePosition);
  await page.screenshot({
    path: testInfo.outputPath("focused-search-visible-320-large-text.png"),
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger(page)).toBeFocused();
  expect(await stored(page)).toEqual(before);
});
