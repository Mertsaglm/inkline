import { vi } from "vitest";

/**
 * Supabase istemcisi taklidi.
 *
 * Gerçek istemci zincirlenebilir ve "thenable"dır:
 *   from("x").select("*").eq("id", 1).maybeSingle()
 *   from("x").insert({...}).select("*").single()
 *   await from("x").update({...}).eq("id", 1)        // terminal metot yok
 *
 * Bu taklit aynı şekli taşır, her çağrıyı kaydeder ve cevabı
 * `"tablo.fiil"` anahtarıyla verir (ör. `"essays.select"`).
 * Böylece testler hem *ne döndüğünü* hem *route'un DB'ye ne yazdığını*
 * doğrulayabilir.
 */

export type Verb = "select" | "insert" | "update" | "delete" | "upsert";

export interface RecordedOp {
  table: string;
  verb: Verb;
  /** insert/update/upsert gövdesi. */
  payload?: unknown;
  /** İlk `select(...)` argümanı (verb === "select" olduğunda). */
  columns?: string;
  /** insert/update sonrası `.select(...)` — "geri döndürülecek kolonlar". */
  returning?: string;
  filters: { method: string; args: unknown[] }[];
  /** Zincirin nasıl tüketildiği. */
  terminal: "await" | "single" | "maybeSingle";
}

export interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type Responder = QueryResult | ((op: RecordedOp) => QueryResult);

export interface SupabaseMockOptions {
  /** `"tablo.fiil"` → cevap. Tanımsızsa `{ data: null, error: null }`. */
  responses?: Record<string, Responder>;
  /** `auth.getUser()` sonucu. `null` → oturum yok. */
  user?: { id: string } | null;
}

const CHAIN_METHODS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "order",
  "limit",
  "range",
  "filter",
  "match",
  "not",
  "or",
] as const;

class QueryBuilder implements PromiseLike<QueryResult> {
  private op: RecordedOp;

  constructor(
    table: string,
    private readonly responses: Record<string, Responder>,
    private readonly record: (op: RecordedOp) => void,
  ) {
    this.op = { table, verb: "select", filters: [], terminal: "await" };
    for (const method of CHAIN_METHODS) {
      // Zincir metotları sadece kaydedip `this` döner.
      (this as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        this.op.filters.push({ method, args });
        return this;
      };
    }
  }

  private verbSet = false;

  select(columns?: string) {
    if (this.verbSet) {
      this.op.returning = columns;
    } else {
      this.op.verb = "select";
      this.op.columns = columns;
      this.verbSet = true;
    }
    return this;
  }

  insert(payload: unknown) {
    this.op.verb = "insert";
    this.op.payload = payload;
    this.verbSet = true;
    return this;
  }

  upsert(payload: unknown) {
    this.op.verb = "upsert";
    this.op.payload = payload;
    this.verbSet = true;
    return this;
  }

  update(payload: unknown) {
    this.op.verb = "update";
    this.op.payload = payload;
    this.verbSet = true;
    return this;
  }

  delete() {
    this.op.verb = "delete";
    this.verbSet = true;
    return this;
  }

  single() {
    return this.settle("single");
  }

  maybeSingle() {
    return this.settle("maybeSingle");
  }

  then<A = QueryResult, B = never>(
    onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.settle("await").then(onfulfilled, onrejected);
  }

  private async settle(terminal: RecordedOp["terminal"]): Promise<QueryResult> {
    this.op.terminal = terminal;
    const op: RecordedOp = { ...this.op, filters: [...this.op.filters] };
    this.record(op);
    const responder = this.responses[`${op.table}.${op.verb}`];
    const raw =
      typeof responder === "function" ? responder(op) : (responder ?? {});
    return { data: null, error: null, count: null, ...raw };
  }
}

export interface SupabaseMock {
  from: (table: string) => QueryBuilder;
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }>;
    signInAnonymously: () => Promise<{ data: unknown; error: null }>;
  };
  /** Kaydedilen tüm DB işlemleri, çağrı sırasıyla. */
  ops: RecordedOp[];
  /** Belirli bir `"tablo.fiil"` için kaydedilen işlemler. */
  opsFor: (key: string) => RecordedOp[];
  /** Tek işlem bekleniyorsa: yoksa/çoksa hata atar. */
  oneOp: (key: string) => RecordedOp;
}

export function createSupabaseMock(
  options: SupabaseMockOptions = {},
): SupabaseMock {
  const responses = options.responses ?? {};
  const user = options.user === undefined ? { id: "test-user" } : options.user;
  const ops: RecordedOp[] = [];

  const mock: SupabaseMock = {
    from: (table: string) =>
      new QueryBuilder(table, responses, (op) => ops.push(op)),
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      signInAnonymously: vi.fn(async () => ({ data: {}, error: null })),
    },
    ops,
    opsFor: (key) =>
      ops.filter((op) => `${op.table}.${op.verb}` === key),
    oneOp: (key) => {
      const found = mock.opsFor(key);
      if (found.length !== 1)
        throw new Error(
          `"${key}" için 1 işlem beklendi, ${found.length} bulundu. ` +
            `Kaydedilenler: ${ops.map((o) => `${o.table}.${o.verb}`).join(", ") || "(yok)"}`,
        );
      return found[0];
    },
  };

  return mock;
}
