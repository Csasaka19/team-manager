/**
 * Sliding-window rate limiter — call `waitForSlot()` before each request
 * and it returns once the request can safely proceed without breaching
 * the configured throughput cap.
 *
 * Used here to stay well clear of the Google Sheets API's 60 req/min/user
 * ceiling. The fetcher polls 2 tabs every 15 minutes by default, so we're
 * normally at ~2 calls per quarter-hour. The limiter exists for the
 * "user mashed Refresh ten times in two minutes" path — and for any
 * future caller (a paginated fetch, a multi-spreadsheet dashboard) that
 * could otherwise spike past 60.
 */

export class RateLimiter {
  /** Timestamps (ms epoch) of every call admitted within the active
   *  window. Old entries get evicted on every waitForSlot() call. */
  private timestamps: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  /**
   * Returns when the caller is free to proceed. If the in-window count
   * already equals `maxRequests`, sleeps until the oldest one expires
   * (plus a 100ms safety buffer) then admits.
   *
   * The function admits one slot per call — callers should `await` it
   * exactly once per outbound request.
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now()
    // Evict timestamps that have aged out of the window.
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!
      const waitTime = oldest + this.windowMs - now + 100
      // eslint-disable-next-line no-console
      console.info(
        `[rate-limiter] window full (${this.timestamps.length}/${this.maxRequests}) — waiting ${waitTime}ms`,
      )
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      // Re-evict in case enough time passed that more slots opened.
      const afterWait = Date.now()
      this.timestamps = this.timestamps.filter(
        (t) => afterWait - t < this.windowMs,
      )
    }

    this.timestamps.push(Date.now())
  }

  /** Read-only count of slots currently used in the active window —
   *  handy for diagnostics panels. */
  inFlightCount(): number {
    const now = Date.now()
    return this.timestamps.filter((t) => now - t < this.windowMs).length
  }
}

/** Conservative limit: 50/min vs Google's 60/min/user, so a small burst
 *  from concurrent polls + a manual refresh can't trip the real ceiling.
 *  Shared across every Sheets API call site. */
export const sheetsRateLimiter = new RateLimiter(50, 60_000)
