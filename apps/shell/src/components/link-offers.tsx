"use client";

import { Badge, Button, Card, Notice, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export interface LinkOffer {
  candidate: { system: "utility" | "telco"; customerNumber: string };
  displayName: string;
  address: string;
  status: "offered" | "linked";
}

export interface LinkOffersTexts {
  heading: string;
  lead: string;
  candidate: string;
  password: string;
  confirm: string;
  linked: string;
  done: string;
  wrongPassword: string;
  failed: string;
  systems: { utility: string; telco: string };
}

type State = "idle" | "saving" | "done" | "wrongPassword" | "failed";

function Offer({ offer, texts }: { offer: LinkOffer; texts: LinkOffersTexts }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const { system, customerNumber } = offer.candidate;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("saving");
    const result = await sendJson("POST", "/konto/verknuepfung", {
      system,
      customerNumber,
      password: String(form.get("password") ?? ""),
    });
    setState(result.ok ? "done" : result.status === 403 ? "wrongPassword" : "failed");
    if (result.ok) router.refresh();
  }

  const label = `${texts.systems[system]} ${customerNumber}`;
  if (offer.status === "linked") {
    return (
      <li data-testid="link-offer" data-status="linked">
        {label} — {offer.address} <Badge tone="success">{texts.linked}</Badge>
      </li>
    );
  }
  return (
    <li data-testid="link-offer" data-status="offered">
      <form onSubmit={submit} aria-label={`${texts.candidate} ${label}`}>
        <p>
          <strong>{label}</strong>: {offer.displayName}, {offer.address}
        </p>
        <TextField
          name="password"
          type="password"
          label={texts.password}
          autoComplete="off"
          required
          maxLength={200}
        />
        <Button type="submit" disabled={state === "saving" || state === "done"}>
          {texts.confirm}
        </Button>
        {state === "done" && <Notice tone="success">{texts.done}</Notice>}
        {state === "wrongPassword" && <Notice tone="error">{texts.wrongPassword}</Notice>}
        {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
      </form>
    </li>
  );
}

/** Offers to link a second legacy account (journey J3), confirmed with its password. */
export function LinkOffers({ offers, texts }: { offers: LinkOffer[]; texts: LinkOffersTexts }) {
  if (offers.length === 0) return null;
  return (
    <Card title={texts.heading}>
      <p>{texts.lead}</p>
      <ul data-testid="link-offers">
        {offers.map((offer) => (
          <Offer
            key={`${offer.candidate.system}:${offer.candidate.customerNumber}`}
            offer={offer}
            texts={texts}
          />
        ))}
      </ul>
    </Card>
  );
}
