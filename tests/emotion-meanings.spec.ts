import { expect, test, type Page } from "@playwright/test";
import { createEmptyState, type Moment } from "../src/lib/storage";
import { EMOTION_GROUPS, EMOTION_OPTIONS } from "../src/lib/emotions";
import { EMOTION_MEANINGS } from "../src/lib/emotionMeanings";

const DATA = "anchor.app.data.v1";
const DRAFTS = "anchor.app.drafts.v1";
const UNRELATED = "synthetic.emotion-meaning.keep";
const errors = new WeakMap<Page, string[]>();
const opener = (page: Page) =>
  page.getByRole("button", { name: "Meer opties", exact: true });
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
  await page.setViewportSize({ width: 390, height: 844 });
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

async function openApp(page: Page, route = "today") {
  await page.goto(`./#/${route}`);
  await expect(opener(page)).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}
async function openMeanings(page: Page) {
  await opener(page).click();
  await page
    .getByRole("dialog", { name: "Meer in Anchor", exact: true })
    .getByRole("button", { name: "Emoties en betekenissen", exact: true })
    .click();
  await expect(dialog(page)).toBeVisible();
}

async function outsidePoint(page: Page, target = dialog(page)) {
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (bounds!.x > 2) return { x: bounds!.x / 2, y: viewport!.height / 2 };
  expect(bounds!.y).toBeGreaterThan(2);
  return { x: viewport!.width / 2, y: bounds!.y / 2 };
}

test("de betekenissen staan onder Meer op telefoon en desktop en niet meer als onderdeel van Instellingen", async ({
  page,
}) => {
  await openApp(page, "settings");
  await expect(
    page.getByRole("heading", { name: "Instellingen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Emoties en betekenissen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Bekijk de betekenissen", exact: true }),
  ).toHaveCount(0);
  const before = await snapshot(page);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(opener(page)).toBeVisible();
    await openMeanings(page);
    await page.keyboard.press("Escape");
    await expect(opener(page)).toBeFocused();
    await expect(page).toHaveURL(/#\/settings$/);
  }
  expect(await snapshot(page)).toEqual(before);
});

test("alle aangeboden emoties hebben een leesbare betekenis in gesloten categorieën zonder gegevens te wijzigen", async ({
  page,
}) => {
  await openApp(page);
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
  await openApp(page);
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
  test(`sluiten met ${close} bewaart gegevens en concepten en brengt focus terug naar Meer`, async ({
    page,
  }) => {
    await openApp(page);
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

for (const pointer of ["mouse", "touch"] as const) {
  test.describe(`achtergrond sluiten met ${pointer}`, () => {
    test.use({ hasTouch: pointer === "touch" });
    test("ook onderaan de lange lijst sluit een achtergrondtik zonder invoer te wijzigen", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await openApp(page);
      const before = await snapshot(page);
      await openMeanings(page);
      await search(page).fill("je");
      await dialog(page).locator("dd").last().scrollIntoViewIfNeeded();
      expect(
        await dialog(page).evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(500);
      const point = await outsidePoint(page);
      if (pointer === "touch") await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(dialog(page)).toHaveCount(0);
      await expect(opener(page)).toBeFocused();
      expect(await snapshot(page)).toEqual(before);
    });
  });
}

test("binnenruimte en sleepbewegingen over de vensterrand sluiten de betekenissen niet", async ({
  page,
}) => {
  await openApp(page);
  const before = await snapshot(page);
  await openMeanings(page);
  const bounds = (await dialog(page).boundingBox())!;
  await page.mouse.click(bounds.x + 3, bounds.y + 3);
  await expect(dialog(page)).toBeVisible();
  const heading = (await dialog(page)
    .getByRole("heading", { name: "Emoties en betekenissen", exact: true })
    .boundingBox())!;
  const inside = {
    x: heading.x + heading.width / 2,
    y: heading.y + heading.height / 2,
  };
  const outside = await outsidePoint(page);
  for (const [start, end] of [
    [inside, outside],
    [outside, inside],
  ]) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 3 });
    await page.mouse.up();
    await expect(dialog(page)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(opener(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});

test("achtergrondklikken veranderen het bestaande sluitgedrag van andere vensters niet", async ({
  page,
}) => {
  await openApp(page);
  const before = await snapshot(page);
  await opener(page).click();
  const menu = page.getByRole("dialog", {
    name: "Meer in Anchor",
    exact: true,
  });
  await expect(menu).toBeVisible();
  const point = await outsidePoint(page, menu);
  await page.mouse.click(point.x, point.y);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});

test("betekenissen zijn offline leesbaar en zoekbaar op 320 px met grote tekst zonder lokale gegevens te wijzigen", async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await snapshot(page);
  await context.setOffline(true);
  await page.reload();
  await expect(opener(page)).toBeVisible();
  // navigator.onLine is an OS/browser hint and can stay true after a cached
  // navigation. Verify the actual connection with an uncached request below.
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
  await testInfo.attach("offline-connection", {
    body: JSON.stringify({
      browserHint: await page.evaluate(() => navigator.onLine),
      uncachedRequestFailed: probeFailed,
    }),
    contentType: "application/json",
  });
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
