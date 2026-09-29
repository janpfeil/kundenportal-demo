/** An error that maps directly to an HTTP problem response (RFC 9457). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ? `${title}: ${detail}` : title);
    this.name = "HttpError";
  }
}

export const badRequest = (detail?: string) => new HttpError(400, "Bad Request", detail);
export const forbidden = (detail?: string) => new HttpError(403, "Forbidden", detail);
export const notFound = (detail?: string) => new HttpError(404, "Not Found", detail);
