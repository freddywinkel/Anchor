import { expect, test, type Page } from "@playwright/test";
import { createEmptyState, type AppState } from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

const state = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    DATA_KEY,
  );
const draft = (page: Page, key = "craving:new") =>
  page.evaluate(
    ({ storageKey, key }) =>
      JSON.parse(localStorage.getItem(storageKey) || '{"records":{}}').records[
        key
      ],
    { storageKey: DRAFT_KEY, key },
  );
const choice = (page: Page) =>
  page.getByRole("combobox", { name: "Middel of gedrag", exact: true });
const customName = (page: Page) =>
  page.getByRole("textbox", { name: "Naam van middel of gedrag", exact: true });
async function seed(page: Page, initial: AppState) {
  await page.addInitScript(
    ({ key, initial }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(initial));
    },
    { key: DATA_KEY, initial },
  );
}
async function open(page: Page, route = "/craving/new") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}
async function save(page: Page, edit = false) {
  await page
    .getByRole("button", {
      name: edit ? "Wijzigingen opslaan" : "Craving opslaan",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
}

test("craving kiest geen middel uit een doel en gebruikt dezelfde vaste opties; keuze wordt opgeslagen en blijft bewerkbaar", async ({
  page,
}) => {
  const initial = createEmptyState();
  initial.goals = [
    {
      id: "test-goal",
      target: "Alcohol",
      name: "Alcohol",
      direction: "Minderen",
      note: "",
    },
  ];
  await seed(page, initial);
  await open(page);
  await expect(choice(page)).toHaveValue("");
  await expect(customName(page)).toHaveCount(0);
  expect(await draft(page)).toBeUndefined();
  const labels = await choice(page).locator("option").allTextContents();
  expect(labels).toEqual([
    "Niet ingevuld",
    "Alcohol",
    "Nicotine",
    "Cannabis",
    "Cocaine",
    "3-MMC",
    "Ander middel of gedrag",
  ]);
  await open(page, "/plan");
  await page
    .getByRole("button", { name: "Doel toevoegen", exact: true })
    .click();
  const goalLabels = await choice(page).locator("option").allTextContents();
  expect(labels.slice(1, -1)).toEqual(
    goalLabels.filter(
      (label) =>
        !["Kies een middel of gedrag", "Ander middel", "Ander gedrag"].includes(
          label,
        ),
    ),
  );
  await open(page);
  for (const substance of labels.slice(1, -1)) {
    await choice(page).selectOption(substance);
    expect((await draft(page)).substance).toBe(substance);
  }
  await choice(page).selectOption("Cannabis");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Ik merkte drang na het eten.");
  await save(page);
  await expect(
    page.getByText("Middel of gedrag: Cannabis", { exact: true }),
  ).toBeVisible();
  const saved = (await state(page)).cravings[0];
  expect(saved.substance).toBe("Cannabis");
  await open(page, `/craving/${saved.id}`);
  await page.reload();
  await expect(choice(page)).toHaveValue("Cannabis");
  await choice(page).selectOption("Cocaine");
  await save(page, true);
  expect((await state(page)).cravings).toEqual([
    { ...saved, substance: "Cocaine" },
  ]);
  await expect(
    page.getByText("Middel of gedrag: Cocaine", { exact: true }),
  ).toBeVisible();
});

test("eigen middelnaam krijgt focus, blijft in een herladen concept en wordt zonder andere velden te wijzigen opgeslagen", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const initial = createEmptyState();
  initial.theme = "light";
  initial.palette = "ocean";
  await seed(page, initial);
  await open(page);
  await choice(page).selectOption("__custom__");
  await expect(customName(page)).toBeFocused();
  await expect(customName(page)).toHaveAttribute("maxlength", "120");
  await customName(page).fill("Ketamine & uitgaan");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Ik leg dit in mijn eigen woorden vast.");
  const pending = await draft(page);
  await page.reload();
  await expect(choice(page)).toHaveValue("__custom__");
  await expect(customName(page)).toHaveValue("Ketamine & uitgaan");
  expect(await draft(page)).toEqual(pending);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await customName(page).focus();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  for (const control of [choice(page), customName(page)]) {
    const bounds = await control.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({
    path: testInfo.outputPath("craving-substance-custom-320-large-text.png"),
  });
  await customName(page).fill("  Ketamine & uitgaan  ");
  await save(page);
  const saved = (await state(page)).cravings[0];
  expect(saved).toEqual({ ...pending, substance: "Ketamine & uitgaan" });
  expect(await draft(page)).toBeUndefined();
  await expect(
    page.getByText("Middel of gedrag: Ketamine & uitgaan", { exact: true }),
  ).toBeVisible();
  await open(page, `/craving/${saved.id}`);
  await expect(choice(page)).toHaveValue("__custom__");
  await expect(customName(page)).toHaveValue("Ketamine & uitgaan");
});

test("een eigen naam leegmaken en Niet ingevuld kiezen verwijderen het optionele veld uit concept en registratie", async ({
  page,
}) => {
  await open(page);
  await choice(page).selectOption("__custom__");
  await customName(page).fill("Online gokken");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Dit is de overige invoer.");
  await save(page);
  const original = (await state(page)).cravings[0];
  const { substance: _substance, ...withoutSubstance } = original;
  await open(page, `/craving/${original.id}`);
  await customName(page).fill("");
  expect(await draft(page, `craving:${original.id}`)).toEqual(withoutSubstance);
  await page.reload();
  await expect(choice(page)).toHaveValue("");
  await expect(customName(page)).toHaveCount(0);
  await save(page, true);
  expect((await state(page)).cravings).toEqual([withoutSubstance]);
  await open(page, `/craving/${original.id}`);
  await choice(page).selectOption("3-MMC");
  expect((await draft(page, `craving:${original.id}`)).substance).toBe("3-MMC");
  await choice(page).selectOption("");
  expect(await draft(page, `craving:${original.id}`)).toEqual(withoutSubstance);
  await save(page, true);
  expect((await state(page)).cravings).toEqual([withoutSubstance]);
  await expect(page.getByText(/^Middel of gedrag:/)).toHaveCount(0);
});

test("oude cravings blijven zonder middelveld; alleen een middel kiezen vervangt de benodigde eigen beschrijving niet", async ({
  page,
}) => {
  const initial = createEmptyState();
  const legacy = {
    id: "legacy-craving",
    date: "2026-10-10",
    time: "13:15",
    situation: "",
    thought: "Eerder vastgelegde gedachte",
    bodySensation: "",
    emotion: "",
    behavior: "",
  };
  initial.cravings = [legacy];
  await seed(page, initial);
  await open(page, `/craving/${legacy.id}`);
  await expect(choice(page)).toHaveValue("");
  await save(page, true);
  expect((await state(page)).cravings).toEqual([legacy]);
  await open(page);
  await choice(page).selectOption("Alcohol");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.locator(".anchor-craving-form [role=alert]")).toContainText(
    "ten minste één onderdeel",
  );
  await expect(choice(page)).toHaveValue("Alcohol");
  expect((await state(page)).cravings).toEqual([legacy]);
  expect((await draft(page)).substance).toBe("Alcohol");
});
