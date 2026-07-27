// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { act } from "react";
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import EssayEditor from "@/components/editor/EssayEditor";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";

/**
 * ============================================================================
 *  İsteğe bağlı AI yardımı (sağ çekmece).
 *
 *  Öğrenci bir metin seçip yardım istiyor; gelen öneriler tek tek onaylanıp
 *  reddedilebiliyor. En kırılgan kısım: onaylanmış bir öneriyi GERİ ALMAK.
 *  Bileşen bunu `replaceFirst(editor, replacement, span_text)` ile — yani
 *  değiştirmeyi ters yönde uygulayarak — yapıyor. Argümanların sırası
 *  yanlışlıkla düzeltilirse "geri al" hiçbir şey yapmaz ya da metni ikinci
 *  kez bozar; ekranda hata görünmez.
 *
 *  Seçim yapabilmek için editör örneğini yakalıyoruz: `useEditor` gerçek
 *  uygulamayı çağırıyor, sadece dönen referansı test için saklıyoruz.
 * ============================================================================
 */

let capturedEditor: Editor | null = null;

vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: ((...args: Parameters<typeof actual.useEditor>) => {
      const editor = actual.useEditor(...args);
      capturedEditor = editor;
      return editor;
    }) as typeof actual.useEditor,
  };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

const TEXT =
  "Yesterday I go to the cinema with my friends and we watched a very long film about space.";

function contentOf(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const SUGGESTIONS = {
  suggestions: [
    {
      type: "grammar",
      title: "Zaman uyumu",
      explanation: "Geçmiş olay anlatılıyor, geçmiş zaman gerekir.",
      span_text: "I go",
      replacement: "I went",
    },
    {
      type: "vocab",
      title: "Daha doğal kelime",
      explanation: "'very long' yerine daha güçlü bir sıfat kullan.",
      span_text: "very long",
      replacement: "lengthy",
    },
    {
      type: "style",
      title: "Genel tavsiye",
      explanation: "Paragrafı ikiye bölmeyi düşün.",
      span_text: null,
      replacement: null,
    },
  ],
  model: "gemini-3.5-flash",
};

let supabase: SupabaseMock;
let fetchMock: ReturnType<typeof vi.fn>;

function mockFetch(routes: Record<string, { status?: number; body: unknown }> = {}) {
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

function callsTo(path: string) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes(path))
    .map(([, init]) => {
      const body = (init as RequestInit | undefined)?.body;
      return body ? JSON.parse(String(body)) : undefined;
    });
}

function editorText() {
  return document.querySelector(".ProseMirror")?.textContent ?? "";
}

function renderEditor(text = TEXT) {
  const result = render(
    <EssayEditor
      essayId="essay-1"
      initialTitle="My weekend"
      initialPrompt={null}
      initialContent={contentOf(text)}
      aiWarningsEnabled={false}
      level="B1"
    />,
  );
  // jsdom düzen bilgisi vermiyor; konumlandırma çağrısını sabitle.
  vi.spyOn(capturedEditor!.view, "coordsAtPos").mockReturnValue({
    top: 10,
    bottom: 20,
    left: 5,
    right: 40,
  });
  return result;
}

/** Metnin bir aralığını seçer → "AI yardım" düğmesi belirir. */
async function selectRange(from: number, to: number) {
  await act(async () => {
    capturedEditor!.commands.setTextSelection({ from, to });
  });
}

/** Verilen alt dizeyi seçer. */
async function selectText(needle: string) {
  const index = TEXT.indexOf(needle);
  expect(index, `"${needle}" metinde yok`).toBeGreaterThanOrEqual(0);
  await selectRange(1 + index, 1 + index + needle.length);
}

async function openAssist(needle = "I go to the cinema") {
  await selectText(needle);
  await act(async () => {
    screen.getByText("AI yardım").click();
  });
  await waitFor(() => expect(callsTo("/api/ai/assist").length).toBe(1));
}

beforeEach(() => {
  capturedEditor = null;
  supabase = createSupabaseMock();
  createClientMock.mockReturnValue(supabase as never);
  mockFetch({ "/api/ai/assist": { body: SUGGESTIONS } });
});

afterEach(() => cleanup());

describe("Seçim → AI yardım düğmesi", () => {
  it("seçim yokken düğme görünmez", () => {
    renderEditor();
    expect(screen.queryByText("AI yardım")).toBeNull();
  });

  it("metin seçilince düğme belirir", async () => {
    renderEditor();
    await selectText("I go");
    expect(screen.getByText("AI yardım")).toBeDefined();
  });

  /** Tek harflik seçimde yardım istemek anlamsız — düğme çıkmamalı. */
  it("2 karakterden kısa seçimde düğme çıkmaz", async () => {
    renderEditor();
    await selectRange(1, 2);
    expect(screen.queryByText("AI yardım")).toBeNull();
  });

  it("seçim kalkınca düğme kaybolur", async () => {
    renderEditor();
    await selectText("I go");
    expect(screen.getByText("AI yardım")).toBeDefined();

    await selectRange(1, 1); // boş seçim
    expect(screen.queryByText("AI yardım")).toBeNull();
  });
});

describe("Yardım isteği", () => {
  it("seçili metni ve çevresini gönderir", async () => {
    renderEditor();
    await openAssist("I go to the cinema");

    const body = callsTo("/api/ai/assist")[0];
    expect(body.selection).toBe("I go to the cinema");
    expect(body.context).toContain("I go to the cinema");
  });

  /** Bağlam sınırlı olmalı; tüm essay gönderilirse token israfı olur. */
  it("bağlam seçimin çevresiyle sınırlıdır", async () => {
    const long = "A".repeat(400) + " I go to the cinema " + "B".repeat(400);
    render(
      <EssayEditor
        essayId="essay-1"
        initialTitle="t"
        initialPrompt={null}
        initialContent={contentOf(long)}
        aiWarningsEnabled={false}
        level="B1"
      />,
    );
    vi.spyOn(capturedEditor!.view, "coordsAtPos").mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });

    const index = long.indexOf("I go to the cinema");
    await selectRange(1 + index, 1 + index + "I go to the cinema".length);
    await act(async () => {
      screen.getByText("AI yardım").click();
    });
    await waitFor(() => expect(callsTo("/api/ai/assist").length).toBe(1));

    const body = callsTo("/api/ai/assist")[0];
    expect(body.context.length).toBeLessThanOrEqual(
      "I go to the cinema".length + 400,
    );
    expect(body.context).toContain("I go to the cinema");
    expect(body.context.length).toBeLessThan(long.length);
  });

  it("yüklenirken bilgi metni gösterir", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    renderEditor();
    await selectText("I go");
    await act(async () => {
      screen.getByText("AI yardım").click();
    });

    expect(screen.getByText("Öneriler hazırlanıyor…")).toBeDefined();

    await act(async () => {
      resolve(
        new Response(JSON.stringify(SUGGESTIONS), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  });

  it("önerileri başlık ve açıklamasıyla listeler", async () => {
    renderEditor();
    await openAssist();

    await waitFor(() => expect(screen.getByText("Zaman uyumu")).toBeDefined());
    expect(
      screen.getByText("Geçmiş olay anlatılıyor, geçmiş zaman gerekir."),
    ).toBeDefined();
    expect(screen.getByText("Daha doğal kelime")).toBeDefined();
  });

  it("cevabı veren modeli gösterir", async () => {
    renderEditor();
    await openAssist();

    await waitFor(() =>
      expect(screen.getByText(/modeli kullanıldı/).textContent).toContain(
        "gemini-3.5-flash",
      ),
    );
  });

  it("sunucu hatasında Türkçe mesajı gösterir", async () => {
    mockFetch({
      "/api/ai/assist": { status: 500, body: { error: "Yardım üretilemedi." } },
    });
    renderEditor();
    await openAssist();

    await waitFor(() =>
      expect(screen.getByText("Yardım üretilemedi.")).toBeDefined(),
    );
  });

  it("çekmece kapatılabilir", async () => {
    renderEditor();
    await openAssist();
    await waitFor(() => expect(screen.getByText("Zaman uyumu")).toBeDefined());

    await act(async () => {
      screen.getByLabelText("Kapat").click();
    });

    expect(screen.queryByText("Zaman uyumu")).toBeNull();
  });
});

describe("Önerileri onaylamak ve geri almak", () => {
  async function setup() {
    renderEditor();
    await openAssist();
    await waitFor(() => expect(screen.getByText("Zaman uyumu")).toBeDefined());
  }

  const approveButtons = () =>
    screen
      .getAllByRole("button")
      .filter((b) => /Onayla|Uygulandı/.test(b.textContent ?? ""));
  const rejectButtons = () =>
    screen
      .getAllByRole("button")
      .filter((b) => /Reddet|Reddedildi/.test(b.textContent ?? ""));

  /** Somut düzenlemesi olmayan öneri için düğme çizilmez. */
  it("yalnızca düzenlemesi olan öneriler için düğme çizilir", async () => {
    await setup();

    expect(approveButtons()).toHaveLength(2);
    expect(rejectButtons()).toHaveLength(2);
    expect(screen.getByText("Bilgi amaçlı öneri")).toBeDefined();
  });

  it("onaylamak metni değiştirir", async () => {
    await setup();
    expect(editorText()).toContain("Yesterday I go to");

    await act(async () => approveButtons()[0].click());

    expect(editorText()).toContain("Yesterday I went to");
  });

  it("onaylanan öneri 'Uygulandı' olarak işaretlenir", async () => {
    await setup();

    await act(async () => approveButtons()[0].click());

    expect(screen.getByText("Uygulandı")).toBeDefined();
  });

  /**
   * ⚠ En kırılgan davranış: ikinci tıklama değişikliği GERİ ALIR
   * (`replaceFirst(editor, replacement, span_text)` — ters yönde).
   */
  it("aynı düğmeye tekrar basmak değişikliği geri alır", async () => {
    await setup();
    const original = editorText();

    await act(async () => approveButtons()[0].click());
    expect(editorText()).toContain("I went");

    await act(async () => approveButtons()[0].click());

    expect(editorText()).toBe(original);
    expect(screen.queryByText("Uygulandı")).toBeNull();
  });

  it("geri almak metnin geri kalanını bozmaz", async () => {
    await setup();
    const original = editorText();

    await act(async () => approveButtons()[0].click());
    await act(async () => approveButtons()[0].click());
    await act(async () => approveButtons()[0].click());
    await act(async () => approveButtons()[0].click());

    expect(editorText()).toBe(original);
  });

  it("iki öneri bağımsız olarak uygulanabilir", async () => {
    await setup();

    await act(async () => approveButtons()[0].click());
    await act(async () => approveButtons()[1].click());

    expect(editorText()).toContain("I went");
    expect(editorText()).toContain("lengthy film");
    expect(editorText()).not.toContain("very long");
  });

  it("bir öneriyi geri almak diğerini etkilemez", async () => {
    await setup();

    await act(async () => approveButtons()[0].click());
    await act(async () => approveButtons()[1].click());
    await act(async () => approveButtons()[0].click()); // ilkini geri al

    expect(editorText()).toContain("I go");
    expect(editorText()).toContain("lengthy film");
  });

  it("onaylanan öneri analitiğe 'accepted' olarak yazılır", async () => {
    await setup();

    await act(async () => approveButtons()[0].click());

    await waitFor(() => expect(callsTo("/api/feedback").length).toBe(1));
    expect(callsTo("/api/feedback")[0]).toEqual({
      essay_id: "essay-1",
      kind: "grammar",
      severity: "suggestion",
      source: "on_demand",
      span_text: "I go",
      suggestion: "I went",
      message: "Zaman uyumu",
      status: "accepted",
    });
  });

  it("reddedilen öneri metne dokunmaz, 'dismissed' olarak yazılır", async () => {
    await setup();
    const original = editorText();

    await act(async () => rejectButtons()[0].click());

    expect(editorText()).toBe(original);
    expect(screen.getByText("Reddedildi")).toBeDefined();

    await waitFor(() => expect(callsTo("/api/feedback").length).toBe(1));
    const body = callsTo("/api/feedback")[0];
    expect(body.status).toBe("dismissed");
    expect(body.source).toBe("on_demand");
    expect(body.suggestion).toBeUndefined();
  });

  it("reddi geri almak da mümkündür", async () => {
    await setup();

    await act(async () => rejectButtons()[0].click());
    expect(screen.getByText("Reddedildi")).toBeDefined();

    await act(async () => rejectButtons()[0].click());
    expect(screen.queryByText("Reddedildi")).toBeNull();
  });

  /** Düzenleme uygulandıktan sonra kalan hatalar için yeni kontrol tetiklenir. */
  it("AI uyarıları açıkken onay sonrası yeniden kontrol planlanır", async () => {
    vi.useFakeTimers();
    try {
      mockFetch({
        "/api/ai/assist": { body: SUGGESTIONS },
        "/api/ai/check": { body: { issues: [] } },
      });
      render(
        <EssayEditor
          essayId="essay-1"
          initialTitle="t"
          initialPrompt={null}
          initialContent={contentOf(TEXT)}
          aiWarningsEnabled
          level="B1"
        />,
      );
      vi.spyOn(capturedEditor!.view, "coordsAtPos").mockReturnValue({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      });

      const index = TEXT.indexOf("I go");
      await act(async () => {
        capturedEditor!.commands.setTextSelection({
          from: 1 + index,
          to: 1 + index + 4,
        });
      });
      await act(async () => {
        screen.getByText("AI yardım").click();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const before = callsTo("/api/ai/check").length;
      await act(async () => {
        approveButtons()[0].click();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });

      expect(callsTo("/api/ai/check").length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
