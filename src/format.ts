export const fmt = (value: number | null | undefined, digits = 1): string =>
  value == null
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
export const money = (value: number | null | undefined): string =>
  value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
        maximumFractionDigits: value > 0 && value < 0.01 ? 8 : 2,
      }).format(value);
export const periodLabel = (workload: { period: string; requests: number }) =>
  workload.period === "request" && workload.requests > 1
    ? "batch"
    : workload.period;
export const colors = [
  "#194c8f",
  "#614083",
  "#704314",
  "#294c68",
  "#762d40",
  "#383f7a",
];
export const creatorColor = (creator: string, creators: string[]) =>
  colors[Math.max(0, creators.indexOf(creator)) % colors.length];
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
