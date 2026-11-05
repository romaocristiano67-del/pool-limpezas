import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const htmlEntry = fileURLToPath(new URL("./Pool Cleaning Construction (1).html", import.meta.url));

function readSupabaseConfig() {
  const contents = readFileSync(new URL("./env.local", import.meta.url), "utf8");
  const values = Object.fromEntries(
    contents.split(/\r?\n/).filter(Boolean).map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
    }),
  );
  const url = values["api ur"];
  const publishableKey = values["chave publica"];

  if (!url || !publishableKey) {
    throw new Error("env.local precisa de 'api ur' e 'chave publica'.");
  }

  return { url, publishableKey };
}

const supabase = readSupabaseConfig();

export default defineConfig({
  root,
  define: {
    __SUPABASE_URL__: JSON.stringify(supabase.url),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabase.publishableKey),
  },
  build: {
    rollupOptions: { input: htmlEntry },
  },
});