import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFIRM_FIELD, CONFIRM_KINDS, CONFIRM_VALUE, approveKind, confirmKeys, confirmStep, isConfirmed, type Move, type Step } from "../src/lib/confirm.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { placeholders as placeholdersIn } from "./i18n-sheet.ts";

/** Run in web/: pnpm test:confirm */

/** What the button does: counts how many times the form would be sent, following the same rule the component uses. */
function press(moves: Move[]) {
  let step: Step = "closed";
  let sent = 0;
  for (const move of moves) {
    const next = confirmStep(step, move);
    step = next.step;
    if (next.send) sent += 1;
  }
  return sent;
}

test("pressing the button opens the dialog and sends nothing", () => {
  assert.equal(press(["ask"]), 0);
});

test("Cancel, Escape and a tap on the backdrop (all a cancel) send nothing", () => {
  assert.equal(press(["ask", "cancel"]), 0);
  assert.equal(press(["ask", "cancel", "cancel"]), 0);
});

test("confirming sends once, and only once", () => {
  assert.equal(press(["ask", "confirm"]), 1);
  assert.equal(press(["ask", "confirm", "confirm"]), 1);
  assert.equal(press(["ask", "confirm", "cancel"]), 1);
});

test("a confirm with no open dialog, or after a cancel, sends nothing", () => {
  assert.equal(press(["confirm"]), 0);
  assert.equal(press(["ask", "cancel", "confirm"]), 0);
});

test("a second ask after a cancel needs its own confirm", () => {
  assert.equal(press(["ask", "cancel", "ask"]), 0);
  assert.equal(press(["ask", "cancel", "ask", "confirm"]), 1);
});

test("the server refuses a form that was not confirmed", () => {
  const form = new FormData();
  form.set("id", "7");
  form.set("decision", "reject");
  assert.equal(isConfirmed(form), false);
  form.set(CONFIRM_FIELD, "");
  assert.equal(isConfirmed(form), false);
  form.set(CONFIRM_FIELD, "no");
  assert.equal(isConfirmed(form), false);
  form.set(CONFIRM_FIELD, CONFIRM_VALUE);
  assert.equal(isConfirmed(form), true);
});

test("an approval opens the dialog that fits the release kind", () => {
  assert.equal(approveKind("publish"), "approve");
  assert.equal(approveKind("daily_scores"), "approve");
  assert.equal(approveKind("ds1_step"), "approveStep");
  assert.equal(approveKind("rollback"), "approveRollback");
});

const english = PHRASES as Readonly<Record<string, string>>;
const dictionaries: Record<string, Readonly<Record<string, string | undefined>>> = { French: FR, Japanese: JA };
const kinds = Object.keys(CONFIRM_KINDS) as (keyof typeof CONFIRM_KINDS)[];
const keys = ["confirm.cancel", "confirm.changes", "confirm.tick", "confirm.size", "confirm.runs", ...kinds.flatMap((k) => Object.values(confirmKeys(k)))];

test("every dialog has its heading, text and button in English, French and Japanese, with the same {placeholders}", () => {
  for (const key of keys) {
    assert.ok(english[key], `English lacks ${key}`);
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      assert.ok(dictionary[key], `${name} lacks ${key}`);
      assert.deepEqual(placeholdersIn(dictionary[key] as string).sort(), placeholdersIn(english[key] as string).sort(), `${name} ${key}`);
    }
  }
});

test("a release dialog names the release number and title, and a reject and a hold are red", () => {
  for (const k of ["approve", "approveStep", "approveRollback", "reject", "hold"] as const) {
    const placeholders = placeholdersIn(english[confirmKeys(k).title] as string);
    assert.ok(placeholders.includes("number") && placeholders.includes("title"), k);
  }
  for (const k of ["reject", "hold", "pause", "approveRollback"] as const) assert.equal(CONFIRM_KINDS[k].danger, true, k);
});
