import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEmptyState, type Moment } from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function open(page: Page, route = "/tools") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}
const state = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    DATA_KEY,
  );
const draft = (page: Page, key = "moment:new") =>
  page.evaluate(
    ({ storageKey, key }) =>
      JSON.parse(localStorage.getItem(storageKey) || '{"records":{}}').records[
        key
      ],
    { storageKey: DRAFT_KEY, key },
  );
const activity = (page: Page) =>
  page.getByRole("combobox", { name: "Activiteit", exact: true });
const beforeForm = (page: Page) => page.locator("form").first();
const resumedNotice = (page: Page) =>
  page.getByText(/^Je werkt verder aan een bewaard concept\./);
const intensity = (scope: Locator, label: string) =>
  scope.getByLabel(`Intensiteit van ${label}`, { exact: true });

async function saveMoment(page: Page) {
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
}
async function finishExercise(page: Page) {
  await expect(
    page.getByRole("heading", { name: "5-4-3-2-1", exact: true }),
  ).toBeVisible();
  for (let step = 0; step < 5; step++) {
    await page
      .getByRole("button", { name: "Stap overslaan", exact: true })
      .click();
  }
  await expect(page.locator(".dp-exercise-done")).toBeVisible();
}

test("Activiteit kiezen opent en focust de keuze zonder een check-in op te slaan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page
    .getByRole("button", { name: "Activiteit kiezen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/moment\/new\?activity=choose$/);
  await expect(page.locator(".dp-activity-section")).toHaveAttribute(
    "open",
    "",
  );
  await expect(activity(page)).toBeFocused();
  await expect(activity(page)).toHaveValue("");
  await expect
    .poll(() =>
      activity(page).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const nav = document
          .querySelector(".dp-bottom-nav")!
          .getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= nav.top + 1;
      }),
    )
    .toBe(true);
  expect((await state(page))?.moments ?? []).toEqual([]);
  await activity(page).selectOption("custom");
  await page
    .getByLabel("Naam van de activiteit", { exact: true })
    .fill("Even aan de keukentafel tekenen");
  expect(await draft(page)).toMatchObject({
    activity: "Even aan de keukentafel tekenen",
    before: { mood: null, eis: null },
    after: null,
    attempted: null,
  });
  expect((await state(page))?.moments ?? []).toEqual([]);
});

test("Eerst inchecken kiest de oefening als concept zonder scores of stille registratie", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Eerst inchecken", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/moment\/new\?activity=grounding$/);
  await expect(resumedNotice(page)).toHaveCount(0);
  await expect(activity(page)).toHaveValue("5-4-3-2-1");
  await expect(
    beforeForm(page).locator('.dp-mood-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(
    beforeForm(page).locator('.dp-pans-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  expect((await state(page))?.moments ?? []).toEqual([]);
  await beforeForm(page)
    .getByLabel(/^In je eigen woorden/)
    .fill("Ik wil even rustig om mij heen kijken.");
  expect(await draft(page)).toMatchObject({
    activity: "5-4-3-2-1",
    before: { mood: null, eis: null },
    after: null,
    attempted: null,
  });
  await page.reload();
  await expect(activity(page)).toHaveValue("5-4-3-2-1");
  expect((await state(page))?.moments ?? []).toEqual([]);
});

for (const existingActivity of ["", "Een boek lezen"]) {
  test(`hulpmiddelroutes behouden het volledige bestaande concept met ${existingActivity ? "eigen" : "lege"} activiteit`, async ({
    page,
  }) => {
    await open(page, "/moment/new");
    const before = beforeForm(page);
    await before.getByText("Datum en tijd aanpassen", { exact: true }).click();
    await before
      .getByLabel("Datum momentopname", { exact: true })
      .fill("2026-10-10");
    await before.getByLabel("Tijd momentopname", { exact: true }).fill("09:17");
    await before
      .getByLabel(/^In je eigen woorden/)
      .fill("Mijn eigen onafgemaakte moment.");
    await before
      .getByRole("combobox", { name: "Kies een emotie", exact: true })
      .selectOption("Onrustig");
    await intensity(before, "Onrustig").fill("0");
    if (existingActivity) {
      await page.getByText("Activiteit toevoegen", { exact: true }).click();
      await activity(page).selectOption("custom");
      await page
        .getByLabel("Naam van de activiteit", { exact: true })
        .fill(existingActivity);
    }
    const pending = await draft(page);
    for (const entry of ["Eerst inchecken", "Activiteit kiezen"]) {
      await open(page);
      await page.getByRole("button", { name: entry, exact: true }).click();
      await expect(resumedNotice(page)).toBeVisible();
      await expect(before.getByLabel(/^In je eigen woorden/)).toHaveValue(
        pending.note,
      );
      await expect(intensity(before, "Onrustig")).toHaveValue("0");
      await expect(activity(page)).toHaveValue(
        existingActivity ? "custom" : "",
      );
      if (existingActivity)
        await expect(
          page.getByLabel("Naam van de activiteit", { exact: true }),
        ).toHaveValue(existingActivity);
      expect(await draft(page)).toEqual(pending);
      expect((await state(page))?.moments ?? []).toEqual([]);
      await page.reload();
      await expect(resumedNotice(page)).toBeVisible();
      expect(await draft(page)).toEqual(pending);
    }
    await open(page, "/exercise");
    await finishExercise(page);
    await page
      .getByRole("button", { name: "Check-in na de oefening", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/moment\/new$/);
    await expect(resumedNotice(page)).toBeVisible();
    await expect(before.getByLabel(/^In je eigen woorden/)).toHaveValue(
      pending.note,
    );
    await expect(intensity(before, "Onrustig")).toHaveValue("0");
    expect(await draft(page)).toEqual(pending);
    expect((await state(page))?.moments ?? []).toEqual([]);
  });
}

test("een gekoppelde oefening keert terug naar dezelfde nameting en vult niets automatisch in", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Eerst inchecken", exact: true })
    .click();
  const before = beforeForm(page);
  await before.getByRole("button", { name: "-1 Laag", exact: true }).click();
  await before
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption("Onrustig");
  await intensity(before, "Onrustig").fill("70");
  await before
    .getByLabel(/^In je eigen woorden/)
    .fill("Mijn eigen voormeting.");
  await saveMoment(page);
  const saved = (await state(page)).moments[0];
  await page
    .getByRole("button", { name: "Open de oefening", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/exercise\\?moment=${saved.id}$`));
  await page
    .getByLabel(/^Wat merk je op\?/)
    .fill("Alleen tijdens deze oefening zichtbaar.");
  await finishExercise(page);
  expect((await state(page)).moments).toEqual([saved]);
  await page
    .getByRole("button", { name: "Terug naar mijn nameting", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/moment/${saved.id}\\?after=1$`));
  const after = page.locator(".dp-after-form");
  await expect(after).toBeVisible();
  await expect(
    after.getByRole("button", { name: "Ja", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    after.getByRole("button", { name: "Nee", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    after.locator('.dp-mood-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(
    after.locator('.dp-pans-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(intensity(after, "Onrustig")).toHaveValue("");
  expect((await state(page)).moments).toEqual([saved]);
  await after.getByRole("button", { name: "Nee", exact: true }).click();
  await intensity(after, "Onrustig").fill("0");
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  const final = (await state(page)).moments;
  expect(final).toHaveLength(1);
  expect(final[0]).toMatchObject({
    id: saved.id,
    before: saved.before,
    activity: "5-4-3-2-1",
    attempted: false,
    after: {
      mood: null,
      eis: null,
      emotionRatings: [{ label: "Onrustig", intensity: 0 }],
    },
  });
  expect(JSON.stringify(final)).not.toContain(
    "Alleen tijdens deze oefening zichtbaar.",
  );
});

test("een losse oefening kan gevolgd worden door een gewone check-in zonder verzonnen voormeting", async ({
  page,
}) => {
  await open(page, "/exercise");
  await finishExercise(page);
  expect((await state(page))?.moments ?? []).toEqual([]);
  await page
    .getByRole("button", { name: "Check-in na de oefening", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/moment\/new$/);
  await expect(resumedNotice(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Dit moment", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  const before = beforeForm(page);
  await expect(
    before.locator('.dp-mood-options button[aria-pressed="true"]'),
  ).toHaveCount(0);
  expect((await state(page))?.moments ?? []).toEqual([]);
  await before.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await before
    .getByLabel(/^In je eigen woorden/)
    .fill("Een moment na mijn oefening.");
  await saveMoment(page);
  expect((await state(page)).moments).toHaveLength(1);
  expect((await state(page)).moments[0]).toMatchObject({
    before: { mood: 1, eis: null },
    activity: "",
    attempted: null,
    after: null,
    afterDate: null,
    afterTime: null,
    note: "Een moment na mijn oefening.",
  });
});

test("een begonnen nametingconcept houdt zijn eigen activiteit vast en overleeft herladen", async ({
  page,
}) => {
  await open(page, "/moment/new?activity=choose");
  await activity(page).selectOption("custom");
  const custom = page.getByLabel("Naam van de activiteit", { exact: true });
  await custom.fill("Een boek lezen");
  const before = beforeForm(page);
  await before
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption("Onrustig");
  await intensity(before, "Onrustig").fill("60");
  await saveMoment(page);
  const saved = (await state(page)).moments[0];
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  const after = page.locator(".dp-after-form");
  await after.getByRole("button", { name: "Nee", exact: true }).click();
  await expect(activity(page)).toBeDisabled();
  await expect(custom).toBeDisabled();
  await intensity(after, "Onrustig").fill("0");
  const pending = await draft(page, `moment:${saved.id}`);
  await page.reload();
  await expect(activity(page)).toBeDisabled();
  await expect(custom).toBeDisabled();
  await expect(custom).toHaveValue("Een boek lezen");
  await expect(
    after.getByRole("button", { name: "Nee", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(intensity(after, "Onrustig")).toHaveValue("0");
  expect((await state(page)).moments).toEqual([saved]);
  expect(await draft(page, `moment:${saved.id}`)).toEqual(pending);
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  expect((await state(page)).moments[0]).toMatchObject({
    id: saved.id,
    activity: "Een boek lezen",
    before: saved.before,
    attempted: false,
    after: pending.after,
  });
});

for (const hasSavedRecord of [true, false]) {
  test(`een oude nameting ${hasSavedRecord ? "met" : "zonder"} opgeslagen check-in blijft na herladen herstelbaar en vergrendelt pas na opslaan`, async ({
    page,
  }) => {
    const initial = createEmptyState();
    const original: Moment = {
      id: "older-unfinished-followup",
      date: "2026-10-10",
      time: "09:17",
      kind: "checkin",
      before: {
        mood: -1,
        eis: null,
        pans: 4,
        emotionRatings: [
          { id: "original-unrest", label: "Onrustig", intensity: 70 },
          { id: "original-relief", label: "Opgelucht", intensity: null },
        ],
      },
      activity: "Schilderen",
      attempted: null,
      after: null,
      afterDate: null,
      afterTime: null,
      emotions: [],
      note: "Mijn eerder opgeslagen check-in.",
    };
    const pending: Moment = {
      ...original,
      activity: "",
      attempted: false,
      after: {
        mood: 0,
        eis: null,
        pans: 2,
        emotionRatings: [
          { id: "original-unrest", label: "Onrustig", intensity: 0 },
          { id: "original-relief", label: "Opgelucht", intensity: null },
        ],
      },
      afterDate: "2026-10-10",
      afterTime: "10:42",
      note: "Mijn aanvulling in het oude nametingconcept.",
    };
    initial.moments = hasSavedRecord ? [original] : [];
    await page.addInitScript(
      ({ initial, pending, dataKey, draftKey }) => {
        if (!localStorage.getItem(dataKey)) {
          localStorage.setItem(dataKey, JSON.stringify(initial));
          localStorage.setItem(
            draftKey,
            JSON.stringify({
              version: 1,
              records: { [`moment:${pending.id}`]: pending },
            }),
          );
        }
      },
      { initial, pending, dataKey: DATA_KEY, draftKey: DRAFT_KEY },
    );
    await open(page, `/moment/${original.id}`);
    await expect(resumedNotice(page)).toBeVisible();
    await expect(activity(page)).toBeEnabled();
    await expect(activity(page)).toHaveValue("");
    await expect(
      page.getByText(/^Controleer de activiteit bij deze bewaarde nameting\./),
    ).toBeVisible();
    expect((await state(page)).moments).toEqual(initial.moments);
    expect(await draft(page, `moment:${original.id}`)).toEqual(pending);
    await activity(page).selectOption("custom");
    const name = page.getByLabel("Naam van de activiteit", { exact: true });
    await name.pressSequentially("E");
    await expect(name).toBeEnabled();
    await expect(activity(page)).toBeEnabled();
    expect(await draft(page, `moment:${original.id}`)).toEqual({
      ...pending,
      activity: "E",
    });
    await page.reload();
    await expect(name).toHaveValue("E");
    await expect(name).toBeEnabled();
    await expect(activity(page)).toBeEnabled();
    expect(await draft(page, `moment:${original.id}`)).toEqual({
      ...pending,
      activity: "E",
    });
    expect((await state(page)).moments).toEqual(initial.moments);
    await name.press("End");
    await name.pressSequentially("en rustige wandeling door het park");
    const repairedActivity = "Een rustige wandeling door het park";
    await expect(name).toHaveValue(repairedActivity);
    await expect(name).toBeEnabled();
    const after = page.locator(".dp-after-form");
    await expect(after).toBeVisible();
    await expect(intensity(after, "Onrustig")).toHaveValue("0");
    await expect(intensity(after, "Opgelucht")).toHaveValue("");
    await expect(
      after.getByRole("button", { name: "Nee", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const repaired = { ...pending, activity: repairedActivity };
    expect(await draft(page, `moment:${original.id}`)).toEqual(repaired);
    await beforeForm(page)
      .getByRole("button", { name: "Check-in opslaan", exact: true })
      .click();
    await expect(beforeForm(page).getByRole("alert")).toContainText(
      "Gebruik Nameting opslaan",
    );
    expect((await state(page)).moments).toEqual(initial.moments);
    await after
      .getByRole("button", { name: "Nameting opslaan", exact: true })
      .click();
    await expect(activity(page)).toBeDisabled();
    await expect(name).toBeDisabled();
    expect((await state(page)).moments).toEqual([repaired]);
    expect(await draft(page, `moment:${original.id}`)).toBeUndefined();
    await page.reload();
    await expect(activity(page)).toBeDisabled();
    await expect(name).toBeDisabled();
    await expect(name).toHaveValue(repairedActivity);
    await expect(intensity(after, "Onrustig")).toHaveValue("0");
    await expect(intensity(after, "Opgelucht")).toHaveValue("");
    await expect(resumedNotice(page)).toHaveCount(0);
    expect((await state(page)).moments).toEqual([repaired]);
  });
}

test("een nieuwe check-in met after-route opent pas een nameting nadat het moment is bewaard", async ({
  page,
}) => {
  await open(page, "/moment/new?activity=grounding&after=1");
  await expect(activity(page)).toHaveValue("5-4-3-2-1");
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  expect((await state(page))?.moments ?? []).toEqual([]);
  await beforeForm(page)
    .getByRole("button", { name: "-1 Laag", exact: true })
    .click();
  await saveMoment(page);
  const saved = (await state(page)).moments[0];
  expect(saved).toMatchObject({
    before: { mood: -1, eis: null },
    after: null,
    attempted: null,
  });
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  await expect(page.locator(".dp-after-form")).toBeVisible();
  expect((await state(page)).moments).toEqual([saved]);
});
