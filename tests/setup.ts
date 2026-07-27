import { vi } from "vitest";

/**
 * Tüm testler için ortak hazırlık.
 *
 * Buradaki `vi.mock` çağrıları Vitest tarafından her test dosyasına uygulanır.
 * Sadece *çerçeve* (Next.js router / Link) taklit edilir — uygulama kodu asla.
 * Uygulama modüllerini taklit etmek isteyen test bunu kendi dosyasında,
 * açıkça yapar.
 */

/** `notFound()` çağrısını testte yakalayabilmek için atılan sentinel. */
export class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundSignal";
  }
}

/** `redirect()` çağrısını testte yakalayabilmek için atılan sentinel. */
export class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.name = "RedirectSignal";
  }
}

/** Test içinden `pathname`'i değiştirmek için: `navigationState.pathname = "/x"`. */
export const navigationState = {
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationState.push,
    replace: navigationState.replace,
    back: navigationState.back,
    forward: navigationState.forward,
    refresh: navigationState.refresh,
    prefetch: navigationState.prefetch,
  }),
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  notFound: () => {
    throw new NotFoundSignal();
  },
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

// next/link, App Router context'i olmadan uyarı üretiyor; testte düz <a> yeter.
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children?: unknown;
    } & Record<string, unknown>) =>
      createElement("a", { href, ...rest }, children as never),
  };
});

if (typeof window !== "undefined") {
  // React'e test ortamında olduğumuzu söyler; TipTap gibi React dışından
  // state değiştiren kütüphanelerde act() uyarılarını önler.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

  /**
   * Node 25'in yerleşik `localStorage` global'i jsdom'unkini gölgeliyor ve
   * arkasında geçerli bir dosya olmadığı için `setItem`/`clear` bile
   * içermiyor. ThemeToggle çıplak `localStorage` yazıp hatayı yutuyor, yani
   * bu hâliyle tema testi hiçbir şey doğrulamaz. Bellekte çalışan gerçek bir
   * Storage koyuyoruz.
   */
  if (typeof window.localStorage?.setItem !== "function") {
    const store = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(String(key)) ?? null,
      setItem: (key: string, value: string) => {
        store.set(String(key), String(value));
      },
      removeItem: (key: string) => {
        store.delete(String(key));
      },
      clear: () => store.clear(),
    };
    for (const target of [globalThis, window]) {
      Object.defineProperty(target, "localStorage", {
        configurable: true,
        writable: true,
        value: memoryStorage,
      });
    }
  }

  // jsdom `ResizeObserver` sunmuyor; recharts ve TipTap arıyor.
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: ResizeObserverStub,
    });
  }
  // TipTap/ProseMirror bazı yollarda bunları çağırıyor.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
}
