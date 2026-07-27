import { describe, it, expect } from "vitest";
import {
  cefrEnum,
  checkSchema,
  diagnosticSchema,
  gradeSchema,
  issueKind,
  issueSeverity,
} from "@/lib/ai/schemas";
import { CEFR_LEVELS } from "@/lib/cefr";
import type {
  EssayStatus,
  FeedbackKind,
  FeedbackSeverity,
  FeedbackSource,
  LevelHistory,
  Profile,
  RubricScores,
} from "@/lib/db/types";
import { read, readMigrations } from "../helpers/source";

/**
 * ============================================================================
 *  Aynı gerçeğin DÖRT kopyası var:
 *
 *    1. SQL CHECK kısıtı        (supabase/migrations/*.sql)
 *    2. TypeScript union tipi   (lib/db/types.ts)
 *    3. Zod enum'u              (lib/ai/schemas.ts)
 *    4. Route içi beyaz liste   (app/api/feedback/route.ts)
 *
 *  Biri değişip diğerleri kalırsa TypeScript hiçbir şey demez: sorun ancak
 *  üretimde, Postgres kısıtı ihlal ettiğinde 500 olarak görünür. Bu dosya
 *  dördünü birbirine bağlıyor.
 *
 *  TypeScript union'ları çalışma anında okunamadığı için, her union'un
 *  değerleri burada elle sayılıyor — `satisfies` ile derleme anında
 *  eksiksizliği de kontrol edilerek.
 * ============================================================================
 */

const MIGRATIONS = readMigrations();

/** Bir tablonun `create table ... ( ... );` gövdesi. */
function tableDdl(table: string): string {
  const pattern = new RegExp(
    `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
  );
  const match = pattern.exec(MIGRATIONS);
  if (!match) throw new Error(`public.${table} için DDL bulunamadı`);
  return match[1];
}

/**
 * `check (kolon in ('a','b'))` kısıtından değerleri çıkarır.
 * `table` verilmezse tüm göçlerde aranır — aynı adlı kolon birden fazla
 * tabloda varsa (ör. `status`) tabloyu MUTLAKA belirt.
 */
function sqlCheckValues(column: string, table?: string): string[] {
  const haystack = table ? tableDdl(table) : MIGRATIONS;
  const pattern = new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, "i");
  const match = pattern.exec(haystack);
  if (!match)
    throw new Error(
      `${table ? `public.${table} içinde ` : ""}"${column} in (...)" kısıtı bulunamadı`,
    );
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("CEFR bandları — SQL domain ↔ TS ↔ Zod", () => {
  it("cefr_level domain'i altı bandı tanımlar", () => {
    expect(sqlCheckValues("value")).toEqual([...CEFR_LEVELS]);
  });

  it("Zod enum'u SQL domain'i ile aynıdır", () => {
    expect(cefrEnum.options).toEqual(sqlCheckValues("value"));
  });

  it("varsayılan seviyeler geçerli bandlardır", () => {
    const current = /current_level cefr_level not null default '(\w+)'/.exec(
      MIGRATIONS,
    );
    const target = /target_level\s+cefr_level not null default '(\w+)'/.exec(
      MIGRATIONS,
    );
    expect(current?.[1]).toBeDefined();
    expect(target?.[1]).toBeDefined();
    expect(CEFR_LEVELS).toContain(current![1] as never);
    expect(CEFR_LEVELS).toContain(target![1] as never);
  });
});

describe("feedback_events.kind — dört kopya aynı olmalı", () => {
  const TS_KINDS = [
    "grammar",
    "vocab",
    "structure",
    "spelling",
    "style",
  ] as const satisfies readonly FeedbackKind[];

  it("SQL CHECK kısıtı TS union'ı ile aynıdır", () => {
    expect(sqlCheckValues("kind")).toEqual([...TS_KINDS]);
  });

  it("Zod issueKind enum'u TS union'ı ile aynıdır", () => {
    expect(issueKind.options).toEqual([...TS_KINDS]);
  });

  /**
   * Route, DB'ye gitmeden önce kendi beyaz listesiyle doğruluyor. Liste
   * eksik kalırsa geçerli bir tür 400 alır; fazla kalırsa Postgres 500 verir.
   */
  it("feedback route'undaki beyaz liste de aynıdır", () => {
    const source = read("app/api/feedback/route.ts");
    const match = /const kinds = \[([^\]]+)\]/.exec(source);
    expect(match, "feedback route'unda `kinds` beyaz listesi bulunamadı").not.toBeNull();
    const values = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...TS_KINDS]);
  });

  it("editördeki EditorIssue.kind da aynı kümedir", () => {
    const source = read("components/editor/issueHighlight.ts");
    const match = /kind:\s*([^;]+);/.exec(source);
    expect(match).not.toBeNull();
    const values = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...TS_KINDS]);
  });
});

describe("feedback_events.severity", () => {
  const TS_SEVERITIES = [
    "critical",
    "suggestion",
  ] as const satisfies readonly FeedbackSeverity[];

  it("SQL ↔ TS ↔ Zod aynıdır", () => {
    expect(sqlCheckValues("severity")).toEqual([...TS_SEVERITIES]);
    expect(issueSeverity.options).toEqual([...TS_SEVERITIES]);
  });

  it("route'un varsayılanı geçerli bir değerdir", () => {
    const source = read("app/api/feedback/route.ts");
    expect(source).toMatch(/severity:\s*b\.severity === "critical" \? "critical" : "suggestion"/);
  });
});

describe("feedback_events.source", () => {
  const TS_SOURCES = [
    "proactive",
    "on_demand",
  ] as const satisfies readonly FeedbackSource[];

  it("SQL CHECK kısıtı TS union'ı ile aynıdır", () => {
    expect(sqlCheckValues("source")).toEqual([...TS_SOURCES]);
  });

  it("route'un ürettiği iki değer de SQL'de tanımlıdır", () => {
    const source = read("app/api/feedback/route.ts");
    for (const value of TS_SOURCES) expect(source).toContain(`"${value}"`);
  });
});

describe("feedback_events.status", () => {
  const STATUSES = ["shown", "accepted", "dismissed"] as const;

  it("SQL CHECK kısıtı üç durumu tanımlar", () => {
    // `status` kolonu essays tablosunda da var — tabloyu belirtmek şart.
    expect(sqlCheckValues("status", "feedback_events")).toEqual([...STATUSES]);
  });

  it("route'un beyaz listesi aynıdır", () => {
    const source = read("app/api/feedback/route.ts");
    const match = /\[([^\]]*"shown"[^\]]*)\]\.includes\(b\.status\)/.exec(source);
    expect(match, "status beyaz listesi bulunamadı").not.toBeNull();
    const values = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...STATUSES]);
  });

  it("SQL varsayılanı 'shown'dur (route de aynı varsayılana düşer)", () => {
    expect(MIGRATIONS).toMatch(/status text not null default 'shown'/);
  });
});

describe("essays.status", () => {
  const TS_STATUSES = [
    "draft",
    "completed",
  ] as const satisfies readonly EssayStatus[];

  it("SQL CHECK kısıtı TS union'ı ile aynıdır", () => {
    expect(sqlCheckValues("status", "essays")).toEqual([...TS_STATUSES]);
  });

  /** Not verildiğinde essay 'completed' oluyor — bu değer SQL'de tanımlı olmalı. */
  it("grade route'unun yazdığı status SQL'de geçerlidir", () => {
    expect(read("app/api/ai/grade/route.ts")).toContain('status: "completed"');
    expect(TS_STATUSES).toContain("completed");
  });

  it("yeni essay varsayılan olarak taslaktır", () => {
    expect(MIGRATIONS).toMatch(/status text not null default 'draft'/);
    // Route insert'ünde status YOK → DB varsayılanı ('draft') geçerli olur.
    const source = read("app/api/essays/route.ts");
    const insertBlock = /\.insert\(\{([\s\S]*?)\n\s*\}\)/.exec(source);
    expect(insertBlock, "essays insert bloğu bulunamadı").not.toBeNull();
    expect(insertBlock![1]).not.toMatch(/\bstatus:/);
  });
});

describe("level_history.source", () => {
  const SOURCES = [
    "diagnostic",
    "essay",
  ] as const satisfies readonly LevelHistory["source"][];

  it("SQL CHECK kısıtı TS union'ı ile aynıdır", () => {
    const match = /source text not null check \(source in \('diagnostic'[^)]*\)\)/.exec(
      MIGRATIONS,
    );
    expect(match).not.toBeNull();
    const values = [...match![0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...SOURCES]);
  });

  it("iki route da yalnızca bu iki kaynağı yazar", () => {
    expect(read("app/api/ai/diagnostic/route.ts")).toContain('source: "diagnostic"');
    expect(read("app/api/ai/grade/route.ts")).toContain('source: "essay"');
  });
});

describe("profiles.feedback_lang_override", () => {
  const OPTIONS = [
    "auto",
    "tr",
    "mixed",
    "en",
  ] as const satisfies readonly Profile["feedback_lang_override"][];

  it("SQL CHECK kısıtı TS union'ı ile aynıdır", () => {
    expect(sqlCheckValues("feedback_lang_override")).toEqual([...OPTIONS]);
  });

  it("ayarlar ekranındaki seçenekler de aynıdır", () => {
    const source = read("app/settings/SettingsClient.tsx");
    const match = /const LANG_OPTIONS[^=]*=\s*\[([\s\S]*?)\];/.exec(source);
    expect(match, "LANG_OPTIONS bulunamadı").not.toBeNull();
    const values = [...match![1].matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...OPTIONS]);
  });

  it("SQL varsayılanı 'auto'dur (seviyeye göre dil)", () => {
    expect(MIGRATIONS).toMatch(/feedback_lang_override text not null default 'auto'/);
  });
});

describe("essay_grades — rubrik alanları", () => {
  const RUBRIC_KEYS = [
    "task_achievement",
    "coherence_cohesion",
    "lexical_resource",
    "grammatical_range",
  ] as const satisfies readonly (keyof RubricScores)[];

  it("Zod gradeSchema.rubric aynı dört alanı taşır", () => {
    expect(Object.keys(gradeSchema.shape.rubric.shape).sort()).toEqual(
      [...RUBRIC_KEYS].sort(),
    );
  });

  /** Essay detay sayfası çubukları bu sırayla çiziyor; alan kaçarsa çubuk kaybolur. */
  it("essay detay sayfasındaki RUBRIC_ORDER dört alanı da içerir", () => {
    const source = read("app/essays/[id]/page.tsx");
    const match = /const RUBRIC_ORDER[^=]*=\s*\[([\s\S]*?)\];/.exec(source);
    expect(match, "RUBRIC_ORDER bulunamadı").not.toBeNull();
    const values = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(values.sort()).toEqual([...RUBRIC_KEYS].sort());
  });

  it("her rubrik alanının Türkçe etiketi vardır", () => {
    const source = read("app/essays/[id]/page.tsx");
    const match = /const RUBRIC_LABELS[^=]*=\s*\{([\s\S]*?)\};/.exec(source);
    expect(match).not.toBeNull();
    for (const key of RUBRIC_KEYS) {
      expect(match![1], `${key} etiketi yok`).toContain(key);
    }
  });

  it("prompt aynı dört kriteri modele bildirir", () => {
    const prompts = read("lib/ai/prompts.ts");
    for (const key of RUBRIC_KEYS) expect(prompts).toContain(key);
  });
});

describe("essay_grades — kolonlar ve yazılan alanlar", () => {
  it("grade route'unun yazdığı her kolon göçlerde tanımlıdır", () => {
    const source = read("app/api/ai/grade/route.ts");
    const insertBlock = /\.from\("essay_grades"\)\s*\.insert\(\{([\s\S]*?)\}\)/.exec(
      source,
    );
    expect(insertBlock, "essay_grades insert bloğu bulunamadı").not.toBeNull();

    const columns = [...insertBlock![1].matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(5);
    for (const column of columns) {
      expect(
        MIGRATIONS,
        `essay_grades.${column} göçlerde yok — insert 500 verir`,
      ).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  /** 0002 göçü bu kolonu ekledi; eski kayıtlarda null kalıyor. */
  it("ai_model kolonu 0002 göçüyle eklenmiştir ve nullable'dır", () => {
    expect(MIGRATIONS).toMatch(
      /alter table public\.essay_grades\s+add column if not exists ai_model text/,
    );
    expect(MIGRATIONS).not.toMatch(/ai_model text not null/);
  });
});

describe("sayısal sınırlar — Zod ↔ Postgres kolon tipi", () => {
  /**
   * `numeric(3,1)` en fazla 99.9 tutabilir. Zod üst sınırları bunun altında
   * kaldığı sürece taşma imkânsız; sınırlar gevşetilirse insert patlar.
   */
  it("overall_score numeric(3,1) kolonuna sığar (0..9)", () => {
    expect(MIGRATIONS).toMatch(/overall_score numeric\(3,1\) not null/);
    expect(gradeSchema.safeParse({ overall_score: 99 }).success).toBe(false);
  });

  it("numeric_estimate numeric(3,1) kolonuna sığar (1..6)", () => {
    expect(MIGRATIONS).toMatch(/numeric_estimate numeric\(3,1\) not null/);
    expect(
      diagnosticSchema.safeParse({
        cefr: "B1",
        numeric_estimate: 99,
        rationale: "x",
      }).success,
    ).toBe(false);
  });

  it("rubrik puanları jsonb'a yazılıyor ama yine de 0..9 ile sınırlı", () => {
    expect(MIGRATIONS).toMatch(/rubric jsonb not null/);
    const grade = {
      rubric: {
        task_achievement: 10,
        coherence_cohesion: 5,
        lexical_resource: 5,
        grammatical_range: 5,
      },
      overall_score: 5,
      cefr_estimate: "B1",
      summary_feedback: "x",
      corrected_text: "x",
      strengths: ["a"],
      improvements: ["b"],
    };
    expect(gradeSchema.safeParse(grade).success).toBe(false);
  });
});

describe("checkSchema ↔ editör tipleri", () => {
  /**
   * `EditorIssue`, checkSchema'nın çıktısına `id` eklenmiş hâli. Alan adları
   * ayrışırsa editör hataları çizemez — ve TypeScript bunu yakalayamaz
   * çünkü route'un cevabı istemcide `any` olarak geliyor.
   */
  it("EditorIssue, checkSchema alanlarının tamamını taşır", () => {
    const editorSource = read("components/editor/issueHighlight.ts");
    const schemaFields = Object.keys(checkSchema.shape.issues.element.shape);

    expect(schemaFields.sort()).toEqual(
      ["span_text", "kind", "severity", "message", "replacement"].sort(),
    );
    for (const field of schemaFields) {
      expect(editorSource, `EditorIssue.${field} yok`).toMatch(
        new RegExp(`\\b${field}\\b`),
      );
    }
  });

  it("replacement editörde de null olabilir (otomatik düzeltmesiz öneri)", () => {
    expect(read("components/editor/issueHighlight.ts")).toMatch(
      /replacement:\s*string \| null/,
    );
  });
});

describe("veritabanı tabloları ↔ kodda kullanılan tablo adları", () => {
  it("kodda geçen her tablo göçlerde tanımlıdır", () => {
    const known = new Set(
      [...MIGRATIONS.matchAll(/create table if not exists public\.(\w+)/g)].map(
        (m) => m[1],
      ),
    );
    expect(known.size).toBeGreaterThan(0);

    const used = new Set<string>();
    for (const file of [
      "app/api/ai/grade/route.ts",
      "app/api/ai/coach/route.ts",
      "app/api/ai/diagnostic/route.ts",
      "app/api/essays/route.ts",
      "app/api/feedback/route.ts",
      "app/page.tsx",
      "app/essays/page.tsx",
      "app/essays/[id]/page.tsx",
      "app/essays/[id]/edit/page.tsx",
      "app/progress/page.tsx",
      "app/settings/SettingsClient.tsx",
      "components/editor/EssayEditor.tsx",
      "lib/db/profile.ts",
    ]) {
      for (const match of read(file).matchAll(/\.from\("(\w+)"\)/g))
        used.add(match[1]);
    }

    expect(used.size).toBeGreaterThan(3);
    for (const table of used) {
      expect(known.has(table), `public.${table} göçlerde yok`).toBe(true);
    }
  });
});
