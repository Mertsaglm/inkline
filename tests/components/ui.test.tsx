// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { act } from "react";
import ModelNote from "@/components/ModelNote";
import Nav from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
import SetupNotice from "@/components/SetupNotice";
import {
  INKLINE_GLYPH_PATH,
  InklineGlyph,
  InklineLockup,
  InklineWordmark,
} from "@/components/brand/Inkline";
import { navigationState } from "../setup";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("ModelNote", () => {
  /**
   * "Hangi model cevapladı" rozeti. Model bilinmiyorsa — ör. 0002 göçünden
   * önceki notlar — HİÇBİR ŞEY çizilmemeli; boş bir rozet kafa karıştırır.
   */
  it("model yoksa hiçbir şey çizmez", () => {
    const { container } = render(<ModelNote model={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("undefined ve boş dizede de sessizdir", () => {
    expect(render(<ModelNote model={undefined} />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<ModelNote model="" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<ModelNote />).container.innerHTML).toBe("");
  });

  it("model adını Türkçe cümle içinde gösterir", () => {
    render(<ModelNote model="gemini-3.5-flash" />);
    const note = screen.getByText(/modeli kullanıldı/);
    expect(note.textContent).toContain("Bu cevapta");
    expect(note.textContent).toContain("gemini-3.5-flash");
  });

  it("tam model adını title olarak taşır", () => {
    render(<ModelNote model="gpt-5-mini" />);
    expect(screen.getByTitle("Yanıt gpt-5-mini modeliyle üretildi")).toBeDefined();
  });

  it("ek sınıf adlarını korur", () => {
    render(<ModelNote model="x" className="mt-4" />);
    expect(screen.getByText(/modeli kullanıldı/).className).toContain("mt-4");
  });

  /** Sunucu bileşenlerinden de çağrılıyor — hook/state içermemeli. */
  it("state veya hook kullanmaz (sunucu bileşeninden çağrılabilir)", () => {
    expect(ModelNote.toString()).not.toMatch(/useState|useEffect|useRef/);
  });
});

describe("Nav", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  it("beş bağlantıyı Türkçe etiketlerle çizer", () => {
    render(<Nav />);
    for (const label of ["Panel", "Yaz", "Essaylerim", "Gelişim", "Ayarlar"]) {
      expect(screen.getByText(label), label).toBeDefined();
    }
  });

  it("bağlantılar doğru yollara gider", () => {
    render(<Nav />);
    const hrefs: Record<string, string> = {
      Panel: "/",
      Yaz: "/write",
      Essaylerim: "/essays",
      Gelişim: "/progress",
      Ayarlar: "/settings",
    };
    for (const [label, href] of Object.entries(hrefs)) {
      expect(screen.getByText(label).closest("a")?.getAttribute("href")).toBe(href);
    }
  });

  /** Kök TAM eşleşir; olmasaydı her sayfada "Panel" de etkin görünürdü. */
  it("kök bağlantısı yalnızca / üzerinde etkindir", () => {
    navigationState.pathname = "/";
    render(<Nav />);
    expect(screen.getByText("Panel").className).toContain("text-ink");

    cleanup();
    navigationState.pathname = "/essays";
    render(<Nav />);
    expect(screen.getByText("Panel").className).toContain("text-muted");
  });

  it("alt yollarda üst bağlantı etkin kalır", () => {
    navigationState.pathname = "/essays/abc-123/edit";
    render(<Nav />);

    expect(screen.getByText("Essaylerim").className).toContain("text-ink");
    expect(screen.getByText("Yaz").className).toContain("text-muted");
  });

  it("her yolda en fazla bir bağlantı etkindir", () => {
    for (const pathname of [
      "/",
      "/write",
      "/essays",
      "/essays/1",
      "/progress",
      "/settings",
    ]) {
      cleanup();
      navigationState.pathname = pathname;
      const { container } = render(<Nav />);
      // Etkin bağlantı altına coral çizgi koyar.
      const underlines = container.querySelectorAll(".bg-coral");
      expect(underlines.length, `${pathname} için ${underlines.length} etkin bağlantı`).toBe(1);
    }
  });

  it("tema düğmesini içerir", () => {
    render(<Nav />);
    expect(screen.getByLabelText("Tema değiştir")).toBeDefined();
  });

  it("logo panele bağlanır", () => {
    render(<Nav />);
    const logoLink = screen.getAllByRole("link")[0];
    expect(logoLink.getAttribute("href")).toBe("/");
  });
});

describe("ThemeToggle", () => {
  /**
   * Tema sözleşmesi iki dosyaya yayılmış: layout.tsx betiği `ink-theme`
   * anahtarını okuyup `.dark` sınıfını ekliyor, bu düğme yazıyor.
   * Anahtar adı ya da değerler ayrışırsa tema sayfa yenilenince kaybolur.
   */
  it("karanlık temayı açar ve localStorage'a 'dark' yazar", async () => {
    render(<ThemeToggle />);

    await act(async () => {
      screen.getByLabelText("Tema değiştir").click();
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("ink-theme")).toBe("dark");
  });

  it("karanlık temayı kapatır ve 'light' yazar", async () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    await act(async () => {
      screen.getByLabelText("Tema değiştir").click();
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("ink-theme")).toBe("light");
  });

  it("mevcut <html> sınıfından başlangıç durumunu okur", async () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    // Karanlıkken güneş ikonu (circle) çizilir.
    await act(async () => {});
    expect(document.querySelector("circle")).not.toBeNull();
  });

  it("açık temada ay ikonu çizilir", async () => {
    render(<ThemeToggle />);
    await act(async () => {});
    expect(document.querySelector("circle")).toBeNull();
  });

  it("iki tıklamada başlangıç durumuna döner", async () => {
    render(<ThemeToggle />);
    const button = screen.getByLabelText("Tema değiştir");

    await act(async () => button.click());
    await act(async () => button.click());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("ink-theme")).toBe("light");
  });
});

describe("SetupNotice", () => {
  it("kurulum başlığını ve .env.local yönergesini gösterir", () => {
    render(<SetupNotice />);
    expect(screen.getByText("Kurulum gerekli")).toBeDefined();
    expect(screen.getByText(".env.local")).toBeDefined();
  });

  /** Supabase eksikken beş adım: iki anahtar, anonim giriş, göç, AI, restart. */
  it("varsayılan hâlde beş adım, 1'den 5'e numaralandırılır", () => {
    const { container } = render(<SetupNotice />);
    const steps = [...container.querySelectorAll("li")];

    expect(steps).toHaveLength(5);
    expect(steps.map((li) => li.querySelector("span")?.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  /** Sadece AI anahtarı eksikse Supabase adımları gösterilmez. */
  it("needAi ile yalnızca iki adım kalır ve yeniden 1'den numaralanır", () => {
    const { container } = render(<SetupNotice needAi />);
    const steps = [...container.querySelectorAll("li")];

    expect(steps).toHaveLength(2);
    expect(steps.map((li) => li.querySelector("span")?.textContent)).toEqual([
      "1",
      "2",
    ]);
    expect(screen.queryByText(/Anonymous sign-ins/)).toBeNull();
  });

  it("gerekli env değişkenlerinin adlarını yazar", () => {
    render(<SetupNotice />);
    const text = document.body.textContent ?? "";
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
    ]) {
      expect(text, `${name} yönergede yok`).toContain(name);
    }
  });

  it("göç dosyasının yolunu doğru yazar", () => {
    render(<SetupNotice />);
    expect(screen.getByText("supabase/migrations/0001_init.sql")).toBeDefined();
  });

  it("panele ve ayarlara dönüş bağlantıları vardır", () => {
    render(<SetupNotice />);
    expect(screen.getByText("Panele dön").closest("a")?.getAttribute("href")).toBe("/");
    expect(screen.getByText("Ayarlar").closest("a")?.getAttribute("href")).toBe(
      "/settings",
    );
  });
});

describe("Inkline marka işareti", () => {
  /** Glif tek bir elle çizilmiş hat — path'i değişirse marka değişir. */
  it("glif path'i sabittir", () => {
    expect(INKLINE_GLYPH_PATH).toBe(
      "M3.4 18.9 L5.0 21.0 C11.0 20.3 16.9 15.1 21.9 3.5 C16.1 12.3 10.2 17.2 3.4 18.9 Z",
    );
  });

  it("glif currentColor ile boyanır (temayla uyumlu)", () => {
    const { container } = render(<InklineGlyph />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("fill")).toBe("currentColor");
    expect(path?.getAttribute("d")).toBe(INKLINE_GLYPH_PATH);
  });

  it("glif kare ve 24 birimlik ızgaradadır", () => {
    const { container } = render(<InklineGlyph size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  /**
   * "Ink" ve "line" ASLA boşluk/tire/camelCase ile ayrılmaz — ayrım
   * yapısaldır (ağırlık + opsz), renk değil (bkz. design/LOGO_SPEC.md).
   */
  it("kelime işareti tek parça 'Inkline' okunur", () => {
    render(<InklineWordmark />);
    expect(screen.getByText(/Ink/).textContent).toBe("Inkline");
  });

  it("'line' varsayılan olarak coral'dır", () => {
    render(<InklineWordmark />);
    const line = screen.getByText("line");
    expect(line.style.color).toContain("--coral");
  });

  /** mono, ayrımın renksiz de okunduğunun kanıtı. */
  it("mono modda renk uygulanmaz", () => {
    render(<InklineWordmark mono />);
    const line = screen.getByText("line");
    expect(line.style.color).toBe("");
    expect(line.style.opacity).toBe("");
  });

  it("mono modda bile ağırlık farkı korunur (yapısal ayrım)", () => {
    render(<InklineWordmark mono fontSize={40} />);
    const outer = screen.getByText(/Ink/);
    const line = screen.getByText("line");
    expect(outer.style.fontWeight).toBe("700");
    expect(line.style.fontWeight).toBe("380");
  });

  it("coralOpacity 'line'a uygulanır", () => {
    render(<InklineWordmark coralOpacity={0.88} />);
    expect(screen.getByText("line").style.opacity).toBe("0.88");
  });

  it("boyut eşiklerine göre spec değişir", () => {
    const weightAt = (fontSize: number) => {
      cleanup();
      render(<InklineWordmark fontSize={fontSize} />);
      return screen.getByText("line").style.fontWeight;
    };

    expect(weightAt(16)).toBe("360"); // < 18
    expect(weightAt(20)).toBe("370"); // < 24
    expect(weightAt(40)).toBe("380"); // < 120
    expect(weightAt(200)).toBe("380"); // >= 120
  });

  /** 24px altında "line" kendi tracking'ini almaz — "Ink"inkini miras alır. */
  it("24px altında line tracking'i miras alınır", () => {
    render(<InklineWordmark fontSize={20} />);
    expect(screen.getByText("line").style.letterSpacing).toBe("");

    cleanup();
    render(<InklineWordmark fontSize={40} />);
    expect(screen.getByText("line").style.letterSpacing).toBe("-0.006em");
  });

  it("lockup gliften sonra kelime işaretini çizer", () => {
    const { container } = render(<InklineLockup />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/Ink/).textContent).toBe("Inkline");
  });

  /** Nav varsayılanı: size 21 → fontSize round(19.95)=20 → gap 0.3*20 = 6.00px */
  it("nav boyutunda boşluk hesabı belirleyicidir", () => {
    const { container } = render(<InklineLockup size={21} />);
    expect((container.firstChild as HTMLElement).style.gap).toBe("6.00px");
  });

  it("24px ve üstünde glif boyutu doğrudan font boyutu olur", () => {
    const { container } = render(<InklineLockup size={40} />);
    // 0.26 * 40 = 10.40px
    expect((container.firstChild as HTMLElement).style.gap).toBe("10.40px");
  });

  it("mono ve coralOpacity lockup üzerinden aktarılır", () => {
    render(<InklineLockup mono />);
    expect(screen.getByText("line").style.color).toBe("");

    cleanup();
    render(<InklineLockup coralOpacity={0.5} />);
    expect(screen.getByText("line").style.opacity).toBe("0.5");
  });
});
