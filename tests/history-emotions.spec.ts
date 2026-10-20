import { expect, test, type Locator, type Page } from "@playwright/test";
import { applyHistoryFilters, openHistoryChart } from "./history-filters";
import {
  createEmptyState,
  type AppState,
  type Moment,
} from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const testDate = "2026-10-12";

function moment(id: string, values: Partial<Moment> = {}): Moment {
  return {
    id,
    date: testDate,
    time: "10:00",
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "",
    ...values,
  };
}

async function openHistory(page: Page, state: AppState) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: DATA_KEY, value: state },
  );
  await page.goto("./#/history");
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await applyHistoryFilters(page, { period: "all" });
  await expandVisible(page);
}

async function expandVisible(page: Page) {
  for (const summary of await page
    .locator(".dp-history-list details > summary")
    .all())
    if (
      !(await summary.evaluate(
        (element) => (element.parentElement as HTMLDetailsElement).open,
      ))
    )
      await summary.click();
}

function ratingRow(record: Locator, label: string) {
  return record
    .getByRole("group", { name: "Gevoel en intensiteit" })
    .locator("p")
    .filter({
      has: record.page().getByText(label, { exact: true }),
    });
}

test("geschiedenis koppelt alleen dezelfde emotie en houdt nul, leeg, pannetjes en oude EIS afzonderlijk", async ({
  page,
}) => {
  const state = createEmptyState();
  state.moments = [
    moment("named-emotions", {
      activity: "Wandelen",
      before: {
        mood: -1,
        eis: null,
        pans: 4,
        emotionRatings: [
          { id: "unrest", label: "Onrustig", intensity: 80 },
          { id: "anger", label: "Boos", intensity: 0 },
          { id: "fear", label: "Bang", intensity: null },
          { id: "changed-label", label: "Verdrietig", intensity: 70 },
          { id: "old-calm", label: "Rustig", intensity: 40 },
        ],
      },
      after: {
        mood: null,
        eis: null,
        pans: null,
        emotionRatings: [
          { id: "new-calm", label: "Rustig", intensity: 90 },
          { id: "changed-label", label: "Hoopvol", intensity: 50 },
          { id: "anger", label: "Boos", intensity: null },
          { id: "unrest", label: "onrustig", intensity: 20 },
          { id: "relief", label: "Opgelucht", intensity: 60 },
        ],
      },
      afterDate: testDate,
      afterTime: "10:30",
      attempted: true,
    }),
    moment("legacy-emotions", {
      activity: "Rustig zitten",
      before: { mood: null, eis: 65 },
      after: { mood: null, eis: 0 },
      afterDate: testDate,
      afterTime: "11:00",
      emotions: ["Moe"],
    }),
  ];
  await openHistory(page, state);
  const named = page.locator('[data-history-id="named-emotions"]');
  await expect(ratingRow(named, "Onrustig")).toContainText(
    "Vóór: 80/100 · Na: 20/100",
  );
  await expect(ratingRow(named, "Boos")).toContainText(
    "Vóór: 0/100 · Na: niet ingevuld",
  );
  await expect(ratingRow(named, "Bang")).toContainText(
    "Vóór: niet ingevuld · Na: niet ingevuld",
  );
  await expect(ratingRow(named, "Verdrietig")).toContainText(
    "Vóór: 70/100 · Na: niet ingevuld",
  );
  await expect(ratingRow(named, "Hoopvol")).toContainText(
    "Vóór: niet ingevuld · Na: 50/100",
  );
  await expect(ratingRow(named, "Rustig")).toHaveCount(2);
  await expect(ratingRow(named, "Rustig").nth(0)).toContainText(
    "Vóór: 40/100 · Na: niet ingevuld",
  );
  await expect(ratingRow(named, "Rustig").nth(1)).toContainText(
    "Vóór: niet ingevuld · Na: 90/100",
  );
  await expect(ratingRow(named, "Opgelucht")).toContainText(
    "Vóór: niet ingevuld · Na: 60/100",
  );
  await expect(ratingRow(named, "Pannetjes")).toContainText(
    "Vóór: 4/5 · Na: niet ingevuld",
  );
  await expect(
    named.getByText("Intensiteit — emotie niet gekoppeld", { exact: true }),
  ).toHaveCount(0);

  const legacy = page.locator('[data-history-id="legacy-emotions"]');
  await expect(
    ratingRow(legacy, "Intensiteit — emotie niet gekoppeld"),
  ).toContainText("Vóór: 65/100 · Na: 0/100");
  await expect(
    legacy
      .locator("dl > div")
      .filter({
        has: page.getByText("Emoties zonder gekoppelde score", { exact: true }),
      })
      .locator("dd"),
  ).toHaveText("Moe");
  await expect(ratingRow(legacy, "Moe")).toHaveCount(0);
  await expect(ratingRow(legacy, "Pannetjes")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: /^1 stemmingsmetingen/ }),
  ).toHaveCount(0);
  await openHistoryChart(page);
  await expect(
    page.getByRole("img", { name: /^1 stemmingsmetingen/ }),
  ).toBeVisible();
  await expect(page.locator(".dp-mood-plot circle")).toHaveCount(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      DATA_KEY,
    ),
  ).toEqual(state);
});

test("zoeken vindt emoties uit beide metingen en de dag, zonder intensiteit als stemming te tekenen", async ({
  page,
}) => {
  const state = createEmptyState();
  state.moments = [
    moment("both-measurements", {
      before: {
        mood: 0,
        eis: null,
        emotionRatings: [
          { id: "custom-before", label: "Overprikkeld", intensity: 75 },
        ],
      },
      after: {
        mood: null,
        eis: null,
        emotionRatings: [
          { id: "custom-after", label: "Opgelucht", intensity: 40 },
        ],
      },
      afterDate: testDate,
      afterTime: "10:20",
      activity: "Even buiten",
    }),
    moment("emotion-only", {
      before: {
        mood: null,
        eis: null,
        pans: 2,
        emotionRatings: [{ id: "joy", label: "Blij", intensity: 90 }],
      },
      note: "Zonder stemming",
    }),
  ];
  state.days = [
    {
      date: testDate,
      ratings: {
        mood: 2,
        eis: 0,
        pans: 1,
        emotionRatings: [{ id: "satisfied", label: "Tevreden", intensity: 0 }],
      },
      sleepHours: "",
      sleepMinutes: "",
      note: "Dagnotitie",
    },
  ];
  await openHistory(page, state);
  await openHistoryChart(page);
  for (const term of ["OVERPRIKKELD", "Opgelucht"]) {
    await applyHistoryFilters(page, { query: term });
    await expandVisible(page);
    await expect(page.locator(".dp-history-list > li")).toHaveCount(1);
    await expect(page.locator(".dp-history-list summary")).toContainText(
      "Even buiten",
    );
    await expect(
      page.getByRole("img", { name: /^1 stemmingsmetingen/ }),
    ).toBeVisible();
  }
  await applyHistoryFilters(page, { query: "Blij" });
  await expandVisible(page);
  await expect(page.locator(".dp-history-list > li")).toHaveCount(1);
  await expect(
    page.getByText("Zonder stemming", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dp-mood-plot circle")).toHaveCount(0);
  await expect(
    page.getByText(/Geen stemmingsscores gevonden binnen deze selectie/),
  ).toBeVisible();
  await applyHistoryFilters(page, { query: "pannetjes 2/5" });
  await expandVisible(page);
  await expect(page.locator(".dp-history-list > li")).toHaveCount(1);
  await expect(
    page.getByText("Zonder stemming", { exact: true }),
  ).toBeVisible();
  await applyHistoryFilters(page, { query: "Tevreden" });
  await expandVisible(page);
  const day = page.locator(".dp-history-list > li");
  await expect(day).toHaveCount(1);
  await expect(day.locator("summary")).toContainText("Dagoverzicht");
  await expect(ratingRow(day, "Tevreden")).toContainText("0/100");
  await expect(
    ratingRow(day, "Intensiteit — emotie niet gekoppeld"),
  ).toContainText("0/100");
  await expect(ratingRow(day, "Pannetjes")).toContainText("1/5");
  await expect(page.locator(".dp-mood-plot circle")).toHaveCount(0);
});

test("benoemde intensiteiten blijven volledig leesbaar bij 320 pixels en dubbele tekstgrootte", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  state.moments = [
    moment("narrow-history", {
      before: {
        mood: null,
        eis: 100,
        pans: 5,
        emotionRatings: [
          {
            id: "long-label",
            label: "Verdrietig en teleurgesteld na een moeilijk gesprek",
            intensity: 100,
          },
        ],
      },
      after: {
        mood: null,
        eis: null,
        pans: 3,
        emotionRatings: [
          {
            id: "long-label",
            label: "Verdrietig en teleurgesteld na een moeilijk gesprek",
            intensity: 0,
          },
        ],
      },
      afterDate: testDate,
      afterTime: "10:30",
    }),
  ];
  await openHistory(page, state);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const record = page.locator(".dp-history-list > li");
  const row = ratingRow(
    record,
    "Verdrietig en teleurgesteld na een moeilijk gesprek",
  );
  await expect(row).toContainText("Vóór: 100/100 · Na: 0/100");
  await expect(
    ratingRow(record, "Intensiteit — emotie niet gekoppeld"),
  ).toContainText("Vóór: 100/100 · Na: niet ingevuld");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  for (const paragraph of await record
    .getByRole("group", { name: "Gevoel en intensiteit" })
    .locator("p")
    .all()) {
    expect(
      await paragraph.evaluate((element) => ({
        unclamped: getComputedStyle(element).webkitLineClamp === "none",
        fitsWidth: element.scrollWidth <= element.clientWidth + 1,
        fitsHeight: element.scrollHeight <= element.clientHeight + 1,
      })),
    ).toEqual({ unclamped: true, fitsWidth: true, fitsHeight: true });
  }
  await record.screenshot({
    path: testInfo.outputPath("history-emotions-320-large-text.png"),
  });
});

test("craving-antwoorden blijven zichtbaar in de geschiedeniskaart bij grotere tekst op telefoon en tablet", async ({
  page,
}, testInfo) => {
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  state.cravings = [
    {
      id: "history-craving-reflow",
      date: testDate,
      time: "12:00",
      situation: "Een rustig testmoment",
      thought: "Ik zoek rust.",
      bodySensation: "Schouders gespannen.",
      emotion: "Onrust.",
      behavior: "Ik ging wandelen.",
    },
  ];
  await openHistory(page, state);
  await page.addStyleTag({
    content: "html { font-size: 200% !important; }",
  });
  await page.evaluate(() => document.fonts.ready);

  const record = page.locator(".dp-history-list > li");
  const values = record.locator(".dp-craving-summary dd");
  await expect(values).toHaveText([
    "Niet ingevuld",
    "Een rustig testmoment",
    "Ik zoek rust.",
    "Schouders gespannen.",
    "Onrust.",
    "Ik ging wandelen.",
  ]);
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const value of await values.all()) {
      const geometry = await value.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRects = [...range.getClientRects()];
        return {
          width: box.width,
          textHasArea: textRects.some(
            (rect) => rect.width > 0 && rect.height > 0,
          ),
          textFits: textRects.every(
            (rect) =>
              rect.left >= box.left - 1 &&
              rect.right <= box.right + 1 &&
              rect.top >= box.top - 1 &&
              rect.bottom <= box.bottom + 1,
          ),
        };
      });
      // A zero-width, clipped answer can pass a page-level overflow check.
      expect(
        geometry.width,
        `${width}px: answer has usable width`,
      ).toBeGreaterThan(50);
      expect(geometry.textHasArea, `${width}px: actual text is laid out`).toBe(
        true,
      );
      expect(geometry.textFits, `${width}px: text is not clipped`).toBe(true);
    }
    await record.screenshot({
      path: testInfo.outputPath(`history-craving-${width}-large-text.png`),
    });
  }
});
