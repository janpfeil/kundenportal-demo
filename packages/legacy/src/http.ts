/** A legacy system did not answer as expected (network, 5xx, unexpected body). */
export class LegacyUnavailableError extends Error {
  override readonly name = "LegacyUnavailableError";
}

export type Fetch = typeof fetch;

/**
 * Calls a legacy system with a deadline. Cognito gives its triggers 5 seconds in total,
 * so every call has to fail fast instead of hanging.
 */
export async function callJson(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<{ status: number; body: unknown }> {
  const { timeoutMs, ...rest } = init;
  let response: Response;
  try {
    response = await fetchImpl(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new LegacyUnavailableError(`${url}: ${(error as Error).message}`);
  }
  if (response.status >= 500) throw new LegacyUnavailableError(`${url}: HTTP ${response.status}`);
  const body: unknown = await response.json().catch(() => undefined);
  return { status: response.status, body };
}
