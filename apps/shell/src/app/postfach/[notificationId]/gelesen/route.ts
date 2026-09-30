import { api } from "@/lib/api";
import { guardWrite } from "@/lib/write-guard";

/** Marks a mailbox message as read (PATCH /notifications/{id}). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const guard = await guardWrite(request);
  if (guard instanceof Response) return guard;
  const { notificationId } = await params;
  const { error, response } = await (
    await api()
  ).PATCH("/notifications/{notificationId}", {
    params: { path: { notificationId } },
    body: { read: true },
  });
  return error
    ? Response.json(error, { status: response.status })
    : new Response(null, { status: 204 });
}
