import assert from "node:assert/strict"
import { engineSoundParams } from "../src/sim/audio.ts"

const idle = engineSoundParams({ enabled: true, ev: false, rpm: 750, throttle: 0, kmh: 0 })
const rev = engineSoundParams({ enabled: true, ev: false, rpm: 3500, throttle: 1, kmh: 40 })
const motor = engineSoundParams({ enabled: true, ev: true, rpm: 0, throttle: 0.8, kmh: 50 })
const muted = engineSoundParams({ enabled: false, ev: false, rpm: 3500, throttle: 1, kmh: 40 })

assert.ok(rev.frequency > idle.frequency && rev.gain > idle.gain, "máy xăng phải cao và lớn hơn khi tăng ga")
assert.ok(motor.frequency > idle.frequency && motor.gain > 0, "mô-tơ điện phải có tiếng theo tải/tốc độ")
assert.equal(muted.gain, 0, "tắt âm thanh phải đưa gain về 0")

console.log("engine audio profile: ok")
