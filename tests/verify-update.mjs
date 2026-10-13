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
const currentGuardChecks = [];
const draftKey = "anchor.app.drafts.v1";
const draftRecords = async () =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"records":{}}').records,
    draftKey,
  );
const draftRow = (title) =>
  page.locator(".anchor-draft-row").filter({
    has: page
      .locator("strong")
      .filter({ hasText: new RegExp(`^${title}(?: ·|$)`) }),
  });
const go = async (route) => {
  await page.goto(`http://127.0.0.1:8801/Anchor/#${route}`);
  await expect(page.locator("main h1")).toBeVisible();
};
const expectWaitingWorker = async () => {
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
};
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
  let saved = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  expect(JSON.parse(saved).cravings[0].situation).toBe(
    "Updatecontrole: een fictief moment",
  );
  if (baselineCommit)
    expect(Object.hasOwn(JSON.parse(saved), "palette")).toBe(false);
  if (!baselineCommit) {
    await go("/plan");
    await page
      .getByRole("button", { name: "Doel toevoegen", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Middel of gedrag", exact: true }),
    ).toBeVisible();
    expect(await draftRecords()).toEqual({});
    await go("/today");
    expect(await draftRecords()).toEqual({});
    await go("/plan");
    await page
      .getByRole("button", { name: "Doel toevoegen", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Middel of gedrag", exact: true })
      .selectOption("Cocaine");
    await page
      .getByRole("combobox", { name: "Mijn doel", exact: true })
      .selectOption("Stoppen");
    await page
      .getByRole("button", { name: "Doel opslaan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Bewerk doel Cocaine", exact: true }),
    ).toBeVisible();
    const goalBeforeOpening = await page.evaluate(() =>
      localStorage.getItem("anchor.app.data.v1"),
    );
    await page
      .getByRole("button", { name: "Bewerk doel Cocaine", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Mijn doel", exact: true }),
    ).toHaveValue("Stoppen");
    expect(await draftRecords()).toEqual({});
    await go("/today");
    expect(await draftRecords()).toEqual({});
    saved = await page.evaluate(() =>
      localStorage.getItem("anchor.app.data.v1"),
    );
    expect(saved).toBe(goalBeforeOpening);
    currentGuardChecks.push(
      "opening a blank or unchanged goal creates no invisible draft",
    );
  }
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(
    page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(/^Gedachte/)
    .fill("Concept blijft tijdens de update behouden.");
  if (!baselineCommit) {
    await go("/plan");
    await page
      .getByRole("button", { name: "Bewerk doel Cocaine", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Mijn doel", exact: true })
      .selectOption("Minderen");
    await page
      .getByLabel("Dit kan ik doen")
      .fill("Een fictieve wandeling voor de updatecontrole.");
    await go("/growth");
    await page
      .getByLabel("Wat wil je onthouden?")
      .fill("Fictief fijn moment voor de updatecontrole.");
    await go("/today");
    expect(Object.keys(await draftRecords()).sort()).toEqual([
      "craving:new",
      "goal",
      "growth",
      "plan",
    ]);
  }
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
  if (baselineCommit) {
    await expect(
      page.getByRole("alert").filter({ hasText: "open concepten" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("dialog", { name: "Open concepten", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".anchor-draft-row")).toHaveCount(4);
    for (const title of ["Craving", "Doel", "Fijn moment", "Mijn plan"])
      await expect(draftRow(title)).toHaveCount(1);
  }
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(saved);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(draft);
  await expectWaitingWorker();
  if (!baselineCommit) {
    await draftRow("Doel")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/plan$/);
    await expect(
      page.getByRole("combobox", { name: "Mijn doel", exact: true }),
    ).toHaveValue("Minderen");
    await expect(page.getByLabel("Dit kan ik doen")).toHaveValue(
      "Een fictieve wandeling voor de updatecontrole.",
    );
    await page
      .getByRole("button", { name: "Doel opslaan", exact: true })
      .click();
    expect(Object.keys(await draftRecords()).sort()).toEqual([
      "craving:new",
      "growth",
      "plan",
    ]);
    await go("/today");
    await expect(
      page.getByRole("button", { name: "Concepten bekijken (3)", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
    await draftRow("Mijn plan")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
    await expect(page.getByLabel("Dit kan ik doen")).toHaveValue(
      "Een fictieve wandeling voor de updatecontrole.",
    );
    await page
      .getByRole("button", { name: "Mijn plan opslaan", exact: true })
      .click();
    expect(Object.keys(await draftRecords()).sort()).toEqual([
      "craving:new",
      "growth",
    ]);
    await go("/today");
    await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
    await draftRow("Fijn moment")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/growth$/);
    await expect(page.getByLabel("Wat wil je onthouden?")).toHaveValue(
      "Fictief fijn moment voor de updatecontrole.",
    );
    await page
      .getByRole("button", { name: "Moment bewaren", exact: true })
      .click();
    expect(Object.keys(await draftRecords())).toEqual(["craving:new"]);
    currentGuardChecks.push(
      "update from another screen reveals and resumes goal, plan and growth drafts without losing other drafts",
    );

    // Reproduce an empty draft left by the previous version. It is not silently discarded.
    await page.evaluate((key) => {
      const envelope = JSON.parse(localStorage.getItem(key));
      envelope.records.goal = {
        id: "legacy-empty-goal",
        target: "",
        name: "",
        direction: "",
        note: "",
      };
      localStorage.setItem(key, JSON.stringify(envelope));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }, draftKey);
    await go("/today");
    await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
    await expect(page.locator(".anchor-draft-row")).toHaveCount(2);
    await draftRow("Doel")
      .getByRole("button", { name: "Concept verwijderen", exact: true })
      .click();
    expect((await draftRecords()).goal.id).toBe("legacy-empty-goal");
    await draftRow("Doel")
      .getByRole("button", { name: "Behouden", exact: true })
      .click();
    expect((await draftRecords()).goal.id).toBe("legacy-empty-goal");
    const savedBeforeDiscard = await page.evaluate(() =>
      localStorage.getItem("anchor.app.data.v1"),
    );
    await draftRow("Doel")
      .getByRole("button", { name: "Concept verwijderen", exact: true })
      .click();
    await draftRow("Doel")
      .getByRole("button", {
        name: "Concept verwijderen bevestigen",
        exact: true,
      })
      .click();
    expect(Object.keys(await draftRecords())).toEqual(["craving:new"]);
    expect(
      await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
    ).toBe(savedBeforeDiscard);
    currentGuardChecks.push(
      "legacy empty drafts stay visible until explicit per-draft removal; saved data and other drafts remain intact",
    );
    await draftRow("Craving")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
    await expect(page.getByRole("textbox", { name: /^Gedachte/ })).toHaveValue(
      "Concept blijft tijdens de update behouden.",
    );
    await expectWaitingWorker();
  }
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
  if (!baselineCommit) {
    await go("/today");
    await page
      .getByRole("button", { name: "Meer opties", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open concepten (0)", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Open concepten", exact: true }),
    ).toContainText("Je hebt geen open concepten.");
    await page
      .getByRole("button", { name: "Venster sluiten", exact: true })
      .click();

    const corruptRaw = '{"version":1,"records":';
    await page.evaluate(
      ({ key, raw }) => {
        localStorage.setItem(key, raw);
        window.dispatchEvent(new StorageEvent("storage", { key }));
      },
      { key: draftKey, raw: corruptRaw },
    );
    await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Conceptopslag herstellen",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Alleen concepten wissen",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBe(corruptRaw);
    await expectWaitingWorker();
    await page.getByRole("button", { name: "Annuleren", exact: true }).click();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBe(corruptRaw);
    await page.getByRole("button", { name: "Bijwerken", exact: true }).click();
    const recoveryDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Herstelbestand downloaden", exact: true })
      .click();
    const recovery = JSON.parse(
      await readFile(await (await recoveryDownload).path(), "utf8"),
    );
    expect(recovery.format).toBe("anchor.app.draft-recovery");
    expect(recovery.raw).toBe(corruptRaw);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), draftKey),
    ).toBe(corruptRaw);
    await expectWaitingWorker();
    await page
      .getByRole("button", { name: "Alleen concepten wissen", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await draftRecords()).toEqual({});
    expect(
      await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
    ).toBe(beforeUpdate);
    await expectWaitingWorker();
    currentGuardChecks.push(
      "corrupt draft storage opens recovery and keeps the worker waiting until recovery download and explicit clearing; saved records stay byte-identical",
    );
    const emptyDraftStorage = await page.evaluate(
      (key) => localStorage.getItem(key),
      draftKey,
    );
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          records: {
            goal: {
              id: "stale-empty-goal",
              target: "",
              name: "",
              direction: "",
              note: "",
            },
          },
        }),
      );
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }, draftKey);
    await expect(
      page.getByRole("button", { name: "Concepten bekijken (1)", exact: true }),
    ).toBeVisible();
    // Deliberately omit the notification to reproduce a stale rendered count.
    // The final update must consult current storage and activate, not open an empty list.
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: draftKey,
      raw: emptyDraftStorage,
    });
    expect(await draftRecords()).toEqual({});
    await expect(
      page.getByRole("button", { name: "Concepten bekijken (1)", exact: true }),
    ).toBeVisible();
    currentGuardChecks.push(
      "a stale rendered draft count cannot block the actual worker update when current storage is empty",
    );
  }
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
      ...currentGuardChecks,
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
