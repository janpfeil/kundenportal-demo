import { CustomerOrigin, Locale } from "@kundenportal/events";
import { z } from "zod";

export const Customer = z.object({
  customerId: z.string(),
  email: z.email(),
  displayName: z.string(),
  locale: Locale,
  origin: CustomerOrigin,
  createdAt: z.iso.datetime({ offset: true }),
});
export type Customer = z.infer<typeof Customer>;

/** Editable fields, mirrors `CustomerUpdate` in the OpenAPI contract. */
export const CustomerUpdate = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100).optional(),
    locale: Locale.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, "At least one field is required");
export type CustomerUpdate = z.infer<typeof CustomerUpdate>;

/** Chooses a display name for a new customer from what the token offers. */
export function initialDisplayName(email: string, name?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 100);
  return email.split("@")[0] || email;
}

export function initialLocale(locale?: string): Locale {
  const language = locale?.slice(0, 2).toLowerCase();
  return language === "en" ? "en" : "de";
}
