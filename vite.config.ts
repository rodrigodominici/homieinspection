import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Include static assets that should be pre-cached
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon-source.svg"],
      manifest: {
        name: "Homie Inspector",
        short_name: "Homie",
        description: "Inspecciones de inmuebles Homie",
        start_url: "/inspector",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#525EA2",
        icons: [
          { src: "pwa-64x64.png",            sizes: "64x64",   type: "image/png" },
          { src: "pwa-192x192.png",           sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png",           sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // A deploy renames every hashed chunk. Without these three flags a tab
        // (or the installed PWA) keeps the previous app shell alive and then
        // fails to load chunks that no longer exist → blank screen.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Pre-cache the app shell only. Icons / large images are runtime-cached.
        globPatterns: ["**/*.{js,css,html,woff2}", "favicon.ico", "pwa-192x192.png"],
        runtimeCaching: [
          {
            // Supabase Edge Functions + storage — network first, offline fallback.
            // PostgREST (rest/v1) is intentionally NOT cached here because React
            // Query already manages it and stale SW responses can mask writes
            // across tabs.
            urlPattern: /^https:\/\/.*\.supabase\.co\/(functions|storage)\//,
            handler: "NetworkFirst" as const,
            options: {
              cacheName: "supabase-edge",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // Google Fonts — long-lived cache
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "CacheFirst" as const,
            options: {
              cacheName: "google-fonts",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  define: {
    // Build identity, sent with every diagnostic event so we can tell whether a
    // failing client is running a stale build.
    __APP_VERSION__: JSON.stringify(
      `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`,
    ),
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Split heavy vendor libraries into separate cacheable chunks.
        // Rolldown (Vite 8) requires manualChunks to be a function.
        manualChunks(id: string) {
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          if (id.includes("node_modules/@supabase/")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/") ||
            id.includes("node_modules/react-router/")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          if (
            id.includes("node_modules/react-hook-form/") ||
            id.includes("node_modules/@hookform/") ||
            id.includes("node_modules/zod/")
          ) {
            return "vendor-forms";
          }
          if (id.includes("node_modules/date-fns/")) {
            return "vendor-dates";
          }
        },
      },
    },
  },
}));
