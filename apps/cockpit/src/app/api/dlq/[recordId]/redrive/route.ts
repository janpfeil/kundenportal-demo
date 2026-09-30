import { forwardWrite } from "@/lib/forward";
import { parseRedrive } from "@/lib/redrive";

/** J8: redrives a failed record (POST /migration/dlq/{recordId}/redrive) with corrections. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const { recordId } = await params;
  return forwardWrite(
    request,
    (body) => (/^[A-Za-z0-9_-]{1,200}$/.test(recordId) ? parseRedrive(body) : undefined),
    (api, body) =>
      api.POST("/migration/dlq/{recordId}/redrive", { params: { path: { recordId } }, body }),
  );
}
