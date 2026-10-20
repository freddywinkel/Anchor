import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createEmptyState,
  validateState,
  type AppState,
  type CravingRecord,
  type Moment,
} from "../src/lib/storage";
import {
  applyHistoryFilters,
  expectHistoryFilters,
  openHistoryChart,
  openHistoryFilters,
  openHistoryWeek,
} from "./history-filters";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const UNRELATED = "synthetic.history-usability.keep";
const DATE = "2026-10-20";
const finalLine = "Ook deze laatste regel blijft volledig terug te lezen.";
const moment = (id: string, values: Partial<Moment> = {}): Moment => ({
  id,
  date: DATE,
  time: "09:00",
  kind: "checkin",
  before: { mood: 0, eis: null },
  after: null,
  afterDate: null,
  afterTime: null,
  activity: "",
  attempted: null,
  emotions: [],
  note: `Synthetische check-in.\n${finalLine}`,
  ...values,
});
const craving = (
  id: string,
  values: Partial<CravingRecord> = {},
): CravingRecord => ({
  id,
  date: DATE,
  time: "12:00",
  substances: ["Cocaine", "3-MMC"],
  situation: "Synthetisch thuis na een gesprek.",
  thought: "Ik kan een kleine keuze maken.",
  bodySensation: "Gespannen schouders.",
  emotion: "Nerveus.",
  behavior: `Rust nemen.\n${finalLine}`,
  ...values,
});

function fixture(): AppState {
  const state = createEmptyState();
  state.theme = "light";
  state.moments = [
    moment("usability-linked", { cravingId: "usability-craving" }),
    moment("usability-overnight", {
      date: "2026-10-19",
      time: "22:00",
      after: { mood: 1, eis: null },
      afterDate: DATE,
      afterTime: "08:45",
      activity: "Rust nemen",
      attempted: true,
    }),
    moment("usability-old", { date: "2026-09-30" }),
  ];
  state.cravings = [
    craving("usability-craving"),
    craving("usability-later", { time: "14:00", substances: ["Cannabis"] }),
    craving("usability-old-craving", { date: "2026-09-30" }),
  ];
  state.days = [
    {
      date: DATE,
      ratings: { mood: null, eis: null },
      sleepHours: "",
      sleepMinutes: "",
      note: `Dagoverzicht zonder verzonnen tijdstip.\n${finalLine}`,
    },
  ];
  state.growth = [
    {
      id: "usability-rest",
      date: DATE,
      text: `Rust genomen.\n${finalLine}`,
      favorite: false,
    },
    {
      id: "usability-boundary",
      date: DATE,
      text: "Een grens aangegeven.",
      favorite: true,
    },
    {
      id: "usability-other-growth",
      date: "2026-10-18",
      text: "Een ander klein moment.",
      favorite: false,
    },
  ];
  return state;
}

const drafts = {
  "craving:new": craving("usability-pending", {
    thought: "Dit bestaande concept blijft behouden.",
  }),
  "moment:usability-pending": moment("usability-pending", {
    time: "",
    note: "Een onvolledig check-inconcept blijft ongewijzigd.",
  }),
};
const calendar = (page: Page) =>
  page.getByRole("region", { name: "Maandkalender", exact: true });
const day = (page: Page) =>
  page.getByRole("region", {
    name: "Tijdlijn van 20 oktober 2026",
    exact: true,
  });
const results = (page: Page) =>
  page.getByRole("region", { name: "Registraties", exact: true });
const heading = (page: Page) => page.locator("#dp-history-entries");
const trigger = (page: Page) =>
  page.getByRole("button", { name: "Zoeken en filteren", exact: true });
const selection = (page: Page) => page.locator("#dp-history-selection");
const rows = (page: Page) => day(page).locator("[data-timeline-id]");
const snapshot = (page: Page) =>
  page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    [DATA, DRAFTS, UNRELATED],
  );

async function seed(page: Page, state = fixture()) {
  validateState(state);
  await page.clock.setFixedTime(new Date(`${DATE}T16:00:00+02:00`));
  await page.addInitScript(
    ({ state, drafts, DATA, DRAFTS, UNRELATED }) => {
      if (!localStorage.getItem(DATA))
        localStorage.setItem(DATA, JSON.stringify(state));
      if (!localStorage.getItem(DRAFTS))
        localStorage.setItem(
          DRAFTS,
          JSON.stringify({ version: 1, records: drafts }),
        );
      if (!localStorage.getItem(UNRELATED))
        localStorage.setItem(UNRELATED, "Bewaard.");
    },
    { state, drafts, DATA, DRAFTS, UNRELATED },
  );
  await page.goto("./#/history");
  await expect(calendar(page)).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}

async function selectDay(page: Page) {
  await calendar(page).locator(`[data-calendar-date="${DATE}"]`).click();
  await expect(day(page)).toBeVisible();
}

async function expand(row: Locator) {
  const details = row.locator("details").first();
  if (!(await details.evaluate((node) => node.open)))
    await row.locator("summary").first().click();
}

async function expectFocusedResult(page: Page) {
  await expect(heading(page)).toBeFocused();
  await expect
    .poll(() =>
      heading(page).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("zoekcriteria horen bij de resultaten; alle vier soorten en één bronregistratie per check-in zijn vindbaar vóór optionele inzichten", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await expect(
    page.locator(".dp-history-title").getByRole("button"),
  ).toHaveCount(0);
  await expect(results(page).locator(".dp-history-toolbar")).toContainText(
    "Alle dagen",
  );
  await expect(
    results(page)
      .locator(".dp-history-toolbar")
      .getByRole("button", { name: "Zoeken en filteren", exact: true }),
  ).toBeVisible();
  await expect(selection(page)).toHaveAccessibleName("Huidige selectie");
  await expect(page.getByText("Filter:", { exact: true })).toHaveCount(0);
  for (const [kind, count] of [
    ["moment", 3],
    ["craving", 3],
    ["day", 1],
    ["growth", 3],
  ] as const)
    await expect(
      results(page).locator(`[data-history-kind="${kind}"] .dp-history-record`),
    ).toHaveCount(count);
  await expect(results(page)).toContainText("10 gevonden");
  await expect(results(page)).toContainText(
    "Nametingen staan bij hun check-in en tellen in deze lijst niet nogmaals mee.",
  );
  const chartSummary = page
    .locator("summary")
    .filter({ hasText: /^Stemmingsverloop bekijken$/ });
  const weekSummary = page
    .locator("summary")
    .filter({ hasText: /^Weekoverzicht bekijken$/ });
  await expect(chartSummary.locator("..")).not.toHaveAttribute("open", "");
  await expect(weekSummary.locator("..")).not.toHaveAttribute("open", "");
  await expect(
    page.getByRole("region", { name: "Stemming per moment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Rustig terugkijken op je week",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await results(page).evaluate((element) => {
      const summary = [...document.querySelectorAll("summary")].find(
        (node) => node.textContent?.trim() === "Stemmingsverloop bekijken",
      )!;
      return !!(
        element.compareDocumentPosition(summary) &
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await applyHistoryFilters(page, { kind: "growth", query: "grens" });
  await expect(results(page).locator(".dp-history-record")).toHaveCount(1);
  const memory = results(page).locator(
    '[data-history-id="usability-boundary"]',
  );
  await expand(memory);
  await expect(memory).toContainText("Een grens aangegeven.");
  expect(await snapshot(page)).toEqual(before);
});

test("ongewijzigd bevestigen bewaart de gekozen dag, een open kaart en alle geladen dagregistraties", async ({
  page,
}) => {
  const state = fixture();
  state.cravings.push(
    ...Array.from({ length: 55 }, (_, index) =>
      craving(`usability-many-${index}`, {
        time: `10:${String(index).padStart(2, "0")}`,
      }),
    ),
  );
  await seed(page, state);
  const before = await snapshot(page);
  await selectDay(page);
  await day(page)
    .getByRole("button", { name: "Meer momenten tonen", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(62);
  const entry = day(page).locator(
    '[data-timeline-id="craving:usability-many-0"]',
  );
  await expand(entry);
  const ids = await rows(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-timeline-id")),
  );
  const dialog = await openHistoryFilters(page);
  await expect(
    dialog.getByRole("combobox", { name: "Periode", exact: true }),
  ).toHaveValue("day");
  await expect(
    dialog.getByRole("option", { name: "Deze dag", exact: true }),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Resultaten tonen", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(62);
  expect(
    await rows(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-timeline-id")),
    ),
  ).toEqual(ids);
  await expect(entry.locator("details")).toHaveAttribute("open", "");
  await expect(
    calendar(page).locator(`[data-calendar-date="${DATE}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await expectFocusedResult(page);
  expect(await snapshot(page)).toEqual(before);
});

test("dagcriteria zoeken binnen die dag en check-ins omvatten nametingen op hun eigen datum; alleen een expliciete andere periode verlaat de dag", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDay(page);
  await applyHistoryFilters(page, { kind: "checkin" });
  await expect(rows(page)).toHaveCount(2);
  await expect(day(page).locator('[data-timeline-kind="after"]')).toContainText(
    "08:45",
  );
  await expectHistoryFilters(page, { period: "day", kind: "checkin" });
  await applyHistoryFilters(page, { kind: "craving", query: "Cocaine" });
  await expect(rows(page)).toHaveCount(1);
  await expect(
    day(page).locator('[data-timeline-id="craving:usability-craving"]'),
  ).toContainText("3-MMC");
  await expect(selection(page)).toContainText("Deze dag");
  await expect(heading(page)).toHaveText("dinsdag 20 oktober 2026");
  await applyHistoryFilters(page, { period: "all" });
  await expect(day(page)).toHaveCount(0);
  await expect(results(page).locator(".dp-history-record")).toHaveCount(2);
  await expectFocusedResult(page);
  await selectDay(page);
  await expect(rows(page)).toHaveCount(7);
  await expectHistoryFilters(page, { period: "day", kind: "all", query: "" });
  await applyHistoryFilters(page, { period: "week", kind: "growth" });
  await expect(day(page)).toHaveCount(0);
  await expect(
    results(page).locator('[data-history-kind="growth"] .dp-history-record'),
  ).toHaveCount(3);
  await expect(selection(page)).toContainText("Afgelopen 7 dagen");
  expect(await snapshot(page)).toEqual(before);
});

test("annuleren bewaart dagcriteria en kaart; Criteria wissen wist alleen zoekterm en soort en houdt de gekozen periode", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDay(page);
  await applyHistoryFilters(page, { kind: "craving", query: "Cocaine" });
  const entry = rows(page).first();
  await expand(entry);
  const dialog = await openHistoryFilters(page);
  await dialog
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption("all");
  await dialog
    .getByRole("searchbox", { name: "Zoeken", exact: true })
    .fill("Cannabis");
  await dialog.getByRole("button", { name: "Annuleren", exact: true }).click();
  await expect(trigger(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(1);
  await expect(entry.locator("details")).toHaveAttribute("open", "");
  const reopened = await openHistoryFilters(page);
  await reopened
    .getByRole("button", { name: "Criteria wissen", exact: true })
    .click();
  await expect(
    reopened.getByRole("combobox", { name: "Periode", exact: true }),
  ).toHaveValue("day");
  await expect(
    reopened.getByRole("combobox", { name: "Soort registratie", exact: true }),
  ).toHaveValue("all");
  await expect(
    reopened.getByRole("searchbox", { name: "Zoeken", exact: true }),
  ).toHaveValue("");
  await expect(rows(page)).toHaveCount(1);
  await reopened
    .getByRole("button", { name: "Resultaten tonen", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(7);
  await expectFocusedResult(page);
  expect(await snapshot(page)).toEqual(before);
});

test("Filters wissen herstelt binnen een dag die volledige dag en buiten een dag alle registraties met zichtbare toetsenbordfocus", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDay(page);
  await applyHistoryFilters(page, { kind: "growth", query: "Rust" });
  await expect(rows(page)).toHaveCount(1);
  await page
    .getByRole("button", { name: "Filters wissen", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(7);
  await expectFocusedResult(page);
  await expectHistoryFilters(page, { period: "day", kind: "all", query: "" });
  await page
    .getByRole("button", { name: "Alle registraties", exact: true })
    .click();
  await applyHistoryFilters(page, {
    period: "week",
    kind: "craving",
    query: "Cannabis",
  });
  await expect(results(page).locator(".dp-history-record")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Filters wissen", exact: true })
    .click();
  await expect(results(page).locator(".dp-history-record")).toHaveCount(10);
  await expectFocusedResult(page);
  await expectHistoryFilters(page, { period: "all", kind: "all", query: "" });
  await heading(page).focus();
  await page.keyboard.press("Tab");
  await expect(trigger(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});

test("een maand bekijken verandert de bestaande dagselectie of zoekresultaten niet en een nieuwe dagkeuze reset oude criteria", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDay(page);
  await applyHistoryFilters(page, { kind: "craving", query: "Cannabis" });
  await calendar(page)
    .getByRole("button", { name: "Vorige maand", exact: true })
    .click();
  await expect(
    calendar(page).getByRole("heading", {
      name: "september 2026",
      exact: true,
    }),
  ).toBeVisible();
  await expect(day(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(selection(page)).toContainText("Deze dag");
  await expect(heading(page)).toHaveText("dinsdag 20 oktober 2026");
  await expect(calendar(page)).toContainText(/bekijk|blader|kie[szt] een dag/i);
  await page
    .getByRole("button", { name: "Alle registraties", exact: true })
    .click();
  await expectFocusedResult(page);
  await applyHistoryFilters(page, { kind: "craving", query: "Cocaine" });
  await calendar(page)
    .getByRole("button", { name: "Deze maand", exact: true })
    .click();
  await expect(results(page).locator(".dp-history-record")).toHaveCount(2);
  await selectDay(page);
  await expect(rows(page)).toHaveCount(7);
  await expectHistoryFilters(page, { period: "day", kind: "all", query: "" });
  expect(await snapshot(page)).toEqual(before);
});

test("zoeken op het expliciet gekoppelde middel vindt zowel de craving als de check-in zonder nieuwe koppelingen te schrijven", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDay(page);
  await applyHistoryFilters(page, { query: "Cocaine" });
  await expect(rows(page)).toHaveCount(2);
  await expect(
    day(page).locator('[data-timeline-id="checkin:usability-linked"]'),
  ).toBeVisible();
  await expect(
    day(page).locator('[data-timeline-id="craving:usability-craving"]'),
  ).toBeVisible();
  await applyHistoryFilters(page, { period: "all", kind: "checkin" });
  await expect(results(page).locator(".dp-history-record")).toHaveCount(1);
  await expect(
    results(page).locator('[data-history-id="usability-linked"]'),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test("grafiek en week zijn bewust te openen, houden hun eigen bereik duidelijk en blijven open na terugkeer uit bewerken", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  const graph = await openHistoryChart(page);
  const week = await openHistoryWeek(page);
  await expect(graph.locator("circle")).toHaveCount(4);
  await expect(week.locator(".dp-week-days > li")).toHaveCount(7);
  await expect(week).toContainText(
    "14 oktober 2026 tot en met 20 oktober 2026",
  );
  const entry = results(page).locator('[data-history-id="usability-craving"]');
  await expand(entry);
  await entry.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await expect(page).toHaveURL(
    /#\/craving\/usability-craving\?returnTo=history$/,
  );
  await page.goBack();
  await expect(graph).toBeVisible();
  await expect(week).toBeVisible();
  await expect(entry.locator("summary")).toBeFocused();
  await expect(entry.locator("details")).toHaveAttribute("open", "");
  expect(await snapshot(page)).toEqual(before);
});

for (const theme of ["light", "dark"] as const) {
  test(`resultatenkop, criteria en dagpop-up passen op 320 px met 200% tekst in ${theme}`, async ({
    page,
  }, testInfo) => {
    const state = fixture();
    state.theme = theme;
    state.palette = theme === "dark" ? "amber" : "ocean";
    await page.setViewportSize({ width: 320, height: 900 });
    await seed(page, state);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const before = await snapshot(page);
    await selectDay(page);
    await applyHistoryFilters(page, { kind: "craving", query: "Cocaine" });
    await expectFocusedResult(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const toolbar = day(page).locator(".dp-history-toolbar");
    expect(
      await toolbar.evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ).toBe(true);
    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`history-toolbar-320-200-${theme}.png`),
    });
    const dialog = await openHistoryFilters(page);
    await expect(
      dialog.getByRole("combobox", { name: "Periode", exact: true }),
    ).toHaveValue("day");
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await dialog
      .getByRole("button", { name: "Resultaten tonen", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`history-day-search-320-200-${theme}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(trigger(page)).toBeFocused();
    const entry = rows(page).first();
    await expand(entry);
    await expect(entry).toContainText(finalLine);
    expect(await snapshot(page)).toEqual(before);
  });
}
