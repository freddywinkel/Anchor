import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createEmptyState,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  type AppState,
  type Moment,
} from "../src/lib/storage";

const date = "2026-10-20";
const cravingId = "linked-history-craving";
const longNote = Array.from(
  { length: 20 },
  (_, index) =>
    `Synthetische regel ${index + 1}: deze volledige zin blijft leesbaar zonder een tekstvak of afkapping.`,
).join("\n");

function moment(index: number): Moment {
  return {
    id: `linked-${index}`,
    cravingId,
    date,
    time: "14:15",
    kind: "checkin",
    before:
      index === 0
        ? {
            mood: 0,
            eis: null,
            emotionRatings: [
              { id: "zero", label: "Nerveus", intensity: 0 },
              { id: "empty", label: "Rustig", intensity: null },
            ],
          }
        : { mood: null, eis: null },
    after:
      index === 0
        ? {
            mood: null,
            eis: null,
            emotionRatings: [
              { id: "after-zero", label: "Nerveus", intensity: 0 },
            ],
          }
        : null,
    afterDate: index === 0 ? "2026-10-21" : null,
    afterTime: index === 0 ? "08:30" : null,
    activity: index === 0 ? "Rust nemen" : "",
    attempted: index === 0 ? false : null,
    emotions: [],
    note:
      index === 0 ? longNote : `Synthetische gekoppelde check-in ${index + 1}.`,
  };
}

function fixture(count = 1000, theme: AppState["theme"] = "light"): AppState {
  const state = createEmptyState();
  state.theme = theme;
  state.cravings = [
    {
      id: cravingId,
      date,
      time: "14:00",
      substances: ["Cocaine", "3-MMC"],
      situation: "Een synthetische craving voor de geschiedeniscontrole.",
      thought: "Een eigen gedachte.",
      bodySensation: "",
      emotion: "Nerveus",
      behavior: "Ik nam even een pauze.",
    },
  ];
  state.moments = Array.from({ length: count }, (_, index) => moment(index));
  const unlinked = { ...moment(count), id: "not-linked" };
  delete unlinked.cravingId;
  state.moments.push(unlinked, {
    ...moment(count + 1),
    id: "different-link",
    cravingId: "missing-other-craving",
  });
  state.plan = {
    warning: "Een synthetisch eigen signaal.",
    action: "Rust nemen.",
    support: "Een vertrouwd persoon.",
  };
  return state;
}

async function seed(page: Page, state = fixture()) {
  await page.addInitScript(
    ({ state, dataKey, draftKey }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(state));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            version: 1,
            records: {
              growth: {
                id: "keep-linked-history-draft",
                date: "2026-10-20",
                text: "Dit synthetische concept blijft exact behouden.",
                favorite: false,
              },
            },
          }),
        );
      if (!localStorage.getItem("unrelated.linked-history"))
        localStorage.setItem("unrelated.linked-history", "synthetic untouched");
    },
    { state, dataKey: STORAGE_KEY, draftKey: DRAFT_STORAGE_KEY },
  );
}

async function open(page: Page) {
  await page.goto("./#/history");
  await expect(
    page.getByRole("heading", { name: "Terugkijken", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}

const snapshot = (page: Page) =>
  page.evaluate(
    ([dataKey, draftKey]) => ({
      data: localStorage.getItem(dataKey),
      drafts: localStorage.getItem(draftKey),
      unrelated: localStorage.getItem("unrelated.linked-history"),
    }),
    [STORAGE_KEY, DRAFT_STORAGE_KEY],
  );
const craving = (page: Page) =>
  page.locator(`[id="anchor-history-record-craving:${cravingId}"]`);
const related = (page: Page) =>
  craving(page).getByRole("region", {
    name: "Gekoppelde check-ins",
    exact: true,
  });
const rows = (page: Page) => related(page).locator("[data-linked-history-id]");
const more = (page: Page) =>
  related(page).getByRole("button", {
    name: "Meer gekoppelde check-ins",
    exact: true,
  });
async function expand(details: Locator) {
  if (!(await details.evaluate((element) => element.hasAttribute("open"))))
    await details.locator("summary").first().click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${date}T18:00:00+02:00`));
  await page.setViewportSize({ width: 390, height: 844 });
});

test("duizend expliciete koppelingen tonen eerst tien volledige check-ins en laden alleen op verzoek verder", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await snapshot(page);
  await expand(craving(page));
  await expect(
    related(page).getByRole("heading", {
      name: "Gekoppelde check-ins (1000)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  await expect(related(page).getByRole("status")).toHaveText(
    "Je ziet 10 van 1000 gekoppelde check-ins.",
  );
  await expect(rows(page).first()).toHaveAttribute(
    "data-linked-history-id",
    "linked-0",
  );
  await expect(rows(page).last()).toHaveAttribute(
    "data-linked-history-id",
    "linked-9",
  );
  expect(await related(page).locator("*").count()).toBeLessThan(400);
  await expect(
    related(page).locator('[data-linked-history-id="not-linked"]'),
  ).toHaveCount(0);
  await expect(
    related(page).locator('[data-linked-history-id="different-link"]'),
  ).toHaveCount(0);
  await more(page).click();
  await expect(rows(page)).toHaveCount(20);
  await expect(rows(page).nth(10)).toBeFocused();
  await expect(related(page).getByRole("status")).toHaveText(
    "Je ziet 20 van 1000 gekoppelde check-ins.",
  );
  expect(
    new Set(
      await rows(page).evaluateAll((elements) =>
        elements.map((element) =>
          element.getAttribute("data-linked-history-id"),
        ),
      ),
    ).size,
  ).toBe(20);
  expect(await snapshot(page)).toEqual(before);
  await craving(page).locator("summary").first().click();
  await expect(related(page)).toHaveCount(0);
  await expand(craving(page));
  await expect(rows(page)).toHaveCount(10);
  expect(await snapshot(page)).toEqual(before);
});

for (const theme of ["light", "dark"] as const) {
  test(`gekoppelde tekst en nul of onbekend blijven volledig leesbaar op 320 px met 200% tekst in ${theme}`, async ({
    page,
  }) => {
    await seed(page, fixture(12, theme));
    await page.setViewportSize({ width: 320, height: 900 });
    await open(page);
    const before = await snapshot(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expand(craving(page));
    const first = rows(page).first();
    await expect(first).toContainText("Neutraal");
    await expect(first).toContainText("Nerveus: 0/100");
    await expect(first).toContainText("Rustig: niet ingevuld");
    await expect(first).toContainText("Stemming niet ingevuld");
    await expect(first).toContainText("Geprobeerd: nee");
    const note = first.getByText(longNote, { exact: true });
    await expect(note).toBeVisible();
    expect(await note.textContent()).toBe(longNote);
    expect(
      await note.evaluate((element) => ({
        noClamp: getComputedStyle(element).webkitLineClamp === "none",
        fullHeight: element.scrollHeight <= element.clientHeight + 1,
        fullWidth: element.scrollWidth <= element.clientWidth + 1,
      })),
    ).toEqual({ noClamp: true, fullHeight: true, fullWidth: true });
    await more(page).click();
    await expect(rows(page)).toHaveCount(12);
    await expect(rows(page).nth(10)).toBeFocused();
    await expect(more(page)).toHaveCount(0);
    await expect(related(page).getByRole("status")).toHaveText(
      "Je ziet 12 van 12 gekoppelde check-ins.",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(await snapshot(page)).toEqual(before);
  });
}

test("een alleen-lezen-tab kan extra gekoppelde check-ins lezen zonder data of concepten te wijzigen", async ({
  page,
  context,
}) => {
  await seed(page, fixture(30));
  await open(page);
  const before = await snapshot(page);
  const reader = await context.newPage();
  await open(reader);
  await expect(reader.getByText(/^Alleen lezen\./)).toBeVisible();
  await expand(craving(reader));
  await expect(more(reader)).toBeEnabled();
  await more(reader).click();
  await expect(rows(reader)).toHaveCount(20);
  await expect(rows(reader).nth(10)).toBeFocused();
  await expect(
    craving(reader).getByRole("button", {
      name: "Gebruikt aangeven",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await snapshot(reader)).toEqual(before);
});

test("dezelfde expliciete cravingcontext staat bij de check-in en de nameting op zijn eigen dag", async ({
  page,
}) => {
  await seed(page, fixture(1));
  await open(page);
  const before = await snapshot(page);
  const checkin = page.locator('[id="anchor-history-record-moment:linked-0"]');
  await expand(checkin);
  await expect(
    checkin.getByText("Gekoppelde craving", { exact: true }),
  ).toBeVisible();
  await expect(checkin).toContainText(
    "20 oktober 2026 · 14:00 · Cocaine, 3-MMC",
  );
  await page.locator('[data-calendar-date="2026-10-21"]').click();
  const after = page.locator('[data-timeline-kind="after"]');
  await expand(after.locator("details").first());
  await expect(
    after.getByText("Gekoppelde craving", { exact: true }),
  ).toBeVisible();
  await expect(after).toContainText("20 oktober 2026 · 14:00 · Cocaine, 3-MMC");
  expect(await snapshot(page)).toEqual(before);
});

test("een ontbrekende craving blijft als ontbrekende verwijzing leesbaar bij check-in en nameting", async ({
  page,
}) => {
  const state = fixture(1);
  state.moments[0].cravingId = "missing-craving";
  await seed(page, state);
  await open(page);
  const before = await snapshot(page);
  const checkin = page.locator('[id="anchor-history-record-moment:linked-0"]');
  const text =
    "De gekoppelde craving is niet meer beschikbaar. Deze check-in blijft bewaard.";
  await expand(checkin);
  await expect(checkin.getByText(text, { exact: true })).toBeVisible();
  await page.locator('[data-calendar-date="2026-10-21"]').click();
  const after = page.locator('[data-timeline-kind="after"]');
  await expand(after.locator("details").first());
  await expect(after.getByText(text, { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test("offline blijft de gekoppelde lijst begrensd en doorleesbaar zonder opgeslagen bytes te wijzigen", async ({
  page,
  context,
}) => {
  await seed(page, fixture(1000));
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await snapshot(page);
  await context.setOffline(true);
  await page.reload();
  await expand(craving(page));
  await expect(rows(page)).toHaveCount(10);
  await more(page).click();
  await expect(rows(page)).toHaveCount(20);
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`uncached-linked-history-${crypto.randomUUID()}.txt`, {
          cache: "no-store",
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(await snapshot(page)).toEqual(before);
});
