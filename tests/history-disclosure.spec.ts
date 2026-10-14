import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createEmptyState,
  validateState,
  type AppState,
  type CravingRecord,
  type Day,
  type Moment,
} from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const date = "2024-05-20";
type Kind = "moment" | "craving" | "day";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

function moment(id: string, values: Partial<Moment> = {}): Moment {
  return {
    id,
    date,
    time: "09:05",
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
function craving(
  id: string,
  values: Partial<CravingRecord> = {},
): CravingRecord {
  return {
    id,
    date,
    time: "13:25",
    situation: "Alleen thuis na het werk.",
    thought: "Ik wil even pauze.",
    bodySensation: "Gespannen schouders.",
    emotion: "Onrust.",
    behavior: "Ik ben buiten gaan zitten.",
    ...values,
  };
}
function day(dayDate = date, values: Partial<Day> = {}): Day {
  return {
    date: dayDate,
    ratings: { mood: null, eis: null },
    sleepHours: "",
    sleepMinutes: "",
    note: "",
    ...values,
  };
}
const group = (page: Page, kind: Kind) =>
  page.locator(`.dp-history-group[data-history-kind="${kind}"]`);
const record = (page: Page, kind: Kind, id: string) =>
  group(page, kind).locator(
    `li[data-history-id="${kind === "day" ? `day-${id}` : id}"]`,
  );
const body = (entry: Locator) => entry.locator(".dp-history-body");
function field(scope: Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope
    .locator("dt")
    .filter({ hasText: new RegExp(`^${escaped}$`) })
    .locator("..")
    .locator("dd");
}
function rating(scope: Locator, label: string) {
  return scope
    .getByRole("group", { name: "Gevoel en intensiteit" })
    .locator("p")
    .filter({ has: scope.page().getByText(label, { exact: true }) });
}
async function expand(entry: Locator) {
  await entry.locator("summary").click();
  await expect(entry.locator("details")).toHaveAttribute("open", "");
  await expect(body(entry)).toBeVisible();
}
async function snapshot(page: Page) {
  return page.evaluate(
    ({ data, draft }) => ({
      data: localStorage.getItem(data),
      draft: localStorage.getItem(draft),
    }),
    { data: DATA_KEY, draft: DRAFT_KEY },
  );
}
async function openHistory(page: Page, initial: AppState) {
  validateState(initial);
  await page.addInitScript(
    ({ initial, dataKey, draftKey, pending }) => {
      localStorage.setItem(dataKey, JSON.stringify(initial));
      localStorage.setItem(
        draftKey,
        JSON.stringify({ version: 1, records: { "craving:new": pending } }),
      );
      const original = Storage.prototype.setItem;
      (window as any).__historyWrites = [];
      Storage.prototype.setItem = function (key, value) {
        if (key === dataKey || key === draftKey)
          (window as any).__historyWrites.push(key);
        return original.call(this, key, value);
      };
    },
    {
      initial,
      dataKey: DATA_KEY,
      draftKey: DRAFT_KEY,
      pending: craving("unrelated-draft", {
        thought: "Dit open concept mag niet veranderen.",
      }),
    },
  );
  await page.goto("./#/history");
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption("all");
}
async function expectUnchanged(
  page: Page,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => (window as any).__historyWrites)).toEqual(
    [],
  );
  await expect(page).toHaveURL(/#\/history$/);
}

test("Terugkijken groepeert gesloten registraties en laat meerdere details met toetsenbord lezen zonder opslag of navigatie", async ({
  page,
}) => {
  const initial = createEmptyState();
  initial.moments = [moment("shared", { note: "Check-innotitie" })];
  initial.cravings = [
    craving("shared", { substance: "Cannabis" }),
    craving("unknown", { time: "08:00" }),
  ];
  initial.days = [day(date, { note: "Dagnotitie" })];
  await openHistory(page, initial);
  const before = await snapshot(page);
  for (const [kind, heading, count] of [
    ["moment", "Check-ins", 1],
    ["craving", "Cravings", 2],
    ["day", "Dagoverzichten", 1],
  ] as const) {
    await expect(
      group(page, kind).getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(
      group(page, kind).locator(".dp-history-list > li"),
    ).toHaveCount(count);
  }
  await expect(page.locator("details.dp-history-record[open]")).toHaveCount(0);
  await expect(page.locator(".dp-history-body")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Bewerken:/ })).toHaveCount(0);
  const target = record(page, "craving", "shared");
  await expect(target.locator("summary")).toContainText("20 mei 2024");
  await expect(target.locator("summary")).toContainText("13:25");
  await expect(target.locator("summary")).toContainText(
    "Middel of gedrag: Cannabis",
  );
  await expect(
    record(page, "craving", "unknown").locator("summary"),
  ).toContainText("Middel of gedrag: Niet ingevuld");
  await target.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(target.locator("details")).toHaveAttribute("open", "");
  await expect(
    target.getByRole("button", { name: /^Bewerken: craving/ }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(target.locator("details")).not.toHaveAttribute("open", "");
  await expect(body(target)).toHaveCount(0);
  await expect(target.getByRole("button", { name: /^Bewerken:/ })).toHaveCount(
    0,
  );
  await expand(target);
  await expand(record(page, "moment", "shared"));
  await expand(record(page, "day", date));
  await expect(page.locator("details.dp-history-record[open]")).toHaveCount(3);
  await expectUnchanged(page, before);
  await target.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await expect(page).toHaveURL(/#\/craving\/shared\?returnTo=history$/);
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    initial.cravings[0].thought,
  );
  expect(await snapshot(page)).toEqual(before);
});

test("uitgeklapte craving toont alle vijf volledige meerregelige antwoorden van 4000 tekens zonder afkappen", async ({
  page,
}) => {
  const long = (name: string) => {
    const end = `\nEinde ${name}.`;
    return (
      `${name}: eerste regel.\n${"Nog een eigen zin met ruimte om terug te lezen.\n".repeat(120)}`.slice(
        0,
        4000 - end.length,
      ) + end
    );
  };
  const item = craving("long", {
    substance: "Eigen middel & gedrag",
    situation: long("Situatie"),
    thought: long("Gedachte"),
    bodySensation: long("Lichaam"),
    emotion: long("Emotie"),
    behavior: long("Gedrag"),
  });
  const initial = createEmptyState();
  initial.cravings = [item];
  await page.setViewportSize({ width: 390, height: 844 });
  await openHistory(page, initial);
  const before = await snapshot(page);
  const entry = record(page, "craving", item.id);
  await expand(entry);
  for (const [label, value] of [
    ["Middel of gedrag", item.substance!],
    ["Externe situatie (wie, wat en waar)", item.situation],
    ["Gedachte", item.thought],
    ["Lichamelijke sensatie", item.bodySensation],
    ["Emotie", item.emotion],
    ["Gedrag", item.behavior],
  ]) {
    const answer = field(body(entry), label);
    expect(await answer.textContent()).toBe(value);
    const geometry = await answer.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const panel = element
        .closest(".dp-history-body")!
        .getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        whiteSpace: style.whiteSpace,
        clamp: style.webkitLineClamp,
        usableWidth: bounds.width > 100,
        fits: [...range.getClientRects()].every(
          (r) =>
            r.left >= bounds.left - 1 &&
            r.right <= bounds.right + 1 &&
            r.top >= panel.top - 1 &&
            r.bottom <= panel.bottom + 1,
        ),
        heightFits: element.scrollHeight <= element.clientHeight + 1,
      };
    });
    expect(geometry.clamp).toBe("none");
    expect(["pre-wrap", "pre-line", "break-spaces"]).toContain(
      geometry.whiteSpace,
    );
    expect(geometry.usableWidth).toBe(true);
    expect(geometry.fits).toBe(true);
    expect(geometry.heightFits).toBe(true);
  }
  await expectUnchanged(page, before);
});

test("check-indetails behouden beide tijdstippen, onbekende antwoorden, nulmetingen, pannetjes en losstaande oude intensiteit", async ({
  page,
}) => {
  const initial = createEmptyState();
  const rich = moment("rich", {
    activity: "Buiten wandelen",
    attempted: false,
    before: {
      mood: 0,
      eis: 65,
      pans: 4,
      emotionRatings: [
        { id: "anger", label: "Boos", intensity: 0 },
        { id: "worry", label: "Onrustig", intensity: 80 },
        { id: "empty", label: "Bang", intensity: null },
      ],
    },
    after: {
      mood: -1,
      eis: 0,
      pans: 2,
      emotionRatings: [
        { id: "anger", label: "Boos", intensity: null },
        { id: "worry", label: "Onrustig", intensity: 20 },
      ],
    },
    afterDate: "2024-05-21",
    afterTime: "00:10",
    emotions: ["Moe", "Opgelucht"],
    note: "Een eigen notitie.\nEen tweede regel.",
  });
  const unknown = moment("unknown", {
    time: "08:00",
    after: { mood: null, eis: null },
    afterDate: date,
    afterTime: "08:30",
  });
  initial.moments = [rich, unknown, moment("before-only", { time: "07:00" })];
  await openHistory(page, initial);
  const before = await snapshot(page);
  const entry = record(page, "moment", rich.id);
  await expand(entry);
  const details = body(entry);
  for (const [label, value] of [
    ["Datum en tijd", "20 mei 2024 · 09:05"],
    ["Nameting", "21 mei 2024 · 00:10"],
    ["Stemming bij check-in", "Neutraal (0)"],
    ["Stemming bij nameting", "Laag (-1)"],
    ["Activiteit", "Buiten wandelen"],
    ["Activiteit geprobeerd", "Nee"],
    ["Emoties zonder gekoppelde score", "Moe, Opgelucht"],
  ])
    await expect(field(details, label)).toHaveText(value);
  expect(await field(details, "Notitie").textContent()).toBe(rich.note);
  await expect(rating(details, "Boos")).toContainText(
    "Vóór: 0/100 · Na: niet ingevuld",
  );
  await expect(rating(details, "Onrustig")).toContainText(
    "Vóór: 80/100 · Na: 20/100",
  );
  await expect(rating(details, "Bang")).toContainText(
    "Vóór: niet ingevuld · Na: niet ingevuld",
  );
  await expect(rating(details, "Pannetjes")).toContainText(
    "Vóór: 4/5 · Na: 2/5",
  );
  await expect(
    rating(details, "Intensiteit — emotie niet gekoppeld"),
  ).toContainText("Vóór: 65/100 · Na: 0/100");
  const noActivity = record(page, "moment", unknown.id);
  await expand(noActivity);
  await expect(field(body(noActivity), "Activiteit")).toHaveText(
    "Niet ingevuld",
  );
  await expect(field(body(noActivity), "Activiteit geprobeerd")).toHaveText(
    "Niet ingevuld",
  );
  await expect(field(body(noActivity), "Nameting")).toHaveText(
    "20 mei 2024 · 08:30",
  );
  await expect(field(body(noActivity), "Stemming bij nameting")).toHaveText(
    "niet ingevuld",
  );
  const only = record(page, "moment", "before-only");
  await expand(only);
  await expect(field(body(only), "Nameting")).toHaveText("Niet ingevuld");
  await expect(field(body(only), "Stemming bij nameting")).toHaveCount(0);
  await expectUnchanged(page, before);
});

test("dagoverzichten tonen nul uur en minuten los van niet ingevulde slaap en behouden volledige notities", async ({
  page,
}) => {
  const initial = createEmptyState();
  initial.days = [
    day(date, {
      sleepHours: "0",
      sleepMinutes: "0",
      note: "De hele dag.\nTweede regel van mijn dag.",
      ratings: {
        mood: 0,
        eis: 0,
        pans: 1,
        emotionRatings: [{ id: "calm", label: "Rustig", intensity: null }],
      },
    }),
    day("2024-05-19"),
    day("2024-05-18", { sleepHours: "7" }),
  ];
  await openHistory(page, initial);
  const before = await snapshot(page);
  for (const [dayDate, hours, minutes] of [
    [date, "0 uur", "0 minuten"],
    ["2024-05-19", "Niet ingevuld", "Niet ingevuld"],
    ["2024-05-18", "7 uur", "Niet ingevuld"],
  ]) {
    const entry = record(page, "day", dayDate);
    await expand(entry);
    await expect(field(body(entry), "Slaap: uren")).toHaveText(hours);
    await expect(field(body(entry), "Slaap: minuten")).toHaveText(minutes);
  }
  const details = body(record(page, "day", date));
  await expect(field(details, "Datum")).toHaveText("20 mei 2024");
  await expect(field(details, "Stemming")).toHaveText("Neutraal (0)");
  expect(await field(details, "Notitie").textContent()).toBe(
    initial.days[0].note,
  );
  await expect(rating(details, "Pannetjes")).toContainText("1/5");
  await expect(rating(details, "Rustig")).toContainText("niet ingevuld");
  await expect(
    rating(details, "Intensiteit — emotie niet gekoppeld"),
  ).toContainText("0/100");
  await expectUnchanged(page, before);
});

test("elke soort heeft eigen begrensde paginatie en filters doorzoeken ook nog niet getoonde registraties", async ({
  page,
}) => {
  const initial = createEmptyState();
  for (let i = 0; i < 120; i++) {
    const itemDate = new Date(Date.UTC(2020, 0, i + 1))
      .toISOString()
      .slice(0, 10);
    const note =
      i === 0 ? "Unieke verborgen zoekterm" : `Synthetische registratie ${i}`;
    initial.moments.push(
      moment(`moment-${i}`, {
        date: itemDate,
        note,
        before: { mood: 0, eis: null },
      }),
    );
    initial.cravings.push(
      craving(`craving-${i}`, { date: itemDate, thought: note }),
    );
    initial.days.push(day(itemDate, { note }));
  }
  await openHistory(page, initial);
  const before = await snapshot(page);
  for (const kind of ["moment", "craving", "day"] as const)
    await expect(
      group(page, kind).locator(".dp-history-list > li"),
    ).toHaveCount(50);
  await expect(page.locator(".dp-history-body")).toHaveCount(0);
  expect(await page.locator("*").count()).toBeLessThan(5000);
  await group(page, "moment")
    .getByRole("button", { name: "Meer check-ins tonen", exact: true })
    .click();
  await expect(
    group(page, "moment").locator(".dp-history-list > li"),
  ).toHaveCount(100);
  await expect(
    group(page, "craving").locator(".dp-history-list > li"),
  ).toHaveCount(50);
  await expect(group(page, "day").locator(".dp-history-list > li")).toHaveCount(
    50,
  );
  await group(page, "craving")
    .getByRole("button", { name: "Meer cravings tonen", exact: true })
    .click();
  await expect(
    group(page, "craving").locator(".dp-history-list > li"),
  ).toHaveCount(100);
  await expect(
    group(page, "moment").locator(".dp-history-list > li"),
  ).toHaveCount(100);
  await expect(group(page, "day").locator(".dp-history-list > li")).toHaveCount(
    50,
  );
  await page
    .getByRole("searchbox", { name: "Zoeken" })
    .fill("verborgen zoekterm");
  for (const kind of ["moment", "craving", "day"] as const)
    await expect(
      group(page, kind).locator(".dp-history-list > li"),
    ).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Zoeken" }).fill("");
  for (const kind of ["moment", "craving", "day"] as const)
    await expect(
      group(page, kind).locator(".dp-history-list > li"),
    ).toHaveCount(50);
  await page
    .getByRole("combobox", { name: "Soort registratie", exact: true })
    .selectOption("day");
  await expect(group(page, "day").locator(".dp-history-list > li")).toHaveCount(
    50,
  );
  await expect(group(page, "moment")).toHaveCount(0);
  await expect(group(page, "craving")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption("week");
  await expect(page.locator(".dp-history-record")).toHaveCount(0);
  await expectUnchanged(page, before);
});

for (const theme of ["light", "dark"] as const) {
  test(`uitklapbare geschiedenis blijft leesbaar bij 320 px en 200 procent tekst in ${theme}`, async ({
    page,
  }, testInfo) => {
    const initial = createEmptyState();
    initial.theme = theme;
    initial.palette = "ocean";
    initial.cravings = [
      craving("narrow", {
        substance: "Zelfgekozen middel of gedrag met een lange naam",
        thought: "Ik merkte dat ik rust wilde.\nDaarna kon ik verder kijken.",
        bodySensation:
          "Mijn schouders waren gespannen en mijn ademhaling sneller.",
      }),
    ];
    initial.moments = [
      moment("narrow", {
        before: {
          mood: null,
          eis: null,
          pans: 5,
          emotionRatings: [
            {
              id: "long",
              label: "Overprikkeld en gespannen na een drukke dag",
              intensity: 0,
            },
          ],
        },
      }),
    ];
    initial.days = [
      day(date, {
        sleepHours: "0",
        sleepMinutes: "0",
        note: "Een korte dagnotitie.",
      }),
    ];
    await page.setViewportSize({ width: 320, height: 900 });
    await openHistory(page, initial);
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "200%";
      await document.fonts.ready;
    });
    const before = await snapshot(page);
    for (const [kind, id] of [
      ["moment", "narrow"],
      ["craving", "narrow"],
      ["day", date],
    ] as const) {
      const entry = record(page, kind, id);
      await expand(entry);
      await expect(entry.locator("summary")).toBeFocused();
      for (const text of await body(entry)
        .locator("dd, .dp-entry-note")
        .all()) {
        const result = await text.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          // pre-wrap may hang an invisible trailing space outside the line.
          // Measure each visible word, including nested strong/span text.
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
          );
          const rects: DOMRect[] = [];
          let node: Node | null;
          while ((node = walker.nextNode())) {
            for (const word of (node.textContent || "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, word.index);
              range.setEnd(node, word.index + word[0].length);
              rects.push(...range.getClientRects());
            }
          }
          return {
            text: element.textContent,
            bounds: bounds.toJSON(),
            width: bounds.width,
            clamp: getComputedStyle(element).webkitLineClamp,
            fits:
              rects.length > 0 &&
              rects.every(
                (r) =>
                  r.left >= bounds.left - 1 &&
                  r.right <= bounds.right + 1 &&
                  r.top >= bounds.top - 1 &&
                  r.bottom <= bounds.bottom + 1,
              ),
          };
        });
        expect(result.width).toBeGreaterThan(80);
        expect(result.clamp).toBe("none");
        expect(result.fits, JSON.stringify(result)).toBe(true);
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    const cravingEntry = record(page, "craving", "narrow");
    await cravingEntry.locator("summary").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `history-disclosure-${theme}-320-large-text.png`,
      ),
    });
    await body(cravingEntry).locator("dd").nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`history-details-${theme}-320-large-text.png`),
    });
    await expectUnchanged(page, before);
  });
}
