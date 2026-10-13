"use client";

import { useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { CONFIRM_FIELD, CONFIRM_KINDS, CONFIRM_VALUE, confirmKeys, confirmStep, type ConfirmKind, type Step } from "@/lib/confirm";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";

/**
 * The submit button of an admin form that changes production, the release queue or the board, with its confirmation.
 * It sits inside the `<form>` and replaces the plain submit button; the form's action is unchanged.
 *
 * - Scripts on: pressing it opens a dialog that says exactly what will happen (the release number and title, the table
 *   summary in `details`). Cancel is focused first. Cancel, Escape and a tap on the backdrop close it and send nothing;
 *   the dialog's action button sends the form with `confirmed=yes` (`requestSubmit`, so the form's own validation,
 *   its action and the pressed button's name and value all still apply). Focus returns to this button.
 * - Scripts off (or not loaded yet): a native `<dialog>` cannot open, so a required tick box in the form stands in for it, and
 *   the server action refuses any request without `confirmed=yes` (lib/confirm.ts).
 */
export function ConfirmAction({
  kind, number = "", title = "", details, name, value, className, disabled, children,
}: {
  kind: ConfirmKind;
  number?: string;
  title?: string;
  /** More for the dialog to show, for example the table summary of an approval. */
  details?: ReactNode;
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
  /** The button's label. */
  children: ReactNode;
}) {
  const { say } = useSpeaker();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const flag = useRef<HTMLInputElement>(null);
  const step = useRef<Step>("closed");
  const [echo, setEcho] = useState("");

  const spec: { danger: boolean; echo?: string } = CONFIRM_KINDS[kind];
  const { danger, echo: field } = spec;
  const keys = confirmKeys(kind);
  const vars = { number, title, echo };
  const heading = say(keys.title as PhraseKey, vars);

  function ask(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const form = event.currentTarget.form;
    if (!form || !form.reportValidity()) return;
    const typed = field ? form.elements.namedItem(field) : null;
    flushSync(() => setEcho(typed instanceof HTMLInputElement || typed instanceof HTMLTextAreaElement ? typed.value.trim() : ""));
    step.current = confirmStep(step.current, "ask").step;
    dialog.current?.showModal();
    cancel.current?.focus();
  }

  function go() {
    const next = confirmStep(step.current, "confirm");
    step.current = next.step;
    dialog.current?.close();
    const form = trigger.current?.form;
    const mark = flag.current;
    if (!next.send || !form || !mark) return;
    mark.name = CONFIRM_FIELD;
    try {
      form.requestSubmit(trigger.current);
    } finally {
      mark.removeAttribute("name");
    }
  }

  function closed() {
    step.current = confirmStep(step.current, "cancel").step;
    trigger.current?.focus();
  }

  return (
    <>
      <button ref={trigger} type="submit" name={name} value={value} className={className} disabled={disabled} onClick={ask}>{children}</button>
      <noscript>
        <label className="cf-nojs">
          <input type="checkbox" name={CONFIRM_FIELD} value={CONFIRM_VALUE} required /> {say("confirm.tick", { what: heading })}
        </label>
      </noscript>
      <input ref={flag} type="hidden" value={CONFIRM_VALUE} />
      <dialog
        ref={dialog}
        className="cf"
        aria-labelledby={`${id}t`}
        aria-describedby={`${id}b`}
        onClose={closed}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <div className="cf-body">
          <h2 id={`${id}t`} className="cf-title">{heading}</h2>
          <p id={`${id}b`}>{say(keys.body as PhraseKey, vars)}</p>
          {details}
          <div className="cf-actions">
            <button ref={cancel} type="button" className="signin-btn cf-cancel" onClick={() => dialog.current?.close()}>{say("confirm.cancel")}</button>
            <button type="button" className={`signin-btn cf-go${danger ? " cf-danger" : ""}`} onClick={go}>{say(keys.action as PhraseKey)}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
