import { expect, test, type Page } from "@playwright/test";
import { createEmptyState, type Moment } from "../src/lib/storage";
import { EMOTION_GROUPS, EMOTION_OPTIONS } from "../src/lib/emotions";
import { EMOTION_MEANINGS } from "../src/lib/emotionMeanings";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const UNRELATED = "synthetic.emotion-meaning.keep";
const errors = new WeakMap<Page, string[]>();
const opener = (page: Page) =>
  page.getByRole("button", { name: "Bekijk de betekenissen", exact: true });
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "Emoties en betekenissen", exact: true });
const search = (page: Page) =>
  dialog(page).getByLabel("Zoek een emotie of betekenis", { exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    (keys) => keys.map((key) => localStorage.getItem(key)),
    [DATA, DRAFTS, UNRELATED],
  );

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page)!.push(error.message));
  const state = createEmptyState();
  state.theme = "light";
  state.palette = "ocean";
  const moment: Moment = {
    id: "meaning-saved",
    date: "2026-10-14",
    time: "10:00",
    kind: "checkin",
    before: {
      mood: 0,
      eis: null,
      emotionRatings: [
        { id: "meaning-emotion", label: "Nerveus", intensity: 0 },
      ],
    },
    after: null,
    afterDate: null,
    afterTime: null,
    activity: "",
    attempted: null,
    emotions: [],
    note: "Synthetische notitie die lezen niet mag wijzigen.",
  };
  state.moments = [moment];
  const pending = {
    ...moment,
    id: "meaning-pending",
    note: "Bewaard synthetisch concept",
    before: {
      ...moment.before,
      emotionRatings: [
        {
          id: "meaning-draft-emotion",
          label: "Mijn eigen gevoel",
          intensity: 47,
        },
      ],
    },
  };
  await page.addInitScript(
    ({ state, pending, DATA, DRAFTS, UNRELATED }) => {
      if (!localStorage.getItem(DATA))
        localStorage.setItem(DATA, JSON.stringify(state));
      if (!localStorage.getItem(DRAFTS))
        localStorage.setItem(
          DRAFTS,
          JSON.stringify({ version: 1, records: { "moment:new": pending } }),
        );
      if (!localStorage.getItem(UNRELATED))
        localStorage.setItem(UNRELATED, "behouden");
      const originalSet = Storage.prototype.setItem;
      const originalRemove = Storage.prototype.removeItem;
      const writes: string[] = [];
      (window as Window & { meaningWrites?: string[] }).meaningWrites = writes;
      Storage.prototype.setItem = function (key, value) {
        if ([DATA, DRAFTS, UNRELATED].includes(key)) writes.push(`set:${key}`);
        return originalSet.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        if ([DATA, DRAFTS, UNRELATED].includes(key))
          writes.push(`remove:${key}`);
        return originalRemove.call(this, key);
      };
    },
    { state, pending, DATA, DRAFTS, UNRELATED },
  );
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as Window & { meaningWrites?: string[] }).meaningWrites,
    ),
  ).toEqual([]);
});

async function openSettings(page: Page) {
  await page.goto("./#/settings");
  await expect(
    page.getByRole("heading", { name: "Instellingen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
async function openMeanings(page: Page) {
  await opener(page).click();
  await expect(dialog(page)).toBeVisible();
}

test("alle aangeboden emoties hebben een leesbare betekenis in gesloten categorieën zonder gegevens te wijzigen", async ({
  page,
}) => {
  await openSettings(page);
  const before = await snapshot(page);
  await openMeanings(page);
  await expect(dialog(page).locator("details")).toHaveCount(
    EMOTION_GROUPS.length,
  );
  await expect(dialog(page).locator("details[open]")).toHaveCount(0);
  const lastSummary = dialog(page).locator("details > summary").last();
  await lastSummary.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog(page).getByRole("button", { name: "Venster sluiten", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastSummary).toBeFocused();
  for (const group of EMOTION_GROUPS) {
    const category = dialog(page)
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: group.label }) });
    await expect(category.locator("summary")).toContainText(
      String(group.options.length),
    );
    await category.locator("summary").click();
    for (const label of group.options) {
      const term = category.locator("dt").filter({
        hasText: new RegExp(
          `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        ),
      });
      await expect(term).toHaveCount(1);
      await expect(term).toBeVisible();
      await expect(term.locator("xpath=following-sibling::dd[1]")).toHaveText(
        EMOTION_MEANINGS[label],
      );
    }
  }
  expect((await dialog(page).locator("dt").allTextContents()).sort()).toEqual(
    [...EMOTION_OPTIONS].sort(),
  );
  await dialog(page)
    .getByRole("button", { name: "Venster sluiten", exact: true })
    .click();
  await expect(opener(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});

test("zoeken vindt emotiewoorden, uitleg en woorden zonder accenten; wissen herstelt de categorieën en zoekfocus", async ({
  page,
}) => {
  await openSettings(page);
  const before = await snapshot(page);
  await openMeanings(page);
  await search(page).fill("NERVEUS");
  await expect(
    dialog(page).getByText("Nerveus", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog(page).getByText(EMOTION_MEANINGS.Nerveus, { exact: true }),
  ).toBeVisible();
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const meaningTerm = EMOTION_MEANINGS.Nerveus.match(
    /[\p{L}\p{M}]{5,}/gu,
  )?.find(
    (word) =>
      !EMOTION_OPTIONS.some((label) =>
        normalize(label).includes(normalize(word)),
      ),
  );
  expect(
    meaningTerm,
    "Een uitlegwoord dat in geen emotienaam voorkomt",
  ).toBeTruthy();
  await search(page).fill(meaningTerm!);
  await expect(
    dialog(page).getByText("Nerveus", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog(page).getByText(EMOTION_MEANINGS.Nerveus, { exact: true }),
  ).toBeVisible();
  await search(page).fill("GEIRRITEERD");
  await expect(
    dialog(page).getByText("Geïrriteerd", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog(page).getByText(EMOTION_MEANINGS["Geïrriteerd"], { exact: true }),
  ).toBeVisible();
  await search(page).fill("qzxv-onbestaand");
  await expect(
    dialog(page).getByText("Geen emoties gevonden.", { exact: true }),
  ).toBeVisible();
  await expect(dialog(page).locator("dt")).toHaveCount(0);
  await dialog(page)
    .getByRole("button", { name: "Zoekopdracht wissen", exact: true })
    .click();
  await expect(search(page)).toHaveValue("");
  await expect(search(page)).toBeFocused();
  await expect(dialog(page).locator("details")).toHaveCount(
    EMOTION_GROUPS.length,
  );
  await expect(dialog(page).locator("details[open]")).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
});

for (const close of ["button", "Escape"] as const) {
  test(`sluiten met ${close} bewaart gegevens en concepten en brengt focus terug naar de betekenissenknop`, async ({
    page,
  }) => {
    await openSettings(page);
    const before = await snapshot(page);
    await openMeanings(page);
    await search(page).fill("Nerveus");
    if (close === "Escape") await page.keyboard.press("Escape");
    else
      await dialog(page)
        .getByRole("button", { name: "Venster sluiten", exact: true })
        .click();
    await expect(dialog(page)).not.toBeVisible();
    await expect(opener(page)).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
  });
}

test("betekenissen zijn offline leesbaar en zoekbaar op 320 px met grote tekst zonder lokale gegevens te wijzigen", async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openSettings(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await snapshot(page);
  await context.setOffline(true);
  await page.reload();
  await expect(opener(page)).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  const probeFailed = await page.evaluate(async () => {
    try {
      await fetch(`uncached-meaning-${crypto.randomUUID()}.txt`, {
        cache: "no-store",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(probeFailed).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await openMeanings(page);
  await search(page).fill("Nerveus");
  const definition = dialog(page).getByText(EMOTION_MEANINGS.Nerveus, {
    exact: true,
  });
  await expect(definition).toBeVisible();
  await definition.scrollIntoViewIfNeeded();
  const bounds = await dialog(page).evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewport: innerWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
  for (const description of await dialog(page).locator("dd").all()) {
    expect(
      await description.evaluate((element) => ({
        unclamped: getComputedStyle(element).webkitLineClamp === "none",
        fitsWidth: element.scrollWidth <= element.clientWidth + 1,
        fitsHeight: element.scrollHeight <= element.clientHeight + 1,
      })),
    ).toEqual({ unclamped: true, fitsWidth: true, fitsHeight: true });
  }
  await page.screenshot({
    path: testInfo.outputPath("emotion-meanings-offline-320-large-text.png"),
  });
  await dialog(page)
    .getByRole("button", { name: "Zoekopdracht wissen", exact: true })
    .click();
  await expect(search(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});
