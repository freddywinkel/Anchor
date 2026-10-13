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
  await page.getByLabel("Wie, wat en waar", { exact: true }).fill(synthetic);
  await page
    .getByLabel("Gedachte", { exact: true })
    .fill("Fictieve gedachte voor de browsertest.");
  await page
    .getByLabel("Lichamelijke sensatie", { exact: true })
    .fill("Fictieve lichamelijke sensatie.");
  await page.getByLabel("Emotie", { exact: true }).fill("Fictieve emotie.");
  await page
    .getByLabel(/^Gedrag \(wat deed je\?\)/)
    .fill("Fictief gedrag voor de browsertest.");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Je craving", exact: true }),
  ).toBeVisible();
  const before = await stored();
  assert.equal(before.state.cravings.length, 1);
  assert.equal(before.state.cravings[0].situation, synthetic);
  await page.reload();
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
  const offlineBehavior = "Fictief gedrag: offline gewijzigd en opgeslagen.";
  await page.getByLabel(/^Gedrag \(wat deed je\?\)/).fill(offlineBehavior);
  await page
    .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
    .click();
  const after = await stored();
  assert.equal(after.state.cravings.length, 1);
  assert.equal(after.state.cravings[0].id, before.state.cravings[0].id);
  assert.equal(after.state.cravings[0].behavior, offlineBehavior);
  assert.equal(after.state.revision, before.state.revision + 1);
  await page.reload();
  await expect(page.getByLabel(/^Gedrag \(wat deed je\?\)/)).toHaveValue(
    offlineBehavior,
  );
  assert.equal((await stored()).raw, after.raw);
  await page.screenshot({
    path: path.join(directory, "phone-craving-offline.png"),
    fullPage: true,
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
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Back-up exporteren", exact: true })
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
    checks: [
      "exact live commit",
      "fresh empty profile",
      "real craving UI save/reload",
      "manifest/icons and scoped worker",
      "uncached request fails offline",
      "offline edit/save/reload retains record",
      "date/time controls fill their available width",
      "five palettes and mode persist offline without changing records",
      "downloaded backup validates and matches saved data",
      "no external or data-bearing requests",
      "no page errors",
    ],
    savedRecords: after.state.cravings.length,
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
