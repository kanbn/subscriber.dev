import type { Editor, Range } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { monoStack } from "~/components/Marketing";

export interface MenuItem {
  title: string;
  hint: string;
  run: (editor: Editor, range: Range) => void;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SuggestionListProps {
  items: MenuItem[];
  command: (item: MenuItem) => void;
}

export const SuggestionList = forwardRef<
  SuggestionListHandle,
  SuggestionListProps
>(function SuggestionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((index) => (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div
      style={{ fontFamily: monoStack }}
      className="light z-50 w-64 overflow-hidden border border-border bg-background p-1 text-[13px] text-foreground"
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          onMouseEnter={() => setSelected(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            command(item);
          }}
          className={`flex w-full items-baseline justify-between gap-3 px-2.5 py-1.5 text-left ${
            index === selected ? "bg-background-50" : "hover:bg-background-50"
          }`}
        >
          <span className="text-foreground">{item.title}</span>
          <span className="truncate text-muted-foreground">{item.hint}</span>
        </button>
      ))}
    </div>
  );
});
