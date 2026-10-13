import { expect, test, type Locator, type Page } from "@playwright/test";

async function open(page: Page, route = "/today") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("fieldset.anchor-content")).not.toHaveAttribute(
    "disabled",
    "",
  );
  await page.evaluate(() => document.fonts.ready);
}

async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function scrollPosition(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement!;
    return {
      y: window.scrollY,
      max: root.scrollHeight - root.clientHeight,
      width: root.scrollWidth,
      viewportWidth: root.clientWidth,
    };
  });
}

async function expectAnchoredNavigation(page: Page) {
  await expect
    .poll(async () =>
      page.locator(".dp-bottom-nav").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.bottom - window.innerHeight);
      }),
    )
    .toBeLessThanOrEqual(1);
  const nav = await page.locator(".dp-bottom-nav").boundingBox();
  expect(nav!.x).toBeCloseTo(0, 0);
  expect(nav!.width).toBeCloseTo(page.viewportSize()!.width, 0);
}

async function expectAboveNavigation(page: Page, target: Locator) {
  await settled(page);
  const rect = await target.boundingBox();
  const nav = await page.locator(".dp-bottom-nav").boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(nav!.y + 1);
}

test.describe("mobiel scrollen", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("boven- en ondergrens houden de navigatie op het scherm en de laatste inhoud bereikbaar", async ({
    page,
  }) => {
    await open(page);
    await expectAnchoredNavigation(page);
    await page.mouse.move(180, 350);
    await page.mouse.wheel(0, -20_000);
    await expect.poll(async () => (await scrollPosition(page)).y).toBe(0);
    const header = await page.locator(".dp-topbar").boundingBox();
    expect(header!.y).toBeCloseTo(0, 0);

    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(async () => {
        const position = await scrollPosition(page);
        return Math.abs(position.y - position.max);
      })
      .toBeLessThanOrEqual(1);
    const bottom = await scrollPosition(page);
    expect(bottom.y).toBeGreaterThan(300);
    expect(bottom.width).toBeLessThanOrEqual(bottom.viewportWidth);
    await expectAnchoredNavigation(page);
    await expectAboveNavigation(
      page,
      page.getByRole("button", { name: "Over je gegevens", exact: true }),
    );
    await page.mouse.wheel(0, 20_000);
    await settled(page);
    expect((await scrollPosition(page)).y).toBeCloseTo(bottom.y, 0);
    await expectAnchoredNavigation(page);

    await page.mouse.wheel(0, -20_000);
    await expect.poll(async () => (await scrollPosition(page)).y).toBe(0);
    await expectAnchoredNavigation(page);
    await expect(
      page.getByRole("heading", { name: "Vandaag, op jouw tempo." }),
    ).toBeInViewport();
  });

  test("ook op een korte pagina blijft de navigatie onderaan na een wijziging van de schermhoogte", async ({
    page,
  }) => {
    await open(page, "/onbekende-pagina");
    await expect(
      page.getByRole("heading", { name: "Deze pagina is niet gevonden" }),
    ).toBeVisible();
    for (const height of [844, 1100, 620, 844]) {
      await page.setViewportSize({ width: 390, height });
      await settled(page);
      await expectAnchoredNavigation(page);
      const position = await scrollPosition(page);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(position.max + 1);
      expect(position.width).toBeLessThanOrEqual(position.viewportWidth);
    }
  });

  test("navigeren vanaf de onderkant begint bovenaan zonder lege strook", async ({
    page,
  }) => {
    await open(page);
    await page.mouse.move(180, 350);
    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(async () => (await scrollPosition(page)).y)
      .toBeGreaterThan(300);
    const nav = page.getByRole("navigation", { name: "Hoofdnavigatie mobiel" });
    for (const name of [
      "Terugkijken",
      "Hulpmiddelen",
      "Mijn plan",
      "Vandaag",
    ]) {
      await nav.getByRole("link", { name, exact: true }).click();
      await expect.poll(async () => (await scrollPosition(page)).y).toBe(0);
      const header = await page.locator(".dp-topbar").boundingBox();
      expect(header!.y).toBeCloseTo(0, 0);
      await expect(page.locator("main h1")).toBeInViewport();
      await expectAnchoredNavigation(page);
    }
  });

  test("velden en opslagknop blijven bereikbaar bij een verkleind scherm en grotere tekst", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await open(page, "/craving/new");
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    const behavior = page.getByLabel(/^Gedrag \(wat deed je\?\)/);
    await behavior.fill("Ik ging even buiten zitten.");
    await page.setViewportSize({ width: 320, height: 620 });
    await behavior.focus();
    await settled(page);
    const field = await behavior.boundingBox();
    // A tall textarea may exceed the remaining viewport; its first line must be visible.
    const nav = await page.locator(".dp-bottom-nav").boundingBox();
    expect(field!.y).toBeGreaterThanOrEqual(0);
    expect(field!.y + 50).toBeLessThan(nav!.y);
    await expectAnchoredNavigation(page);
    await page.setViewportSize({ width: 320, height: 844 });
    const save = page.getByRole("button", {
      name: "Craving opslaan",
      exact: true,
    });
    await save.focus();
    await expectAboveNavigation(page, save);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/today$/);
    await expect.poll(async () => (await scrollPosition(page)).y).toBe(0);
    await expectAnchoredNavigation(page);
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem("anchor.app.data.v1")!).cravings,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].behavior).toBe("Ik ging even buiten zitten.");
  });

  test("een lang informatievenster scrolt zelfstandig en sluit zonder de pagina te verplaatsen", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    await settled(page);
    const opener = page.getByRole("button", {
      name: "Over je gegevens",
      exact: true,
    });
    await opener.focus();
    await settled(page);
    const before = await scrollPosition(page);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Over je gegevens",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect((await scrollPosition(page)).y).toBe(before.y);
    await dialog.evaluate((element) => (element.scrollTop = 0));
    const bounds = await dialog.boundingBox();
    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(() =>
        dialog.evaluate((element) =>
          Math.abs(
            element.scrollHeight - element.clientHeight - element.scrollTop,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);
    expect(
      await dialog.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await page.mouse.wheel(0, 20_000);
    await settled(page);
    expect((await scrollPosition(page)).y).toBe(before.y);
    // Backdrop gestures must not scroll the page underneath the modal.
    await page.mouse.move(bounds!.x / 2, bounds!.y + bounds!.height / 2);
    for (const delta of [-20_000, -20_000, 20_000, 20_000]) {
      await page.mouse.wheel(0, delta);
      await settled(page);
      expect((await scrollPosition(page)).y).toBe(before.y);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect((await scrollPosition(page)).y).toBe(before.y);
    await expectAnchoredNavigation(page);
    await expectAboveNavigation(page, opener);
  });
});

test("op desktop blijft de pagina normaal scrollbaar met alle inhoud bereikbaar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await open(page, "/craving/new");
  await expect(page.locator(".dp-bottom-nav")).not.toBeVisible();
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 20_000);
  await expect
    .poll(async () => (await scrollPosition(page)).y)
    .toBeGreaterThan(300);
  await expect(
    page.getByRole("button", { name: "Over je gegevens", exact: true }),
  ).toBeInViewport();
  await page.mouse.wheel(0, -20_000);
  await expect.poll(async () => (await scrollPosition(page)).y).toBe(0);
  await expect(page.locator("main h1")).toBeInViewport();
});
