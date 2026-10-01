"use client";

import { Button, Card, Notice, StatusBadge, TextField } from "@kundenportal/ui";
import { sendJson } from "@kundenportal/web-auth/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

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

/** "Kundenkonto": number and name of the legacy account, read-only, as a labelled field. */
function Candidate({ offer, texts }: { offer: LinkOffer; texts: LinkOffersTexts }) {
  const labelId = useId();
  return (
    <div className="link-offer-field" role="group" aria-labelledby={labelId}>
      <span className="kp-label" id={labelId}>
        {texts.candidate}
      </span>
      <span>
        <span className="kp-mono">{offer.candidate.customerNumber}</span> · {offer.displayName}
      </span>
      <span className="kp-muted link-offer-address">{offer.address}</span>
    </div>
  );
}

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
      <li data-testid="link-offer" data-status="linked" className="link-offer">
        <div className="link-offer-row">
          <Candidate offer={offer} texts={texts} />
          <StatusBadge tone="ok">{texts.linked}</StatusBadge>
        </div>
      </li>
    );
  }
  return (
    <li data-testid="link-offer" data-status="offered" className="link-offer">
      <form onSubmit={submit} aria-label={`${texts.candidate} ${label}`}>
        <div className="link-offer-row">
          <Candidate offer={offer} texts={texts} />
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
        </div>
        {state === "done" && <Notice tone="success">{texts.done}</Notice>}
        {state === "wrongPassword" && <Notice tone="error">{texts.wrongPassword}</Notice>}
        {state === "failed" && <Notice tone="error">{texts.failed}</Notice>}
      </form>
    </li>
  );
}

/**
 * Offers to link a second legacy account (journey J3), confirmed with its password: the
 * mockup's card "Weitere Kundenkonten" with the legacy system as tag.
 */
export function LinkOffers({ offers, texts }: { offers: LinkOffer[]; texts: LinkOffersTexts }) {
  if (offers.length === 0) return null;
  const systems = [...new Set(offers.map((offer) => texts.systems[offer.candidate.system]))];
  return (
    <Card
      as="section"
      title={texts.heading}
      icon="link"
      actions={systems.map((system) => (
        <span key={system} className="shell-tag">
          {system}
        </span>
      ))}
    >
      <p className="kp-muted shell-measure">{texts.lead}</p>
      <ul data-testid="link-offers" className="link-offers">
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
