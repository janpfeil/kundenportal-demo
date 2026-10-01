"use client";

import { Button, Card } from "@kundenportal/ui";
import { type ReactNode, useId, useState } from "react";
import { ProfileForm, type ProfileFormTexts } from "./profile-form";

export interface AccountCardProps {
  title: string;
  /** The account's facts, rendered on the server. */
  children: ReactNode;
  profile: { displayName: string; locale: "de" | "en" };
  texts: ProfileFormTexts & { open: string; close: string };
}

/**
 * Card "Mein Konto": the account's facts and, behind "Profil ändern" in the card's heading
 * row, the form for display name and language (disclosure pattern: aria-expanded).
 */
export function AccountCard({ title, children, profile, texts }: AccountCardProps) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  return (
    <Card
      as="section"
      title={title}
      className="account-card"
      actions={
        <Button
          variant="secondary"
          className="shell-small-button"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? texts.close : texts.open}
        </Button>
      }
    >
      {children}
      <div id={formId} hidden={!open} className="account-profile">
        {open && (
          <ProfileForm displayName={profile.displayName} locale={profile.locale} texts={texts} />
        )}
      </div>
    </Card>
  );
}
