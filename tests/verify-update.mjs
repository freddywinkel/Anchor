import { chromium, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const directory = "tmp/update-check";
await mkdir(directory, { recursive: true });
const build = (name) => {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "--outDir",
      `${directory}/${name}`,
    ],
    { env: { ...process.env, APP_BUILD: name }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
};
build("update-a");
build("update-b");
let root = path.resolve(`${directory}/update-a`);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:8801");
    if (!url.pathname.startsWith("/Anchor/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(8)) || "index.html";
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(full);
    res.writeHead(200, {
      "Content-Type": types[path.extname(full)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(8801, "127.0.0.1", resolve));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const errors = [];
const documents = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (response) => {
  if (response.request().resourceType() === "document")
    documents.push({
      url: response.url(),
      status: response.status(),
      fromServiceWorker: response.fromServiceWorker(),
    });
});
try {
  await page.goto("http://127.0.0.1:8801/Anchor/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const originalModule = await page
    .locator('script[type="module"]')
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Craving vastleggen", exact: true })
    .click();
  await page
    .getByLabel(/^Situatie \(wie, wat, waar\)/)
    .fill("Updatecontrole: een fictief moment");
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/craving\/(?!new)/);
  await expect(
    page.getByRole("heading", { name: "Je craving", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(
    page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(/^Gedachte/)
    .fill("Concept blijft tijdens de update behouden.");
  const draft = await page.evaluate(() =>
    localStorage.getItem("anchor.app.drafts.v1"),
  );
  root = path.resolve(`${directory}/update-b`);
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await expect(
    page.getByRole("button", { name: "Bijwerken", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    window.anchorUpdateController = navigator.serviceWorker.controller;
  });
  await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "open concepten" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(saved);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(draft);
  expect(
    await page.evaluate(
      () =>
        navigator.serviceWorker.controller === window.anchorUpdateController,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/craving\/(?!new)/);
  await expect(
    page.getByRole("heading", { name: "Je craving", exact: true }),
  ).toBeVisible();
  const beforeUpdate = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  expect(JSON.parse(beforeUpdate).cravings).toHaveLength(2);
  expect(
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
    ).records,
  ).toEqual({});
  const documentsBeforeUpdate = documents.length;
  await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
  // The old document has already fired DOMContentLoaded. Waiting for that state
  // again can return before the asynchronous worker activates and reloads it.
  // Observe the actual replacement bundle before making any further navigation.
  await page.waitForFunction(
    (previousModule) => {
      const current = document
        .querySelector('script[type="module"]')
        ?.getAttribute("src");
      return !!current && current !== previousModule;
    },
    originalModule,
    { timeout: 30000 },
  );
  expect(documents.length).toBeGreaterThan(documentsBeforeUpdate);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return (
      !!navigator.serviceWorker.controller &&
      registration.active === navigator.serviceWorker.controller &&
      !registration.waiting
    );
  });
  await expect(page.locator("main h1")).toBeVisible();
  await page.goto("http://127.0.0.1:8801/Anchor/#/settings");
  await expect(page.getByText(/Versie update-b/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(beforeUpdate);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main h1")).toContainText("Instellingen");
  await expect(page.getByText(/Versie update-b/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(beforeUpdate);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("anchor.app.data.v1")).cravings.length,
    ),
  ).toBe(2);
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    checks: [
      "real worker A to B update",
      "open draft blocks activation and remains intact",
      "save draft then explicit update",
      "all stored record bytes unchanged",
      "updated app reloads fully offline",
    ],
    savedRecords: JSON.parse(beforeUpdate).cravings.length,
    moduleA: originalModule,
    moduleB: await page.locator('script[type="module"]').getAttribute("src"),
    documents,
    errors,
  };
  await writeFile(`${directory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page
    .screenshot({ path: `${directory}/failure.png`, fullPage: true })
    .catch(() => {});
  const state = await page
    .evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        url: location.href,
        module: document
          .querySelector('script[type="module"]')
          ?.getAttribute("src"),
        controller: navigator.serviceWorker.controller?.state,
        active: registration?.active?.state,
        waiting: registration?.waiting?.state,
        body: document.body.innerText,
      };
    })
    .catch(() => null);
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify({ error: String(error), state, documents, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  server.close();
}
