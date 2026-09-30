import type {
  LegacyAccountRef,
  LegacyContract,
  LegacyProfile,
  MigrationFailureCode,
} from "@kundenportal/events";

/** A legacy record in the portal's terms, ready for `LegacyAccountMigrated`. */
export interface MappedAccount {
  ok: true;
  account: LegacyAccountRef;
  email: string;
  displayName: string;
  profile: LegacyProfile;
  contracts: LegacyContract[];
  lastSignInAt: string;
}

/**
 * A legacy record the portal cannot take over as it is.
 * - `clarification`: the data is complete enough to process, but a person has to act
 *   (no or an invalid email address: the account cannot sign in) — a clarification case.
 * - `failed`: required master data is missing or malformed; processing fails and the
 *   record goes to the dead-letter queue, from where a corrected redrive is possible.
 */
export interface MappingProblem {
  ok: false;
  account: LegacyAccountRef;
  kind: "clarification" | "failed";
  code: MigrationFailureCode;
  message: string;
  fields: string[];
  /** Shown in the cockpit. */
  displayName: string;
  lastSignInAt: string;
}

export type MappingResult = MappedAccount | MappingProblem;

/** Corrections an operator enters in the cockpit before a redrive, e.g. a postal code. */
export type Corrections = {
  [field in "email" | "postalCode" | "street" | "houseNumber" | "city"]?: string | undefined;
};
