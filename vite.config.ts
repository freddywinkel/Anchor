import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
const base = process.env.BASE_PATH || "/Anchor/";
const packageVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version as string;
const appVersion = process.env.APP_BUILD || packageVersion;
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    {
      name: "anchor-release-metadata",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release.json",
          source: JSON.stringify({
            app: "Anchor",
            version: appVersion,
            commit: process.env.GITHUB_SHA || null,
          }),
        });
      },
    },
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        id: base,
        name: "Anchor",
        short_name: "Anchor",
        description: "Je dag, je gedachten en wat je helpt.",
        lang: "nl",
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: "#171614",
        background_color: "#171614",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "anchor-app",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json}"],
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [
          new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        ],
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: "127.0.0.1", port: 8800, strictPort: true },
  preview: { host: "127.0.0.1", port: 8800, strictPort: true },
});
