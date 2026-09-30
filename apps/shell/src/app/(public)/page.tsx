import { HomeContent } from "@/components/home-content";

/**
 * Public start page, prerendered at build time: it reads no session, no cookie and calls no
 * API, so the HTML is the same for every visitor and the edge may cache it
 * (docs/wiki/architektur-zonen.md, "Caching").
 */
export default function HomePage() {
  return <HomeContent />;
}
