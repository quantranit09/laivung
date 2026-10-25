import type { Sound } from "./scenario"

/** Âm báo tổng hợp bằng WebAudio — không cần tải file âm thanh. */
let ctx: AudioContext | undefined

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01)
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + dur + 0.02)
}

export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
  } catch {
    /* trình duyệt không hỗ trợ âm thanh */
  }
}

export function play(s: Sound) {
  if (!ctx) return
  switch (s) {
    case "start":
      tone(880, 0, 0.18)
      tone(1320, 0.22, 0.3)
      break
    case "done":
      tone(1046, 0, 0.12)
      tone(1568, 0.12, 0.2)
      break
    case "fault":
      tone(220, 0, 0.25, "square", 0.08)
      break
    case "fatal":
      tone(196, 0, 0.6, "sawtooth", 0.1)
      break
    case "alarm":
      for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, i * 0.25, 0.22, "square", 0.08)
      break
    case "beep":
      tone(1200, 0, 0.1)
      break
  }
}

/** Tiếng "tách tách" của xi nhan. */
export function tick() {
  tone(2400, 0, 0.015, "square", 0.03)
}
