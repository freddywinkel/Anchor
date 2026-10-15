import { test, expect, type Locator, type Page } from "@playwright/test";

const DATA = "anchor.app.data.v1";
const DRAFT = "anchor.app.drafts.v1";

test("middernacht en hervatten vernieuwen Vandaag zonder datum of tekst van een concept te wijzigen", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-13T23:59:50+02:00") });
  await page.goto("./#/craving/new");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Mijn bewaarde concept van gisteren");
  const pending = await page.evaluate(
    (key) => localStorage.getItem(key),
    DRAFT,
  );
  await page
    .getByRole("link", { name: "Terug naar Vandaag", exact: true })
    .click();
  await expect(page.locator(".dp-page-title .dp-kicker")).toContainText(
    "13 oktober",
  );
  await page.clock.fastForward(11_000);
  await expect(page.locator(".dp-page-title .dp-kicker")).toContainText(
    "14 oktober",
  );
  await page.clock.setFixedTime(new Date("2026-10-15T08:00:00+02:00"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".dp-page-title .dp-kicker")).toContainText(
    "15 oktober",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT)).toBe(
    pending,
  );
});

test("dagkeuze bewaart het verlaten concept en opent een bestaande dag zonder duplicatie", async ({
  page,
}) => {
  await page.goto("./#/day/2026-10-14");
  await page
    .getByRole("textbox", {
      name: "Wat wil je onthouden van deze dag?",
      exact: true,
    })
    .fill("Concept op de veertiende");
  await page.getByLabel("Dag kiezen", { exact: true }).fill("2026-10-13");
  await page.getByRole("button", { name: "Dag openen", exact: true }).click();
  await expect(page).toHaveURL(/day\/2026-10-13$/);
  await page
    .getByRole("textbox", {
      name: "Wat wil je onthouden van deze dag?",
      exact: true,
    })
    .fill("Bewaarde dertiende");
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await page.goto("./#/day/2026-10-14");
  await expect(
    page.getByRole("textbox", {
      name: "Wat wil je onthouden van deze dag?",
      exact: true,
    }),
  ).toHaveValue("Concept op de veertiende");
  await page.getByLabel("Dag kiezen", { exact: true }).fill("2026-10-13");
  await page.getByRole("button", { name: "Dag openen", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Wat wil je onthouden van deze dag?",
      exact: true,
    }),
  ).toHaveValue("Bewaarde dertiende");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).days.length,
      DATA,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).records["day:2026-10-14"].note,
      DRAFT,
    ),
  ).toBe("Concept op de veertiende");
});

test("conceptvenster toont fouten binnen het venster en behoudt invoer en toetsenbordfocus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/craving/new");
  await page.getByLabel("Gedachte", { exact: true }).fill("Bewaar mij");
  const pending = await page.evaluate(
    (key) => localStorage.getItem(key),
    DRAFT,
  );
  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Meer in Anchor", exact: true })
    .getByRole("button", { name: "Open concepten (1)", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Open concepten",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Concept verwijderen", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Behouden", exact: true }),
  ).toBeFocused();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    (window as any).restoreAuditWrites = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Test opslagfout", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, DRAFT);
  for (let i = 0; i < 2; i++) {
    await dialog
      .getByRole("button", {
        name: "Concept verwijderen bevestigen",
        exact: true,
      })
      .click();
    await expect(dialog.getByRole("alert")).toBeFocused();
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT)).toBe(
      pending,
    );
  }
  await page.evaluate(() => (window as any).restoreAuditWrites());
  await dialog
    .getByRole("button", {
      name: "Concept verwijderen bevestigen",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByText("Je hebt geen open concepten.", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Meer opties", exact: true }),
  ).toBeFocused();
});

test("vensters herstellen desktopfocus naar de opener of Meer wanneer de opener verdwijnt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./#/craving/new");
  const privacy = page.getByRole("button", {
    name: "Over je gegevens",
    exact: true,
  });
  await privacy.click();
  await page
    .getByRole("dialog", { name: "Over je gegevens", exact: true })
    .getByRole("button", { name: "Venster sluiten", exact: true })
    .click();
  await expect(privacy).toBeFocused();
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Dit concept vervalt");
  await page
    .getByRole("button", { name: "Open concepten (1)", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Open concepten",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Concept verwijderen", exact: true })
    .click();
  await dialog
    .getByRole("button", {
      name: "Concept verwijderen bevestigen",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByText("Je hebt geen open concepten.", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Meer opties", exact: true }),
  ).toBeFocused();
});

test("alle Houvast-ingangen bewaren craving en terugkeer naar de geschiedenis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./#/craving/new?returnTo=history");
  await page.getByLabel("Gedachte", { exact: true }).fill("Dezelfde craving");
  const pending = await page.evaluate(
    (key) => localStorage.getItem(key),
    DRAFT,
  );
  await page.locator(".dp-help-rail").click();
  await expect(
    page.getByRole("button", { name: "Terug naar mijn craving", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Houvast", exact: true }).click();
  await page
    .getByRole("button", { name: "5-4-3-2-1 openen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stoppen en terug", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Terug naar mijn craving", exact: true })
    .click();
  await expect(page).toHaveURL(/craving\/new\?returnTo=history$/);
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT)).toBe(
    pending,
  );
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/history$/);
});

test("browser Terug sluit een open menu bij navigatie", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/today");
  await page
    .locator(".dp-bottom-nav")
    .getByRole("link", { name: "Hulpmiddelen", exact: true })
    .click();
  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

async function expectSaveAfterFields(page: Page, save: Locator) {
  await expect(save).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await save.evaluate((element) =>
    element
      .closest("form")!
      .scrollIntoView({ block: "start", behavior: "instant" }),
  );
  const position = await save.evaluate((element) => {
    const form = element.closest("form")!;
    const saveRect = element.getBoundingClientRect();
    const fields = [...form.querySelectorAll("input, select, textarea")].filter(
      (field) => field.checkVisibility(),
    );
    return {
      actionPosition: getComputedStyle(element.parentElement!).position,
      buttonPosition: getComputedStyle(element).position,
      fieldsBeforeSave: fields.every(
        (field) =>
          !!(
            field.compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ) && field.getBoundingClientRect().bottom <= saveRect.top,
      ),
      belowNavigation:
        saveRect.top >=
        document.querySelector(".dp-bottom-nav")!.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(position.actionPosition).toBe("static");
  expect(position.buttonPosition).toBe("static");
  expect(position.fieldsBeforeSave).toBe(true);
  expect(position.belowNavigation).toBe(true);
  expect(position.overflow).toBe(false);
  await save.focus();
  await expect
    .poll(() =>
      save.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const nav = document
          .querySelector(".dp-bottom-nav")!
          .getBoundingClientRect();
        return rect.top >= 15 && rect.bottom <= nav.top - 15;
      }),
    )
    .toBe(true);
  await expect(save).toBeFocused();
}

for (const layout of [
  { name: "telefoon", width: 390, height: 844, font: "100%" },
  {
    name: "smal scherm met grote tekst",
    width: 320,
    height: 844,
    font: "200%",
  },
  {
    name: "beperkte hoogte bij toetsenbord",
    width: 390,
    height: 440,
    font: "100%",
  },
]) {
  test(`check-in, dagoverzicht en nameting bewaren pas na hun vragen: ${layout.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.goto("./#/moment/new");
    await page.evaluate(
      (font) => (document.documentElement.style.fontSize = font),
      layout.font,
    );
    await page
      .getByRole("textbox", { name: /^In je eigen woorden/ })
      .fill("Synthetische check-in");
    const checkinSave = page.getByRole("button", {
      name: "Check-in opslaan",
      exact: true,
    });
    await expectSaveAfterFields(page, checkinSave);
    await checkinSave.click();
    await expect(page).toHaveURL(/#\/today$/);

    await page.goto("./#/day/2026-10-14");
    await page
      .getByRole("textbox", {
        name: "Wat wil je onthouden van deze dag?",
        exact: true,
      })
      .fill("Synthetisch dagoverzicht");
    const daySave = page.getByRole("button", {
      name: "Dagoverzicht opslaan",
      exact: true,
    });
    await expectSaveAfterFields(page, daySave);
    await daySave.click();
    await expect(page).toHaveURL(/#\/today$/);

    await page.goto("./#/moment/new");
    await page
      .getByRole("textbox", { name: /^In je eigen woorden/ })
      .fill("Voor de activiteit");
    await page.getByText("Activiteit toevoegen", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Activiteit", exact: true })
      .selectOption("Buiten wandelen");
    await page
      .getByRole("button", { name: "Check-in opslaan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nameting invullen", exact: true })
      .click();
    const after = page.locator(".dp-after-form");
    await after.getByRole("button", { name: "Ja", exact: true }).click();
    const afterSave = after.getByRole("button", {
      name: "Nameting opslaan",
      exact: true,
    });
    await expectSaveAfterFields(page, afterSave);
    await afterSave.click();
    await expect(page).toHaveURL(/#\/today$/);
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      DATA,
    );
    expect(saved.days).toHaveLength(1);
    expect(saved.days[0].note).toBe("Synthetisch dagoverzicht");
    expect(saved.moments).toHaveLength(2);
    expect(
      saved.moments.find(
        (moment: { note: string }) => moment.note === "Voor de activiteit",
      ),
    ).toMatchObject({ activity: "Buiten wandelen", attempted: true });
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).records,
        DRAFT,
      ),
    ).toEqual({});
  });
}
