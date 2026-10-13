import { chromium, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const directory = path.join(repositoryRoot, "tmp/update-check");
const approvedBaseline = "2072cf1af8ddedd1d49c2e40e8286d0874842ff3";
const baselineRef = process.env.ANCHOR_BASELINE_REF;
let baselineCommit = null;
await mkdir(directory, { recursive: true });
const command = (executable, args, cwd = repositoryRoot) => {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${executable} failed: ${result.stdout}${result.stderr}`);
  return result.stdout.trim();
};
let baselineRoot = repositoryRoot;
if (baselineRef) {
  // Historical source is extracted only under ignored tmp. Never check out or
  // reset the user's working tree, and never build the baseline into normal dist.
  if (baselineRef !== "2072cf1" && baselineRef !== approvedBaseline)
    throw new Error(
      "ANCHOR_BASELINE_REF must identify the approved 2072cf1 release.",
    );
  baselineCommit = command("git", [
    "rev-parse",
    "--verify",
    `${baselineRef}^{commit}`,
  ]);
  if (baselineCommit !== approvedBaseline)
    throw new Error(
      "The baseline reference does not resolve to the approved release.",
    );
  baselineRoot = await mkdtemp(path.join(directory, "baseline-source-"));
  const archive = path.join(baselineRoot, "source.tar");
  command("git", [
    "archive",
    "--format=tar",
    "--output",
    archive,
    baselineCommit,
  ]);
  command("tar", ["-xf", archive, "-C", baselineRoot]);
  // Ancestor resolution shares the existing node_modules without an install or
  // symlink. Confirm the pinned dependencies are the same for this release.
  const oldPackage = JSON.parse(
    await readFile(path.join(baselineRoot, "package.json"), "utf8"),
  );
  const currentPackage = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  for (const kind of ["dependencies", "devDependencies"])
    expect(oldPackage[kind]).toEqual(currentPackage[kind]);
}
const build = (
  name,
  sourceRoot = repositoryRoot,
  commit = process.env.GITHUB_SHA,
) => {
  const r = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules/vite/bin/vite.js"),
      "build",
      sourceRoot,
      "--outDir",
      path.join(directory, name),
      "--emptyOutDir",
    ],
    {
      cwd: sourceRoot,
      env: {
        ...process.env,
        APP_BUILD: name,
        ...(commit ? { GITHUB_SHA: commit } : {}),
      },
      encoding: "utf8",
    },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
};
build("update-a", baselineRoot, baselineCommit || undefined);
build("update-b");
let root = path.resolve(`${directory}/update-a`);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
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
  const situation = baselineCommit
    ? page.getByLabel(/^Situatie \(wie, wat, waar\)/)
    : page.getByLabel("Wie, wat en waar", { exact: true });
  await situation.fill("Updatecontrole: een fictief moment");
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
  expect(JSON.parse(saved).cravings[0].situation).toBe(
    "Updatecontrole: een fictief moment",
  );
  if (baselineCommit)
    expect(Object.hasOwn(JSON.parse(saved), "palette")).toBe(false);
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
    JSON.parse(beforeUpdate).cravings.map((entry) => entry.thought),
  ).toContain("Concept blijft tijdens de update behouden.");
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
  await expect(
    page.getByRole("radio", { name: "Amber", exact: true }),
  ).toBeChecked();

  // The update itself must leave the historical serialized state untouched.
  // A later palette save is the first write that may add normalized metadata.
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(
    page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
  ).toBeVisible();
  const paletteDraftText = "Nieuw concept blijft behouden na mijn kleurkeuze.";
  await page.getByLabel(/^Gedachte/).fill(paletteDraftText);
  const paletteDraft = await page.evaluate(() =>
    localStorage.getItem("anchor.app.drafts.v1"),
  );
  await page.goto("http://127.0.0.1:8801/Anchor/#/settings");
  await page.getByRole("radio", { name: "Oceaan", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "Oceaan", exact: true }),
  ).toBeChecked();
  const afterPalette = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  expect(JSON.parse(afterPalette)).toEqual({
    ...JSON.parse(beforeUpdate),
    palette: "ocean",
    revision: JSON.parse(beforeUpdate).revision + 1,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(paletteDraft);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main h1")).toContainText("Instellingen");
  await expect(page.getByText(/Versie update-b/)).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Oceaan", exact: true }),
  ).toBeChecked();
  expect(documents.at(-1).fromServiceWorker).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(afterPalette);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("anchor.app.data.v1")).cravings.length,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(paletteDraft);
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(paletteDraftText);
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    baselineCommit,
    checks: [
      baselineCommit
        ? "historical release to current real worker update"
        : "real worker A to B update",
      "open draft blocks activation and remains intact",
      "save draft then explicit update",
      "all stored bytes unchanged by update; all records preserved after palette save",
      "new palette persists without changing records or drafts",
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
