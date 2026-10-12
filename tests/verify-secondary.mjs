import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createEmptyState,
  today,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
} from "../src/lib/storage.ts";
const base = "http://127.0.0.1:8800/Anchor/";
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = join(root, "tmp", "secondary-qa");
await mkdir(artifacts, { recursive: true });
let server;
let browser;
let context;
let page;
let serverLog = "";
let serverError;
const available = async () => {
  try {
    return (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
};
async function ensurePreview() {
  if (await available()) return;
  server = spawn(
    process.execPath,
    [
      join(root, "node_modules", "vite", "bin", "vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "8800",
      "--strictPort",
    ],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const capture = (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-4000);
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  server.on("error", (error) => {
    serverError = error;
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await available()) return;
    if (serverError || server.exitCode !== null)
      throw new Error(
        `Anchor preview could not start. Run the production build first. ${serverError?.message || serverLog}`,
      );
    await delay(150);
  }
  throw new Error(
    `Anchor preview was not ready within 20 seconds. ${serverLog}`,
  );
}
const report = { checks: [], screenshots: [], errors: [] };
const saveCheck = (name) => {
  report.checks.push(name);
  console.log("PASS", name);
};
const navigate = async (hash) => {
  await page.goto(base + hash);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
};
const data = async () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const drafts = async () =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_STORAGE_KEY,
  );
const screenshot = async (name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(artifacts, `${name}.png`),
    fullPage: true,
  });
  report.screenshots.push(`${name}.png`);
};
try {
  await ensurePreview();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await navigate("#/plan");
  await page
    .getByRole("button", { name: "Doel toevoegen", exact: true })
    .click();
  await page.getByLabel("Soort doel").selectOption("Other substance");
  await page
    .getByLabel("Naam van het middel of doel")
    .fill("Eigen doel met een aanpasbare middelnaam");
  await page
    .getByLabel("Mijn richting", { exact: true })
    .fill("Minder gebruiken");
  await navigate("#/settings");
  await navigate("#/plan");
  await expect(page.getByLabel("Naam van het middel of doel")).toHaveValue(
    "Eigen doel met een aanpasbare middelnaam",
  );
  saveCheck("Goal draft survives route navigation");
  await page.reload();
  await expect(page.getByLabel("Naam van het middel of doel")).toHaveValue(
    "Eigen doel met een aanpasbare middelnaam",
  );
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  expect((await data()).goals).toHaveLength(1);
  expect((await drafts()).goal).toBeUndefined();
  saveCheck("Goal draft survives reload and commits exactly once");
  const id = (await data()).goals[0].id;
  await page
    .getByRole("button", {
      name: "Bewerk doel Eigen doel met een aanpasbare middelnaam",
    })
    .click();
  await page.getByLabel("Naam van het middel of doel").fill("Ketamine");
  await page.getByLabel("Soort doel").selectOption("Other substance");
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  expect((await data()).goals[0].id).toBe(id);
  expect((await data()).goals[0].name).toBe("Ketamine");
  saveCheck("Custom goal name edits without replacing stable record ID");
  await page.getByLabel("Dit merk ik bij mezelf").fill("Ik trek me terug.");
  await page.getByLabel("Dit kan ik doen").fill("Naar buiten wandelen.");
  await page.getByLabel("Hier vind ik steun").fill("Een vertrouwd persoon.");
  await page.reload();
  await expect(page.getByLabel("Hier vind ik steun")).toHaveValue(
    "Een vertrouwd persoon.",
  );
  await page
    .getByRole("button", { name: "Mijn plan opslaan", exact: true })
    .click();
  expect((await data()).plan.action).toBe("Naar buiten wandelen.");
  expect((await drafts()).plan).toBeUndefined();
  saveCheck("Personal plan draft survives reload and clears on save");
  await page
    .getByLabel("Dit kan ik doen")
    .fill("Een wijziging die ik wil verwerpen.");
  await page
    .getByRole("button", { name: "Wijzigingen verwerpen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, wijzigingen verwerpen", exact: true })
    .click();
  await expect(page.getByLabel("Dit kan ik doen")).toHaveValue(
    "Naar buiten wandelen.",
  );
  expect((await drafts()).plan).toBeUndefined();
  saveCheck(
    "Plan draft can be explicitly discarded without changing the saved plan",
  );
  await screenshot("desktop-plan-dark");
  await navigate("#/growth");
  await page.getByLabel("Wat wil je onthouden?").fill("Fietsen was fijn.");
  await page.getByLabel("Datum", { exact: true }).fill("");
  await page
    .getByLabel("Wat wil je onthouden?")
    .fill("Fietsen met de zon op mijn gezicht.");
  await page.getByLabel("Als favoriet bewaren", { exact: true }).check();
  await navigate("#/settings");
  await navigate("#/growth");
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Wat wil je onthouden?")).toHaveValue(
    "Fietsen met de zon op mijn gezicht.",
  );
  await page.reload();
  await expect(page.getByLabel("Wat wil je onthouden?")).toHaveValue(
    "Fietsen met de zon op mijn gezicht.",
  );
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue("");
  await page
    .getByRole("button", { name: "Moment bewaren", exact: true })
    .click();
  expect((await data()).growth).toHaveLength(0);
  expect(
    await page
      .getByLabel("Datum", { exact: true })
      .evaluate((input) => input.validity.valueMissing),
  ).toBe(true);
  expect((await drafts()).growth).toMatchObject({
    date: "",
    text: "Fietsen met de zon op mijn gezicht.",
    favorite: true,
  });
  await page.getByLabel("Datum", { exact: true }).fill(today());
  saveCheck(
    "Growth text edited after clearing its date survives navigation and reload; an incomplete date cannot be saved",
  );
  await page
    .getByRole("button", { name: "Moment bewaren", exact: true })
    .click();
  expect((await data()).growth).toHaveLength(1);
  expect((await data()).growth[0].favorite).toBe(true);
  expect((await drafts()).growth).toBeUndefined();
  saveCheck("Growth draft, date and favorite survive reload and save");
  await page
    .getByRole("button", {
      name: "Bewerk fijn moment: Fietsen met de zon op mijn gezicht.",
    })
    .click();
  await page
    .getByLabel("Je fijne moment aanpassen")
    .fill("Fietsen en daarna een mooi schilderij gemaakt.");
  await page
    .getByRole("button", { name: "Wijzigingen bewaren", exact: true })
    .click();
  expect((await data()).growth).toHaveLength(1);
  expect((await data()).growth[0].text).toContain("schilderij");
  await page
    .getByRole("button", {
      name: "Verwijder favoriet: Fietsen en daarna een mooi schilderij gemaakt.",
    })
    .click();
  expect((await data()).growth[0].favorite).toBe(false);
  saveCheck("Growth editing and favorite toggling preserve one record");
  await page.getByLabel("Wat wil je onthouden?").fill("Onvolledig concept");
  await page
    .getByRole("button", { name: "Concept wissen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Verder schrijven", exact: true })
    .click();
  expect((await drafts()).growth.text).toBe("Onvolledig concept");
  await page
    .getByRole("button", { name: "Concept wissen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, concept wissen", exact: true })
    .click();
  expect((await drafts()).growth).toBeUndefined();
  saveCheck("Explicit draft discard protects saved growth entries");
  await screenshot("desktop-growth-dark");
  await navigate("#/settings");
  await page.getByRole("radio", { name: "Licht Warm papier" }).check();
  await page.reload();
  expect((await data()).theme).toBe("light");
  await page.getByLabel("Fijne momenten op Vandaag").uncheck();
  expect((await data()).homeShowGrowth).toBe(false);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back-up exporteren" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/anchor.*json/i);
  await page.getByRole("button", { name: "Privacy en opslag" }).click();
  await expect(page.getByRole("dialog")).toContainText("Anchor");
  await page.getByRole("button", { name: "Begrepen", exact: true }).click();
  saveCheck(
    "Settings theme/home preference persist, backup download and privacy open",
  );
  await screenshot("desktop-settings-light");
  await page.getByRole("radio", { name: "Donker Rustig espresso" }).check();
  await navigate("#/plan");
  await page.getByRole("button", { name: "Verwijder doel Ketamine" }).click();
  await page.getByRole("button", { name: "Behouden", exact: true }).click();
  expect((await data()).goals).toHaveLength(1);
  await page.getByRole("button", { name: "Verwijder doel Ketamine" }).click();
  await page
    .getByRole("button", { name: "Ja, doel verwijderen", exact: true })
    .click();
  expect((await data()).goals).toHaveLength(0);
  saveCheck("Goal deletion requires explicit confirmation");
  await page
    .getByRole("button", { name: "Doel toevoegen", exact: true })
    .click();
  await page.getByLabel("Naam van het middel of doel").fill("Opslagtest");
  await page.evaluate((key) => {
    window.qaOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key)
        throw new DOMException("QA quota failure", "QuotaExceededError");
      return window.qaOriginalSetItem.call(this, k, v);
    };
  }, STORAGE_KEY);
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  await expect(page.getByLabel("Naam van het middel of doel")).toHaveValue(
    "Opslagtest",
  );
  expect((await data()).goals).toHaveLength(0);
  expect((await drafts()).goal.name).toBe("Opslagtest");
  await page.evaluate(
    () => (Storage.prototype.setItem = window.qaOriginalSetItem),
  );
  saveCheck(
    "Storage failure preserves unsaved goal form and draft without false success",
  );
  await page.evaluate((key) => {
    window.qaOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key && !JSON.parse(v).records.goal)
        throw new DOMException("QA cleanup failure", "QuotaExceededError");
      return window.qaOriginalSetItem.call(this, k, v);
    };
  }, DRAFT_STORAGE_KEY);
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  expect((await data()).goals).toHaveLength(1);
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  expect((await data()).goals).toHaveLength(1);
  await page.evaluate(
    () => (Storage.prototype.setItem = window.qaOriginalSetItem),
  );
  await page.getByRole("button", { name: "Doel opslaan", exact: true }).click();
  expect((await data()).goals).toHaveLength(1);
  expect((await drafts()).goal).toBeUndefined();
  saveCheck("Draft cleanup failure cannot duplicate a successfully saved goal");
  await navigate("#/growth");
  await page
    .getByRole("button", {
      name: "Verwijder fijn moment: Fietsen en daarna een mooi schilderij gemaakt.",
    })
    .click();
  await page.getByRole("button", { name: "Behouden", exact: true }).click();
  expect((await data()).growth).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Verwijder fijn moment: Fietsen en daarna een mooi schilderij gemaakt.",
    })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  expect((await data()).growth).toHaveLength(0);
  saveCheck("Growth deletion requires explicit confirmation");
  for (const [screen, hash] of [
    ["plan", "#/plan"],
    ["growth", "#/growth"],
    ["settings", "#/settings"],
    ["history", "#/history"],
  ]) {
    await page.setViewportSize({ width: 320, height: 850 });
    await navigate(hash);
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot(`phone-${screen}-dark`);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot(`phone-${screen}-200pct`);
    expect(await page.locator("body").innerText()).not.toMatch(
      /demostand|demodoel|ontwerpvoorvertoning|buiten deze preview|simuleren/i,
    );
  }
  saveCheck("All four secondary screens reflow at 320px and 200 percent text");
  await context.close();
  const historyState = createEmptyState();
  historyState.theme = "light";
  historyState.cravings = [
    {
      id: "qa-craving",
      date: today(),
      time: "10:10",
      situation: "Alleen thuis in de keuken",
      thought: "Ik wil iets nemen",
      bodySensation: "Knoop in mijn buik",
      emotion: "Onrustig",
      behavior: "Een glas water gepakt en naar buiten gelopen",
    },
  ];
  const older = new Date(`${today()}T12:00:00`);
  older.setDate(older.getDate() - 10);
  const oldDate = `${older.getFullYear()}-${String(older.getMonth() + 1).padStart(2, "0")}-${String(older.getDate()).padStart(2, "0")}`;
  historyState.moments = [
    {
      id: "qa-oldmoment",
      date: oldDate,
      time: "11:00",
      kind: "checkin",
      before: { mood: -1, eis: 50 },
      after: { mood: 1, eis: 20 },
      afterDate: today(),
      afterTime: "10:20",
      activity: "Schilderen",
      attempted: false,
      emotions: ["Onrustig"],
      note: "Een nameting op een latere dag.",
    },
  ];
  const hc = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    reducedMotion: "reduce",
  });
  await hc.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: historyState },
  );
  const hp = await hc.newPage();
  hp.on("pageerror", (error) => report.errors.push(error.message));
  await hp.goto(base + "#/history");
  await expect(
    hp.getByRole("heading", { name: "Craving / drang", exact: true }),
  ).toBeVisible();
  await expect(
    hp.getByRole("img", { name: /1 stemmingsmetingen/ }),
  ).toBeVisible();
  await hp
    .getByText("Meetwaarden van de grafiek als tekst (1)", { exact: true })
    .click();
  await expect(hp.locator(".dp-observation-details")).toContainText(
    "Stemming +1",
  );
  await expect(hp.locator(".dp-observation-details")).toContainText("Nameting");
  await expect(hp.locator(".dp-observation-details")).not.toContainText(
    "Na activiteit",
  );
  await expect(
    hp.getByRole("button", { name: /^Bekijk momentcheck-in/ }),
  ).toBeEnabled();
  await expect(hp.locator(".dp-history-list")).toContainText(
    "Activiteit niet geprobeerd",
  );
  saveCheck(
    "An in-week follow-up retains its older check-in in the list and never implies an untried activity happened",
  );
  for (const needle of [
    "keuken",
    "iets nemen",
    "Knoop",
    "Onrustig",
    "glas water",
  ]) {
    await hp.getByRole("searchbox").fill(needle);
    await expect(
      hp.getByRole("heading", { name: "Craving / drang", exact: true }),
    ).toBeVisible();
  }
  await hp.getByRole("searchbox").fill("");
  await hp.getByLabel("Soort registratie").selectOption("craving");
  await expect(hp.getByRole("img")).toHaveCount(0);
  await expect(
    hp.getByRole("heading", { name: "Stemming per moment", exact: true }),
  ).toHaveCount(0);
  saveCheck(
    "Craving search covers situation/thought/body/emotion/behavior and filter excludes mood graph",
  );
  await hp.evaluate(() => window.scrollTo(0, 0));
  await hp.screenshot({
    path: join(artifacts, "phone-history-craving-light.png"),
    fullPage: true,
  });
  report.screenshots.push("phone-history-craving-light.png");
  await hp.getByRole("button", { name: /Bekijk craving/ }).click();
  await expect(hp.getByRole("textbox", { name: /^Gedachte/ })).toHaveValue(
    "Ik wil iets nemen",
  );
  saveCheck("Craving history opens complete editable record");
  const readOnlyPage = await hc.newPage();
  await readOnlyPage.goto(base + "#/history");
  await expect(
    readOnlyPage.getByText(/Alleen lezen\. Sluit andere Anchor-tabbladen/),
  ).toBeVisible();
  await readOnlyPage.getByLabel("Soort registratie").selectOption("craving");
  await readOnlyPage.getByRole("searchbox").fill("keuken");
  await readOnlyPage.getByRole("button", { name: /^Bekijk craving/ }).click();
  await expect(
    readOnlyPage.getByRole("textbox", { name: /^Gedachte/ }),
  ).toHaveValue("Ik wil iets nemen");
  await expect(
    readOnlyPage.getByRole("textbox", { name: /^Gedachte/ }),
  ).toBeDisabled();
  await readOnlyPage.goto(base + "#/settings");
  await expect(
    readOnlyPage.getByRole("radio", { name: "Licht Warm papier" }),
  ).toBeDisabled();
  await expect(
    readOnlyPage.getByLabel("Fijne momenten op Vandaag"),
  ).toBeDisabled();
  await expect(
    readOnlyPage.getByRole("button", { name: "Back-up importeren" }),
  ).toBeDisabled();
  await expect(
    readOnlyPage.getByText(
      "Een back-up bevat alleen opgeslagen registraties.",
      { exact: false },
    ),
  ).toBeVisible();
  const readOnlyDownload = readOnlyPage.waitForEvent("download");
  await readOnlyPage
    .getByRole("button", { name: "Back-up exporteren" })
    .click();
  expect((await readOnlyDownload).suggestedFilename()).toMatch(/anchor.*json/i);
  await readOnlyPage.getByRole("button", { name: "Privacy en opslag" }).click();
  await expect(readOnlyPage.getByRole("dialog")).toContainText("Anchor");
  await readOnlyPage.close();
  saveCheck(
    "Read-only tabs can filter, open records, export and read privacy while all data-changing settings remain disabled",
  );
  await hc.close();

  const longState = createEmptyState();
  longState.goals = [
    {
      id: "long-goal",
      target: "Other substance",
      name: "EenZeerLangeMiddelnaam".repeat(9),
      direction: "Een eigen richting",
      note: "Samenhangende tekst. ".repeat(40),
    },
  ];
  longState.growth = [
    {
      id: "long-growth",
      date: today(),
      text: "LangeNotitieZonderSpaties".repeat(50),
      favorite: true,
    },
  ];
  longState.cravings = [
    {
      ...historyState.cravings[0],
      situation: "SituatieZonderSpaties".repeat(40),
      thought: "Een lange gedachte. ".repeat(50),
    },
  ];
  const longContext = await browser.newContext({
    viewport: { width: 320, height: 900 },
    locale: "nl-NL",
    reducedMotion: "reduce",
  });
  await longContext.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: longState },
  );
  const longPage = await longContext.newPage();
  for (const hash of ["#/plan", "#/growth", "#/history"]) {
    await longPage.goto(base + hash);
    await expect(longPage.getByRole("heading", { level: 1 })).toBeVisible();
    await longPage.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await longPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await longContext.close();
  saveCheck(
    "Long goal names, narrative text and unbroken words reflow at 320px with 200 percent text",
  );
  const historyOfYears = createEmptyState();
  for (let index = 0; index < 3000; index++) {
    const day = new Date(`${today()}T12:00:00`);
    day.setDate(day.getDate() - Math.floor(index / 4));
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    historyOfYears.moments.push({
      id: `history-${index}`,
      date,
      time: `${8 + (index % 4) * 3}:00`.padStart(5, "0"),
      kind: "checkin",
      before: { mood: (index % 5) - 2, eis: 40 },
      after: null,
      afterDate: null,
      afterTime: null,
      activity: "",
      attempted: null,
      emotions: [],
      note: `Korte persoonlijke aantekening ${index}.`,
    });
  }
  const historyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    reducedMotion: "reduce",
  });
  await historyContext.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: historyOfYears },
  );
  const historyPage = await historyContext.newPage();
  await historyPage.goto(base + "#/history");
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(28);
  await historyPage.getByLabel("Periode").selectOption("all");
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(50);
  await expect(historyPage.locator(".dp-observation-details li")).toHaveCount(
    40,
  );
  await expect(
    historyPage.getByText("3000 gevonden", { exact: true }),
  ).toBeVisible();
  expect(
    await historyPage.evaluate(() => document.querySelectorAll("*").length),
  ).toBeLessThan(2000);
  await historyPage
    .getByRole("button", { name: "Meer registraties tonen" })
    .click();
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(100);
  await expect(
    historyPage.locator(".dp-history-list > li > button").nth(50),
  ).toBeFocused();
  await historyPage.getByRole("searchbox").fill("aantekening 2999.");
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(1);
  await expect(historyPage.locator(".dp-history-list")).toContainText(
    "aantekening 2999.",
  );
  await historyPage.getByRole("searchbox").fill("");
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(50);
  await historyPage.getByLabel("Periode").selectOption("week");
  await expect(historyPage.locator(".dp-history-list > li")).toHaveCount(28);
  await historyContext.close();
  saveCheck(
    "A 3000-record history renders 50 entries and 40 text observations while pagination, focus, full-history search and filters remain correct",
  );
  expect(report.errors).toEqual([]);
  saveCheck("No browser runtime errors");
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await writeFile(
      join(artifacts, "report.json"),
      JSON.stringify(report, null, 2),
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const exited = new Promise((resolve) => server.once("exit", resolve));
        server.kill();
        await Promise.race([exited, delay(2000)]);
      }
    }
  }
}
