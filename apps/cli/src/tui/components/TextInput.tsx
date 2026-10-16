import type { ComponentProps } from "react";
import InkTextInput from "ink-text-input";
import { useEffect } from "react";

let focusedInputs = 0;

export const isTyping = () => focusedInputs > 0;

export function useTyping(active = true) {
  useEffect(() => {
    if (!active) return;
    focusedInputs++;
    return () => {
      focusedInputs--;
    };
  }, [active]);
}

export default function TextInput(props: ComponentProps<typeof InkTextInput>) {
  useTyping(props.focus !== false);
  return <InkTextInput {...props} />;
}
