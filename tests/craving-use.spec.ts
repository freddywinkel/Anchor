import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createEmptyState,
  parseBackup,
  type AppState,
  type CravingRecord,
} from "../src/lib/storage";
import { applyHistoryFilters } from "./history-filters";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const date = "2026-10-14";
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

function markedState(before: AppState, id: string, used: boolean): AppState {
  return {
    ...before,
    revision: before.revision + 1,
    cravings: before.cravings.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item };
      if (used) next.usedAfterCraving = true;
      else delete next.usedAfterCraving;
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
    behavior: "Mijn aangepaste beschrijving is nog een concept.",
  });
});

for (const initiallyMarked of [false, true]) {
  test(`een ouder concept ${initiallyMarked ? "met" : "zonder"} markering kan de nieuwste expliciete keuze niet terugdraaien`, async ({
    page,
  }) => {
    const initial = fixture();
    if (initiallyMarked) initial.cravings[0].usedAfterCraving = true;
    await seed(page, initial);
    await open(page, `/craving/${targetId}`);
    const note = "Niet-opgeslagen tekst uit een ouder concept.";
    await page.getByLabel("Gedachte", { exact: true }).fill(note);
    const pending = await drafts(page);
    if (initiallyMarked)
      expect(pending[`craving:${targetId}`].usedAfterCraving).toBe(true);
    else
      expect(pending[`craving:${targetId}`]).not.toHaveProperty(
        "usedAfterCraving",
      );
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
    if (initiallyMarked) expect(saved).not.toHaveProperty("usedAfterCraving");
    else expect(saved.usedAfterCraving).toBe(true);
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
  expect(backup.cravings[1]).not.toHaveProperty("usedAfterCraving");
  expect(
    backup.moments[0].before.emotionRatings?.map((item) => item.intensity),
  ).toEqual([0, null]);
  await open(page);
  await remove(await expand(page)).click();
  expect((await stored(page)).cravings[0]).not.toHaveProperty(
    "usedAfterCraving",
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
