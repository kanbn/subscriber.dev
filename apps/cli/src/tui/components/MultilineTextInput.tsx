import { Text, useInput } from "ink";
import { useState } from "react";

import { useTyping } from "./TextInput.js";

function moveVertically(value: string, offset: number, delta: number): number {
  const lines = value.split("\n");

  let remaining = offset;
  let row = 0;
  for (; row < lines.length; row++) {
    const lineLength = lines[row]?.length ?? 0;
    if (remaining <= lineLength) break;
    remaining -= lineLength + 1;
  }
  const col = remaining;

  const targetRow = Math.min(Math.max(row + delta, 0), lines.length - 1);
  const targetCol = Math.min(col, lines[targetRow]?.length ?? 0);

  let newOffset = 0;
  for (let i = 0; i < targetRow; i++) {
    newOffset += (lines[i]?.length ?? 0) + 1;
  }
  return newOffset + targetCol;
}

export function MultilineTextInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const [cursorOffset, setCursorOffset] = useState(value.length);
  useTyping();

  useInput((input, key) => {
    if (key.ctrl && input === "d") {
      onSubmit(value);
      return;
    }

    let nextValue = value;
    let nextCursorOffset = cursorOffset;

    if (key.leftArrow) {
      nextCursorOffset = Math.max(0, cursorOffset - 1);
    } else if (key.rightArrow) {
      nextCursorOffset = Math.min(value.length, cursorOffset + 1);
    } else if (key.upArrow) {
      nextCursorOffset = moveVertically(value, cursorOffset, -1);
    } else if (key.downArrow) {
      nextCursorOffset = moveVertically(value, cursorOffset, 1);
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        nextValue =
          value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        nextCursorOffset = cursorOffset - 1;
      }
    } else if (key.return) {
      nextValue =
        value.slice(0, cursorOffset) + "\n" + value.slice(cursorOffset);
      nextCursorOffset = cursorOffset + 1;
    } else if (input.length > 0 && !key.ctrl && !key.meta) {
      nextValue =
        value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
      nextCursorOffset = cursorOffset + input.length;
    }

    setCursorOffset(nextCursorOffset);
    if (nextValue !== value) onChange(nextValue);
  });

  const before = value.slice(0, cursorOffset);
  const cursorChar = value[cursorOffset] ?? " ";
  const after = value.slice(cursorOffset + 1);

  return (
    <Text>
      {before}
      <Text inverse>{cursorChar === "\n" ? " " : cursorChar}</Text>
      {cursorChar === "\n" ? "\n" : ""}
      {after}
    </Text>
  );
}
