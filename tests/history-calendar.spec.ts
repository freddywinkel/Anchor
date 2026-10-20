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
  openHistoryFilters,
} from "./history-filters";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const UNRELATED = "synthetic.calendar.keep";
const DATE = "2026-10-20";
const morningNote =
  "Synthetische ochtendnotitie.\nIk hoef niet alles te verklaren voordat ik een kleine keuze maak.\nDe laatste zin blijft volledig zichtbaar.";
const dayNote = "Mijn volledige dag.\nOok de laatste regel hoort bij deze dag.";
const growthNotes = [
  "Ik nam vandaag rust.\nDat was een passende keuze.",
  "Ik gaf een grens aan.\nDeze laatste regel blijft zichtbaar.",
];
const cravingText = (label: string) =>
  `${label}: een eigen eerste regel.\n${"Een volledige synthetische zin zonder afkappen.\n".repeat(8)}Laatste regel ${label}.`;
const errors = new WeakMap<Page, string[]>();

function moment(id: string, changes: Partial<Moment> = {}): Moment {
  return {
    id,
    date: DATE,
    time: "09:05",
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Synthetische eigen notitie.",
    ...changes,
  };
}

function craving(
  id: string,
  changes: Partial<CravingRecord> = {},
): CravingRecord {
  return {
    id,
    date: DATE,
    time: "13:20",
    substances: ["Cocaine", "3-MMC"],
    situation: cravingText("Situatie"),
    thought: cravingText("Gedachte"),
    bodySensation: cravingText("Lichaam"),
    emotion: cravingText("Emotie"),
    behavior: cravingText("Gedrag"),
    ...changes,
  };
}

function fixture(): AppState {
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  state.moments = [
    moment("calendar-morning", {
      before: {
        mood: 0,
        eis: null,
        emotionRatings: [
          { id: "zero", label: "Nerveus", intensity: 0 },
          { id: "unknown", label: "Rustig", intensity: null },
        ],
      },
      note: morningNote,
    }),
    moment("calendar-evening", { time: "18:10", note: "Een later moment." }),
    moment("calendar-overnight", {
      date: "2026-10-19",
      time: "23:40",
      before: { mood: -1, eis: null },
      after: {
        mood: 1,
        eis: null,
        emotionRatings: [{ id: "after", label: "Nerveus", intensity: 35 }],
      },
      afterDate: DATE,
      afterTime: "08:45",
      activity: "Rust nemen",
      attempted: true,
      note: "De oorspronkelijke check-in van gisteren blijft bewaard.",
    }),
    moment("calendar-after-only", {
      date: "2026-10-15",
      time: "13:00",
      after: { mood: null, eis: null },
      afterDate: "2026-10-16",
      afterTime: "15:45",
    }),
  ];
  state.cravings = [
    craving("calendar-craving"),
    craving("calendar-other", {
      date: "2026-10-17",
      time: "11:30",
      substances: ["Alcohol"],
    }),
    craving("calendar-previous-month", {
      date: "2026-09-30",
      time: "10:30",
    }),
    craving("calendar-leap", { date: "2024-02-29", time: "17:00" }),
  ];
  state.days = [
    {
      date: DATE,
      ratings: { mood: null, eis: null },
      sleepHours: "0",
      sleepMinutes: "",
      note: dayNote,
    },
    {
      date: "2026-10-14",
      ratings: { mood: null, eis: null },
      sleepHours: "",
      sleepMinutes: "",
      note: "Een dagoverzicht zonder andere momenten.",
    },
  ];
  state.growth = [
    ...growthNotes.map((text, index) => ({
      id: `calendar-growth-${index}`,
      date: DATE,
      text,
      favorite: false,
    })),
    {
      id: "calendar-growth-only-day",
      date: "2026-10-18",
      text: "Een klein moment op een dag zonder andere registraties.",
      favorite: true,
    },
  ];
  return state;
}

const pending = {
  "craving:new": craving("calendar-unrelated-draft", {
    date: "2026-10-21",
    thought: "Dit cravingconcept blijft exact behouden.",
  }),
  "moment:calendar-pending": moment("calendar-pending", {
    date: "2026-10-21",
    time: "",
    after: { mood: 0, eis: null },
    afterDate: "2026-10-22",
    afterTime: "",
    note: "Een onvolledige nameting in een concept maakt geen kalenderpunt.",
  }),
};

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Maandkalender", exact: true });
const dateButton = (page: Page, date = DATE) =>
  calendar(page).locator(`[data-calendar-date="${date}"]`);
const timeline = (page: Page, label = "20 oktober 2026") =>
  page.getByRole("region", { name: `Tijdlijn van ${label}`, exact: true });
const event = (page: Page, kind: string, time?: string, label?: string) =>
  timeline(page, label).locator(
    `[data-timeline-kind="${kind}"]${time === undefined ? "" : `[data-timeline-time="${time}"]`}`,
  );
const snapshot = (page: Page) =>
  page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    [DATA, DRAFTS, UNRELATED],
  );
const saved = (page: Page): Promise<AppState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DATA);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function seed(
  page: Page,
  state = fixture(),
  clock = `${DATE}T12:00:00+02:00`,
) {
  validateState(state);
  await page.clock.setFixedTime(new Date(clock));
  await page.addInitScript(
    ({ state, pending, DATA, DRAFTS, UNRELATED }) => {
      if (!localStorage.getItem(DATA))
        localStorage.setItem(DATA, JSON.stringify(state));
      if (!localStorage.getItem(DRAFTS))
        localStorage.setItem(
          DRAFTS,
          JSON.stringify({ version: 1, records: pending }),
        );
      if (!localStorage.getItem(UNRELATED))
        localStorage.setItem(UNRELATED, "Dit blijft behouden.");
      const originalSet = Storage.prototype.setItem;
      const originalRemove = Storage.prototype.removeItem;
      const writes: string[] = [];
      (window as Window & { calendarWrites?: string[] }).calendarWrites =
        writes;
      Storage.prototype.setItem = function (key, value) {
        if ([DATA, DRAFTS, UNRELATED].includes(key)) writes.push(`set:${key}`);
        return originalSet.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        if ([DATA, DRAFTS, UNRELATED].includes(key))
          writes.push(`remove:${key}`);
        return originalRemove.call(this, key);
      };
    },
    { state, pending, DATA, DRAFTS, UNRELATED },
  );
  await page.goto("./#/history");
  await expect(calendar(page)).toBeVisible();
}

async function selectDate(page: Page, date = DATE, label = "20 oktober 2026") {
  await dateButton(page, date).click();
  await expect(dateButton(page, date)).toHaveAttribute("aria-pressed", "true");
  await expect(timeline(page, label)).toBeVisible();
}

async function expand(row: Locator) {
  const details = row.locator("details").first();
  if ((await details.count()) && !(await details.evaluate((node) => node.open)))
    await row.locator("summary").first().click();
}

async function expectNoWrites(page: Page, before: (string | null)[]) {
  expect(await snapshot(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => (window as Window & { calendarWrites?: string[] }).calendarWrites,
    ),
  ).toEqual([]);
}

test("de kalender markeert alle opgeslagen soorten en nametingen op hun eigen datum en laat concepten buiten beschouwing", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await expect(
    calendar(page).getByRole("heading", { name: "oktober 2026", exact: true }),
  ).toBeVisible();
  await expect(calendar(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(dateButton(page)).toHaveAttribute("aria-current", "date");
  for (const [date, total] of [
    ["2026-10-14", 1],
    ["2026-10-15", 1],
    ["2026-10-16", 1],
    ["2026-10-17", 1],
    ["2026-10-18", 1],
    ["2026-10-19", 1],
    [DATE, 7],
    ["2026-10-21", 0],
    ["2026-10-22", 0],
  ] as const)
    await expect(dateButton(page, date)).toHaveAttribute(
      "data-calendar-records",
      String(total),
    );
  await expect(
    page.getByRole("heading", { name: "Registraties", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-history-kind="moment"]')).toBeVisible();
  await expectNoWrites(page, before);
});

test("de gekozen dag toont tijden van nieuw naar oud, volledige craving en check-in en ongetimede notities zonder verzonnen middernacht", async ({
  page,
}) => {
  const state = fixture();
  await seed(page, state);
  const before = await snapshot(page);
  await selectDate(page);
  const timed = await timeline(page)
    .locator('[data-timeline-time]:not([data-timeline-time=""])')
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.getAttribute("data-timeline-kind"),
        row.getAttribute("data-timeline-time"),
      ]),
    );
  expect(timed).toEqual([
    ["checkin", "18:10"],
    ["craving", "13:20"],
    ["checkin", "09:05"],
    ["after", "08:45"],
  ]);
  const cravingRow = event(page, "craving", "13:20");
  await expect(cravingRow).toContainText("Cocaine");
  await expect(cravingRow).toContainText("3-MMC");
  await expand(cravingRow);
  for (const text of [
    state.cravings[0].situation,
    state.cravings[0].thought,
    state.cravings[0].bodySensation,
    state.cravings[0].emotion,
    state.cravings[0].behavior,
  ])
    await expect(cravingRow).toContainText(text);
  const checkin = event(page, "checkin", "09:05");
  await expand(checkin);
  await expect(checkin).toContainText(morningNote);
  await expect(checkin).toContainText("Neutraal");
  await expect(checkin).toContainText("0/100");
  await expect(checkin).toContainText("niet ingevuld");
  const after = event(page, "after", "08:45");
  await expect(after).toContainText("Nameting");
  await expect(after.locator("summary")).toContainText("20 oktober 2026");
  await expect(after).toContainText("08:45");
  await expand(after);
  await expect(after).toContainText("Rust nemen");
  await expect(after).toContainText("35/100");
  await expect(after).toContainText("19 oktober 2026 · 23:40");
  await expect(
    timeline(page).getByRole("heading", { name: "Over deze dag", exact: true }),
  ).toBeVisible();
  const untimed = timeline(page).locator('[data-timeline-time=""]');
  await expect(untimed).toHaveCount(3);
  for (const row of await untimed.all()) {
    await expect(row).toContainText("Tijdstip niet vastgelegd");
    await expand(row);
    await expect(row).not.toContainText("00:00");
  }
  await expect(event(page, "day")).toContainText(dayNote);
  for (const note of growthNotes)
    await expect(timeline(page)).toContainText(note);
  await expectNoWrites(page, before);
});

test("een dag met alleen een nameting toont die eigen dag en een lege dag krijgt geen registratie uit een concept", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDate(page, "2026-10-16", "16 oktober 2026");
  await expect(
    timeline(page, "16 oktober 2026").locator("[data-timeline-kind]"),
  ).toHaveCount(1);
  await expect(event(page, "after", "15:45", "16 oktober 2026")).toContainText(
    "Nameting",
  );
  await selectDate(page, "2026-10-21", "21 oktober 2026");
  await expect(
    timeline(page, "21 oktober 2026").locator("[data-timeline-kind]"),
  ).toHaveCount(0);
  await expect(timeline(page, "21 oktober 2026")).toContainText(
    /geen|niets|nog niet|leeg/i,
  );
  await expectNoWrites(page, before);
});

test("ook een app met uitsluitend een klein moment kan die dag openen en de volledige tekst teruglezen", async ({
  page,
}) => {
  const state = createEmptyState();
  state.growth = [
    { id: "growth-only", date: DATE, text: growthNotes[0], favorite: false },
  ];
  await seed(page, state);
  const before = await snapshot(page);
  await expect(dateButton(page)).toHaveAttribute("data-calendar-records", "1");
  await selectDate(page);
  const row = event(page, "growth");
  await expand(row);
  await expect(row).toContainText(growthNotes[0]);
  await expect(row).toContainText("Tijdstip niet vastgelegd");
  await expect(row).not.toContainText("00:00");
  await expectNoWrites(page, before);
});

test("een dagkeuze en zoekcriteria vervangen elkaar expliciet; annuleren verandert de gekozen dag niet", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await selectDate(page);
  const draft = await openHistoryFilters(page);
  await draft
    .getByRole("searchbox", { name: "Zoeken", exact: true })
    .fill("Alcohol");
  await draft.getByRole("button", { name: "Annuleren", exact: true }).click();
  await expect(timeline(page)).toBeVisible();
  await expect(dateButton(page)).toHaveAttribute("aria-pressed", "true");
  await applyHistoryFilters(page, {
    kind: "craving",
    query: "Alcohol",
    period: "all",
  });
  await expect(timeline(page)).toHaveCount(0);
  await expect(calendar(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(
    page.locator(
      '[data-history-kind="craving"] [data-history-id="calendar-other"]',
    ),
  ).toBeVisible();
  await expect(dateButton(page)).toHaveAttribute("data-calendar-records", "7");
  await selectDate(page);
  await expectHistoryFilters(page, { kind: "all", query: "", period: "all" });
  await expect(timeline(page).locator("[data-timeline-kind]")).toHaveCount(7);
  await page
    .getByRole("button", { name: "Alle registraties", exact: true })
    .click();
  await expect(timeline(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Registraties", exact: true }),
  ).toBeFocused();
  await expect(calendar(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-history-kind="moment"]')).toBeVisible();
  await expectNoWrites(page, before);
});

test("een grote dag blijft begrensd en toont na Meer momenten alle getimede en ongetimede registraties zonder duplicaten", async ({
  page,
}) => {
  const state = createEmptyState();
  state.moments = Array.from({ length: 55 }, (_, index) =>
    moment(`large-checkin-${index}`, {
      time: `08:${String(index).padStart(2, "0")}`,
      note: `Een afzonderlijke synthetische check-in ${index}.`,
    }),
  );
  state.days = [
    {
      date: DATE,
      ratings: { mood: null, eis: null },
      sleepHours: "",
      sleepMinutes: "",
      note: "Het losse dagoverzicht blijft zonder tijdstip.",
    },
  ];
  state.growth = Array.from({ length: 54 }, (_, index) => ({
    id: `large-growth-${index}`,
    date: DATE,
    text: `Een afzonderlijk klein moment ${index}.\nDe volledige tweede regel blijft bewaard.`,
    favorite: false,
  }));
  await seed(page, state);
  const before = await snapshot(page);
  await expect(dateButton(page)).toHaveAttribute(
    "data-calendar-records",
    "110",
  );
  await selectDate(page);
  const rows = timeline(page).locator("[data-timeline-id]");
  await expect(rows).toHaveCount(50);
  await expect(timeline(page).locator(".dp-history-body")).toHaveCount(0);
  await expect(event(page, "growth")).toHaveCount(0);
  await expect(timeline(page)).toContainText(
    "Je ziet 50 van 110 registraties.",
  );
  const firstIds = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-timeline-id")),
  );
  const more = timeline(page).getByRole("button", {
    name: "Meer momenten tonen",
    exact: true,
  });
  await more.click();
  await expect(rows).toHaveCount(100);
  await expect(rows.nth(50).locator("summary").first()).toBeFocused();
  await expect(timeline(page)).toContainText(
    "Je ziet 100 van 110 registraties.",
  );
  await expect(
    timeline(page).getByRole("heading", { name: "Over deze dag", exact: true }),
  ).toBeVisible();
  expect(
    await rows.evaluateAll((elements) =>
      elements
        .slice(0, 50)
        .map((element) => element.getAttribute("data-timeline-id")),
    ),
  ).toEqual(firstIds);
  await more.click();
  await expect(rows).toHaveCount(110);
  await expect(rows.nth(100).locator("summary").first()).toBeFocused();
  await expect(more).toHaveCount(0);
  await expect(event(page, "checkin")).toHaveCount(55);
  await expect(event(page, "growth")).toHaveCount(54);
  await expect(event(page, "day")).toHaveCount(1);
  await expect(timeline(page).locator(".dp-history-body")).toHaveCount(0);
  const finalIds = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-timeline-id")),
  );
  expect(new Set(finalIds).size).toBe(110);
  expect([...finalIds].sort()).toEqual(
    [
      ...state.moments.map((item) => `checkin:${item.id}`),
      `day:${DATE}`,
      ...state.growth.map((item) => `growth:${item.id}`),
    ].sort(),
  );
  await expand(rows.last());
  await expect(rows.last()).toContainText(
    "De volledige tweede regel blijft bewaard.",
  );
  await expectNoWrites(page, before);
});

test("maandknoppen passeren de jaargrens en Deze maand keert terug zonder gegevens te wijzigen", async ({
  page,
}) => {
  await seed(page, fixture(), "2025-01-15T12:00:00+01:00");
  const before = await snapshot(page);
  await calendar(page)
    .getByRole("button", { name: "Vorige maand", exact: true })
    .click();
  await expect(
    calendar(page).getByRole("heading", { name: "december 2024", exact: true }),
  ).toBeVisible();
  await calendar(page)
    .getByRole("button", { name: "Volgende maand", exact: true })
    .click();
  await expect(
    calendar(page).getByRole("heading", { name: "januari 2025", exact: true }),
  ).toBeVisible();
  await calendar(page)
    .getByRole("button", { name: "Volgende maand", exact: true })
    .click();
  await expect(
    calendar(page).getByRole("heading", { name: "februari 2025", exact: true }),
  ).toBeVisible();
  await expect(dateButton(page, "2025-02-29")).toHaveCount(0);
  await calendar(page)
    .getByRole("button", { name: "Deze maand", exact: true })
    .click();
  await expect(
    calendar(page).getByRole("heading", { name: "januari 2025", exact: true }),
  ).toBeVisible();
  await expectNoWrites(page, before);
});

test("kalendertoetsen bewegen focus over schrikkeldag, weken, maanden en jaren en selecteren pas met Enter of Spatie", async ({
  page,
}) => {
  await seed(page, fixture(), "2024-02-20T12:00:00+01:00");
  const before = await snapshot(page);
  await expect(dateButton(page, "2024-02-29")).toHaveAttribute(
    "data-calendar-records",
    "1",
  );
  await dateButton(page, "2024-02-28").focus();
  await page.keyboard.press("ArrowRight");
  await expect(dateButton(page, "2024-02-29")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dateButton(page, "2024-03-01")).toBeFocused();
  await dateButton(page, "2024-03-31").focus();
  await page.keyboard.press("PageUp");
  await expect(dateButton(page, "2024-02-29")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(dateButton(page, "2024-02-26")).toBeFocused();
  await page.keyboard.press("End");
  await expect(dateButton(page, "2024-03-03")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(dateButton(page, "2024-02-25")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dateButton(page, "2024-03-03")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(dateButton(page, "2024-04-03")).toBeFocused();
  await page.keyboard.press("Shift+PageUp");
  await expect(dateButton(page, "2023-04-03")).toBeFocused();
  await page.keyboard.press("Shift+PageDown");
  await expect(dateButton(page, "2024-04-03")).toBeFocused();
  await expect(calendar(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(timeline(page, "3 april 2024")).toBeVisible();
  await expect(dateButton(page, "2024-04-03")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dateButton(page, "2024-04-04").focus();
  await page.keyboard.press("Space");
  await expect(timeline(page, "4 april 2024")).toBeVisible();
  await expect(dateButton(page, "2024-04-04")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoWrites(page, before);
});

test("een registratie bewerken keert terug naar dezelfde geselecteerde dag en bewaart andere concepten", async ({
  page,
}) => {
  await seed(page);
  const before = await saved(page);
  const draftsBefore = (await snapshot(page))[1];
  await selectDate(page);
  const row = event(page, "craving", "13:20");
  await expand(row);
  await row.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await expect(page).toHaveURL(
    /#\/craving\/calendar-craving\?returnTo=history$/,
  );
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Een bewaarde wijziging vanuit mijn gekozen dag.");
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(timeline(page)).toBeVisible();
  await expect(dateButton(page)).toHaveAttribute("aria-pressed", "true");
  await expand(event(page, "craving", "13:20"));
  await expect(event(page, "craving", "13:20")).toContainText(
    "Een bewaarde wijziging vanuit mijn gekozen dag.",
  );
  const after = await saved(page);
  expect(after.moments).toEqual(before.moments);
  expect(after.days).toEqual(before.days);
  expect(after.growth).toEqual(before.growth);
  expect(after.cravings).toEqual(
    before.cravings.map((item) =>
      item.id === "calendar-craving"
        ? {
            ...item,
            thought: "Een bewaarde wijziging vanuit mijn gekozen dag.",
          }
        : item,
    ),
  );
  expect(JSON.parse((await snapshot(page))[1]!)).toEqual(
    JSON.parse(draftsBefore!),
  );
});

test("een verplaatste registratie laat de maand en gekozen dag staan en brengt focus naar de dagkop", async ({
  page,
}) => {
  await seed(page);
  const draftsBefore = (await snapshot(page))[1];
  await calendar(page)
    .getByRole("button", { name: "Vorige maand", exact: true })
    .click();
  await selectDate(page, "2026-09-30", "30 september 2026");
  const row = event(page, "craving", "10:30", "30 september 2026");
  await expand(row);
  await row.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await page.getByLabel("Datum", { exact: true }).fill("2026-09-29");
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(timeline(page, "30 september 2026")).toBeVisible();
  await expect(
    calendar(page).getByRole("heading", {
      name: "september 2026",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dateButton(page, "2026-09-30")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    timeline(page, "30 september 2026").locator("[data-timeline-kind]"),
  ).toHaveCount(0);
  await expect(
    timeline(page, "30 september 2026").getByRole("heading").first(),
  ).toBeFocused();
  await expect(dateButton(page, "2026-09-29")).toHaveAttribute(
    "data-calendar-records",
    "1",
  );
  expect(JSON.parse((await snapshot(page))[1]!)).toEqual(
    JSON.parse(draftsBefore!),
  );
});

test("een alleen-lezen-tab kan kalender en volledige dagdetails gebruiken zonder markeringen of gegevens te wijzigen", async ({
  page,
  context,
}) => {
  await seed(page);
  const before = await snapshot(page);
  const reader = await context.newPage();
  const readerErrors: string[] = [];
  reader.on("pageerror", (error) => readerErrors.push(error.message));
  await reader.goto("./#/history");
  await expect(calendar(reader)).toBeVisible();
  await selectDate(reader);
  const row = event(reader, "craving", "13:20");
  await expand(row);
  await expect(row).toContainText(fixture().cravings[0].behavior);
  await expect(
    row.getByRole("button", { name: "Gebruikt aangeven", exact: true }),
  ).toBeDisabled();
  await expect(dateButton(reader)).toBeEnabled();
  await calendar(reader)
    .getByRole("button", { name: "Vorige maand", exact: true })
    .click();
  await expect(
    calendar(reader).getByRole("heading", {
      name: "september 2026",
      exact: true,
    }),
  ).toBeVisible();
  expect(await snapshot(reader)).toEqual(before);
  expect(readerErrors).toEqual([]);
  await reader.close();
  await expectNoWrites(page, before);
});

test("kalender, gekozen dag en volledige notities blijven offline bereikbaar na herladen zonder opslag te wijzigen", async ({
  page,
  context,
}) => {
  await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await snapshot(page);
  await context.setOffline(true);
  await page.reload();
  await expect(calendar(page)).toBeVisible();
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`uncached-calendar-${crypto.randomUUID()}.txt`, {
          cache: "no-store",
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await selectDate(page);
  await expand(event(page, "checkin", "09:05"));
  await expect(event(page, "checkin", "09:05")).toContainText(morningNote);
  await calendar(page)
    .getByRole("button", { name: "Vorige maand", exact: true })
    .click();
  await selectDate(page, "2026-09-30", "30 september 2026");
  await expand(event(page, "craving", "10:30", "30 september 2026"));
  await expect(
    event(page, "craving", "10:30", "30 september 2026"),
  ).toContainText(fixture().cravings[2].thought);
  await expectNoWrites(page, before);
});

for (const theme of ["light", "dark"] as const) {
  test(`de kalender en uitgeklapte dag blijven leesbaar op 320 px met 200% tekst in ${theme}`, async ({
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
    await selectDate(page);
    const row = event(page, "craving", "13:20");
    await expand(row);
    await expect(row).toContainText(state.cravings[0].thought);
    const answer = row.getByText(state.cravings[0].thought, { exact: true });
    expect(
      await answer.evaluate((element) => ({
        width: element.scrollWidth <= element.clientWidth + 1,
        height: element.scrollHeight <= element.clientHeight + 1,
        clamp: getComputedStyle(element).webkitLineClamp,
      })),
    ).toEqual({ width: true, height: true, clamp: "none" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await calendar(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await calendar(page).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`calendar-320-200-${theme}.png`),
    });
    await answer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`timeline-320-200-${theme}.png`),
    });
    await expectNoWrites(page, before);
  });
}
