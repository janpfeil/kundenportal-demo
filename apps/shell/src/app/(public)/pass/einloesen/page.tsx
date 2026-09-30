import type { Metadata } from "next";
import { RedeemPage } from "@/components/redeem-page";

// The invitation token is in the URL fragment; keep it out of Referer headers of any
// outgoing request as well (the fragment is never sent, this also drops path and query).
export const metadata: Metadata = { referrer: "no-referrer" };

/**
 * Public page that redeems a demo-pass invitation (`/pass/einloesen#<token>`). Prerendered
 * and cacheable like the start page: token, language and current offer are read in the
 * browser.
 */
export default function Page() {
  return <RedeemPage />;
}
