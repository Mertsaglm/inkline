/**
 * "Bu cevapta X modeli kullanıldı" rozeti.
 *
 * Her AI route'u yanıtında `model` alanını döndürür (zincirde gerçekten cevap
 * veren model). Model bilinmiyorsa — ör. eski kayıtlar — hiçbir şey çizilmez.
 * Sunucu bileşeni olarak da kullanılabilsin diye state/hook içermez.
 */
export default function ModelNote({
  model,
  className = "",
}: {
  model?: string | null;
  className?: string;
}) {
  if (!model) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[.72rem] leading-none text-faint ${className}`}
      title={`Yanıt ${model} modeliyle üretildi`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
      </svg>
      Bu cevapta <span className="text-muted">{model}</span> modeli kullanıldı
    </span>
  );
}
