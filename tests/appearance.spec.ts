import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const DATA_KEY = "anchor.app.data.v1";
const DRAFT_KEY = "anchor.app.drafts.v1";
const palettes = [
  ["amber", "Amber"],
  ["sage", "Salie"],
  ["ocean", "Oceaan"],
  ["rose", "Roos"],
  ["lavender", "Lavendel"],
] as const;
const modes = [
  ["dark", "Donker"],
  ["light", "Licht"],
] as const;

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
});

async function open(page: Page, route = "/settings") {
  await page.goto(`./#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
}

async function stored(page: Page) {
  return page.evaluate(
    ({ data, drafts }) => ({
      data: JSON.parse(localStorage.getItem(data) || "null"),
      drafts: JSON.parse(localStorage.getItem(drafts) || "null"),
    }),
    { data: DATA_KEY, drafts: DRAFT_KEY },
  );
}

function paletteControl(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Kleurpalet", exact: true })
    .getByRole("radio", { name, exact: true });
}

test("alle vijf paletten blijven bewaard; weergavemodus, registraties en concepten blijven onafhankelijk", async ({
  page,
}) => {
  await open(page, "/craving/new");
  await page
    .getByLabel(/^Wie, wat en waar/)
    .fill("Bij mij thuis, na een drukke middag.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const savedCravings = (await stored(page)).data.cravings;
  await open(page, "/craving/new");
  await page
    .getByLabel(/^Gedachte/)
    .fill("Dit concept moet behouden blijven bij een andere kleur.");
  const savedDrafts = (await stored(page)).drafts;
  await open(page);
  await expect(
    page
      .getByRole("group", { name: "Kleurpalet", exact: true })
      .getByRole("radio"),
  ).toHaveCount(5);

  for (const [value, label] of palettes) {
    await paletteControl(page, label).check();
    await expect(paletteControl(page, label)).toBeChecked();
    expect((await stored(page)).data.palette).toBe(value);
    await page.reload();
    await expect(paletteControl(page, label)).toBeChecked();
    for (const [mode, modeLabel] of modes) {
      await page.getByRole("radio", { name: modeLabel, exact: true }).check();
      const current = await stored(page);
      expect(current.data.palette).toBe(value);
      expect(current.data.theme).toBe(mode);
      expect(current.data.cravings).toEqual(savedCravings);
      expect(current.drafts).toEqual(savedDrafts);
    }
  }
  await open(page, "/craving/new");
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(
    "Dit concept moet behouden blijven bij een andere kleur.",
  );
});

test("een Anchor-back-up herstelt het gekozen palet en de weergavemodus", async ({
  page,
}) => {
  await open(page);
  await paletteControl(page, "Roos").check();
  await page.getByRole("radio", { name: "Licht", exact: true }).check();
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up downloaden", exact: true })
    .click();
  const backup = await backupDownload;
  const buffer = await readFile((await backup.path())!);
  expect(JSON.parse(buffer.toString()).state).toMatchObject({
    palette: "rose",
    theme: "light",
  });
  await paletteControl(page, "Oceaan").check();
  await page.getByRole("radio", { name: "Donker", exact: true }).check();
  await page
    .getByRole("button", { name: "Back-up herstellen", exact: true })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "Anchor-paletten.json",
    mimeType: "application/json",
    buffer,
  });
  const safetyDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Huidige opslag downloaden", exact: true })
    .click();
  await safetyDownload;
  await page
    .getByRole("button", { name: "Gegevens vervangen", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await stored(page)).data).toMatchObject({
    palette: "rose",
    theme: "light",
  });
  await open(page);
  await expect(paletteControl(page, "Roos")).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Licht", exact: true }),
  ).toBeChecked();
});

test("een alleen-lezen-tabblad kan geen palet of weergavemodus overschrijven", async ({
  page,
  context,
}) => {
  await open(page);
  await paletteControl(page, "Salie").check();
  const original = (await stored(page)).data;
  const reader = await context.newPage();
  await open(reader);
  await expect(
    reader.getByText(/Alleen lezen\. Sluit andere Anchor-tabbladen/),
  ).toBeVisible();
  for (const [, label] of palettes)
    await expect(paletteControl(reader, label)).toBeDisabled();
  for (const [, label] of modes)
    await expect(
      reader.getByRole("radio", { name: label, exact: true }),
    ).toBeDisabled();
  await expect(paletteControl(reader, "Salie")).toBeChecked();
  expect((await stored(reader)).data).toEqual(original);
  await reader.close();
});

function rgb(value: string) {
  const components = value.match(/[\d.]+/g)?.map(Number);
  if (!components || components.length < 3)
    throw new Error(`Unexpected resolved colour: ${value}`);
  return components.slice(0, 3);
}

function contrast(first: string, second: string) {
  const luminance = (value: string) =>
    rgb(value)
      .map((channel) => {
        const s = channel / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("de tien kleurcombinaties behouden tekstcontrast, zichtbare velden en focus op smalle schermen", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const measurements: unknown[] = [];
  for (const [palette, label] of palettes) {
    for (const [mode, modeLabel] of modes) {
      const contextLabel = `${label}/${modeLabel}`;
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await paletteControl(page, label).check();
      await page.getByRole("radio", { name: modeLabel, exact: true }).check();
      await expect(page.locator(".dp")).toHaveAttribute(
        "data-palette",
        palette,
      );
      await expect(page.locator(".dp")).toHaveAttribute("data-theme", mode);
      const colours = await page.locator(".dp").evaluate((app) => {
        const names = [
          "bg",
          "surface",
          "raised",
          "ink",
          "muted",
          "accent",
          "accent-ink",
          "accent-soft",
          "danger",
          "sage",
          "sage-soft",
          "control-border",
        ];
        const probe = document.createElement("span");
        app.append(probe);
        const result = Object.fromEntries(
          names.map((name) => {
            probe.style.color = `var(--dp-${name})`;
            return [name, getComputedStyle(probe).color];
          }),
        );
        probe.remove();
        return result;
      });
      const textPairs = [
        ...["bg", "surface", "raised", "accent-soft", "sage-soft"].flatMap(
          (background) => [
            ["ink", background],
            ["muted", background],
          ],
        ),
        ...["bg", "surface", "raised", "accent-soft"].map((background) => [
          "accent",
          background,
        ]),
        ["accent-ink", "accent"],
        ["danger", "raised"],
        ["sage", "surface"],
        ["sage", "sage-soft"],
      ];
      const ratios = textPairs.map(([foreground, background]) => ({
        foreground,
        background,
        ratio: contrast(colours[foreground], colours[background]),
      }));
      for (const item of ratios)
        expect(
          item.ratio,
          `${contextLabel}: ${item.foreground} on ${item.background}`,
        ).toBeGreaterThanOrEqual(4.5);
      for (const surface of ["bg", "surface"])
        expect(
          contrast(colours["control-border"], colours[surface]),
          `${contextLabel}: input border against ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      await expect(
        page.getByRole("group", { name: "Kleurpalet", exact: true }),
      ).toBeVisible();
      // Reload to capture the persisted appearance without a transient save toast.
      // Viewport screenshots keep fixed navigation in its actual screen position.
      await page.reload();
      await expect(paletteControl(page, label)).toBeChecked();
      await expect(page.locator(".dp-toast")).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0));
      const skipBounds = await page.locator(".dp-skip").boundingBox();
      expect(skipBounds!.y + skipBounds!.height).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: testInfo.outputPath(`appearance-${palette}-${mode}-top.png`),
      });
      await page
        .getByRole("group", { name: "Kleurpalet", exact: true })
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: testInfo.outputPath(`appearance-${palette}-${mode}-palettes.png`),
      });
      await page.setViewportSize({ width: 320, height: 850 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${contextLabel}: 320px/200% reflow`,
      ).toBe(true);
      const clipped = await page
        .locator(".dp-settings input,.dp-settings button")
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              return (
                bounds.width > 0 &&
                (bounds.left < -1 || bounds.right > innerWidth + 1)
              );
            })
            .map((element) => element.outerHTML.slice(0, 180)),
        );
      expect(clipped, `${contextLabel}: controls fit the viewport`).toEqual([]);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, "/craving/new");
      const input = page.getByLabel(/^Wie, wat en waar/);
      const actualControl = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          colour: style.color,
          background: style.backgroundColor,
          border: style.borderTopColor,
          fontSize: parseFloat(style.fontSize),
        };
      });
      expect(
        contrast(actualControl.colour, actualControl.background),
        `${contextLabel}: actual input text`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(actualControl.border, actualControl.background),
        `${contextLabel}: actual input border`,
      ).toBeGreaterThanOrEqual(3);
      expect(actualControl.fontSize).toBeGreaterThanOrEqual(16);
      await input.focus();
      await expect(input).toBeFocused();
      const focus = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          colour: style.outlineColor,
          width: parseFloat(style.outlineWidth),
          style: style.outlineStyle,
        };
      });
      expect(focus.style, `${contextLabel}: focus indicator`).not.toBe("none");
      expect(
        focus.width,
        `${contextLabel}: focus width`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        contrast(focus.colour, colours.bg),
        `${contextLabel}: focus on page`,
      ).toBeGreaterThanOrEqual(3);
      measurements.push({ palette, mode, ratios, actualControl, focus });
    }
  }
  await testInfo.attach("appearance-contrast-measurements", {
    body: Buffer.from(JSON.stringify(measurements, null, 2)),
    contentType: "application/json",
  });
  await writeFile(
    testInfo.outputPath("appearance-contrast-measurements.json"),
    JSON.stringify(measurements, null, 2),
  );
  expect(errors).toEqual([]);
});
