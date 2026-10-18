/** A failed read of the archive (a busy or slow database, a bad answer). Pages show the inline "Couldn't load" note for it, not a 404 or 500. */
export class ApiError extends Error {
  name = "ApiError";
  /** The HTTP status the database answered with, when it answered. */
  status?: number;
  /** The database could not answer (5xx, timeout, network): see failure.ts for what a page does with it. */
  transient: boolean;
  constructor(message: string, status?: number, transient = false) {
    super(message);
    this.status = status;
    this.transient = transient;
  }
}
