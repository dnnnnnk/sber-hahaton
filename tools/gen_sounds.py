# Синтез собственных коротких звуков для приколов (никаких сторонних сэмплов).
import math, random, struct, sys, wave

RATE = 22050
random.seed(7)

def write(path, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    k = 0.85 / peak
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s * k)) * 32767)) for s in samples))

def env(t, attack, decay):
    return (t / attack if t < attack else math.exp(-(t - attack) / decay))

def pop():
    n = int(RATE * 0.14); out = []; ph = 0
    for i in range(n):
        t = i / RATE
        f = 520 + 900 * min(1, t / 0.05)
        ph += 2 * math.pi * f / RATE
        out.append(math.sin(ph) * env(t, 0.004, 0.035))
    return out

def bell(freq, dur, decay):
    n = int(RATE * dur)
    return [ (math.sin(2*math.pi*freq*i/RATE) + 0.35*math.sin(2*math.pi*freq*2.01*i/RATE) + 0.12*math.sin(2*math.pi*freq*3.02*i/RATE)) * env(i/RATE, 0.005, decay) for i in range(n)]

def mix(parts, total):
    out = [0.0] * int(RATE * total)
    for offset, samples in parts:
        start = int(RATE * offset)
        for i, s in enumerate(samples):
            if start + i < len(out): out[start + i] += s
    return out

def chime():
    notes = [523.25, 659.25, 783.99, 1046.5]
    return mix([(i * 0.09, bell(f, 0.6, 0.18)) for i, f in enumerate(notes)], 0.95)

def sparkle():
    parts = []
    for i in range(9):
        f = random.choice([1567.98, 1760, 2093, 2349.3, 2637])
        parts.append((i * 0.045 + random.random() * 0.02, bell(f, 0.25, 0.06)))
    return mix(parts, 0.7)

def boing():
    n = int(RATE * 0.45); out = []; ph = 0
    for i in range(n):
        t = i / RATE
        f = 180 + 320 * math.sin(math.pi * min(1, t / 0.3)) + 18 * math.sin(2 * math.pi * 22 * t)
        ph += 2 * math.pi * f / RATE
        out.append(math.sin(ph) * env(t, 0.01, 0.16))
    return out

def whoosh():
    n = int(RATE * 0.8); out = []; lp = 0
    for i in range(n):
        t = i / RATE
        cutoff = 0.04 + 0.18 * math.sin(math.pi * t / 0.8)
        lp += cutoff * ((random.random() * 2 - 1) - lp)
        out.append(lp * math.sin(math.pi * t / 0.8) ** 2)
    return out

out_dir = sys.argv[1]
for name, fn in [('pop', pop), ('chime', chime), ('sparkle', sparkle), ('boing', boing), ('whoosh', whoosh)]:
    write(f'{out_dir}/{name}.wav', fn())
print('ok')
