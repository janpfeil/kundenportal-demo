/** Readiness check for the Lambda Web Adapter; touches neither the provider nor the API. */
export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
