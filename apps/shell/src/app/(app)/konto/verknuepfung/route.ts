import { api } from "@/lib/api";
import { guardWrite, readJson } from "@/lib/write-guard";

/** Confirms a link offer (POST /me/links); the browser sends it via sendJson. */
export async function POST(request: Request) {
  const guard = await guardWrite(request);
  if (guard instanceof Response) return guard;
  const body = (await readJson(request)) as
    { system?: unknown; customerNumber?: unknown; password?: unknown } | undefined;
  if (
    (body?.system !== "utility" && body?.system !== "telco") ||
    typeof body.customerNumber !== "string" ||
    typeof body.password !== "string"
  ) {
    return Response.json({ title: "Bad Request", status: 400 }, { status: 400 });
  }
  const { data, error, response } = await (
    await api()
  ).POST("/me/links", {
    body: { system: body.system, customerNumber: body.customerNumber, password: body.password },
  });
  return Response.json(data ?? error ?? {}, { status: response.status });
}
