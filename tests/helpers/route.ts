import { expect, vi } from "vitest";

/** Route handler'lara istek üretmek için küçük yardımcılar. */

export function jsonRequest(
  body: unknown,
  url = "http://localhost:3000/api/test",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Gövdesi bozuk JSON olan istek — route'lar bunu 500'e düşürmemeli. */
export function malformedRequest(
  raw = "{not json",
  url = "http://localhost:3000/api/test",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

/** Gövdesi hiç olmayan istek. */
export function emptyRequest(url = "http://localhost:3000/api/test"): Request {
  return new Request(url, { method: "POST" });
}

export async function readJson<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

/** Durum kodu + gövdeyi tek adımda doğrula. */
export async function expectJson(response: Response, status: number) {
  expect(response.status).toBe(status);
  return readJson(response);
}

/**
 * Route'lar hata yollarında `console.error`/`console.warn` yazıyor (bu
 * bilinçli — Vercel loglarında görünmesi gerekiyor). Test çıktısını
 * kirletmesin diye susturuyoruz.
 */
export function silenceConsole() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}
