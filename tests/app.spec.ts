import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

async function createCraving(page: Page, situation = "Testmoment in de tuin") {
  await open(page, "/craving/new");
  await page.getByLabel(/^Situatie \(wie, wat, waar\)/).fill(situation);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/craving\/(?!new)[^/]+$/);
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
  return new URL(page.url()).hash.split("/").at(-1)!;
}

test("craving heeft uitsluitend de gevraagde velden; aanmaken, aanpassen en bevestigd verwijderen", async ({
  page,
}) => {
  await open(page, "/craving/new");
  const form = page.locator("form");
  await expect(form.locator("input")).toHaveCount(2);
  await expect(form.locator("textarea")).toHaveCount(5);
  await expect(form.locator("input[type=number],select")).toHaveCount(0);
  await expect(
    form.getByText(/EIS|Stemming|intensiteit|Middel|Activiteit/),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "ten minste één onderdeel",
  );
  expect(await state(page)).toBeNull();
  await page.getByLabel("Datum", { exact: true }).fill("2026-10-12");
  await page.getByLabel("Tijd", { exact: true }).fill("17:35");
  await expect(page.locator(".anchor-craving-day")).toHaveText(
    "maandag 12 oktober 2026",
  );
  await page
    .getByLabel(/^Situatie \(wie, wat, waar\)/)
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
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
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
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Ik belde iemand en ging wandelen.");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  expect((await state(page)).cravings).toHaveLength(1);
  expect((await state(page)).cravings[0].id).toBe(first.cravings[0].id);
  await page.getByRole("link", { name: "Naar Terugkijken" }).click();
  await page.getByLabel("Periode").selectOption("all");
  await page.getByLabel("Soort registratie").selectOption("craving");
  await expect(
    page.getByText("Ik belde iemand en ging wandelen."),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Bekijk craving/ }).click();
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bewaren", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Bewaren", exact: true }).click();
  expect((await state(page)).cravings).toHaveLength(1);
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/history$/);
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
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
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
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(saved.thought);
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
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
  expect((await state(page)).cravings[0].thought).toBe(
    "Deze tekst mag niet verdwijnen.",
  );
});

test("meerdere check-ins, expliciete nameting en dagoverzicht blijven aparte registraties", async ({
  page,
}) => {
  await open(page, "/moment/new");
  await page.getByRole("button", { name: "-1 Laag", exact: true }).click();
  await page.getByLabel(/^Emotionele intensiteit/).fill("70");
  await page
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Buiten wandelen");
  await page.getByRole("button", { name: "Dit moment opslaan" }).click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nameting invullen" }).click();
  const after = page.locator(".dp-after-form");
  await after.getByRole("button", { name: "Ja", exact: true }).click();
  await after.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await after.getByLabel(/^Na: Emotionele intensiteit/).fill("30");
  await page.getByRole("button", { name: "Dit moment opslaan" }).click();
  expect((await state(page)).moments[0].after).toBeNull();
  await after.getByRole("button", { name: "Nameting opslaan" }).click();
  await expect
    .poll(async () => (await state(page)).moments[0].after?.mood)
    .toBe(1);
  await page.getByRole("button", { name: "Nog een check-in" }).click();
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Een tweede moment op dezelfde dag.");
  await page.getByRole("button", { name: "Dit moment opslaan" }).click();
  await expect.poll(async () => (await state(page)).moments.length).toBe(2);
  await page.getByRole("button", { name: "Mijn dag", exact: true }).click();
  await page
    .getByRole("button", { name: "Mijn hele dag", exact: true })
    .click();
  await page
    .getByLabel("Wat wil je onthouden van vandaag?")
    .fill("Mijn terugblik is een apart geheel.");
  await page.getByLabel("Uren slaap").fill("7");
  await page.getByLabel("Minuten slaap").fill("30");
  await page.getByRole("button", { name: "Dagoverzicht opslaan" }).click();
  await expect.poll(async () => (await state(page)).days.length).toBe(1);
  const saved = await state(page);
  expect(saved.moments).toHaveLength(2);
  expect(saved.cravings).toHaveLength(0);
  expect(saved.days[0].ratings).toEqual({ mood: null, eis: null });
  expect(saved.moments.find((entry: any) => entry.activity)).toMatchObject({
    before: { mood: -1, eis: 70 },
    after: { mood: 1, eis: 30 },
    attempted: true,
  });
});

test("back-up downloaden, ongeldige import weigeren en geldige vervanging bevestigen", async ({
  page,
}) => {
  await createCraving(page, "Oorspronkelijke aantekening");
  await open(page, "/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back-up exporteren" }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.format).toBe("anchor.app.backup");
  expect(backup.state.cravings).toHaveLength(1);
  const before = await state(page);
  await page
    .getByRole("button", { name: "Back-up importeren", exact: true })
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

test("een back-up kan een open concept niet ongemerkt vervangen", async ({
  page,
}) => {
  await createCraving(page, "Een opgeslagen craving.");
  await open(page, "/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back-up exporteren" }).click();
  const download = await downloadPromise;
  const backup = await readFile((await download.path())!);
  await open(page, "/craving/new");
  await page
    .getByLabel(/^Emotie/)
    .fill("Dit concept moet eerst een keuze krijgen.");
  await open(page, "/settings");
  const before = await state(page);
  await page
    .getByRole("button", { name: "Back-up importeren", exact: true })
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
  second.on("dialog", (dialog) => void dialog.accept());
  await second.goto("./#/craving/new");
  await expect(second.getByText(/^Alleen lezen\./)).toBeVisible();
  await expect(second.getByLabel(/^Gedachte/)).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "Craving opslaan", exact: true }),
  ).toBeDisabled();
  const original = await state(second);
  await page.close();
  await second.reload();
  await expect(second.getByLabel(/^Gedachte/)).toBeEnabled();
  await second
    .getByLabel(/^Gedachte/)
    .fill("Nieuwe tekst na wisselen van tabblad.");
  await second
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect
    .poll(async () => (await state(second)).cravings.length)
    .toBe(original.cravings.length + 1);
  await second.close();
});

test("beschadigde gegevens worden bewaard tot een back-up bewust is hersteld", async ({
  page,
}) => {
  await createCraving(page, "Deze registratie komt terug uit de back-up.");
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
}) => {
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
  await page.reload();
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
  await expect(page.getByText(/^Je bent offline\./)).toBeVisible();
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Ook offline aangevuld.");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await page.reload();
  await expect(page.getByLabel(/^Gedrag \(wat deed je\?\)/)).toHaveValue(
    "Ook offline aangevuld.",
  );
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
  await expect(page.getByRole("heading", { name: "Je craving" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("390-light-200-percent-craving.png"),
    fullPage: true,
  });
});
