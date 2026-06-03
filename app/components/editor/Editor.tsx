"use client";

// Editor — full-height markdown textarea with a live character count.
// Background is transparent so the panel's blurred surface shows through.

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function Editor({ value, onChange }: EditorProps) {
  return (
    <div className="relative flex h-full flex-col">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start writing in Markdown..."
        spellCheck={false}
        className="h-full w-full flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-[1.8] text-text-primary placeholder:text-text-muted outline-none"
      />
      <div className="pointer-events-none absolute bottom-3 right-4 text-xs text-text-muted">
        {value.length} chars
      </div>
    </div>
  );
}
