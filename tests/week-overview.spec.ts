import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  type AppState,
  type Moment,
} from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DATE = "2026-10-13";

function moment(id: string, values: Partial<Moment> = {}): Moment {
  return {
    id,
    date: DATE,
    time: "09:00",
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Synthetische testnotitie",
    ...values,
  };
}

async function openWeek(page: Page, state: AppState) {
  await page.clock.setFixedTime(new Date("2026-10-13T12:00:00+02:00"));
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("unrelated.audit.test", "keep");
    },
    { key: DATA_KEY, value: state },
  );
  await page.goto("./#/history");
  await page
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption("week");
  await expect(
    page.getByRole("heading", { name: "Rustig terugkijken op je week" }),
  ).toBeVisible();
  return page.getByRole("region", { name: "Rustig terugkijken op je week" });
}

test("een lege week toont alle dagen zonder ontbrekende notities als nulscore of achterstand te behandelen", async ({
  page,
}) => {
  const state = createEmptyState();
  const week = await openWeek(page, state);
  await expect(
    week.getByText("7 oktober 2026 tot en met 13 oktober 2026", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    week.getByText(
      "Notities op 0 van de 7 dagen. Je hoeft gemiste dagen niet in te halen.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(week.getByText("Geen notities", { exact: true })).toHaveCount(7);
  await expect(week.locator(".dp-week-observations li")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(JSON.stringify(state));
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated.audit.test")),
  ).toBe("keep");
});

test("week houdt scores, slaap en soorten apart, blijft leesbaar op klein scherm en verandert geen gegevens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const state = createEmptyState();
  state.moments = [
    moment("good-unrest", {
      before: { mood: 2, eis: null, pans: 4 },
      activity: "Een grens aangeven",
      attempted: true,
    }),
    moment("words-and-followup", {
      time: "12:00",
      after: {
        mood: 0,
        eis: null,
        emotionRatings: [{ id: "anger", label: "Boos", intensity: 0 }],
      },
      afterDate: DATE,
      afterTime: "12:30",
    }),
  ];
  state.days = [
    {
      date: DATE,
      ratings: { mood: null, eis: null },
      sleepHours: "3",
      sleepMinutes: "",
      note: "Weinig slaap geregistreerd",
    },
  ];
  state.cravings = [
    {
      id: "craving",
      date: DATE,
      time: "10:00",
      substance: "Cocaïne",
      situation: "Thuis",
      thought: "",
      bodySensation: "",
      emotion: "",
      behavior: "Rust genomen",
    },
  ];
  state.growth = [
    {
      id: "rest",
      date: "2026-10-12",
      text: "Rust genomen en een afspraak verzet. Deze volledige zin blijft leesbaar.",
      favorite: false,
    },
  ];
  const week = await openWeek(page, state);
  await expect(week).toContainText("Notities op 2 van de 7 dagen");
  await expect(
    week
      .locator(".dp-week-counts > div")
      .filter({ hasText: "Check-ins" })
      .locator("dd"),
  ).toHaveText("2");
  await expect(
    week
      .locator(".dp-week-counts > div")
      .filter({ hasText: "Nametingen" })
      .locator("dd"),
  ).toHaveText("1");
  await week.getByText("Welke scores zijn ingevuld?", { exact: true }).click();
  await expect(week).toContainText(
    "Stemming: 1 van 2 ingevuld · Spanning: 1 van 2 ingevuld",
  );
  await expect(week).toContainText(
    "Stemming: 1 van 1 ingevuld · Spanning: 0 van 1 ingevuld",
  );
  await expect(week).toContainText("Stemming: 0 van 1 ingevuld");
  await week
    .locator("summary")
    .filter({ hasText: "dinsdag 13 oktober 2026" })
    .click();
  await expect(
    week.getByText("Check-in · 09:00", { exact: true }),
  ).toBeVisible();
  await expect(
    week.getByText("Nameting · 12:30", { exact: true }),
  ).toBeVisible();
  await expect(
    week.getByText("Slaap: 3 uur · minuten niet ingevuld (onvolledig).", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(week.getByText("Neutraal", { exact: true })).toBeVisible();
  await expect(week.getByText("0/100", { exact: true })).toBeVisible();
  await expect(
    week.getByText("Spanning niet ingevuld.", { exact: true }),
  ).toHaveCount(2);
  await expect(week).toContainText(
    "Activiteit bij deze check-in: Een grens aangeven. Geprobeerd: ja.",
  );
  await week
    .locator("summary")
    .filter({ hasText: "maandag 12 oktober 2026" })
    .click();
  await expect(
    week.getByText(state.growth[0].text, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Soort registratie", exact: true })
    .selectOption("craving");
  await page.getByRole("searchbox").fill("Cocaïne");
  await expect(
    week
      .locator(".dp-week-counts > div")
      .filter({ hasText: "Check-ins" })
      .locator("dd"),
  ).toHaveText("2");
  await expect(week).toContainText(
    "De filters voor soort en zoeken gelden voor de grafiek en registraties eronder.",
  );
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(JSON.stringify(state));
});
