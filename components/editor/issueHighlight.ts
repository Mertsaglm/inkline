import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface EditorIssue {
  id: string;
  span_text: string;
  kind: "grammar" | "vocab" | "structure" | "spelling" | "style";
  severity: "critical" | "suggestion";
  /** Kuralın kısa anlatımı — popover'da başlıkta gösterilir. */
  message: string;
  /**
   * span_text yerine birebir yazılacak metin. Somut bir düzeltme yoksa null
   * olur; o durumda "Uygula" gösterilmez, öneri sadece açıklama olarak kalır.
   */
  replacement: string | null;
}

export const issueHighlightKey = new PluginKey<DecorationSet>("issueHighlight");

/**
 * Verilen issue listesini dokümanda metinle eşleştirip decoration üretir.
 * Konumlandırma metin-düğümü seviyesinde yapılır → offset'ler pozisyonlara
 * birebir eşlenir (model karakter offset'i vermez, span_text aranır).
 */
export function buildIssueDecorations(
  doc: PMNode,
  issues: EditorIssue[],
): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    for (const issue of issues) {
      const span = issue.span_text;
      if (!span) continue;
      let idx = text.indexOf(span);
      while (idx !== -1) {
        const from = pos + idx;
        const to = from + span.length;
        decos.push(
          Decoration.inline(from, to, {
            class: `issue-mark issue-mark--${issue.severity}`,
            "data-issue-id": issue.id,
          }),
        );
        idx = text.indexOf(span, idx + Math.max(1, span.length));
      }
    }
  });
  return DecorationSet.create(doc, decos);
}

export const IssueHighlight = Extension.create({
  name: "issueHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: issueHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(issueHighlightKey);
            if (meta?.decorations) return meta.decorations as DecorationSet;
            if (meta?.clear) return DecorationSet.empty;
            // Kullanıcı yazmaya devam ederken mevcut işaretleri kaydır.
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return issueHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
