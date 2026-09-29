import { z } from "zod";
import { EventSource, eventDetailSchema } from "./envelope.js";

export const Locale = z.enum(["de", "en"]);
export type Locale = z.infer<typeof Locale>;

/** Where a customer account came from: newly registered or taken over from a legacy system. */
export const CustomerOrigin = z.enum(["registration", "legacy-utility", "legacy-telco"]);
export type CustomerOrigin = z.infer<typeof CustomerOrigin>;

export const CustomerRegistered = {
  source: EventSource.customer,
  detailType: "CustomerRegistered",
  detail: eventDetailSchema(
    z.object({
      customerId: z.string().min(1),
      /** Subject (`sub` claim) of the identity the customer signed in with. */
      subject: z.string().min(1),
      email: z.email(),
      displayName: z.string().min(1),
      locale: Locale,
      origin: CustomerOrigin,
    }),
  ),
} as const;
export type CustomerRegisteredDetail = z.infer<typeof CustomerRegistered.detail>;
