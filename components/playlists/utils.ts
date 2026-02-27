export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function moveItem<T>(arr: T[], fromIndex: number, toIndex: number) {
  if (arr.length === 0) return arr;
  const from = clamp(fromIndex, 0, arr.length - 1);
  const to = clamp(toIndex, 0, arr.length - 1);
  if (from === to) return arr;

  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function safeUUID() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
