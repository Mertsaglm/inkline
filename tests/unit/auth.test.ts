import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/supabase/middleware";
import { proxy, config as proxyConfig } from "@/proxy";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";

/**
 * ============================================================================
 *  Kimlik doğrulama — anonim ve otomatik.
 *
 *  Giriş ekranı YOK. Her ziyaretçi proxy tarafından sessizce anonim oturuma
 *  alınıyor; RLS politikalarının tamamı bu gerçek `auth.uid()`'ye dayanıyor.
 *  Anonim giriş çalışmazsa kullanıcı hiçbir veri yazamaz/okuyamaz —
 *  ve arayüzde bu "boş sayfa" olarak görünür, hata olarak değil.
 * ============================================================================
 */

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

const createServerClientMock = vi.mocked(createServerClient);

function fakeAuthClient(user: { id: string } | null) {
  const signInAnonymously = vi.fn(async () => ({ data: {}, error: null }));
  return {
    client: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user }, error: null })),
        signInAnonymously,
      },
    },
    signInAnonymously,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  createServerClientMock.mockReset();
});

describe("updateSession — oturum yenileme", () => {
  it("oturum yoksa anonim giriş yapar", async () => {
    const { client, signInAnonymously } = fakeAuthClient(null);
    createServerClientMock.mockReturnValue(client as never);

    await updateSession(new NextRequest("http://localhost:3000/"));

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("oturum varsa yeniden giriş YAPMAZ", async () => {
    const { client, signInAnonymously } = fakeAuthClient({ id: "user-1" });
    createServerClientMock.mockReturnValue(client as never);

    await updateSession(new NextRequest("http://localhost:3000/"));

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  /**
   * Env yoksa uygulama çökmemeli — dev sunucusu açılıp SetupNotice
   * gösterebilmeli (AGENTS.md: env'siz build geçmeli).
   */
  it("env yapılandırılmamışsa sessizce geçer", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await updateSession(new NextRequest("http://localhost:3000/"));

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("tek bir env eksik olsa da geçer", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await updateSession(new NextRequest("http://localhost:3000/"));
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("istemciyi env'deki URL ve anon anahtarıyla kurar", async () => {
    const { client } = fakeAuthClient({ id: "user-1" });
    createServerClientMock.mockReturnValue(client as never);

    await updateSession(new NextRequest("http://localhost:3000/"));

    expect(createServerClientMock.mock.calls[0][0]).toBe(
      "https://test.supabase.co",
    );
    expect(createServerClientMock.mock.calls[0][1]).toBe("anon-key");
  });

  it("istekteki çerezleri Supabase'e aktarır", async () => {
    const { client } = fakeAuthClient({ id: "user-1" });
    createServerClientMock.mockReturnValue(client as never);

    const request = new NextRequest("http://localhost:3000/");
    request.cookies.set("sb-access-token", "abc");
    await updateSession(request);

    const options = createServerClientMock.mock.calls[0][2] as {
      cookies: { getAll: () => { name: string; value: string }[] };
    };
    expect(options.cookies.getAll().map((c) => c.name)).toContain(
      "sb-access-token",
    );
  });

  /** Yenilenen oturum çerezleri tarayıcıya geri yazılmalı. */
  it("Supabase'in yazdığı çerezleri cevaba koyar", async () => {
    const { client } = fakeAuthClient({ id: "user-1" });
    createServerClientMock.mockReturnValue(client as never);

    let captured: {
      cookies: {
        setAll: (
          list: { name: string; value: string; options?: Record<string, unknown> }[],
        ) => void;
      };
    } | null = null;
    createServerClientMock.mockImplementation(((
      _url: string,
      _key: string,
      options: never,
    ) => {
      captured = options;
      return client as never;
    }) as never);

    const request = new NextRequest("http://localhost:3000/");
    const responsePromise = updateSession(request);

    captured!.cookies.setAll([
      { name: "sb-refresh-token", value: "yeni", options: { path: "/" } },
    ]);

    const response = await responsePromise;
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("yeni");
  });

  it("her zaman bir cevap döner (isteği düşürmez)", async () => {
    const { client } = fakeAuthClient(null);
    createServerClientMock.mockReturnValue(client as never);

    const response = await updateSession(new NextRequest("http://localhost:3000/x"));
    expect(response).toBeDefined();
    expect(response.status).toBe(200);
  });
});

describe("proxy (Next 16'da middleware'in yeni adı)", () => {
  it("updateSession'a devreder", async () => {
    const { client, signInAnonymously } = fakeAuthClient(null);
    createServerClientMock.mockReturnValue(client as never);

    await proxy(new NextRequest("http://localhost:3000/essays"));

    expect(signInAnonymously).toHaveBeenCalled();
  });

  it("matcher statik dosyaları ve görselleri dışarıda bırakır", () => {
    expect(proxyConfig.matcher).toHaveLength(1);
    // Next matcher'ı yol tamamına uygular — bağlayarak test et.
    const pattern = new RegExp(`^${proxyConfig.matcher[0]}$`);

    // Uygulama yolları eşleşmeli → oturum yenilenir
    for (const path of [
      "/",
      "/essays",
      "/essays/abc/edit",
      "/write",
      "/api/ai/check",
    ]) {
      expect(pattern.test(path), `${path} eşleşmedi`).toBe(true);
    }

    // Statik varlıklar eşleşmemeli → her görsel isteğinde auth çağrısı olmaz
    for (const path of [
      "/_next/static/chunk.js",
      "/_next/image",
      "/favicon.ico",
      "/logo.svg",
      "/photo.png",
      "/icon-192.png",
      "/photo.jpeg",
      "/anim.webp",
    ]) {
      expect(pattern.test(path), `${path} eşleşti (eşleşmemeliydi)`).toBe(false);
    }
  });
});

/* ========================================================================== */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

describe("ensureProfile", () => {
  let supabase: SupabaseMock;

  function setup(options: {
    user?: { id: string } | null;
    existing?: unknown;
    created?: unknown;
  }) {
    supabase = createSupabaseMock({
      user: options.user === undefined ? { id: "user-1" } : options.user,
      responses: {
        "profiles.select": { data: options.existing ?? null },
        "profiles.insert": { data: options.created ?? null },
      },
    });
    createClientMock.mockResolvedValue(supabase as never);
    return supabase;
  }

  it("oturum yoksa null döner ve DB'ye gitmez", async () => {
    setup({ user: null });

    expect(await ensureProfile()).toBeNull();
    expect(supabase.ops).toHaveLength(0);
  });

  it("mevcut profili döner", async () => {
    const profile = makeProfile({ user_id: "user-1", current_level: "C1" });
    setup({ existing: profile });

    const result = await ensureProfile();

    expect(result).toEqual({ userId: "user-1", profile });
    expect(supabase.opsFor("profiles.insert")).toHaveLength(0);
  });

  it("profili kullanıcı kimliğine göre arar", async () => {
    setup({ existing: makeProfile() });
    await ensureProfile();

    const op = supabase.oneOp("profiles.select");
    expect(op.filters).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(op.terminal).toBe("maybeSingle");
  });

  /**
   * Güvenlik ağı: auth trigger'ı devre dışıysa (ör. göç çalıştırılmadıysa)
   * profil burada oluşturulur; aksi hâlde her route 500 verirdi.
   */
  it("profil yoksa oluşturur", async () => {
    const created = makeProfile({ user_id: "user-1" });
    setup({ existing: null, created });

    const result = await ensureProfile();

    expect(supabase.oneOp("profiles.insert").payload).toEqual({
      user_id: "user-1",
    });
    expect(result).toEqual({ userId: "user-1", profile: created });
  });

  it("oluşturulan profili tek satır olarak geri ister", async () => {
    setup({ existing: null, created: makeProfile() });
    await ensureProfile();

    const op = supabase.oneOp("profiles.insert");
    expect(op.returning).toBe("*");
    expect(op.terminal).toBe("single");
  });

  it("kullanıcı kimliğini profil satırından değil oturumdan alır", async () => {
    setup({ existing: makeProfile({ user_id: "baska-id" }) });

    const result = await ensureProfile();

    expect(result?.userId).toBe("user-1");
  });
});
