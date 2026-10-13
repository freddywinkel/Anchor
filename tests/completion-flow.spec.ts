import { expect, test, type Locator, type Page } from "@playwright/test";

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
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_KEY,
  );
async function open(page: Page, route = "/craving/new") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByLabel("Gedachte", { exact: true })).toBeEnabled();
}
async function create(page: Page, text = "Een synthetisch cravingmoment") {
  await open(page);
  await page.getByLabel("Gedachte", { exact: true }).fill(text);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  return (await state(page)).cravings[0];
}
async function failWrites(page: Page, key: string) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test: opslag vol", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, key);
}
async function restoreWrites(page: Page) {
  await page.evaluate(() => (window as any).__restoreStorage());
}
async function visibleFocus(error: Locator) {
  await expect(error).toBeFocused();
  await expect
    .poll(() =>
      error.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const nav = document
          .querySelector(".dp-bottom-nav")!
          .getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= nav.top + 1;
      }),
    )
    .toBe(true);
}

test("craving opslaan en aanpassen sluiten af op Vandaag met één record en zonder open concept", async ({
  page,
}) => {
  const original = await create(page, "Ik neem een moment om stil te staan.");
  expect((await state(page)).cravings).toHaveLength(1);
  expect(await drafts(page)).toEqual({});
  await expect(
    page.getByRole("button", { name: "Craving opslaan", exact: true }),
  ).toHaveCount(0);
  await open(page, `/craving/${original.id}`);
  await page
    .getByLabel("Gedrag (wat deed je?)", { exact: true })
    .fill("Ik liep even naar buiten.");
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toEqual([
    { ...original, behavior: "Ik liep even naar buiten." },
  ]);
  expect(await drafts(page)).toEqual({});
  await page.reload();
  expect((await state(page)).cravings).toHaveLength(1);
  expect(await drafts(page)).toEqual({});
});

test("een mislukte cravingopslag houdt invoer en concept vast en toont dezelfde fout opnieuw in beeld", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Deze tekst moet behouden blijven.");
  const pending = await drafts(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await failWrites(page, DATA_KEY);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "Craving opslaan", exact: true })
      .click();
    const error = page.locator(".anchor-craving-form [role=alert]");
    await expect(error).toContainText("Je ingevulde tekst staat hier nog");
    await visibleFocus(error);
    expect(await state(page)).toBeNull();
    expect(await drafts(page)).toEqual(pending);
    await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
      "Deze tekst moet behouden blijven.",
    );
  }
  await restoreWrites(page);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toHaveLength(1);
  expect(await drafts(page)).toEqual({});
});

test("na opgeslagen craving met mislukt conceptopruimen voert opnieuw proberen alleen het opruimen uit", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Al veilig opgeslagen, concept nog opruimen.");
  const pending = await drafts(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await failWrites(page, DRAFT_KEY);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/craving\/new$/);
  const error = page.locator(".anchor-craving [role=alert]");
  await expect(error).toHaveText(
    "Je craving is opgeslagen, maar het concept kon niet worden opgeruimd. Probeer opnieuw.",
  );
  await visibleFocus(error);
  const saved = await state(page);
  expect(saved.cravings).toHaveLength(1);
  expect(saved.cravings[0].id).toBe(pending["craving:new"].id);
  expect(await drafts(page)).toEqual(pending);
  await expect(page.locator(".anchor-craving form")).toHaveCount(0);
  const retry = page.getByRole("button", {
    name: "Afronden opnieuw proberen",
    exact: true,
  });
  await retry.click();
  await visibleFocus(error);
  expect(await state(page)).toEqual(saved);
  await page.screenshot({
    path: testInfo.outputPath("craving-cleanup-320-large-text.png"),
  });
  await restoreWrites(page);
  await retry.click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await state(page)).toEqual(saved);
  expect(await drafts(page)).toEqual({});
});

test("mislukt verwijderen behoudt craving en concept; na gedeeltelijk verwijderen ruimt retry alleen het concept op", async ({
  page,
}) => {
  const original = await create(page);
  await open(page, `/craving/${original.id}`);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Een nog niet opgeslagen aanpassing.");
  const savedBefore = await state(page);
  const pending = await drafts(page);
  await failWrites(page, DATA_KEY);
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page.locator(".anchor-craving-form [role=alert]")).toBeFocused();
  await expect(page.locator(".anchor-craving-form [role=alert]")).toHaveText(
    "Verwijderen is niet gelukt. Je craving blijft bewaard.",
  );
  expect(await state(page)).toEqual(savedBefore);
  expect(await drafts(page)).toEqual(pending);
  await restoreWrites(page);
  await failWrites(page, DRAFT_KEY);
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  const error = page.locator(".anchor-craving [role=alert]");
  await expect(error).toHaveText(
    "Je craving is verwijderd, maar het concept kon niet worden opgeruimd. Probeer opnieuw.",
  );
  await expect(error).toBeFocused();
  const deleted = await state(page);
  expect(deleted.cravings).toEqual([]);
  expect(await drafts(page)).toEqual(pending);
  await expect(
    page.getByRole("button", { name: "Craving opslaan", exact: true }),
  ).toHaveCount(0);
  await restoreWrites(page);
  await page
    .getByRole("button", { name: "Afronden opnieuw proberen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect(await state(page)).toEqual(deleted);
  expect(await drafts(page)).toEqual({});
  await page.reload();
  expect((await state(page)).cravings).toEqual([]);
  expect(await drafts(page)).toEqual({});
});

test("een ongewijzigde craving verwijderen behoeft geen schrijfactie voor een afwezig concept", async ({
  page,
}) => {
  const original = await create(page);
  await open(page, `/craving/${original.id}`);
  expect(await drafts(page)).toEqual({});
  await failWrites(page, DRAFT_KEY);
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toEqual([]);
  expect(await drafts(page)).toEqual({});
});
