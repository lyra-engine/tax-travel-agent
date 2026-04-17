import { useRef, useState } from "react";

type Props = {
  disabled: boolean;
  streaming: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  placeholder: string;
};

export default function Composer({
  disabled,
  streaming,
  onSubmit,
  onCancel,
  placeholder,
}: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const t = text.trim();
    if (!t || disabled || streaming) return;
    onSubmit(t);
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  return (
    <div className="border-t border-white/5 bg-ink-950/40 px-4 py-3">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-ink-900/70 px-3 py-2 focus-within:border-brand-500/60">
        <textarea
          ref={taRef}
          value={text}
          onChange={autoResize}
          onKeyDown={handleKey}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-ink-500 disabled:cursor-not-allowed"
        />
        {streaming ? (
          <button
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-xl bg-danger-500/15 text-danger-400 transition hover:bg-danger-500/25"
            title="Stop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-400 disabled:bg-white/5 disabled:text-ink-500"
            title="Send (Enter)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4 20-7Z" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-1.5 px-2 text-[11px] text-ink-500">
        <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
        to send ·{" "}
        <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>{" "}
        for newline · Fidelis is informational and does not constitute tax advice.
      </p>
    </div>
  );
}
