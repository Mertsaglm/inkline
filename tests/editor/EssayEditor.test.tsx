// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";
import type { JSONContent } from "@tiptap/core";
import EssayEditor from "@/components/editor/EssayEditor";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import { navigationState } from "../setup";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

/**
 * ============================================================================
 *  Editör — öğrencinin metnine dokunan tek yer.
 *
 *  Buradaki kritik akış: AI bir hata bulur → altı çizilir → öğrenci tıklar →
 *  "Uygula" der → `replacement` metne BİREBİR yazılır. Bu zincirin herhangi
 *  bir halkası bozulursa essay sessizce bozulur; ekranda hata görünmez.
 *
 *  jsdom'da contenteditable'a gerçekten yazmak mümkün değil. Bunun yerine
 *  bileşenin AI kontrolünü tetikleyen diğer iki yolu kullanıyoruz:
 *  "AI uyarıları" düğmesini açmak ve "Tamamla & Değerlendir".
 * ============================================================================
 */

/** 20 kelimeden uzun, notlanabilir bir başlangıç içeriği. */
const LONG_TEXT =
  "Yesterday I go to the cinema with my friends and we watched a very long film about space and the future of humanity.";

function contentOf(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

let supabase: SupabaseMock;
let fetchMock: ReturnType<typeof vi.fn>;

/** Uç noktaya göre cevap veren fetch taklidi. */
function mockFetch(
  routes: Record<string, { status?: number; body: unknown }> = {},
) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((key) => url.includes(key));
    const route = match ? routes[match] : { status: 200, body: {} };
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** `/api/...` çağrılarının gövdeleri. */
function callsTo(path: string) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes(path))
    .map(([, init]) => {
      const body = (init as RequestInit | undefined)?.body;
      return body ? JSON.parse(String(body)) : undefined;
    });
}

function renderEditor(props: Partial<Parameters<typeof EssayEditor>[0]> = {}) {
  return render(
    <EssayEditor
      essayId="essay-1"
      initialTitle="My weekend"
      initialPrompt={null}
      initialContent={contentOf(LONG_TEXT)}
      aiWarningsEnabled={false}
      level="B1"
      {...props}
    />,
  );
}

/** Editörün o anki düz metni. */
function editorText() {
  return document.querySelector(".ProseMirror")?.textContent ?? "";
}

function issueMarks() {
  return [...document.querySelectorAll("[data-issue-id]")] as HTMLElement[];
}

/** AI kontrolünü tetikler: kapalı olan uyarıları açmak runCheck çalıştırır. */
async function turnAiOn() {
  const toggle = screen.getByRole("switch");
  await act(async () => {
    toggle.click();
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

const ISSUE = {
  span_text: "I go",
  kind: "grammar",
  severity: "critical",
  message: "Geçmişten bahsederken geçmiş zaman kullanılır.",
  replacement: "I went",
};

beforeEach(() => {
  supabase = createSupabaseMock();
  createClientMock.mockReturnValue(supabase as never);
  navigationState.push.mockClear();
  mockFetch();
});

afterEach(() => {
  cleanup();
});

describe("EssayEditor — ilk çizim", () => {
  it("başlığı, seviyeyi ve kelime sayısını gösterir", async () => {
    renderEditor();

    const title = screen.getByPlaceholderText("Başlık…") as HTMLInputElement;
    expect(title.value).toBe("My weekend");
    expect(screen.getByText("B1")).toBeDefined();
    await waitFor(() =>
      expect(screen.getByText(/\d+ kelime/).textContent).toBe("23 kelime"),
    );
  });

  it("başlangıç metnini editöre yükler", () => {
    renderEditor();
    expect(editorText()).toContain("Yesterday I go to the cinema");
  });

  it("konu yönergesi varsa bandını gösterir", () => {
    renderEditor({ initialPrompt: "Describe your weekend." });
    expect(screen.getByText("Konu")).toBeDefined();
    expect(screen.getByText("Describe your weekend.")).toBeDefined();
  });

  it("konu yönergesi yoksa bandı çizmez", () => {
    renderEditor({ initialPrompt: null });
    expect(screen.queryByText("Konu")).toBeNull();
  });

  it("AI anahtarı profildeki değerle başlar", () => {
    renderEditor({ aiWarningsEnabled: true });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");

    cleanup();
    renderEditor({ aiWarningsEnabled: false });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("boş içerikte kelime sayısı sıfırdır", async () => {
    renderEditor({ initialContent: null });
    await waitFor(() =>
      expect(screen.getByText(/kelime/).textContent).toBe("0 kelime"),
    );
  });
});

describe("EssayEditor — AI uyarıları anahtarı", () => {
  it("açıldığında kontrolü tetikler ve metni gönderir", async () => {
    mockFetch({ "/api/ai/check": { body: { issues: [], model: "gemini-3.5-flash" } } });
    renderEditor();

    await turnAiOn();

    const [body] = callsTo("/api/ai/check");
    expect(body.text).toContain("Yesterday I go to the cinema");
  });

  /**
   * ⚠ Supabase sorgu kurucuları tembel "thenable"dır — `await` edilmezse
   * istek HİÇ gönderilmez. Bu satır bir kez `await`siz yazıldı ve tercih
   * sessizce kaydedilmedi (sayfa yenilenince eski değere dönüyordu).
   * Taklit istemci de aynı şekilde davranıyor: işlem yalnızca zincir
   * tüketildiğinde kaydedilir, yani bu test o hatayı yakalar.
   */
  it("açıldığında tercihi profile KAYDEDER (await edilmiş olmalı)", async () => {
    mockFetch({ "/api/ai/check": { body: { issues: [] } } });
    renderEditor();

    await turnAiOn();

    await waitFor(() =>
      expect(supabase.opsFor("profiles.update")).toHaveLength(1),
    );
    const op = supabase.oneOp("profiles.update");
    expect(op.payload).toEqual({ ai_warnings_enabled: true });
    expect(op.filters).toContainEqual({
      method: "eq",
      args: ["user_id", "test-user"],
    });
  });

  it("oturum yoksa yazma denemesi yapılmaz", async () => {
    supabase = createSupabaseMock({ user: null });
    createClientMock.mockReturnValue(supabase as never);
    mockFetch({ "/api/ai/check": { body: { issues: [] } } });
    renderEditor();

    const toggle = screen.getByRole("switch");
    await act(async () => {
      toggle.click();
    });

    expect(supabase.opsFor("profiles.update")).toHaveLength(0);
  });

  /** Kapatınca altçizgiler anında silinir ve bir daha AI çağrılmaz. */
  it("kapatıldığında işaretler temizlenir ve tercih kaydedilir", async () => {
    mockFetch({ "/api/ai/check": { body: { issues: [ISSUE] } } });
    renderEditor();

    await turnAiOn();
    await waitFor(() => expect(issueMarks().length).toBe(1));
    const callsBefore = callsTo("/api/ai/check").length;

    const toggle = screen.getByRole("switch");
    await act(async () => {
      toggle.click();
    });

    expect(issueMarks()).toHaveLength(0);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(callsTo("/api/ai/check")).toHaveLength(callsBefore);
    await waitFor(() =>
      expect(
        supabase
          .opsFor("profiles.update")
          .some(
            (op) =>
              (op.payload as Record<string, unknown>).ai_warnings_enabled ===
              false,
          ),
      ).toBe(true),
    );
  });

  it("kapalıyken model rozeti çizilmez", () => {
    renderEditor({ aiWarningsEnabled: false });
    expect(screen.queryByText(/modeli kullanıldı/)).toBeNull();
  });

  it("cevabı veren modeli rozette gösterir", async () => {
    mockFetch({ "/api/ai/check": { body: { issues: [], model: "gpt-5-mini" } } });
    renderEditor();

    await turnAiOn();

    await waitFor(() =>
      expect(screen.getByText(/modeli kullanıldı/).textContent).toContain(
        "gpt-5-mini",
      ),
    );
  });
});

describe("EssayEditor — hata işaretleri ve popover", () => {
  beforeEach(() => {
    mockFetch({ "/api/ai/check": { body: { issues: [ISSUE] } } });
  });

  it("hatalı span'in altını çizer", async () => {
    renderEditor();
    await turnAiOn();

    await waitFor(() => expect(issueMarks()).toHaveLength(1));
    expect(issueMarks()[0].textContent).toBe("I go");
    expect(issueMarks()[0].className).toContain("issue-mark--critical");
  });

  it("işarete tıklamak popover'ı açar", async () => {
    renderEditor();
    await turnAiOn();
    await waitFor(() => expect(issueMarks()).toHaveLength(1));

    await act(async () => {
      issueMarks()[0].click();
    });

    expect(screen.getByText(ISSUE.message)).toBeDefined();
    expect(screen.getByText("Gramer")).toBeDefined();
  });

  /** Öğrenci metne tam olarak NE yazılacağını görmeden onaylamamalı. */
  it("popover eski ve yeni metni yan yana gösterir", async () => {
    renderEditor();
    await turnAiOn();
    await waitFor(() => expect(issueMarks()).toHaveLength(1));
    await act(async () => {
      issueMarks()[0].click();
    });

    expect(screen.getByText("I went")).toBeDefined();
    // Üstü çizili eski metin de popover içinde.
    const struck = document.querySelector(".line-through");
    expect(struck?.textContent).toBe("I go");
  });

  it("hata türünün Türkçe etiketini kullanır", async () => {
    const labels: Record<string, string> = {
      grammar: "Gramer",
      vocab: "Kelime",
      structure: "Cümle yapısı",
      spelling: "Yazım",
      style: "Üslup",
    };
    for (const [kind, label] of Object.entries(labels)) {
      cleanup();
      mockFetch({
        "/api/ai/check": { body: { issues: [{ ...ISSUE, kind }] } },
      });
      renderEditor();
      await turnAiOn();
      await waitFor(() => expect(issueMarks()).toHaveLength(1));
      await act(async () => {
        issueMarks()[0].click();
      });
      expect(screen.getByText(label), kind).toBeDefined();
    }
  });

  /**
   * `replacement === null` ise metne yazılacak bir şey yok — "Uygula"
   * GÖSTERİLMEMELİ. Bu, /api/ai/check'teki safeReplacement guard'ının
   * arayüzdeki karşılığı.
   */
  it("otomatik düzeltmesi olmayan öneride Uygula düğmesi çizilmez", async () => {
    mockFetch({
      "/api/ai/check": { body: { issues: [{ ...ISSUE, replacement: null }] } },
    });
    renderEditor();
    await turnAiOn();
    await waitFor(() => expect(issueMarks()).toHaveLength(1));
    await act(async () => {
      issueMarks()[0].click();
    });

    expect(screen.queryByText("Uygula")).toBeNull();
    expect(screen.getByText("Yoksay")).toBeDefined();
    expect(
      screen.getByText("Otomatik düzeltme yok — bu bilgi amaçlı bir uyarı."),
    ).toBeDefined();
  });

  it("işaret dışına tıklamak popover'ı kapatır", async () => {
    renderEditor();
    await turnAiOn();
    await waitFor(() => expect(issueMarks()).toHaveLength(1));
    await act(async () => {
      issueMarks()[0].click();
    });
    expect(screen.getByText(ISSUE.message)).toBeDefined();

    await act(async () => {
      (document.querySelector(".ProseMirror") as HTMLElement).click();
    });

    expect(screen.queryByText(ISSUE.message)).toBeNull();
  });
});

describe("EssayEditor — düzeltmeyi uygulamak", () => {
  beforeEach(() => {
    mockFetch({ "/api/ai/check": { body: { issues: [ISSUE] } } });
  });

  async function openPopover() {
    renderEditor();
    await turnAiOn();
    await waitFor(() => expect(issueMarks()).toHaveLength(1));
    await act(async () => {
      issueMarks()[0].click();
    });
  }

  /** Zincirin en kritik adımı: metin gerçekten ve SADECE hedef yerde değişmeli. */
  it("Uygula, span'i replacement ile değiştirir", async () => {
    await openPopover();
    expect(editorText()).toContain("Yesterday I go to the cinema");

    await act(async () => {
      screen.getByText("Uygula").click();
    });

    expect(editorText()).toContain("Yesterday I went to the cinema");
    expect(editorText()).not.toContain("Yesterday I go to");
  });

  it("Uygula metnin geri kalanını bozmaz", async () => {
    await openPopover();
    const before = editorText();

    await act(async () => {
      screen.getByText("Uygula").click();
    });

    expect(editorText()).toBe(before.replace("I go", "I went"));
  });

  it("Uygula işareti ve popover'ı kaldırır", async () => {
    await openPopover();

    await act(async () => {
      screen.getByText("Uygula").click();
    });

    expect(screen.queryByText(ISSUE.message)).toBeNull();
    expect(issueMarks()).toHaveLength(0);
  });

  /** Öğrenme analitiği: kabul edilen öneriler koçluk planını besliyor. */
  it("Uygula, kabul edildi olarak kaydedilir", async () => {
    await openPopover();

    await act(async () => {
      screen.getByText("Uygula").click();
    });

    await waitFor(() => expect(callsTo("/api/feedback").length).toBe(1));
    expect(callsTo("/api/feedback")[0]).toEqual({
      essay_id: "essay-1",
      kind: "grammar",
      severity: "critical",
      source: "proactive",
      span_text: "I go",
      message: ISSUE.message,
      suggestion: "I went",
      status: "accepted",
    });
  });

  it("Yoksay metne dokunmaz ama işareti kaldırır", async () => {
    await openPopover();
    const before = editorText();

    await act(async () => {
      screen.getByText("Yoksay").click();
    });

    expect(editorText()).toBe(before);
    expect(issueMarks()).toHaveLength(0);
    expect(screen.queryByText(ISSUE.message)).toBeNull();
  });

  it("Yoksay, reddedildi olarak kaydedilir ve öneri metni göndermez", async () => {
    await openPopover();

    await act(async () => {
      screen.getByText("Yoksay").click();
    });

    await waitFor(() => expect(callsTo("/api/feedback").length).toBe(1));
    const body = callsTo("/api/feedback")[0];
    expect(body.status).toBe("dismissed");
    expect(body.suggestion).toBeUndefined();
  });

  it("analitik çağrısı patlarsa editör çalışmaya devam eder", async () => {
    mockFetch({
      "/api/ai/check": { body: { issues: [ISSUE] } },
      "/api/feedback": { status: 500, body: { error: "boom" } },
    });
    await openPopover();

    await act(async () => {
      screen.getByText("Uygula").click();
    });

    expect(editorText()).toContain("I went");
  });
});

describe("EssayEditor — Tamamla & Değerlendir", () => {
  const completeButton = () => screen.getByText(/Tamamla & Değerlendir/);

  /** 20 kelimenin altında notlama anlamsız — sunucuya hiç gidilmez. */
  it("20 kelimeden kısa metinde uyarı verir, sunucuya gitmez", async () => {
    mockFetch();
    renderEditor({ initialContent: contentOf("Only a few words here.") });

    await act(async () => {
      completeButton().click();
    });

    expect(
      screen.getByText("Değerlendirme için biraz daha yaz (en az ~20 kelime)."),
    ).toBeDefined();
    expect(callsTo("/api/ai/grade")).toHaveLength(0);
  });

  it("önce essay'i kaydeder, sonra değerlendirmeye gönderir", async () => {
    mockFetch({ "/api/ai/grade": { body: { grade: {}, new_level: "B1" } } });
    renderEditor();

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() => expect(callsTo("/api/ai/grade").length).toBe(1));

    const save = supabase.oneOp("essays.update");
    const payload = save.payload as Record<string, unknown>;
    expect(payload.title).toBe("My weekend");
    expect(payload.plain_text).toContain("Yesterday I go to the cinema");
    expect(payload.word_count).toBe(23);
    expect(payload.content).toBeDefined();
    expect(save.filters).toContainEqual({ method: "eq", args: ["id", "essay-1"] });
  });

  it("değerlendirmeye essayId gönderir", async () => {
    mockFetch({ "/api/ai/grade": { body: { grade: {} } } });
    renderEditor({ essayId: "essay-77" });

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() => expect(callsTo("/api/ai/grade").length).toBe(1));
    expect(callsTo("/api/ai/grade")[0]).toEqual({ essayId: "essay-77" });
  });

  it("başarılı olursa essay detayına yönlendirir", async () => {
    mockFetch({ "/api/ai/grade": { body: { grade: {} } } });
    renderEditor({ essayId: "essay-42" });

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() =>
      expect(navigationState.push).toHaveBeenCalledWith("/essays/essay-42"),
    );
  });

  /** Sunucudan gelen Türkçe hata mesajı öğrenciye olduğu gibi gösterilir. */
  it("sunucu hatasında mesajı gösterir ve yönlendirmez", async () => {
    mockFetch({
      "/api/ai/grade": {
        status: 429,
        body: { error: "AI kotası doldu. Birkaç dakika sonra tekrar dene." },
      },
    });
    renderEditor();

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() =>
      expect(
        screen.getByText("AI kotası doldu. Birkaç dakika sonra tekrar dene."),
      ).toBeDefined(),
    );
    expect(navigationState.push).not.toHaveBeenCalled();
  });

  it("hata sonrası düğme yeniden denenebilir olur", async () => {
    mockFetch({ "/api/ai/grade": { status: 500, body: { error: "Olmadı." } } });
    renderEditor();

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() => expect(screen.getByText("Olmadı.")).toBeDefined());
    expect((completeButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("başlık boşsa 'Untitled' olarak kaydedilir", async () => {
    mockFetch({ "/api/ai/grade": { body: { grade: {} } } });
    renderEditor({ initialTitle: "" });

    await act(async () => {
      completeButton().click();
    });

    await waitFor(() => expect(supabase.opsFor("essays.update").length).toBe(1));
    expect(
      (supabase.oneOp("essays.update").payload as Record<string, unknown>).title,
    ).toBe("Untitled");
  });
});
