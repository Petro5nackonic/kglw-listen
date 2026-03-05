export type IdentifierStability = "good" | "unstable" | "restricted";

export type HttpValidationClass =
  | "ok"
  | "not_found"
  | "restricted"
  | "unstable"
  | "error";

export type HttpValidationResult = {
  ok: boolean;
  status: number | null;
  kind: HttpValidationClass;
  attempts: number;
};

export type ValidateOptions = {
  retries?: number;
  baseBackoffMs?: number;
  jitterRatio?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BACKOFFS = [250, 750, 2000, 5000];

export function classifyHttpStatus(status: number): HttpValidationClass {
  if (status === 200 || status === 206) return "ok";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "restricted";
  if (status === 503) return "unstable";
  return "error";
}

function withJitter(ms: number, jitterRatio: number): number {
  if (jitterRatio <= 0) return ms;
  const amplitude = Math.max(0, Math.floor(ms * jitterRatio));
  const delta = Math.floor((Math.random() * (amplitude * 2 + 1)) - amplitude);
  return Math.max(0, ms + delta);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateUrlWithRangeGet(
  url: string,
  options?: ValidateOptions,
): Promise<HttpValidationResult> {
  const fetchImpl = options?.fetchImpl || fetch;
  const retries = Math.max(0, options?.retries ?? DEFAULT_BACKOFFS.length);
  const baseBackoffMs = Math.max(1, options?.baseBackoffMs ?? 250);
  const jitterRatio = Math.max(0, options?.jitterRatio ?? 0.2);
  const sleep = options?.sleep || defaultSleep;

  let attempts = 0;
  let lastStatus: number | null = null;
  const backoffs = DEFAULT_BACKOFFS.map((value) => {
    if (baseBackoffMs === 250) return value;
    return Math.floor((value / 250) * baseBackoffMs);
  });

  for (let i = 0; i <= retries; i += 1) {
    attempts += 1;
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      });
      lastStatus = res.status;
      const kind = classifyHttpStatus(res.status);
      if (kind === "ok") return { ok: true, status: res.status, kind, attempts };
      if (kind === "unstable" && i < retries) {
        const delay = withJitter(backoffs[Math.min(i, backoffs.length - 1)] || 5000, jitterRatio);
        await sleep(delay);
        continue;
      }
      return { ok: false, status: res.status, kind, attempts };
    } catch {
      if (i < retries) {
        const delay = withJitter(backoffs[Math.min(i, backoffs.length - 1)] || 5000, jitterRatio);
        await sleep(delay);
        continue;
      }
      return { ok: false, status: lastStatus, kind: "error", attempts };
    }
  }

  return { ok: false, status: lastStatus, kind: "error", attempts };
}
