import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  type Moment,
  type Ratings,
} from "../src/lib/storage";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const before: Ratings = {
  mood: -1,
  eis: null,
  emotionRatings: [{ id: "unrest", label: "Onrustig", intensity: 70 }],
};
function moment(values: Partial<Moment> = {}): Moment {
  return {
    id: "walk",
    date: "2026-10-14",
    time: "10:00",
    kind: "checkin",
    before,
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "Buiten wandelen",
    attempted: null,
    emotions: [],
    note: "Mijn oorspronkelijke check-in",
    ...values,
  };
}
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DATA);
}
async function drafts(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFTS,
  );
}
async function open(
  page: Page,
  record: Moment,
  pending: Record<string, unknown> = {},
) {
  const initial = createEmptyState();
  initial.moments = [record];
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+02:00"));
  await page.addInitScript(
    ({ initial, pending, DATA, DRAFTS }) => {
      if (!localStorage.getItem(DATA))
        localStorage.setItem(DATA, JSON.stringify(initial));
      if (!localStorage.getItem(DRAFTS) && Object.keys(pending).length)
        localStorage.setItem(
          DRAFTS,
          JSON.stringify({ version: 1, records: pending }),
        );
    },
    { initial, pending, DATA, DRAFTS },
  );
  await page.goto(`./#/moment/${record.id}`);
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
}

for (const withEmotion of [false, true]) {
  test(`een onaangeraakte nameting ${withEmotion ? "met overgenomen emotie" : "zonder emotie"} wordt niet als ingevuld opgeslagen; nul is een antwoord`, async ({
    page,
  }) => {
    await open(
      page,
      moment({ before: withEmotion ? before : { mood: -1, eis: null } }),
    );
    const initial = await stored(page);
    await page
      .getByRole("button", { name: "Nameting invullen", exact: true })
      .click();
    const after = page.locator(".dp-after-form");
    await after
      .getByRole("button", { name: "Nameting opslaan", exact: true })
      .click();
    await expect(after.getByRole("alert")).toContainText(
      "Je nameting is nog leeg",
    );
    await expect(after.getByRole("alert")).toBeFocused();
    expect(await stored(page)).toEqual(initial);
    await after
      .getByRole("button", { name: "0 Neutraal", exact: true })
      .click();
    await after
      .getByRole("button", { name: "Nameting opslaan", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/today$/);
    expect((await stored(page)).moments[0].after.mood).toBe(0);
    expect((await stored(page)).moments[0].attempted).toBeNull();
  });
}

for (const answer of ["nee", "emotie"]) {
  test(`één bewust antwoord (${answer}) is genoeg voor een nameting zonder verplichte scores`, async ({
    page,
  }) => {
    await open(page, moment({ before: { mood: null, eis: null } }));
    await page
      .getByRole("button", { name: "Nameting invullen", exact: true })
      .click();
    const after = page.locator(".dp-after-form");
    if (answer === "nee")
      await after.getByRole("button", { name: "Nee", exact: true }).click();
    else
      await after
        .getByRole("combobox", { name: "Kies een emotie", exact: true })
        .selectOption("Blij");
    await after
      .getByRole("button", { name: "Nameting opslaan", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/today$/);
    const saved = (await stored(page)).moments[0];
    expect(saved.after.mood).toBeNull();
    expect(saved.after.eis).toBeNull();
    if (answer === "nee") expect(saved.attempted).toBe(false);
    else
      expect(saved.after.emotionRatings).toMatchObject([
        { label: "Blij", intensity: null },
      ]);
  });
}

test("alleen de nameting verwijderen vereist bevestiging en behoudt de check-in, diens conceptwijzigingen en andere concepten", async ({
  page,
}) => {
  const original = moment({
    after: { mood: 0, eis: null },
    afterDate: "2026-10-14",
    afterTime: "10:30",
    attempted: true,
  });
  const pending = {
    ...original,
    note: "Nog niet opgeslagen wijziging",
    after: { mood: 1, eis: null },
  };
  const unrelated = {
    date: "2026-10-13",
    ratings: { mood: null, eis: null },
    sleepHours: "",
    sleepMinutes: "",
    note: "Ander dagconcept",
  };
  await open(page, original, {
    "moment:walk": pending,
    "day:2026-10-13": unrelated,
  });
  const initial = await stored(page);
  const remove = page.getByRole("button", {
    name: "Nameting verwijderen",
    exact: true,
  });
  await remove.click();
  const confirm = page.getByRole("alertdialog", {
    name: "Alleen deze nameting verwijderen?",
    exact: true,
  });
  await expect(
    confirm.getByRole("button", { name: "Behouden", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  expect(await stored(page)).toEqual(initial);
  expect((await drafts(page))["moment:walk"]).toEqual(pending);
  await remove.click();
  await confirm
    .getByRole("button", { name: "Ja, nameting verwijderen", exact: true })
    .click();
  expect((await stored(page)).moments).toEqual([
    {
      ...original,
      after: null,
      afterDate: null,
      afterTime: null,
      attempted: null,
    },
  ]);
  expect(await drafts(page)).toEqual({
    "moment:walk": {
      ...pending,
      after: null,
      afterDate: null,
      afterTime: null,
      attempted: null,
    },
    "day:2026-10-13": unrelated,
  });
  await expect(
    page.getByRole("combobox", { name: "Activiteit", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(
    pending.note,
  );
  await page
    .getByRole("button", { name: "Wijzigingen check-in opslaan", exact: true })
    .click();
  expect((await stored(page)).moments[0].note).toBe(pending.note);
  expect((await drafts(page))["day:2026-10-13"]).toEqual(unrelated);
});

test("een oude nameting zonder activiteit kan verwijderd worden zonder een activiteit te verzinnen", async ({
  page,
}) => {
  const original = moment({
    activity: "",
    after: { mood: 1, eis: null },
    afterDate: "2026-10-14",
    afterTime: "10:30",
    attempted: null,
  });
  await open(page, original);
  const after = page.locator(".dp-after-form");
  await expect(after).toContainText("Activiteit niet ingevuld");
  await after
    .getByRole("button", { name: "Nameting verwijderen", exact: true })
    .click();
  await page
    .getByRole("alertdialog", {
      name: "Alleen deze nameting verwijderen?",
      exact: true,
    })
    .getByRole("button", { name: "Ja, nameting verwijderen", exact: true })
    .click();
  await expect(after).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeFocused();
  expect((await stored(page)).moments).toEqual([
    {
      ...original,
      after: null,
      afterDate: null,
      afterTime: null,
      attempted: null,
    },
  ]);
  expect(await drafts(page)).toEqual({});
});

test("nameting verwijderen met een opruimfout schrijft bij opnieuw afronden niet opnieuw en herstelt de nameting niet", async ({
  page,
}) => {
  const original = moment({
    after: { mood: 0, eis: null },
    afterDate: "2026-10-14",
    afterTime: "10:30",
    attempted: false,
  });
  await open(page, original, {
    "moment:walk": { ...original, after: { mood: 1, eis: null } },
  });
  await page.evaluate((key) => {
    const originalSet = Storage.prototype.setItem;
    (window as any).restoreDraftWrites = () => {
      Storage.prototype.setItem = originalSet;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return originalSet.call(this, name, value);
    };
  }, DRAFTS);
  await page
    .getByRole("button", { name: "Nameting verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, nameting verwijderen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nameting verwijderd", exact: true }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved.moments[0].after).toBeNull();
  await page.evaluate(() => (window as any).restoreDraftWrites());
  await page
    .getByRole("button", { name: "Afronden opnieuw proberen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: original.activity, exact: true }),
  ).toBeFocused();
  expect(await stored(page)).toEqual(saved);
  expect(await drafts(page)).toEqual({});
});

test("nieuwe dubbele emoties krijgen lokale feedback terwijl bestaande dubbele emoties behouden en bewerkbaar blijven", async ({
  page,
}) => {
  const legacy = moment({
    activity: "",
    before: {
      mood: null,
      eis: null,
      emotionRatings: [
        { id: "old-a", label: "Onrustig", intensity: 30 },
        { id: "old-b", label: "Onrustig", intensity: 80 },
      ],
    },
  });
  await open(page, legacy);
  await page.getByLabel(/^In je eigen woorden/).fill("Een aangepaste notitie");
  await page
    .getByRole("button", { name: "Wijzigingen check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await stored(page)).moments[0].before).toEqual(legacy.before);
  await page
    .getByRole("button", { name: "Check-in toevoegen", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption("Blij");
  await page
    .getByRole("button", { name: "Nog een emotie", exact: true })
    .click();
  const second = page
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .nth(1);
  await expect(
    second.getByRole("option", { name: "Blij", exact: true }),
  ).toHaveJSProperty("disabled", true);
  await second.selectOption("__custom");
  await page.getByLabel("Eigen emotie", { exact: true }).fill(" blij ");
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Deze emotie staat al in een andere rij",
  );
  expect((await stored(page)).moments).toHaveLength(1);
  await page.reload();
  await expect(page.getByLabel("Eigen emotie", { exact: true })).toHaveValue(
    " blij ",
  );
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  expect((await stored(page)).moments).toHaveLength(1);
  await page.getByLabel("Eigen emotie", { exact: true }).fill("Ontspannen");
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await stored(page)).moments).toHaveLength(2);
});
