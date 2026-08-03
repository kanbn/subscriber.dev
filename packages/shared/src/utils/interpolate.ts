/**
 * Replaces {{variableName}} tokens with values from `context`. Missing/null
 * values render as an empty string rather than leaving the literal token.
 */
export function interpolate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
    (_match, key: string) => {
      const value = context[key];
      return value === undefined || value === null ? "" : String(value);
    },
  );
}
