import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Kaynak dosyaları okuyup gezen yardımcılar.
 *
 * `tests/contracts/*` bunları kullanır: bazı kurallar tip sistemiyle
 * yakalanamıyor (ör. "hiçbir route doğrudan @ai-sdk import etmesin"),
 * bu yüzden kaynak metnin kendisi denetleniyor.
 */

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "gereksiz",
  "public",
  "design",
  "scripts",
  ".claude",
  ".vercel",
]);

export function projectPath(...parts: string[]) {
  return join(PROJECT_ROOT, ...parts);
}

export function read(relPath: string): string {
  return readFileSync(projectPath(relPath), "utf8");
}

export function exists(relPath: string): boolean {
  try {
    statSync(projectPath(relPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Uygulama kaynağındaki dosyaları listeler (proje köküne göreli, `/` ayraçlı).
 * `gereksiz/`, `Proje Yardımcısı…`, `node_modules` ve testler dışarıda kalır.
 */
export function sourceFiles(
  options: {
    extensions?: string[];
    roots?: string[];
    includeTests?: boolean;
  } = {},
): string[] {
  const extensions = options.extensions ?? [".ts", ".tsx"];
  const roots = options.roots ?? ["app", "components", "lib"];
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith("Proje Yardımcısı")) continue;
        if (!options.includeTests && entry.name === "tests") continue;
        walk(full);
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      out.push(relative(PROJECT_ROOT, full).split(sep).join("/"));
    }
  };

  for (const root of roots) {
    const dir = projectPath(root);
    try {
      if (statSync(dir).isDirectory()) walk(dir);
    } catch {
      // Kök yoksa atla.
    }
  }
  return out.sort();
}

/** Kök seviyedeki tek dosyaları da içeren tam kaynak listesi. */
export function allSourceFiles(): string[] {
  const rootFiles = ["proxy.ts", "next.config.ts"].filter(exists);
  return [...sourceFiles(), ...rootFiles].sort();
}

/** `relPath → içerik` haritası. */
export function readAll(paths: string[]): Map<string, string> {
  return new Map(paths.map((p) => [p, read(p)]));
}

/** Satır ve içerik çiftleri — hata mesajlarında yer göstermek için. */
export function linesOf(content: string): { line: number; text: string }[] {
  return content.split("\n").map((text, i) => ({ line: i + 1, text }));
}

/**
 * Blok yorumlarını ve `//` satırlarını kabaca siler. "Kaynakta bu ifade
 * geçmesin" testlerinde, kuralın *neden* var olduğunu anlatan yorumların
 * testi kırmasını engeller.
 */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

export function migrationFiles(): string[] {
  const dir = projectPath("supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export function readMigrations(): string {
  return migrationFiles()
    .map((f) => readFileSync(join(projectPath("supabase/migrations"), f), "utf8"))
    .join("\n");
}
