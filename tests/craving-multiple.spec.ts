import { expect, test, type Page } from "@playwright/test";

const DATA = "anchor.app.data.v1";
const DRAFT = "anchor.app.drafts.v1";
const choice = (page: Page, index = 1) =>
  page.getByRole("combobox", {
    name: `Middel of gedrag${index === 1 ? "" : ` ${index}`}`,
    exact: true,
  });
const name = (page: Page, index = 1) =>
  page.getByRole("textbox", {
    name: `Naam van middel of gedrag${index === 1 ? "" : ` ${index}`}`,
    exact: true,
  });
const state = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), DATA);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT,
  );
const add = (page: Page) =>
  page
    .getByRole("button", { name: "Nog een middel toevoegen", exact: true })
    .click();
const save = (page: Page) =>
  page.getByRole("button", { name: "Craving opslaan", exact: true }).click();

for (const width of [320, 390, 820]) {
  test(`craving opslaan staat onder de laatste vraag en buiten beeld aan het begin bij ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./#/craving/new");
    await expect(
      page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
    ).toBeVisible();
    const button = page.getByRole("button", {
      name: "Craving opslaan",
      exact: true,
    });
    expect(
      await button.evaluate(
        (el) => el.getBoundingClientRect().top >= innerHeight,
      ),
    ).toBe(true);
    await choice(page).selectOption("Cocaine");
    expect(
      await button.evaluate(
        (el) => el.getBoundingClientRect().top >= innerHeight,
      ),
    ).toBe(true);
    await page
      .getByLabel("Gedrag (wat deed je?)", { exact: true })
      .fill("Ik ging naar buiten.");
    await button.scrollIntoViewIfNeeded();
    const bounds = await page.evaluate(() => {
      const actions = document.querySelector(".anchor-craving-save-actions")!;
      const button = actions.querySelector("button")!.getBoundingClientRect();
      const field = document
        .querySelector("textarea[id$='-behavior']")!
        .getBoundingClientRect();
      const nav = document
        .querySelector(".dp-bottom-nav")!
        .getBoundingClientRect();
      return {
        position: getComputedStyle(actions).position,
        buttonTop: button.top,
        buttonBottom: button.bottom,
        fieldBottom: field.bottom,
        navTop: nav.top,
        navHeight: nav.height,
      };
    });
    expect(bounds.position).toBe("static");
    expect(bounds.buttonTop).toBeGreaterThan(bounds.fieldBottom);
    if (bounds.navHeight)
      expect(bounds.buttonBottom).toBeLessThanOrEqual(bounds.navTop);
  });
}

test("meerdere middelen en eigen naam blijven één craving met een herlaadbaar concept en dezelfde identiteit bij aanpassen", async ({
  page,
}) => {
  await page.goto("./#/craving/new");
  await choice(page).selectOption("Cocaine");
  await add(page);
  await expect(choice(page, 2)).toBeFocused();
  await choice(page, 2).selectOption("3-MMC");
  await add(page);
  await choice(page, 3).selectOption("__custom__");
  await expect(name(page, 3)).toBeFocused();
  await name(page, 3).fill("Mijn eigen middel");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Ik voelde tegelijk trek in verschillende middelen.");
  const pending = (await drafts(page))["craving:new"];
  expect(pending.substances).toEqual(["Cocaine", "3-MMC", "Mijn eigen middel"]);
  expect(pending).not.toHaveProperty("substance");
  await page.reload();
  expect((await drafts(page))["craving:new"]).toEqual(pending);
  await expect(choice(page)).toHaveValue("Cocaine");
  await expect(choice(page, 2)).toHaveValue("3-MMC");
  await expect(name(page, 3)).toHaveValue("Mijn eigen middel");
  await save(page);
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toEqual([pending]);
  await page.goto(`./#/craving/${pending.id}`);
  await page
    .getByRole("button", { name: "Middel 2 verwijderen: 3-MMC", exact: true })
    .click();
  await expect(choice(page, 2)).toBeFocused();
  await expect(name(page, 2)).toHaveValue("Mijn eigen middel");
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toEqual([
    { ...pending, substances: ["Cocaine", "Mijn eigen middel"] },
  ]);
});

test("lege extra rij en dubbele eigen naam blijven als concept bewaard zonder ongeldige registratie", async ({
  page,
}) => {
  await page.goto("./#/craving/new");
  await choice(page).selectOption("Cocaine");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Mijn overige tekst blijft staan.");
  await add(page);
  expect((await drafts(page))["craving:new"].substances).toEqual([
    "Cocaine",
    "",
  ]);
  await page.reload();
  await expect(choice(page, 2)).toHaveValue("");
  await expect(
    choice(page, 2).locator('option[value="Cocaine"]'),
  ).toHaveAttribute("disabled", "");
  await choice(page, 2).selectOption("__custom__");
  await name(page, 2).fill(" cocaine ");
  await save(page);
  await expect(name(page, 2)).toHaveAttribute("aria-invalid", "true");
  expect(await state(page)).toBeNull();
  expect((await drafts(page))["craving:new"].substances).toEqual([
    "Cocaine",
    " cocaine ",
  ]);
  await page.reload();
  await expect(name(page, 2)).toHaveValue(" cocaine ");
  await name(page, 2).fill("  Ketamine  ");
  await save(page);
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings[0].substances).toEqual([
    "Cocaine",
    "Ketamine",
  ]);
});

test("eerste middel verwijderen behoudt de eigen naam, focus en overige invoer", async ({
  page,
}) => {
  await page.goto("./#/craving/new");
  await choice(page).selectOption("Alcohol");
  await add(page);
  await choice(page, 2).selectOption("__custom__");
  await name(page, 2).fill("Online gokken");
  await page.getByLabel("Gedachte", { exact: true }).fill("Mijn tekst");
  await page
    .getByRole("button", { name: "Middel 1 verwijderen: Alcohol", exact: true })
    .click();
  await expect(choice(page)).toBeFocused();
  await expect(choice(page)).toHaveValue("__custom__");
  await expect(name(page)).toHaveValue("Online gokken");
  expect((await drafts(page))["craving:new"].substance).toBe("Online gokken");
  expect((await drafts(page))["craving:new"]).not.toHaveProperty("substances");
  await choice(page).selectOption("");
  await save(page);
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings[0]).not.toHaveProperty("substance");
  expect((await state(page)).cravings[0]).not.toHaveProperty("substances");
  expect((await state(page)).cravings[0].thought).toBe("Mijn tekst");
});

test("opslagfout bij meerdere middelen behoudt het volledige concept voor een nieuwe poging", async ({
  page,
}) => {
  await page.goto("./#/craving/new");
  await choice(page).selectOption("Cocaine");
  await add(page);
  await choice(page, 2).selectOption("3-MMC");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Nog steeds aanwezig");
  const pending = (await drafts(page))["craving:new"];
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as any).restoreMultipleTest = () =>
      (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, DATA);
  await save(page);
  await expect(
    page.locator(".anchor-craving-form").getByRole("alert"),
  ).toBeFocused();
  expect(await state(page)).toBeNull();
  expect((await drafts(page))["craving:new"]).toEqual(pending);
  await page.evaluate(() => (window as any).restoreMultipleTest());
  await save(page);
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings).toEqual([pending]);
  expect((await drafts(page))["craving:new"]).toBeUndefined();
});

test("meerdere lange eigen namen passen bij 320 pixels en dubbele tekstgrootte", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("./#/craving/new");
  await choice(page).selectOption("__custom__");
  await name(page).fill("Een lange eigen naam ".repeat(5));
  await add(page);
  await choice(page, 2).selectOption("__custom__");
  await name(page, 2).fill("Een andere naam ".repeat(6));
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
  await page.getByLabel("Gedachte", { exact: true }).focus();
  await name(page, 2).focus();
  await expect
    .poll(() =>
      name(page, 2).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const nav = document
          .querySelector(".dp-bottom-nav")!
          .getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= nav.top
        );
      }),
    )
    .toBe(true);
});
