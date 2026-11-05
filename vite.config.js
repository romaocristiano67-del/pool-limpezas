import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const htmlEntry = fileURLToPath(new URL("./index.html", import.meta.url));

function readLegacyEnv() {
  const legacyEnvPath = new URL("./env.local", import.meta.url);
  if (!existsSync(legacyEnvPath)) return {};

  return Object.fromEntries(
    readFileSync(legacyEnvPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      const separator = line.indexOf("=");
      if (separator < 0) return ["", ""];
      return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
    }).filter(([key]) => key),
  );
}

function readSupabaseConfig(mode) {
  const env = loadEnv(mode, root, "");
  const legacy = readLegacyEnv();
  const rawUrl = env.VITE_SUPABASE_URL || legacy["api ur"];
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || legacy["chave publica"];

  if (!rawUrl || !publishableKey) {
    throw new Error(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) nas variáveis do ambiente.",
    );
  }

  const url = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  return { url, publishableKey };
}

export default defineConfig(({ mode }) => {
  const supabase = readSupabaseConfig(mode);

  return {
    root,
    define: {
      __SUPABASE_URL__: JSON.stringify(supabase.url),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabase.publishableKey),
    },
    build: {
      rollupOptions: { input: htmlEntry },
    },
  };
});