/**
 * Confirmation before an admin action goes out. No imports, so a node test can load it.
 *
 * Every admin button that changes production, the release queue or the board asks first (components/ConfirmAction.tsx).
 * With scripts running, the button opens a dialog and the form is sent only after "confirm" in that dialog, which sets the
 * `confirmed` field. With scripts off, a tick box in the form (`required`) stands in for the dialog. The server action also
 * refuses a request that lacks the field (`isConfirmed`), so a tap before the page was ready, or a request made by hand,
 * cannot get through either.
 */

/** The form field that says "the person confirmed this". */
export const CONFIRM_FIELD = "confirmed";
export const CONFIRM_VALUE = "yes";

/** True when the form carries the confirmation. Every guarded server action checks this first. */
export function isConfirmed(form: FormData): boolean {
  return form.get(CONFIRM_FIELD) === CONFIRM_VALUE;
}

export const NOT_CONFIRMED = "Nothing was done: the action was not confirmed. Press the button again and confirm.";

/** What each dialog says. `danger` kinds get the red action button. `echo` names a form field whose text the dialog repeats. */
export const CONFIRM_KINDS = {
  approve: { danger: false },
  approveStep: { danger: false },
  approveRollback: { danger: true },
  reject: { danger: true },
  hold: { danger: true },
  pause: { danger: true, echo: "reason" },
  resume: { danger: false },
  scores: { danger: false },
  drift: { danger: false },
  ticket: { danger: false, echo: "title" },
} as const satisfies Record<string, { danger: boolean; echo?: string }>;

export type ConfirmKind = keyof typeof CONFIRM_KINDS;

/** The phrase keys of one kind: heading, body and the action button. */
export function confirmKeys(kind: ConfirmKind) {
  return { title: `confirm.${kind}.title`, body: `confirm.${kind}.body`, action: `confirm.${kind}.action` } as const;
}

/** Which dialog an approval of a release of this kind opens. */
export function approveKind(releaseKind: string): ConfirmKind {
  return releaseKind === "ds1_step" ? "approveStep" : releaseKind === "rollback" ? "approveRollback" : "approve";
}

export type Step = "closed" | "asking";
export type Move = "ask" | "cancel" | "confirm";

/**
 * The whole confirmation, as a rule: the action is sent only by "confirm" while the dialog is open, and only once.
 * Asking opens it; cancel (Cancel button, Escape, a tap on the backdrop, the dialog closing for any reason) closes it
 * and sends nothing; a "confirm" with no open dialog (a stray or repeated tap) sends nothing.
 */
export function confirmStep(step: Step, move: Move): { step: Step; send: boolean } {
  if (move === "ask") return { step: "asking", send: false };
  if (move === "confirm" && step === "asking") return { step: "closed", send: true };
  return { step: "closed", send: false };
}
