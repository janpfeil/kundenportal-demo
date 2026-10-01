import { HttpError } from "@kundenportal/service-kit";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const unprocessable = (detail: string) =>
  new HttpError(422, "Unprocessable Content", detail);
export const conflict = (detail: string) => new HttpError(409, "Conflict", detail);
