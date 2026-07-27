import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/feedback/route";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { issueKind } from "@/lib/ai/schemas";
import { makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import {
  emptyRequest,
  jsonRequest,
  malformedRequest,
  readJson,
  silenceConsole,
} from "../helpers/route";

vi.mock("@/lib/db/profile", () => ({ ensureProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ensureProfileMock = vi.mocked(ensureProfile);
const createClientMock = vi.mocked(createClient);

let supabase: SupabaseMock;

function setupDb(response: unknown = {}) {
  supabase = createSupabaseMock({
    responses: { "feedback_events.insert": response as never },
  });
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

function insertedRow() {
  return supabase.oneOp("feedback_events.insert").payload as Record<
    string,
    unknown
  >;
}

const VALID = {
  kind: "grammar",
  severity: "critical",
  source: "proactive",
  span_text: "I go",
  message: "Geçmiş zaman kullan.",
  suggestion: "I went",
  status: "accepted",
  essay_id: "essay-1",
};

beforeEach(() => {
  silenceConsole();
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile(),
  });
  setupDb();
});

describe("POST /api/feedback — kapılar", () => {
  it("oturum yoksa 401 döner ve DB'ye dokunmaz", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST(jsonRequest(VALID));

    expect(response.status).toBe(401);
    expect(supabase.ops).toHaveLength(0);
  });

  /**
   * `kind` doğrudan DB'nin CHECK kısıtına giriyor; geçersiz değer 500'e
   * dönüşürdü. Burada erken ve anlaşılır biçimde reddediliyor.
   */
  it("geçersiz kind 400 döner ve hiçbir şey yazılmaz", async () => {
    const response = await POST(jsonRequest({ ...VALID, kind: "punctuation" }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: "Geçersiz kind." });
    expect(supabase.ops).toHaveLength(0);
  });

  it("kind eksikse 400 döner", async () => {
    const withoutKind = { ...VALID } as Record<string, unknown>;
    delete withoutKind.kind;
    expect((await POST(jsonRequest(withoutKind))).status).toBe(400);
  });

  it("beş geçerli türün hepsini kabul eder", async () => {
    for (const kind of issueKind.options) {
      setupDb();
      const response = await POST(jsonRequest({ ...VALID, kind }));
      expect(response.status, kind).toBe(200);
      expect(insertedRow().kind).toBe(kind);
    }
  });

  it("bozuk JSON ve boş gövdede 400 döner (çökmez)", async () => {
    expect((await POST(malformedRequest())).status).toBe(400);
    expect((await POST(emptyRequest())).status).toBe(400);
  });
});

describe("POST /api/feedback — kayıt", () => {
  it("geçerli olayı olduğu gibi yazar ve { ok: true } döner", async () => {
    const response = await POST(jsonRequest(VALID));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true });
    expect(insertedRow()).toEqual({
      user_id: "test-user",
      essay_id: "essay-1",
      kind: "grammar",
      severity: "critical",
      source: "proactive",
      span_text: "I go",
      message: "Geçmiş zaman kullan.",
      suggestion: "I went",
      status: "accepted",
    });
  });

  it("olayı oturum sahibine bağlar (istemcinin gönderdiği user_id'ye değil)", async () => {
    await POST(jsonRequest({ ...VALID, user_id: "baska-kullanici" }));
    expect(insertedRow().user_id).toBe("test-user");
  });

  /** Beyaz liste dışındaki değerler sessizce güvenli varsayılana düşer. */
  it("tanınmayan severity 'suggestion'a düşer", async () => {
    for (const severity of ["warning", "", null, undefined, 42]) {
      setupDb();
      await POST(jsonRequest({ ...VALID, severity }));
      expect(insertedRow().severity, String(severity)).toBe("suggestion");
    }
  });

  it("severity yalnızca tam olarak 'critical' ise critical olur", async () => {
    await POST(jsonRequest({ ...VALID, severity: "critical" }));
    expect(insertedRow().severity).toBe("critical");

    setupDb();
    await POST(jsonRequest({ ...VALID, severity: "Critical" }));
    expect(insertedRow().severity).toBe("suggestion");
  });

  it("tanınmayan source 'on_demand'a düşer", async () => {
    for (const source of ["random", "", null, undefined]) {
      setupDb();
      await POST(jsonRequest({ ...VALID, source }));
      expect(insertedRow().source, String(source)).toBe("on_demand");
    }
  });

  it("source yalnızca tam olarak 'proactive' ise proactive olur", async () => {
    await POST(jsonRequest({ ...VALID, source: "proactive" }));
    expect(insertedRow().source).toBe("proactive");
  });

  it("tanınmayan status 'shown'a düşer", async () => {
    for (const status of ["applied", "", null, undefined, 1]) {
      setupDb();
      await POST(jsonRequest({ ...VALID, status }));
      expect(insertedRow().status, String(status)).toBe("shown");
    }
  });

  it("üç geçerli status değerini korur", async () => {
    for (const status of ["shown", "accepted", "dismissed"]) {
      setupDb();
      await POST(jsonRequest({ ...VALID, status }));
      expect(insertedRow().status, status).toBe(status);
    }
  });

  it("essay_id, span_text ve suggestion yoksa null yazar", async () => {
    await POST(jsonRequest({ kind: "vocab" }));

    expect(insertedRow().essay_id).toBeNull();
    expect(insertedRow().span_text).toBeNull();
    expect(insertedRow().suggestion).toBeNull();
  });

  it("mesaj yoksa boş dize yazar (DB kolonu NOT NULL)", async () => {
    await POST(jsonRequest({ kind: "vocab" }));
    expect(insertedRow().message).toBe("");
  });

  it("mesajı 500 karaktere kırpar", async () => {
    await POST(jsonRequest({ ...VALID, message: "m".repeat(2000) }));
    expect(insertedRow().message).toHaveLength(500);
  });

  it("tam 500 karakterlik mesajı kırpmaz", async () => {
    await POST(jsonRequest({ ...VALID, message: "m".repeat(500) }));
    expect(insertedRow().message).toHaveLength(500);
  });

  it("DB hatasında 500 ve hatanın mesajını döner", async () => {
    setupDb({ error: { message: "violates check constraint" } });

    const response = await POST(jsonRequest(VALID));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({
      error: "violates check constraint",
    });
  });
});
