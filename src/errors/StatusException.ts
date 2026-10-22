export class StatusException extends Error {
  public status: number
  /** Optional machine-readable reason, returned to the client as `code`. */
  public code?: string

  public constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    if (code) this.code = code
  }
}
