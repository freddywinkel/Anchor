import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEmptyState, type Moment } from "../src/lib/storage";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const DATE = "2026-10-14";
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00+02:00`));
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), DATA);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFTS,
  );
const form = (page: Page) =>
  page
    .locator("form")
    .filter({ has: page.locator(".dp-ratings-editor") })
    .first();
const emotions = (scope: Locator) =>
  scope.getByRole("combobox", { name: "Kies een emotie", exact: true });
const intensity = (scope: Locator, label: string) =>
  scope.getByLabel(`Intensiteit van ${label}`, { exact: true });
async function open(page: Page, route = "/moment/new") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
async function addEmotion(scope: Locator, label: string) {
  await scope
    .getByRole("button", { name: "Nog een emotie", exact: true })
    .click();
  await emotions(scope).last().selectOption({ label });
}

test("nieuwe gegroepeerde emoties blijven met eigen cijfers bewaard in concept, check-in en onafhankelijke nameting", async ({
  page,
}) => {
  await open(page);
  const beforeForm = form(page);
  const select = emotions(beforeForm).first();
  await expect(select).toHaveJSProperty("tagName", "SELECT");
  const grouping = await select
    .getByRole("option", { name: "Nerveus", exact: true })
    .evaluate((option) => ({
      tag: option.parentElement?.tagName,
      label: option.parentElement?.getAttribute("label"),
    }));
  expect(grouping.tag).toBe("OPTGROUP");
  expect(grouping.label?.trim()).toBeTruthy();
  await expect(
    select.getByRole("option", { name: "Eigen emotie", exact: true }),
  ).toHaveCount(1);
  await select.selectOption("Nerveus");
  await intensity(beforeForm, "Nerveus").fill("0");
  await addEmotion(beforeForm, "Bezorgd");
  await expect(intensity(beforeForm, "Bezorgd")).toHaveValue("");
  await addEmotion(beforeForm, "Overprikkeld");
  await intensity(beforeForm, "Overprikkeld").fill("75");
  await expect(
    emotions(beforeForm)
      .last()
      .getByRole("option", { name: "Nerveus", exact: true }),
  ).toHaveJSProperty("disabled", true);
  await addEmotion(beforeForm, "Eigen emotie");
  await beforeForm
    .getByLabel("Eigen emotie", { exact: true })
    .fill("Mijn eigen combinatie");
  await intensity(beforeForm, "Mijn eigen combinatie").fill("28");
  await beforeForm.getByText("Activiteit toevoegen", { exact: true }).click();
  await beforeForm
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Buiten wandelen");
  const pending = (await drafts(page))["moment:new"];
  expect(pending.before).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [
      { label: "Nerveus", intensity: 0 },
      { label: "Bezorgd", intensity: null },
      { label: "Overprikkeld", intensity: 75 },
      { label: "Mijn eigen combinatie", intensity: 28 },
    ],
  });
  await page.reload();
  await expect(intensity(beforeForm, "Nerveus")).toHaveValue("0");
  await expect(intensity(beforeForm, "Bezorgd")).toHaveValue("");
  await expect(
    beforeForm.getByLabel("Eigen emotie", { exact: true }),
  ).toHaveValue("Mijn eigen combinatie");
  expect((await drafts(page))["moment:new"]).toEqual(pending);
  await beforeForm
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  const savedBefore = (await stored(page)).moments[0];
  expect(savedBefore.before).toEqual(pending.before);
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  const afterForm = page.locator(".dp-after-form");
  for (const label of [
    "Nerveus",
    "Bezorgd",
    "Overprikkeld",
    "Mijn eigen combinatie",
  ])
    await expect(intensity(afterForm, label)).toHaveValue("");
  await intensity(afterForm, "Nerveus").fill("0");
  await addEmotion(afterForm, "Gespannen");
  await intensity(afterForm, "Gespannen").fill("40");
  await page.reload();
  await expect(intensity(afterForm, "Gespannen")).toHaveValue("40");
  await expect(intensity(afterForm, "Bezorgd")).toHaveValue("");
  await afterForm
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = (await stored(page)).moments[0];
  expect(saved.before).toEqual(savedBefore.before);
  expect(saved.after).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [
      { label: "Nerveus", intensity: 0 },
      { label: "Bezorgd", intensity: null },
      { label: "Overprikkeld", intensity: null },
      { label: "Mijn eigen combinatie", intensity: null },
      { label: "Gespannen", intensity: 40 },
    ],
  });
  expect(saved.attempted).toBeNull();
  expect((await stored(page)).moments).toHaveLength(1);
  expect(await drafts(page)).toEqual({});
});

test("dagoverzicht kan nieuwe emotiewoorden zonder stemming of verplichte intensiteit bewaren", async ({
  page,
}) => {
  await open(page, `/day/${DATE}`);
  const dayForm = form(page);
  await dayForm
    .getByText("Emoties van de dag toevoegen", { exact: true })
    .click();
  await emotions(dayForm).first().selectOption("Zenuwachtig");
  await addEmotion(dayForm, "Tevreden");
  await intensity(dayForm, "Tevreden").fill("0");
  const pending = (await drafts(page))[`day:${DATE}`];
  await page.reload();
  await expect(intensity(dayForm, "Zenuwachtig")).toHaveValue("");
  await expect(intensity(dayForm, "Tevreden")).toHaveValue("0");
  await dayForm
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const state = await stored(page);
  expect(state.days[0].ratings).toEqual(pending.ratings);
  expect(state.days[0].ratings).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [
      { label: "Zenuwachtig", intensity: null },
      { label: "Tevreden", intensity: 0 },
    ],
  });
  expect(state.days[0].sleepHours).toBe("");
  expect(state.days[0].sleepMinutes).toBe("");
  expect(state.moments).toEqual([]);
  expect(state.cravings).toEqual([]);
  expect(await drafts(page)).toEqual({});
});

for (const withDraft of [false, true]) {
  test(`eerder als eigen emotie ingevuld Nerveus behoudt naam, id en cijfers bij ${withDraft ? "hervatten van een concept" : "bewerken van een opgeslagen check-in"}`, async ({
    page,
  }) => {
    const state = createEmptyState();
    const original: Moment = {
      id: "old-custom",
      date: DATE,
      time: "09:00",
      kind: "checkin",
      before: {
        mood: 1,
        eis: null,
        emotionRatings: [
          { id: "unchanged-before-id", label: "Nerveus", intensity: 64 },
          {
            id: "free-before-id",
            label: "Nerveus op mijn manier",
            intensity: null,
          },
        ],
      },
      after: {
        mood: 0,
        eis: null,
        emotionRatings: [
          { id: "unchanged-before-id", label: "Nerveus", intensity: 20 },
        ],
      },
      afterDate: DATE,
      afterTime: "09:30",
      activity: "Buiten wandelen",
      attempted: true,
      emotions: [],
      note: "Oorspronkelijke notitie",
    };
    state.moments = [original];
    const pending: Moment = {
      ...original,
      before: {
        ...original.before,
        emotionRatings: [
          { id: "unchanged-before-id", label: "Nerveus", intensity: 0 },
          {
            id: "free-before-id",
            label: "Nerveus op mijn manier",
            intensity: null,
          },
        ],
      },
      note: "Eerder bewaard concept",
    };
    await page.addInitScript(
      ({ DATA, DRAFTS, state, pending, withDraft }) => {
        if (!localStorage.getItem(DATA))
          localStorage.setItem(DATA, JSON.stringify(state));
        if (withDraft && !localStorage.getItem(DRAFTS))
          localStorage.setItem(
            DRAFTS,
            JSON.stringify({
              version: 1,
              records: { "moment:old-custom": pending },
            }),
          );
      },
      { DATA, DRAFTS, state, pending, withDraft },
    );
    await open(page, "/moment/old-custom");
    const beforeForm = form(page);
    const expected = withDraft ? pending : original;
    await expect(emotions(beforeForm).first()).toHaveValue("Nerveus");
    await expect(intensity(beforeForm, "Nerveus")).toHaveValue(
      String(expected.before.emotionRatings![0].intensity),
    );
    await expect(
      beforeForm.getByLabel("Eigen emotie", { exact: true }),
    ).toHaveValue("Nerveus op mijn manier");
    await page.reload();
    expect(await stored(page)).toEqual(state);
    if (withDraft)
      expect((await drafts(page))["moment:old-custom"]).toEqual(pending);
    else expect(await drafts(page)).toEqual({});
    await beforeForm
      .getByLabel(/^In je eigen woorden/)
      .fill("Alleen deze notitie aangepast");
    await beforeForm
      .getByRole("button", {
        name: "Wijzigingen check-in opslaan",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Jouw check-in", exact: true }),
    ).toBeVisible();
    expect((await stored(page)).moments).toEqual([
      { ...expected, note: "Alleen deze notitie aangepast" },
    ]);
    expect(await drafts(page)).toEqual({});
  });
}

test("een bestaande eigen emotie blijft bewerkbaar wanneer de tekst tijdelijk precies een nieuwe standaardoptie is", async ({
  page,
}) => {
  const state = createEmptyState();
  const original: Moment = {
    id: "free-emotion-edit",
    date: DATE,
    time: "10:00",
    kind: "checkin",
    before: {
      mood: null,
      eis: null,
      emotionRatings: [
        {
          id: "same-free-emotion",
          label: "Nerveus maar hoopvol",
          intensity: 64,
        },
      ],
    },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "",
  };
  state.moments = [original];
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: DATA, state },
  );
  await open(page, `/moment/${original.id}`);
  const custom = form(page).getByLabel("Eigen emotie", { exact: true });
  await expect(custom).toHaveValue("Nerveus maar hoopvol");
  await custom.fill("Nerveus");
  await expect(custom).toBeVisible();
  await expect(custom).toBeFocused();
  await expect(intensity(form(page), "Nerveus")).toHaveValue("64");
  await custom.fill("Nerveus op mijn eigen manier");
  await page.reload();
  await expect(custom).toHaveValue("Nerveus op mijn eigen manier");
  await expect(
    intensity(form(page), "Nerveus op mijn eigen manier"),
  ).toHaveValue("64");
  expect((await stored(page)).moments).toEqual([original]);
  await form(page)
    .getByRole("button", { name: "Wijzigingen check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await stored(page)).moments).toEqual([
    {
      ...original,
      before: {
        ...original.before,
        emotionRatings: [
          {
            id: "same-free-emotion",
            label: "Nerveus op mijn eigen manier",
            intensity: 64,
          },
        ],
      },
    },
  ]);
  expect(await drafts(page)).toEqual({});
});

test("dezelfde nieuwe emotiewoorden vullen cravingtekst aan zonder eigen woorden te vervangen of scores toe te voegen", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const text = page.getByRole("textbox", { name: "Emotie", exact: true });
  const picker = page.getByRole("combobox", {
    name: "Voorbeeld voor emotie",
    exact: true,
  });
  const original = "Mijn eigen woorden blijven staan.\nEen tweede regel.";
  await text.fill(original);
  await picker.selectOption("Nerveus");
  await picker.selectOption("Zenuwachtig");
  const combined = `${original}\nNerveus\nZenuwachtig`;
  await expect(text).toHaveValue(combined);
  await picker.selectOption("Nerveus");
  await expect(text).toHaveValue(combined);
  await expect(picker).toHaveValue("");
  const pending = (await drafts(page))["craving:new"];
  await page.reload();
  await expect(text).toHaveValue(combined);
  expect((await drafts(page))["craving:new"]).toEqual(pending);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = (await stored(page)).cravings[0];
  expect(saved.emotion).toBe(combined);
  expect(Object.keys(saved).sort()).toEqual(
    [
      "id",
      "date",
      "time",
      "situation",
      "thought",
      "bodySensation",
      "emotion",
      "behavior",
    ].sort(),
  );
  await open(page, `/craving/${saved.id}`);
  await picker.selectOption("Gespannen");
  await expect(text).toHaveValue(`${combined}\nGespannen`);
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await stored(page)).cravings).toEqual([
    { ...saved, emotion: `${combined}\nGespannen` },
  ]);
  expect((await stored(page)).moments).toEqual([]);
  expect((await stored(page)).days).toEqual([]);
});
