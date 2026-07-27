import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/essays/route";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
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

function setupDb(response: unknown = { data: { id: "new-essay" } }) {
  supabase = createSupabaseMock({
    responses: { "essays.insert": response as never },
  });
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

/** insert edilen satır. */
function insertedRow() {
  return supabase.oneOp("essays.insert").payload as Record<string, unknown>;
}

beforeEach(() => {
  silenceConsole();
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ current_level: "B1" }),
  });
  setupDb();
});

describe("POST /api/essays", () => {
  it("oturum yoksa 401 döner ve DB'ye dokunmaz", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ title: "T" }));

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Oturum yok." });
    expect(supabase.ops).toHaveLength(0);
  });

  it("yeni taslağın id'sini döner", async () => {
    const response = await POST(jsonRequest({ title: "T", prompt: "P" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ id: "new-essay" });
  });

  it("essay'i oturum sahibine bağlar", async () => {
    await POST(jsonRequest({ title: "T" }));
    expect(insertedRow().user_id).toBe("test-user");
  });

  /** Essay yazıldığı andaki seviye, sonradan gelişimi ölçmek için saklanır. */
  it("yazım anındaki seviyeyi kaydeder", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C1" }),
    });
    setupDb();

    await POST(jsonRequest({ title: "T" }));

    expect(insertedRow().level_at_writing).toBe("C1");
  });

  it("başlık yoksa 'Untitled' kullanır", async () => {
    await POST(jsonRequest({}));
    expect(insertedRow().title).toBe("Untitled");
  });

  it("konu yönergesi yoksa null yazar", async () => {
    await POST(jsonRequest({ title: "T" }));
    expect(insertedRow().prompt).toBeNull();
  });

  it("boş dize olan yönergeyi null'a çevirir", async () => {
    await POST(jsonRequest({ title: "T", prompt: "" }));
    expect(insertedRow().prompt).toBeNull();
  });

  /** DB kolonu sınırsız değil ve arayüz uzun başlığı taşıyamaz. */
  it("başlığı 200 karaktere kırpar", async () => {
    await POST(jsonRequest({ title: "x".repeat(500) }));

    const title = insertedRow().title as string;
    expect(title).toHaveLength(200);
    expect(title).toBe("x".repeat(200));
  });

  it("yönergeyi 1000 karaktere kırpar", async () => {
    await POST(jsonRequest({ title: "T", prompt: "y".repeat(5000) }));

    expect(insertedRow().prompt).toHaveLength(1000);
  });

  it("tam sınırdaki değerleri kırpmaz", async () => {
    await POST(
      jsonRequest({ title: "x".repeat(200), prompt: "y".repeat(1000) }),
    );

    expect(insertedRow().title).toHaveLength(200);
    expect(insertedRow().prompt).toHaveLength(1000);
  });

  it("string olmayan başlığı metne çevirir", async () => {
    await POST(jsonRequest({ title: 42 }));
    expect(insertedRow().title).toBe("42");
  });

  it("bozuk JSON gövdesinde varsayılanlarla taslak açar", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(200);
    expect(insertedRow().title).toBe("Untitled");
    expect(insertedRow().prompt).toBeNull();
  });

  it("gövdesiz istekte de çalışır", async () => {
    const response = await POST(emptyRequest());
    expect(response.status).toBe(200);
  });

  it("sadece id kolonunu geri ister", async () => {
    await POST(jsonRequest({ title: "T" }));

    const op = supabase.oneOp("essays.insert");
    expect(op.returning).toBe("id");
    expect(op.terminal).toBe("single");
  });

  it("DB hatasında 500 ve hatanın mesajını döner", async () => {
    setupDb({ data: null, error: { message: "duplicate key" } });

    const response = await POST(jsonRequest({ title: "T" }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({ error: "duplicate key" });
  });
});
