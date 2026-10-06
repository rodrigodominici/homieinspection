import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Build identity. Injected into the bundle and also emitted as `/version.json`
// so a long-lived tab (or the installed PWA) can detect it is running a stale
// build even when the service worker already took control.
const APP_VERSION = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/**
 * Emits `/version.json` alongside the bundle. Not matched by the service worker
 * precache globs, so clients always fetch it from the network.
 */
function versionFilePlugin(): Plugin {
  return {
    name: "app-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

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
    mode === "development" && componentTagger(),
    versionFilePlugin(),
  ].filter(Boolean),
  define: {
    // Build identity, sent with every diagnostic event so we can tell whether a
    // failing client is running a stale build.
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
