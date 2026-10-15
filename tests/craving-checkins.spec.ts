import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createEmptyState,
  parseBackup,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  type AppState,
  type Moment,
} from "../src/lib/storage";

const date = "2026-10-15";
const cravingId = "synthetic-craving-link";
const longNote = Array.from(
  { length: 10 },
  (_, index) =>
    `Synthetische regel ${index + 1}: ik beschrijf rustig hoe dit moment voor mij voelde.`,
).join("\n");
const otherDraft = {
  id: "keep-link-growth",
  date,
  text: "Een ander concept blijft exact behouden.",
  favorite: false,
};

function moment(
  id: string,
  time: string,
  changes: Partial<Moment> = {},
): Moment {
  return {
    id,
    date,
    time,
    kind: "checkin",
    before: { mood: null, eis: null },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: `Synthetische check-in ${id}.`,
    ...changes,
  };
}

function fixture(): AppState {
  const state = createEmptyState();
  state.cravings = [
    {
      id: cravingId,
      date,
      time: "14:00",
      substances: ["Cocaine", "3-MMC"],
      situation: "Een synthetische craving.",
      thought: "Ik wil later kunnen terugkijken.",
      bodySensation: "",
      emotion: "Nerveus",
      behavior: "Ik nam een pauze.",
    },
    {
      id: "other-craving",
      date,
      time: "12:00",
      situation: "Andere synthetische craving.",
      thought: "",
      bodySensation: "",
      emotion: "",
      behavior: "",
    },
  ];
  state.moments = [
    moment("earlier", "13:59"),
    moment("same-minute", "14:00"),
    moment("later", "15:30"),
    moment("other-linked", "15:45", { cravingId: "other-craving" }),
    moment("orphan", "15:50", { cravingId: "missing-craving" }),
    moment("linked", "16:00", {
      cravingId,
      before: {
        mood: 0,
        eis: null,
        emotionRatings: [
          { id: "zero", label: "Nerveus", intensity: 0 },
          { id: "unknown", label: "Rustig", intensity: null },
        ],
      },
      note: longNote,
    }),
  ];
  state.plan = {
    warning: "Een eigen signaal.",
    action: "Rust nemen.",
    support: "Een vertrouwd persoon.",
  };
  return state;
}

async function seed(
  page: Page,
  state = fixture(),
  extraDrafts: Record<string, unknown> = {},
) {
  await page.addInitScript(
    ({ state, records, dataKey, draftKey }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(state));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, records }));
      if (!localStorage.getItem("unrelated.craving-links"))
        localStorage.setItem("unrelated.craving-links", "synthetic untouched");
    },
    {
      state,
      records: { growth: otherDraft, ...extraDrafts },
      dataKey: STORAGE_KEY,
      draftKey: DRAFT_STORAGE_KEY,
    },
  );
}

async function open(page: Page, route = `/craving/${cravingId}`) {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
const section = (page: Page) =>
  page.getByRole("region", { name: "Later inchecken", exact: true });
const start = (page: Page) =>
  section(page).getByRole("button", {
    name: "Nieuwe check-in bij deze craving",
    exact: true,
  });
const select = (page: Page) =>
  section(page).getByRole("combobox", {
    name: "Bestaande check-in",
    exact: true,
  });
const link = (page: Page) =>
  section(page).getByRole("button", { name: "Check-in koppelen", exact: true });
const linked = (page: Page, id = "linked") =>
  section(page).locator(`[data-linked-checkin-id="${id}"]`);
const unlink = (page: Page, id = "linked") =>
  linked(page, id).getByRole("button", {
    name: /^Koppeling verwijderen van check-in/,
  });
const stored = (page: Page): Promise<AppState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_STORAGE_KEY,
  );
const raw = (page: Page) =>
  page.evaluate(
    ([dataKey, draftKey]) => ({
      data: localStorage.getItem(dataKey),
      drafts: localStorage.getItem(draftKey),
      unrelated: localStorage.getItem("unrelated.craving-links"),
    }),
    [STORAGE_KEY, DRAFT_STORAGE_KEY],
  );

async function failWrites(page: Page, enabled: boolean) {
  await page.evaluate(
    ({ key, enabled }) => {
      const testWindow = window as Window & {
        cravingLinksSetItem?: typeof Storage.prototype.setItem;
      };
      testWindow.cravingLinksSetItem ??= Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (enabled && name === key)
          throw new DOMException(
            "Synthetische opslagfout",
            "QuotaExceededError",
          );
        return testWindow.cravingLinksSetItem!.call(this, name, value);
      };
    },
    { key: STORAGE_KEY, enabled },
  );
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${date}T18:00:00+02:00`));
  await page.setViewportSize({ width: 390, height: 844 });
});

test("later inchecken verschijnt alleen bij een opgeslagen craving en toont alle gekoppelde woorden zonder score-inferentie", async ({
  page,
}) => {
  await seed(page);
  await open(page, "/craving/new");
  await expect(section(page)).toHaveCount(0);
  await open(page);
  const before = await raw(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(linked(page)).toContainText("15 oktober 2026 om 16:00");
  await expect(linked(page)).toContainText("Neutraal");
  await expect(linked(page)).toContainText("Nerveus: 0/100");
  await expect(linked(page)).toContainText("Rustig: niet ingevuld");
  const note = linked(page).getByText(longNote, { exact: true });
  await expect(note).toBeVisible();
  expect(await note.textContent()).toBe(longNote);
  expect(
    await note.evaluate((element) => ({
      fullHeight: element.scrollHeight <= element.clientHeight + 1,
      fullWidth: element.scrollWidth <= element.clientWidth + 1,
      unclamped: getComputedStyle(element).webkitLineClamp === "none",
    })),
  ).toEqual({ fullHeight: true, fullWidth: true, unclamped: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(await raw(page)).toEqual(before);
});

test("een nieuwe gekoppelde check-in bewaart zelfstandig stemming, emotie en notitie en keert terug bij de craving", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await stored(page);
  const pending = await drafts(page);
  await start(page).click();
  await expect(page).toHaveURL(
    new RegExp(`#/moment/new\\?craving=${cravingId}$`),
  );
  const form = page
    .locator("form")
    .filter({ has: page.locator(".dp-ratings-editor") })
    .first();
  await form.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await form
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .first()
    .selectOption({ label: "Nerveus" });
  await form.getByLabel("Intensiteit van Nerveus", { exact: true }).fill("35");
  await page
    .getByLabel(/^In je eigen woorden/)
    .fill("Synthetische latere check-in.\nIk heb even gerust.");
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${cravingId}$`));
  const after = await stored(page);
  expect(after.moments).toHaveLength(before.moments.length + 1);
  const added = after.moments.at(-1)!;
  expect(added.cravingId).toBe(cravingId);
  expect(added.before).toMatchObject({
    mood: 1,
    eis: null,
    emotionRatings: [{ label: "Nerveus", intensity: 35 }],
  });
  expect(added.note).toBe("Synthetische latere check-in.\nIk heb even gerust.");
  expect(after.cravings).toEqual(before.cravings);
  expect(after.moments.slice(0, -1)).toEqual(before.moments);
  expect(await drafts(page)).toEqual(pending);
  await expect(linked(page, added.id)).toContainText(added.note);
  await expect(linked(page, added.id)).toContainText("Nerveus: 35/100");
});

test("Terugkijken toont de volledige gekoppelde check-in bij de craving en de cravingverwijzing bij de zelfstandige check-in", async ({
  page,
}) => {
  await seed(page);
  await open(page, "/history");
  const before = await raw(page);
  const cravingEntry = page.locator(`[data-history-id="${cravingId}"]`);
  await cravingEntry.locator("summary").click();
  const related = cravingEntry.getByRole("region", {
    name: "Gekoppelde check-ins",
    exact: true,
  });
  await expect(related.getByText(longNote, { exact: true })).toBeVisible();
  await expect(related).toContainText("15 oktober 2026 om 16:00");
  await expect(related).toContainText("Neutraal");
  await expect(related).toContainText("Nerveus: 0/100");
  await expect(related).toContainText("Rustig: niet ingevuld");
  const independent = page.locator('[data-history-id="linked"]');
  await independent.locator("summary").click();
  await expect(independent).toContainText("Gekoppelde craving");
  await expect(independent).toContainText("14:00");
  await expect(independent).toContainText("Cocaine");
  await expect(independent.getByText(longNote, { exact: true })).toBeVisible();
  expect(await raw(page)).toEqual(before);
});

test("een nieuwe gekoppelde check-in vóór de craving blijft als concept bewaard totdat datum en tijd zijn gecorrigeerd", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await stored(page);
  await start(page).click();
  const note = "Synthetische terugblik met een bewust verkeerd ingevulde tijd.";
  await page.getByLabel(/^In je eigen woorden/).fill(note);
  await page.getByText("Datum en tijd aanpassen", { exact: true }).click();
  await page.getByLabel("Tijd momentopname", { exact: true }).fill("13:59");
  const pending = await drafts(page);
  expect(pending["moment:new"]).toMatchObject({
    cravingId,
    date,
    time: "13:59",
    note,
  });
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(
    page.getByText(
      "Kies voor deze terugblik een datum en tijd op of na de craving.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Datum momentopname", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(note);
  await expect(
    page.getByLabel("Tijd momentopname", { exact: true }),
  ).toHaveValue("13:59");
  expect(await stored(page)).toEqual(before);
  expect(await drafts(page)).toEqual(pending);
  await page.getByLabel("Tijd momentopname", { exact: true }).fill("14:00");
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${cravingId}$`));
  const after = await stored(page);
  expect(after.moments).toHaveLength(before.moments.length + 1);
  expect(after.moments.at(-1)).toMatchObject({
    cravingId,
    date,
    time: "14:00",
    note,
    before: { mood: null, eis: null },
  });
  expect(after.cravings).toEqual(before.cravings);
  expect((await drafts(page))["moment:new"]).toBeUndefined();
  expect((await drafts(page)).growth).toEqual(otherDraft);
});

test("geïmporteerde IDs met dubbele punten blijven intact bij gekoppelde check-ins openen, teruggaan en toevoegen", async ({
  page,
}) => {
  const importedCravingId = "legacy:craving";
  const importedMomentId = "legacy:moment";
  const initial = fixture();
  initial.cravings[0].id = importedCravingId;
  initial.moments = initial.moments.map((item) => ({
    ...item,
    ...(item.id === "linked"
      ? { id: importedMomentId, activity: "5-4-3-2-1" }
      : {}),
    ...(item.cravingId === cravingId ? { cravingId: importedCravingId } : {}),
  }));
  await seed(page, initial);
  const cravingRoute = `/craving/${encodeURIComponent(importedCravingId)}`;
  await open(page, cravingRoute);
  const before = await raw(page);
  await linked(page, importedMomentId)
    .getByRole("button", { name: /^Check-in openen van/ })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `#/moment/${encodeURIComponent(importedMomentId)}\\?returnCraving=${encodeURIComponent(importedCravingId)}$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(longNote);
  await page
    .getByRole("button", { name: "Open de oefening", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/exercise\?/);
  expect(
    new URLSearchParams(page.url().split("?")[1]).get("returnCraving"),
  ).toBe(importedCravingId);
  await page
    .getByRole("button", { name: "Stoppen en terug", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  expect(
    new URLSearchParams(page.url().split("?")[1]).get("returnCraving"),
  ).toBe(importedCravingId);
  await page
    .getByRole("button", { name: "Terug naar craving", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${cravingRoute}$`));
  expect(await raw(page)).toEqual(before);
  await start(page).click();
  await expect(page).toHaveURL(
    new RegExp(
      `#/moment/new\\?craving=${encodeURIComponent(importedCravingId)}$`,
    ),
  );
  const note = "Synthetische nieuwe terugblik bij een geïmporteerde craving.";
  await page.getByLabel(/^In je eigen woorden/).fill(note);
  await page
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#${cravingRoute}$`));
  const saved = await stored(page);
  expect(saved.cravings).toEqual(initial.cravings);
  expect(saved.moments.slice(0, -1)).toEqual(initial.moments);
  expect(saved.moments.at(-1)).toMatchObject({
    cravingId: importedCravingId,
    note,
  });
  expect(
    saved.moments.find((item) => item.id === importedMomentId)?.cravingId,
  ).toBe(importedCravingId);
  expect(await drafts(page)).toEqual({ growth: otherDraft });
});

test("bestaande check-ins koppelen is expliciet, filtert eerdere of bezette registraties en ontkoppelen verwijdert geen inhoud", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await stored(page);
  const pending = await drafts(page);
  expect(
    await select(page)
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      ),
  ).toEqual(["", "same-minute", "later"]);
  await expect(link(page)).toBeDisabled();
  await select(page).selectOption("same-minute");
  expect(await stored(page)).toEqual(before);
  await link(page).click();
  await expect(linked(page, "same-minute")).toBeFocused();
  const after = await stored(page);
  expect(after).toEqual({
    ...before,
    revision: before.revision + 1,
    moments: before.moments.map((item) =>
      item.id === "same-minute" ? { ...item, cravingId } : item,
    ),
  });
  expect(await drafts(page)).toEqual(pending);
  await unlink(page, "same-minute").click();
  await expect(select(page)).toBeFocused();
  await expect(linked(page, "same-minute")).toHaveCount(0);
  expect(await stored(page)).toEqual({
    ...before,
    revision: before.revision + 2,
  });
  expect(await drafts(page)).toEqual(pending);
  expect((await raw(page)).unrelated).toBe("synthetic untouched");
});

test("mislukt koppelen en ontkoppelen bewaart beide registraties en concepten en biedt lokaal opnieuw proberen", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  for (const operation of ["link", "unlink"] as const) {
    if (operation === "link") await select(page).selectOption("later");
    const before = await raw(page);
    await failWrites(page, true);
    await (operation === "link" ? link(page) : unlink(page, "later")).click();
    await expect(section(page).getByRole("alert")).toBeFocused();
    expect(await raw(page)).toEqual(before);
    await failWrites(page, false);
    await (operation === "link" ? link(page) : unlink(page, "later")).click();
    await expect(section(page).getByRole("alert")).toHaveCount(0);
    await expect(linked(page, "later")).toHaveCount(
      operation === "link" ? 1 : 0,
    );
  }
});

test("een bestaand nieuw check-inconcept wordt niet overschreven of stilzwijgend aan een craving gekoppeld", async ({
  page,
}) => {
  const oldDraft = moment("existing-new-draft", "13:30", {
    before: { mood: -1, eis: null },
    note: "Synthetisch eerder concept dat geen craving heeft.",
  });
  await seed(page, fixture(), { "moment:new": oldDraft });
  await open(page);
  const before = await raw(page);
  await start(page).click();
  await expect(
    page.getByRole("heading", {
      name: "Je hebt al een open check-in",
      exact: true,
    }),
  ).toBeVisible();
  expect(await raw(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Terug naar craving", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${cravingId}$`));
  expect(await raw(page)).toEqual(before);
  await start(page).click();
  await page
    .getByRole("button", { name: "Verder met bestaand concept", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/moment\/new$/);
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(
    oldDraft.note,
  );
  expect((await drafts(page))["moment:new"]).toEqual(oldDraft);
  expect((await drafts(page))["moment:new"]).not.toHaveProperty("cravingId");
  expect(await raw(page)).toEqual(before);
});

test("een nieuwere opslagrevisie voorkomt dat koppelen nieuwere gegevens overschrijft", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await select(page).selectOption("later");
  const before = await stored(page);
  const pending = await drafts(page);
  const newer = {
    ...before,
    revision: before.revision + 1,
    plan: { ...before.plan, action: "Een nieuwere keuze blijft staan." },
  };
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: newer },
  );
  await link(page).click();
  await expect(section(page).getByRole("alert")).toBeVisible();
  expect(await stored(page)).toEqual(newer);
  expect(await drafts(page)).toEqual(pending);
});

for (const initiallyLinked of [false, true]) {
  test(`een ouder check-inconcept ${initiallyLinked ? "met" : "zonder"} koppeling overschrijft geen latere expliciete koppelkeuze`, async ({
    page,
  }) => {
    const initial = fixture();
    const target = initial.moments.find((item) => item.id === "later")!;
    if (initiallyLinked) target.cravingId = cravingId;
    await seed(page, initial);
    await open(page, "/moment/later");
    await page
      .getByLabel(/^In je eigen woorden/)
      .fill("Een ouder synthetisch concept blijft bestaan.");
    const pending = await drafts(page);
    await open(page);
    if (initiallyLinked) await unlink(page, "later").click();
    else {
      await select(page).selectOption("later");
      await link(page).click();
    }
    expect(await drafts(page)).toEqual(pending);
    await open(page, "/moment/later");
    await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(
      "Een ouder synthetisch concept blijft bestaan.",
    );
    await page
      .getByRole("button", {
        name: "Wijzigingen check-in opslaan",
        exact: true,
      })
      .click();
    const after = (await stored(page)).moments.find(
      (item) => item.id === "later",
    )!;
    expect(after.note).toBe("Een ouder synthetisch concept blijft bestaan.");
    if (initiallyLinked) expect(after).not.toHaveProperty("cravingId");
    else expect(after.cravingId).toBe(cravingId);
    expect(after.before).toEqual(target.before);
    expect((await drafts(page))["moment:later"]).toBeUndefined();
    expect((await drafts(page)).growth).toEqual(otherDraft);
  });
}

test("een alleen-lezen-tab kan volledige gekoppelde check-ins lezen en geen koppeling wijzigen", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  await expect(start(page)).toBeEnabled();
  const before = await raw(page);
  const reader = await context.newPage();
  await open(reader);
  await expect(reader.getByText(/^Alleen lezen\./)).toBeVisible();
  await expect(start(reader)).toBeDisabled();
  await expect(select(reader)).toBeDisabled();
  await expect(link(reader)).toBeDisabled();
  await expect(unlink(reader)).toBeDisabled();
  await expect(
    linked(reader).getByText(longNote, { exact: true }),
  ).toBeVisible();
  expect(await raw(reader)).toEqual(before);
});

test("offline koppelen en ontkoppelen overleeft herladen; craving verwijderen bewaart de onafhankelijke check-in en diens concept", async ({
  page,
  context,
}) => {
  const initial = fixture();
  const savedLinked = initial.moments.find((item) => item.id === "linked")!;
  const pendingLinked = {
    ...savedLinked,
    note: "Synthetisch onafgemaakt gekoppeld concept.",
  };
  await seed(page, initial, { "moment:linked": pendingLinked });
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await select(page).selectOption("later");
  await link(page).click();
  await page.reload();
  await expect(linked(page, "later")).toBeVisible();
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`uncached-craving-link-${crypto.randomUUID()}.txt`, {
          cache: "no-store",
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await unlink(page, "later").click();
  const beforeDelete = await stored(page);
  const pending = await drafts(page);
  await page
    .getByRole("button", { name: "Craving verwijderen", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const afterDelete = await stored(page);
  expect(afterDelete.moments).toEqual(beforeDelete.moments);
  expect(afterDelete.cravings).toEqual(
    beforeDelete.cravings.filter((item) => item.id !== cravingId),
  );
  expect(await drafts(page)).toEqual(pending);
  await open(page, "/moment/linked");
  await expect(
    page.getByText(/gekoppelde craving is niet meer beschikbaar/i),
  ).toBeVisible();
  await expect(page.getByLabel(/^In je eigen woorden/)).toHaveValue(
    pendingLinked.note,
  );
  await open(page, "/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up downloaden", exact: true })
    .click();
  const exported = parseBackup(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(exported).toEqual(afterDelete);
  expect((await drafts(page))["moment:linked"]).toEqual(pendingLinked);
  expect((await raw(page)).unrelated).toBe("synthetic untouched");
  await open(page, "/moment/linked");
  await page
    .getByRole("button", {
      name: "Koppeling met craving verwijderen",
      exact: true,
    })
    .click();
  expect(
    (await stored(page)).moments.find((item) => item.id === "linked"),
  ).not.toHaveProperty("cravingId");
  expect((await drafts(page))["moment:linked"]).toEqual(pendingLinked);
  await page
    .getByRole("button", { name: "Wijzigingen check-in opslaan", exact: true })
    .click();
  const unlinked = (await stored(page)).moments.find(
    (item) => item.id === "linked",
  )!;
  expect(unlinked.note).toBe(pendingLinked.note);
  expect(unlinked).not.toHaveProperty("cravingId");
  expect((await drafts(page))["moment:linked"]).toBeUndefined();
});
