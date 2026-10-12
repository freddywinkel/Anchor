import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const directory = path.resolve(process.env.ANCHOR_DIST || "dist");
const base = process.env.BASE_PATH || "/Anchor/";
assert.match(
  base,
  /^\/[A-Za-z0-9/_-]+\/$/,
  "A scoped absolute base path is required",
);
const origin = "https://anchor-verification.invalid";
const root = new URL(base, origin);

function localAsset(reference, relativeTo = root) {
  const url = new URL(reference, relativeTo);
  assert.equal(url.origin, origin, `External asset: ${reference}`);
  assert.ok(
    url.pathname.startsWith(base),
    `Asset escapes app scope: ${reference}`,
  );
  assert.equal(url.search, "", `Unexpected asset query: ${reference}`);
  assert.equal(url.hash, "", `Unexpected asset fragment: ${reference}`);
  const file = path.resolve(
    directory,
    decodeURIComponent(url.pathname.slice(base.length)),
  );
  assert.ok(
    file.startsWith(directory + path.sep),
    `Asset escapes build directory: ${reference}`,
  );
  return { file, url };
}

function pngSize(bytes, label) {
  assert.ok(bytes.length >= 24, `${label}: truncated PNG`);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${label}: PNG signature`,
  );
  assert.equal(
    bytes.toString("ascii", 12, 16),
    "IHDR",
    `${label}: PNG dimensions unavailable`,
  );
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(
  await readFile(path.join(directory, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.name, "Anchor");
assert.equal(manifest.short_name, "Anchor");
assert.equal(manifest.id, base);
assert.equal(manifest.start_url, base);
assert.equal(manifest.scope, base);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.lang, "nl");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
assert.ok(
  manifest.icons.some((icon) => icon.purpose?.split(" ").includes("maskable")),
);
const icons = [];
for (const icon of manifest.icons) {
  assert.equal(icon.type, "image/png");
  const size = pngSize(await readFile(localAsset(icon.src).file), icon.src);
  assert.equal(
    size,
    icon.sizes,
    `${icon.src}: actual PNG size differs from manifest`,
  );
  icons.push({ src: icon.src, size, purpose: icon.purpose || "any" });
}
const appleSize = pngSize(
  await readFile(localAsset("apple-touch-icon.png").file),
  "apple-touch-icon.png",
);
assert.equal(appleSize, "180x180");

const html = await readFile(path.join(directory, "index.html"), "utf8");
assert.match(html, /<title>Anchor<\/title>/);
assert.match(html, /<html\s+lang="nl"/);
assert.match(html, /connect-src 'self'/);
assert.match(html, /worker-src 'self'/);
const references = [
  ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g),
].map((match) => match[1]);
assert.ok(references.includes(`${base}manifest.webmanifest`));
assert.ok(
  references.some(
    (reference) =>
      reference.startsWith(`${base}assets/`) && reference.endsWith(".js"),
  ),
);
for (const reference of references)
  assert.ok((await stat(localAsset(reference).file)).isFile());

const worker = await readFile(path.join(directory, "sw.js"), "utf8");
const captured = {
  cache: null,
  entries: [],
  routes: [],
  dependencies: [],
  listeners: new Map(),
  skipWaitingCalls: 0,
  cleanup: false,
};
const workbox = {
  setCacheNameDetails(value) {
    captured.cache = value;
  },
  clientsClaim() {},
  precacheAndRoute(entries) {
    captured.entries = entries;
  },
  cleanupOutdatedCaches() {
    captured.cleanup = true;
  },
  createHandlerBoundToURL(url) {
    return { fallback: url };
  },
  NavigationRoute: class {
    constructor(handler, options) {
      this.handler = handler;
      this.options = options;
    }
  },
  registerRoute(route) {
    captured.routes.push(route);
  },
};
const self = {
  define() {},
  addEventListener(type, listener) {
    const current = captured.listeners.get(type) || [];
    captured.listeners.set(type, [...current, listener]);
  },
  skipWaiting() {
    captured.skipWaitingCalls += 1;
  },
};
// Generated app code only; the sandbox has no filesystem, network or real worker.
vm.runInNewContext(
  worker,
  {
    self,
    define(dependencies, factory) {
      captured.dependencies.push(...dependencies);
      factory(workbox);
    },
  },
  { timeout: 1000, codeGeneration: { strings: false, wasm: false } },
);
assert.equal(captured.cache?.prefix, "anchor-app");
assert.equal(
  captured.skipWaitingCalls,
  0,
  "Worker must wait for an explicit update message",
);
for (const listener of captured.listeners.get("message") || [])
  listener({ data: { type: "UNRELATED_MESSAGE" } });
assert.equal(captured.skipWaitingCalls, 0);
for (const listener of captured.listeners.get("message") || [])
  listener({ data: { type: "SKIP_WAITING" } });
assert.equal(
  captured.skipWaitingCalls,
  1,
  "Explicit update message must activate the waiting worker",
);
assert.ok(captured.cleanup);
assert.equal(captured.routes.length, 1);
const navigation = captured.routes[0];
assert.equal(navigation.handler.fallback, "index.html");
assert.ok(
  navigation.options.allowlist.some((expression) => expression.test(base)),
);
for (const outside of [
  "/",
  "/substance-recovery/",
  "/MoodTracker/",
  `${base.slice(0, -1)}-other/`,
]) {
  assert.ok(
    !navigation.options.allowlist.some((expression) =>
      expression.test(outside),
    ),
    `Navigation fallback escapes scope: ${outside}`,
  );
}
for (const dependency of captured.dependencies) {
  assert.match(dependency, /^\.\/workbox-[a-zA-Z0-9_-]+$/);
  assert.ok((await stat(localAsset(`${dependency}.js`).file)).isFile());
}
assert.ok(captured.entries.length > 0);
for (const entry of captured.entries) {
  const { file, url } = localAsset(entry.url);
  assert.ok(
    (await stat(file)).isFile(),
    `Missing precached asset: ${entry.url}`,
  );
  if (file.endsWith(".css")) {
    const css = await readFile(file, "utf8");
    assert.ok(
      !/@import\b/i.test(css),
      "CSS must not depend on an imported stylesheet",
    );
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      if (!match[1].startsWith("data:"))
        assert.ok((await stat(localAsset(match[1], url).file)).isFile());
    }
  }
}
const precached = new Set(captured.entries.map((entry) => entry.url));
for (const required of [
  "index.html",
  "manifest.webmanifest",
  "release.json",
  ...manifest.icons.map((icon) => icon.src),
])
  assert.ok(precached.has(required), `${required} must be available offline`);
const release = JSON.parse(
  await readFile(localAsset("release.json").file, "utf8"),
);
assert.equal(release.app, "Anchor");
assert.equal(release.version, process.env.APP_BUILD || packageJson.version);
assert.ok(release.commit === null || /^[a-f0-9]{40}$/i.test(release.commit));
const expectedCommit = process.env.EXPECTED_COMMIT || process.env.GITHUB_SHA;
if (expectedCommit) assert.equal(release.commit, expectedCommit);

const result = {
  passed: true,
  directory,
  base,
  release,
  icons,
  appleSize,
  precachedAssets: precached.size,
  cachePrefix: captured.cache.prefix,
  explicitActivation: true,
  scopeIsolated: true,
};
await mkdir("tmp", { recursive: true });
await writeFile("tmp/pwa-validation.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
