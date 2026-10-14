import { expect, type Page } from "@playwright/test";

type HistoryFilters = {
  period?: "all" | "week";
  kind?: "all" | "checkin" | "craving" | "day";
  query?: string;
};

export async function openHistoryFilters(page: Page) {
  await page
    .getByRole("button", { name: "Zoeken en filteren", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Zoeken in registraties",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function applyHistoryFilters(page: Page, filters: HistoryFilters) {
  const dialog = await openHistoryFilters(page);
  if (filters.period !== undefined)
    await dialog
      .getByRole("combobox", { name: "Periode", exact: true })
      .selectOption(filters.period);
  if (filters.kind !== undefined)
    await dialog
      .getByRole("combobox", { name: "Soort registratie", exact: true })
      .selectOption(filters.kind);
  if (filters.query !== undefined)
    await dialog
      .getByRole("searchbox", { name: "Zoeken", exact: true })
      .fill(filters.query);
  await dialog
    .getByRole("button", { name: "Resultaten tonen", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}

export async function expectHistoryFilters(
  page: Page,
  filters: HistoryFilters,
) {
  const dialog = await openHistoryFilters(page);
  if (filters.period !== undefined)
    await expect(
      dialog.getByRole("combobox", { name: "Periode", exact: true }),
    ).toHaveValue(filters.period);
  if (filters.kind !== undefined)
    await expect(
      dialog.getByRole("combobox", { name: "Soort registratie", exact: true }),
    ).toHaveValue(filters.kind);
  if (filters.query !== undefined)
    await expect(
      dialog.getByRole("searchbox", { name: "Zoeken", exact: true }),
    ).toHaveValue(filters.query);
  await dialog.getByRole("button", { name: "Annuleren", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
