import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createEmptyState } from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function open(page: Page, route = "/moment/new") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}
const state = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    DATA_KEY,
  );
const draft = (page: Page, key: string) =>
  page.evaluate(
    ({ storageKey, key }) =>
      JSON.parse(localStorage.getItem(storageKey) || '{"records":{}}').records[
        key
      ],
    { storageKey: DRAFT_KEY, key },
  );
const beforeForm = (page: Page) => page.locator("form").first();
const rows = (scope: Locator) => scope.locator(".dp-emotion-row");
async function selectEmotion(scope: Locator, label: string, index = 0) {
  await rows(scope)
    .nth(index)
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label });
}
async function addEmotion(scope: Locator, label: string) {
  await scope
    .getByRole("button", { name: "Nog een emotie", exact: true })
    .click();
  await rows(scope)
    .last()
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label });
}
const intensity = (scope: Locator, label: string) =>
  scope.getByLabel(`Intensiteit van ${label}`, { exact: true });
async function saveMoment(page: Page) {
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
}

test("meerdere emoties houden nul, leeg en eigen tekst apart van stemming en blijven als concept en registratie behouden", async ({
  page,
}) => {
  await open(page);
  const before = beforeForm(page);
  await expect(rows(before)).toHaveCount(1);
  await expect(
    before.getByRole("combobox", { name: "Kies een emotie", exact: true }),
  ).toHaveValue("");
  await expect(
    before.locator('.dp-mood-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await before.getByText("Datum en tijd aanpassen", { exact: true }).click();
  await before
    .getByLabel("Datum momentopname", { exact: true })
    .fill("2026-10-12");
  await before.getByLabel("Tijd momentopname", { exact: true }).fill("21:35");
  await selectEmotion(before, "Boos");
  await intensity(before, "Boos").fill("0");
  await addEmotion(before, "Verdrietig");
  await expect(intensity(before, "Verdrietig")).toHaveValue("");
  await addEmotion(before, "Eigen emotie");
  await before
    .getByLabel("Eigen emotie", { exact: true })
    .fill("Gemengd gevoel");
  await intensity(before, "Gemengd gevoel").fill("73");
  const initialDraft = await draft(page, "moment:new");
  expect(initialDraft.before).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [
      { label: "Boos", intensity: 0 },
      { label: "Verdrietig", intensity: null },
      { label: "Gemengd gevoel", intensity: 73 },
    ],
  });
  expect(
    new Set(
      initialDraft.before.emotionRatings.map(
        (entry: { id: string }) => entry.id,
      ),
    ).size,
  ).toBe(3);
  await open(page, "/today");
  await open(page);
  await page.reload();
  await expect(intensity(before, "Boos")).toHaveValue("0");
  await expect(intensity(before, "Verdrietig")).toHaveValue("");
  await expect(before.getByLabel("Eigen emotie", { exact: true })).toHaveValue(
    "Gemengd gevoel",
  );
  expect((await draft(page, "moment:new")).before).toEqual(initialDraft.before);
  await saveMoment(page);
  const saved = (await state(page)).moments[0];
  expect(saved).toMatchObject({
    date: "2026-10-12",
    time: "21:35",
    before: initialDraft.before,
  });
  await before.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await saveMoment(page);
  await page.reload();
  const changedMood = (await state(page)).moments[0];
  expect(changedMood.id).toBe(saved.id);
  expect(changedMood.before.mood).toBe(1);
  expect(changedMood.before.emotionRatings).toEqual(
    initialDraft.before.emotionRatings,
  );
});

test("een nameting neemt alleen emotienamen over, bewaart eigen ontbrekende scores en kan via back-up worden hersteld", async ({
  page,
}) => {
  await open(page);
  const before = beforeForm(page);
  await selectEmotion(before, "Boos");
  await intensity(before, "Boos").fill("70");
  await addEmotion(before, "Blij");
  await intensity(before, "Blij").fill("0");
  await addEmotion(before, "Verdrietig");
  await before.getByRole("button", { name: "-1 Laag", exact: true }).click();
  await page.getByText("Activiteit toevoegen", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Schilderen");
  await saveMoment(page);
  const savedBefore = (await state(page)).moments[0].before;
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  const after = page.locator(".dp-after-form");
  await expect(rows(after)).toHaveCount(3);
  for (const label of ["Boos", "Blij", "Verdrietig"])
    await expect(intensity(after, label)).toHaveValue("");
  await after.getByRole("button", { name: "Nee", exact: true }).click();
  await intensity(after, "Boos").fill("0");
  await page.reload();
  await expect(intensity(after, "Boos")).toHaveValue("0");
  await expect(intensity(after, "Blij")).toHaveValue("");
  await expect(intensity(after, "Verdrietig")).toHaveValue("");
  expect((await state(page)).moments[0].after).toBeNull();
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  const saved = (await state(page)).moments[0];
  expect(saved.before).toEqual(savedBefore);
  expect(saved.after).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [
      { label: "Boos", intensity: 0 },
      { label: "Blij", intensity: null },
      { label: "Verdrietig", intensity: null },
    ],
  });
  expect(saved.attempted).toBe(false);
  await open(page, "/settings");
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up exporteren", exact: true })
    .click();
  const buffer = await readFile((await (await backupDownload).path())!);
  expect(JSON.parse(buffer.toString()).state.moments).toEqual([saved]);
  await open(page, `/moment/${saved.id}`);
  await intensity(after, "Boos").fill("44");
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  expect((await state(page)).moments[0].after.emotionRatings[0].intensity).toBe(
    44,
  );
  await open(page, "/settings");
  await page
    .getByRole("button", { name: "Back-up importeren", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "anchor-emoties.json",
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
  expect((await state(page)).moments).toEqual([saved]);
});

test("een dagoverzicht bewaart benoemde emoties zonder verplichte intensiteit of stemming", async ({
  page,
}) => {
  await open(page, "/day/2026-10-12");
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  expect(await state(page)).toBeNull();
  const form = beforeForm(page);
  await form.getByText("Emoties van de dag toevoegen", { exact: true }).click();
  await selectEmotion(form, "Blij");
  await expect(intensity(form, "Blij")).toHaveValue("");
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  let saved = await state(page);
  expect(saved.days[0].ratings).toMatchObject({
    mood: null,
    eis: null,
    emotionRatings: [{ label: "Blij", intensity: null }],
  });
  expect(saved.moments).toEqual([]);
  expect(saved.cravings).toEqual([]);
  await open(page, "/day/2026-10-12");
  await intensity(form, "Blij").fill("0");
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await page.reload();
  saved = await state(page);
  expect(saved.days).toHaveLength(1);
  expect(saved.days[0].ratings.emotionRatings[0].intensity).toBe(0);
});

test("oude algemene intensiteit en losse emotienamen worden nooit automatisch aan nieuwe emoties gekoppeld", async ({
  page,
}) => {
  const initial = createEmptyState();
  const legacy = {
    id: "legacy-emotion-check",
    date: "2026-10-10",
    time: "19:15",
    kind: "checkin" as const,
    before: { mood: -1, eis: 67 },
    after: { mood: 1, eis: 24 },
    afterDate: "2026-10-10",
    afterTime: "20:10",
    activity: "Schilderen",
    attempted: true,
    emotions: ["Onrustig", "Moe", "Eigen oude omschrijving"],
    note: "Een bestaande registratie.",
  };
  initial.moments = [legacy];
  const original = JSON.stringify(initial);
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key: DATA_KEY, raw: original },
  );
  await open(page, `/moment/${legacy.id}`);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(original);
  const before = beforeForm(page);
  const after = page.locator(".dp-after-form");
  await before
    .getByText("Eerder vastgelegde intensiteit: 67", { exact: true })
    .click();
  await after
    .getByText("Eerder vastgelegde intensiteit: 24", { exact: true })
    .click();
  await expect(
    before.getByLabel("Intensiteit — emotie niet gekoppeld", { exact: true }),
  ).toHaveValue("67");
  await expect(
    after.getByLabel("Na: Intensiteit — emotie niet gekoppeld", {
      exact: true,
    }),
  ).toHaveValue("24");
  await expect(
    before.getByRole("combobox", { name: "Kies een emotie", exact: true }),
  ).toHaveValue("");
  await expect(
    after.getByRole("combobox", { name: "Kies een emotie", exact: true }),
  ).toHaveValue("");
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Mijn eigen aangepaste notitie.");
  await saveMoment(page);
  const changed = (await state(page)).moments[0];
  expect(changed).toEqual({
    ...legacy,
    note: "Mijn eigen aangepaste notitie.",
  });
  expect(Object.hasOwn(changed.before, "emotionRatings")).toBe(false);
  expect(Object.hasOwn(changed.after, "emotionRatings")).toBe(false);
});

test("pannetjes blijven optioneel en veranderen stemming of emotiecijfers niet", async ({
  page,
}) => {
  await open(page);
  const form = beforeForm(page);
  await selectEmotion(form, "Boos");
  await intensity(form, "Boos").fill("80");
  await form.getByRole("button", { name: "+1 Goed", exact: true }).click();
  const pan = form.getByRole("button", {
    name: "Pannetje 3 van 5",
    exact: true,
  });
  await expect(pan).toHaveAttribute("aria-pressed", "false");
  await pan.click();
  expect((await draft(page, "moment:new")).before).toMatchObject({
    mood: 1,
    pans: 3,
    emotionRatings: [{ label: "Boos", intensity: 80 }],
  });
  await pan.click();
  expect((await draft(page, "moment:new")).before.pans).toBeNull();
  await form
    .getByRole("button", { name: "Pannetje 5 van 5", exact: true })
    .click();
  await saveMoment(page);
  await page.reload();
  await expect(
    form.getByRole("button", { name: "Pannetje 5 van 5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await state(page)).moments[0].before).toMatchObject({
    mood: 1,
    pans: 5,
    eis: null,
    emotionRatings: [{ label: "Boos", intensity: 80 }],
  });
});

test("een intensiteit buiten 0 tot 100 wordt niet opgeslagen en nul kan daarna wel worden bewaard", async ({
  page,
}) => {
  await open(page);
  const form = beforeForm(page);
  await selectEmotion(form, "Boos");
  const input = intensity(form, "Boos");
  await input.fill("101");
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  expect(
    await input.evaluate(
      (element: HTMLInputElement) => element.validity.rangeOverflow,
    ),
  ).toBe(true);
  expect(await state(page)).toBeNull();
  await expect(input).toHaveValue("101");
  await input.fill("-1");
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  expect(
    await input.evaluate(
      (element: HTMLInputElement) => element.validity.rangeUnderflow,
    ),
  ).toBe(true);
  expect(await state(page)).toBeNull();
  await input.fill("0");
  await saveMoment(page);
  expect(
    (await state(page)).moments[0].before.emotionRatings[0].intensity,
  ).toBe(0);
});

test("een gewiste eigen emotienaam verliest het ingevulde cijfer niet bij bewaren of herladen", async ({
  page,
}) => {
  await open(page);
  const form = beforeForm(page);
  await selectEmotion(form, "Eigen emotie");
  await form.getByLabel("Eigen emotie", { exact: true }).fill("Mijn gevoel");
  await intensity(form, "Mijn gevoel").fill("42");
  await form.getByLabel("Eigen emotie", { exact: true }).fill("");
  await expect(intensity(form, "deze emotie")).toHaveValue("42");
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  expect(await state(page)).toBeNull();
  expect(
    (await draft(page, "moment:new")).before.emotionRatings[0],
  ).toMatchObject({ label: "", intensity: 42 });
  await page.reload();
  await expect(intensity(form, "deze emotie")).toHaveValue("42");
  await expect(form.getByLabel("Eigen emotie", { exact: true })).toHaveValue(
    "",
  );
  await form
    .getByLabel("Eigen emotie", { exact: true })
    .fill("Opnieuw benoemd gevoel");
  await saveMoment(page);
  expect((await state(page)).moments[0].before.emotionRatings[0]).toMatchObject(
    { label: "Opnieuw benoemd gevoel", intensity: 42 },
  );
});

test("een ongeldig oud intensiteitsconcept opent het verborgen veld en houdt de ingevoerde waarde intact", async ({
  page,
}) => {
  const initial = createEmptyState();
  const savedMoment = {
    id: "legacy-invalid-draft",
    date: "2026-10-10",
    time: "19:15",
    kind: "checkin" as const,
    before: { mood: -1, eis: 60 },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Mijn bewaarde moment.",
  };
  initial.moments = [savedMoment];
  const incomplete = {
    ...savedMoment,
    before: { mood: -1, eis: 101 },
    note: "Mijn nog onafgemaakte wijziging.",
  };
  await page.addInitScript(
    ({ dataKey, draftKey, state, record }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(state));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            version: 1,
            records: { [`moment:${record.id}`]: record },
          }),
        );
    },
    {
      dataKey: DATA_KEY,
      draftKey: DRAFT_KEY,
      state: initial,
      record: incomplete,
    },
  );
  await open(page, `/moment/${savedMoment.id}`);
  const form = beforeForm(page);
  const details = form.locator("details.dp-legacy-intensity");
  const invalid = form.getByLabel("Intensiteit — emotie niet gekoppeld", {
    exact: true,
  });
  await expect(details).not.toHaveAttribute("open", "");
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  await expect(details).toHaveAttribute("open", "");
  await expect(invalid).toBeFocused();
  await expect(invalid).toHaveValue("101");
  expect((await state(page)).moments).toEqual([savedMoment]);
  expect(await draft(page, `moment:${savedMoment.id}`)).toEqual(incomplete);
  await invalid.fill("50");
  await saveMoment(page);
  expect((await state(page)).moments[0]).toMatchObject({
    before: { mood: -1, eis: 50 },
    note: incomplete.note,
  });
});

test("een lege datum in een gesloten onderdeel wordt bij opslaan zichtbaar zonder conceptverlies", async ({
  page,
}) => {
  await open(page);
  const form = beforeForm(page);
  const summary = form.getByText("Datum en tijd aanpassen", { exact: true });
  await summary.click();
  const date = form.getByLabel("Datum momentopname", { exact: true });
  await date.fill("");
  await form
    .getByLabel(/^In je eigen woorden/)
    .fill("Een moment waarvan ik de datum nog invul.");
  await summary.click();
  await page.reload();
  const details = form.locator(".dp-moment-time");
  await expect(details).not.toHaveAttribute("open", "");
  await page
    .getByRole("button", { name: "Dit moment opslaan", exact: true })
    .click();
  await expect(details).toHaveAttribute("open", "");
  await expect(date).toBeFocused();
  await expect(date).toHaveValue("");
  expect(await state(page)).toBeNull();
  expect(await draft(page, "moment:new")).toMatchObject({
    date: "",
    note: "Een moment waarvan ik de datum nog invul.",
  });
  await date.fill("2026-10-12");
  await saveMoment(page);
  expect((await state(page)).moments[0]).toMatchObject({
    date: "2026-10-12",
    note: "Een moment waarvan ik de datum nog invul.",
  });
});

test("emotierijen en lange eigen namen blijven bruikbaar op een smal scherm en bij grotere tekst", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const form = beforeForm(page);
  await selectEmotion(form, "Boos");
  await intensity(form, "Boos").fill("80");
  await addEmotion(form, "Eigen emotie");
  const ownLabel =
    "Een mengeling van opluchting, verwarring en nieuwsgierigheid";
  await form.getByLabel("Eigen emotie", { exact: true }).fill(ownLabel);
  await intensity(form, ownLabel).fill("35");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const fontSize of ["", "200%"]) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, fontSize);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      for (const label of ["Boos", ownLabel]) {
        const input = intensity(form, label);
        await expect(input).toBeVisible();
        const bounds = await input.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        expect(
          await input.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
        ).toBeGreaterThanOrEqual(16);
      }
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await rows(form).first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("emotion-rows-mobile.png"),
  });
});
