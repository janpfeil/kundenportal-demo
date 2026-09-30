/**
 * Browser side of the write path. CloudFront signs requests to the zones' Lambda function
 * URLs with origin access control (SigV4); for requests with a body it needs the SHA-256 of
 * the body in `x-amz-content-sha256`, which only the sender can compute. All state-changing
 * calls from the browser therefore go through this helper instead of plain form posts.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
}

export async function sendJson<T = unknown>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body: unknown,
): Promise<JsonResponse<T>> {
  const text = JSON.stringify(body ?? {});
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-amz-content-sha256": await sha256Hex(text) },
    body: text,
  });
  const type = response.headers.get("content-type") ?? "";
  const result: JsonResponse<T> = { ok: response.ok, status: response.status };
  if (type.includes("json")) result.data = (await response.json()) as T;
  return result;
}
