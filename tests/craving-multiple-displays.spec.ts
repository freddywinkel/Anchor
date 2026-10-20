import { expect, test, type Page } from "@playwright/test";
import { applyHistoryFilters, openHistoryWeek } from "./history-filters";
import {
  createEmptyState,
  validateState,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  type CravingRecord,
} from "../src/lib/storage";

const DATE = "2026-10-14";
const custom = "Eigen <img src=x onerror=alert(1)> " + "x".repeat(80);
const selected = ["Alcohol", "Cocaine", "3-MMC", custom];

function fixture() {
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  const base: CravingRecord = {
    id: "multiple",
    date: DATE,
    time: "10:15",
    situation:
      "Een volledige synthetische situatie.\nDe tweede regel blijft leesbaar.",
    thought: "Een synthetische gedachte.",
    bodySensation: "Gespannen schouders.",
    emotion: "Onrustig.",
    behavior: "Een glas water gepakt en een pauze genomen.",
  };
  state.cravings = [
    { ...base, substances: selected },
    { ...base, id: "legacy", time: "09:15", substance: "Cannabis" },
    { ...base, id: "unknown", time: "08:15" },
    { ...base, id: "whitespace", time: "07:15", substance: "   " },
  ];
  state.goals = [
    {
      id: "goal",
      name: "Nicotine",
      target: "Nicotine",
      direction: "Stoppen",
      note: "",
    },
  ];
  validateState(state);
  return state;
}

const snapshot = (page: Page) =>
  page.evaluate(
    ([data, drafts]) => ({
      data: localStorage.getItem(data),
      drafts: localStorage.getItem(drafts),
    }),
    [STORAGE_KEY, DRAFT_STORAGE_KEY],
  );

async function open(page: Page, route: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00+02:00`));
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: fixture() },
  );
  await page.goto(`./#/${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}

const record = (page: Page, id: string) =>
  page.locator(`[data-history-id="${id}"]`);

test("Vandaag toont alle gekozen middelen en een oud enkel middel zonder registraties te veranderen", async ({
  page,
}, testInfo) => {
  await open(page, "today");
  const before = await snapshot(page);
  const rows = page.locator(".dp-timeline > li");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText(
    `Middelen of gedrag: ${selected.join(", ")}`,
  );
  await expect(rows.nth(1)).toContainText("Middel of gedrag: Cannabis");
  await expect(rows.nth(2)).not.toContainText("Middel of gedrag:");
  await expect(rows.nth(3)).not.toContainText("Middel of gedrag:");
  await expect(page.locator(".dp-timeline")).not.toContainText("Nicotine");
  await expect(rows.locator("img, script")).toHaveCount(0);
  await rows.first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("multiple-substances-today-390-ocean.png"),
  });
  expect(await snapshot(page)).toEqual(before);
});

test("elk gekozen middel is doorzoekbaar en de uitgeklapte registratie toont de volledige lijst en antwoorden", async ({
  page,
}) => {
  await open(page, "history");
  const before = await snapshot(page);
  await applyHistoryFilters(page, { kind: "craving" });
  for (const query of ["alcohol", "COCAINE", "3-mmc", "onerror"]) {
    await applyHistoryFilters(page, { query });
    await expect(page.locator(".dp-history-record")).toHaveCount(1);
    await expect(record(page, "multiple").locator("summary")).toContainText(
      `Middelen of gedrag: ${selected.join(", ")}`,
    );
  }
  const multi = record(page, "multiple");
  await multi.locator("summary").click();
  const values = multi.locator(".dp-history-fields dd");
  await expect(values.first()).toHaveText(selected.join("\n"));
  const original = fixture().cravings[0];
  for (const answer of [
    original.situation,
    original.thought,
    original.bodySensation,
    original.emotion,
    original.behavior,
  ]) {
    await expect(multi.locator(".dp-history-body")).toContainText(answer);
  }
  await applyHistoryFilters(page, { query: "Cannabis" });
  await expect(page.locator(".dp-history-record")).toHaveCount(1);
  await expect(record(page, "legacy").locator("summary")).toContainText(
    "Middel of gedrag: Cannabis",
  );
  await applyHistoryFilters(page, { query: "" });
  await expect(record(page, "unknown").locator("summary")).toContainText(
    "Middel of gedrag: Niet ingevuld",
  );
  await expect(record(page, "whitespace").locator("summary")).toContainText(
    "Middel of gedrag: Niet ingevuld",
  );
  expect(await snapshot(page)).toEqual(before);
});

test("weekoverzicht toont meerdere en historische middelen en opent dezelfde volledige registratie", async ({
  page,
}) => {
  await open(page, "history");
  const before = await snapshot(page);
  await applyHistoryFilters(page, { period: "week" });
  await openHistoryWeek(page);
  const week = page.getByRole("region", {
    name: "Rustig terugkijken op je week",
  });
  await week.locator("summary").filter({ hasText: "14 oktober 2026" }).click();
  await expect(week).toContainText(
    `Middelen of gedrag: ${selected.join(", ")}`,
  );
  await expect(week).toContainText("Middel of gedrag: Cannabis");
  await expect(week).toContainText("Middel of gedrag: niet ingevuld");
  await week
    .getByRole("button", {
      name: "Bekijk craving van 14 oktober 2026 om 10:15",
      exact: true,
    })
    .click();
  await expect(record(page, "multiple").locator("details")).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    record(page, "multiple").locator(".dp-history-fields dd").first(),
  ).toHaveText(selected.join("\n"));
  expect(await snapshot(page)).toEqual(before);
});

test("meerdere lange middelen blijven volledige veilige tekst op een klein scherm met grote letters", async ({
  page,
}, testInfo) => {
  await open(page, "today");
  const before = await snapshot(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
  const todayNames = page
    .locator(".dp-timeline > li")
    .first()
    .locator(".anchor-prose");
  await expect(todayNames).toHaveText(
    `Middelen of gedrag: ${selected.join(", ")}`,
  );
  const todayBounds = await todayNames.evaluate((el) => ({
    width: el.clientWidth,
    scrollWidth: el.scrollWidth,
    height: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
  expect(todayBounds.scrollWidth).toBeLessThanOrEqual(todayBounds.width + 1);
  expect(todayBounds.scrollHeight).toBeLessThanOrEqual(todayBounds.height + 1);
  await page
    .locator(".dp-bottom-nav")
    .getByRole("link", { name: "Terugkijken", exact: true })
    .click();
  const multi = record(page, "multiple");
  await multi.locator("summary").click();
  await expect(multi.locator("img, script")).toHaveCount(0);
  const bounds = await multi.evaluate((el) => ({
    viewport: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    values: [...el.querySelectorAll(".dp-history-preview, dd")].map(
      (value) => ({
        width: value.clientWidth,
        scrollWidth: value.scrollWidth,
        height: value.clientHeight,
        scrollHeight: value.scrollHeight,
      }),
    ),
  }));
  expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewport);
  for (const value of bounds.values) {
    expect(value.scrollWidth).toBeLessThanOrEqual(value.width + 1);
    expect(value.scrollHeight).toBeLessThanOrEqual(value.height + 1);
  }
  await multi.locator(".dp-history-fields dd").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("multiple-substances-320-large-text.png"),
  });
  expect(await snapshot(page)).toEqual(before);
});
