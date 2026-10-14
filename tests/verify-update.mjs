import { chromium, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { parseBackup, validateState } from "../src/lib/storage.ts";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const directory = path.join(repositoryRoot, "tmp/update-check");
const approvedBaselines = [
  "2072cf1af8ddedd1d49c2e40e8286d0874842ff3",
  "a42fc3bf9a0be0c3b09f4b3bb52d2830cb1e6f19",
  "bc176fd0ddf36bcd261ad2bd648537b717e2d7a7",
  "8090e444bf0e292ebfc92fe95e80b1ed86ba76dc",
  "a8262d9113c1f7940cd730f83a2ad0c4a78eefac",
  "34128808396c3a71ad8d497f0cd78415def3d688",
  "b95a3c3a0a0762b643309e566ef0b54fd23340cb",
];
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
  const approvedBaseline = approvedBaselines.find(
    (commit) => baselineRef === commit || baselineRef === commit.slice(0, 7),
  );
  if (!approvedBaseline)
    throw new Error(
      "ANCHOR_BASELINE_REF must identify approved release 2072cf1, a42fc3b, bc176fd, 8090e44, a8262d9, 3412880 or b95a3c3.",
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
const oldestBaseline = baselineCommit === approvedBaselines[0];
// The first two releases used unlinked EIS and stayed on the craving after
// saving. Recent published versions use the same flow as the current app.
const legacyBaseline = approvedBaselines.slice(0, 2).includes(baselineCommit);
const multipleSubstancesBaseline =
  baselineCommit === null ||
  approvedBaselines.slice(5).includes(baselineCommit);
// The published 1.15.0 baseline and current source understand the additive marker.
const useMarkerBaseline =
  baselineCommit === null ||
  baselineCommit === "b95a3c3a0a0762b643309e566ef0b54fd23340cb";
const useConfirmationTimeBaseline = baselineCommit === null;
function expectConfirmationInstant(value, earliest, latest) {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(new Date(value).toISOString()).toBe(value);
  expect(Date.parse(value)).toBeGreaterThanOrEqual(earliest);
  expect(Date.parse(value)).toBeLessThanOrEqual(latest);
}
const fixtureUnknownCravingId = "update-unknown-substance";
const fixtureScalarCravingId = "update-scalar-substance";
const fixtureMomentId = "update-linked-emotions";
const fixtureDay = "2026-10-12";
let legacyMoment = null;
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
  const situation = oldestBaseline
    ? page.getByLabel(/^Situatie \(wie, wat, waar\)/)
    : page.getByLabel("Wie, wat en waar", { exact: true });
  await situation.fill("Updatecontrole: een fictief moment");
  if (!legacyBaseline)
    await page
      .getByRole("combobox", { name: "Middel of gedrag", exact: true })
      .selectOption("Cocaine");
  if (multipleSubstancesBaseline) {
    await page
      .getByRole("button", { name: "Nog een middel toevoegen", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Middel of gedrag 2", exact: true })
      .selectOption("Alcohol");
  }
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  if (legacyBaseline) {
    await expect(page).toHaveURL(/#\/craving\/(?!new)/);
    await expect(
      page.getByRole("heading", { name: "Je craving", exact: true }),
    ).toBeVisible();
  } else await expect(page).toHaveURL(/#\/today$/);
  let initialConfirmationBounds = null;
  if (useMarkerBaseline) {
    const earliest = await page.evaluate(() => Date.now());
    await page
      .getByRole("button", { name: "Gebruikt aangeven", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Markering verwijderen", exact: true }),
    ).toBeVisible();
    initialConfirmationBounds = [
      earliest,
      await page.evaluate(() => Date.now()),
    ];
  }
  let saved = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  expect(JSON.parse(saved).cravings[0].situation).toBe(
    "Updatecontrole: een fictief moment",
  );
  if (useMarkerBaseline)
    expect(JSON.parse(saved).cravings[0].usedAfterCraving).toBe(true);
  else
    expect(
      Object.hasOwn(JSON.parse(saved).cravings[0], "usedAfterCraving"),
    ).toBe(false);
  if (useConfirmationTimeBaseline)
    expectConfirmationInstant(
      JSON.parse(saved).cravings[0].usedConfirmedAt,
      ...initialConfirmationBounds,
    );
  else
    expect(
      Object.hasOwn(JSON.parse(saved).cravings[0], "usedConfirmedAt"),
    ).toBe(false);
  if (multipleSubstancesBaseline) {
    expect(JSON.parse(saved).cravings[0].substances).toEqual([
      "Cocaine",
      "Alcohol",
    ]);
    expect(Object.hasOwn(JSON.parse(saved).cravings[0], "substance")).toBe(
      false,
    );
  } else if (!legacyBaseline)
    expect(JSON.parse(saved).cravings[0].substance).toBe("Cocaine");
  if (oldestBaseline)
    expect(Object.hasOwn(JSON.parse(saved), "palette")).toBe(false);
  if (legacyBaseline) {
    await go("/moment/new");
    await page.getByRole("button", { name: "-1 Laag", exact: true }).click();
    await page.getByLabel(/^Emotionele intensiteit/).fill("67");
    await page
      .getByText("Emoties en context toevoegen", { exact: true })
      .click();
    await page.getByRole("button", { name: "Onrustig", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Activiteit", exact: true })
      .selectOption("Schilderen");
    await page
      .getByRole("button", { name: "Dit moment opslaan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nameting invullen", exact: true })
      .click();
    const after = page.locator(".dp-after-form");
    await after.getByRole("button", { name: "Ja", exact: true }).click();
    await after.getByRole("button", { name: "+1 Goed", exact: true }).click();
    await after.getByLabel(/^Na: Emotionele intensiteit/).fill("24");
    await after
      .getByRole("button", { name: "Nameting opslaan", exact: true })
      .click();
    saved = await page.evaluate(() =>
      localStorage.getItem("anchor.app.data.v1"),
    );
    legacyMoment = JSON.parse(saved).moments[0];
    expect(legacyMoment).toMatchObject({
      before: { mood: -1, eis: 67 },
      after: { mood: 1, eis: 24 },
      emotions: ["Onrustig"],
    });
    expect(Object.hasOwn(legacyMoment.before, "emotionRatings")).toBe(false);
    expect(Object.hasOwn(legacyMoment.after, "emotionRatings")).toBe(false);
  }
  if (!legacyBaseline) {
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
      page.getByRole("button", {
        name: legacyBaseline ? "Bewerk doel Cocaine" : "Bewerken: doel Cocaine",
        exact: true,
      }),
    ).toBeVisible();
    const goalBeforeOpening = await page.evaluate(() =>
      localStorage.getItem("anchor.app.data.v1"),
    );
    await page
      .getByRole("button", {
        name: legacyBaseline ? "Bewerk doel Cocaine" : "Bewerken: doel Cocaine",
        exact: true,
      })
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
    // This profile is isolated and synthetic. Seed the richer saved shapes so
    // the previous published app must read them before the real worker update.
    const unknownCraving = {
      ...JSON.parse(saved).cravings[0],
      id: fixtureUnknownCravingId,
    };
    delete unknownCraving.substance;
    delete unknownCraving.substances;
    delete unknownCraving.usedAfterCraving;
    delete unknownCraving.usedConfirmedAt;
    const seeded = validateState({
      ...JSON.parse(saved),
      cravings: [
        ...JSON.parse(saved).cravings,
        unknownCraving,
        ...(multipleSubstancesBaseline
          ? [
              {
                ...unknownCraving,
                id: fixtureScalarCravingId,
                substance: "Cocaine",
              },
            ]
          : []),
      ],
      moments: [
        {
          id: fixtureMomentId,
          date: fixtureDay,
          time: "09:00",
          kind: "checkin",
          before: {
            mood: 0,
            eis: null,
            pans: 3,
            emotionRatings: [
              { id: "first-emotion", label: "Rustig", intensity: 0 },
              { id: "second-emotion", label: "Onrustig", intensity: null },
            ],
          },
          after: {
            mood: null,
            eis: null,
            pans: 1,
            emotionRatings: [
              { id: "first-emotion", label: "Rustig", intensity: null },
              { id: "second-emotion", label: "Onrustig", intensity: 40 },
            ],
          },
          afterDate: "2026-10-13",
          afterTime: "08:00",
          activity: "Een grens aangeven",
          attempted: false,
          emotions: [],
          note: "Fictieve check-in met onafhankelijke scores.",
        },
      ],
      days: [
        {
          date: fixtureDay,
          ratings: { mood: -1, eis: null },
          sleepHours: "7",
          sleepMinutes: "",
          note: "Fictief dagoverzicht met gedeeltelijke slaap.",
        },
      ],
      theme: "light",
      homeShowGrowth: false,
    });
    saved = JSON.stringify(seeded);
    await page.evaluate(
      (raw) => localStorage.setItem("anchor.app.data.v1", raw),
      saved,
    );
    await page.reload();
  }
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(
    page.getByRole("heading", { name: "Craving vastleggen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(/^Gedachte/)
    .fill("Concept blijft tijdens de update behouden.");
  if (!legacyBaseline)
    await page
      .getByRole("combobox", { name: "Middel of gedrag", exact: true })
      .selectOption("3-MMC");
  if (multipleSubstancesBaseline) {
    await page
      .getByRole("button", { name: "Nog een middel toevoegen", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Middel of gedrag 2", exact: true })
      .selectOption("Alcohol");
    expect((await draftRecords())["craving:new"].substances).toEqual([
      "3-MMC",
      "Alcohol",
    ]);
  }
  if (!legacyBaseline) {
    await go(`/moment/${fixtureMomentId}`);
    await page
      .getByLabel(/^In je eigen woorden/)
      .fill("Bewaarde check-inwijziging voor de update.");
    await go(`/day/${fixtureDay}`);
    await page
      .locator("textarea")
      .last()
      .fill("Bewaarde dagwijziging voor de update.");
    await go("/plan");
    await page
      .getByRole("button", {
        name: legacyBaseline ? "Bewerk doel Cocaine" : "Bewerken: doel Cocaine",
        exact: true,
      })
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
      `day:${fixtureDay}`,
      "goal",
      "growth",
      `moment:${fixtureMomentId}`,
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
  if (oldestBaseline) {
    await expect(
      page.getByRole("alert").filter({ hasText: "open concepten" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("dialog", { name: "Open concepten", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".anchor-draft-row")).toHaveCount(
      legacyBaseline ? 1 : 6,
    );
    for (const title of legacyBaseline
      ? ["Craving"]
      : [
          "Craving",
          "Check-in",
          "Dagoverzicht",
          "Doel",
          "Klein moment",
          "Mijn plan",
        ])
      await expect(draftRow(title)).toHaveCount(1);
  }
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(saved);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(draft);
  await expectWaitingWorker();
  if (legacyBaseline && !oldestBaseline)
    await draftRow("Craving")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
  if (!legacyBaseline) {
    for (const [title, text, saveButton] of [
      [
        "Check-in",
        "Bewaarde check-inwijziging voor de update.",
        /^(?:Wijzigingen check-in opslaan|Check-in opslaan)$/,
      ],
      [
        "Dagoverzicht",
        "Bewaarde dagwijziging voor de update.",
        "Dagoverzicht opslaan",
      ],
    ]) {
      await draftRow(title)
        .getByRole("button", { name: "Verder schrijven", exact: true })
        .click();
      await expect(page.locator("textarea").first()).toHaveValue(text);
      await page.getByRole("button", { name: saveButton, exact: true }).click();
      await go("/today");
      await page
        .getByRole("button", { name: "Bijwerken", exact: true })
        .click();
    }
    expect(Object.keys(await draftRecords()).sort()).toEqual([
      "craving:new",
      "goal",
      "growth",
      "plan",
    ]);
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
      .getByRole("button", { name: "Wijzigingen opslaan", exact: true })
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
    await draftRow("Klein moment")
      .getByRole("button", { name: "Verder schrijven", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/growth$/);
    await expect(page.getByLabel("Wat wil je onthouden?")).toHaveValue(
      "Fictief fijn moment voor de updatecontrole.",
    );
    await page
      .getByRole("button", { name: "Moment opslaan", exact: true })
      .click();
    expect(Object.keys(await draftRecords())).toEqual(["craving:new"]);
    currentGuardChecks.push(
      "update from another screen reveals and resumes check-in, day, goal, plan and growth drafts without losing the craving draft",
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
  if (legacyBaseline) {
    await expect(page).toHaveURL(/#\/craving\/(?!new)/);
    await expect(
      page.getByRole("heading", { name: "Je craving", exact: true }),
    ).toBeVisible();
  } else await expect(page).toHaveURL(/#\/today$/);
  const beforeUpdate = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  expect(JSON.parse(beforeUpdate).cravings).toHaveLength(
    JSON.parse(saved).cravings.length + 1,
  );
  if (!legacyBaseline) {
    const snapshot = JSON.parse(beforeUpdate);
    expect(snapshot.moments).toHaveLength(1);
    expect(snapshot.moments[0]).toMatchObject({
      id: fixtureMomentId,
      before: {
        mood: 0,
        pans: 3,
        emotionRatings: [{ intensity: 0 }, { intensity: null }],
      },
      after: {
        mood: null,
        pans: 1,
        emotionRatings: [{ intensity: null }, { intensity: 40 }],
      },
      afterDate: "2026-10-13",
      attempted: false,
      note: "Bewaarde check-inwijziging voor de update.",
    });
    expect(snapshot.days).toHaveLength(1);
    expect(snapshot.days[0]).toMatchObject({
      date: fixtureDay,
      sleepHours: "7",
      sleepMinutes: "",
      note: "Bewaarde dagwijziging voor de update.",
    });
    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.growth).toHaveLength(1);
    expect(snapshot.plan.action).toBe(
      "Een fictieve wandeling voor de updatecontrole.",
    );
    expect(snapshot.theme).toBe("light");
    expect(snapshot.homeShowGrowth).toBe(false);
    currentGuardChecks.push(
      "all six draft types can be resumed before activation; all saved record types, linked before/after scores, partial sleep and preferences are included in byte-preservation checks",
    );
  }
  if (legacyBaseline)
    expect(
      JSON.parse(beforeUpdate).cravings.every(
        (entry) => !Object.hasOwn(entry, "substance"),
      ),
    ).toBe(true);
  else {
    const cravings = JSON.parse(beforeUpdate).cravings;
    const unknown = cravings.find(
      (entry) => entry.id === fixtureUnknownCravingId,
    );
    expect(Object.hasOwn(unknown, "substance")).toBe(false);
    expect(Object.hasOwn(unknown, "substances")).toBe(false);
    if (multipleSubstancesBaseline) {
      expect(cravings[0].substances).toEqual(["Cocaine", "Alcohol"]);
      expect(cravings.at(-1).substances).toEqual(["3-MMC", "Alcohol"]);
      expect(
        cravings.find((entry) => entry.id === fixtureScalarCravingId).substance,
      ).toBe("Cocaine");
    } else
      expect(
        cravings
          .filter((entry) => entry.substance)
          .map((entry) => entry.substance),
      ).toEqual(["Cocaine", "3-MMC"]);
    currentGuardChecks.push(
      "historical scalar and unknown substances remain unchanged alongside current multiple-substance records and drafts when supported by the baseline",
    );
  }
  expect(
    JSON.parse(beforeUpdate).cravings.map((entry) => entry.thought),
  ).toContain("Concept blijft tijdens de update behouden.");
  expect(
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
    ).records,
  ).toEqual({});
  if (!legacyBaseline) {
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
  if (useMarkerBaseline) {
    expect(JSON.parse(beforeUpdate).cravings[0].usedAfterCraving).toBe(true);
    if (!useConfirmationTimeBaseline)
      expect(
        Object.hasOwn(JSON.parse(beforeUpdate).cravings[0], "usedConfirmedAt"),
      ).toBe(false);
    currentGuardChecks.push(
      "an explicitly marked craving survives worker activation in byte-identical saved storage, retaining its confirmation timestamp when supported and never backfilling older markers",
    );
  }
  await expect(
    page.getByRole("radio", { name: "Amber", exact: true }),
  ).toBeChecked();
  if (legacyMoment) {
    const upgradedMoment = await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem("anchor.app.data.v1")).moments.find(
          (moment) => moment.id === id,
        ),
      legacyMoment.id,
    );
    expect(upgradedMoment).toEqual(legacyMoment);
    expect(Object.hasOwn(upgradedMoment.before, "emotionRatings")).toBe(false);
    expect(Object.hasOwn(upgradedMoment.after, "emotionRatings")).toBe(false);
    currentGuardChecks.push(
      "historical before/after EIS and unscored emotion labels survive unchanged without invented emotion scores",
    );
  }

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
  ).toBe(JSON.parse(beforeUpdate).cravings.length);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.drafts.v1")),
  ).toBe(paletteDraft);
  await page.goto("http://127.0.0.1:8801/Anchor/#/craving/new");
  await expect(page.getByLabel(/^Gedachte/)).toHaveValue(paletteDraftText);
  const combinedSubstances = ["Cocaine", "Fictief tweede middel"];
  await page
    .getByRole("combobox", { name: "Middel of gedrag", exact: true })
    .selectOption(combinedSubstances[0]);
  await page
    .getByRole("button", { name: "Nog een middel toevoegen", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Middel of gedrag 2", exact: true })
    .selectOption("__custom__");
  await page
    .getByLabel("Naam van middel of gedrag 2", { exact: true })
    .fill(combinedSubstances[1]);
  await page
    .getByRole("button", { name: "Craving opslaan", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/today$/);
  const beforeUseMarker = JSON.parse(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  );
  expect(
    Object.hasOwn(beforeUseMarker.cravings.at(-1), "usedAfterCraving"),
  ).toBe(false);
  expect(
    Object.hasOwn(beforeUseMarker.cravings.at(-1), "usedConfirmedAt"),
  ).toBe(false);
  const confirmationStartedAt = await page.evaluate(() => Date.now());
  await page
    .getByRole("button", { name: "Gebruikt aangeven", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Markering verwijderen", exact: true }),
  ).toBeVisible();
  const finalRaw = await page.evaluate(() =>
    localStorage.getItem("anchor.app.data.v1"),
  );
  const finalState = JSON.parse(finalRaw);
  const combinedCraving = finalState.cravings.at(-1);
  expect(combinedCraving.usedAfterCraving).toBe(true);
  expectConfirmationInstant(
    combinedCraving.usedConfirmedAt,
    confirmationStartedAt,
    await page.evaluate(() => Date.now()),
  );
  const confirmation = page.getByRole("group", {
    name: "Gebruik na craving",
    exact: true,
  });
  await expect(confirmation.locator("time")).toHaveAttribute(
    "datetime",
    combinedCraving.usedConfirmedAt,
  );
  await expect(confirmation).toContainText("Bevestigd op");
  await expect(confirmation).toContainText("na de craving bevestigd.");
  expect(finalState).toEqual({
    ...beforeUseMarker,
    revision: beforeUseMarker.revision + 1,
    cravings: beforeUseMarker.cravings.map((entry) =>
      entry.id === combinedCraving.id
        ? {
            ...entry,
            usedAfterCraving: true,
            usedConfirmedAt: combinedCraving.usedConfirmedAt,
          }
        : entry,
    ),
  });
  expect(combinedCraving.substances).toEqual(combinedSubstances);
  expect(Object.hasOwn(combinedCraving, "substance")).toBe(false);
  expect(combinedCraving.thought).toBe(paletteDraftText);
  expect(finalState.cravings.slice(0, -1)).toEqual(
    JSON.parse(afterPalette).cravings,
  );
  expect({
    ...finalState,
    cravings: JSON.parse(afterPalette).cravings,
    revision: JSON.parse(afterPalette).revision,
  }).toEqual(JSON.parse(afterPalette));
  expect(await draftRecords()).toEqual({});
  await go(`/craving/${combinedCraving.id}`);
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Gebruik na craving", exact: true })
      .locator("time"),
  ).toHaveAttribute("datetime", combinedCraving.usedConfirmedAt);
  await expect(
    page.getByRole("button", { name: "Markering verwijderen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Middel of gedrag", exact: true }),
  ).toHaveValue(combinedSubstances[0]);
  await expect(
    page.getByLabel("Naam van middel of gedrag 2", { exact: true }),
  ).toHaveValue(combinedSubstances[1]);
  expect(
    await page.evaluate(() => localStorage.getItem("anchor.app.data.v1")),
  ).toBe(finalRaw);
  await go("/settings");
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back-up downloaden", exact: true })
    .click();
  const backup = await backupDownload;
  const backupPath = path.join(
    directory,
    "multi-substance-offline-backup.json",
  );
  await backup.saveAs(backupPath);
  expect(parseBackup(await readFile(backupPath, "utf8"))).toEqual(finalState);
  currentGuardChecks.push(
    "after activation, offline multi-substance creation with a custom name, save, reload and validated backup preserve all historical records and settings",
    "after activation from every baseline, an explicit use mark is saved through the UI, survives offline reload and is included in the validated backup without assigning use to individual substances",
    "a new confirmation receives a canonical UTC instant bounded by the actual button click, displays its time and elapsed interval, and retains that exact timestamp through offline reload and the validated backup",
  );
  if (useMarkerBaseline) {
    // A normal explicit activation requires resolving drafts first (tested
    // above). Closing the last app page also permits a waiting worker to
    // activate naturally: that path must preserve both saved data and drafts.
    // Use a separate synthetic profile, never force skipWaiting past the guard.
    const lifecycleState = structuredClone(finalState);
    // 1.15.0 supports the true marker, but its strict parser cannot read the
    // new timestamp. Adapt only this isolated pre-update fixture, never the
    // actual main-profile data or byte-equality assertions above.
    if (!useConfirmationTimeBaseline)
      for (const craving of lifecycleState.cravings)
        delete craving.usedConfirmedAt;
    const lifecycleRaw = useConfirmationTimeBaseline
      ? finalRaw
      : JSON.stringify(lifecycleState);
    const lifecycleCraving = lifecycleState.cravings.find(
      (entry) => entry.id === combinedCraving.id,
    );
    const lifecycleContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    let lifecyclePage = await lifecycleContext.newPage();
    const observeErrors = (target) =>
      target.on("pageerror", (error) =>
        errors.push(`marked-draft: ${error.message}`),
      );
    observeErrors(lifecyclePage);
    try {
      root = path.resolve(`${directory}/update-a`);
      await lifecyclePage.goto("http://127.0.0.1:8801/Anchor/");
      await lifecyclePage.evaluate(() => navigator.serviceWorker.ready);
      await lifecyclePage.reload();
      await lifecyclePage.waitForFunction(
        () => navigator.serviceWorker.controller,
      );
      await lifecyclePage.evaluate(
        (raw) => localStorage.setItem("anchor.app.data.v1", raw),
        lifecycleRaw,
      );
      // A hash-only navigation does not reload React state after fixture setup.
      await lifecyclePage.reload();
      const route = `http://127.0.0.1:8801/Anchor/#/craving/${lifecycleCraving.id}`;
      await lifecyclePage.goto(route);
      await expect(
        lifecyclePage.getByRole("heading", { name: "Je craving", exact: true }),
      ).toBeVisible();
      const draftText =
        "Gemarkeerd cravingconcept blijft ongewijzigd bij sluiten en bijwerken.";
      await lifecyclePage
        .getByLabel("Gedachte", { exact: true })
        .fill(draftText);
      const markerDraftRaw = await lifecyclePage.evaluate(
        (key) => localStorage.getItem(key),
        draftKey,
      );
      const markerDraft =
        JSON.parse(markerDraftRaw).records[`craving:${lifecycleCraving.id}`];
      expect(markerDraft).toEqual({ ...lifecycleCraving, thought: draftText });
      expect(markerDraft.usedAfterCraving).toBe(true);
      expect(Object.hasOwn(markerDraft, "usedConfirmedAt")).toBe(
        useConfirmationTimeBaseline,
      );
      expect(
        await lifecyclePage.evaluate(() =>
          localStorage.getItem("anchor.app.data.v1"),
        ),
      ).toBe(lifecycleRaw);
      expect(
        await lifecyclePage
          .locator('script[type="module"]')
          .getAttribute("src"),
      ).toBe(originalModule);

      root = path.resolve(`${directory}/update-b`);
      const nextWorkerPromise = lifecycleContext.waitForEvent("serviceworker");
      await lifecyclePage.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration.update();
      });
      const nextWorker = await nextWorkerPromise;
      await expect(
        lifecyclePage.getByRole("button", { name: "Bijwerken", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await lifecyclePage
        .getByRole("button", { name: "Bijwerken", exact: true })
        .click();
      await expect(
        lifecyclePage.getByRole("dialog", {
          name: "Open concepten",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await lifecyclePage.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration()).waiting,
        ),
      ).toBe(true);
      expect(
        await lifecyclePage.evaluate(() =>
          localStorage.getItem("anchor.app.data.v1"),
        ),
      ).toBe(lifecycleRaw);
      expect(
        await lifecyclePage.evaluate(
          (key) => localStorage.getItem(key),
          draftKey,
        ),
      ).toBe(markerDraftRaw);

      await lifecyclePage.close();
      await expect
        .poll(
          () =>
            nextWorker.evaluate(
              () =>
                !self.registration.waiting &&
                self.registration.active?.state === "activated",
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      lifecyclePage = await lifecycleContext.newPage();
      observeErrors(lifecyclePage);
      await lifecyclePage.goto(route);
      await expect(
        lifecyclePage.getByLabel("Gedachte", { exact: true }),
      ).toHaveValue(draftText);
      await expect(
        lifecyclePage.getByRole("button", {
          name: "Markering verwijderen",
          exact: true,
        }),
      ).toBeVisible();
      const restoredConfirmation = lifecyclePage.getByRole("group", {
        name: "Gebruik na craving",
        exact: true,
      });
      if (useConfirmationTimeBaseline)
        await expect(restoredConfirmation.locator("time")).toHaveAttribute(
          "datetime",
          lifecycleCraving.usedConfirmedAt,
        );
      else {
        await expect(restoredConfirmation).toContainText(
          "Bevestigingstijd niet bekend.",
        );
        await expect(restoredConfirmation.locator("time")).toHaveCount(0);
      }
      expect(
        await lifecyclePage
          .locator('script[type="module"]')
          .getAttribute("src"),
      ).toBe(await page.locator('script[type="module"]').getAttribute("src"));
      expect(
        await lifecyclePage.evaluate(() =>
          localStorage.getItem("anchor.app.data.v1"),
        ),
      ).toBe(lifecycleRaw);
      expect(
        await lifecyclePage.evaluate(
          (key) => localStorage.getItem(key),
          draftKey,
        ),
      ).toBe(markerDraftRaw);
      await lifecycleContext.setOffline(true);
      await lifecyclePage.reload();
      await expect(
        lifecyclePage.getByLabel("Gedachte", { exact: true }),
      ).toHaveValue(draftText);
      expect(
        await lifecyclePage.evaluate(() =>
          localStorage.getItem("anchor.app.data.v1"),
        ),
      ).toBe(lifecycleRaw);
      expect(
        await lifecyclePage.evaluate(
          (key) => localStorage.getItem(key),
          draftKey,
        ),
      ).toBe(markerDraftRaw);
      currentGuardChecks.push(
        "a marked saved craving and marked edit draft survive natural worker activation after closing the last app page, then an offline reopen, with both storage strings byte-identical; the explicit update button correctly blocks while the draft is open",
        useConfirmationTimeBaseline
          ? "saved and draft confirmation timestamps survive natural current-to-current activation byte-exactly"
          : "older marked records and drafts retain unknown confirmation times after natural activation without invented timestamps",
      );
    } catch (error) {
      await lifecyclePage
        .screenshot({
          path: `${directory}/marked-draft-failure.png`,
          fullPage: true,
        })
        .catch(() => {});
      throw error;
    } finally {
      await lifecycleContext.close();
      root = path.resolve(`${directory}/update-b`);
    }
  }
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
    savedRecords: finalState.cravings.length,
    recordsBeforeUpdate: JSON.parse(beforeUpdate).cravings.length,
    recordCounts: Object.fromEntries(
      ["cravings", "moments", "days", "goals", "growth"].map((kind) => [
        kind,
        finalState[kind].length,
      ]),
    ),
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
