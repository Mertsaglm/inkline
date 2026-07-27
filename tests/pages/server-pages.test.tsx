// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { aiConfigured, supabaseConfigured } from "@/lib/config";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import DashboardPage from "@/app/page";
import EssaysPage from "@/app/essays/page";
import EssayDetailPage from "@/app/essays/[id]/page";
import EssayEditPage from "@/app/essays/[id]/edit/page";
import ProgressPage from "@/app/progress/page";
import SettingsPage from "@/app/settings/page";
import WritePage from "@/app/write/page";
import OnboardingPage from "@/app/onboarding/page";
import { makeEssay, makeGrade, makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import { NotFoundSignal } from "../setup";

/**
 * ============================================================================
 *  Sunucu bileşenleri — veri türetme katmanı.
 *
 *  Bu sayfalarda gerçek mantık var: puan eşleme, ortalama, tarih biçimi,
 *  seri hazırlama, "taslak mı tamamlandı mı" yönlendirmesi. Hiçbiri tip
 *  sistemiyle korunmuyor (Supabase `any` benzeri veri döndürüyor), bu yüzden
 *  sessizce bozulabilir: sayfa yine çizilir, sadece sayılar yanlış olur.
 *
 *  Ağır istemci bileşenleri (editör, grafikler) taklit ediliyor — burada
 *  denenen şey sayfanın onlara HANGİ VERİYİ verdiği.
 * ============================================================================
 */

vi.mock("@/lib/config", () => ({
  supabaseConfigured: vi.fn(() => true),
  aiConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/db/profile", () => ({ ensureProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

/** Ağır alt bileşenler — aldıkları prop'ları görünür kılan saplamalar. */
vi.mock("@/components/editor/EssayEditor", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="editor" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("@/app/progress/ProgressClient", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="progress" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("@/app/settings/SettingsClient", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="settings" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("@/app/write/WriteClient", () => ({
  default: () => <div data-testid="write" />,
}));
vi.mock("@/app/onboarding/OnboardingClient", () => ({
  default: () => <div data-testid="onboarding" />,
}));

const supabaseConfiguredMock = vi.mocked(supabaseConfigured);
const aiConfiguredMock = vi.mocked(aiConfigured);
const ensureProfileMock = vi.mocked(ensureProfile);
const createClientMock = vi.mocked(createClient);

let supabase: SupabaseMock;

function setupDb(responses: Record<string, unknown> = {}) {
  supabase = createSupabaseMock({ responses: responses as never });
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

/** Async sunucu bileşenini çalıştırıp sonucu çizer. */
async function renderPage(page: Promise<ReactElement> | ReactElement) {
  return render(await page);
}

/** Saplamaya geçen prop'lar. */
function propsOf(testId: string) {
  return JSON.parse(screen.getByTestId(testId).getAttribute("data-props")!);
}

beforeEach(() => {
  supabaseConfiguredMock.mockReturnValue(true);
  aiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile(),
  });
  setupDb();
});

afterEach(() => cleanup());

describe("Kurulum kapıları", () => {
  /**
   * Uygulama env olmadan da BUILD olmalı ve çalışmalı — çökmek yerine
   * kurulum ekranı gösterir (AGENTS.md: "green build ≠ configured").
   */
  it("Supabase yapılandırılmamışsa her sayfa SetupNotice gösterir", async () => {
    supabaseConfiguredMock.mockReturnValue(false);

    const pages: [string, () => Promise<ReactElement> | ReactElement][] = [
      ["panel", () => DashboardPage()],
      ["essaylerim", () => EssaysPage()],
      ["yaz", () => WritePage()],
      ["onboarding", () => OnboardingPage()],
      ["gelişim", () => ProgressPage()],
      ["ayarlar", () => SettingsPage()],
    ];

    for (const [name, build] of pages) {
      cleanup();
      await renderPage(build());
      expect(screen.getByText("Kurulum gerekli"), name).toBeDefined();
    }
  });

  it("AI anahtarı yoksa AI'a bağlı sayfalar kısa kurulum ekranı gösterir", async () => {
    aiConfiguredMock.mockReturnValue(false);

    for (const [name, build] of [
      ["yaz", () => WritePage()],
      ["onboarding", () => OnboardingPage()],
      ["gelişim", () => ProgressPage()],
    ] as [string, () => Promise<ReactElement> | ReactElement][]) {
      cleanup();
      const { container } = await renderPage(build());
      expect(screen.getByText("Kurulum gerekli"), name).toBeDefined();
      // needAi → yalnızca 2 adım
      expect(container.querySelectorAll("li"), name).toHaveLength(2);
    }
  });

  it("AI anahtarı varken sayfalar kendi istemcilerini çizer", async () => {
    await renderPage(WritePage());
    expect(screen.getByTestId("write")).toBeDefined();

    cleanup();
    await renderPage(OnboardingPage());
    expect(screen.getByTestId("onboarding")).toBeDefined();
  });

  it("oturum kurulamazsa panel SetupNotice gösterir", async () => {
    ensureProfileMock.mockResolvedValue(null);
    await renderPage(DashboardPage());
    expect(screen.getByText("Kurulum gerekli")).toBeDefined();
  });

  /** Ayarlar AI'sız da açılmalı — kullanıcı seviyesini elle değiştirebilsin. */
  it("ayarlar sayfası AI anahtarı olmadan da açılır", async () => {
    aiConfiguredMock.mockReturnValue(false);
    await renderPage(SettingsPage());
    expect(screen.getByTestId("settings")).toBeDefined();
  });
});

describe("Panel (app/page.tsx)", () => {
  it("hiç essay yokken boş durum gösterir", async () => {
    setupDb({ "essays.select": { data: [] }, "essay_grades.select": { data: [] } });
    await renderPage(DashboardPage());

    expect(screen.getByText("0")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined(); // ortalama puan
  });

  it("tamamlanan ve taslak sayısını ayırır", async () => {
    setupDb({
      "essays.select": {
        data: [
          makeEssay({ id: "1", status: "completed" }),
          makeEssay({ id: "2", status: "completed" }),
          makeEssay({ id: "3", status: "draft" }),
        ],
      },
      "essay_grades.select": { data: [] },
    });

    const { container } = await renderPage(DashboardPage());
    const text = container.textContent ?? "";

    expect(text).toContain("2"); // tamamlanan
    expect(text).toMatch(/1 taslak|taslak/);
  });

  it("ortalama bandı bir ondalıkla gösterir", async () => {
    setupDb({
      "essays.select": { data: [makeEssay()] },
      "essay_grades.select": {
        data: [
          { essay_id: "essay-1", overall_score: 6 },
          { essay_id: "essay-2", overall_score: 5 },
        ],
      },
    });

    await renderPage(DashboardPage());
    expect(screen.getByText("5.5")).toBeDefined();
  });

  it("puanları metin olarak gelse bile sayıya çevirir", async () => {
    setupDb({
      "essays.select": { data: [makeEssay()] },
      "essay_grades.select": {
        data: [
          { essay_id: "essay-1", overall_score: "6.0" },
          { essay_id: "essay-2", overall_score: "7.0" },
        ],
      },
    });

    await renderPage(DashboardPage());
    expect(screen.getByText("6.5")).toBeDefined();
  });

  it("en fazla 5 essay listeler", async () => {
    setupDb({
      "essays.select": {
        data: Array.from({ length: 9 }, (_, i) =>
          makeEssay({ id: `e${i}`, title: `Essay ${i}` }),
        ),
      },
      "essay_grades.select": { data: [] },
    });

    await renderPage(DashboardPage());

    expect(screen.getByText("Essay 0")).toBeDefined();
    expect(screen.getByText("Essay 4")).toBeDefined();
    expect(screen.queryByText("Essay 5")).toBeNull();
  });

  it("essayleri en yeniden eskiye çeker", async () => {
    await renderPage(DashboardPage());
    expect(supabase.oneOp("essays.select").filters).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  /** Taslak düzenleme ekranına, tamamlanan rapora gider. */
  it("taslak ve tamamlanan essayleri farklı yollara bağlar", async () => {
    setupDb({
      "essays.select": {
        data: [
          makeEssay({ id: "done", title: "Bitti", status: "completed" }),
          makeEssay({ id: "wip", title: "Devam", status: "draft" }),
        ],
      },
      "essay_grades.select": { data: [] },
    });

    await renderPage(DashboardPage());

    expect(screen.getByText("Bitti").closest("a")?.getAttribute("href")).toBe(
      "/essays/done",
    );
    expect(screen.getByText("Devam").closest("a")?.getAttribute("href")).toBe(
      "/essays/wip/edit",
    );
  });

  it("durum rozetleri Türkçedir", async () => {
    setupDb({
      "essays.select": {
        data: [
          makeEssay({ id: "a", status: "completed" }),
          makeEssay({ id: "b", status: "draft" }),
        ],
      },
      "essay_grades.select": { data: [] },
    });

    await renderPage(DashboardPage());
    expect(screen.getByText("Değerlendirildi")).toBeDefined();
    expect(screen.getByText("Taslak")).toBeDefined();
  });

  it("tarihleri tr-TR biçiminde yazar", async () => {
    setupDb({
      "essays.select": {
        data: [makeEssay({ created_at: "2026-03-15T10:00:00.000Z" })],
      },
      "essay_grades.select": { data: [] },
    });

    await renderPage(DashboardPage());
    expect(screen.getByText(/15 Mar 2026/)).toBeDefined();
  });

  it("onboarding tamamlanmadıysa yönlendirme bandı gösterir", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ onboarded: false }),
    });
    setupDb({ "essays.select": { data: [] }, "essay_grades.select": { data: [] } });

    const { container } = await renderPage(DashboardPage());
    expect(container.querySelector('a[href="/onboarding"]')).not.toBeNull();
  });

  it("onboarding tamamlandıysa bandı gizler", async () => {
    setupDb({ "essays.select": { data: [] }, "essay_grades.select": { data: [] } });
    const { container } = await renderPage(DashboardPage());
    expect(container.querySelector('a[href="/onboarding"]')).toBeNull();
  });

  it("seviye etiketinin Türkçe kısmını gösterir", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C1" }),
    });
    setupDb({ "essays.select": { data: [] }, "essay_grades.select": { data: [] } });

    const { container } = await renderPage(DashboardPage());
    expect(container.textContent).toContain("İleri");
  });
});

describe("Essaylerim (app/essays/page.tsx)", () => {
  it("hiç essay yokken boş durum gösterir", async () => {
    setupDb({ "essays.select": { data: [] }, "essay_grades.select": { data: [] } });
    const { container } = await renderPage(EssaysPage());
    expect(container.querySelectorAll("a[href^='/essays/']")).toHaveLength(0);
  });

  it("tüm essayleri listeler (panelin aksine 5 ile sınırlı değil)", async () => {
    setupDb({
      "essays.select": {
        data: Array.from({ length: 9 }, (_, i) =>
          makeEssay({ id: `e${i}`, title: `Essay ${i}` }),
        ),
      },
      "essay_grades.select": { data: [] },
    });

    await renderPage(EssaysPage());
    expect(screen.getByText("Essay 8")).toBeDefined();
  });

  it("puanı olan essaylerde bandı, olmayanlarda tire gösterir", async () => {
    setupDb({
      "essays.select": {
        data: [
          makeEssay({ id: "a", title: "Notlu" }),
          makeEssay({ id: "b", title: "Notsuz" }),
        ],
      },
      "essay_grades.select": { data: [{ essay_id: "a", overall_score: 7 }] },
    });

    await renderPage(EssaysPage());
    expect(screen.getByText("7.0")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
  });

  it("aynı essay için birden çok not varsa ilkini kullanır", async () => {
    setupDb({
      "essays.select": { data: [makeEssay({ id: "a", title: "Tek" })] },
      "essay_grades.select": {
        data: [
          { essay_id: "a", overall_score: 6 },
          { essay_id: "a", overall_score: 9 },
        ],
      },
    });

    await renderPage(EssaysPage());
    expect(screen.getByText("6.0")).toBeDefined();
    expect(screen.queryByText("9.0")).toBeNull();
  });
});

describe("Essay detayı (app/essays/[id]/page.tsx)", () => {
  const params = (id = "essay-1") => Promise.resolve({ id });

  it("essay yoksa notFound() atar", async () => {
    setupDb({ "essays.select": { data: null } });
    await expect(EssayDetailPage({ params: params() })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );
  });

  it("henüz değerlendirilmemiş essay için rapor yerine uyarı gösterir", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: null },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.getByText(/henüz değerlendirilmedi/)).toBeDefined();
  });

  it("genel bandı bir ondalıkla ve /9 ile gösterir", async () => {
    setupDb({
      "essays.select": { data: makeEssay({ status: "completed" }) },
      "essay_grades.select": { data: makeGrade({ overall_score: 6.5 }) },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.getByText("6.5")).toBeDefined();
    expect(screen.getByText("/9")).toBeDefined();
  });

  it("dört rubrik kriterini Türkçe etiketle çizer", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade() },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    for (const label of [
      "Konuya uygunluk",
      "Tutarlılık & akış",
      "Kelime zenginliği",
      "Gramer doğruluğu",
    ]) {
      expect(screen.getByText(label), label).toBeDefined();
    }
  });

  it("güçlü yönleri ve gelişim alanlarını listeler", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": {
        data: makeGrade({
          strengths: ["Akıcı cümleler", "Zengin kelime"],
          improvements: ["Zaman uyumu"],
        }),
      },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.getByText("Akıcı cümleler")).toBeDefined();
    expect(screen.getByText("Zengin kelime")).toBeDefined();
    expect(screen.getByText("Zaman uyumu")).toBeDefined();
  });

  it("düzeltilmiş metni gösterir", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": {
        data: makeGrade({ corrected_text: "Last weekend I went to the cinema." }),
      },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    expect(
      screen.getByText("Last weekend I went to the cinema."),
    ).toBeDefined();
  });

  it("CEFR tahminini rozette gösterir", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade({ cefr_estimate: "B2" }) },
    });

    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.getByText("CEFR B2")).toBeDefined();
  });

  it("notu üreten modeli gösterir, bilinmiyorsa gizler", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade({ ai_model: "gpt-5-mini" }) },
    });
    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.getByText(/modeli kullanıldı/).textContent).toContain(
      "gpt-5-mini",
    );

    cleanup();
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade({ ai_model: null }) },
    });
    await renderPage(EssayDetailPage({ params: params() }));
    expect(screen.queryByText(/modeli kullanıldı/)).toBeNull();
  });

  /** Aynı essay birden çok kez notlanabilir — en yenisi gösterilmeli. */
  it("notları en yeniden eskiye sıralayıp ilkini alır", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade() },
    });
    await renderPage(EssayDetailPage({ params: params() }));

    expect(supabase.oneOp("essay_grades.select").filters).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  it("essay'i id ile çeker", async () => {
    setupDb({
      "essays.select": { data: makeEssay() },
      "essay_grades.select": { data: makeGrade() },
    });
    await renderPage(EssayDetailPage({ params: params("abc-9") }));

    expect(supabase.oneOp("essays.select").filters).toContainEqual({
      method: "eq",
      args: ["id", "abc-9"],
    });
  });
});

describe("Essay düzenleme (app/essays/[id]/edit/page.tsx)", () => {
  const params = (id = "essay-1") => Promise.resolve({ id });

  it("essay yoksa notFound() atar", async () => {
    setupDb({ "essays.select": { data: null } });
    await expect(EssayEditPage({ params: params() })).rejects.toBeInstanceOf(
      NotFoundSignal,
    );
  });

  it("editöre başlık, konu ve seviye aktarılır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "B2", ai_warnings_enabled: false }),
    });
    setupDb({
      "essays.select": {
        data: makeEssay({
          id: "e-7",
          title: "Hafta sonum",
          prompt: "Describe it.",
        }),
      },
    });

    await renderPage(EssayEditPage({ params: params("e-7") }));

    // essayId, URL parametresi değil DB satırından gelir.
    expect(propsOf("editor")).toMatchObject({
      essayId: "e-7",
      initialTitle: "Hafta sonum",
      initialPrompt: "Describe it.",
      level: "B2",
      aiWarningsEnabled: false,
    });
  });

  /**
   * TipTap, `type` alanı olmayan içerikte patlıyor. Sayfa bu yüzden içeriği
   * doğruluyor ve şüpheliyse `null` geçiyor (editör boş açılır). Bu kontrol
   * kalkarsa bozuk bir taslak sayfayı komple çökertir.
   */
  it("geçerli TipTap içeriğini aktarır", async () => {
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setupDb({ "essays.select": { data: makeEssay({ content }) } });

    await renderPage(EssayEditPage({ params: params() }));
    expect(propsOf("editor").initialContent).toEqual(content);
  });

  it("geçersiz içerikte null aktarır (editör boş açılır, çökmez)", async () => {
    for (const content of [
      null,
      {},
      { content: [] },
      "bir metin",
      42,
      [],
    ] as unknown[]) {
      cleanup();
      setupDb({ "essays.select": { data: makeEssay({ content: content as never }) } });
      await renderPage(EssayEditPage({ params: params() }));
      expect(propsOf("editor").initialContent, JSON.stringify(content)).toBeNull();
    }
  });
});

describe("Gelişim (app/progress/page.tsx)", () => {
  it("boş verilerle boş seriler üretir", async () => {
    setupDb({
      "level_history.select": { data: [] },
      "essay_grades.select": { data: [] },
      "feedback_events.select": { data: [] },
    });

    await renderPage(ProgressPage());

    expect(propsOf("progress")).toEqual({
      levelSeries: [],
      scoreSeries: [],
      kindCounts: [],
      hasData: false,
    });
  });

  it("seviye serisini kısa tarih + sayı olarak hazırlar", async () => {
    setupDb({
      "level_history.select": {
        data: [
          { numeric_estimate: "2.5", assessed_at: "2026-01-02T00:00:00.000Z" },
          { numeric_estimate: 3, assessed_at: "2026-03-15T00:00:00.000Z" },
        ],
      },
      "essay_grades.select": { data: [] },
      "feedback_events.select": { data: [] },
    });

    await renderPage(ProgressPage());

    expect(propsOf("progress").levelSeries).toEqual([
      { date: "02/01", value: 2.5 },
      { date: "15/03", value: 3 },
    ]);
  });

  it("not serisini hazırlar ve metin puanları sayıya çevirir", async () => {
    setupDb({
      "level_history.select": { data: [] },
      "essay_grades.select": {
        data: [{ overall_score: "6.5", created_at: "2026-01-02T00:00:00.000Z" }],
      },
      "feedback_events.select": { data: [] },
    });

    await renderPage(ProgressPage());

    expect(propsOf("progress").scoreSeries).toEqual([
      { date: "02/01", score: 6.5 },
    ]);
    expect(propsOf("progress").hasData).toBe(true);
  });

  it("hata türlerini sayar", async () => {
    setupDb({
      "level_history.select": { data: [] },
      "essay_grades.select": { data: [] },
      "feedback_events.select": {
        data: [
          { kind: "grammar" },
          { kind: "grammar" },
          { kind: "vocab" },
          { kind: "grammar" },
        ],
      },
    });

    await renderPage(ProgressPage());

    expect(propsOf("progress").kindCounts).toEqual([
      { kind: "grammar", count: 3 },
      { kind: "vocab", count: 1 },
    ]);
  });

  /** Seviye çizgisi kronolojik olmalı — ARTAN sıralama. */
  it("seviye ve not geçmişini kronolojik çeker", async () => {
    setupDb({
      "level_history.select": { data: [] },
      "essay_grades.select": { data: [] },
      "feedback_events.select": { data: [] },
    });

    await renderPage(ProgressPage());

    expect(supabase.oneOp("level_history.select").filters).toContainEqual({
      method: "order",
      args: ["assessed_at", { ascending: true }],
    });
    expect(supabase.oneOp("essay_grades.select").filters).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: true }],
    });
  });

  /** hasData yalnızca NOT geçmişine bakar — koçluk planı buna dayanıyor. */
  it("hasData yalnızca notlanmış essay varsa true olur", async () => {
    setupDb({
      "level_history.select": {
        data: [{ numeric_estimate: 3, assessed_at: "2026-01-02T00:00:00.000Z" }],
      },
      "essay_grades.select": { data: [] },
      "feedback_events.select": { data: [{ kind: "grammar" }] },
    });

    await renderPage(ProgressPage());
    expect(propsOf("progress").hasData).toBe(false);
  });
});

describe("Ayarlar (app/settings/page.tsx)", () => {
  it("profili istemciye aktarır", async () => {
    const profile = makeProfile({
      current_level: "B2",
      target_level: "C1",
      interests: "müzik",
    });
    ensureProfileMock.mockResolvedValue({ userId: "test-user", profile });

    await renderPage(SettingsPage());

    expect(propsOf("settings").profile).toMatchObject({
      current_level: "B2",
      target_level: "C1",
      interests: "müzik",
    });
  });

  it("oturum yoksa SetupNotice gösterir", async () => {
    ensureProfileMock.mockResolvedValue(null);
    await renderPage(SettingsPage());
    expect(screen.getByText("Kurulum gerekli")).toBeDefined();
  });
});

describe("Sayfalar arası tutarlılık", () => {
  /**
   * Panel ve Essaylerim aynı puan/durum mantığını iki kez yazıyor. Biri
   * değişip diğeri kalırsa aynı essay iki sayfada farklı görünür.
   */
  it("panel ve essaylerim aynı essay için aynı puanı ve yolu üretir", async () => {
    const essays = [
      makeEssay({ id: "x", title: "Aynı essay", status: "completed" }),
    ];
    const grades = [{ essay_id: "x", overall_score: 7.5 }];

    setupDb({
      "essays.select": { data: essays },
      "essay_grades.select": { data: grades },
    });
    const dashboard = await renderPage(DashboardPage());
    const dashboardLink = within(dashboard.container)
      .getByText("Aynı essay")
      .closest("a")!;
    // Panelde "7.5" hem ortalama kartında hem satırda görünür; satırdakini al.
    const dashboardScore = within(dashboardLink).getByText("7.5").textContent;

    cleanup();
    setupDb({
      "essays.select": { data: essays },
      "essay_grades.select": { data: grades },
    });
    const list = await renderPage(EssaysPage());
    const listLink = within(list.container)
      .getByText("Aynı essay")
      .closest("a")!;

    expect(listLink.getAttribute("href")).toBe(
      dashboardLink.getAttribute("href"),
    );
    expect(within(listLink).getByText("7.5").textContent).toBe(dashboardScore);
  });
});
