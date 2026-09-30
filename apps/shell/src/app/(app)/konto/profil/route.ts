import { api } from "@/lib/api";
import { guardWrite, readJson } from "@/lib/write-guard";

/** Changes display name and language (PATCH /me); the browser sends it via sendJson. */
export async function PATCH(request: Request) {
  const guard = await guardWrite(request);
  if (guard instanceof Response) return guard;
  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return Response.json({ title: "Bad Request", status: 400 }, { status: 400 });
  }
  const { displayName, locale } = body as { displayName?: unknown; locale?: unknown };
  const update: { displayName?: string; locale?: "de" | "en" } = {};
  if (typeof displayName === "string") update.displayName = displayName.trim();
  if (locale === "de" || locale === "en") update.locale = locale;
  const { data, error, response } = await (await api()).PATCH("/me", { body: update });
  return Response.json(data ?? error ?? {}, { status: response.status });
}
