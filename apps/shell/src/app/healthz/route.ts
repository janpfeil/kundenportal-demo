/** Readiness check for the Lambda Web Adapter; does not touch the provider or the API. */
export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
