import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  today,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
} from "../src/lib/storage";

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_STORAGE_KEY,
  );
async function ready(page: Page, route: string) {
  await page.goto(`./#/${route}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
async function failWrites(page: Page, kind: string) {
  await page.evaluate(
    ({ dataKey, draftKey, kind }) => {
      const original = Storage.prototype.setItem;
      const flags = { data: true, cleanup: false };
      (
        window as Window & { secondaryWriteFailures?: typeof flags }
      ).secondaryWriteFailures = flags;
      Storage.prototype.setItem = function (key, value) {
        if (flags.data && key === dataKey)
          throw new DOMException(
            "Synthetic save failure",
            "QuotaExceededError",
          );
        if (
          flags.cleanup &&
          key === draftKey &&
          !JSON.parse(value).records[kind]
        )
          throw new DOMException(
            "Synthetic cleanup failure",
            "QuotaExceededError",
          );
        return original.call(this, key, value);
      };
    },
    { dataKey: STORAGE_KEY, draftKey: DRAFT_STORAGE_KEY, kind },
  );
}
async function setFailures(page: Page, data: boolean, cleanup: boolean) {
  await page.evaluate(
    ({ data, cleanup }) => {
      Object.assign(
        (
          window as Window & {
            secondaryWriteFailures?: { data: boolean; cleanup: boolean };
          }
        ).secondaryWriteFailures!,
        { data, cleanup },
      );
    },
    { data, cleanup },
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

for (const kind of ["goal", "growth"] as const) {
  test(`${kind}: geslaagde opslag met mislukte conceptopruiming wist een oude savefout en dupliceert niet`, async ({
    page,
  }) => {
    const draft =
      kind === "goal"
        ? {
            id: "pending-goal",
            target: "Alcohol",
            name: "Alcohol",
            direction: "Stoppen",
            note: "Een synthetisch doel",
          }
        : {
            id: "pending-growth",
            date: today(),
            text: "Een synthetisch klein moment",
            favorite: false,
          };
    await page.addInitScript(
      ({ state, draft, kind, dataKey, draftKey }) => {
        if (!localStorage.getItem(dataKey))
          localStorage.setItem(dataKey, JSON.stringify(state));
        if (!localStorage.getItem(draftKey))
          localStorage.setItem(
            draftKey,
            JSON.stringify({ version: 1, records: { [kind]: draft } }),
          );
      },
      {
        state: createEmptyState(),
        draft,
        kind,
        dataKey: STORAGE_KEY,
        draftKey: DRAFT_STORAGE_KEY,
      },
    );
    await ready(page, kind === "goal" ? "plan" : "growth");
    const form = page.locator(
      kind === "goal" ? ".dp-goal-editor" : ".dp-growth-compose",
    );
    await failWrites(page, kind);
    await form
      .getByRole("button", {
        name: kind === "goal" ? "Doel opslaan" : "Moment opslaan",
        exact: true,
      })
      .click();
    await expect(
      form.getByRole("alert").filter({ hasText: "Opslaan is niet gelukt." }),
    ).toBeFocused();
    expect(
      (await stored(page))[kind === "goal" ? "goals" : "growth"],
    ).toHaveLength(0);
    await setFailures(page, false, true);
    await form
      .getByRole("button", {
        name: kind === "goal" ? "Doel opslaan" : "Moment opslaan",
        exact: true,
      })
      .click();
    const partial = form.getByRole("alert").filter({
      hasText: "is opgeslagen, maar het concept kon niet worden opgeruimd",
    });
    await expect(partial).toBeFocused();
    await expect(partial).toBeInViewport();
    await expect(form.getByText(/Opslaan is niet gelukt\./)).toHaveCount(0);
    const savedState = await stored(page);
    const saved = savedState[kind === "goal" ? "goals" : "growth"];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(draft.id);
    await form
      .getByRole("button", { name: "Afronden opnieuw proberen", exact: true })
      .click();
    expect(await stored(page)).toEqual(savedState);
    await expect(partial).toBeFocused();
    await form
      .getByRole("textbox", {
        name:
          kind === "goal"
            ? "Waarom dit bij mij past (optioneel)"
            : "Moment bewerken",
        exact: true,
      })
      .fill("Een echte wijziging na de opslag");
    await expect(
      form.getByRole("button", {
        name: "Afronden opnieuw proberen",
        exact: true,
      }),
    ).toHaveCount(0);
    await form
      .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
      .click();
    const editedState = await stored(page);
    expect(editedState.revision).toBe(savedState.revision + 1);
    expect(editedState[kind === "goal" ? "goals" : "growth"]).toHaveLength(1);
    expect(
      editedState[kind === "goal" ? "goals" : "growth"][0][
        kind === "goal" ? "note" : "text"
      ],
    ).toBe("Een echte wijziging na de opslag");
    await setFailures(page, false, false);
    await form
      .getByRole("button", { name: "Afronden opnieuw proberen", exact: true })
      .click();
    expect(await stored(page)).toEqual(editedState);
    expect((await drafts(page))[kind]).toBeUndefined();
    if (kind === "goal") await expect(form).toHaveCount(0);
    else
      await expect(
        page.getByRole("textbox", {
          name: "Wat wil je onthouden?",
          exact: true,
        }),
      ).toHaveValue("");
  });
}

test("klein moment openen maakt geen concept; alleen gewijzigde invoer blokkeert ander bewerken", async ({
  page,
}) => {
  const state = createEmptyState();
  state.growth = [
    { id: "first", date: today(), text: "Eerste moment", favorite: false },
    { id: "second", date: today(), text: "Tweede moment", favorite: false },
  ];
  await page.addInitScript(
    ({ state, key }) => localStorage.setItem(key, JSON.stringify(state)),
    { state, key: STORAGE_KEY },
  );
  await ready(page, "growth");
  await page
    .getByRole("button", {
      name: "Moment bewerken: Eerste moment",
      exact: true,
    })
    .click();
  expect((await drafts(page)).growth).toBeUndefined();
  const second = page.getByRole("button", {
    name: "Moment bewerken: Tweede moment",
    exact: true,
  });
  await expect(second).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Als favoriet markeren: Eerste moment",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Als favoriet markeren", exact: true }),
  ).toBeChecked();
  const input = page.getByRole("textbox", {
    name: "Moment bewerken",
    exact: true,
  });
  await input.fill("Eerste moment met wijziging");
  await expect(second).toBeDisabled();
  expect((await drafts(page)).growth.text).toBe("Eerste moment met wijziging");
  await input.fill("Eerste moment");
  await expect(second).toBeEnabled();
  expect((await drafts(page)).growth).toBeUndefined();
  await second.click();
  await expect(input).toHaveValue("Tweede moment");
  await page
    .getByRole("button", { name: "Bewerken sluiten", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Wat wil je onthouden?", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", {
      name: "Moment bewerken: Eerste moment",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Moment verwijderen: Eerste moment",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  expect(
    (await stored(page)).growth.map((entry: { id: string }) => entry.id),
  ).toEqual(["second"]);
  await expect(
    page.getByRole("textbox", { name: "Wat wil je onthouden?", exact: true }),
  ).toHaveValue("");
});

test("plan bewaart invoer bij fouten en toont na afgeronde opslag een duidelijke opgeslagen status", async ({
  page,
}) => {
  await ready(page, "plan");
  const form = page.locator(".dp-personal-plan");
  const save = form.getByRole("button", {
    name: "Mijn plan opslaan",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await form
    .getByRole("textbox", { name: "Dit kan ik doen", exact: true })
    .fill("Even naar buiten");
  await failWrites(page, "plan");
  await save.click();
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(
    form.getByRole("textbox", { name: "Dit kan ik doen", exact: true }),
  ).toHaveValue("Even naar buiten");
  await setFailures(page, false, true);
  await save.click();
  await expect(form.getByRole("alert")).toContainText(
    "Je plan is opgeslagen, maar het concept kon niet worden opgeruimd.",
  );
  await expect(form.getByRole("alert")).toBeFocused();
  expect((await stored(page)).plan.action).toBe("Even naar buiten");
  const savedState = await stored(page);
  const finish = form.getByRole("button", {
    name: "Afronden opnieuw proberen",
    exact: true,
  });
  await expect(finish).toBeEnabled();
  await finish.click();
  expect(await stored(page)).toEqual(savedState);
  await form
    .getByRole("textbox", { name: "Dit kan ik doen", exact: true })
    .fill("Even naar buiten en iemand bellen");
  await expect(finish).toHaveCount(0);
  await save.click();
  const editedState = await stored(page);
  expect(editedState.revision).toBe(savedState.revision + 1);
  expect(editedState.plan.action).toBe("Even naar buiten en iemand bellen");
  await setFailures(page, false, false);
  await finish.click();
  expect(await stored(page)).toEqual(editedState);
  await expect(save).toHaveCount(0);
  await expect(form.getByRole("status")).toHaveText("Je plan is opgeslagen.");
  expect((await drafts(page)).plan).toBeUndefined();
  await form
    .getByRole("button", { name: "Mijn plan bewerken", exact: true })
    .click();
  await form
    .getByRole("textbox", { name: "Hier vind ik steun", exact: true })
    .fill("Iemand die ik vertrouw");
  await expect(save).toBeEnabled();
  await expect(form.getByRole("status")).toHaveCount(0);
});

test("een doel verwijderen bewaart de bevestiging bij fouten en sluit die pas na succes", async ({
  page,
}) => {
  const state = createEmptyState();
  state.goals = [
    {
      id: "delete-goal",
      target: "Alcohol",
      name: "Alcohol",
      direction: "Stoppen",
      note: "",
    },
  ];
  await page.addInitScript(
    ({ state, key }) => localStorage.setItem(key, JSON.stringify(state)),
    { state, key: STORAGE_KEY },
  );
  await ready(page, "plan");
  await page
    .getByRole("button", { name: "Verwijder doel Alcohol", exact: true })
    .click();
  const confirmation = page.getByRole("group", {
    name: "Verwijderen van Alcohol bevestigen",
    exact: true,
  });
  await failWrites(page, "goal");
  await confirmation
    .getByRole("button", { name: "Ja, doel verwijderen", exact: true })
    .click();
  await expect(confirmation.getByRole("alert")).toBeFocused();
  await expect(confirmation.getByRole("alert")).toBeInViewport();
  expect((await stored(page)).goals).toEqual(state.goals);
  await setFailures(page, false, false);
  await confirmation
    .getByRole("button", { name: "Ja, doel verwijderen", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect((await stored(page)).goals).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Doel toevoegen", exact: true }),
  ).toBeFocused();
});
