export class AuthorityError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "AuthorityError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function authorityFail(code, message, details = undefined) {
  throw new AuthorityError(code, message, details);
}
