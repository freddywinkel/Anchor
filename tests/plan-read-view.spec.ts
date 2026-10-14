import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyState,
  STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  type AppState,
} from "../src/lib/storage";

const longPlan: AppState["plan"] = {
  warning: Array.from(
    { length: 12 },
    (_, index) =>
      `Synthetisch signaal ${index + 1}: ik merk spanning en heb ruimte nodig om rustig te kiezen.`,
  ).join("\n"),
  action:
    "Ik neem een pauze en laat de situatie even achter me.\nDaarna kies ik een haalbare kleine stap.\nRust nemen en een grens aangeven mag ook.",
  support:
    "Synthetisch steuncontact: iemand die ik vertrouw.\nIk kan expliciet om gezelschap of een gesprek vragen.\nDeze laatste regel moet volledig leesbaar blijven.",
};
const pendingPlan: AppState["plan"] = {
  warning: "Synthetisch concept: ik merk iets anders.",
  action: "Nog niet opgeslagen: even rustig gaan zitten.",
  support: "Een eigen steunplek uit het concept.",
};
const unrelatedDraft = {
  id: "keep-plan-test-growth",
  date: "2026-10-14",
  text: "Dit andere concept blijft bewaard.",
  favorite: false,
};

function fixture(): AppState {
  const state = createEmptyState();
  state.plan = { ...longPlan };
  state.goals = [
    {
      id: "keep-plan-test-goal",
      target: "Alcohol",
      name: "Alcohol",
      direction: "Stoppen",
      note: "Dit synthetische doel blijft ongewijzigd.",
    },
  ];
  state.growth = [
    {
      id: "keep-plan-test-memory",
      date: "2026-10-14",
      text: "Rust genomen.",
      favorite: false,
    },
  ];
  return state;
}

async function seed(page: Page, planDraft?: AppState["plan"]) {
  await page.addInitScript(
    ({ state, records, dataKey, draftKey }) => {
      if (!localStorage.getItem(dataKey))
        localStorage.setItem(dataKey, JSON.stringify(state));
      if (!localStorage.getItem(draftKey))
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, records }));
      if (!localStorage.getItem("unrelated.plan-test"))
        localStorage.setItem("unrelated.plan-test", "synthetic untouched");
    },
    {
      state: fixture(),
      records: {
        growth: unrelatedDraft,
        ...(planDraft ? { plan: planDraft } : {}),
      },
      dataKey: STORAGE_KEY,
      draftKey: DRAFT_STORAGE_KEY,
    },
  );
}

async function open(page: Page) {
  await page.goto("./#/plan");
  await expect(
    page.getByRole("heading", { name: "Mijn plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Je gegevens worden geopend…", { exact: true }),
  ).toHaveCount(0);
}

const card = (page: Page) => page.locator(".dp-personal-plan");
const edit = (page: Page) =>
  card(page).getByRole("button", { name: "Mijn plan bewerken", exact: true });
const save = (page: Page) =>
  card(page).getByRole("button", { name: "Mijn plan opslaan", exact: true });
const field = (page: Page, name: string) =>
  card(page).getByRole("textbox", { name, exact: true });
const snapshot = (page: Page) =>
  page.evaluate(
    ([data, drafts]) => ({
      data: localStorage.getItem(data),
      drafts: localStorage.getItem(drafts),
      unrelated: localStorage.getItem("unrelated.plan-test"),
    }),
    [STORAGE_KEY, DRAFT_STORAGE_KEY],
  );
const stored = (page: Page): Promise<AppState> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const drafts = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    DRAFT_STORAGE_KEY,
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("opgeslagen houvast toont alle regels als tekst, zonder velden of opslaanknop, ook op 320 px met grote tekst", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await open(page);
  const before = await snapshot(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
  await expect(edit(page)).toBeEnabled();
  for (const text of Object.values(longPlan)) {
    const rendered = card(page).getByText(text, { exact: true });
    await expect(rendered).toBeVisible();
    expect(await rendered.textContent()).toBe(text);
    expect(
      await rendered.evaluate((element) => ({
        preservesLines: ["pre-wrap", "pre-line", "break-spaces"].includes(
          getComputedStyle(element).whiteSpace,
        ),
        unclamped: getComputedStyle(element).webkitLineClamp === "none",
        fitsWidth: element.scrollWidth <= element.clientWidth + 1,
        fitsHeight: element.scrollHeight <= element.clientHeight + 1,
      })),
    ).toEqual({
      preservesLines: true,
      unclamped: true,
      fitsWidth: true,
      fitsHeight: true,
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  await expect(
    card(page).getByText(longPlan.warning, { exact: true }),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test("expliciet bewerken en ongewijzigd sluiten maakt geen concept en herstelt toetsenbordfocus", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await snapshot(page);
  await edit(page).click();
  await expect(field(page, "Dit merk ik bij mezelf")).toHaveValue(
    longPlan.warning,
  );
  await expect(field(page, "Dit merk ik bij mezelf")).toBeFocused();
  await expect(save(page)).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
  await card(page)
    .getByRole("button", { name: "Bewerken sluiten", exact: true })
    .click();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
  await expect(edit(page)).toBeFocused();
  expect(await snapshot(page)).toEqual(before);
});

test("wijzigingen opslaan sluit het formulier en bewaart overige gegevens en concepten", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await stored(page);
  await edit(page).click();
  await field(page, "Dit kan ik doen").fill(
    "Een synthetische nieuwe stap.\nIk laat iemand weten wat ik nodig heb.",
  );
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  await expect(save(page)).toHaveCount(0);
  await expect(edit(page)).toBeFocused();
  const after = await stored(page);
  expect(after).toEqual({
    ...before,
    revision: before.revision + 1,
    plan: {
      ...longPlan,
      action:
        "Een synthetische nieuwe stap.\nIk laat iemand weten wat ik nodig heb.",
    },
  });
  expect(await drafts(page)).toEqual({ growth: unrelatedDraft });
  expect((await snapshot(page)).unrelated).toBe("synthetic untouched");
  await page.reload();
  await expect(
    card(page).getByText(after.plan.action, { exact: true }),
  ).toBeVisible();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  expect(await stored(page)).toEqual(after);
});

test("een bestaand planconcept wordt hervat en pas na bevestiging gewist waarna het opgeslagen plan volledig terugkomt", async ({
  page,
}) => {
  await seed(page, pendingPlan);
  await open(page);
  const before = await snapshot(page);
  await expect(field(page, "Dit merk ik bij mezelf")).toHaveValue(
    pendingPlan.warning,
  );
  await expect(field(page, "Dit kan ik doen")).toHaveValue(pendingPlan.action);
  await expect(field(page, "Hier vind ik steun")).toHaveValue(
    pendingPlan.support,
  );
  await expect(edit(page)).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  await card(page)
    .getByRole("button", { name: "Concept wissen", exact: true })
    .click();
  expect(await snapshot(page)).toEqual(before);
  await card(page)
    .getByRole("button", { name: "Verder schrijven", exact: true })
    .click();
  expect(await snapshot(page)).toEqual(before);
  await card(page)
    .getByRole("button", { name: "Concept wissen", exact: true })
    .click();
  await card(page)
    .getByRole("button", { name: "Ja, concept wissen", exact: true })
    .click();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  await expect(edit(page)).toBeFocused();
  for (const text of Object.values(longPlan))
    await expect(card(page).getByText(text, { exact: true })).toBeVisible();
  expect((await snapshot(page)).data).toBe(before.data);
  expect(await drafts(page)).toEqual({ growth: unrelatedDraft });
  expect((await snapshot(page)).unrelated).toBe(before.unrelated);
});

test("een tweede alleen-lezen-tabblad kan het opgeslagen plan volledig lezen maar niet bewerken", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  await expect(edit(page)).toBeEnabled();
  const before = await snapshot(page);
  const reader = await context.newPage();
  await open(reader);
  await expect(reader.getByText(/^Alleen lezen\./)).toBeVisible();
  await expect(edit(reader)).toBeDisabled();
  await expect(card(reader).getByRole("textbox")).toHaveCount(0);
  await expect(save(reader)).toHaveCount(0);
  for (const text of Object.values(longPlan))
    await expect(card(reader).getByText(text, { exact: true })).toBeVisible();
  expect(await snapshot(reader)).toEqual(before);
});

test("plan lezen, expliciet bewerken en opslaan werkt offline en blijft na herladen bewaard", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    card(page).getByText(longPlan.support, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      try {
        await fetch(`uncached-plan-read-${crypto.randomUUID()}.txt`, {
          cache: "no-store",
        });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await edit(page).click();
  await field(page, "Hier vind ik steun").fill(
    "Synthetische steun offline.\nEen tweede volledig leesbare regel.",
  );
  await save(page).click();
  await expect(card(page).getByRole("textbox")).toHaveCount(0);
  const after = await snapshot(page);
  await page.reload();
  await expect(
    card(page).getByText(
      "Synthetische steun offline.\nEen tweede volledig leesbare regel.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(save(page)).toHaveCount(0);
  expect(await snapshot(page)).toEqual(after);
});
