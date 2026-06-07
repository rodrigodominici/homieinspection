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
        // Pre-cache all Vite-generated JS/CSS/HTML (including hashed filenames)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Supabase API — always try network first, fallback to cache
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: "NetworkFirst" as const,
            options: {
              cacheName: "supabase-api",
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
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) {
            return "vendor-recharts";
          }
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
          if (
            id.includes("node_modules/date-fns/") ||
            id.includes("node_modules/lucide-react/") ||
            id.includes("node_modules/zod/") ||
            id.includes("node_modules/react-hook-form/") ||
            id.includes("node_modules/@hookform/")
          ) {
            return "vendor-misc";
          }
        },
      },
    },
  },
}));
