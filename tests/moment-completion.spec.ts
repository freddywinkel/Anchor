import { expect, test, type Page } from "@playwright/test";
import { createEmptyState, type Moment } from "../src/lib/storage";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const original: Moment = {
  id: "saved-walk",
  date: "2026-10-12",
  time: "12:00",
  kind: "checkin",
  before: {
    mood: -1,
    eis: null,
    emotionRatings: [{ id: "unrest", label: "Onrustig", intensity: 70 }],
  },
  after: {
    mood: null,
    eis: null,
    emotionRatings: [{ id: "unrest", label: "Onrustig", intensity: 40 }],
  },
  afterDate: "2026-10-12",
  afterTime: "12:30",
  activity: "Buiten wandelen",
  attempted: true,
  emotions: [],
  note: "Een bestaande wandeling",
};
const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DATA);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFTS,
  );
async function failWrites(page: Page, key: string | null) {
  await page.evaluate((key) => {
    const windowForTest = window as any;
    windowForTest.originalSetItem ??= Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test: opslag vol", "QuotaExceededError");
      return windowForTest.originalSetItem.call(this, name, value);
    };
  }, key);
}
test.beforeEach(async ({ page }) => {
  const initial = createEmptyState();
  initial.moments = [original];
  await page.addInitScript(
    ({ key, initial }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(initial));
    },
    { key: DATA, initial },
  );
  await page.goto(`./#/moment/${original.id}`);
  await expect(page.locator("main h1")).toHaveText("Jouw check-in");
});

test("nameting bewaart onbekend en nul, sluit na opslaan en wijzigt dezelfde registratie", async ({
  page,
}) => {
  const after = page.locator(".dp-after-form");
  await after
    .getByRole("button", { name: "Niet ingevuld", exact: true })
    .click();
  await after.getByLabel("Intensiteit van Onrustig", { exact: true }).fill("0");
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const saved = await stored(page);
  expect(saved.moments).toHaveLength(1);
  expect(saved.moments[0]).toEqual({
    ...original,
    attempted: null,
    after: {
      ...original.after,
      emotionRatings: [{ id: "unrest", label: "Onrustig", intensity: 0 }],
    },
  });
  expect(await drafts(page)).toEqual({});
  await page.reload();
  await page.getByRole("button", { name: "Alle momenten terugkijken" }).click();
  await page.locator(".dp-history-list summary").click();
  await page.getByRole("button", { name: /^Bewerken: check-in/ }).click();
  await expect(
    after.getByRole("button", { name: "Niet ingevuld", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    after.getByLabel("Intensiteit van Onrustig", { exact: true }),
  ).toHaveValue("0");
  expect((await stored(page)).moments[0].before).toEqual(original.before);
});

test("nameting met mislukte conceptopruiming kan afronden zonder nogmaals op te slaan", async ({
  page,
}) => {
  const after = page.locator(".dp-after-form");
  await after
    .getByLabel("Intensiteit van Onrustig", { exact: true })
    .fill("25");
  await failWrites(page, DRAFTS);
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registratie opgeslagen" }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved.moments[0].after.emotionRatings[0].intensity).toBe(25);
  await expect(page.locator("form")).toHaveCount(0);
  await page.getByRole("button", { name: "Afronden opnieuw proberen" }).click();
  await expect(page.locator(".dp-form-page [role=alert]")).toBeFocused();
  expect(await stored(page)).toEqual(saved);
  await failWrites(page, null);
  await page.getByRole("button", { name: "Afronden opnieuw proberen" }).click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await stored(page)).toEqual(saved);
  expect(await drafts(page)).toEqual({});
});

test("dagfouten blijven zichtbaar; geslaagd opslaan met opruimfout is veilig opnieuw af te ronden", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Terug naar Vandaag", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dagoverzicht invullen", exact: true })
    .click();
  const form = page.locator("form");
  await page
    .getByLabel("Wat wil je onthouden van deze dag?")
    .fill("Een rustige avond.");
  const pending = await drafts(page);
  await failWrites(page, DATA);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Dagoverzicht opslaan" }).click();
    await expect(form.getByRole("alert")).toBeFocused();
    expect((await stored(page)).days).toEqual([]);
    expect(await drafts(page)).toEqual(pending);
  }
  await failWrites(page, DRAFTS);
  await page.getByRole("button", { name: "Dagoverzicht opslaan" }).click();
  await expect(
    page.getByRole("heading", { name: "Registratie opgeslagen" }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved.days).toHaveLength(1);
  expect(saved.days[0].note).toBe("Een rustige avond.");
  await failWrites(page, null);
  await page.getByRole("button", { name: "Afronden opnieuw proberen" }).click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await stored(page)).toEqual(saved);
  expect(await drafts(page)).toEqual({});
});

test("een mislukte momentverwijdering krijgt lokale focus en cleanup retry herstelt het record niet", async ({
  page,
}) => {
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Een onafgemaakte bewerking");
  await page
    .getByRole("button", { name: "Moment verwijderen", exact: true })
    .click();
  await failWrites(page, DATA);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "Verwijderen bevestigen", exact: true })
      .click();
    await expect(page.locator(".dp-delete-area [role=alert]")).toBeFocused();
    expect((await stored(page)).moments).toEqual([original]);
  }
  await failWrites(page, DRAFTS);
  await page
    .getByRole("button", { name: "Verwijderen bevestigen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registratie verwijderd" }),
  ).toBeVisible();
  const removed = await stored(page);
  expect(removed.moments).toEqual([]);
  await expect(page.locator("form")).toHaveCount(0);
  await failWrites(page, null);
  await page.getByRole("button", { name: "Afronden opnieuw proberen" }).click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await stored(page)).toEqual(removed);
  expect(await drafts(page)).toEqual({});
});

test("verwijderen met beschadigde conceptopslag houdt de afrondmelding tot expliciet herstel", async ({
  page,
}) => {
  const damaged = '{"version":1,"records":BROKEN';
  await page.evaluate(
    ({ key, damaged }) => localStorage.setItem(key, damaged),
    { key: DRAFTS, damaged },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Moment verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Verwijderen bevestigen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registratie verwijderd", exact: true }),
  ).toBeVisible();
  const removed = await stored(page);
  expect(removed.moments).toEqual([]);
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFTS)).toBe(
    damaged,
  );
  await page.getByRole("button", { name: "Afronden opnieuw proberen" }).click();
  await expect(
    page.getByRole("heading", { name: "Registratie verwijderd", exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(removed);
  await page
    .getByRole("button", { name: "Conceptopslag herstellen", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Herstelbestand downloaden", exact: true })
    .click();
  await download;
  await page
    .getByRole("button", { name: "Alleen concepten wissen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.locator("form")).toHaveCount(0);
  expect(await stored(page)).toEqual(removed);
  expect(await drafts(page)).toEqual({});
  await page.goto(`./#/moment/${original.id}`);
  await expect(
    page.getByRole("heading", {
      name: "Deze pagina is niet gevonden",
      exact: true,
    }),
  ).toBeVisible();
});
