import { expect, test, type Page } from "@playwright/test";
import { applyHistoryFilters, openHistoryChart } from "./history-filters";
import {
  createEmptyState,
  validateState,
  type AppState,
  type Moment,
} from "../src/lib/storage";

const DATA = "anchor.app.data.v1";
const DATE = "2026-10-14";
const moment = (id: string, values: Partial<Moment> = {}): Moment => ({
  id,
  date: DATE,
  time: "08:30",
  kind: "checkin",
  before: { mood: null, eis: null },
  after: null,
  afterDate: null,
  afterTime: null,
  activity: "",
  attempted: null,
  emotions: [],
  note: "Synthetische grafiekcontrole",
  ...values,
});
function fixture() {
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  state.moments = [
    moment("earlier", {
      date: "2026-10-01",
      time: "09:00",
      before: { mood: -1, eis: null },
      after: { mood: 2, eis: null },
      afterDate: DATE,
      afterTime: "10:00",
      activity: "Buiten zitten",
      attempted: true,
    }),
    moment("zero", { before: { mood: 0, eis: null } }),
    moment("missing", { before: { mood: null, eis: null, pans: 4 } }),
  ];
  state.days = [
    {
      date: DATE,
      ratings: { mood: -2, eis: null },
      sleepHours: "",
      sleepMinutes: "",
      note: "Dagsamenvatting blijft apart",
    },
  ];
  return state;
}
async function open(page: Page, state: AppState) {
  validateState(state);
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00+02:00`));
  await page.addInitScript(
    ({ data, state }) => {
      localStorage.setItem(data, JSON.stringify(state));
    },
    { data: DATA, state },
  );
  await page.goto("./#/history");
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
  await openHistoryChart(page);
}
const chart = (page: Page) =>
  page.getByRole("region", { name: "Stemming per moment", exact: true });
const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), DATA);

test("grafiek houdt nul, ontbrekend en nameting apart en laat scores kiezen zonder gegevens te wijzigen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, fixture());
  const before = await stored(page);
  const graph = chart(page);
  await expect(
    graph.getByRole("img", { name: /^3 stemmingsmetingen/ }),
  ).toBeVisible();
  await expect(graph.locator("circle")).toHaveCount(3);
  await expect(graph).toContainText("Afstanden tonen geen tijdsduur");
  await expect(graph.getByRole("status")).toContainText("Nameting · 10:00");
  await expect(graph.getByRole("status")).toContainText("Erg goed (+2)");
  await expect(graph.getByRole("status")).toContainText("14 oktober 2026");
  const previous = graph.getByRole("button", {
    name: "Vorige meting",
    exact: true,
  });
  await previous.click();
  await expect(graph.getByRole("status")).toContainText("Neutraal (0)");
  await previous.focus();
  await page.keyboard.press("Enter");
  await expect(graph.getByRole("status")).toContainText("Laag (-1)");
  await expect(graph.getByRole("status")).toContainText("1 oktober 2026");
  await expect(previous).toBeDisabled();
  await graph.locator('[data-mood-point="earlier-after"]').click();
  await expect(graph.getByRole("status")).toContainText("Nameting · 10:00");
  await expect(
    graph.getByRole("button", { name: "Volgende meting", exact: true }),
  ).toBeDisabled();
  await graph.scrollIntoViewIfNeeded();
  await graph.screenshot({
    path: testInfo.outputPath("mood-plot-390-ocean.png"),
  });
  expect(await stored(page)).toBe(before);
});

test("de laatste veertig metingen blijven begrensd en volledig als tekst beschikbaar", async ({
  page,
}) => {
  const state = fixture();
  state.moments = Array.from({ length: 44 }, (_, index) =>
    moment(`record-${index}`, {
      time: `08:${String(index).padStart(2, "0")}`,
      before: { mood: (index % 5) - 2, eis: null },
    }),
  );
  await open(page, state);
  const before = await stored(page);
  const graph = chart(page);
  await expect(graph.locator("circle")).toHaveCount(40);
  await expect(graph.locator("circle").first()).toHaveAttribute(
    "data-mood-point",
    "record-4-before",
  );
  await expect(graph).toContainText("de laatste 40 van 44 metingen");
  await expect(graph.getByRole("status")).toContainText("Meting 44 van 44");
  await graph
    .getByText("Scores bekijken als tekst (40)", { exact: true })
    .click();
  await expect(graph.locator(".dp-observation-details li")).toHaveCount(40);
  await expect(
    graph.locator(".dp-observation-details li").first(),
  ).toContainText("08:04");
  await expect(
    graph.locator(".dp-observation-details li").last(),
  ).toContainText("08:43");
  expect(await stored(page)).toBe(before);
});

test("een lege scoreselectie krijgt geen nulpunten en een andere zoekselectie toont actuele details", async ({
  page,
}) => {
  await open(page, fixture());
  const before = await stored(page);
  const graph = chart(page);
  await applyHistoryFilters(page, { query: "Buiten zitten" });
  await expect(graph.locator("circle")).toHaveCount(2);
  await graph
    .getByRole("button", { name: "Vorige meting", exact: true })
    .click();
  await expect(graph.getByRole("status")).toContainText("Laag (-1)");
  await applyHistoryFilters(page, { query: "pannetjes" });
  await expect(graph.locator("circle")).toHaveCount(0);
  await expect(graph.getByRole("img")).toHaveCount(0);
  await expect(graph).toContainText(
    "Geen stemmingsscores gevonden binnen deze selectie",
  );
  await applyHistoryFilters(page, { query: "" });
  await expect(graph.locator("circle")).toHaveCount(3);
  await expect(graph.getByRole("status")).toContainText("Laag (-1)");
  expect(await stored(page)).toBe(before);
});

test("grafiek en bediening passen op 320 pixels met grote tekst en in donker thema", async ({
  page,
}, testInfo) => {
  const state = fixture();
  state.theme = "dark";
  state.palette = "amber";
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page, state);
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
  const graph = chart(page);
  await expect(graph.locator("circle")).toHaveCount(3);
  const bounds = await graph.evaluate((element) => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    controls: [...element.querySelectorAll("button")].map((button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
  }));
  expect(bounds.width).toBeLessThanOrEqual(bounds.viewport);
  for (const control of bounds.controls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  await graph
    .getByRole("button", { name: "Vorige meting", exact: true })
    .click();
  await expect(graph.getByRole("status")).toContainText("Neutraal (0)");
  await graph
    .getByText("Scores bekijken als tekst (3)", { exact: true })
    .click();
  await expect(graph.locator(".dp-observation-details li")).toHaveCount(3);
  await graph.screenshot({
    path: testInfo.outputPath("mood-plot-320-large-dark.png"),
  });
});
