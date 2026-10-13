import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  type Day,
} from "../src/lib/storage";

const targetDate = "2026-10-12";
const otherDate = "2026-10-11";
const day = (date: string): Day => ({
  date,
  ratings: { mood: 0, eis: null },
  sleepHours: "7",
  sleepMinutes: "",
  note: `Synthetisch dagoverzicht ${date}`,
});
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_STORAGE_KEY,
  );

async function failWrites(page: Page, key: string | null) {
  await page.evaluate((key) => {
    const testWindow = window as Window & {
      originalDaySetItem?: typeof Storage.prototype.setItem;
    };
    testWindow.originalDaySetItem ??= Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Synthetische opslagfout", "QuotaExceededError");
      return testWindow.originalDaySetItem!.call(this, name, value);
    };
  }, key);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createEmptyState();
  state.days = [day(targetDate), day(otherDate)];
  state.moments = [
    {
      id: "keep-checkin",
      date: targetDate,
      time: "10:00",
      kind: "checkin",
      before: { mood: 1, eis: null },
      after: null,
      afterDate: null,
      afterTime: null,
      activity: "",
      attempted: null,
      emotions: [],
      note: "Deze check-in blijft.",
    },
  ];
  state.cravings = [
    {
      id: "keep-craving",
      date: targetDate,
      time: "11:00",
      substance: "Alcohol",
      situation: "",
      thought: "Deze craving blijft.",
      bodySensation: "",
      emotion: "",
      behavior: "",
    },
  ];
  state.growth = [
    {
      id: "keep-growth",
      date: targetDate,
      text: "Rust genomen.",
      favorite: false,
    },
  ];
  state.plan = {
    warning: "Een signaal",
    action: "Rust nemen",
    support: "Iemand spreken",
  };
  state.theme = "dark";
  const records = {
    [`day:${targetDate}`]: {
      ...day(targetDate),
      note: "Niet-opgeslagen wijziging van deze dag.",
    },
    [`day:${otherDate}`]: { ...day(otherDate), note: "Ander concept blijft." },
  };
  await page.addInitScript(
    ({ state, records, dataKey, draftKey }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(state));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, records }));
      localStorage.setItem("unrelated.app", "blijft bewaard");
    },
    { state, records, dataKey: STORAGE_KEY, draftKey: DRAFT_STORAGE_KEY },
  );
  await page.goto(`./#/day/${targetDate}`);
  await expect(
    page.getByRole("heading", { name: "Mijn hele dag", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dagoverzicht verwijderen", exact: true }),
  ).toBeEnabled();
});

test("dag verwijderen vraagt bevestiging, bewaart bij annuleren en verwijdert alleen de gekozen dag en diens concept", async ({
  page,
}) => {
  const before = await stored(page);
  const pending = await drafts(page);
  const open = page.getByRole("button", {
    name: "Dagoverzicht verwijderen",
    exact: true,
  });
  await open.click();
  const confirm = page.getByRole("alertdialog", {
    name: "Dit dagoverzicht verwijderen?",
  });
  await expect(confirm).toContainText("12 oktober 2026");
  await expect(confirm).toContainText("niet-opgeslagen wijzigingen");
  await expect(
    confirm.getByRole("button", { name: "Behouden", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(await stored(page)).toEqual(before);
  expect(await drafts(page)).toEqual(pending);
  await open.click();
  await confirm.getByRole("button", { name: "Behouden", exact: true }).click();
  await expect(open).toBeFocused();
  expect(await stored(page)).toEqual(before);
  expect(await drafts(page)).toEqual(pending);
  await open.click();
  await confirm
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const expected = {
    ...before,
    revision: before.revision + 1,
    days: [before.days[1]],
  };
  expect(await stored(page)).toEqual(expected);
  expect(await drafts(page)).toEqual({
    [`day:${otherDate}`]: pending[`day:${otherDate}`],
  });
  expect(await page.evaluate(() => localStorage.getItem("unrelated.app"))).toBe(
    "blijft bewaard",
  );
  await page.reload();
  expect(await stored(page)).toEqual(expected);
  await page.goto(`./#/day/${targetDate}`);
  await expect(
    page.getByRole("button", { name: "Dagoverzicht verwijderen", exact: true }),
  ).toHaveCount(0);
});

test("mislukte verwijdering bewaart gegevens; mislukte conceptopruiming biedt een retry zonder opnieuw te schrijven", async ({
  page,
}) => {
  const before = await stored(page);
  const pending = await drafts(page);
  await page
    .getByRole("button", { name: "Dagoverzicht verwijderen", exact: true })
    .click();
  await failWrites(page, STORAGE_KEY);
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  const failure = page
    .getByRole("alert")
    .filter({ hasText: "Je dagoverzicht en wijzigingen blijven bewaard." });
  await expect(failure).toBeFocused();
  await expect(failure).toBeInViewport();
  expect(await stored(page)).toEqual(before);
  expect(await drafts(page)).toEqual(pending);
  await failWrites(page, DRAFT_STORAGE_KEY);
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registratie verwijderd", exact: true }),
  ).toBeVisible();
  const cleanupFailure = page.getByRole("alert").filter({
    hasText:
      "Je registratie is verwijderd, maar het concept kon niet worden opgeruimd.",
  });
  await expect(cleanupFailure).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Dagoverzicht opslaan", exact: true }),
  ).toHaveCount(0);
  const afterDelete = await stored(page);
  expect(afterDelete).toEqual({
    ...before,
    revision: before.revision + 1,
    days: [before.days[1]],
  });
  expect(await drafts(page)).toEqual(pending);
  const retry = page.getByRole("button", {
    name: "Afronden opnieuw proberen",
    exact: true,
  });
  await retry.click();
  expect(await stored(page)).toEqual(afterDelete);
  await expect(cleanupFailure).toBeFocused();
  await failWrites(page, null);
  await retry.click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await stored(page)).toEqual(afterDelete);
  expect(await drafts(page)).toEqual({
    [`day:${otherDate}`]: pending[`day:${otherDate}`],
  });
});

test("een nieuwere opslagrevisie blokkeert verwijderen zonder nieuwe gegevens of concepten te overschrijven", async ({
  page,
}) => {
  const before = await stored(page);
  const pending = await drafts(page);
  const newer = {
    ...before,
    revision: before.revision + 1,
    plan: { ...before.plan, action: "Nieuwere persoonlijke actie" },
  };
  await page.evaluate(
    ({ key, newer }) => localStorage.setItem(key, JSON.stringify(newer)),
    { key: STORAGE_KEY, newer },
  );
  await page
    .getByRole("button", { name: "Dagoverzicht verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Je dagoverzicht en wijzigingen blijven bewaard." }),
  ).toBeFocused();
  expect(await stored(page)).toEqual(newer);
  expect(await drafts(page)).toEqual(pending);
});

test("dagoverzicht opslaan behoudt de bestaande afrondroute bij mislukte conceptopruiming", async ({
  page,
}) => {
  const before = await stored(page);
  const pending = await drafts(page);
  await failWrites(page, DRAFT_STORAGE_KEY);
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registratie opgeslagen", exact: true }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved).toEqual({
    ...before,
    revision: before.revision + 1,
    days: [before.days[1], pending[`day:${targetDate}`]],
  });
  expect(await drafts(page)).toEqual(pending);
  const retry = page.getByRole("button", {
    name: "Afronden opnieuw proberen",
    exact: true,
  });
  await retry.click();
  expect(await stored(page)).toEqual(saved);
  await failWrites(page, null);
  await retry.click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await stored(page)).toEqual(saved);
  expect(await drafts(page)).toEqual({
    [`day:${otherDate}`]: pending[`day:${otherDate}`],
  });
});
