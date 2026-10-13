import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseBackup, validateState, STORAGE_KEY } from "../src/lib/storage.ts";

const base = new URL(
  process.env.ANCHOR_LIVE_URL || "https://freddywinkel.github.io/Anchor/",
);
assert.ok(
  base.protocol === "https:" ||
    (base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)),
  "Use HTTPS, or localhost for a rehearsal",
);
assert.ok(base.pathname.endsWith("/") && !base.search && !base.hash);
const expectedCommit = process.env.EXPECTED_COMMIT;
assert.match(
  expectedCommit || "",
  /^[a-f0-9]{40}$/i,
  "EXPECTED_COMMIT must be the exact deployed Git commit",
);
const directory = path.resolve("tmp/live-validation");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(30000);
const page = await context.newPage();
const errors = [];
const requests = [];
const violations = [];
const documents = [];
function prohibitedRequest(request) {
  const url = new URL(request.url());
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const query = [...url.searchParams.values()].join(" ");
  return (
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname) ||
    !["GET", "HEAD"].includes(request.method()) ||
    request.postData() !== null ||
    /Synthetische releasecontrole|Fictieve?|offline gewijzigd/i.test(query)
  );
}
await context.route("**/*", (route) =>
  prohibitedRequest(route.request())
    ? route.abort("blockedbyclient")
    : route.continue(),
);
context.on("request", (request) => {
  const url = new URL(request.url());
  if (!["http:", "https:"].includes(url.protocol)) return;
  const entry = {
    url: request.url(),
    method: request.method(),
    hasBody: request.postData() !== null,
  };
  requests.push(entry);
  if (prohibitedRequest(request)) violations.push(entry);
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("websocket", (socket) => violations.push({ websocket: socket.url() }));
page.on("response", (response) => {
  if (response.request().resourceType() === "document")
    documents.push({
      url: response.url(),
      status: response.status(),
      fromServiceWorker: response.fromServiceWorker(),
    });
});

async function fetchText(url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      body: await response.text(),
    };
  }, String(url));
}
async function stored() {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  );
  assert.ok(raw, "A record must actually reach local storage");
  return { raw, state: validateState(JSON.parse(raw)) };
}

async function verifyFonts() {
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const body = await document.fonts.load('500 16px "DM Sans"', "Anchor Ā ă");
    const heading = await document.fonts.load(
      '400 36px "Fraunces"',
      "Anchor Ā ă",
    );
    return {
      body: body.map((font) => ({ family: font.family, status: font.status })),
      heading: heading.map((font) => ({
        family: font.family,
        status: font.status,
      })),
      bodyStyle: getComputedStyle(document.querySelector(".dp")).fontFamily,
      headingStyle: getComputedStyle(document.querySelector("h1")).fontFamily,
    };
  });
  for (const kind of ["body", "heading"]) {
    assert.ok(fonts[kind].length >= 2, `${kind}: both local font subsets load`);
    assert.ok(fonts[kind].every((font) => font.status === "loaded"));
  }
  assert.match(fonts.bodyStyle, /^"?DM Sans"?/);
  assert.match(fonts.headingStyle, /^"?Fraunces"?/);
  return fonts;
}

try {
  const response = await page.goto(base.href);
  assert.equal(response?.status(), 200);
  await expect(
    page.getByRole("heading", { name: "Vandaag, op jouw tempo.", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Worker registration timed out")),
          20000,
        ),
      ),
    ]),
  );
  await page.reload();
  await page.waitForFunction(
    () => !!navigator.serviceWorker.controller,
    undefined,
    { timeout: 20000 },
  );
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      scope: registration.scope,
      scriptURL: registration.active.scriptURL,
      controlled: registration.active === navigator.serviceWorker.controller,
    };
  });
  assert.equal(worker.scope, base.href);
  assert.equal(worker.scriptURL, new URL("sw.js", base).href);
  assert.equal(worker.controlled, true);
  const fonts = await verifyFonts();
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    null,
    "Fresh browser context must start with no personal data",
  );

  const releaseResponse = await fetchText(
    new URL(`release.json?verify=${randomUUID()}`, base),
  );
  assert.equal(releaseResponse.status, 200);
  const release = JSON.parse(releaseResponse.body);
  assert.equal(release.app, "Anchor");
  assert.equal(release.commit, expectedCommit);
  assert.ok(typeof release.version === "string" && release.version.length > 0);
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifestUrl = new URL(manifestHref, base);
  assert.equal(manifestUrl.origin, base.origin);
  assert.ok(manifestUrl.pathname.startsWith(base.pathname));
  const manifestResponse = await fetchText(manifestUrl);
  assert.equal(manifestResponse.status, 200);
  const manifest = JSON.parse(manifestResponse.body);
  assert.equal(manifest.name, "Anchor");
  assert.equal(manifest.short_name, "Anchor");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(
    manifest.icons.some((icon) =>
      icon.purpose?.split(" ").includes("maskable"),
    ),
  );
  for (const field of ["id", "scope", "start_url"])
    assert.equal(new URL(manifest[field], manifestUrl).href, base.href);
  const icons = [];
  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, manifestUrl);
    assert.equal(iconUrl.origin, base.origin);
    assert.ok(iconUrl.pathname.startsWith(base.pathname));
    const result = await page.evaluate(async (target) => {
      const response = await fetch(target, {
        signal: AbortSignal.timeout(15000),
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, header: [...bytes.slice(0, 24)] };
    }, iconUrl.href);
    assert.equal(result.status, 200);
    const header = Buffer.from(result.header);
    assert.deepEqual(
      [...header.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    const size = `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
    assert.equal(size, icon.sizes);
    icons.push({ url: iconUrl.href, size });
  }

  const entryActions = await page
    .locator(".dp-entry-actions > button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          name: button.textContent.trim(),
          width: box.width,
          height: box.height,
          background: style.backgroundColor,
          color: style.color,
          border: style.borderRadius,
        };
      }),
    );
  assert.deepEqual(
    entryActions.map((action) => action.name),
    ["Check-in toevoegen", "Craving vastleggen"],
  );
  assert.ok(Math.abs(entryActions[0].width - entryActions[1].width) <= 1);
  assert.ok(Math.abs(entryActions[0].height - entryActions[1].height) <= 1);
  assert.ok(entryActions.every((action) => action.height >= 44));
  for (const property of ["background", "color", "border"])
    assert.equal(entryActions[0][property], entryActions[1][property]);
  await page.screenshot({
    path: path.join(directory, "phone-today-actions.png"),
  });

  const growthCard = page.locator(".dp-growth-peek");
  await expect(
    growthCard.getByRole("heading", {
      name: "Kleine momenten bewaren",
      exact: true,
    }),
  ).toBeVisible();
  await growthCard.scrollIntoViewIfNeeded();
  const todayCards = await page
    .locator(".dp-today-moments, .dp-reflection, .dp-growth-peek")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const style = getComputedStyle(card);
        const box = card.getBoundingClientRect();
        return {
          border: style.borderTopWidth,
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          contentFits: [...card.querySelectorAll("h2, button")].every(
            (child) => {
              const rect = child.getBoundingClientRect();
              return (
                rect.left >= box.left &&
                rect.right <= box.right &&
                rect.top >= box.top &&
                rect.bottom <= box.bottom
              );
            },
          ),
        };
      }),
    );
  assert.equal(todayCards.length, 3);
  assert.ok(
    todayCards.every(
      (card) =>
        card.border === "1px" &&
        card.background !== "rgba(0, 0, 0, 0)" &&
        parseFloat(card.radius) > 0 &&
        card.contentFits,
    ),
  );
  await page.screenshot({
    path: path.join(directory, "phone-today-cards.png"),
  });

  const scrollBounds = [];
  for (const edge of ["bottom", "top"]) {
    await page.evaluate((edge) => {
      window.scrollTo(
        0,
        edge === "bottom" ? document.documentElement.scrollHeight : 0,
      );
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, edge);
    const geometry = await page.evaluate(() => {
      const nav = document
        .querySelector(".dp-bottom-nav")
        .getBoundingClientRect();
      const footer = document
        .querySelector(".dp-page-footer")
        .getBoundingClientRect();
      return {
        scroll: scrollY,
        maxScroll: document.documentElement.scrollHeight - innerHeight,
        navBottom: nav.bottom,
        navTop: nav.top,
        footerBottom: footer.bottom,
        headerTop: document.querySelector(".dp-topbar").getBoundingClientRect()
          .top,
        viewportHeight: innerHeight,
        overscrollY: getComputedStyle(document.documentElement)
          .overscrollBehaviorY,
      };
    });
    assert.equal(geometry.overscrollY, "none");
    assert.ok(Math.abs(geometry.navBottom - geometry.viewportHeight) <= 1);
    if (edge === "bottom") {
      assert.ok(Math.abs(geometry.scroll - geometry.maxScroll) <= 1);
      assert.ok(geometry.footerBottom <= geometry.navTop - 8);
    } else {
      assert.equal(geometry.scroll, 0);
      assert.ok(Math.abs(geometry.headerTop) <= 1);
    }
    scrollBounds.push({ edge, ...geometry });
    await page.screenshot({
      path: path.join(directory, `phone-scroll-${edge}.png`),
    });
  }

  await page
    .getByRole("button", { name: "Craving vastleggen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Externe situatie", exact: true }),
  ).toBeVisible();
  const fieldWidths = await page
    .locator(
      '.anchor-craving input[type="date"], .anchor-craving input[type="time"]',
    )
    .evaluateAll((inputs) =>
      inputs.map((input) => {
        const box = input.getBoundingClientRect();
        const label = input.parentElement.getBoundingClientRect();
        return {
          width: box.width,
          labelWidth: label.width,
          left: box.left,
          right: box.right,
          viewport: innerWidth,
        };
      }),
    );
  assert.equal(fieldWidths.length, 2);
  for (const field of fieldWidths) {
    assert.ok(Math.abs(field.width - field.labelWidth) < 1);
    assert.ok(field.left >= 0 && field.right <= field.viewport);
  }
  const synthetic =
    "Synthetische releasecontrole: fictief moment, geen persoonlijke gegevens.";
  await page
    .getByRole("combobox", { name: "Middel of gedrag", exact: true })
    .selectOption("3-MMC");
  await page.getByLabel("Wie, wat en waar", { exact: true }).fill(synthetic);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Fictieve gedachte voor de browsertest.");
  await page
    .getByLabel("Lichamelijke sensatie", { exact: true })
    .fill("Fictieve lichamelijke sensatie.");
  await page.getByLabel("Emotie", { exact: true }).fill("Fictieve emotie.");
  const internalValues = {};
  for (const [field, label, picker] of [
    ["thought", "Gedachte", "gedachte"],
    ["bodySensation", "Lichamelijke sensatie", "lichamelijke sensatie"],
    ["emotion", "Emotie", "emotie"],
  ]) {
    const input = page.getByLabel(label, { exact: true });
    const original = await input.inputValue();
    const select = page.getByRole("combobox", {
      name: `Voorbeeld voor ${picker}`,
      exact: true,
    });
    const suggestion = await select
      .locator("optgroup option")
      .first()
      .getAttribute("value");
    await select.selectOption(suggestion);
    internalValues[field] = `${original}\n${suggestion}`;
    await expect(input).toHaveValue(internalValues[field]);
    await expect(select).toHaveValue("");
  }
  const sectionGeometry = await page
    .locator(".anchor-craving-form > section[aria-labelledby]")
    .evaluateAll((sections) =>
      sections.slice(1).map((section) => {
        const rect = section.getBoundingClientRect();
        const heading = section.querySelector("h2").getBoundingClientRect();
        const style = getComputedStyle(section);
        return {
          title: section.querySelector("h2").textContent,
          x: rect.x,
          width: rect.width,
          gap: heading.top - rect.top,
          border: style.borderTopWidth,
        };
      }),
    );
  assert.equal(sectionGeometry.length, 3);
  for (const section of sectionGeometry) {
    assert.equal(section.border, "1px");
    assert.ok(section.gap >= 20);
    assert.ok(Math.abs(section.gap - sectionGeometry[0].gap) < 1);
    assert.ok(Math.abs(section.width - sectionGeometry[0].width) < 1);
    assert.equal(section.x, sectionGeometry[0].x);
  }
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Fictief gedrag voor de browsertest.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const before = await stored();
  assert.equal(before.state.cravings.length, 1);
  assert.equal(before.state.cravings[0].substance, "3-MMC");
  await expect(page.locator(".dp-timeline")).toContainText(
    "Middel of gedrag: 3-MMC",
  );
  assert.equal(before.state.cravings[0].situation, synthetic);
  for (const [field, value] of Object.entries(internalValues))
    assert.equal(before.state.cravings[0][field], value);
  await page.goto(
    new URL(`#/craving/${before.state.cravings[0].id}`, base).href,
  );
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Middel of gedrag", exact: true }),
  ).toHaveValue("3-MMC");
  await expect(
    page.getByLabel("Wie, wat en waar", { exact: true }),
  ).toHaveValue(synthetic);
  assert.equal((await stored()).raw, before.raw);
  await context.setOffline(true);
  const offlineProbe = await page.evaluate(
    async (target) => {
      try {
        await fetch(target, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        return { failed: false, online: navigator.onLine };
      } catch {
        return { failed: true, online: navigator.onLine };
      }
    },
    new URL(`not-precached-${randomUUID()}.txt`, base).href,
  );
  assert.deepEqual(offlineProbe, { failed: true, online: false });
  await page.reload();
  await expect(
    page.getByLabel("Wie, wat en waar", { exact: true }),
  ).toHaveValue(synthetic);
  assert.equal((await stored()).raw, before.raw);
  const offlineFonts = await verifyFonts();
  const fontCache = await page.evaluate(async (root) => {
    const results = [];
    for (const file of [
      "dm-sans-latin.woff2",
      "dm-sans-latin-ext.woff2",
      ...[500, 600, 700].flatMap((weight) => [
        `dm-sans-${weight}-latin.woff2`,
        `dm-sans-${weight}-latin-ext.woff2`,
      ]),
      "fraunces-latin.woff2",
      "fraunces-latin-ext.woff2",
    ]) {
      const response = await caches.match(new URL(`fonts/${file}`, root).href, {
        ignoreSearch: true,
      });
      results.push({
        file,
        cached: !!response,
        signature: response
          ? String.fromCharCode(
              ...new Uint8Array(await response.arrayBuffer()).slice(0, 4),
            )
          : null,
      });
    }
    return results;
  }, base.href);
  assert.ok(
    fontCache.every((font) => font.cached && font.signature === "wOF2"),
  );

  const offlineBehavior = "Fictief gedrag: offline gewijzigd en opgeslagen.";
  await page.getByLabel(/^Gedrag \(wat deed je\?\)/).fill(offlineBehavior);
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  const after = await stored();
  assert.equal(after.state.cravings.length, 1);
  assert.equal(after.state.cravings[0].id, before.state.cravings[0].id);
  assert.equal(after.state.cravings[0].behavior, offlineBehavior);
  assert.equal(after.state.cravings[0].substance, "3-MMC");
  assert.equal(after.state.revision, before.state.revision + 1);
  await expect(page).toHaveURL(/#\/today$/);
  await page.goto(
    new URL(`#/craving/${before.state.cravings[0].id}`, base).href,
  );
  await page.reload();
  await expect(page.getByLabel(/^Gedrag \(wat deed je\?\)/)).toHaveValue(
    offlineBehavior,
  );
  assert.equal((await stored()).raw, after.raw);
  await page.screenshot({
    path: path.join(directory, "phone-craving-offline.png"),
    fullPage: true,
  });

  await page.goto(new URL("#/moment/new", base).href);
  await expect(
    page.getByRole("heading", { name: "Hoe gaat het nu?", exact: true }),
  ).toBeVisible();
  const momentForm = page.locator("form").first();
  await expect(
    momentForm.locator(".dp-pan-illustration[aria-hidden='true']"),
  ).toHaveCount(5);
  await expect(
    momentForm.locator(".dp-mood-illustration[aria-hidden='true']"),
  ).toHaveCount(5);
  await momentForm
    .getByRole("button", { name: "-1 Laag", exact: true })
    .click();
  await momentForm
    .getByRole("button", { name: "Pannetje 4 van 5", exact: true })
    .click();
  await momentForm
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label: "Onrustig" });
  await momentForm
    .getByLabel("Intensiteit van Onrustig", { exact: true })
    .fill("70");
  await momentForm
    .getByRole("button", { name: "Nog een emotie", exact: true })
    .click();
  await momentForm
    .locator(".dp-emotion-row")
    .last()
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label: "Blij" });
  await momentForm
    .getByLabel("Intensiteit van Blij", { exact: true })
    .fill("0");
  await momentForm
    .getByRole("button", { name: "Nog een emotie", exact: true })
    .click();
  await momentForm
    .locator(".dp-emotion-row")
    .last()
    .getByRole("combobox", { name: "Kies een emotie", exact: true })
    .selectOption({ label: "Verdrietig" });
  await expect(
    momentForm.getByLabel("Intensiteit van Verdrietig", { exact: true }),
  ).toHaveValue("");
  await momentForm.getByText("Activiteit toevoegen", { exact: true }).click();
  await momentForm
    .getByRole("combobox", { name: "Activiteit", exact: true })
    .selectOption("Buiten wandelen");
  await momentForm
    .getByRole("button", { name: "Check-in opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  const firstMomentState = await stored();
  assert.equal(firstMomentState.state.moments.length, 1);
  const savedBeforeMoment = firstMomentState.state.moments[0];
  assert.equal(savedBeforeMoment.before.mood, -1);
  assert.equal(savedBeforeMoment.before.pans, 4);
  assert.equal(savedBeforeMoment.before.eis, null);
  assert.deepEqual(
    savedBeforeMoment.before.emotionRatings.map(({ label, intensity }) => ({
      label,
      intensity,
    })),
    [
      { label: "Onrustig", intensity: 70 },
      { label: "Blij", intensity: 0 },
      { label: "Verdrietig", intensity: null },
    ],
  );
  assert.equal(savedBeforeMoment.after, null);
  await page
    .getByRole("button", { name: "Nameting invullen", exact: true })
    .click();
  const afterForm = page.locator(".dp-after-form");
  await expect(afterForm.locator(".dp-emotion-row")).toHaveCount(3);
  for (const label of ["Onrustig", "Blij", "Verdrietig"])
    await expect(
      afterForm.getByLabel(`Intensiteit van ${label}`, { exact: true }),
    ).toHaveValue("");
  await expect(
    afterForm.getByRole("button", { name: "Niet ingevuld", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await afterForm
    .getByLabel("Intensiteit van Onrustig", { exact: true })
    .fill("0");
  await afterForm
    .getByRole("button", { name: "Pannetje 2 van 5", exact: true })
    .click();
  await afterForm.getByRole("button", { name: "+1 Goed", exact: true }).click();
  await afterForm
    .getByRole("button", { name: "Nameting opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  await page.goto(new URL(`#/moment/${savedBeforeMoment.id}`, base).href);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Jouw check-in", exact: true }),
  ).toBeVisible();
  const withMoment = await stored();
  assert.equal(withMoment.state.moments.length, 1);
  const savedMoment = withMoment.state.moments[0];
  assert.equal(savedMoment.id, savedBeforeMoment.id);
  assert.deepEqual(savedMoment.before, savedBeforeMoment.before);
  assert.equal(savedMoment.after.mood, 1);
  assert.equal(savedMoment.after.pans, 2);
  assert.equal(savedMoment.after.eis, null);
  assert.equal(savedMoment.attempted, null);
  assert.deepEqual(
    savedMoment.after.emotionRatings.map(({ label, intensity }) => ({
      label,
      intensity,
    })),
    [
      { label: "Onrustig", intensity: 0 },
      { label: "Blij", intensity: null },
      { label: "Verdrietig", intensity: null },
    ],
  );
  assert.deepEqual(withMoment.state.cravings, after.state.cravings);
  await expect(
    afterForm.getByLabel("Intensiteit van Onrustig", { exact: true }),
  ).toHaveValue("0");
  await expect(
    afterForm.getByLabel("Intensiteit van Blij", { exact: true }),
  ).toHaveValue("");
  await expect(
    afterForm.getByLabel("Intensiteit van Verdrietig", { exact: true }),
  ).toHaveValue("");
  await afterForm.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(directory, "phone-emotions-after-offline.png"),
  });

  const draftsBeforeReading = await page.evaluate(() =>
    localStorage.getItem("anchor.app.drafts.v1"),
  );
  await page.goto(new URL("#/history", base).href);
  await expect(page.getByLabel("Periode")).toHaveValue("all");
  const cravingGroup = page.locator(".dp-history-group").filter({
    has: page.getByRole("heading", { name: "Cravings", exact: true }),
  });
  const checkinGroup = page.locator(".dp-history-group").filter({
    has: page.getByRole("heading", { name: "Check-ins", exact: true }),
  });
  await expect(cravingGroup.locator("details")).not.toHaveAttribute("open", "");
  await expect(cravingGroup.locator("summary")).toContainText("3-MMC");
  await expect(cravingGroup.locator("summary")).toContainText(
    after.state.cravings[0].time,
  );
  await cravingGroup.locator("summary").click();
  const historyCraving = cravingGroup.locator(".dp-history-body");
  for (const value of [
    synthetic,
    offlineBehavior,
    ...Object.values(internalValues),
  ])
    await expect(historyCraving).toContainText(value);
  assert.ok(
    await historyCraving.locator("dd").evaluateAll((values) =>
      values.every((value) => {
        const style = getComputedStyle(value);
        return (
          style.webkitLineClamp === "none" &&
          value.scrollHeight <= value.clientHeight + 1
        );
      }),
    ),
  );
  await checkinGroup.locator("summary").click();
  await expect(checkinGroup.locator(".dp-history-body")).toContainText(
    "Vóór: 70/100 · Na: 0/100",
  );
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.locator("main form")).toHaveCount(0);
  assert.equal((await stored()).raw, withMoment.raw);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
    draftsBeforeReading,
  );
  await cravingGroup.locator("summary").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(directory, "phone-expanded-history-offline.png"),
  });

  await page.getByRole("button", { name: "Meer opties", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Instellingen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Instellingen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      new RegExp(
        `Versie ${release.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    ),
  ).toBeVisible();
  for (const [id, name] of [
    ["amber", "Amber"],
    ["sage", "Salie"],
    ["ocean", "Oceaan"],
    ["rose", "Roos"],
    ["lavender", "Lavendel"],
  ]) {
    await page.getByRole("radio", { name, exact: true }).check();
    assert.equal((await stored()).state.palette, id);
  }
  await page.getByRole("radio", { name: "Licht", exact: true }).check();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Lavendel", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Licht", exact: true }),
  ).toBeChecked();
  const themed = await stored();
  assert.deepEqual(themed.state.cravings, after.state.cravings);
  assert.deepEqual(themed.state.moments, withMoment.state.moments);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Back-up downloaden", exact: true })
      .click(),
  ]);
  const backupPath = path.join(directory, "synthetic-anchor-backup.json");
  await download.saveAs(backupPath);
  assert.deepEqual(
    parseBackup(await readFile(backupPath, "utf8")),
    themed.state,
  );
  await page.screenshot({
    path: path.join(directory, "phone-settings-offline.png"),
    fullPage: true,
  });
  const draftBeforeTools = await page.evaluate(() =>
    localStorage.getItem("anchor.app.drafts.v1"),
  );
  const openTools = () =>
    page
      .locator(".dp-bottom-nav")
      .getByRole("link", {
        name: "Hulpmiddelen",
        exact: true,
      })
      .click();
  await openTools();
  await page
    .getByRole("button", { name: "Activiteit kiezen", exact: true })
    .click();
  const activityChoice = page.getByRole("combobox", {
    name: "Activiteit",
    exact: true,
  });
  await expect(activityChoice).toBeFocused();
  await expect(activityChoice).toHaveValue("");
  await openTools();
  await page
    .getByRole("button", { name: "Eerst inchecken", exact: true })
    .click();
  await expect(activityChoice).toHaveValue("5-4-3-2-1");
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  await openTools();
  await page.screenshot({
    path: path.join(directory, "phone-tools-offline.png"),
  });
  await page
    .getByRole("button", { name: "Start de oefening", exact: true })
    .click();
  for (let step = 0; step < 5; step++) {
    await page
      .getByRole("button", { name: "Stap overslaan", exact: true })
      .click();
  }
  await expect(page.locator(".dp-exercise-done h2")).toBeFocused();
  await page
    .getByRole("button", { name: "Check-in na de oefening", exact: true })
    .click();
  await page.getByText("Activiteit toevoegen", { exact: true }).click();
  await expect(activityChoice).toHaveValue("");
  await expect(page.locator(".dp-after-form")).toHaveCount(0);
  await expect(
    page.locator(".dp-mood-options [aria-pressed=true]"),
  ).toHaveCount(0);
  assert.equal((await stored()).raw, themed.raw);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
    draftBeforeTools,
  );
  // The support/week routes also work offline and only an explicit day delete writes.
  await page.goto(new URL("#/help", base).href);
  await page.getByText("Verder na gebruik", { exact: true }).click();
  await expect(
    page.getByText(/Je eerdere registraties blijven bewaard/),
  ).toBeVisible();
  await page.getByRole("button", { name: "5-4-3-2-1 openen" }).click();
  await page.getByRole("button", { name: "Stoppen en terug" }).click();
  await expect(page).toHaveURL(new RegExp("#/help$"));
  assert.equal((await stored()).raw, themed.raw);
  await page.goto(new URL("#/history", base).href);
  await page
    .getByRole("combobox", { name: "Periode", exact: true })
    .selectOption("week");
  const week = page.getByRole("region", {
    name: "Rustig terugkijken op je week",
  });
  await expect(week).toContainText("Notities op");
  await expect(week.locator(".dp-week-days > li")).toHaveCount(7);
  assert.equal((await stored()).raw, themed.raw);
  const dayDate = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.goto(new URL(`#/day/${dayDate}`, base).href);
  await page
    .getByLabel("Wat wil je onthouden van vandaag?")
    .fill("Synthetische releasecontrole: rust genomen");
  await page
    .getByRole("button", { name: "Dagoverzicht opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  await page.goto(new URL(`#/day/${dayDate}`, base).href);
  await page
    .getByRole("button", { name: "Dagoverzicht verwijderen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ja, verwijderen", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const removedDay = (await stored()).state;
  assert.deepEqual(removedDay.days, themed.state.days);
  assert.deepEqual(
    { ...removedDay, revision: themed.state.revision },
    themed.state,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
    draftBeforeTools,
  );
  const caches = await page.evaluate(() => window.caches.keys());
  assert.ok(caches.length > 0);
  assert.ok(
    caches.every(
      (name) => name.startsWith("anchor-app-") && name.includes(base.href),
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    violations,
    [],
    "Browser must make only scoped static GET/HEAD requests; no submitted data",
  );
  assert.ok(
    documents.slice(-2).every((document) => document.fromServiceWorker),
  );
  const result = {
    passed: true,
    checkedAt: new Date().toISOString(),
    url: base.href,
    release,
    worker,
    icons,
    todayCards,
    entryActions,
    scrollBounds,
    fonts,
    offlineFonts,
    fontCache,
    checks: [
      "exact live commit",
      "fresh empty profile",
      "check-in and craving actions have equal size and styling on the public mobile page",
      "Today groups the timeline, whole day and small positive moments in visible cards with fitting actions",
      "mobile page has bounded vertical overscroll, anchored bottom navigation and reachable footer at both scroll endpoints",
      "real craving UI save/reload",
      "successful craving and follow-up saves close their forms; unanswered activity choice stays null",
      "optional craving substance survives save, reload, offline editing and backup export",
      "separate check-in and craving disclosures show complete information offline without edits or new drafts",
      "manifest/icons and scoped worker",
      "local display and body fonts load and remain cached offline, including accented characters",
      "five decorative pan and mood illustrations retain their accessible controls offline",
      "uncached request fails offline",
      "offline edit/save/reload retains record",
      "date/time controls fill their available width",
      "section dividers align above all headings",
      "three suggestion pickers append text and saved records retain it",
      "offline check-in keeps mood, pans and individual emotion intensities independent",
      "follow-up copies emotion names with blank scores and preserves zero versus missing after offline reload",
      "follow-up leaves original emotion ratings unchanged and is included in the validated backup",
      "five palettes and mode persist offline without changing records",
      "downloaded backup validates and matches saved data",
      "offline tools open the intended activity choice and grounding preselection without replacing data or drafts",
      "finishing a standalone exercise opens an unanswered current check-in without invented before ratings or automatic use",
      "offline support and after-use guidance stay read-only and the exercise returns to support",
      "offline seven-day overview shows all calendar days without changing stored data",
      "explicit offline day deletion preserves all unrelated records, settings and drafts",
      "no external or data-bearing requests",
      "no page errors",
    ],
    savedRecords: themed.state.cravings.length + themed.state.moments.length,
    savedCravings: themed.state.cravings.length,
    savedMoments: themed.state.moments.length,
    offlineProbe,
    caches,
    documents,
    requests,
    errors,
    violations,
    limitations: [
      "Chromium desktop automation with a 390px viewport; no physical iPhone/iPad or installed Safari evidence",
    ],
  };
  await writeFile(
    path.join(directory, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: true,
      url: base.href,
      release,
      checks: result.checks,
      evidence: directory,
    }),
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(directory, "failure.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    path.join(directory, "failure.json"),
    JSON.stringify(
      {
        passed: false,
        url: base.href,
        error: String(error),
        errors,
        violations,
        requests,
        documents,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
