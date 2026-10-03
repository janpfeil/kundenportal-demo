"use client";

import { Button, StatusBadge } from "@kundenportal/ui";
import { fill } from "@kundenportal/ui/i18n";
import { Fragment, useId, useState } from "react";
import type { Dictionary } from "@/i18n";
import { RedriveForm } from "./redrive-form";

export interface DeadLetterRow {
  id: string;
  customerNumber: string;
  displayName: string;
  /** The problem in words (see problemText). */
  problem: string;
  /** The service's technical message, shown as tooltip. */
  message?: string | undefined;
  attempts: number;
  fields: readonly string[];
}

/**
 * The dead-letter queue as in the mockup: account with name, problem, attempts and a
 * "Korrigieren" button that opens an inline row with the correction fields and the redrive.
 * The first record starts open, so the most recent failure can be fixed right away.
 */
export function DeadLetterTable({
  rows,
  texts,
  columns,
}: {
  rows: readonly DeadLetterRow[];
  texts: Dictionary["deadLetters"];
  columns: Pick<Dictionary["columns"], "account" | "problem">;
}) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(rows[0] ? [rows[0].id] : []));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <table className="kp-table cockpit-table" data-testid="dead-letters">
      <caption className="kp-sr-only">{texts.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{columns.account}</th>
          <th scope="col">{columns.problem}</th>
          <th scope="col" data-align="end">
            {texts.attempts}
          </th>
          <th scope="col" data-align="end">
            <span className="kp-sr-only">{texts.action}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const expanded = open.has(row.id);
          const formId = `${baseId}-${index}`;
          return (
            <Fragment key={row.id}>
              <tr className={expanded ? "cockpit-expanded" : undefined}>
                <td data-label={columns.account}>
                  <span>
                    <span className="kp-mono cockpit-nowrap">{row.customerNumber}</span>
                    <span className="cockpit-sub">{row.displayName}</span>
                  </span>
                </td>
                <td data-label={columns.problem}>
                  <StatusBadge tone="err" title={row.message || undefined}>
                    {row.problem}
                  </StatusBadge>
                </td>
                <td data-label={texts.attempts} data-align="end">
                  {row.attempts}
                </td>
                <td data-label={texts.action} data-align="end">
                  <Button
                    variant="ghost"
                    size="small"
                    aria-expanded={expanded}
                    aria-controls={formId}
                    aria-label={fill(expanded ? texts.closeLabel : texts.correctLabel, {
                      account: row.customerNumber,
                    })}
                    onClick={() => toggle(row.id)}
                  >
                    {expanded ? texts.close : texts.correct}
                  </Button>
                </td>
              </tr>
              <tr id={formId} className="cockpit-expanded cockpit-form-row" hidden={!expanded}>
                <td colSpan={4}>
                  {expanded && (
                    <RedriveForm
                      recordId={row.id}
                      fields={row.fields}
                      texts={texts}
                      legend={fill(texts.formLabel, { account: row.customerNumber })}
                    />
                  )}
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
