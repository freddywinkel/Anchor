import { expect, test, type Page } from "@playwright/test";
import { createEmptyState } from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function open(page: Page, route = "/today") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}
const state = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    DATA_KEY,
  );

for (const theme of ["light", "dark"] as const) {
  test(`de twee startknoppen zijn gelijkwaardig, leesbaar en openen hun eigen formulier in ${theme}`, async ({
    page,
  }, testInfo) => {
    const initial = createEmptyState();
    initial.theme = theme;
    initial.palette = "ocean";
    await page.addInitScript(
      ({ key, initial }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(initial));
      },
      { key: DATA_KEY, initial },
    );
    await open(page);
    const hero = page.locator(".dp-now-panel");
    const checkin = hero.getByRole("button", {
      name: "Check-in toevoegen",
      exact: true,
    });
    const craving = hero.getByRole("button", {
      name: "Craving vastleggen",
      exact: true,
    });
    for (const scenario of [
      { width: 1440, height: 1000, text: "100%" },
      { width: 390, height: 844, text: "100%" },
      { width: 320, height: 900, text: "200%" },
    ]) {
      await page.setViewportSize({
        width: scenario.width,
        height: scenario.height,
      });
      await page.evaluate(async (fontSize) => {
        document.documentElement.style.fontSize = fontSize;
        await document.fonts.ready;
      }, scenario.text);
      const buttons = [];
      for (const button of [checkin, craving]) {
        await expect(button).toBeVisible();
        buttons.push(
          await button.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const label = element.querySelector("span")!;
            const range = document.createRange();
            range.selectNodeContents(label);
            const wordsUnbroken = [
              ...(label.textContent || "").matchAll(/\S+/g),
            ].every((word) => {
              const wordRange = document.createRange();
              wordRange.setStart(label.firstChild!, word.index);
              wordRange.setEnd(label.firstChild!, word.index + word[0].length);
              return wordRange.getClientRects().length === 1;
            });
            return {
              width: bounds.width,
              height: bounds.height,
              left: bounds.left,
              right: bounds.right,
              wordsUnbroken,
              textFits: [...range.getClientRects()].every(
                (rect) =>
                  rect.left >= bounds.left &&
                  rect.right <= bounds.right &&
                  rect.top >= bounds.top &&
                  rect.bottom <= bounds.bottom,
              ),
              appearance: {
                background: style.backgroundColor,
                color: style.color,
                border: style.borderColor,
                radius: style.borderRadius,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
              },
            };
          }),
        );
      }
      expect(Math.abs(buttons[0].width - buttons[1].width)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(buttons[0].height - buttons[1].height),
      ).toBeLessThanOrEqual(1);
      expect(buttons[0].appearance).toEqual(buttons[1].appearance);
      for (const button of buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.left).toBeGreaterThanOrEqual(0);
        expect(button.right).toBeLessThanOrEqual(scenario.width);
        expect(button.textFits).toBe(true);
        expect(button.wordsUnbroken).toBe(true);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(scenario.width);
      if (scenario.width === 390) {
        await hero.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(`home-actions-${theme}-390.png`),
        });
      }
    }
    const initialState = await state(page);
    for (const entry of [
      {
        button: checkin,
        route: /#\/moment\/new$/,
        heading: "Hoe gaat het nu?",
        field: "Datum momentopname",
      },
      {
        button: craving,
        route: /#\/craving\/new$/,
        heading: "Craving vastleggen",
        field: "Gedachte",
      },
    ]) {
      await entry.button.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(entry.button).toBeFocused();
      expect(
        await entry.button.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
          );
        }),
      ).toBe(true);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(entry.route);
      await expect(
        page.getByRole("heading", { name: entry.heading, exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(entry.field, { exact: true })).toHaveCount(
        1,
      );
      expect(await state(page)).toEqual(initialState);
      const back = page.locator("main .dp-back");
      await expect(back).toHaveAccessibleName("Terug naar Vandaag");
      await back.click();
      await expect(page).toHaveURL(/#\/today$/);
    }
  });
}

test("Kleine momenten heeft dezelfde naam en bestemming op Vandaag, desktop en in het mobiele menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Kleine momenten bewaren", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Moment toevoegen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/growth$/);
  await expect(
    page.getByRole("heading", { name: "Kleine momenten", exact: true }),
  ).toBeVisible();
  await open(page);
  await page
    .getByRole("link", { name: "Kleine momenten", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/growth$/);
  await expect(
    page.getByRole("heading", { name: "Kleine momenten", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Meer in Anchor", exact: true })
    .getByRole("link", { name: "Kleine momenten", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/growth$/);
  await expect(
    page.getByRole("heading", { name: "Kleine momenten", exact: true }),
  ).toBeVisible();
  expect((await state(page))?.growth ?? []).toEqual([]);
  expect((await state(page))?.moments ?? []).toEqual([]);
});

test("Behouden annuleert verwijderen zonder de onopgeslagen cravingwijziging op te slaan of weg te gooien", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const thought = page.getByLabel("Gedachte", { exact: true });
  await thought.fill("Mijn oorspronkelijke tekst.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = await state(page);
  await page.locator(".dp-today-moments .dp-moment-row").click();
  await expect(
    page.getByRole("heading", { name: "Je craving", exact: true }),
  ).toBeVisible();
  await thought.fill("Deze wijziging is nog een concept.");
  const draftsBefore = await page.evaluate(
    (key) => localStorage.getItem(key),
    DRAFT_KEY,
  );
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("button", { name: "Behouden", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Behouden", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(thought).toHaveValue("Deze wijziging is nog een concept.");
  expect(await state(page)).toEqual(saved);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY),
  ).toBe(draftsBefore);
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  expect((await state(page)).cravings[0]).toMatchObject({
    id: saved.cravings[0].id,
    thought: "Deze wijziging is nog een concept.",
  });
});
