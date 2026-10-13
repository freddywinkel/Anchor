import { expect, test, type Page } from "@playwright/test";
import { createEmptyState } from "../src/lib/storage";

const dataKey = "anchor.app.data.v1";
const draftKey = "anchor.app.drafts.v1";
const snapshot = (page: Page) =>
  page.evaluate(
    ([data, draft]) => ({
      data: localStorage.getItem(data),
      drafts: localStorage.getItem(draft),
    }),
    [dataKey, draftKey],
  );

test("Houvast keert ook terug naar een concept zonder opgeslagen craving", async ({
  page,
}) => {
  const id = "synthetic-draft-only";
  const records = {
    [`craving:${id}`]: {
      id,
      date: "2026-10-13",
      time: "11:00",
      situation: "",
      thought: "Bewaar dit concept",
      bodySensation: "",
      emotion: "",
      behavior: "",
    },
  };
  await page.addInitScript(
    ({ key, records }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, records })),
    { key: draftKey, records },
  );
  await page.goto(`./#/craving/${id}`);
  const before = await snapshot(page);
  await page.getByRole("button", { name: "Houvast", exact: true }).click();
  await page.getByRole("button", { name: "Terug naar mijn craving" }).click();
  await expect(page).toHaveURL(new RegExp(`#/craving/${id}$`));
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    "Bewaar dit concept",
  );
  expect(await snapshot(page)).toEqual(before);
});

test("Houvast zonder registratie, inclusief verder na gebruik, maakt niets aan", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("./#/today");
  const before = await snapshot(page);
  await page.getByRole("button", { name: "Houvast", exact: true }).click();
  await expect(page.getByText(/Je kunt even rust nemen/)).toBeVisible();
  await expect(
    page.getByText(/Denk aan iemand die je vertrouwt/),
  ).toBeVisible();
  await page.getByText("Verder na gebruik", { exact: true }).click();
  await expect(
    page.getByText(/Je eerdere registraties blijven bewaard/),
  ).toBeVisible();
  await expect(page.getByText(/Niemand kijkt automatisch mee/)).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "5-4-3-2-1 openen" }).click();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Stap overslaan" }).click();
  await page.getByRole("button", { name: "Terug naar mijn houvast" }).click();
  await expect(page).toHaveURL(/#\/help$/);
  expect(await snapshot(page)).toEqual(before);
});

test("onvolledig cravingconcept blijft intact via Houvast en oefening, ook offline", async ({
  page,
  context,
}) => {
  await page.goto("./#/craving/new");
  await expect(page.getByLabel("Gedachte", { exact: true })).toBeEnabled();
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Synthetisch: even pauze nemen");
  await page.getByLabel("Tijd", { exact: true }).fill("");
  const before = await snapshot(page);
  await page
    .getByRole("button", { name: "Open mijn houvast", exact: true })
    .click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("button", { name: "5-4-3-2-1 openen" }).click();
  await page.getByRole("button", { name: "Stoppen en terug" }).click();
  await page.getByRole("button", { name: "Terug naar mijn craving" }).click();
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    "Synthetisch: even pauze nemen",
  );
  await expect(page.getByLabel("Tijd", { exact: true })).toHaveValue("");
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await expect(page.getByLabel("Gedachte", { exact: true })).toHaveValue(
    "Synthetisch: even pauze nemen",
  );
  expect(await snapshot(page)).toEqual(before);
});

test("na opslaan is ondersteuning overslaanbaar en verandert zij de registratie niet", async ({
  page,
}) => {
  await page.goto("./#/craving/new");
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Synthetische notitie");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = await snapshot(page);
  await expect(
    page.getByRole("heading", { name: "Wat helpt je nu?" }),
  ).toBeVisible();
  await expect(page.locator(".anchor-craving form")).toHaveCount(0);
  await page.getByRole("button", { name: "Klaar voor nu" }).click();
  await expect(
    page.getByRole("heading", { name: "Wat helpt je nu?" }),
  ).toHaveCount(0);
  await expect(page.locator("main h1")).toBeFocused();
  expect(await snapshot(page)).toEqual(saved);
  expect(JSON.parse(saved.data!).cravings).toHaveLength(1);
});

test("eigen actie en steun volledig zichtbaar op klein scherm met grote tekst", async ({
  page,
}) => {
  const state = createEmptyState();
  state.plan.action =
    "Rust nemen en een grens aangeven.\nDaarna opnieuw kiezen wat haalbaar is.";
  state.plan.support = "Synthetisch steuncontact: iemand die ik vertrouw.";
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: dataKey, value: state },
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("./#/help");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByText(state.plan.action)).toBeVisible();
  await expect(page.getByText(state.plan.support)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const action = page.getByRole("button", { name: "5-4-3-2-1 openen" });
  await action.focus();
  await expect
    .poll(() =>
      action.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const nav = document
          .querySelector(".dp-bottom-nav")!
          .getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= nav.top + 1;
      }),
    )
    .toBe(true);
});
