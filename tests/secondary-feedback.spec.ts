import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  today,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
} from "../src/lib/storage";

const fixture = () => ({
  ...createEmptyState(),
  growth: Array.from({ length: 10 }, (_, index) => ({
    id: `feedback-${index}`,
    date: today(),
    text: `Een fijn testmoment ${index}`,
    favorite: false,
  })),
});
const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
async function open(page: Page, route: "growth" | "settings") {
  await page.goto(`./#/${route}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    route === "growth" ? "Mijn groei" : "Instellingen",
  );
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
async function failWrites(page: Page) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      original.call(this, name, value);
    };
    (window as Window & { restoreAnchorWrite: () => void }).restoreAnchorWrite =
      () => {
        Storage.prototype.setItem = original;
      };
  }, STORAGE_KEY);
}
const restoreWrites = (page: Page) =>
  page.evaluate(() =>
    (
      window as Window & { restoreAnchorWrite: () => void }
    ).restoreAnchorWrite(),
  );
async function visibleFeedback(page: Page, message: string) {
  const error = page.getByRole("alert").filter({ hasText: message });
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  await expect(error).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: fixture() },
  );
});

test("de datumgrens bij een fijn moment wordt in het veld herkend en bewaart het concept", async ({
  page,
}) => {
  await open(page, "growth");
  const saved = await stored(page);
  await page
    .getByLabel("Wat wil je onthouden?", { exact: true })
    .fill("Een herinnering met een bewust aangepaste datum.");
  const date = page.getByLabel("Datum", { exact: true });
  await date.fill("0026-10-12");
  await page
    .getByRole("button", { name: "Moment bewaren", exact: true })
    .click();
  await expect(date).toBeFocused();
  expect(
    await date.evaluate(
      (element: HTMLInputElement) => element.validity.rangeUnderflow,
    ),
  ).toBe(true);
  expect(await stored(page)).toBe(saved);
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).records.growth,
    DRAFT_STORAGE_KEY,
  );
  expect(draft).toMatchObject({
    date: "0026-10-12",
    text: "Een herinnering met een bewust aangepaste datum.",
  });
  // Some browser date controls do not enforce their native min/max validity.
  await page.locator(".dp-growth-compose").evaluate((form: HTMLFormElement) => {
    form.noValidate = true;
  });
  await page
    .getByRole("button", { name: "Moment bewaren", exact: true })
    .click();
  await expect(date).toBeFocused();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Kies een geldige datum tussen 1 januari 1900 en vandaag.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await stored(page)).toBe(saved);
  await date.fill("1900-01-01");
  await page
    .getByRole("button", { name: "Moment bewaren", exact: true })
    .click();
  const after = JSON.parse((await stored(page))!);
  expect(after.growth).toHaveLength(11);
  expect(after.growth[0]).toMatchObject({
    date: "1900-01-01",
    text: draft.text,
  });
});

test("een mislukte favorietwijziging geeft zichtbare feedback bij het moment en bewaart de gegevens", async ({
  page,
}) => {
  await open(page, "growth");
  const saved = await stored(page);
  await failWrites(page);
  await page
    .getByRole("button", {
      name: "Maak favoriet: Een fijn testmoment 9",
      exact: true,
    })
    .click();
  await visibleFeedback(page, "De favoriet kon niet worden aangepast.");
  expect(await stored(page)).toBe(saved);
  await restoreWrites(page);
  await page
    .getByRole("button", {
      name: "Maak favoriet: Een fijn testmoment 9",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Verwijder favoriet: Een fijn testmoment 9",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    JSON.parse((await stored(page))!).growth.find(
      (entry: { id: string }) => entry.id === "feedback-9",
    ).favorite,
  ).toBe(true);
  await expect(
    page.getByText("De favoriet kon niet worden aangepast. Probeer opnieuw.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("een mislukte verwijdering blijft bij de bevestiging zichtbaar en verwijdert niets", async ({
  page,
}) => {
  await open(page, "growth");
  const saved = await stored(page);
  await page
    .getByRole("button", {
      name: "Verwijder fijn moment: Een fijn testmoment 9",
      exact: true,
    })
    .click();
  await failWrites(page);
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await visibleFeedback(
    page,
    "Verwijderen is niet gelukt. Je moment blijft bewaard.",
  );
  expect(await stored(page)).toBe(saved);
  await restoreWrites(page);
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  const after = JSON.parse((await stored(page))!);
  expect(after.growth).toHaveLength(9);
  expect(
    after.growth.some((entry: { id: string }) => entry.id === "feedback-9"),
  ).toBe(false);
});

test("een mislukte instellingwijziging brengt de fout in beeld en behoudt het gekozen palet", async ({
  page,
}) => {
  await open(page, "settings");
  const saved = await stored(page);
  await failWrites(page);
  await page.getByRole("radio", { name: "Salie", exact: true }).click();
  await visibleFeedback(page, "De instelling kon niet worden bewaard.");
  expect(await stored(page)).toBe(saved);
  await expect(
    page.getByRole("radio", { name: "Amber", exact: true }),
  ).toBeChecked();
  await restoreWrites(page);
  await page.getByRole("radio", { name: "Salie", exact: true }).check();
  const after = JSON.parse((await stored(page))!);
  expect(after.palette).toBe("sage");
  expect(after.growth).toEqual(JSON.parse(saved!).growth);
});

test("het openen van een bewerking sluit een eerdere verwijderbevestiging voor dat moment", async ({
  page,
}) => {
  await open(page, "growth");
  const saved = await stored(page);
  await page
    .getByRole("button", {
      name: "Verwijder fijn moment: Een fijn testmoment 9",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("group", {
      name: "Verwijderen van fijn moment bevestigen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Bewerk fijn moment: Een fijn testmoment 9",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("group", {
      name: "Verwijderen van fijn moment bevestigen",
      exact: true,
    }),
  ).toHaveCount(0);
  const text = page.getByRole("textbox", {
    name: "Je fijne moment aanpassen",
    exact: true,
  });
  await expect(text).toHaveValue("Een fijn testmoment 9");
  expect(await stored(page)).toBe(saved);
  await text.fill("Hetzelfde fijne moment, nu aangevuld.");
  await page
    .getByRole("button", { name: "Wijzigingen bewaren", exact: true })
    .click();
  const after = JSON.parse((await stored(page))!);
  expect(after.growth).toHaveLength(10);
  expect(
    after.growth.find((entry: { id: string }) => entry.id === "feedback-9")
      .text,
  ).toBe("Hetzelfde fijne moment, nu aangevuld.");
});
