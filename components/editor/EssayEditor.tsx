"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import {
  IssueHighlight,
  issueHighlightKey,
  buildIssueDecorations,
  type EditorIssue,
} from "./issueHighlight";
import { createClient } from "@/lib/supabase/client";
import type { CefrLevel } from "@/lib/cefr";
import type { AssistResult } from "@/lib/ai/schemas";
import ModelNote from "@/components/ModelNote";

interface Props {
  essayId: string;
  initialTitle: string;
  initialPrompt: string | null;
  initialContent: JSONContent | null;
  aiWarningsEnabled: boolean;
  level: CefrLevel;
}

type SaveState = "idle" | "saving" | "saved";

const KIND_LABELS: Record<string, string> = {
  grammar: "Gramer",
  vocab: "Kelime",
  structure: "Cümle yapısı",
  spelling: "Yazım",
  style: "Üslup",
};

function wordCountOf(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function SparkleIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
    </svg>
  );
}

export default function EssayEditor({
  essayId,
  initialTitle,
  initialPrompt,
  initialContent,
  aiWarningsEnabled,
  level,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issuesRef = useRef<Record<string, EditorIssue>>({});

  const [title, setTitle] = useState(initialTitle);
  const [aiOn, setAiOn] = useState(aiWarningsEnabled);
  const [wordCount, setWordCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [checking, setChecking] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkModel, setCheckModel] = useState<string | null>(null);

  const [popover, setPopover] = useState<{
    issue: EditorIssue;
    top: number;
    left: number;
  } | null>(null);

  const [sel, setSel] = useState<{
    from: number;
    to: number;
    text: string;
    top: number;
    left: number;
  } | null>(null);

  const [assist, setAssist] = useState<{
    loading: boolean;
    top: number;
    left: number;
    from: number;
    to: number;
    text: string;
    result: AssistResult | null;
    model: string | null;
    error: string | null;
  } | null>(null);
  const [assistStates, setAssistStates] = useState<
    Record<number, "approved" | "rejected">
  >({});

  // --- Kalıcılık ---
  const save = useCallback(
    async (editor: Editor) => {
      setSaveState("saving");
      const supabase = createClient();
      const text = editor.getText();
      await supabase
        .from("essays")
        .update({
          title: title || "Untitled",
          content: editor.getJSON(),
          plain_text: text,
          word_count: wordCountOf(text),
        })
        .eq("id", essayId);
      setSaveState("saved");
    },
    [essayId, title],
  );

  const rebuildDecorations = useCallback((editor: Editor) => {
    const decorations = buildIssueDecorations(
      editor.state.doc,
      Object.values(issuesRef.current),
    );
    editor.view.dispatch(
      editor.state.tr.setMeta(issueHighlightKey, { decorations }),
    );
  }, []);

  const runCheck = useCallback(
    async (editor: Editor) => {
      const text = editor.getText();
      if (text.trim().length < 12) return;
      setChecking(true);
      try {
        const res = await fetch("/api/ai/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        setCheckModel(data.model ?? null);
        const raw: Omit<EditorIssue, "id">[] = data.issues ?? [];
        const map: Record<string, EditorIssue> = {};
        raw.forEach((i, idx) => {
          const id = `iss-${Date.now()}-${idx}`;
          map[id] = { ...i, id };
        });
        issuesRef.current = map;
        rebuildDecorations(editor);
      } catch {
        /* sessiz geç */
      } finally {
        setChecking(false);
      }
    },
    [rebuildDecorations],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write your essay here… İngilizce yazmaya başla.",
      }),
      IssueHighlight,
    ],
    content: initialContent ?? "",
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
    onUpdate({ editor }) {
      setWordCount(wordCountOf(editor.getText()));
      setSaveState("idle");
      setPopover(null);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(editor), 1400);
      if (aiOn) {
        if (checkTimer.current) clearTimeout(checkTimer.current);
        checkTimer.current = setTimeout(() => runCheck(editor), 1300);
      }
    },
    onSelectionUpdate({ editor }) {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setSel(null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, " ");
      if (text.trim().length < 2) {
        setSel(null);
        return;
      }
      const coords = editor.view.coordsAtPos(to);
      const c = containerRef.current?.getBoundingClientRect();
      if (!c) return;
      setSel({
        from,
        to,
        text,
        top: coords.bottom - c.top + 6,
        left: Math.min(coords.left - c.left, c.width - 120),
      });
    },
  });

  useEffect(() => {
    if (editor) setWordCount(wordCountOf(editor.getText()));
  }, [editor]);

  // --- Öneri kaydı (analitik) ---
  const logFeedback = useCallback(
    (payload: Record<string, unknown>) => {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essay_id: essayId, ...payload }),
      }).catch(() => {});
    },
    [essayId],
  );

  // --- Issue popover tıklama ---
  const handleSurfaceClick = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-issue-id]");
    if (!el) {
      setPopover(null);
      return;
    }
    const id = el.getAttribute("data-issue-id")!;
    const issue = issuesRef.current[id];
    if (!issue) return;
    const rect = el.getBoundingClientRect();
    const c = containerRef.current!.getBoundingClientRect();
    setSel(null);
    setPopover({
      issue,
      top: rect.bottom - c.top + 6,
      left: Math.min(rect.left - c.left, c.width - 300),
    });
  }, []);

  function replaceFirst(editor: Editor, find: string, replace: string) {
    let found: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (!node.isText || !node.text) return;
      const idx = node.text.indexOf(find);
      if (idx !== -1) found = { from: pos + idx, to: pos + idx + find.length };
    });
    const hit = found as { from: number; to: number } | null;
    if (hit) {
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.insertText(replace, hit.from, hit.to));
      return true;
    }
    return false;
  }

  const applyIssue = (issue: EditorIssue) => {
    if (!editor || !issue.replacement) return;
    replaceFirst(editor, issue.span_text, issue.replacement);
    delete issuesRef.current[issue.id];
    rebuildDecorations(editor);
    logFeedback({
      kind: issue.kind,
      severity: issue.severity,
      source: "proactive",
      span_text: issue.span_text,
      message: issue.message,
      suggestion: issue.replacement,
      status: "accepted",
    });
    setPopover(null);
  };

  const dismissIssue = (issue: EditorIssue) => {
    if (!editor) return;
    delete issuesRef.current[issue.id];
    rebuildDecorations(editor);
    logFeedback({
      kind: issue.kind,
      severity: issue.severity,
      source: "proactive",
      span_text: issue.span_text,
      message: issue.message,
      status: "dismissed",
    });
    setPopover(null);
  };

  // --- İsteğe bağlı yardım ---
  const requestAssist = async () => {
    if (!editor || !sel) return;
    const full = editor.getText();
    const start = Math.max(0, full.indexOf(sel.text) - 200);
    const context = full.slice(start, start + sel.text.length + 400);
    setAssist({
      loading: true,
      top: sel.top,
      left: sel.left,
      from: sel.from,
      to: sel.to,
      text: sel.text,
      result: null,
      model: null,
      error: null,
    });
    setAssistStates({});
    setSel(null);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: sel.text, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata");
      setAssist((a) =>
        a ? { ...a, loading: false, result: data, model: data.model ?? null } : a,
      );
    } catch (err) {
      setAssist((a) =>
        a ? { ...a, loading: false, error: (err as Error).message } : a,
      );
    }
  };

  type Suggestion = AssistResult["suggestions"][number];

  const setChoice = (
    i: number,
    s: Suggestion,
    choice: "approved" | "rejected",
  ) => {
    if (!editor) return;
    const prev = assistStates[i];
    const next = prev === choice ? undefined : choice;
    const hasEdit = Boolean(s.span_text && s.replacement);

    if (prev === "approved" && hasEdit) {
      replaceFirst(editor, s.replacement!, s.span_text!);
    }
    if (next === "approved" && hasEdit) {
      replaceFirst(editor, s.span_text!, s.replacement!);
      logFeedback({
        kind: s.type,
        severity: "suggestion",
        source: "on_demand",
        span_text: s.span_text,
        suggestion: s.replacement,
        message: s.title,
        status: "accepted",
      });
    }
    if (next === "rejected") {
      logFeedback({
        kind: s.type,
        severity: "suggestion",
        source: "on_demand",
        span_text: s.span_text ?? undefined,
        message: s.title,
        status: "dismissed",
      });
    }

    setAssistStates((m) => {
      const copy = { ...m };
      if (next) copy[i] = next;
      else delete copy[i];
      return copy;
    });

    if (aiOn && hasEdit) {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      checkTimer.current = setTimeout(() => runCheck(editor), 800);
    }
  };

  // --- AI aç/kapa ---
  const toggleAi = async () => {
    const next = !aiOn;
    setAiOn(next);
    if (!next && editor) {
      issuesRef.current = {};
      editor.view.dispatch(
        editor.state.tr.setMeta(issueHighlightKey, { clear: true }),
      );
      setPopover(null);
    }
    // Supabase sorgu kurucuları tembel "thenable"dır: await edilmezse istek
    // hiç gönderilmez ve tercih sessizce kaydedilmemiş olur.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user)
      await supabase
        .from("profiles")
        .update({ ai_warnings_enabled: next })
        .eq("user_id", user.id);
    if (next && editor) runCheck(editor);
  };

  // --- Tamamla & Değerlendir ---
  const complete = async () => {
    if (!editor) return;
    if (wordCountOf(editor.getText()) < 20) {
      setError("Değerlendirme için biraz daha yaz (en az ~20 kelime).");
      return;
    }
    setError(null);
    setGrading(true);
    await save(editor);
    try {
      const res = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essayId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Değerlendirme başarısız.");
      router.push(`/essays/${essayId}`);
    } catch (err) {
      setError((err as Error).message);
      setGrading(false);
    }
  };

  return (
    <>
      {/* Konu bandı */}
      {initialPrompt && (
        <div className="mx-auto max-w-[820px] px-6 pt-6">
          <div className="card flex items-center gap-2.5 px-4 py-3">
            <span className="chip chip-cat shrink-0">Konu</span>
            <span className="font-read text-[.98rem] leading-[1.4] text-ink-soft">
              {initialPrompt}
            </span>
          </div>
        </div>
      )}

      {/* Sticky araç çubuğu */}
      <div
        className="sticky top-[53px] z-20 border-b border-line backdrop-blur-md [background:color-mix(in_srgb,var(--paper)_88%,transparent)]"
      >
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-3.5 px-6 py-2.5">
          <span className="band">{level}</span>
          <span className="font-mono text-[.78rem] text-muted">
            {wordCount} kelime
          </span>
          <span className="h-[18px] w-px bg-line" />
          {checking && aiOn ? (
            <span className="inline-flex items-center gap-[7px] font-sans text-[.82rem] text-muted">
              <span className="ink-pulse inline-flex text-coral">
                <SparkleIcon />
              </span>
              AI kontrol ediyor…
            </span>
          ) : saveState === "saved" ? (
            <span className="inline-flex items-center gap-1.5 font-sans text-[.82rem] text-positive">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              kaydedildi
            </span>
          ) : saveState === "saving" ? (
            <span className="font-sans text-[.82rem] text-faint">kaydediliyor…</span>
          ) : null}
          <div className="ml-auto flex items-center gap-2.5">
            <span className="font-sans text-[.82rem] text-ink-soft">AI uyarıları</span>
            <button
              type="button"
              role="switch"
              aria-checked={aiOn}
              onClick={toggleAi}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: aiOn ? "var(--coral)" : "var(--line-strong)" }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                style={{ left: aiOn ? "22px" : "2px" }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Başlık */}
      <div className="mx-auto max-w-[820px] px-6 pt-5">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("idle");
          }}
          placeholder="Başlık…"
          className="w-full border-none bg-transparent p-0 font-display text-[2.4rem] font-[420] leading-[1.1] tracking-[-0.02em] text-ink outline-none placeholder:text-faint"
          style={{ fontVariationSettings: "'opsz' 96, 'SOFT' 0, 'WONK' 1" }}
        />
      </div>

      {/* Yazma yüzeyi */}
      <div className="mx-auto max-w-[820px] px-6 pt-2 pb-10">
        <div
          ref={containerRef}
          className="relative rounded-md border border-line"
          style={{ background: "var(--surface-2)" }}
          onClick={handleSurfaceClick}
        >
          <EditorContent editor={editor} />

          {/* Seçim yardım butonu */}
          {sel && !assist && (
            <button
              onClick={requestAssist}
              style={{ top: sel.top, left: sel.left }}
              className="absolute z-20 inline-flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-float)]"
            >
              <SparkleIcon size={14} />
              AI yardım
            </button>
          )}

          {/* Issue popover */}
          {popover && (
            <div
              style={{ top: popover.top, left: popover.left, background: "var(--surface-2)" }}
              className="ink-pop absolute z-30 flex w-[300px] flex-col gap-2 rounded-md border border-line p-3.5 shadow-[var(--shadow-float)]"
            >
              <span
                className={`chip self-start rounded-sm !px-2.5 !py-1 text-[.72rem] font-semibold ${
                  popover.issue.severity === "critical" ? "chip-critical" : "chip-suggestion"
                }`}
              >
                {KIND_LABELS[popover.issue.kind] ?? popover.issue.kind}
              </span>
              <p className="font-read text-[.98rem] leading-[1.5] text-ink">
                {popover.issue.message}
              </p>
              {popover.issue.replacement ? (
                /* Metne birebir ne yazılacağını göster — "Uygula" tam olarak bunu yapar. */
                <div
                  className="rounded-sm px-3 py-2 font-read text-[.95rem] leading-[1.6]"
                  style={{ background: "color-mix(in srgb, var(--positive) 10%, transparent)" }}
                >
                  <span className="text-critical line-through">
                    {popover.issue.span_text}
                  </span>{" "}
                  <span className="text-positive">{popover.issue.replacement}</span>
                </div>
              ) : (
                <p className="font-sans text-[.72rem] text-faint">
                  Otomatik düzeltme yok — bu bilgi amaçlı bir uyarı.
                </p>
              )}
              <div className="mt-0.5 flex gap-2">
                {popover.issue.replacement && (
                  <button
                    onClick={() => applyIssue(popover.issue)}
                    className="btn btn-ink px-[15px] py-[7px] text-[.85rem]"
                  >
                    Uygula
                  </button>
                )}
                <button
                  onClick={() => dismissIssue(popover.issue)}
                  className="btn btn-ghost px-[15px] py-[7px] text-[.85rem]"
                >
                  Yoksay
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Alt bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            {error && (
              <span className="font-sans text-[.82rem] text-critical">{error}</span>
            )}
            <span className="font-sans text-[.8rem] text-faint">
              Bir altçizgiye tıkla · metni seçip “AI yardım”ı çağır
            </span>
            {aiOn && <ModelNote model={checkModel} />}
          </div>
          <button
            onClick={complete}
            disabled={grading}
            className="btn btn-positive px-6 py-3 text-[.98rem]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {grading ? "Değerlendiriliyor…" : "Tamamla & Değerlendir"}
          </button>
        </div>
      </div>

      {/* İsteğe bağlı yardım — sağ çekmece */}
      {assist && (
        <>
          <div
            onClick={() => setAssist(null)}
            className="ink-fadein fixed inset-0 z-40"
            style={{ background: "color-mix(in srgb, var(--ink) 34%, transparent)", backdropFilter: "blur(2px)" }}
          />
          <aside
            className="ink-slidein fixed inset-y-0 right-0 z-50 flex w-[min(400px,92vw)] flex-col border-l border-line shadow-[var(--shadow-float)]"
            style={{ background: "var(--surface-2)" }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-[18px]">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex text-coral">
                  <SparkleIcon size={19} />
                </span>
                <span className="font-sans text-[1.05rem] font-semibold text-ink">
                  AI yardım
                </span>
              </div>
              <button
                onClick={() => setAssist(null)}
                aria-label="Kapat"
                className="btn btn-ghost h-8 w-8 !p-0"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-auto p-5">
              {/* Seçili metin gösterilmiyor: kullanıcı neyi seçtiğini zaten biliyor
                  ve uzun seçimlerde çekmeceyi tamamen dolduruyordu. */}
              {assist.loading && (
                <p className="py-6 text-center font-sans text-[.95rem] text-muted">
                  Öneriler hazırlanıyor…
                </p>
              )}
              {assist.error && (
                <p className="py-2 font-sans text-[.9rem] text-critical">{assist.error}</p>
              )}

              {assist.result?.suggestions.map((s, i) => {
                const state = assistStates[i];
                const editable = Boolean(s.span_text && s.replacement);
                return (
                  <div
                    key={i}
                    className={`flex flex-col gap-2.5 rounded-md border p-4 transition ${
                      state === "approved"
                        ? "border-positive/40"
                        : state === "rejected"
                          ? "border-line opacity-60"
                          : "border-line"
                    }`}
                  >
                    <span
                      className={`chip self-start rounded-sm !px-2.5 !py-1 text-[.72rem] font-semibold ${
                        s.type === "grammar" || s.type === "spelling"
                          ? "chip-critical"
                          : "chip-suggestion"
                      }`}
                    >
                      {KIND_LABELS[s.type] ?? s.type}
                    </span>
                    <span className="font-sans text-[.98rem] font-semibold text-ink">
                      {s.title}
                    </span>
                    <p className="font-read text-[.95rem] leading-[1.55] text-ink-soft">
                      {s.explanation}
                    </p>
                    {editable && (
                      <div
                        className="rounded-sm px-3 py-2.5 font-read text-[.95rem] leading-[1.6]"
                        style={{ background: "var(--surface)" }}
                      >
                        <span className="text-critical line-through">{s.span_text}</span>{" "}
                        <span className="text-positive">{s.replacement}</span>
                      </div>
                    )}
                    {editable ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setChoice(i, s, "approved")}
                          className="btn px-[15px] py-[7px] text-[.85rem]"
                          style={
                            state === "approved"
                              ? { background: "var(--positive)", color: "#fff", borderColor: "var(--positive)" }
                              : { background: "color-mix(in srgb, var(--positive) 12%, transparent)", color: "var(--positive)" }
                          }
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          {state === "approved" ? "Uygulandı" : "Onayla"}
                        </button>
                        <button
                          onClick={() => setChoice(i, s, "rejected")}
                          className="btn btn-ghost px-[15px] py-[7px] text-[.85rem]"
                        >
                          {state === "rejected" ? "Reddedildi" : "Reddet"}
                        </button>
                      </div>
                    ) : (
                      <p className="font-sans text-[.72rem] text-faint">Bilgi amaçlı öneri</p>
                    )}
                  </div>
                );
              })}

              {assist.result && (
                <div className="border-t border-line pt-3.5">
                  <ModelNote model={assist.model} />
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
