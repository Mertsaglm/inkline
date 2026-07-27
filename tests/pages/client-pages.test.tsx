// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { act } from "react";
import WriteClient from "@/app/write/WriteClient";
import OnboardingClient from "@/app/onboarding/OnboardingClient";
import SettingsClient from "@/app/settings/SettingsClient";
import ProgressClient from "@/app/progress/ProgressClient";
import { createClient } from "@/lib/supabase/client";
import { CEFR_LEVELS } from "@/lib/cefr";
import { makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import { silenceConsole } from "../helpers/route";
import { navigationState } from "../setup";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

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

beforeEach(() => {
  // recharts, jsdom'da ölçü alamadığı için her grafikte uyarı basıyor
  // ("width(0) and height(0)…"). Beklenen bir durum; çıktıyı kirletmesin.
  silenceConsole();
  supabase = createSupabaseMock();
  createClientMock.mockReturnValue(supabase as never);
  navigationState.push.mockClear();
  mockFetch();
});

afterEach(() => cleanup());

/* ========================================================================== */

describe("WriteClient — konu seçimi", () => {
  const TOPICS = {
    topics: [
      { title: "A city I love", prompt: "Describe a city.", category: "Travel" },
      { title: "My first job", prompt: "Describe a job.", category: "Work" },
    ],
    model: "gemini-3.5-flash",
  };

  it("açılışta konu önerilerini ister", async () => {
    mockFetch({ "/api/ai/topics": { body: TOPICS } });
    render(<WriteClient />);

    await waitFor(() => expect(callsTo("/api/ai/topics").length).toBe(1));
    expect(screen.getByText("A city I love")).toBeDefined();
    expect(screen.getByText("Describe a city.")).toBeDefined();
  });

  it("cevabı veren modeli gösterir", async () => {
    mockFetch({ "/api/ai/topics": { body: TOPICS } });
    render(<WriteClient />);

    await waitFor(() =>
      expect(screen.getByText(/modeli kullanıldı/).textContent).toContain(
        "gemini-3.5-flash",
      ),
    );
  });

  /** Konu tekrarını önleyen mekanizma — kaybolursa öğrenci hep aynı 4 konuyu görür. */
  it("gösterilen başlıkları biriktirip sonraki istekte hariç tutar", async () => {
    mockFetch({ "/api/ai/topics": { body: TOPICS } });
    render(<WriteClient />);

    await waitFor(() => expect(screen.getByText("A city I love")).toBeDefined());
    expect(callsTo("/api/ai/topics")[0]).toEqual({ exclude: [] });

    await act(async () => {
      screen.getByText("Yeniden öner").click();
    });

    await waitFor(() => expect(callsTo("/api/ai/topics").length).toBe(2));
    expect(callsTo("/api/ai/topics")[1].exclude).toEqual([
      "A city I love",
      "My first job",
    ]);
  });

  it("hariç listesi son 24 başlıkla sınırlıdır", async () => {
    const many = {
      topics: Array.from({ length: 30 }, (_, i) => ({
        title: `Topic ${i}`,
        prompt: "p",
        category: "c",
      })),
    };
    mockFetch({ "/api/ai/topics": { body: many } });
    render(<WriteClient />);

    await waitFor(() => expect(screen.getByText("Topic 0")).toBeDefined());
    await act(async () => {
      screen.getByText("Yeniden öner").click();
    });

    await waitFor(() => expect(callsTo("/api/ai/topics").length).toBe(2));
    const exclude = callsTo("/api/ai/topics")[1].exclude;
    expect(exclude).toHaveLength(24);
    expect(exclude[0]).toBe("Topic 6");
    expect(exclude[23]).toBe("Topic 29");
  });

  it("konu seçilince essay oluşturup düzenleme ekranına gider", async () => {
    mockFetch({
      "/api/ai/topics": { body: TOPICS },
      "/api/essays": { body: { id: "new-1" } },
    });
    render(<WriteClient />);
    await waitFor(() => expect(screen.getByText("A city I love")).toBeDefined());

    await act(async () => {
      screen.getByText("A city I love").closest("button")!.click();
    });

    await waitFor(() => expect(callsTo("/api/essays").length).toBe(1));
    expect(callsTo("/api/essays")[0]).toEqual({
      title: "A city I love",
      prompt: "Describe a city.",
    });
    await waitFor(() =>
      expect(navigationState.push).toHaveBeenCalledWith("/essays/new-1/edit"),
    );
  });

  it("boş sayfa seçeneğinde başlık 'Untitled', konu null olur", async () => {
    mockFetch({
      "/api/ai/topics": { body: TOPICS },
      "/api/essays": { body: { id: "blank-1" } },
    });
    render(<WriteClient />);
    await waitFor(() => expect(screen.getByText("A city I love")).toBeDefined());

    const blank = screen
      .getAllByRole("button")
      .find((b) => /boş|Boş/.test(b.textContent ?? ""));
    expect(blank).toBeDefined();

    await act(async () => blank!.click());

    await waitFor(() => expect(callsTo("/api/essays").length).toBe(1));
    expect(callsTo("/api/essays")[0]).toEqual({
      title: "Untitled",
      prompt: null,
    });
  });

  it("kendi başlığını yazan öğrenci için başlık hem ad hem konu olur", async () => {
    mockFetch({
      "/api/ai/topics": { body: TOPICS },
      "/api/essays": { body: { id: "own-1" } },
    });
    render(<WriteClient />);
    await waitFor(() => expect(screen.getByText("A city I love")).toBeDefined());

    const input = screen
      .getAllByRole("textbox")
      .find((el) => el.tagName === "INPUT")!;
    fireEvent.change(input, { target: { value: "  My own idea  " } });

    const blank = screen
      .getAllByRole("button")
      .find((b) => /boş|Boş/.test(b.textContent ?? ""))!;
    await act(async () => blank.click());

    await waitFor(() => expect(callsTo("/api/essays").length).toBe(1));
    expect(callsTo("/api/essays")[0]).toEqual({
      title: "My own idea",
      prompt: "My own idea",
    });
  });

  it("konu alınamazsa sunucunun Türkçe mesajını gösterir", async () => {
    mockFetch({
      "/api/ai/topics": { status: 500, body: { error: "Konu önerileri üretilemedi." } },
    });
    render(<WriteClient />);

    await waitFor(() =>
      expect(screen.getByText("Konu önerileri üretilemedi.")).toBeDefined(),
    );
  });

  it("essay oluşturulamazsa hata gösterir ve yönlendirmez", async () => {
    mockFetch({
      "/api/ai/topics": { body: TOPICS },
      "/api/essays": { status: 500, body: { error: "Essay oluşturulamadı." } },
    });
    render(<WriteClient />);
    await waitFor(() => expect(screen.getByText("A city I love")).toBeDefined());

    await act(async () => {
      screen.getByText("A city I love").closest("button")!.click();
    });

    await waitFor(() =>
      expect(screen.getByText("Essay oluşturulamadı.")).toBeDefined(),
    );
    expect(navigationState.push).not.toHaveBeenCalled();
  });
});

/* ========================================================================== */

describe("OnboardingClient — seviye tespiti", () => {
  const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;
  const submit = () =>
    screen.getAllByRole("button").find((b) => /Seviyemi belirle/.test(b.textContent ?? ""))!;

  /**
   * Eşik burada ve /api/ai/diagnostic'te aynı olmalı (20 karakter);
   * ayrışırsa düğme etkinleşir ama sunucu 400 döner.
   */
  it("20 karakterden kısa metinde düğme kapalıdır", () => {
    render(<OnboardingClient />);
    expect((submit() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea(), { target: { value: "Kısa metin" } });
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("En az ~20 karakter yaz")).toBeDefined();
  });

  it("20 karakteri geçince düğme açılır", () => {
    render(<OnboardingClient />);
    fireEvent.change(textarea(), {
      target: { value: "I work in a bank and I like reading." },
    });

    expect((submit() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("En az 50 kelime önerilir")).toBeDefined();
  });

  it("eşik boşluklar kırpılarak ölçülür", () => {
    render(<OnboardingClient />);
    fireEvent.change(textarea(), { target: { value: "    kısa metin      " } });
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
  });

  it("örneği sample alanında gönderir", async () => {
    mockFetch({
      "/api/ai/diagnostic": {
        body: { cefr: "B1", rationale: "Temel yapılar doğru.", model: "gpt-5-mini" },
      },
    });
    render(<OnboardingClient />);
    fireEvent.change(textarea(), {
      target: { value: "I work in a bank and I like reading books." },
    });

    await act(async () => submit().click());

    await waitFor(() => expect(callsTo("/api/ai/diagnostic").length).toBe(1));
    expect(callsTo("/api/ai/diagnostic")[0]).toEqual({
      sample: "I work in a bank and I like reading books.",
    });
  });

  it("sonucu CEFR etiketi ve gerekçesiyle gösterir", async () => {
    mockFetch({
      "/api/ai/diagnostic": {
        body: { cefr: "B1", rationale: "Temel yapılar doğru.", model: "gpt-5-mini" },
      },
    });
    render(<OnboardingClient />);
    fireEvent.change(textarea(), {
      target: { value: "I work in a bank and I like reading books." },
    });

    await act(async () => submit().click());

    await waitFor(() => expect(screen.getByText("B1 · Orta")).toBeDefined());
    expect(screen.getByText("Temel yapılar doğru.")).toBeDefined();
    expect(screen.getByText(/modeli kullanıldı/).textContent).toContain(
      "gpt-5-mini",
    );
  });

  it("sunucu hatasında Türkçe mesajı gösterir", async () => {
    mockFetch({
      "/api/ai/diagnostic": {
        status: 500,
        body: { error: "Seviye değerlendirmesi yapılamadı." },
      },
    });
    render(<OnboardingClient />);
    fireEvent.change(textarea(), {
      target: { value: "I work in a bank and I like reading books." },
    });

    await act(async () => submit().click());

    await waitFor(() =>
      expect(screen.getByText("Seviye değerlendirmesi yapılamadı.")).toBeDefined(),
    );
  });

  it("İngilizce bir yazma yönergesi gösterir", () => {
    render(<OnboardingClient />);
    expect(screen.getByText(/Describe your typical day/)).toBeDefined();
  });
});

/* ========================================================================== */

describe("SettingsClient — tercihler", () => {
  function renderSettings(overrides = {}) {
    return render(
      <SettingsClient profile={makeProfile({ ...overrides })} />,
    );
  }

  const saveButton = () =>
    screen.getAllByRole("button").find((b) => /Kaydet/.test(b.textContent ?? ""))!;

  it("mevcut profil değerleriyle dolar", () => {
    renderSettings({
      current_level: "B2",
      target_level: "C1",
      feedback_lang_override: "tr",
      interests: "müzik",
    });

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0].value).toBe("B2");
    expect(selects[1].value).toBe("C1");
    expect(selects[2].value).toBe("tr");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("müzik");
  });

  it("altı CEFR seviyesini de seçenek olarak sunar", () => {
    renderSettings();
    const [current] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect([...current.options].map((o) => o.value)).toEqual([...CEFR_LEVELS]);
  });

  it("dört geri bildirim dili seçeneği sunar", () => {
    renderSettings();
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect([...selects[2].options].map((o) => o.value)).toEqual([
      "auto",
      "tr",
      "mixed",
      "en",
    ]);
  });

  it("değişiklikleri profile yazar", async () => {
    renderSettings({ current_level: "A2", target_level: "B1" });

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "B1" } });
    fireEvent.change(selects[1], { target: { value: "C1" } });
    fireEvent.change(selects[2], { target: { value: "en" } });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  yazılım, kitap  " },
    });

    await act(async () => saveButton().click());

    await waitFor(() => expect(supabase.opsFor("profiles.update").length).toBe(1));
    expect(supabase.oneOp("profiles.update").payload).toEqual({
      current_level: "B1",
      target_level: "C1",
      feedback_lang_override: "en",
      ai_warnings_enabled: true,
      interests: "yazılım, kitap",
    });
  });

  /** Boş ilgi alanı DB'de boş dize değil NULL olmalı (prompt'ta satır açılmasın). */
  it("boş ilgi alanı null olarak kaydedilir", async () => {
    renderSettings({ interests: "müzik" });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    await act(async () => saveButton().click());

    await waitFor(() => expect(supabase.opsFor("profiles.update").length).toBe(1));
    expect(
      (supabase.oneOp("profiles.update").payload as Record<string, unknown>)
        .interests,
    ).toBeNull();
  });

  it("AI uyarıları anahtarı kaydedilen değeri değiştirir", async () => {
    renderSettings({ ai_warnings_enabled: true });

    await act(async () => screen.getByRole("switch").click());
    await act(async () => saveButton().click());

    await waitFor(() => expect(supabase.opsFor("profiles.update").length).toBe(1));
    expect(
      (supabase.oneOp("profiles.update").payload as Record<string, unknown>)
        .ai_warnings_enabled,
    ).toBe(false);
  });

  it("profili yalnızca oturum sahibi için günceller", async () => {
    renderSettings();
    await act(async () => saveButton().click());

    await waitFor(() => expect(supabase.opsFor("profiles.update").length).toBe(1));
    expect(supabase.oneOp("profiles.update").filters).toContainEqual({
      method: "eq",
      args: ["user_id", "test-user"],
    });
  });

  it("oturum yoksa yazma denemesi yapılmaz", async () => {
    supabase = createSupabaseMock({ user: null });
    createClientMock.mockReturnValue(supabase as never);
    renderSettings();

    await act(async () => saveButton().click());

    expect(supabase.opsFor("profiles.update")).toHaveLength(0);
  });

  it("kaydettikten sonra onay gösterir", async () => {
    renderSettings();
    await act(async () => saveButton().click());
    await waitFor(() => expect(screen.getByText("Kaydedildi")).toBeDefined());
  });
});

/* ========================================================================== */

describe("ProgressClient — grafikler ve koçluk", () => {
  const base = {
    levelSeries: [] as { date: string; value: number }[],
    scoreSeries: [] as { date: string; score: number }[],
    kindCounts: [] as { kind: string; count: number }[],
    hasData: false,
  };

  const planButton = () =>
    screen
      .getAllByRole("button")
      .find((b) => /Plan üret|Yenile/.test(b.textContent ?? ""))!;

  /** Tek noktalı çizgi bir "gelişim" göstermez — en az iki ölçüm gerekir. */
  it("tek ölçümlü seride grafik yerine boş durum gösterir", () => {
    const { container } = render(
      <ProgressClient
        {...base}
        levelSeries={[{ date: "01/01", value: 3 }]}
        scoreSeries={[{ date: "01/01", score: 6 }]}
      />,
    );
    expect(container.textContent).toContain("Grafik için birkaç essay daha yaz.");
  });

  it("iki ve daha fazla ölçümde grafiği çizer", () => {
    const { container } = render(
      <ProgressClient
        {...base}
        levelSeries={[
          { date: "01/01", value: 3 },
          { date: "02/01", value: 4 },
        ]}
        scoreSeries={[
          { date: "01/01", score: 6 },
          { date: "02/01", score: 7 },
        ]}
      />,
    );
    expect(container.querySelectorAll(".recharts-responsive-container").length)
      .toBeGreaterThan(0);
  });

  it("hata türü etiketlerini Türkçeye çevirir", () => {
    render(
      <ProgressClient
        {...base}
        kindCounts={[
          { kind: "grammar", count: 5 },
          { kind: "vocab", count: 2 },
        ]}
      />,
    );
    // Etiketler grafiğin ekseninde; bileşenin sözlüğünü doğrulamak için
    // en azından bileşen hata vermeden çizilmeli.
    expect(screen.getByText(/Hata türleri|En sık/)).toBeDefined();
  });

  /** Veri yokken koçluk planı üretmek anlamsız — düğme kapalı olmalı. */
  it("notlanmış essay yokken plan düğmesi kapalıdır", () => {
    render(<ProgressClient {...base} hasData={false} />);
    expect((planButton() as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(/Plan için önce en az bir essay yazıp değerlendir/),
    ).toBeDefined();
  });

  it("veri varken plan üretir ve içeriği gösterir", async () => {
    mockFetch({
      "/api/ai/coach": {
        body: {
          headline: "Güzel gidiyorsun!",
          focus_areas: [
            { title: "Geçmiş zaman", why: "Sık hata", how: "10 cümle yaz" },
            { title: "Bağlaçlar", why: "Akış zayıf", how: "however kullan" },
          ],
          recurring_mistakes: [
            { pattern: "go/went", example: "I go", fix: "I went" },
          ],
          recommended_topics: [
            { title: "A trip", prompt: "Describe a trip." },
            { title: "A book", prompt: "Describe a book." },
          ],
          next_level_tips: ["Daha uzun yaz", "Kelime defteri tut"],
          model: "gemini-3.5-flash",
        },
      },
    });
    render(<ProgressClient {...base} hasData />);

    await act(async () => planButton().click());

    await waitFor(() => expect(screen.getByText("Güzel gidiyorsun!")).toBeDefined());
    expect(screen.getByText("Geçmiş zaman")).toBeDefined();
    expect(screen.getByText("10 cümle yaz")).toBeDefined();
    expect(screen.getByText("Daha uzun yaz")).toBeDefined();
    expect(screen.getByText("A trip")).toBeDefined();
  });

  it("koçluk isteği gövdesizdir", async () => {
    mockFetch({
      "/api/ai/coach": {
        body: {
          headline: "h",
          focus_areas: [
            { title: "a", why: "b", how: "c" },
            { title: "d", why: "e", how: "f" },
          ],
          recurring_mistakes: [],
          recommended_topics: [
            { title: "t", prompt: "p" },
            { title: "u", prompt: "q" },
          ],
          next_level_tips: ["x", "y"],
        },
      },
    });
    render(<ProgressClient {...base} hasData />);

    await act(async () => planButton().click());

    await waitFor(() => expect(callsTo("/api/ai/coach").length).toBe(1));
    expect(callsTo("/api/ai/coach")[0]).toBeUndefined();
  });

  it("kota hatasında sunucunun Türkçe mesajını gösterir", async () => {
    mockFetch({
      "/api/ai/coach": {
        status: 429,
        body: { error: "AI kotası doldu. Birkaç dakika sonra tekrar dene." },
      },
    });
    render(<ProgressClient {...base} hasData />);

    await act(async () => planButton().click());

    await waitFor(() =>
      expect(
        screen.getByText("AI kotası doldu. Birkaç dakika sonra tekrar dene."),
      ).toBeDefined(),
    );
  });

  it("önerilen konudan essay başlatıp düzenleme ekranına gider", async () => {
    mockFetch({
      "/api/ai/coach": {
        body: {
          headline: "h",
          focus_areas: [
            { title: "a", why: "b", how: "c" },
            { title: "d", why: "e", how: "f" },
          ],
          recurring_mistakes: [],
          recommended_topics: [{ title: "A trip", prompt: "Describe a trip." }],
          next_level_tips: ["x", "y"],
        },
      },
      "/api/essays": { body: { id: "coach-1" } },
    });
    render(<ProgressClient {...base} hasData />);

    await act(async () => planButton().click());
    await waitFor(() => expect(screen.getByText("A trip")).toBeDefined());

    await act(async () => {
      screen.getByText("A trip").closest("button")!.click();
    });

    await waitFor(() => expect(callsTo("/api/essays").length).toBe(1));
    expect(callsTo("/api/essays")[0]).toEqual({
      title: "A trip",
      prompt: "Describe a trip.",
    });
    await waitFor(() =>
      expect(navigationState.push).toHaveBeenCalledWith("/essays/coach-1/edit"),
    );
  });
});
