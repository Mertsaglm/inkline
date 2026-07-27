import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  PROJECT_ROOT,
  allSourceFiles,
  exists,
  migrationFiles,
  read,
  readAll,
  readMigrations,
  sourceFiles,
  stripComments,
} from "../helpers/source";

/**
 * ============================================================================
 *  AGENTS.md kurallarının ÇALIŞTIRILABİLİR hâli.
 *
 *  Buradaki her test, projeyi tanımayan birinin (ya da bir modelin) sessizce
 *  bozabileceği bir kuralı koruyor. Bunlar üslup tercihi değil: her biri ya
 *  daha önce yaşanmış bir hatanın ya da AGENTS.md'de açıkça yazılmış bir
 *  sınırın karşılığı.
 *
 *  Bir test kırmızıya döndüyse önce AGENTS.md'yi oku. Kuralı gerçekten
 *  değiştirmek istiyorsan AGENTS.md'yi ve testi BİRLİKTE güncelle —
 *  testi tek başına silmek, kuralın var olduğunu unutturur.
 * ============================================================================
 */

const AI_ROUTES = [
  "app/api/ai/assist/route.ts",
  "app/api/ai/check/route.ts",
  "app/api/ai/coach/route.ts",
  "app/api/ai/diagnostic/route.ts",
  "app/api/ai/grade/route.ts",
  "app/api/ai/topics/route.ts",
];

const ALL_ROUTES = [
  ...AI_ROUTES,
  "app/api/essays/route.ts",
  "app/api/feedback/route.ts",
];

describe("Tailwind v4 — CSS-first yapılandırma", () => {
  it("tailwind.config.* dosyası YOKTUR (tokenlar globals.css'te)", () => {
    for (const name of [
      "tailwind.config.js",
      "tailwind.config.ts",
      "tailwind.config.mjs",
      "tailwind.config.cjs",
    ]) {
      expect(exists(name), `${name} geri gelmiş — v4'te token'lar @theme içinde`).toBe(
        false,
      );
    }
  });

  it("tokenlar `@theme inline` bloğunda tanımlıdır", () => {
    expect(read("app/globals.css")).toMatch(/@theme\s+inline\s*\{/);
  });

  /**
   * Tailwind v4'te elle yazılmış `@layer base/components/utilities` blokları
   * derlenen CSS'ten SESSİZCE düşüyor — hata yok, stil de yok. Bu yüzden
   * özel sınıflar katmansız yazılıyor. Bir stil uygulanmıyorsa ilk bakılacak
   * yer burasıdır (bkz. AGENTS.md).
   */
  it("elle yazılmış @layer bloğu YOKTUR (sessizce düşer)", () => {
    const css = read("app/globals.css");
    const layers = [...css.matchAll(/@layer\s+(base|components|utilities)\s*\{/g)];
    expect(
      layers.map((m) => m[0]),
      "@layer bloğu bulundu — içindeki stiller derlenen CSS'e HİÇ girmez",
    ).toEqual([]);
  });
});

describe("Tema — açık tema varsayılan, karanlık sadece .dark sınıfıyla", () => {
  it("`dark` varyantı .dark sınıfına bağlıdır", () => {
    expect(read("app/globals.css")).toMatch(
      /@custom-variant\s+dark\s*\(&:where\(\.dark, \.dark \*\)\)/,
    );
  });

  /**
   * `prefers-color-scheme` bilinçli olarak hiçbir yerde okunmuyor: kullanıcı
   * temayı kendisi seçiyor ve seçim localStorage'da. Tek istisna
   * `app/icon.svg` — o tarayıcı arayüzünde duruyor, bizim sayfamızda değil.
   */
  it("prefers-color-scheme kaynak kodda hiç KULLANILMAZ", () => {
    const offenders: string[] = [];
    for (const [file, content] of readAll([
      ...allSourceFiles(),
      "app/globals.css",
    ])) {
      // Yorumlarda geçmesi serbest — kuralın *neden* var olduğu orada anlatılıyor.
      if (/prefers-color-scheme/.test(stripComments(content))) offenders.push(file);
    }
    expect(
      offenders,
      "Sistem teması danışılmamalı; karanlık tema yalnızca <html class='dark'>",
    ).toEqual([]);
  });

  /** Kuralın gerekçesi kaynakta yazılı kalsın — silinirse sebebi unutulur. */
  it("kuralın gerekçesi globals.css ve ThemeToggle yorumlarında yazılıdır", () => {
    expect(read("app/globals.css")).toMatch(/prefers-color-scheme/);
    expect(read("components/ThemeToggle.tsx")).toMatch(/prefers-color-scheme/);
  });

  it("app/icon.svg tek istisnadır ve hâlâ tarayıcı arayüzünde durur", () => {
    if (!exists("app/icon.svg")) return;
    expect(read("app/icon.svg")).toContain("prefers-color-scheme");
  });

  it("tema betiği ve düğme aynı localStorage anahtarını kullanır", () => {
    expect(read("app/layout.tsx")).toContain("ink-theme");
    expect(read("components/ThemeToggle.tsx")).toContain("ink-theme");
  });

  it("tema betiği yalnızca 'dark' değerinde sınıfı ekler", () => {
    expect(read("app/layout.tsx")).toMatch(
      /localStorage\.getItem\('ink-theme'\)==='dark'/,
    );
  });
});

describe("AI erişimi — tek giriş noktası", () => {
  /**
   * Model zinciri, yedekleme, sağlayıcı başına düşünme bütçesi ve "cevabı
   * hangi model verdi" bilgisi provider.ts'e ait. Bir route doğrudan
   * @ai-sdk kullanırsa bunların HEPSİNİ kaybeder — ve kayıp sessizdir.
   */
  it("@ai-sdk/* ve `ai` paketini SADECE lib/ai/provider.ts import eder", () => {
    const offenders: string[] = [];
    for (const [file, content] of readAll(allSourceFiles())) {
      if (file === "lib/ai/provider.ts") continue;
      const code = stripComments(content);
      if (/from\s+["']@ai-sdk\//.test(code)) offenders.push(`${file} (@ai-sdk)`);
      if (/from\s+["']ai["']/.test(code)) offenders.push(`${file} (ai)`);
    }
    expect(
      offenders,
      "Her AI çağrısı generateAiObject() üzerinden geçmeli (AGENTS.md)",
    ).toEqual([]);
  });

  it("her AI route'u generateAiObject'i provider'dan alır", () => {
    for (const route of AI_ROUTES) {
      const code = read(route);
      expect(code, `${route} generateAiObject kullanmıyor`).toMatch(
        /generateAiObject/,
      );
      expect(code, `${route} provider'dan import etmiyor`).toMatch(
        /from\s+["']@\/lib\/ai\/provider["']/,
      );
    }
  });

  /** Yeni AI route'u = şema + prompt + tek giriş noktası (AGENTS.md). */
  it("her AI route'u şemasını lib/ai/schemas'tan, prompt'unu lib/ai/prompts'tan alır", () => {
    for (const route of AI_ROUTES) {
      const code = read(route);
      expect(code, `${route} şemayı yerinde tanımlıyor olabilir`).toMatch(
        /from\s+["']@\/lib\/ai\/schemas["']/,
      );
      expect(code, `${route} prompt'u yerinde yazıyor olabilir`).toMatch(
        /from\s+["']@\/lib\/ai\/prompts["']/,
      );
    }
  });

  it("hiçbir route prompt metnini kendi içinde kurmaz", () => {
    for (const route of AI_ROUTES) {
      const code = stripComments(read(route));
      expect(
        /You are a|--- TEXT ---|--- ESSAY ---/.test(code),
        `${route} içinde gömülü prompt metni var — lib/ai/prompts.ts'e taşı`,
      ).toBe(false);
    }
  });

  /**
   * Vercel'de varsayılan süre sınırı AI çağrısı için kısa kalabiliyor.
   * Notlama ve koçluk uzun (60 sn), diğerleri 30 sn.
   */
  it("her AI route'u maxDuration bildirir", () => {
    const expected: Record<string, number> = {
      "app/api/ai/assist/route.ts": 30,
      "app/api/ai/check/route.ts": 30,
      "app/api/ai/coach/route.ts": 60,
      "app/api/ai/diagnostic/route.ts": 30,
      "app/api/ai/grade/route.ts": 60,
      "app/api/ai/topics/route.ts": 30,
    };
    for (const [route, seconds] of Object.entries(expected)) {
      expect(read(route), `${route} maxDuration bildirmiyor`).toMatch(
        new RegExp(`export const maxDuration = ${seconds}`),
      );
    }
  });
});

describe("Kimlik doğrulama — anonim ve otomatik", () => {
  /**
   * Giriş ekranı YOKTUR ve eklenmemelidir. RLS gerçek bir auth.uid()'ye
   * dayanıyor; onu proxy.ts her istekte anonim girişle sağlıyor.
   */
  it("giriş/kayıt sayfası yoktur", () => {
    for (const dir of [
      "app/login",
      "app/signin",
      "app/sign-in",
      "app/signup",
      "app/register",
      "app/auth",
      "app/(auth)",
    ]) {
      expect(exists(dir), `${dir} eklenmiş — anonim auth bozulur`).toBe(false);
    }
  });

  it("parola / OAuth / e-posta giriş çağrısı yoktur", () => {
    const forbidden =
      /signInWithPassword|signInWithOAuth|signInWithOtp|signInWithIdToken|\.signUp\(/;
    const offenders = allSourceFiles().filter((file) =>
      forbidden.test(stripComments(read(file))),
    );
    expect(offenders, "Anonim auth dışında giriş yöntemi eklenmiş").toEqual([]);
  });

  it("proxy her istekte oturumu yeniler ve gerekiyorsa anonim giriş yapar", () => {
    const middleware = read("lib/supabase/middleware.ts");
    expect(middleware).toMatch(/auth\.getUser\(\)/);
    expect(middleware).toMatch(/signInAnonymously\(\)/);
  });

  /** Next 16'da `middleware.ts` → `proxy.ts` olarak yeniden adlandırıldı. */
  it("proxy.ts kökte durur, eski middleware.ts geri gelmemiştir", () => {
    expect(exists("proxy.ts")).toBe(true);
    expect(exists("middleware.ts")).toBe(false);
    expect(read("proxy.ts")).toMatch(/export async function proxy\(/);
  });

  it("proxy statik dosyalar dışındaki tüm yollarda çalışır", () => {
    const code = read("proxy.ts");
    expect(code).toMatch(/matcher/);
    expect(code).toMatch(/_next\/static/);
  });

  /** Oturumsuz istekte hiçbir route veri sızdırmamalı. */
  it("her route ensureProfile ile oturumu doğrular ve 401 döner", () => {
    for (const route of ALL_ROUTES) {
      const code = read(route);
      expect(code, `${route} ensureProfile çağırmıyor`).toMatch(
        /ensureProfile\(\)/,
      );
      expect(code, `${route} oturumsuz istekte 401 dönmüyor`).toMatch(
        /status:\s*401/,
      );
    }
  });

  it("hiçbir route istemcinin gönderdiği user_id'ye güvenmez", () => {
    for (const route of ALL_ROUTES) {
      const code = stripComments(read(route));
      const assignments = [...code.matchAll(/user_id:\s*([^,\n]+)/g)].map(
        (m) => m[1].trim(),
      );
      for (const value of assignments) {
        expect(
          value,
          `${route} içinde user_id doğrudan gövdeden alınıyor: ${value}`,
        ).toMatch(/ctx\.userId|user\.id/);
      }
    }
  });
});

describe("Arayüz dili — Türkçe", () => {
  it("<html lang=\"tr\"> ile işaretlenmiştir", () => {
    expect(read("app/layout.tsx")).toMatch(/lang="tr"/);
  });

  /**
   * Tarihler öğrenciye Türkçe biçimde gösteriliyor. Locale'i unutmak
   * (`toLocaleDateString()`) çalıştığı sunucunun diline göre değişen,
   * fark edilmesi zor bir hataya yol açar.
   */
  it("tüm tarih biçimlendirmeleri tr-TR locale'i ile yapılır", () => {
    const offenders: string[] = [];
    for (const [file, content] of readAll(allSourceFiles())) {
      for (const match of content.matchAll(
        /toLocale(?:Date|Time)?String\(([^)]*)/g,
      )) {
        if (!/["']tr-TR["']/.test(match[1])) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders, "Locale'siz tarih biçimlendirme").toEqual([]);
  });

  it("kullanıcıya dönen route hataları Türkçedir", () => {
    // Hata metinleri arayüzde ham gösteriliyor (`data.error`).
    const messages: string[] = [];
    for (const route of ALL_ROUTES) {
      for (const match of read(route).matchAll(/error:\s*"([^"]+)"/g)) {
        messages.push(match[1]);
      }
    }
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      // İngilizce kalıpların hiçbiri geçmemeli.
      expect(
        /\b(not found|unauthorized|failed|error occurred|invalid|required|too short)\b/i.test(
          message,
        ),
        `İngilizce hata mesajı: "${message}"`,
      ).toBe(false);
    }
  });
});

describe("Sayfalar — render stratejisi", () => {
  /**
   * Bu sayfalar her istekte kullanıcıya özel veri okuyor. `force-dynamic`
   * düşerse Next build sırasında sayfayı statikleştirmeye çalışır ve
   * kullanıcılar birbirinin verisini görebilir.
   */
  it("kullanıcıya özel veri okuyan sayfalar force-dynamic'tir", () => {
    for (const page of [
      "app/page.tsx",
      "app/write/page.tsx",
      "app/onboarding/page.tsx",
      "app/progress/page.tsx",
      "app/settings/page.tsx",
      "app/essays/page.tsx",
    ]) {
      expect(read(page), `${page} force-dynamic değil`).toMatch(
        /export const dynamic = "force-dynamic"/,
      );
    }
  });

  it("env yoksa sayfalar çökmek yerine SetupNotice gösterir", () => {
    for (const page of [
      "app/page.tsx",
      "app/write/page.tsx",
      "app/onboarding/page.tsx",
      "app/progress/page.tsx",
      "app/settings/page.tsx",
      "app/essays/page.tsx",
      "app/essays/[id]/page.tsx",
      "app/essays/[id]/edit/page.tsx",
    ]) {
      const code = read(page);
      expect(code, `${page} supabaseConfigured kapısı yok`).toMatch(
        /supabaseConfigured\(\)/,
      );
      expect(code, `${page} SetupNotice göstermiyor`).toMatch(/SetupNotice/);
    }
  });
});

describe("Sırlar — kaynakta asla bulunmaz", () => {
  const SECRET_PATTERNS: [RegExp, string][] = [
    [/sk-[A-Za-z0-9_-]{20,}/, "OpenAI anahtarı"],
    [/AIza[A-Za-z0-9_-]{30,}/, "Google API anahtarı"],
    [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}/, "JWT (Supabase anahtarı)"],
    [/service_role/i, "service_role anahtarı"],
  ];

  it("kaynak dosyalarda anahtar deseni yoktur", () => {
    const offenders: string[] = [];
    for (const [file, content] of readAll([
      ...allSourceFiles(),
      "app/globals.css",
      ".env.example",
    ])) {
      for (const [pattern, label] of SECRET_PATTERNS) {
        if (pattern.test(content)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /** Şablonun değerleri BOŞ kalmalı — sahibi anahtarları kendisi giriyor. */
  it(".env.example'daki gizli değişkenlerin değeri boştur", () => {
    const template = read(".env.example");
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
    ]) {
      const match = new RegExp(`^${name}=(.*)$`, "m").exec(template);
      expect(match, `${name} .env.example'da yok`).not.toBeNull();
      expect(match![1].trim(), `${name} bir değer içeriyor`).toBe("");
    }
  });

  it("kaynak kod .env dosyalarını okumaya çalışmaz", () => {
    const offenders = allSourceFiles().filter((file) =>
      /readFile|readFileSync/.test(stripComments(read(file))),
    );
    expect(offenders, "Kaynakta dosya okuma — .env.local sızma riski").toEqual([]);
  });

  it("AI anahtarları yalnızca sunucuda okunur (NEXT_PUBLIC_ ile sızmaz)", () => {
    const provider = read("lib/ai/provider.ts");
    expect(provider).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(?:API_KEY|OPENAI|GEMINI)/);
    // Sağlayıcı modülü istemci bileşeni OLMAMALI.
    expect(provider).not.toMatch(/^"use client"/m);
  });

  it("AI çağrısı yapan hiçbir modül istemci bileşeni değildir", () => {
    for (const route of AI_ROUTES) {
      expect(read(route), `${route} "use client" içeriyor`).not.toMatch(
        /^"use client"/m,
      );
    }
  });

  it("okunan her env değişkeni .env.example'da belgelenmiştir", () => {
    const template = read(".env.example");
    const names = new Set<string>();
    for (const [, content] of readAll(allSourceFiles())) {
      for (const match of content.matchAll(/process\.env\.([A-Z0-9_]+)/g))
        names.add(match[1]);
      for (const match of content.matchAll(/\benv\("([A-Z0-9_]+)"\)/g))
        names.add(match[1]);
    }
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(template, `${name} .env.example'da belgelenmemiş`).toContain(name);
    }
  });
});

describe("Yerel klasörler gitignore'da kalır", () => {
  function isIgnored(relPath: string) {
    const result = spawnSync("git", ["check-ignore", "-q", relPath], {
      cwd: PROJECT_ROOT,
    });
    return result.status === 0;
  }

  /**
   * `Proje Yardımcısı - inkline/` kişisel notlar tutuyor; `gereksiz/` tasarım
   * ara çıktıları. Kural glob olarak yazıldı çünkü tam ada bağlı bir giriş,
   * klasör yeniden adlandırıldığı anda sessizce eşleşmeyi bırakır — ve tek
   * `git add .` içeriği yayımlar (bkz. AGENTS.md).
   */
  it(".gitignore glob kuralları yerinde durur", () => {
    const gitignore = read(".gitignore");
    expect(gitignore).toContain("/gereksiz/");
    expect(gitignore).toMatch(/^\/Proje Yardımcısı\*\/$/m);
  });

  it("git bu yolları gerçekten yok sayar", () => {
    expect(isIgnored("gereksiz/anything.png")).toBe(true);
    expect(isIgnored("Proje Yardımcısı - inkline/notlar.md")).toBe(true);
    expect(isIgnored("Proje Yardımcısı - baska-isim/notlar.md")).toBe(true);
  });

  it(".env.local ve türevleri yok sayılır, .env.example izlenir", () => {
    expect(isIgnored(".env.local")).toBe(true);
    expect(isIgnored(".env.production")).toBe(true);
    expect(isIgnored(".env.example")).toBe(false);
  });

  it("izlenen dosyalar arasında yerel klasörlerden hiçbiri yoktur", () => {
    const tracked = spawnSync("git", ["ls-files"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    const files = (tracked.stdout ?? "").split("\n");
    const leaked = files.filter(
      (f) => f.startsWith("gereksiz/") || f.startsWith("Proje Yardımcısı"),
    );
    expect(leaked, "Yerel klasör dosyaları git'e girmiş").toEqual([]);
    expect(files.filter((f) => /^\.env(\.|$)/.test(f) && f !== ".env.example")).toEqual([]);
  });
});

describe("Veritabanı göçleri", () => {
  it("numaralı ve sıralıdır", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    files.forEach((file, index) => {
      expect(file, `${file} 0001_ad.sql biçiminde değil`).toMatch(
        /^\d{4}_[a-z0-9_]+\.sql$/,
      );
      expect(
        Number(file.slice(0, 4)),
        `${file} sıra numarası atlamış`,
      ).toBe(index + 1);
    });
  });

  /** Göçler elle çalıştırılıyor ve geri alınamaz — yıkıcı ifade olmamalı. */
  it("yıkıcı ifade içermez", () => {
    const sql = readMigrations().toLowerCase();
    for (const statement of [
      "drop table",
      "drop schema",
      "drop database",
      "truncate",
      "drop column",
    ]) {
      expect(sql, `Göçlerde "${statement}" var`).not.toContain(statement);
    }
  });

  it("her tablo için RLS açıktır", () => {
    const sql = readMigrations();
    const tables = [
      ...sql.matchAll(/create table if not exists public\.(\w+)/g),
    ].map((m) => m[1]);

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(
        sql,
        `public.${table} için RLS açılmamış — herkes herkesin verisini görür`,
      ).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      );
    }
  });

  it("her tablonun politikaları auth.uid() ile sınırlandırılmıştır", () => {
    const sql = readMigrations();
    const tables = [
      ...sql.matchAll(/create table if not exists public\.(\w+)/g),
    ].map((m) => m[1]);

    for (const table of tables) {
      const policies = [
        ...sql.matchAll(new RegExp(`create policy[^;]*on public\\.${table}[^;]*;`, "g")),
      ].map((m) => m[0]);
      expect(policies.length, `public.${table} için politika yok`).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(
          policy,
          `public.${table} politikası auth.uid() kullanmıyor: ${policy}`,
        ).toContain("auth.uid()");
      }
    }
  });

  it("yeni kullanıcı için profil trigger'ı tanımlıdır", () => {
    const sql = readMigrations();
    expect(sql).toMatch(/create trigger on_auth_user_created/);
    expect(sql).toMatch(/insert into public\.profiles/);
  });
});

describe("Proje yapısı", () => {
  it("test dosyaları uygulama kodunun içine karışmaz", () => {
    const strays = sourceFiles({ includeTests: true }).filter((file) =>
      /\.(test|spec)\.(ts|tsx)$/.test(file),
    );
    expect(strays, "Testler tests/ altında durmalı").toEqual([]);
  });

  it("app/api altındaki her route dosyası bir HTTP metodu dışa verir", () => {
    for (const route of sourceFiles({ roots: ["app/api"] })) {
      expect(read(route), `${route} POST/GET dışa vermiyor`).toMatch(
        /export async function (POST|GET|PUT|PATCH|DELETE)/,
      );
    }
  });

  it("bilinen route listesi diskteki dosyalarla aynıdır", () => {
    // Yeni bir route eklendiğinde bu test, kurallara dahil etmeyi hatırlatır.
    expect(sourceFiles({ roots: ["app/api"] }).sort()).toEqual(
      [...ALL_ROUTES].sort(),
    );
  });
});
