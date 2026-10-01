/** Messages of the operator's forms for an answer of the zone or API that is not a success. */
export interface FailureTexts {
  generic: string;
  session: string;
  forbidden: string;
  conflict: string;
  invalid: string;
}

/** 401 session over, 403 not allowed, 409 state does not allow it, 400/422 refused details. */
export function failureText(status: number, texts: FailureTexts): string {
  if (status === 401) return texts.session;
  if (status === 403) return texts.forbidden;
  if (status === 409) return texts.conflict;
  if (status === 400 || status === 422) return texts.invalid;
  return texts.generic;
}
