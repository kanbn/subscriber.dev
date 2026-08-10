export function printResult(data: unknown, opts: { json?: boolean }): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log("(none)");
      return;
    }
    console.table(data);
    return;
  }

  console.log(data);
}
