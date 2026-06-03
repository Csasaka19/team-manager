/**
 * Notification chime. Generates a short, quiet two-note pattern via the Web
 * Audio API — no audio assets, no network. Two sine notes, 100 ms each,
 * ascending (E5 → A5). Total length ≈ 200 ms.
 *
 * The pref toggle lives in Settings → Notifications. The bell reads the
 * stored flag at the moment a new notification arrives so changes apply on
 * the next arrival without any cross-component plumbing.
 */

const NOTIF_SOUND_PREFIX = 'team-manager.notif-sound.'

/** Read the saved "play sound" toggle for a given user. Default: off. */
export function isNotifSoundEnabled(userId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(NOTIF_SOUND_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

/** Persist the pref. */
export function setNotifSoundEnabled(userId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      NOTIF_SOUND_PREFIX + userId,
      enabled ? '1' : '0',
    )
  } catch {
    // ignore
  }
}

let ctx: AudioContext | null = null

/**
 * Play the notification chime. Safe to call repeatedly — the AudioContext is
 * cached and resumed if suspended. Silently does nothing in environments
 * without `AudioContext`.
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    if (!ctx) ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()

    const base = ctx.currentTime
    playNote(ctx, 660, base, 0.1) // E5
    playNote(ctx, 880, base + 0.1, 0.1) // A5
  } catch (err) {
    console.warn('[notif sound] failed to play:', err)
  }
}

/** Schedule a single sine note with a tiny attack + release envelope. */
function playNote(
  c: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Envelope: quick ramp up to 0.08 (quiet), then ramp back to silence by
  // the end of the note. Avoids the pop you'd get from a hard start/stop.
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(0.08, startAt + 0.01)
  gain.gain.linearRampToValueAtTime(0, startAt + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}
