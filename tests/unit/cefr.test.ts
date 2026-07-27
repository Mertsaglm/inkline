import { describe, it, expect } from "vitest";
import {
  CEFR_LABELS,
  CEFR_LEVELS,
  cefrToNumber,
  feedbackLangForLevel,
  feedbackLangInstruction,
  isCefrLevel,
  nextLevel,
  numberToCefr,
  smoothLevel,
  type CefrLevel,
} from "@/lib/cefr";

describe("CEFR_LEVELS", () => {
  it("tam olarak altı bandı, artan sırada tutar", () => {
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("her band için etiket vardır", () => {
    for (const level of CEFR_LEVELS) {
      expect(CEFR_LABELS[level]).toBeTruthy();
    }
    expect(Object.keys(CEFR_LABELS)).toHaveLength(CEFR_LEVELS.length);
  });

  /**
   * app/page.tsx etiketi `"·"` üzerinden bölüp ikinci parçayı gösteriyor
   * (`CEFR_LABELS[lvl].split("·")[1]?.trim()`). Ayraç kaybolursa panel
   * hata vermez — sadece seviye adı boş görünür. Bu yüzden burada pinliyoruz.
   */
  it("her etiket `·` ayracıyla iki parçaya bölünür ve ikinci parça doludur", () => {
    for (const level of CEFR_LEVELS) {
      const parts = CEFR_LABELS[level].split("·");
      expect(parts.length, `${level} etiketinde "·" yok`).toBe(2);
      expect(parts[0].trim()).toBe(level);
      expect(parts[1].trim().length).toBeGreaterThan(0);
    }
  });

  it("etiketler Türkçedir (İngilizce seviye adları kullanılmaz)", () => {
    const english = /\b(beginner|elementary|intermediate|advanced|mastery|proficient)\b/i;
    for (const level of CEFR_LEVELS) {
      expect(CEFR_LABELS[level]).not.toMatch(english);
    }
  });
});

describe("isCefrLevel", () => {
  it("geçerli bandları kabul eder", () => {
    for (const level of CEFR_LEVELS) expect(isCefrLevel(level)).toBe(true);
  });

  it("küçük harf, boşluklu ve benzer değerleri reddeder", () => {
    for (const value of ["a1", "B1 ", " B1", "B3", "D1", "", "B", "1"]) {
      expect(isCefrLevel(value), `${JSON.stringify(value)} kabul edildi`).toBe(
        false,
      );
    }
  });

  it("string olmayan değerleri reddeder", () => {
    for (const value of [null, undefined, 1, {}, [], true, NaN]) {
      expect(isCefrLevel(value)).toBe(false);
    }
  });
});

describe("cefrToNumber / numberToCefr", () => {
  it("1..6 aralığına eşler", () => {
    expect(CEFR_LEVELS.map(cefrToNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("gidiş-dönüş kayıpsızdır", () => {
    for (const level of CEFR_LEVELS) {
      expect(numberToCefr(cefrToNumber(level))).toBe(level);
    }
  });

  it("aralık dışını uçlara kırpar", () => {
    expect(numberToCefr(-100)).toBe("A1");
    expect(numberToCefr(0)).toBe("A1");
    expect(numberToCefr(0.4)).toBe("A1");
    expect(numberToCefr(6.6)).toBe("C2");
    expect(numberToCefr(100)).toBe("C2");
  });

  it("ondalıkları en yakın banda yuvarlar (.5 yukarı)", () => {
    expect(numberToCefr(3.4)).toBe("B1"); // 3 → B1
    expect(numberToCefr(3.5)).toBe("B2"); // 4 → B2
    expect(numberToCefr(2.5)).toBe("B1"); // 3 → B1
  });

  it("1..6 arasındaki her yarım adım için geçerli bir band döner", () => {
    for (let n = 1; n <= 6; n += 0.25) {
      expect(isCefrLevel(numberToCefr(n)), `n=${n} geçersiz`).toBe(true);
    }
  });
});

describe("nextLevel", () => {
  it("bir üst bandı verir", () => {
    expect(nextLevel("A1")).toBe("A2");
    expect(nextLevel("A2")).toBe("B1");
    expect(nextLevel("B1")).toBe("B2");
    expect(nextLevel("B2")).toBe("C1");
    expect(nextLevel("C1")).toBe("C2");
  });

  it("tepede sabit kalır (C2'nin üstü yok)", () => {
    expect(nextLevel("C2")).toBe("C2");
  });
});

describe("smoothLevel", () => {
  it("tahmin mevcut seviyeyle aynıysa seviye değişmez", () => {
    for (const level of CEFR_LEVELS) {
      expect(smoothLevel(level, level)).toBe(level);
    }
  });

  it("varsayılan ağırlıkla tek essay seviyeyi 2 banddan fazla oynatamaz", () => {
    for (const current of CEFR_LEVELS) {
      for (const estimate of CEFR_LEVELS) {
        const moved = Math.abs(
          cefrToNumber(smoothLevel(current, estimate)) - cefrToNumber(current),
        );
        expect(
          moved,
          `${current} → ${estimate} beklenmedik biçimde ${moved} band oynattı`,
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  it("sonuç her zaman mevcut seviye ile tahmin arasındadır (aşırma yok)", () => {
    for (const current of CEFR_LEVELS) {
      for (const estimate of CEFR_LEVELS) {
        const result = cefrToNumber(smoothLevel(current, estimate));
        const lo = Math.min(cefrToNumber(current), cefrToNumber(estimate));
        const hi = Math.max(cefrToNumber(current), cefrToNumber(estimate));
        expect(result, `${current} → ${estimate}`).toBeGreaterThanOrEqual(lo);
        expect(result, `${current} → ${estimate}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("yukarı tahminde seviyeyi düşürmez, aşağı tahminde yükseltmez", () => {
    for (const current of CEFR_LEVELS) {
      for (const estimate of CEFR_LEVELS) {
        const result = cefrToNumber(smoothLevel(current, estimate));
        if (cefrToNumber(estimate) > cefrToNumber(current)) {
          expect(result).toBeGreaterThanOrEqual(cefrToNumber(current));
        } else if (cefrToNumber(estimate) < cefrToNumber(current)) {
          expect(result).toBeLessThanOrEqual(cefrToNumber(current));
        }
      }
    }
  });

  it("bilinen köşe değerleri", () => {
    // 3*0.66 + 5*0.34 = 3.68 → 4 → B2
    expect(smoothLevel("B1", "C1")).toBe("B2");
    // 1*0.66 + 6*0.34 = 2.70 → 3 → B1  (A1'den C2'ye tek adımda zıplamaz)
    expect(smoothLevel("A1", "C2")).toBe("B1");
    // 6*0.66 + 1*0.34 = 4.30 → 4 → B2
    expect(smoothLevel("C2", "A1")).toBe("B2");
    // 3*0.66 + 4*0.34 = 3.34 → 3 → B1  (tek band fark yumuşatılıp yutulur)
    expect(smoothLevel("B1", "B2")).toBe("B1");
  });

  it("weight=0 mevcut seviyeyi, weight=1 tahmini verir", () => {
    expect(smoothLevel("A1", "C2", 0)).toBe("A1");
    expect(smoothLevel("A1", "C2", 1)).toBe("C2");
    expect(smoothLevel("C2", "A1", 0)).toBe("C2");
    expect(smoothLevel("C2", "A1", 1)).toBe("A1");
  });

  it("varsayılan ağırlık 0.34'tür (yumuşatmayı kimse sessizce açmasın)", () => {
    // Ağırlık 0.5'e çıkarsa B1→C1 doğrudan B2 yerine ... yine B2 olur; ama
    // A1→C2 B1 yerine B2'ye çıkar. Bu çift, ağırlığa duyarlı bir imzadır.
    expect(smoothLevel("A1", "C2")).toBe(smoothLevel("A1", "C2", 0.34));
    expect(smoothLevel("A1", "C2", 0.5)).toBe("B2");
  });
});

describe("feedbackLangForLevel", () => {
  it("A1-A2 → tr, B1-B2 → mixed, C1-C2 → en", () => {
    const expected: Record<CefrLevel, string> = {
      A1: "tr",
      A2: "tr",
      B1: "mixed",
      B2: "mixed",
      C1: "en",
      C2: "en",
    };
    for (const level of CEFR_LEVELS) {
      expect(feedbackLangForLevel(level)).toBe(expected[level]);
    }
  });
});

describe("feedbackLangInstruction", () => {
  it("tr talimatı açıklamaların TÜRKÇE olmasını ister", () => {
    const text = feedbackLangInstruction("tr");
    expect(text).toMatch(/TURKISH/);
    expect(text).toMatch(/beginner/i);
  });

  it("mixed talimatı Türkçe ağırlıklı karışık dil ister", () => {
    const text = feedbackLangInstruction("mixed");
    expect(text).toMatch(/TURKISH/);
    expect(text).toMatch(/English/);
    expect(text).toMatch(/intermediate/i);
  });

  it("en talimatı açıklamaların İNGİLİZCE olmasını ister", () => {
    const text = feedbackLangInstruction("en");
    expect(text).toMatch(/ENGLISH/);
    expect(text).toMatch(/advanced/i);
  });

  it("üç dil için de boş olmayan, farklı talimatlar üretir", () => {
    const all = (["tr", "mixed", "en"] as const).map(feedbackLangInstruction);
    for (const text of all) expect(text.trim().length).toBeGreaterThan(20);
    expect(new Set(all).size).toBe(3);
  });
});
