// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  IssueHighlight,
  buildIssueDecorations,
  issueHighlightKey,
  type EditorIssue,
} from "@/components/editor/issueHighlight";

/**
 * Model karakter offseti VERMİYOR — sadece hatanın geçtiği metni (span_text)
 * veriyor. Konumlandırma bu yüzden burada, metin düğümü seviyesinde arayarak
 * yapılıyor. Offset hesabı bir karakter kayarsa yanlış kelimenin altı çizilir
 * ve "Uygula" yanlış yeri değiştirir — ekranda hata görünmez, sadece yanlış olur.
 */

const schema = getSchema([StarterKit]);

/** Her paragraf ayrı bir metin düğümü olacak şekilde doküman kurar. */
function docOf(...paragraphs: string[]): PMNode {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) =>
      text
        ? schema.node("paragraph", null, [schema.text(text)])
        : schema.node("paragraph"),
    ),
  );
}

function issue(overrides: Partial<EditorIssue> = {}): EditorIssue {
  return {
    id: "iss-1",
    span_text: "I go",
    kind: "grammar",
    severity: "critical",
    message: "Geçmiş zaman kullan.",
    replacement: "I went",
    ...overrides,
  };
}

/** Decoration'ları konum sırasına göre sade nesnelere çevirir. */
function decorationsOf(set: DecorationSet) {
  return set
    .find()
    .map((deco: Decoration) => {
      const attrs = (deco as unknown as { type: { attrs: Record<string, string> } })
        .type.attrs;
      return {
        from: deco.from,
        to: deco.to,
        class: attrs.class,
        id: attrs["data-issue-id"],
      };
    })
    .sort((a, b) => a.from - b.from);
}

describe("buildIssueDecorations — konumlandırma", () => {
  /**
   * Tek paragraflı dokümanda metnin ilk karakteri pos 1'dedir
   * (pos 0 paragrafın açılışı).
   */
  it("span'i doğru karakter aralığına yerleştirir", () => {
    const doc = docOf("Yesterday I go home.");
    //                 0123456789^ → "I go" 10. indekste
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));

    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(1 + 10);
    expect(decos[0].to).toBe(1 + 10 + "I go".length);
  });

  it("metnin en başındaki span'i doğru bulur", () => {
    const doc = docOf("I go home.");
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));
    expect(decos[0]).toMatchObject({ from: 1, to: 5 });
  });

  it("metnin en sonundaki span'i doğru bulur", () => {
    const doc = docOf("Home I go");
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));
    expect(decos[0]).toMatchObject({ from: 6, to: 10 });
  });

  /** Paragraf açılış/kapanış tokenları offseti kaydırır. */
  it("ikinci paragraftaki span'i doğru offsetle bulur", () => {
    const first = "First paragraph.";
    const doc = docOf(first, "Then I go home.");
    // 1. paragraf: aç(1) + metin(16) + kapa(1) = 18 → 2. paragrafın metni 19'da
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));

    expect(decos).toHaveLength(1);
    expect(decos[0].from).toBe(first.length + 3 + "Then ".length);
  });

  it("her paragraftaki eşleşmeyi ayrı ayrı işaretler", () => {
    const doc = docOf("I go now.", "I go later.");
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));

    expect(decos).toHaveLength(2);
    expect(decos[0].from).toBe(1);
    expect(decos[1].from).toBe("I go now.".length + 3);
  });

  it("aynı paragraftaki tekrarların hepsini işaretler", () => {
    const doc = docOf("I go and then I go.");
    const decos = decorationsOf(buildIssueDecorations(doc, [issue()]));

    expect(decos).toHaveLength(2);
    expect(decos[0]).toMatchObject({ from: 1, to: 5 });
    expect(decos[1]).toMatchObject({ from: 15, to: 19 });
  });

  /**
   * Arama, bulunan yerin en az bir karakter ötesinden devam ediyor
   * (`idx + Math.max(1, span.length)`) — sonsuz döngü koruması.
   */
  it("bitişik tekrarlarda takılmadan ilerler", () => {
    const doc = docOf("aaaa");
    const decos = decorationsOf(
      buildIssueDecorations(doc, [issue({ span_text: "aa" })]),
    );

    expect(decos).toHaveLength(2);
    expect(decos.map((d) => [d.from, d.to])).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });

  it("boş dokümanda çökmez", () => {
    expect(decorationsOf(buildIssueDecorations(docOf(""), [issue()]))).toEqual([]);
  });
});

describe("buildIssueDecorations — eşleşmeyen span'ler", () => {
  it("metinde olmayan span için işaret üretmez", () => {
    const doc = docOf("She goes home.");
    expect(decorationsOf(buildIssueDecorations(doc, [issue()]))).toEqual([]);
  });

  it("boş span_text atlanır (sonsuz döngü olmaz)", () => {
    const doc = docOf("Yesterday I go home.");
    expect(
      decorationsOf(buildIssueDecorations(doc, [issue({ span_text: "" })])),
    ).toEqual([]);
  });

  it("eşleşme birebirdir — büyük/küçük harf farkı sayılmaz", () => {
    const doc = docOf("Yesterday I go home.");
    expect(
      decorationsOf(buildIssueDecorations(doc, [issue({ span_text: "i go" })])),
    ).toEqual([]);
  });

  it("hiç öneri yoksa boş küme döner", () => {
    expect(decorationsOf(buildIssueDecorations(docOf("Some text."), []))).toEqual(
      [],
    );
  });
});

describe("buildIssueDecorations — işaret nitelikleri", () => {
  it("severity'yi sınıf adına yazar", () => {
    const doc = docOf("Yesterday I go home.");

    const critical = decorationsOf(
      buildIssueDecorations(doc, [issue({ severity: "critical" })]),
    );
    expect(critical[0].class).toBe("issue-mark issue-mark--critical");

    const suggestion = decorationsOf(
      buildIssueDecorations(doc, [issue({ severity: "suggestion" })]),
    );
    expect(suggestion[0].class).toBe("issue-mark issue-mark--suggestion");
  });

  /** Popover, tıklanan işareti bu id ile issuesRef'ten buluyor. */
  it("issue id'sini data-issue-id olarak taşır", () => {
    const doc = docOf("Yesterday I go home.");
    const decos = decorationsOf(
      buildIssueDecorations(doc, [issue({ id: "iss-abc-3" })]),
    );
    expect(decos[0].id).toBe("iss-abc-3");
  });

  it("tekrar eden span'lerin her işareti aynı id'yi taşır", () => {
    const doc = docOf("I go and then I go.");
    const decos = decorationsOf(
      buildIssueDecorations(doc, [issue({ id: "iss-7" })]),
    );
    expect(decos.map((d) => d.id)).toEqual(["iss-7", "iss-7"]);
  });
});

describe("buildIssueDecorations — çoklu öneri", () => {
  it("farklı span'lerin hepsini işaretler", () => {
    const doc = docOf("Yesterday I go to the shop.");
    const decos = decorationsOf(
      buildIssueDecorations(doc, [
        issue({ id: "a", span_text: "Yesterday", severity: "suggestion" }),
        issue({ id: "b", span_text: "I go", severity: "critical" }),
        issue({ id: "c", span_text: "shop", severity: "suggestion" }),
      ]),
    );

    expect(decos.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("iç içe geçen span'lerin ikisini de işaretler", () => {
    const doc = docOf("Yesterday I go home.");
    const decos = decorationsOf(
      buildIssueDecorations(doc, [
        issue({ id: "outer", span_text: "I go home" }),
        issue({ id: "inner", span_text: "go" }),
      ]),
    );

    expect(decos).toHaveLength(2);
    expect(decos.map((d) => d.id).sort()).toEqual(["inner", "outer"]);
  });
});

describe("IssueHighlight eklentisi", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function makeEditor(content: string) {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, IssueHighlight],
      content,
    });
    return editor;
  }

  function currentDecorations() {
    return decorationsOf(issueHighlightKey.getState(editor!.state)!);
  }

  it("eklenti adı sabittir", () => {
    expect(IssueHighlight.name).toBe("issueHighlight");
  });

  it("başlangıçta hiç işaret yoktur", () => {
    makeEditor("<p>Yesterday I go home.</p>");
    expect(currentDecorations()).toEqual([]);
  });

  it("meta.decorations ile işaretler yerleşir", () => {
    const ed = makeEditor("<p>Yesterday I go home.</p>");
    const decorations = buildIssueDecorations(ed.state.doc, [issue()]);
    ed.view.dispatch(ed.state.tr.setMeta(issueHighlightKey, { decorations }));

    expect(currentDecorations()).toHaveLength(1);
  });

  /** AI uyarıları kapatıldığında tüm altçizgiler tek hamlede silinir. */
  it("meta.clear tüm işaretleri siler", () => {
    const ed = makeEditor("<p>Yesterday I go home.</p>");
    ed.view.dispatch(
      ed.state.tr.setMeta(issueHighlightKey, {
        decorations: buildIssueDecorations(ed.state.doc, [issue()]),
      }),
    );
    expect(currentDecorations()).toHaveLength(1);

    ed.view.dispatch(ed.state.tr.setMeta(issueHighlightKey, { clear: true }));
    expect(currentDecorations()).toEqual([]);
  });

  /**
   * Kullanıcı yazmaya devam ederken mevcut işaretler kaymalı, kaybolmamalı —
   * yoksa her tuşta altçizgiler yanıp söner.
   */
  it("metin eklendikçe işaretler kayar (kaybolmaz)", () => {
    const ed = makeEditor("<p>Yesterday I go home.</p>");
    ed.view.dispatch(
      ed.state.tr.setMeta(issueHighlightKey, {
        decorations: buildIssueDecorations(ed.state.doc, [issue()]),
      }),
    );
    const before = currentDecorations()[0];

    // Başa 6 karakter ekle.
    ed.view.dispatch(ed.state.tr.insertText("Well, ", 1));

    const after = currentDecorations();
    expect(after).toHaveLength(1);
    expect(after[0].from).toBe(before.from + 6);
    expect(after[0].to).toBe(before.to + 6);
  });

  it("işaretlenen metin silinince işaret de düşer", () => {
    const ed = makeEditor("<p>Yesterday I go home.</p>");
    const decorations = buildIssueDecorations(ed.state.doc, [issue()]);
    ed.view.dispatch(ed.state.tr.setMeta(issueHighlightKey, { decorations }));

    // "I go" (11..15) aralığını sil.
    ed.view.dispatch(ed.state.tr.delete(11, 15));

    expect(currentDecorations()).toEqual([]);
  });

  it("işaretler DOM'a issue-mark sınıfıyla yansır", () => {
    const ed = makeEditor("<p>Yesterday I go home.</p>");
    ed.view.dispatch(
      ed.state.tr.setMeta(issueHighlightKey, {
        decorations: buildIssueDecorations(ed.state.doc, [issue({ id: "x1" })]),
      }),
    );

    const mark = ed.view.dom.querySelector("[data-issue-id]");
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute("data-issue-id")).toBe("x1");
    expect(mark!.className).toContain("issue-mark--critical");
    expect(mark!.textContent).toBe("I go");
  });
});
