import { expect, test } from "@playwright/test";

test("een cravingconcept blijft herkenbaar van gisteren en een middel alleen krijgt duidelijke beschrijvingshulp", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-13T23:50:00+02:00"));
  await page.goto("./#/craving/new");
  await page
    .getByRole("combobox", { name: "Middel of gedrag", exact: true })
    .selectOption("Cocaine");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page.locator(".anchor-craving-form .dp-error")).toContainText(
    "Eén van deze tekstvelden is genoeg",
  );
  await page
    .getByRole("textbox", { name: "Wie, wat en waar", exact: true })
    .fill("Mijn oorspronkelijke situatie");
  await page
    .getByRole("link", { name: "Terug naar Vandaag", exact: true })
    .click();
  await page.clock.setFixedTime(new Date("2026-10-14T12:00:00+02:00"));
  await page
    .getByRole("button", { name: "Craving vastleggen", exact: true })
    .click();
  await expect(page.locator(".anchor-craving .dp-notice")).toContainText(
    "Je werkt verder aan een bewaard concept",
  );
  await expect(page.locator(".anchor-craving .dp-notice")).toContainText(
    "13 oktober 2026 om 23:50",
  );
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue(
    "2026-10-13",
  );
  await expect(
    page.getByRole("textbox", { name: "Wie, wat en waar", exact: true }),
  ).toHaveValue("Mijn oorspronkelijke situatie");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("anchor.app.data.v1")!),
  );
  expect(saved.cravings[0]).toMatchObject({
    date: "2026-10-13",
    time: "23:50",
    situation: "Mijn oorspronkelijke situatie",
    substance: "Cocaine",
  });
});
