import type { Sound } from "./scenario"

/** Âm báo tổng hợp bằng WebAudio — không cần tải file âm thanh. */
let ctx: AudioContext | undefined

interface EngineVoice {
  primary: OscillatorNode
  secondary: OscillatorNode
  primaryGain: GainNode
  secondaryGain: GainNode
  filter: BiquadFilterNode
  gain: GainNode
}

let engineVoice: EngineVoice | undefined

export interface EngineSoundState {
  enabled: boolean
  ev: boolean
  rpm: number
  throttle: number
  kmh: number
}

/** Thông số âm thanh thuần để dễ kiểm tra mà không cần AudioContext. */
export function engineSoundParams({ enabled, ev, rpm, throttle, kmh }: EngineSoundState) {
  const pedal = Math.max(0, Math.min(1, throttle))
  if (ev) {
    const motion = Math.max(0, Math.min(1, kmh / 80))
    const frequency = 70 + Math.max(0, kmh) * 8 + pedal * 160
    return { frequency, harmonic: frequency * 2.01, gain: enabled ? 0.012 + pedal * 0.04 + motion * 0.015 : 0, cutoff: 900 + motion * 2200 + pedal * 900 }
  }
  const rev = Math.max(0, Math.min(1, (rpm - 700) / 4500))
  const frequency = Math.max(24, rpm / 30)
  return { frequency, harmonic: frequency * 2.02, gain: enabled ? 0.018 + rev * 0.045 + pedal * 0.025 : 0, cutoff: 420 + rev * 1500 + pedal * 500 }
}

function makeEngineVoice(): EngineVoice | undefined {
  if (!ctx) return
  const primary = ctx.createOscillator()
  const secondary = ctx.createOscillator()
  const primaryGain = ctx.createGain()
  const secondaryGain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  filter.type = "lowpass"
  filter.Q.value = 1.4
  primaryGain.gain.value = 0.7
  secondaryGain.gain.value = 0.3
  gain.gain.value = 0
  primary.connect(primaryGain).connect(filter)
  secondary.connect(secondaryGain).connect(filter)
  filter.connect(gain).connect(ctx.destination)
  primary.start()
  secondary.start()
  return { primary, secondary, primaryGain, secondaryGain, filter, gain }
}

/** Tiếng máy liên tục, bám ga/vòng tua và có chất âm riêng cho xe điện. */
export function updateEngineSound(state: EngineSoundState) {
  if (!ctx) return
  engineVoice ??= makeEngineVoice()
  if (!engineVoice) return
  const p = engineSoundParams(state)
  const now = ctx.currentTime
  engineVoice.primary.type = state.ev ? "sine" : "sawtooth"
  engineVoice.secondary.type = state.ev ? "triangle" : "square"
  engineVoice.primary.frequency.setTargetAtTime(p.frequency, now, 0.045)
  engineVoice.secondary.frequency.setTargetAtTime(p.harmonic, now, 0.045)
  engineVoice.primaryGain.gain.setTargetAtTime(state.ev ? 0.78 : 0.68, now, 0.08)
  engineVoice.secondaryGain.gain.setTargetAtTime(state.ev ? 0.22 : 0.32, now, 0.08)
  engineVoice.filter.frequency.setTargetAtTime(p.cutoff, now, 0.08)
  engineVoice.gain.gain.setTargetAtTime(p.gain, now, state.enabled ? 0.08 : 0.025)
}

export function stopEngineSound() {
  if (!ctx || !engineVoice) return
  const voice = engineVoice
  engineVoice = undefined
  voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
  window.setTimeout(() => {
    voice.primary.stop()
    voice.secondary.stop()
  }, 120)
}

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
