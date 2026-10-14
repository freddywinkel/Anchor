import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createEmptyState } from "../src/lib/storage";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const errors = new WeakMap<Page, string[]>();
const requests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, context }) => {
  errors.set(page, []);
  requests.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  context.on("request", (request) => requests.get(page)!.push(request.url()));
  page.on("dialog", (dialog) => void dialog.accept());
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(
    requests
      .get(page)!
      .filter((url) => !url.startsWith("http://127.0.0.1:8800/")),
  ).toEqual([]);
});

async function open(page: Page, route = "/today") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("fieldset.anchor-content")).not.toHaveAttribute(
    "disabled",
    "",
  );
}

async function state(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, DATA_KEY);
}

async function expectToday(page: Page) {
  await expect(page).toHaveURL(/#\/today$/);
  await expect(
    page.getByRole("heading", { name: "Vandaag, op jouw tempo.", exact: true }),
  ).toBeVisible();
}

async function expectHistory(page: Page) {
  await expect(page).toHaveURL(/#\/history$/);
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
}

async function expandSaved(page: Page) {
  const disclosure = page.locator(".dp-history-list details");
  await expect(disclosure).toHaveCount(1);
  if (
    !(await disclosure.evaluate((element: HTMLDetailsElement) => element.open))
  )
    await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
}

async function reopenSaved(page: Page, type: "craving" | "check-in") {
  await open(page, "/history");
  await page.getByLabel("Periode").selectOption("all");
  await page
    .getByLabel("Soort registratie")
    .selectOption(type === "craving" ? "craving" : "checkin");
  await expandSaved(page);
  await page
    .getByRole("button", { name: new RegExp(`^Bewerken: ${type} van`) })
    .click();
  await expect(
    page.getByRole("heading", {
      name: type === "craving" ? "Je craving" : "Jouw check-in",
      exact: true,
    }),
  ).toBeVisible();
}

async function createCraving(page: Page, situation = "Testmoment in de tuin") {
  await open(page, "/craving/new");
  await page.getByLabel("Wie, wat en waar", { exact: true }).fill(situation);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  const saved = (await state(page)).cravings.find(
    (entry: { situation: string }) => entry.situation === situation,
  );
  expect(saved).toBeDefined();
  return saved.id as string;
}

test("craving heeft uitsluitend de gevraagde velden; aanmaken, aanpassen en bevestigd verwijderen", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const form = page.locator("form");
  await expect(form.locator("input")).toHaveCount(2);
  await expect(form.locator("textarea")).toHaveCount(5);
  await expect(form.locator("input[type=number]")).toHaveCount(0);
  await expect(form.locator("select")).toHaveCount(4);
  await expect(
    form.getByRole("combobox", { name: "Middel of gedrag", exact: true }),
  ).toHaveValue("");
  await expect(
    form.getByText(/EIS|Stemming|intensiteit|Activiteit/),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Schrijf iets bij je externe situatie, gedachte, lichamelijke sensatie, emotie of gedrag. Eén van deze tekstvelden is genoeg.",
  );
  expect(await state(page)).toBeNull();
  await page.getByLabel("Datum", { exact: true }).fill("2026-10-12");
  await page.getByLabel("Tijd", { exact: true }).fill("17:35");
  await expect(page.locator(".anchor-craving-day")).toHaveText(
    "maandag 12 oktober 2026",
  );
  await page
    .getByLabel("Wie, wat en waar", { exact: true })
    .fill("Alleen thuis, na het eten.");
  await page.getByLabel(/^Gedachte/).fill("Ik wil even ontsnappen.");
  await page.getByLabel(/^Lichamelijke sensatie/).fill("Gespannen schouders.");
  await page.getByLabel(/^Emotie/).fill("Onrust en verdriet.");
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Ik ging buiten zitten.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  const first = await state(page);
  expect(first.cravings).toHaveLength(1);
  expect(first.cravings[0]).toMatchObject({
    date: "2026-10-12",
    time: "17:35",
    situation: "Alleen thuis, na het eten.",
    thought: "Ik wil even ontsnappen.",
    bodySensation: "Gespannen schouders.",
    emotion: "Onrust en verdriet.",
    behavior: "Ik ging buiten zitten.",
  });
  expect(Object.keys(first.cravings[0]).sort()).toEqual(
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
  await reopenSaved(page, "craving");
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Ik belde iemand en ging wandelen.");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await expectHistory(page);
  expect((await state(page)).cravings).toHaveLength(1);
  expect((await state(page)).cravings[0].id).toBe(first.cravings[0].id);
  await open(page, "/history");
  await page.getByLabel("Periode").selectOption("all");
  await page.getByLabel("Soort registratie").selectOption("craving");
  await expandSaved(page);
  await expect(
    page.getByText("Ik belde iemand en ging wandelen."),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Behouden", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Behouden", exact: true }).click();
  expect((await state(page)).cravings).toHaveLength(1);
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expectHistory(page);
  expect((await state(page)).cravings).toHaveLength(0);
});

test("een gedeeltelijke craving en een herladen concept behouden de eigen tekst", async ({
  page,
}) => {
  await open(page, "/craving/new");
  await page
    .getByLabel(/^Gedachte/)
    .fill("Dit is een nog niet opgeslagen gedachte.");
  await page.reload();
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(
    "Dit is een nog niet opgeslagen gedachte.",
  );
  expect(await state(page)).toBeNull();
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  const saved = (await state(page)).cravings[0];
  expect(saved.thought).toBe("Dit is een nog niet opgeslagen gedachte.");
  expect([
    saved.situation,
    saved.bodySensation,
    saved.emotion,
    saved.behavior,
  ]).toEqual(["", "", "", ""]);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).records,
      DRAFT_KEY,
    ),
  ).toEqual({});
  await page.reload();
  await expectToday(page);
  await reopenSaved(page, "craving");
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(saved.thought);
});

test("cravingdatum en tijd mogen als concept leeg zijn; ongeldige invoer wordt niet opgeslagen", async ({
  page,
}) => {
  await open(page, "/craving/new");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Deze gedachte blijft staan terwijl ik de datum corrigeer.");
  await page.getByLabel("Datum", { exact: true }).fill("");
  await page.getByLabel("Tijd", { exact: true }).fill("");
  await page.reload();
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Tijd", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    "Deze gedachte blijft staan terwijl ik de datum corrigeer.",
  );
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.getByLabel("Datum", { exact: true })).toBeFocused();
  expect(await state(page)).toBeNull();
  await page.getByLabel("Datum", { exact: true }).fill("1899-12-31");
  await page.getByLabel("Tijd", { exact: true }).fill("12:30");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  expect(
    await page
      .getByLabel("Datum", { exact: true })
      .evaluate((element: HTMLInputElement) => element.validity.rangeUnderflow),
  ).toBe(true);
  expect(await state(page)).toBeNull();
  await page.getByLabel("Datum", { exact: true }).fill("2024-02-29");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).cravings[0]).toMatchObject({
    date: "2024-02-29",
    time: "12:30",
  });
});

test("cravingvelden hebben een korte toegankelijke naam en afzonderlijke uitleg", async ({
  page,
}) => {
  await open(page, "/craving/new");
  await expect(
    page.getByRole("heading", { name: "Externe situatie", exact: true }),
  ).toBeVisible();
  for (const [name, explanation] of [
    ["Wie, wat en waar", "Wie waren erbij, wat gebeurde er en waar was je?"],
    ["Gedachte", "Wat ging er door je hoofd?"],
    ["Lichamelijke sensatie", "Wat voelde je in je lichaam?"],
    ["Emotie", "Welke emotie of emoties merkte je?"],
    ["Gedrag (wat deed je?)", "Beschrijf in je eigen woorden wat je deed."],
  ]) {
    const field = page.getByRole("textbox", { name, exact: true });
    await expect(field).toHaveAccessibleName(name);
    await expect(field).toHaveAccessibleDescription(explanation);
  }
});

test("interne voorbeelden vullen vrije tekst aan zonder verlies, duplicaten of overschrijding", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const fields = [
    {
      name: "Gedachte",
      picker: "Voorbeeld voor gedachte",
      key: "thought",
      initial: "Mijn eigen gedachte blijft ongewijzigd.",
    },
    {
      name: "Lichamelijke sensatie",
      picker: "Voorbeeld voor lichamelijke sensatie",
      key: "bodySensation",
      initial: "",
    },
    {
      name: "Emotie",
      picker: "Voorbeeld voor emotie",
      key: "emotion",
      initial: "Dit beschrijf ik zelf.",
    },
  ];
  const expected: Record<string, string> = {};
  const examples: Record<string, string> = {};
  for (const field of fields) {
    const text = page.getByRole("textbox", { name: field.name, exact: true });
    const picker = page.getByRole("combobox", {
      name: field.picker,
      exact: true,
    });
    const choices = await picker.evaluate((element: HTMLSelectElement) =>
      Array.from(element.options)
        .filter((option) => option.value && !option.disabled)
        .map((option) => option.value),
    );
    expect(choices.length).toBeGreaterThan(0);
    examples[field.key] = choices[0];
    await text.fill(field.initial);
    await picker.selectOption(choices[0]);
    expected[field.key] = field.initial
      ? `${field.initial}\n${choices[0]}`
      : choices[0];
    await expect(text).toHaveValue(expected[field.key]);
    await expect(picker).toHaveValue("");
    await picker.selectOption(choices[0]);
    await expect(text).toHaveValue(expected[field.key]);
    expected[field.key] += "\nMijn eigen aanvulling.";
    await text.fill(expected[field.key]);
  }

  await page.reload();
  for (const field of fields) {
    await expect(
      page.getByRole("textbox", { name: field.name, exact: true }),
    ).toHaveValue(expected[field.key]);
    await expect(
      page.getByRole("combobox", { name: field.picker, exact: true }),
    ).toHaveValue("");
  }
  const thought = page.getByRole("textbox", { name: "Gedachte", exact: true });
  const thoughtPicker = page.getByRole("combobox", {
    name: "Voorbeeld voor gedachte",
    exact: true,
  });
  const sameLine = `Eigen woorden.\n  ${examples.thought.toLocaleUpperCase("nl-NL")}  `;
  await thought.fill(sameLine);
  await thoughtPicker.selectOption(examples.thought);
  await expect(thought).toHaveValue(sameLine);
  const fullText = "x".repeat(4000);
  await thought.fill(fullText);
  await thoughtPicker.selectOption(examples.thought);
  await expect(thought).toHaveValue(fullText);
  await expect(page.getByRole("alert")).toContainText(
    "Dit voorbeeld past niet meer in het tekstvak. Je bestaande tekst is behouden.",
  );
  await expect(thoughtPicker).toHaveValue("");
  await thought.fill(expected.thought);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).cravings[0]).toMatchObject(expected);
  await page.reload();
  await expectToday(page);
  await reopenSaved(page, "craving");
  for (const field of fields)
    await expect(
      page.getByRole("textbox", { name: field.name, exact: true }),
    ).toHaveValue(expected[field.key]);
});

test("datum en tijd vullen hun kolom en stapelen bij een smal scherm of grote tekst", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const date = page.getByLabel("Datum", { exact: true });
  const time = page.getByLabel("Tijd", { exact: true });
  await expect(date).toHaveAttribute("type", "date");
  await expect(time).toHaveAttribute("type", "time");
  await date.fill("2024-02-29");
  await time.fill("23:59");

  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "Licht thema", exact: true })
        .click();
    for (const width of [320, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 980 });
      for (const size of ["100%", "200%"]) {
        await page.evaluate((fontSize) => {
          document.documentElement.style.fontSize = fontSize;
        }, size);
        const geometry = await page
          .locator(".anchor-craving-datetime")
          .evaluate((grid) => {
            const gridRect = grid.getBoundingClientRect();
            return {
              width: gridRect.width,
              overflow: document.documentElement.scrollWidth > innerWidth,
              fields: Array.from(grid.querySelectorAll("input")).map(
                (input) => {
                  const rect = input.getBoundingClientRect();
                  const label = input.parentElement!.getBoundingClientRect();
                  return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    labelX: label.x,
                    labelWidth: label.width,
                    labelHeight: label.height,
                  };
                },
              ),
            };
          });
        const [dateField, timeField] = geometry.fields;
        expect(geometry.overflow, `${theme} ${width}px ${size}`).toBe(false);
        for (const field of geometry.fields) {
          expect(Math.abs(field.width - field.labelWidth)).toBeLessThan(1);
          expect(Math.abs(field.x - field.labelX)).toBeLessThan(1);
          expect(field.height).toBeGreaterThanOrEqual(48);
        }
        expect(Math.abs(dateField.height - timeField.height)).toBeLessThan(1);
        expect(
          Math.abs(dateField.labelHeight - timeField.labelHeight),
        ).toBeLessThan(1);
        if (width <= 430 || size === "200%") {
          expect(dateField.width).toBeCloseTo(geometry.width, 0);
          expect(timeField.width).toBeCloseTo(geometry.width, 0);
          expect(timeField.y).toBeGreaterThan(dateField.y + dateField.height);
        } else {
          expect(dateField.y).toBeCloseTo(timeField.y, 0);
          expect(timeField.x).toBeGreaterThan(dateField.x + dateField.width);
        }
        await expect(date).toHaveValue("2024-02-29");
        await expect(time).toHaveValue("23:59");
      }
    }
  }
  await page.getByLabel("Wie, wat en waar", { exact: true }).fill("Thuis.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  await page.reload();
  await expectToday(page);
  await reopenSaved(page, "craving");
  await expect(date).toHaveValue("2024-02-29");
  await expect(time).toHaveValue("23:59");
});

test("toetsenbordfocus blijft boven de mobiele navigatie bij beide thema's en 200 procent tekst", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, "/craving/new");
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "Licht thema", exact: true })
        .click();
    for (const textSize of ["100%", "200%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, textSize);
      await page.locator("main h1").focus();
      const seen = new Set<string>();
      for (let step = 0; step < 30 && seen.size < 12; step++) {
        await page.keyboard.press("Tab");
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        const focus = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          if (
            !element.closest(".anchor-craving-form") ||
            !element.matches("input, select, textarea, button, a")
          )
            return null;
          const rect = element.getBoundingClientRect();
          const navigation = document
            .querySelector(".dp-bottom-nav")!
            .getBoundingClientRect();
          return {
            key:
              element.id ||
              element.getAttribute("aria-label") ||
              element.textContent!.trim(),
            top: rect.top,
            bottom: rect.bottom,
            navigationTop: navigation.top,
          };
        });
        if (focus) {
          seen.add(focus.key);
          expect(
            focus.top,
            `${theme}/${textSize}: ${focus.key} starts above viewport`,
          ).toBeGreaterThanOrEqual(-1);
          expect(
            focus.bottom,
            `${theme}/${textSize}: ${focus.key} hidden by mobile navigation`,
          ).toBeLessThanOrEqual(focus.navigationTop + 1);
        }
      }
      expect(
        seen.size,
        `${theme}/${textSize}: all 7 fields, 3 examples and 2 form actions reachable`,
      ).toBe(12);
    }
  }
});

test("ongeldige dagroutes maken geen misleidend dagformulier aan", async ({
  page,
}) => {
  for (const date of ["2026-02-31", "2026-13-01", "1899-12-31", "2200-01-01"]) {
    await open(page, `/day/${date}`);
    await expect(
      page.getByRole("heading", { name: "Deze pagina is niet gevonden" }),
    ).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(0);
  }
  expect(await state(page)).toBeNull();
  await open(page, "/day/2024-02-29");
  await expect(
    page.getByRole("heading", { name: "Mijn hele dag", exact: true }),
  ).toBeVisible();
});

test("een gecorrigeerde nameting behoudt de oorspronkelijke datum en tijd", async ({
  page,
}) => {
  const initial = createEmptyState();
  initial.moments = [
    {
      id: "historical-after",
      date: "2026-10-10",
      time: "12:00",
      kind: "checkin",
      before: { mood: -1, eis: 60 },
      after: { mood: 1, eis: 20 },
      afterDate: "2026-10-10",
      afterTime: "12:30",
      activity: "Schilderen",
      attempted: true,
      emotions: [],
      note: "Historisch moment",
    },
  ];
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: DATA_KEY, value: initial },
  );
  await open(page, "/moment/historical-after");
  await page
    .locator(".dp-after-form")
    .getByText("Eerder vastgelegde intensiteit: 20", { exact: true })
    .click();
  await page
    .locator(".dp-after-form")
    .getByLabel("Na: Intensiteit — emotie niet gekoppeld", { exact: true })
    .fill("25");
  await page
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).moments[0]).toMatchObject({
    after: { mood: 1, eis: 25 },
    afterDate: "2026-10-10",
    afterTime: "12:30",
  });
});

test("een onafgemaakte nameting blijft na herladen zichtbaar en invulbaar", async ({
  page,
}) => {
  await open(page, "/moment/new");
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Even stilstaan voor het schilderen.");
  await page.getByText("Activiteit toevoegen", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Schilderen");
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  await page
    .locator(".dp-after-form")
    .getByRole("button", { name: "Ja", exact: true })
    .click();
  await page
    .locator(".dp-after-form")
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label: "Onrustig" });
  await page
    .locator(".dp-after-form")
    .getByLabel("Intensiteit van Onrustig", { exact: true })
    .fill("55");
  await page.reload();
  const after = page.locator(".dp-after-form");
  await expect(after).toBeVisible();
  await expect(
    after.getByLabel("Intensiteit van Onrustig", { exact: true }),
  ).toHaveValue("55");
  await expect(
    after.getByRole("button", { name: "Ja", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await state(page)).moments[0].after).toBeNull();
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).moments[0]).toMatchObject({
    after: {
      mood: null,
      eis: null,
      emotionRatings: [{ label: "Onrustig", intensity: 55 }],
    },
    attempted: true,
  });
});

test("een opslagfout laat de cravingtekst staan en een nieuwe poging slaagt", async ({
  page,
}) => {
  await open(page, "/craving/new");
  await page.getByLabel(/^Gedachte/).fill("Deze tekst mag niet verdwijnen.");
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
  }, DATA_KEY);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Je ingevulde tekst staat hier nog",
  );
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(
    "Deze tekst mag niet verdwijnen.",
  );
  expect(await state(page)).toBeNull();
  await page.evaluate(() => (window as any).__restoreStorage());
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).cravings[0].thought).toBe(
    "Deze tekst mag niet verdwijnen.",
  );
});

test("meerdere check-ins, expliciete nameting en dagoverzicht blijven aparte registraties", async ({
  page,
}) => {
  await open(page, "/moment/new");
  await page.getByRole("button", { name: "-1 Laag", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label: "Onrustig" });
  await page.getByLabel("Intensiteit van Onrustig", { exact: true }).fill("70");
  await page.getByText("Activiteit toevoegen", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Buiten wandelen");
  await page.getByRole("button", { name: "Check-in opslaan" }).click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nameting invullen" }).click();
  const after = page.locator(".dp-after-form");
  await after.getByRole("button", { name: "Ja", exact: true }).click();
  await after.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await after
    .getByLabel("Intensiteit van Onrustig", { exact: true })
    .fill("30");
  await page.getByRole("button", { name: "Check-in opslaan" }).click();
  expect((await state(page)).moments[0].after).toBeNull();
  await after.getByRole("button", { name: "Nameting opslaan" }).click();
  await expectToday(page);
  await expect
    .poll(async () => (await state(page)).moments[0].after?.mood)
    .toBe(1);
  await page.getByRole("button", { name: "Check-in toevoegen" }).click();
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Een tweede moment op dezelfde dag.");
  await page.getByRole("button", { name: "Check-in opslaan" }).click();
  await expectToday(page);
  await expect.poll(async () => (await state(page)).moments.length).toBe(2);
  await page
    .getByRole("button", { name: "Dagoverzicht invullen", exact: true })
    .click();
  await page
    .getByLabel("Wat wil je onthouden van deze dag?")
    .fill("Mijn terugblik is een apart geheel.");
  await page.getByLabel("Uren slaap").fill("7");
  await page.getByLabel("Minuten slaap").fill("30");
  await page.getByRole("button", { name: "Dagoverzicht opslaan" }).click();
  await expectToday(page);
  await expect.poll(async () => (await state(page)).days.length).toBe(1);
  const saved = await state(page);
  expect(saved.moments).toHaveLength(2);
  expect(saved.cravings).toHaveLength(0);
  expect(saved.days[0].ratings).toMatchObject({ mood: null, eis: null });
  expect(saved.days[0].ratings.emotionRatings ?? []).toEqual([]);
  expect(saved.moments.find((entry: any) => entry.activity)).toMatchObject({
    before: {
      mood: -1,
      eis: null,
      emotionRatings: [{ label: "Onrustig", intensity: 70 }],
    },
    after: {
      mood: 1,
      eis: null,
      emotionRatings: [{ label: "Onrustig", intensity: 30 }],
    },
    attempted: true,
  });
});

test("back-up downloaden, ongeldige import weigeren en geldige vervanging bevestigen", async ({
  page,
}) => {
  await createCraving(page, "Oorspronkelijke aantekening");
  await open(page, "/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back-up downloaden" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.format).toBe("anchor.app.backup");
  expect(backup.state.cravings).toHaveLength(1);
  const before = await state(page);
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"not":"an Anchor backup"}'),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gegevens vervangen" }),
  ).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  backup.state.cravings[0].situation = "Herstelde aantekening";
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "Anchor-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByRole("button", { name: "Gegevens vervangen" }),
  ).toBeDisabled();
  const safetyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Huidige opslag downloaden" }).click();
  const safetyCopy = await safetyDownload;
  const safetyBackup = JSON.parse(
    await readFile((await safetyCopy.path())!, "utf8"),
  );
  expect(safetyBackup.format).toBe("anchor.app.backup");
  expect(safetyBackup.state.cravings[0].situation).toBe(
    "Oorspronkelijke aantekening",
  );
  await page.getByRole("button", { name: "Gegevens vervangen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).cravings[0].situation).toBe(
    "Herstelde aantekening",
  );
  await page.reload();
  expect((await state(page)).cravings[0].situation).toBe(
    "Herstelde aantekening",
  );
});

test("open concepten zijn hervatbaar en alleen na bevestiging te verwijderen", async ({
  page,
}) => {
  const savedId = await createCraving(
    page,
    "Dit opgeslagen moment blijft bestaan.",
  );
  await open(page, "/craving/new");
  await page.getByLabel(/^Gedachte/).fill("Een onafgemaakte nieuwe gedachte.");
  await page.getByRole("link", { name: "Vandaag", exact: true }).last().click();
  await page.getByRole("button", { name: /^Open concepten/ }).click();
  await page
    .getByRole("button", { name: "Verder schrijven", exact: true })
    .click();
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(
    "Een onafgemaakte nieuwe gedachte.",
  );
  await page.getByRole("button", { name: /^Open concepten/ }).click();
  await page
    .getByRole("button", { name: "Concept verwijderen", exact: true })
    .click();
  await expect(
    page.getByText(
      "Dit concept verwijderen? De invoer in dit onafgemaakte formulier vervalt.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Behouden", exact: true }).click();
  await page
    .getByRole("button", { name: "Concept verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Concept verwijderen bevestigen",
      exact: true,
    })
    .click();
  await expect(page.getByText("Je hebt geen open concepten.")).toBeVisible();
  await page
    .getByRole("button", { name: "Venster sluiten", exact: true })
    .click();
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue("");
  expect((await state(page)).cravings.map((item: any) => item.id)).toEqual([
    savedId,
  ]);
});

test("het mobiele menu toont bewaarde concepten buiten het formulier bij 320px en 200 procent tekst", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, "/craving/new");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Mijn bewaarde cravingconcept.");
  await open(page, "/moment/new");
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Mijn bewaarde check-inconcept.");
  await open(page);
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page
        .getByRole("button", { name: "Licht thema", exact: true })
        .click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page
      .getByRole("button", { name: "Meer opties", exact: true })
      .click();
    const menu = page.getByRole("dialog", {
      name: "Meer in Anchor",
      exact: true,
    });
    await expect(menu).toBeVisible();
    await menu
      .getByRole("button", { name: "Open concepten (2)", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Open concepten",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".anchor-draft-row")).toHaveCount(2);
    await expect(dialog.getByText("Craving", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Check-in", { exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#/today");
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
        overflow: element.scrollWidth > element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.pageOverflow).toBe(false);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    for (const button of await dialog.getByRole("button").all()) {
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      await expect(button).toBeFocused();
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(geometry.left);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(geometry.right);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await dialog.screenshot({
      path: testInfo.outputPath(`drafts-320-${theme}-200.png`),
    });
    await dialog
      .getByRole("button", { name: "Venster sluiten", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Meer in Anchor", exact: true })
    .getByRole("button", { name: "Open concepten (2)", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Open concepten", exact: true })
    .locator(".anchor-draft-row")
    .filter({ has: page.getByText("Craving", { exact: true }) })
    .getByRole("button", { name: "Verder schrijven", exact: true })
    .click();
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    "Mijn bewaarde cravingconcept.",
  );
});

test("losse check-in- en cravingconcepten hervatten zonder opgeslagen record en behouden hun metadata", async ({
  page,
}) => {
  const moment = {
    id: "orphan-followup",
    date: "2026-10-10",
    time: "09:15",
    kind: "checkin",
    before: { mood: -1, eis: 70 },
    after: { mood: 1, eis: 30 },
    afterDate: "2026-10-11",
    afterTime: "00:20",
    activity: "Schilderen",
    attempted: true,
    emotions: ["Onrustig", "Opgelucht"],
    note: "Een bewaard concept met nameting.",
  };
  const craving = {
    id: "orphan-craving",
    date: "2026-10-10",
    time: "21:45",
    situation: "Alleen thuis na een drukke dag.",
    thought: "Ik wil rust.",
    bodySensation: "Gespannen schouders.",
    emotion: "Onrust.",
    behavior: "Ik ging naar buiten.",
  };
  await page.addInitScript(
    ({ dataKey, draftKey, initial, records }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(initial));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, records }));
    },
    {
      dataKey: DATA_KEY,
      draftKey: DRAFT_KEY,
      initial: createEmptyState(),
      records: {
        [`moment:${moment.id}`]: moment,
        [`craving:${craving.id}`]: craving,
      },
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  async function resume(type: "Check-in" | "Craving", count: number) {
    await page
      .getByRole("button", { name: "Meer opties", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Meer in Anchor", exact: true })
      .getByRole("button", { name: `Open concepten (${count})`, exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Open concepten", exact: true })
      .locator(".anchor-draft-row")
      .filter({ has: page.getByText(type, { exact: true }) })
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
  }
  await resume("Check-in", 2);
  await expect(page).toHaveURL(/#\/moment\/orphan-followup$/);
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(
    moment.note,
  );
  const after = page.locator(".dp-after-form");
  await expect(after).toBeVisible();
  await expect(
    after.getByLabel("Na: Intensiteit — emotie niet gekoppeld", {
      exact: true,
    }),
  ).toHaveValue("30");
  await expect(
    after.getByRole("button", { name: "Ja", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await after
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).moments).toEqual([moment]);
  await page.reload();
  await expectToday(page);
  await reopenSaved(page, "check-in");
  await expect(page.locator(".dp-after-form")).toContainText("00:20");
  expect((await state(page)).moments).toEqual([moment]);
  await resume("Craving", 1);
  await expect(page).toHaveURL(/#\/craving\/orphan-craving$/);
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue(
    craving.date,
  );
  await expect(page.getByLabel("Tijd", { exact: true })).toHaveValue(
    craving.time,
  );
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    craving.thought,
  );
  const revisedThought = `${craving.thought} Ik neem even pauze.`;
  await page.getByLabel("Gedachte", { exact: true }).fill(revisedThought);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  expect((await state(page)).cravings).toEqual([
    { ...craving, thought: revisedThought },
  ]);
  expect((await state(page)).moments).toEqual([moment]);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).records,
      DRAFT_KEY,
    ),
  ).toEqual({});
  await page.reload();
  await expectToday(page);
  await reopenSaved(page, "craving");
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    revisedThought,
  );
  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Meer in Anchor", exact: true })
    .getByRole("button", { name: "Open concepten (0)", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Open concepten", exact: true }),
  ).toContainText("Je hebt geen open concepten.");
});

test("een back-up kan een open concept niet ongemerkt vervangen", async ({
  page,
}) => {
  await createCraving(page, "Een opgeslagen craving.");
  await open(page, "/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back-up downloaden" }).click();
  const download = await downloadPromise;
  const backup = await readFile((await download.path())!);
  await open(page, "/craving/new");
  await page
    .getByLabel(/^Emotie/)
    .fill("Dit concept moet eerst een keuze krijgen.");
  await open(page, "/settings");
  const before = await state(page);
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "Anchor-backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  const safetyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Huidige opslag downloaden" }).click();
  await safetyDownload;
  await page.getByRole("button", { name: "Gegevens vervangen" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "open concepten",
  );
  expect(await state(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Venster sluiten", exact: true })
    .click();
  await page.getByRole("button", { name: /^Open concepten/ }).click();
  await page
    .getByRole("button", { name: "Verder schrijven", exact: true })
    .click();
  await expect(page.getByLabel(/^Emotie/)).toHaveValue(
    "Dit concept moet eerst een keuze krijgen.",
  );
});

test("een tweede tabblad kan gegevens niet overschrijven en kan na herladen bewerken", async ({
  page,
  context,
}) => {
  await createCraving(page);
  const second = await context.newPage();
  second.on("pageerror", (error) => errors.get(page)!.push(error.message));
  second.on("dialog", (dialog) => void dialog.accept());
  await second.goto("./#/craving/new");
  await expect(second.getByText(/^Alleen lezen\./)).toBeVisible();
  await expect(second.getByLabel(/^Gedachte/)).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "Craving opslaan", exact: true }),
  ).toBeDisabled();
  const original = await state(second);
  await second.goto("./#/history");
  await expect(
    second.getByRole("combobox", { name: "Soort registratie", exact: true }),
  ).toBeEnabled();
  await second
    .getByRole("combobox", { name: "Soort registratie", exact: true })
    .selectOption("craving");
  await second.locator(".dp-history-list summary").click();
  await second.getByRole("button", { name: /^Bewerken: craving/ }).click();
  await expect(second.getByLabel("Gedachte", { exact: true })).toBeDisabled();
  await second.goto("./#/settings");
  await expect(
    second.getByRole("radio", { name: "Licht", exact: true }),
  ).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "Back-up herstellen" }),
  ).toBeDisabled();
  const downloadPromise = second.waitForEvent("download");
  await second.getByRole("button", { name: "Back-up downloaden" }).click();
  const download = await downloadPromise;
  const snapshot = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(snapshot.state.cravings).toEqual(original.cravings);
  await second.goto("./#/craving/new");
  await page.close();
  await second.reload();
  await expect(second.getByLabel(/^Gedachte/)).toBeEnabled();
  await second
    .getByLabel(/^Gedachte/)
    .fill("Nieuwe tekst na wisselen van tabblad.");
  await second
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(second);
  await expect
    .poll(async () => (await state(second)).cravings.length)
    .toBe(original.cravings.length + 1);
  await second.close();
});

test("beschadigde gegevens worden bewaard tot een back-up bewust is hersteld", async ({
  page,
}) => {
  await createCraving(page, "Deze registratie komt terug uit de back-up.");
  await reopenSaved(page, "craving");
  const original = await state(page);
  const backup = {
    format: "anchor.app.backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: original,
  };
  const damaged = '{"version":1,"unfinished":';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: DATA_KEY,
    value: damaged,
  });
  await page.reload();
  await expect(page.locator("fieldset.anchor-content")).toHaveAttribute(
    "disabled",
    "",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(damaged);
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "Anchor-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByRole("button", { name: "Gegevens vervangen" }),
  ).toBeDisabled();
  const recoveryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Huidige opslag downloaden" }).click();
  const preserved = await recoveryDownload;
  expect(await readFile((await preserved.path())!, "utf8")).toBe(damaged);
  await page.getByRole("button", { name: "Gegevens vervangen" }).click();
  await expect(page.locator("fieldset.anchor-content")).not.toHaveAttribute(
    "disabled",
    "",
  );
  expect((await state(page)).cravings).toEqual(original.cravings);
});

test("beschadigde concepten krijgen herstelbestand met ruwe opslag en nieuwe tekst", async ({
  page,
}) => {
  await createCraving(page, "Deze opgeslagen registratie wordt nooit gewist.");
  const originalRaw = await page.evaluate(
    (key) => localStorage.getItem(key),
    DATA_KEY,
  );
  const damaged = '{"version":1,"records":BROKEN';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: DRAFT_KEY,
    value: damaged,
  });
  await page.reload();
  await open(page, "/craving/new");
  await expect(
    page.getByRole("button", { name: "Conceptopslag herstellen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(/^Gedachte/)
    .fill("Nieuwe tekst terwijl de oude conceptopslag beschadigd is.");
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(
    "Nieuwe tekst terwijl de oude conceptopslag beschadigd is.",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY),
  ).toBe(damaged);
  await page
    .getByRole("button", { name: "Conceptopslag herstellen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Alleen concepten wissen", exact: true }),
  ).toBeDisabled();
  const recoveryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Herstelbestand downloaden", exact: true })
    .click();
  const download = await recoveryDownload;
  const recovery = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(recovery.format).toBe("anchor.app.draft-recovery");
  expect(recovery.raw).toBe(damaged);
  expect(recovery.pendingRecords["craving:new"].thought).toBe(
    "Nieuwe tekst terwijl de oude conceptopslag beschadigd is.",
  );
  await page
    .getByRole("button", { name: "Alleen concepten wissen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(originalRaw);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).records,
      DRAFT_KEY,
    ),
  ).toEqual({});
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue("");
});

test("herstellen overschrijft geen extern gewijzigde opslag na de veiligheidskopie", async ({
  page,
  context,
}) => {
  await createCraving(page, "De geldige back-upregistratie.");
  const original = await state(page);
  const backup = {
    format: "anchor.app.backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: original,
  };
  const rawA = '{"version":1,"broken":"snapshot-A"';
  const rawB = '{"version":1,"broken":"external-B"';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: DATA_KEY,
    value: rawA,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.getByLabel("Back-upbestand").setInputFiles({
    name: "Anchor-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const firstCopyPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Huidige opslag downloaden", exact: true })
    .click();
  const firstCopy = await firstCopyPromise;
  expect(await readFile((await firstCopy.path())!, "utf8")).toBe(rawA);

  const other = await context.newPage();
  other.on("pageerror", (error) => errors.get(page)!.push(error.message));
  await other.goto("./#/today");
  await expect(other.getByText(/^Alleen lezen\./)).toBeVisible();
  await page.evaluate((key) => {
    (window as any).__auditStorageEvent = null;
    window.addEventListener("storage", (event) => {
      if (event.key === key)
        (window as any).__auditStorageEvent = event.newValue;
    });
  }, DATA_KEY);
  // Simulate another same-origin program changing synthetic corrupt bytes.
  await other.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: DATA_KEY,
    value: rawB,
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__auditStorageEvent))
    .toBe(rawB);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page
    .getByRole("button", { name: "Gegevens vervangen", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "gewijzigd sinds het downloaden van de veiligheidskopie",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), DATA_KEY),
  ).toBe(rawB);

  const nextCopyPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Huidige opslag downloaden", exact: true })
    .click();
  const nextCopy = await nextCopyPromise;
  expect(await readFile((await nextCopy.path())!, "utf8")).toBe(rawB);
  await page
    .getByRole("button", { name: "Gegevens vervangen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).cravings).toEqual(original.cravings);
  await other.close();
});

test("Anchor laat synthetische oude appopslag en database ongewijzigd", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("anchor-recovery")) {
      localStorage.setItem(
        "anchor-recovery",
        '{"syntheticCanary":"old app only"}',
      );
      localStorage.setItem(
        "anchor:design-preview:v1",
        '{"syntheticCanary":"preview only"}',
      );
    }
  });
  await open(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("anchor-recovery", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("canary");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("canary", "readwrite");
        transaction.objectStore("canary").put("Synthetic old record", "old");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const cache = await caches.open("substance-recovery-synthetic-canary");
    await cache.put(
      "/synthetic-old-record",
      new Response("Old app cache canary"),
    );
  });
  await createCraving(page, "Anchor heeft alleen eigen gegevens.");
  await page.reload();
  const canaries = await page.evaluate(async () => {
    const old = await new Promise<string>((resolve, reject) => {
      const request = indexedDB.open("anchor-recovery", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("canary").objectStore("canary").get("old");
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
      };
    });
    const cache = await caches.open("substance-recovery-synthetic-canary");
    return {
      local: localStorage.getItem("anchor-recovery"),
      preview: localStorage.getItem("anchor:design-preview:v1"),
      old,
      cache: await (await cache.match("/synthetic-old-record"))!.text(),
    };
  });
  expect(canaries).toEqual({
    local: '{"syntheticCanary":"old app only"}',
    preview: '{"syntheticCanary":"preview only"}',
    old: "Synthetic old record",
    cache: "Old app cache canary",
  });
});

test("geïnstalleerde serviceworker opent offline en bewaart nieuwe registraties", async ({
  page,
  context,
}, testInfo) => {
  await createCraving(page, "Opgeslagen toen er verbinding was.");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByText(/^Je bent offline\./)).toBeVisible();
  const offlineDocument = await page.reload();
  await expectToday(page);
  // Chromium 151 reports onLine=true after an offline SW reload, despite blocked
  // network requests. Prove offline delivery independently of that browser hint.
  const networkEvidence = await page.evaluate(async () => {
    let uncachedRequestFailed = false;
    try {
      await fetch(`/Anchor/offline-probe-${crypto.randomUUID()}`, {
        cache: "no-store",
      });
    } catch {
      uncachedRequestFailed = true;
    }
    return { onlineHint: navigator.onLine, uncachedRequestFailed };
  });
  await testInfo.attach("offline-evidence", {
    body: Buffer.from(
      JSON.stringify({
        browser: context.browser()?.version(),
        fromServiceWorker: offlineDocument?.fromServiceWorker(),
        ...networkEvidence,
      }),
    ),
    contentType: "application/json",
  });
  expect(offlineDocument?.fromServiceWorker()).toBe(true);
  expect(networkEvidence.uncachedRequestFailed).toBe(true);
  await expect(page.getByText(/^Je bent offline\./)).toHaveCount(
    networkEvidence.onlineHint ? 0 : 1,
  );
  await reopenSaved(page, "craving");
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Ook offline aangevuld.");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await expectHistory(page);
  const savedDocument = await page.reload();
  expect(savedDocument?.fromServiceWorker()).toBe(true);
  await expectHistory(page);
  await reopenSaved(page, "craving");
  await expect(page.getByLabel(/^Gedrag \(wat deed je\?\)/)).toHaveValue(
    "Ook offline aangevuld.",
  );
  await page.goto("./#/settings");
  await expect(
    page.getByText(/Anchor is beschikbaar voor offline gebruik\./),
  ).toBeVisible();
  const settingsDocument = await page.reload();
  expect(settingsDocument?.fromServiceWorker()).toBe(true);
  await expect(
    page.getByText(/Anchor is beschikbaar voor offline gebruik\./),
  ).toBeVisible();
  await expect(
    page.getByText(/Offlinebestanden worden voorbereid/),
  ).toHaveCount(0);
  await context.setOffline(false);
});

for (const width of [320, 390, 820, 1440]) {
  test(`leesbare formulieren en navigatie zonder horizontale scroll op ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 980 });
    for (const route of [
      "/today",
      "/craving/new",
      "/moment/new",
      "/history",
      "/plan",
      "/tools",
      "/growth",
      "/settings",
    ]) {
      await open(page, route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      ).toBe(true);
      const clipped = await page
        .locator("main input,main textarea,main select")
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.width > 0 &&
                (rect.left < -1 ||
                  rect.right > innerWidth + 1 ||
                  parseFloat(style.fontSize) < 16)
              );
            })
            .map((element) => element.outerHTML.slice(0, 160)),
        );
      expect(clipped, route).toEqual([]);
      if (route === "/today" || route === "/craving/new") {
        await page.screenshot({
          path: testInfo.outputPath(`${width}-${route.split("/")[1]}.png`),
          fullPage: true,
        });
      }
    }
  });
}

test("200 procent tekstgrootte, licht thema en lange invoer blijven bruikbaar", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 980 });
  await open(page, "/craving/new");
  await page.getByRole("button", { name: "Licht thema", exact: true }).click();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page
    .getByLabel(/^Gedachte/)
    .fill("Een lange gedachte in eigen woorden. ".repeat(80));
  await page.getByLabel(/^Lichamelijke sensatie/).fill("schouders".repeat(60));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.locator(".dp")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expectToday(page);
  await reopenSaved(page, "craving");
  await page.screenshot({
    path: testInfo.outputPath("390-light-200-percent-craving.png"),
    fullPage: true,
  });
});
