import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createEmptyState,
  parseBackup,
  type AppState,
  type CravingRecord,
} from "../src/lib/storage";
import { applyHistoryFilters, openHistoryWeek } from "./history-filters";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const date = "2026-10-14";
const confirmedAt = "2026-10-14T12:00:00.000Z";
const targetId = "use-target";
const errors = new WeakMap<Page, string[]>();

function craving(id = targetId): CravingRecord {
  return {
    id,
    date,
    time: id === targetId ? "12:15" : "10:00",
    substances: ["Cocaine", "3-MMC"],
    situation: `Synthetische situatie ${id}`,
    thought: "Een oorspronkelijke gedachte.",
    bodySensation: "Spanning in mijn schouders.",
    emotion: "Nerveus\nRustig",
    behavior: "Ik bleef even zitten en belde iemand.",
  };
}

function fixture(): AppState {
  const state = createEmptyState();
  state.cravings = [craving(), craving("other-craving")];
  state.moments = [
    {
      id: "keep-moment",
      date,
      time: "09:00",
      kind: "checkin",
      before: {
        mood: 0,
        eis: null,
        emotionRatings: [
          { id: "zero", label: "Rustig", intensity: 0 },
          { id: "unknown", label: "Nerveus", intensity: null },
        ],
      },
      after: null,
      afterDate: null,
      afterTime: null,
      activity: "",
      attempted: null,
      emotions: [],
      note: "Deze check-in blijft hetzelfde.",
    },
  ];
  state.days = [
    {
      date,
      ratings: { mood: null, eis: null },
      sleepHours: "7",
      sleepMinutes: "",
      note: "Een onvolledig dagoverzicht blijft onvolledig.",
    },
  ];
  state.goals = [
    {
      id: "keep-goal",
      target: "Alcohol",
      name: "Alcohol",
      direction: "Stoppen",
      note: "Een eigen doel.",
    },
  ];
  state.growth = [
    { id: "keep-growth", date, text: "Rust genomen.", favorite: true },
  ];
  state.plan = {
    warning: "Een eigen signaal",
    action: "Een kleine stap",
    support: "Mijn eigen steuncontact",
  };
  state.theme = "light";
  state.palette = "ocean";
  return state;
}

const stored = (page: Page): Promise<AppState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DATA);
const raw = (page: Page) =>
  page.evaluate(
    ([data, drafts]) => [
      localStorage.getItem(data),
      localStorage.getItem(drafts),
      localStorage.getItem("unrelated.app"),
    ],
    [DATA, DRAFTS],
  );
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFTS,
  );
const mark = (scope: Page | Locator) =>
  scope.getByRole("button", { name: "Gebruikt aangeven", exact: true });
const remove = (scope: Page | Locator) =>
  scope.getByRole("button", { name: "Markering verwijderen", exact: true });
const record = (page: Page, id = targetId) =>
  page.locator(`[data-history-id="${id}"]`);

async function seed(page: Page, initial = fixture(), withDraft = true) {
  const records = withDraft
    ? {
        growth: {
          id: "keep-draft",
          date,
          text: "Dit andere concept blijft open.",
          favorite: false,
        },
      }
    : {};
  await page.addInitScript(
    ({ initial, records, DATA, DRAFTS }) => {
      if (!localStorage.getItem(DATA))
        localStorage.setItem(DATA, JSON.stringify(initial));
      if (!localStorage.getItem(DRAFTS))
        localStorage.setItem(DRAFTS, JSON.stringify({ version: 1, records }));
      if (!localStorage.getItem("unrelated.app"))
        localStorage.setItem("unrelated.app", "Blijft bewaard.");
    },
    { initial, records, DATA, DRAFTS },
  );
}

async function open(page: Page, route = "/history") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}

async function expand(page: Page, id = targetId) {
  const entry = record(page, id);
  if (
    !(await entry
      .locator("details")
      .first()
      .evaluate((element) => element.hasAttribute("open")))
  )
    await entry.locator("summary").click();
  return entry;
}

function markedState(
  before: AppState,
  id: string,
  used: boolean,
  timestamp = confirmedAt,
): AppState {
  return {
    ...before,
    revision: before.revision + 1,
    cravings: before.cravings.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item };
      if (used) {
        next.usedAfterCraving = true;
        next.usedConfirmedAt = timestamp;
      } else {
        delete next.usedAfterCraving;
        delete next.usedConfirmedAt;
      }
      return next;
    }),
  };
}

async function failWrites(page: Page, enabled: boolean) {
  await page.evaluate(
    ({ enabled, key }) => {
      const testWindow = window as Window & {
        restoreCravingUseWrite?: typeof Storage.prototype.setItem;
      };
      testWindow.restoreCravingUseWrite ??= Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (enabled && name === key)
          throw new DOMException(
            "Synthetische opslagfout",
            "QuotaExceededError",
          );
        return testWindow.restoreCravingUseWrite!.call(this, name, value);
      };
    },
    { enabled, key: DATA },
  );
}

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  await page.clock.setFixedTime(new Date(`${date}T14:00:00+02:00`));
  await page.setViewportSize({ width: 390, height: 844 });
});

test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test("gebruik is pas na opslaan optioneel te markeren en verwijderen betekent opnieuw onbekend", async ({
  page,
}) => {
  await seed(page);
  await open(page, "/craving/new");
  await expect(mark(page)).toHaveCount(0);
  await expect(remove(page)).toHaveCount(0);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Mijn nieuwe craving.");
  await page
    .getByLabel("Gedrag (wat deed je?)", { exact: true })
    .fill("Mijn eigen vrije beschrijving blijft staan.");
  await expect(mark(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const support = page.getByRole("region", {
    name: "Wat helpt je nu?",
    exact: true,
  });
  await expect(mark(support)).toBeVisible();
  const before = await stored(page);
  const pending = await drafts(page);
  const saved = before.cravings.at(-1)!;
  expect(saved).not.toHaveProperty("usedAfterCraving");
  expect(saved).not.toHaveProperty("usedConfirmedAt");
  await mark(support).click();
  await expect(support.getByText("Gebruikt", { exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(markedState(before, saved.id, true));
  expect(await drafts(page)).toEqual(pending);
  await remove(support).click();
  expect(await stored(page)).toEqual(
    markedState(markedState(before, saved.id, true), saved.id, false),
  );
  expect((await stored(page)).cravings.at(-1)).not.toHaveProperty(
    "usedAfterCraving",
  );
  expect((await stored(page)).cravings.at(-1)).not.toHaveProperty(
    "usedConfirmedAt",
  );
  await expect(mark(support)).toBeVisible();
  expect(await drafts(page)).toEqual(pending);
  expect((await raw(page))[2]).toBe("Blijft bewaard.");
});

test("geschiedenis toont en doorzoekt de expliciete markering zonder gedrag of andere registraties te veranderen", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await stored(page);
  const pending = await drafts(page);
  const entry = await expand(page);
  await expect(entry.locator("summary")).not.toContainText("Gebruikt");
  await mark(entry).click();
  await expect(
    entry.locator("summary").getByText("Gebruikt", { exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(markedState(before, targetId, true));
  expect(await drafts(page)).toEqual(pending);
  await applyHistoryFilters(page, { kind: "craving", query: "gebruikt" });
  await expect(page.locator("[data-history-id]")).toHaveCount(1);
  await expect(record(page)).toBeVisible();
  await remove(await expand(page)).click();
  await expect(record(page)).toHaveCount(0);
  await expect(
    page.getByText("Geen registraties gevonden", { exact: true }),
  ).toBeVisible();
  await applyHistoryFilters(page, { query: "" });
  await expect(record(page).locator("summary")).not.toContainText("Gebruikt");
  expect(await stored(page)).toEqual(
    markedState(markedState(before, targetId, true), targetId, false),
  );
  expect(await drafts(page)).toEqual(pending);
});

test("een bestaande craving uit Vandaag heeft de markeractie buiten het formulier en behoudt niet-opgeslagen eigen tekst", async ({
  page,
}) => {
  await seed(page);
  await open(page, "/today");
  await page
    .getByRole("button", { name: /^Craving/ })
    .filter({ hasText: craving().situation })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${targetId}$`));
  await expect(mark(page)).toBeVisible();
  expect(
    await mark(page).evaluate((button) => button.closest("form") === null),
  ).toBe(true);
  const before = await stored(page);
  const behavior = page.getByLabel("Gedrag (wat deed je?)", { exact: true });
  await behavior.fill("Mijn aangepaste beschrijving is nog een concept.");
  const pending = await drafts(page);
  await mark(page).click();
  expect(await stored(page)).toEqual(markedState(before, targetId, true));
  expect(await drafts(page)).toEqual(pending);
  await expect(behavior).toHaveValue(
    "Mijn aangepaste beschrijving is nog een concept.",
  );
  await page.clock.setFixedTime(new Date(`${date}T14:30:00+02:00`));
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = (await stored(page)).cravings.find(
    (item) => item.id === targetId,
  )!;
  expect(saved).toEqual({
    ...before.cravings[0],
    usedAfterCraving: true,
    usedConfirmedAt: confirmedAt,
    behavior: "Mijn aangepaste beschrijving is nog een concept.",
  });
});

for (const initiallyMarked of [false, true]) {
  test(`een ouder concept ${initiallyMarked ? "met" : "zonder"} markering kan de nieuwste expliciete keuze niet terugdraaien`, async ({
    page,
  }) => {
    const initial = fixture();
    if (initiallyMarked) {
      initial.cravings[0].usedAfterCraving = true;
      initial.cravings[0].usedConfirmedAt = "2026-10-14T10:30:00.000Z";
    }
    await seed(page, initial);
    await open(page, `/craving/${targetId}`);
    const note = "Niet-opgeslagen tekst uit een ouder concept.";
    await page.getByLabel("Gedachte", { exact: true }).fill(note);
    const pending = await drafts(page);
    if (initiallyMarked) {
      expect(pending[`craving:${targetId}`].usedAfterCraving).toBe(true);
      expect(pending[`craving:${targetId}`].usedConfirmedAt).toBe(
        initial.cravings[0].usedConfirmedAt,
      );
    } else {
      expect(pending[`craving:${targetId}`]).not.toHaveProperty(
        "usedAfterCraving",
      );
      expect(pending[`craving:${targetId}`]).not.toHaveProperty(
        "usedConfirmedAt",
      );
    }
    await page.getByRole("link", { name: "Terugkijken", exact: true }).click();
    const entry = await expand(page);
    await (initiallyMarked ? remove(entry) : mark(entry)).click();
    expect(await drafts(page)).toEqual(pending);
    await entry.getByRole("button", { name: /^Bewerken: craving/ }).click();
    await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
      note,
    );
    await page
      .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/history$/);
    const saved = (await stored(page)).cravings.find(
      (item) => item.id === targetId,
    )!;
    expect(saved.thought).toBe(note);
    expect(saved.behavior).toBe(initial.cravings[0].behavior);
    if (initiallyMarked) {
      expect(saved).not.toHaveProperty("usedAfterCraving");
      expect(saved).not.toHaveProperty("usedConfirmedAt");
    } else {
      expect(saved.usedAfterCraving).toBe(true);
      expect(saved.usedConfirmedAt).toBe(confirmedAt);
    }
    expect((await drafts(page))[`craving:${targetId}`]).toBeUndefined();
    expect((await drafts(page)).growth).toEqual(pending.growth);
    await page.reload();
    expect(
      (await stored(page)).cravings.find((item) => item.id === targetId),
    ).toEqual(saved);
  });
}

test("mislukt toevoegen of verwijderen geeft lokale feedback en bewaart alle data en concepten", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const entry = await expand(page);
  for (const action of ["add", "remove"] as const) {
    const before = await raw(page);
    await failWrites(page, true);
    await (action === "add" ? mark(entry) : remove(entry)).click();
    await expect(entry.getByRole("alert")).toBeVisible();
    expect(await raw(page)).toEqual(before);
    if (action === "add") await expect(mark(entry)).toBeVisible();
    else await expect(remove(entry)).toBeVisible();
    await failWrites(page, false);
    await (action === "add" ? mark(entry) : remove(entry)).click();
    await expect(entry.getByRole("alert")).toHaveCount(0);
    if (action === "add") await expect(remove(entry)).toBeVisible();
    else await expect(mark(entry)).toBeVisible();
  }
});

test("een nieuwere opslagrevisie blokkeert de markering zonder nieuwere gegevens te overschrijven", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const entry = await expand(page);
  const before = await stored(page);
  const pending = await drafts(page);
  const newer = {
    ...before,
    revision: before.revision + 1,
    plan: { ...before.plan, action: "Nieuwere keuze blijft behouden." },
  };
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: DATA, value: newer },
  );
  await mark(entry).click();
  await expect(entry.getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(newer);
  expect(await drafts(page)).toEqual(pending);
});

test("een tweede alleen-lezen-tab kan de markering nergens wijzigen", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  const firstEntry = await expand(page);
  await expect(mark(firstEntry)).toBeEnabled();
  const second = await context.newPage();
  second.on("pageerror", (error) => errors.get(page)!.push(error.message));
  await open(second);
  await expect(second.getByText(/^Alleen lezen\./)).toBeVisible();
  await expect(mark(await expand(second))).toBeDisabled();
  await open(second, `/craving/${targetId}`);
  await expect(mark(second)).toBeDisabled();
  await mark(firstEntry).click();
  const before = await raw(page);
  await second.reload();
  await expect(remove(second)).toBeDisabled();
  await open(second);
  await expect(remove(await expand(second))).toBeDisabled();
  expect(await raw(second)).toEqual(before);
});

test("de markering werkt offline en overleeft een back-upherstel terwijl nul, onbekend en alle andere gegevens behouden blijven", async ({
  page,
  context,
}) => {
  await seed(page, fixture(), false);
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await mark(await expand(page)).click();
  const marked = await stored(page);
  await page.reload();
  await expect(
    record(page).locator("summary").getByText("Gebruikt", { exact: true }),
  ).toBeVisible();
  const uncachedRequestFailed = await page.evaluate(async () => {
    try {
      await fetch(`uncached-craving-use-${crypto.randomUUID()}.txt`, {
        cache: "no-store",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(uncachedRequestFailed).toBe(true);
  expect(await stored(page)).toEqual(marked);
  await open(page, "/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up downloaden", exact: true })
    .click();
  const buffer = await readFile((await (await download).path())!);
  const backup = parseBackup(buffer.toString());
  expect(backup).toEqual(marked);
  expect(backup.cravings[0].usedAfterCraving).toBe(true);
  expect(backup.cravings[0].usedConfirmedAt).toBe(confirmedAt);
  expect(backup.cravings[1]).not.toHaveProperty("usedAfterCraving");
  expect(backup.cravings[1]).not.toHaveProperty("usedConfirmedAt");
  expect(
    backup.moments[0].before.emotionRatings?.map((item) => item.intensity),
  ).toEqual([0, null]);
  await open(page);
  await remove(await expand(page)).click();
  expect((await stored(page)).cravings[0]).not.toHaveProperty(
    "usedAfterCraving",
  );
  expect((await stored(page)).cravings[0]).not.toHaveProperty(
    "usedConfirmedAt",
  );
  await open(page, "/settings");
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "anchor-used-synthetic.json",
    mimeType: "application/json",
    buffer,
  });
  const safetyDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Huidige opslag downloaden", exact: true })
    .click();
  await safetyDownload;
  await page
    .getByRole("button", { name: "Gegevens vervangen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const restored = await stored(page);
  expect({ ...restored, revision: marked.revision }).toEqual(marked);
  expect((await raw(page))[2]).toBe("Blijft bewaard.");
  await context.setOffline(false);
});

test("bevestigingstijd en verstreken tijd blijven zichtbaar in Vandaag, geschiedenis, week en de opgeslagen craving", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await mark(await expand(page)).click();
  const after = await raw(page);
  const confirmation = "Bevestigd op 14 oktober 2026 om 14:00";
  const elapsed = "1 uur en 45 minuten na de craving bevestigd.";
  const entry = record(page);
  await expect(entry.locator("summary")).toContainText(confirmation);
  await expect(entry.locator("summary")).toContainText(elapsed);
  const action = entry.getByRole("group", {
    name: "Gebruik na craving",
    exact: true,
  });
  await expect(action).toContainText(confirmation);
  await expect(action).toContainText(elapsed);

  await open(page, "/today");
  const timeline = page
    .locator(".dp-timeline button")
    .filter({ hasText: craving().situation });
  await expect(timeline).toContainText(confirmation);
  await expect(timeline).toContainText(elapsed);
  await timeline.click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${targetId}$`));
  const editorAction = page.getByRole("group", {
    name: "Gebruik na craving",
    exact: true,
  });
  await expect(editorAction).toContainText(confirmation);
  await expect(editorAction).toContainText(elapsed);
  expect(
    await editorAction.evaluate((element) => element.closest("form") === null),
  ).toBe(true);

  await open(page);
  await applyHistoryFilters(page, { period: "week" });
  await openHistoryWeek(page);
  const week = page.getByRole("region", {
    name: "Rustig terugkijken op je week",
    exact: true,
  });
  await week
    .locator("summary")
    .filter({ hasText: "woensdag 14 oktober 2026" })
    .click();
  await expect(week.getByText(confirmation, { exact: true })).toBeVisible();
  await expect(week.getByText(elapsed, { exact: true })).toBeVisible();
  expect(await raw(page)).toEqual(after);
});

test("een oude markering zonder tijd blijft onbekend en krijgt geen tijd bij openen of normaal bewerken", async ({
  page,
}) => {
  const initial = fixture();
  initial.cravings[0].usedAfterCraving = true;
  await seed(page, initial);
  await open(page);
  const before = await raw(page);
  const entry = await expand(page);
  await expect(entry.locator("summary")).toContainText(
    "Bevestigingstijd niet bekend.",
  );
  await expect(
    entry.getByRole("group", { name: "Gebruik na craving", exact: true }),
  ).toContainText("Bevestigingstijd niet bekend.");
  await expect(entry).not.toContainText("Bevestigd op");
  await expect(entry).not.toContainText("na de craving bevestigd");
  expect(await raw(page)).toEqual(before);
  await open(page, "/today");
  const timeline = page
    .locator(".dp-timeline button")
    .filter({ hasText: craving().situation });
  await expect(timeline).toContainText("Bevestigingstijd niet bekend.");
  await timeline.click();
  const action = page.getByRole("group", {
    name: "Gebruik na craving",
    exact: true,
  });
  await expect(action).toContainText("Bevestigingstijd niet bekend.");
  expect(await raw(page)).toEqual(before);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Een synthetische normale tekstwijziging.");
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  const saved = (await stored(page)).cravings.find(
    (item) => item.id === targetId,
  )!;
  expect(saved.usedAfterCraving).toBe(true);
  expect(saved).not.toHaveProperty("usedConfirmedAt");
  expect(saved.thought).toBe("Een synthetische normale tekstwijziging.");
  await page.clock.setFixedTime(new Date(`${date}T17:00:00+02:00`));
  await open(page);
  await expect(record(page).locator("summary")).toContainText(
    "Bevestigingstijd niet bekend.",
  );
  expect(
    (await stored(page)).cravings.find((item) => item.id === targetId),
  ).toEqual(saved);
});

test("de bevestigingstijd verandert alleen door de markering expliciet te verwijderen en opnieuw aan te geven", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await mark(await expand(page)).click();
  const marked = await stored(page);
  expect(marked.cravings[0].usedConfirmedAt).toBe(confirmedAt);
  await page.clock.setFixedTime(new Date(`${date}T15:00:00+02:00`));
  await page.reload();
  await expect(record(page).locator("summary")).toContainText(
    "Bevestigd op 14 oktober 2026 om 14:00",
  );
  expect(await stored(page)).toEqual(marked);
  await remove(await expand(page)).click();
  expect((await stored(page)).cravings[0]).not.toHaveProperty(
    "usedConfirmedAt",
  );
  await mark(await expand(page)).click();
  const markedAgain = await stored(page);
  expect(markedAgain.cravings[0].usedConfirmedAt).toBe(
    "2026-10-14T13:00:00.000Z",
  );
  await expect(record(page).locator("summary")).toContainText(
    "Bevestigd op 14 oktober 2026 om 15:00",
  );
  await expect(record(page).locator("summary")).toContainText(
    "2 uur en 45 minuten na de craving bevestigd.",
  );
  expect(markedAgain.cravings[0].behavior).toBe(craving().behavior);
});

test("een bevestiging na middernacht toont de eigen datum en de tijd sinds de craving zonder dagen te verwarren", async ({
  page,
}) => {
  const initial = fixture();
  initial.cravings[0].date = "2026-10-13";
  initial.cravings[0].time = "23:45";
  await seed(page, initial);
  await page.clock.setFixedTime(new Date("2026-10-14T00:15:00+02:00"));
  await open(page);
  const entry = await expand(page);
  await mark(entry).click();
  expect((await stored(page)).cravings[0].usedConfirmedAt).toBe(
    "2026-10-13T22:15:00.000Z",
  );
  await expect(entry.locator("summary")).toContainText("13 oktober 2026");
  await expect(entry.locator("summary")).toContainText("23:45");
  await expect(entry.locator("summary")).toContainText(
    "Bevestigd op 14 oktober 2026 om 00:15",
  );
  await expect(entry.locator("summary")).toContainText(
    "30 minuten na de craving bevestigd.",
  );
});
