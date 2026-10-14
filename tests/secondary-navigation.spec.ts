import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  validateState,
  type AppState,
  type CravingRecord,
} from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const DATE = "2026-10-14";
const craving = (id: string, date = DATE): CravingRecord => ({
  id,
  date,
  time: "10:15",
  substance: "Alcohol",
  situation: "Synthetische match en volledige situatie.",
  thought: "Een synthetische gedachte.",
  bodySensation: "Spanning",
  emotion: "Onrust",
  behavior: "Een pauze genomen",
});
async function open(page: Page, state: AppState, route: string) {
  validateState(state);
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00+02:00`));
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: DATA_KEY, state },
  );
  await page.goto(`./#/${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
const stored = (page: Page) =>
  page.evaluate(
    ([data, drafts]) => ({
      data: localStorage.getItem(data),
      drafts: localStorage.getItem(drafts),
    }),
    [DATA_KEY, DRAFT_KEY],
  );
const period = (page: Page) =>
  page.getByRole("combobox", { name: "Periode", exact: true });
const kind = (page: Page) =>
  page.getByRole("combobox", { name: "Soort registratie", exact: true });

test("terug uit de editor herstelt filters, geopende kaart en geladen geschiedenis zonder opslag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createEmptyState();
  state.cravings = Array.from({ length: 60 }, (_, index) =>
    craving(`context-${index}`),
  );
  await open(page, state, "history");
  const before = await stored(page);
  await period(page).selectOption("week");
  await kind(page).selectOption("craving");
  await page.getByRole("searchbox").fill("match");
  await page
    .getByRole("button", { name: "Meer cravings tonen", exact: true })
    .click();
  const entry = page.locator('[data-history-id="context-55"]');
  await entry.locator("summary").click();
  await entry.getByRole("button", { name: /^Bewerken:/ }).click();
  await expect(page).toHaveURL(/#\/craving\/context-55\?returnTo=history$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await expect(period(page)).toHaveValue("week");
  await expect(kind(page)).toHaveValue("craving");
  await expect(page.getByRole("searchbox")).toHaveValue("match");
  await expect(
    page.locator(
      '.dp-history-group[data-history-kind="craving"] .dp-history-record',
    ),
  ).toHaveCount(60);
  await expect(entry.locator("details")).toHaveAttribute("open", "");
  await expect(entry.locator("summary")).toBeFocused();
  expect(await stored(page)).toEqual(before);
});

for (const target of ["moment", "craving", "day"] as const) {
  test(`weekoverzicht opent de volledige ${target} ondanks andere zoekfilters`, async ({
    page,
  }) => {
    const state = createEmptyState();
    state.moments = [
      {
        id: "week-moment",
        date: "2026-10-01",
        time: "09:00",
        kind: "checkin",
        before: { mood: -1, eis: null },
        after: { mood: 1, eis: null },
        afterDate: DATE,
        afterTime: "11:00",
        activity: "Wandelen",
        attempted: true,
        emotions: [],
        note: "Volledige check-innotitie",
      },
    ];
    state.cravings = [craving("week-craving")];
    state.days = [
      {
        date: DATE,
        ratings: { mood: 0, eis: null },
        sleepHours: "7",
        sleepMinutes: "",
        note: "Volledige dagnotitie",
      },
    ];
    await open(page, state, "history");
    const before = await stored(page);
    await period(page).selectOption("week");
    await kind(page).selectOption("day");
    await page.getByRole("searchbox").fill("geen overeenkomst");
    await expect(
      page.getByRole("heading", { name: "Geen registraties gevonden" }),
    ).toBeVisible();
    const week = page.getByRole("region", {
      name: "Rustig terugkijken op je week",
    });
    await week.locator(".dp-week-days > li").last().locator("summary").click();
    await week
      .getByRole("button", {
        name: new RegExp(
          `^Bekijk ${target === "moment" ? "nameting" : target === "day" ? "dagoverzicht" : "craving"} van`,
        ),
      })
      .click();
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(kind(page)).toHaveValue("all");
    const id = target === "day" ? `day-${DATE}` : `week-${target}`;
    const entry = page.locator(
      `.dp-history-group[data-history-kind="${target}"] [data-history-id="${id}"]`,
    );
    await expect(entry.locator("details")).toHaveAttribute("open", "");
    await expect(entry.locator("summary")).toBeFocused();
    await expect(entry.locator(".dp-history-body")).toContainText(
      target === "moment"
        ? "Volledige check-innotitie"
        : target === "day"
          ? "Volledige dagnotitie"
          : state.cravings[0].situation,
    );
    if (target === "moment") {
      await expect(entry.locator("summary")).toContainText(
        "Nameting: 14 oktober 2026 · 11:00",
      );
      await expect(entry.locator(".dp-history-body")).toContainText(
        "Laag (-1)",
      );
    }
    expect(await stored(page)).toEqual(before);
  });
}

for (const change of ["delete", "date", "search"] as const) {
  test(`terugkijken houdt focus zichtbaar wanneer de bewerkte kaart verdwijnt door ${change}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = createEmptyState();
    state.cravings = Array.from({ length: 60 }, (_, index) =>
      craving(`removed-${index}`),
    );
    await open(page, state, "history");
    await period(page).selectOption("week");
    await kind(page).selectOption("craving");
    await page.getByRole("searchbox").fill("match");
    await page
      .getByRole("button", { name: "Meer cravings tonen", exact: true })
      .click();
    const entry = page.locator('[data-history-id="removed-55"]');
    await entry.locator("summary").click();
    await entry.getByRole("button", { name: /^Bewerken:/ }).click();
    if (change === "delete") {
      await page
        .getByRole("button", { name: "Craving verwijderen", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Ja, verwijderen", exact: true })
        .click();
    } else {
      if (change === "date")
        await page.getByLabel("Datum", { exact: true }).fill("2026-10-01");
      else
        await page
          .getByRole("textbox", { name: "Wie, wat en waar", exact: true })
          .fill("Afwijkende synthetische situatie.");
      await page
        .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
        .click();
    }
    await expect(page).toHaveURL(/#\/history$/);
    await expect(page.locator(".dp-history-record")).toHaveCount(59);
    await expect(period(page)).toHaveValue("week");
    await expect(kind(page)).toHaveValue("craving");
    await expect(page.getByRole("searchbox")).toHaveValue("match");
    const heading = page.getByRole("heading", {
      name: "Registraties",
      exact: true,
    });
    await expect(heading).toBeFocused();
    expect(
      await heading.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }),
    ).toBe(true);
    const records = JSON.parse((await stored(page)).data!).cravings;
    expect(records).toHaveLength(change === "delete" ? 59 : 60);
  });
}

test("lege geschiedenis geeft één uitnodiging zonder lege grafiek of drie extra lege groepen", async ({
  page,
}) => {
  await open(page, createEmptyState(), "history");
  await expect(
    page.getByRole("heading", {
      name: "Je hebt nog geen registraties",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".dp-history-group")).toHaveCount(0);
  await expect(page.locator(".dp-mood-plot")).toHaveCount(0);
  await page.getByRole("link", { name: "Naar Vandaag", exact: true }).click();
  await expect(page).toHaveURL(/#\/today$/);
});

test("duizenden kleine momenten worden in begrensde delen geladen met focus op de nieuwe kaart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createEmptyState();
  state.growth = Array.from({ length: 3000 }, (_, index) => ({
    id: `growth-${index}`,
    date: DATE,
    text: `Synthetisch moment ${index}`,
    favorite: false,
  }));
  await open(page, state, "growth");
  const before = await stored(page);
  await expect(page.locator(".dp-growth-list > li")).toHaveCount(50);
  expect(await page.locator("*").count()).toBeLessThan(2000);
  await page
    .getByRole("button", { name: "Meer kleine momenten tonen", exact: true })
    .click();
  await expect(page.locator(".dp-growth-list > li")).toHaveCount(100);
  await expect(page.locator('[data-growth-id="growth-50"]')).toBeFocused();
  await expect(
    page.getByText("Je ziet 100 van 3000 kleine momenten.", { exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(before);
});

test("dezelfde weekselectie verschuift op een nieuwe dag zonder opgeslagen data te wijzigen", async ({
  page,
}) => {
  const state = createEmptyState();
  state.cravings = [
    craving("leaves-week", "2026-10-08"),
    craving("stays-week"),
  ];
  await open(page, state, "history");
  const before = await stored(page);
  await period(page).selectOption("week");
  await kind(page).selectOption("craving");
  await expect(page.locator(".dp-history-record")).toHaveCount(2);
  await page.clock.setFixedTime(new Date("2026-10-15T00:01:00+02:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".dp-history-record")).toHaveCount(1);
  await expect(page.locator(".dp-week-period")).toHaveText(
    "9 oktober 2026 tot en met 15 oktober 2026",
  );
  await expect(kind(page)).toHaveValue("craving");
  expect(await stored(page)).toEqual(before);
});

test("een onaangeraakt klein-momentformulier volgt de nieuwe dag en bewaart daarna een echt concept", async ({
  page,
}) => {
  await open(page, createEmptyState(), "growth");
  const input = page.locator('.dp-growth-compose input[type="date"]');
  await expect(input).toHaveValue(DATE);
  await page.clock.setFixedTime(new Date("2026-10-15T00:01:00+02:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(input).toHaveValue("2026-10-15");
  expect((await stored(page)).drafts).toBeNull();
  await page
    .getByRole("textbox", { name: "Wat wil je onthouden?", exact: true })
    .fill("Synthetisch concept vóór middernacht");
  const before = await stored(page);
  await page.clock.setFixedTime(new Date("2026-10-16T00:01:00+02:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(input).toHaveValue("2026-10-15");
  await expect(input).toHaveAttribute("max", "2026-10-16");
  expect(await stored(page)).toEqual(before);
});
