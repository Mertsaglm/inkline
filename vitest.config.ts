import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test yapılandırması.
 *
 * Ortam varsayılan olarak `node`'dur — API route ve saf kütüphane testleri
 * DOM istemez. DOM gerektiren dosyalar kendi başlarına
 * `// @vitest-environment jsdom` satırıyla ortamı seçer. (Global jsdom,
 * route testlerinde `Request`/`Response` global'lerini bozabiliyor.)
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    // Tarihler `tr-TR` ile biçimleniyor; saat dilimi sabitlenmezse
    // testler geliştiricinin makinesine göre farklı gün gösterir.
    env: { TZ: "UTC" },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    // Her testten sonra spy'ları/mock'ları ve stub'lanan env'i geri al —
    // testler arası sızıntı, bu projede en çok can yakan hata türü olurdu
    // (provider zinciri ve config kapıları env'e bakıyor).
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: [
        "lib/**/*.ts",
        "app/api/**/*.ts",
        "app/**/*.tsx",
        "components/**/*.ts",
        "components/**/*.tsx",
        "proxy.ts",
      ],
      exclude: ["**/*.d.ts", "app/layout.tsx", "app/globals.css"],
    },
  },
});
