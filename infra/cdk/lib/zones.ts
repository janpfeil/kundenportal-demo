/**
 * Registry of the portal's Next.js zones besides the shell (multi-zones). Each zone is its
 * own Next.js app with a basePath, its own Lambda function in the app stack and its own
 * origin and path behaviours in the edge stack. Adding a zone means: an app under apps/,
 * built with `scripts/package-next-lambda.mjs <app>` (its static files go to S3 through
 * the edge stack), and one entry here.
 */
export interface ZoneDefinition {
  /** Short id used in construct ids and SSM parameter names. */
  id: string;
  /** Directory of the Next.js app, relative to the repository root. */
  app: string;
  /** URL prefix, identical to the app's `basePath`. */
  basePath: string;
}

export const ZONES: readonly ZoneDefinition[] = [
  { id: "contracts", app: "apps/contracts", basePath: "/vertraege" },
  { id: "consumption", app: "apps/consumption", basePath: "/verbrauch" },
  // Phase 3: migration cockpit, owner only (the API checks the Cognito group).
  { id: "cockpit", app: "apps/cockpit", basePath: "/cockpit" },
];

export const zoneParams = (zone: ZoneDefinition) => ({
  functionArn: `/kundenportal/app/zones/${zone.id}/function-arn`,
  originDomain: `/kundenportal/app/zones/${zone.id}/origin-domain`,
});
