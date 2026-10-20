import { expect, type Page } from "@playwright/test";

type HistoryFilters = {
  period?: "all" | "week" | "day";
  kind?: "all" | "checkin" | "craving" | "day" | "growth";
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

// These views are optional: only tests that examine them should open them.
export async function openHistoryChart(page: Page) {
  const summary = page.locator("summary").filter({
    hasText: /^Stemmingsverloop bekijken$/,
  });
  await expect(summary).toBeVisible();
  if (
    !(await summary.evaluate(
      (node) => (node.parentElement as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
  const chart = page.getByRole("region", {
    name: "Stemming per moment",
    exact: true,
  });
  await expect(chart).toBeVisible();
  return chart;
}

export async function openHistoryWeek(page: Page) {
  const summary = page.locator("summary").filter({
    hasText: /^Weekoverzicht bekijken$/,
  });
  await expect(summary).toBeVisible();
  if (
    !(await summary.evaluate(
      (node) => (node.parentElement as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
  const week = page.getByRole("region", {
    name: "Rustig terugkijken op je week",
    exact: true,
  });
  await expect(week).toBeVisible();
  return week;
}
