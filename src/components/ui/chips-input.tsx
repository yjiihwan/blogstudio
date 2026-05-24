"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";

/**
 * Free-text "chip" input — user types, presses Enter or comma to convert into
 * a tag. Values are submitted as repeated hidden inputs with the given name,
 * so the wrapping <form action=…> picks them up server-side.
 */
export function ChipsInput({
  name,
  defaultValue = [],
  placeholder = "엔터 또는 쉼표로 추가",
  tone = "accent",
}: {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  tone?: "accent" | "neutral";
}) {
  const [items, setItems] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const v = draft.trim().replace(/^,/, "").replace(/,$/, "").trim();
    if (!v) return;
    const next = Array.from(new Set([...items, v]));
    setItems(next);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && items.length) {
      setItems(items.slice(0, -1));
    }
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-paper-300 bg-paper-50 focus-within:border-ink-700 focus-within:ring-2 focus-within:ring-ink-700/10 min-h-[44px]"
      onClick={() => inputRef.current?.focus()}
    >
      {items.map((it) => (
        <span
          key={it}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
            tone === "accent"
              ? "bg-accent-100 text-accent-700"
              : "bg-paper-200 text-ink-700"
          }`}
        >
          {it}
          <button
            type="button"
            onClick={() => setItems(items.filter((x) => x !== it))}
            className="opacity-60 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
          <input type="hidden" name={name} value={it} />
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={items.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-ink-400"
      />
    </div>
  );
}
