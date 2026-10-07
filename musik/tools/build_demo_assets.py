#!/usr/bin/env python3
"""Erzeugt die Demo-Inhalte der ROUGE-App: Audio, Cover, Icons und data/catalog.json.

Alle Inhalte werden hier selbst synthetisiert bzw. gezeichnet (keine fremden Samples,
keine urheberrechtlich geschützten Songs, Cover oder Fotos) und stehen unter CC0.
Sie sind in der App überall als "DEMO" gekennzeichnet.

Aufruf:  python3 musik/tools/build_demo_assets.py [--images-only]
Benötigt: numpy, Pillow, ffmpeg (MP3-Encoder libmp3lame).
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SR = 44100
ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "assets" / "audio"
IMG = ROOT / "assets" / "img"
FONT_BOLD = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
FONT_MED = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

RED = (232, 17, 45)
DEEP = (120, 8, 22)
BLACK = (9, 9, 10)

# --------------------------------------------------------------------------
# Katalog-Definition (Demo-Titel, bewusst generisch und als Demo markiert)
# --------------------------------------------------------------------------
MIN = [0, 3, 7]
MAJ = [0, 4, 7]
PROG_A = [(0, MIN), (8, MAJ), (3, MAJ), (10, MAJ)]   # i  VI  III VII
PROG_B = [(0, MIN), (5, MIN), (8, MAJ), (7, MIN)]    # i  iv  VI  v
PROG_C = [(0, MIN), (3, MAJ), (10, MAJ), (8, MAJ)]   # i  III VII VI
PROG_D = [(0, MAJ), (7, MAJ), (9, MIN), (5, MAJ)]    # I  V   vi  IV

ALBUMS = [
    dict(id="alb-rouge-session", title="Rouge Session", year=2026, type="album",
         cover="rings", added="2026-09-12", seed=11),
    dict(id="alb-beton-neon", title="Béton & Néon", year=2025, type="album",
         cover="bars", added="2025-11-03", seed=23),
    dict(id="sgl-rideau-rouge", title="Rideau Rouge", year=2026, type="single",
         cover="sun", added="2026-10-01", seed=31),
    dict(id="sgl-mirage", title="Mirage", year=2025, type="single",
         cover="halftone", added="2025-12-20", seed=47),
    dict(id="sgl-aube", title="Aube", year=2026, type="single",
         cover="slash", added="2026-09-28", seed=59),
]

# id, titel, album, bpm, root(midi), prog, stil, pop, seed
TRACKS = [
    ("nuit-rouge", "Nuit Rouge", "alb-rouge-session", 92, 33, PROG_A, "trap", 96, 101),
    ("boulevard", "Boulevard", "alb-rouge-session", 98, 29, PROG_B, "boombap", 88, 102),
    ("neon", "Néon", "alb-rouge-session", 124, 38, PROG_C, "house", 91, 103),
    ("cap-sur-minuit", "Cap sur Minuit", "alb-rouge-session", 85, 36, PROG_A, "trap", 74, 104),
    ("etincelle", "Étincelle", "alb-rouge-session", 140, 40, PROG_B, "drive", 82, 105),
    ("quartier-calme", "Quartier Calme", "alb-beton-neon", 80, 31, PROG_C, "lofi", 69, 201),
    ("vitesse", "Vitesse", "alb-beton-neon", 150, 35, PROG_A, "drive", 79, 202),
    ("sous-la-pluie", "Sous la Pluie", "alb-beton-neon", 70, 30, PROG_B, "ambient", 61, 203),
    ("dernier-metro", "Dernier Métro", "alb-beton-neon", 110, 33, PROG_C, "boombap", 77, 204),
    ("rideau-rouge", "Rideau Rouge", "sgl-rideau-rouge", 96, 38, PROG_A, "trap", 93, 301),
    ("mirage", "Mirage", "sgl-mirage", 118, 37, PROG_B, "house", 85, 302),
    ("aube", "Aube", "sgl-aube", 100, 31, PROG_D, "lofi", 72, 303),
]

PLAYLISTS = [
    dict(id="pl-rouge-essentials", title="Rouge Essentials",
         description="Die stärksten Demo-Tracks im Überblick.",
         tracks=["nuit-rouge", "rideau-rouge", "neon", "boulevard", "mirage", "etincelle"]),
    dict(id="pl-night-drive", title="Night Drive",
         description="Tempo hoch, Fenster runter – Demo-Mix für die Nachtfahrt.",
         tracks=["vitesse", "etincelle", "neon", "mirage", "dernier-metro"]),
    dict(id="pl-calme", title="Calme",
         description="Ruhige Demo-Tracks zum Runterkommen.",
         tracks=["quartier-calme", "sous-la-pluie", "aube", "cap-sur-minuit"]),
]

# --------------------------------------------------------------------------
# Synthese
# --------------------------------------------------------------------------

def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def env_ad(n: int, atk: float, rel: float) -> np.ndarray:
    e = np.ones(n)
    a = max(1, int(atk * SR))
    r = max(1, min(n, int(rel * SR)))
    e[:a] = np.linspace(0, 1, a)[: min(a, n)]
    e[-r:] *= np.linspace(1, 0, r)
    return e


def highpass(x: np.ndarray, k: int = 1) -> np.ndarray:
    for _ in range(k):
        x = np.diff(x, prepend=0.0)
    return x


def lowpass_fft(x: np.ndarray, fc: float, slope: float = 3.0) -> np.ndarray:
    """Weiches Tiefpassfilter per FFT (mono oder stereo, Achse 0)."""
    n = x.shape[0]
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1.0 / (1.0 + (f / fc) ** (2 * slope))
    if x.ndim == 2:
        g = g[:, None]
    return np.fft.irfft(spec * g, n=n, axis=0)


def kick() -> np.ndarray:
    t = np.arange(int(0.5 * SR)) / SR
    f = 42 + 120 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 400) * 0.3
    return np.tanh((body + click) * 1.6)


def snare(rng) -> np.ndarray:
    t = np.arange(int(0.28 * SR)) / SR
    noise = highpass(rng.standard_normal(t.size)) * np.exp(-t * 20)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 28)
    return np.tanh(noise * 0.5 + tone * 0.7)


def clap(rng) -> np.ndarray:
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for off in (0.0, 0.011, 0.023):
        s = int(off * SR)
        tt = t[: n - s]
        out[s:] += highpass(rng.standard_normal(tt.size)) * np.exp(-tt * 55)
    out += highpass(rng.standard_normal(n)) * np.exp(-t * 16) * 0.6
    return np.tanh(out * 0.45)


def hat(rng, open_: bool = False) -> np.ndarray:
    n = int((0.32 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 2) * np.exp(-t * (14 if open_ else 70)) * 0.45


def bass808(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t * 40))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 1.8)
    s = np.tanh(s * 2.2) * 0.75
    s += np.sin(ph * 2) * 0.12 * np.exp(-t * 5)
    return s * env_ad(n, 0.004, 0.05)


def pluck(freq: float, dur: float, bright: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h in range(1, 9):
        if freq * h > 9000:
            break
        s += np.sin(2 * np.pi * freq * h * t) / h * np.exp(-t * (3.0 + h * 2.2 / bright))
    return s * env_ad(n, 0.003, 0.04)


def pad_note(freq: float, dur: float, harmonics: int = 9) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for cents in (-9, 0, 9):
        f = freq * 2 ** (cents / 1200)
        for h in range(1, harmonics + 1):
            if f * h > 8000:
                break
            s += np.sin(2 * np.pi * f * h * t + h * cents) / h
    return s / 3 * env_ad(n, 0.35, 0.6)


def lead_note(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t * 3)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    s = np.zeros(n)
    for h in (1, 3, 5, 7):
        s += np.sin(ph * h) / (h * h) * (1 if h == 1 else 1.8)
    return s * env_ad(n, 0.012, 0.12) * np.exp(-t * 0.8)


def reverb_ir(rng, seconds: float, damp: float) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * (6.9 / seconds))[:, None]
    ir = lowpass_fft(ir, damp, 2)
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir


def fft_convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = x.shape[0] + ir.shape[0]
    size = 1 << (n - 1).bit_length()
    out = np.zeros((n, 2))
    for c in range(2):
        out[:, c] = np.fft.irfft(np.fft.rfft(x[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:n]
    return out


STYLES = {
    # kick, snare(clap) Schritte, hats (Schritt, Velocity, offen), Bass (Schritt, Länge in 16teln)
    "trap": dict(kick=[0, 6, 10], snare=[8], clap=[8],
                 hats=[(i, .55 if i % 4 else .8, False) for i in range(0, 16, 2)] + [(14, .5, False), (15, .4, False)],
                 bass=[(0, 5), (6, 3), (10, 5)], swing=0.0, pad_cut=1800),
    "boombap": dict(kick=[0, 5, 10], snare=[4, 12], clap=[],
                    hats=[(i, .5 if i % 4 else .7, False) for i in range(0, 16, 2)],
                    bass=[(0, 4), (5, 4), (10, 4)], swing=0.16, pad_cut=1500),
    "house": dict(kick=[0, 4, 8, 12], snare=[], clap=[4, 12],
                  hats=[(i, .35, False) for i in range(0, 16)] + [(i, .6, True) for i in (2, 6, 10, 14)],
                  bass=[(2, 2), (6, 2), (10, 2), (14, 2)], swing=0.0, pad_cut=2600),
    "drive": dict(kick=[0, 3, 8, 11, 14], snare=[4, 12], clap=[4, 12],
                  hats=[(i, .45 if i % 2 else .6, False) for i in range(0, 16)],
                  bass=[(0, 3), (3, 3), (8, 3), (11, 3), (14, 2)], swing=0.0, pad_cut=3000),
    "lofi": dict(kick=[0, 7, 10], snare=[4, 12], clap=[],
                 hats=[(i, .35, False) for i in range(0, 16, 2)],
                 bass=[(0, 6), (7, 3), (10, 5)], swing=0.2, pad_cut=1100),
    "ambient": dict(kick=[0], snare=[], clap=[],
                    hats=[(i, .2, False) for i in (4, 12)],
                    bass=[(0, 16)], swing=0.0, pad_cut=1400),
}


def compose(spec: tuple, duration_goal: float = 42.0) -> np.ndarray:
    _, _, _, bpm, root, prog, style, _, seed = spec
    rng = np.random.default_rng(seed)
    st = STYLES[style]
    step = 60.0 / bpm / 4
    bar_len = step * 16
    bars = max(16, int(round(duration_goal / bar_len / 2) * 2))
    total = int((bars * bar_len + 4.0) * SR)
    drums = np.zeros((total, 2))
    bass = np.zeros((total, 2))
    harm = np.zeros((total, 2))
    lead = np.zeros((total, 2))

    kk, sn, cl = kick(), snare(rng), clap(rng)
    hh, ho = hat(rng), hat(rng, True)

    def put(buf, at, sig, gain=1.0, pan=0.0):
        s = int(at * SR)
        e = min(total, s + sig.size)
        if e <= s:
            return
        l = math.cos((pan + 1) * math.pi / 4)
        r = math.sin((pan + 1) * math.pi / 4)
        buf[s:e, 0] += sig[: e - s] * gain * l
        buf[s:e, 1] += sig[: e - s] * gain * r

    # Melodie (Moll-Pentatonik), 2-Takt-Motiv wiederholt sich
    penta = [0, 3, 5, 7, 10]
    slots = [0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 26, 28, 30]
    motif = []
    for s_ in slots:
        if rng.random() < 0.62:
            deg = int(rng.choice(len(penta), p=[.3, .15, .2, .2, .15]))
            octv = 12 if rng.random() < 0.7 else 24
            motif.append((s_, penta[deg] + octv, int(rng.choice([2, 3, 4]))))
    arp_order = [0, 1, 2, 1]

    def section(b: int) -> str:
        if b < 2:
            return "intro"
        if b >= bars - 2:
            return "outro"
        return "hook" if ((b - 2) // 4) % 2 == 1 else "verse"

    for b in range(bars):
        sec = section(b)
        t0 = b * bar_len
        c_off, shape = prog[b % len(prog)]
        chord = [root + 24 + c_off + x for x in shape]

        # Pad / Akkorde
        if style == "lofi":
            for i, m in enumerate(chord):
                for rep in (0, 8):
                    put(harm, t0 + (rep + i * 0.5) * step, pluck(midi_hz(m), 1.6, 0.7), 0.20, -0.2 + 0.2 * i)
        else:
            lvl = 0.5 if sec in ("intro", "outro") else 0.38
            for i, m in enumerate(chord):
                put(harm, t0, pad_note(midi_hz(m), bar_len * 1.05), lvl * 0.5, -0.4 + 0.4 * i)

        if sec in ("verse", "hook") or (sec == "outro" and b == bars - 2):
            # Schlagzeug
            for s_ in st["kick"]:
                put(drums, t0 + s_ * step, kk, 0.95)
            for s_ in st["snare"]:
                put(drums, t0 + s_ * step, sn, 0.55)
            for s_ in st["clap"]:
                put(drums, t0 + s_ * step, cl, 0.5 if sec == "hook" else 0.35, 0.1)
            for s_, vel, op in st["hats"]:
                sw = st["swing"] * step if s_ % 2 else 0.0
                put(drums, t0 + s_ * step + sw, ho if op else hh, vel * (0.9 if sec == "verse" else 1.1),
                    0.25 if s_ % 4 < 2 else -0.25)
            # Bass
            for s_, ln in st["bass"]:
                m = root + c_off + (12 if (s_ in (6, 14) and style != "ambient" and rng.random() < 0.25) else 0)
                put(bass, t0 + s_ * step, bass808(midi_hz(m), min(ln * step * 1.05, 1.6)), 0.62)
            # Arpeggio im Vers
            if sec == "verse" and style not in ("lofi", "ambient"):
                for i in range(8):
                    m = chord[arp_order[i % 4] % 3] + 12
                    put(lead, t0 + i * 2 * step, pluck(midi_hz(m), 0.35), 0.16, 0.3 if i % 2 else -0.3)
        elif sec == "intro" and b == 1:
            for s_, vel, op in st["hats"][::2]:
                put(drums, t0 + s_ * step, hh, vel * 0.6, 0.2)

        # Lead-Melodie im Hook
        if sec == "hook" or (style == "ambient" and sec == "verse"):
            base = t0 if (b % 2 == 0) else t0 - bar_len
            for s_, off, ln in motif:
                at = base + s_ * step / 2 * 1.0
                if t0 <= at < t0 + bar_len - 1e-6:
                    put(lead, at, lead_note(midi_hz(root + 24 + prog[0][0] + off), ln * step * 0.9 * 2), 0.17, 0.0)

    # Reverb auf Harmonie/Lead
    ir = reverb_ir(rng, 1.8, 3500)
    wet = fft_convolve(harm * 0.8 + lead * 1.0, ir)[:total] * 0.35
    harm_f = lowpass_fft(harm, st["pad_cut"])
    mix = drums + bass * 1.0 + harm_f + lead * 0.9 + wet
    if style == "lofi":
        mix += highpass(rng.standard_normal((total, 2)), 1) * 0.004
    mix = np.tanh(mix * 0.8) / np.tanh(0.8)
    # Fades
    fi = int(0.05 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    end = int((bars * bar_len + 1.0) * SR)
    mix = mix[:end]
    fo = int(2.4 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    # Ziel-Lautstärke ca. -16 LUFS, danach weicher Limiter unter -1 dBFS
    rms = float(np.sqrt(np.mean(mix ** 2)))
    mix = mix * (0.13 / rms)
    knee = 0.7
    over = np.abs(mix) > knee
    mix[over] = np.sign(mix[over]) * (knee + (0.89 - knee) * np.tanh((np.abs(mix[over]) - knee) / (0.89 - knee)))
    return mix.astype(np.float32)


def encode(samples: np.ndarray, out_high: Path, out_low: Path) -> float:
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "t.wav"
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        base = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-map_metadata", "-1",
                "-id3v2_version", "0", "-write_xing", "1"]
        subprocess.run(base + ["-c:a", "libmp3lame", "-b:a", "128k", str(out_high)], check=True)
        subprocess.run(base + ["-c:a", "libmp3lame", "-ac", "1", "-ar", "22050", "-b:a", "40k", str(out_low)],
                       check=True)
    return samples.shape[0] / SR


# --------------------------------------------------------------------------
# Grafik
# --------------------------------------------------------------------------

def vignette_bg(size: int, glow=(0.5, 0.45), strength=0.55) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size] / size
    d = np.sqrt((x - glow[0]) ** 2 + (y - glow[1]) ** 2)
    k = np.clip(1 - d * 1.6, 0, 1) ** 2 * strength
    base = np.array(BLACK, dtype=float)
    glowc = np.array(DEEP, dtype=float)
    arr = base + (glowc - base) * k[..., None]
    return Image.fromarray(arr.astype("uint8"), "RGB").convert("RGBA")


def grain(img: Image.Image, seed: int, amount: float = 7) -> Image.Image:
    rng = np.random.default_rng(seed)
    arr = np.asarray(img.convert("RGB")).astype(float)
    arr += rng.normal(0, amount, arr.shape[:2])[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"), "RGB")


def art_layer(kind: str, size: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = vignette_bg(size, glow=(0.3 + 0.4 * rng.random(), 0.3 + 0.3 * rng.random()))
    d = ImageDraw.Draw(img, "RGBA")
    s = size
    if kind == "rings":
        cx, cy = s * 0.62, s * 0.4
        for i in range(1, 15):
            r = i * s * 0.055
            a = int(255 * (1 - i / 16))
            col = RED + (a,) if i % 3 else (255, 255, 255, int(a * 0.5))
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=col, width=max(2, s // 220))
        d.ellipse((cx - s * 0.06, cy - s * 0.06, cx + s * 0.06, cy + s * 0.06), fill=RED + (255,))
    elif kind == "bars":
        n = 22
        w = s / n
        for i in range(n):
            h = s * (0.15 + 0.6 * abs(math.sin(i * 0.55 + seed)) * (0.5 + 0.5 * rng.random()))
            x0 = i * w + w * 0.18
            d.rectangle((x0, s * 0.72 - h, x0 + w * 0.64, s * 0.72), fill=RED + (230,))
            d.rectangle((x0, s * 0.72 - h - s * 0.012, x0 + w * 0.64, s * 0.72 - h), fill=(255, 255, 255, 235))
        d.rectangle((0, s * 0.72, s, s * 0.725), fill=(255, 255, 255, 120))
    elif kind == "sun":
        cx, cy, r = s * 0.5, s * 0.5, s * 0.34
        sun = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sun)
        for i in range(int(r * 2)):
            k = i / (r * 2)
            col = (int(255 - 23 * k), int(70 - 53 * k), int(60 - 15 * k), 255)
            sd.line((cx - r, cy - r + i, cx + r, cy - r + i), fill=col)
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        md = ImageDraw.Draw(mask)
        for i in range(9):
            y = cy + r * (0.05 + i * 0.11)
            md.rectangle((0, y, s, y + (i + 1) * s * 0.0045), fill=0)
        img.paste(sun, (0, 0), mask)
        d.rectangle((0, s * 0.68, s, s), fill=BLACK + (255,))
        for i in range(7):
            y = s * 0.7 + i * s * 0.04
            d.line((0, y, s, y), fill=RED + (int(220 - i * 28),), width=max(2, s // 300))
    elif kind == "halftone":
        step_ = s / 28
        cx, cy = s * 0.35, s * 0.65
        for iy in range(30):
            for ix in range(30):
                x, y = ix * step_, iy * step_
                dist = math.hypot(x - cx, y - cy) / s
                r = max(0.0, (0.62 - dist)) * step_ * 1.3
                if r > 0.6:
                    d.ellipse((x - r, y - r, x + r, y + r), fill=RED + (255,))
        d.ellipse((s * 0.55, s * 0.12, s * 0.9, s * 0.47), outline=(255, 255, 255, 200), width=max(3, s // 150))
    elif kind == "slash":
        d.polygon([(s * 0.38, 0), (s * 0.72, 0), (s * 0.26, s), (-s * 0.08, s)], fill=RED + (255,))
        d.polygon([(s * 0.76, 0), (s * 0.80, 0), (s * 0.34, s), (s * 0.30, s)], fill=(255, 255, 255, 230))
        d.polygon([(s * 0.84, 0), (s * 0.95, 0), (s * 0.49, s), (s * 0.38, s)], fill=DEEP + (255,))
    return img


def draw_text_block(img: Image.Image, title: str, size: int, small_tag: str = "JUL"):
    d = ImageDraw.Draw(img, "RGBA")
    f_big = ImageFont.truetype(FONT_BOLD, int(size * 0.085))
    f_sm = ImageFont.truetype(FONT_MED, int(size * 0.036))
    pad = int(size * 0.06)
    # Verlauf unten
    grad = Image.new("RGBA", (size, size // 2), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(size // 2):
        gd.line((0, y, size, y), fill=(0, 0, 0, int(220 * (y / (size // 2)) ** 1.6)))
    img.alpha_composite(grad, (0, size // 2))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((pad, pad), small_tag, font=f_sm, fill=(255, 255, 255, 235))
    # DEMO-Stempel
    label = "DEMO"
    w = d.textlength(label, font=f_sm) + pad * 0.5
    d.rounded_rectangle((size - pad - w, pad - 6, size - pad, pad + int(size * 0.036) + 12), radius=8,
                        outline=RED + (255,), width=3)
    d.text((size - pad - w + pad * 0.25, pad), label, font=f_sm, fill=RED + (255,))
    # Titel (mehrzeilig bei Bedarf)
    words = title.upper().split()
    lines, cur = [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if d.textlength(t, font=f_big) > size - 2 * pad and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = t
    lines.append(cur)
    lh = int(size * 0.095)
    y = size - pad - lh * len(lines)
    for ln in lines:
        d.text((pad, y), ln, font=f_big, fill=(255, 255, 255, 255))
        y += lh


def make_cover(kind: str, title: str, seed: int, name: str):
    big = 1200
    img = art_layer(kind, big, seed)
    draw_text_block(img, title, big)
    img = grain(img, seed)
    img.resize((640, 640), Image.LANCZOS).save(IMG / f"{name}.jpg", quality=84, optimize=True)
    img.resize((176, 176), Image.LANCZOS).save(IMG / f"{name}-sm.jpg", quality=80, optimize=True)


def make_artist_image():
    s = 1200
    img = vignette_bg(s, glow=(0.5, 0.3), strength=0.9)
    d = ImageDraw.Draw(img, "RGBA")
    # Halbton-Burst
    step_ = s / 40
    for iy in range(42):
        for ix in range(42):
            x, y = ix * step_, iy * step_
            dist = math.hypot(x - s * 0.5, y - s * 0.38) / s
            r = max(0.0, 0.55 - dist) * step_ * 1.15
            if r > 0.7:
                d.ellipse((x - r, y - r, x + r, y + r), fill=RED + (235,))
    # Abstrakte Kreise statt Porträt – bewusst kein echtes Foto
    cx, cy = s * 0.5, s * 0.4
    for r, a in ((s * 0.30, 255), (s * 0.21, 200), (s * 0.12, 255)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, a), width=max(3, s // 200))
    d.ellipse((cx - s * 0.06, cy - s * 0.06, cx + s * 0.06, cy + s * 0.06), fill=RED + (255,))
    f2 = ImageFont.truetype(FONT_MED, int(s * 0.03))
    msg = "KÜNSTLERBILD · PLATZHALTER"
    d.text(((s - d.textlength(msg, font=f2)) / 2, s * 0.9), msg, font=f2, fill=(255, 255, 255, 150))
    img = grain(img, 5)
    img.resize((900, 900), Image.LANCZOS).save(IMG / "artist-jul.jpg", quality=84, optimize=True)
    img.resize((176, 176), Image.LANCZOS).save(IMG / "artist-jul-sm.jpg", quality=80, optimize=True)


def logo(size: int, bleed: bool = False) -> Image.Image:
    """ROUGE-Logo: roter Grund, weißer Ring, weißes Play-Dreieck."""
    k = 4
    s = size * k
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bleed:
        d.rectangle((0, 0, s, s), fill=RED + (255,))
        scale = 0.74
    else:
        d.rounded_rectangle((0, 0, s, s), radius=int(s * 0.23), fill=RED + (255,))
        scale = 1.0
    c = s / 2
    r = s * 0.29 * scale
    d.ellipse((c - r, c - r, c + r, c + r), outline=(255, 255, 255, 255), width=int(s * 0.055 * scale))
    tri = s * 0.14 * scale
    d.polygon([(c - tri * 0.55, c - tri), (c - tri * 0.55, c + tri), (c + tri * 1.15, c)],
              fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def make_icons():
    for n in (192, 512):
        logo(n).save(IMG / f"icon-{n}.png", optimize=True)
    logo(512, bleed=True).save(IMG / "icon-maskable-512.png", optimize=True)
    bg = Image.new("RGB", (180, 180), RED)
    bg.paste(logo(180, bleed=True), (0, 0))
    bg.save(IMG / "apple-touch-icon.png", optimize=True)


# --------------------------------------------------------------------------

def main():
    if "--images-only" in sys.argv:
        make_artist_image()
        make_icons()
        for a in ALBUMS:
            make_cover(a["cover"], a["title"], a["seed"], a["id"])
        return
    AUDIO.joinpath("high").mkdir(parents=True, exist_ok=True)
    AUDIO.joinpath("low").mkdir(parents=True, exist_ok=True)
    IMG.mkdir(parents=True, exist_ok=True)

    make_artist_image()
    make_icons()
    for a in ALBUMS:
        make_cover(a["cover"], a["title"], a["seed"], a["id"])

    tracks_json = []
    album_tracks: dict[str, list[str]] = {a["id"]: [] for a in ALBUMS}
    for i, spec in enumerate(TRACKS):
        tid, title, album, bpm, *_ , pop, seed = spec
        print(f"[{i + 1}/{len(TRACKS)}] {title} ({bpm} bpm)")
        samples = compose(spec)
        dur = encode(samples, AUDIO / "high" / f"{tid}.mp3", AUDIO / "low" / f"{tid}.mp3")
        album_tracks[album].append(tid)
        alb = next(a for a in ALBUMS if a["id"] == album)
        tracks_json.append(dict(
            id=tid, title=title, artistIds=["jul"], albumId=album,
            trackNumber=len(album_tracks[album]), duration=round(dur, 2),
            sources=dict(low=f"assets/audio/low/{tid}.mp3", high=f"assets/audio/high/{tid}.mp3"),
            addedAt=alb["added"], popularity=pop, demo=True))

    albums_json = [dict(
        id=a["id"], title=a["title"], type=a["type"], artistIds=["jul"], year=a["year"],
        cover=dict(small=f"assets/img/{a['id']}-sm.jpg", large=f"assets/img/{a['id']}.jpg"),
        trackIds=album_tracks[a["id"]], addedAt=a["added"], demo=True) for a in ALBUMS]

    catalog = dict(
        version=1,
        artists=[dict(
            id="jul", name="JUL", tagline="Französischer Künstler",
            description=("Dieses Profil ist ein Platzhalter. In der aktuellen Version enthält die App "
                         "ausschließlich eigene, lizenzfreie Demo-Tracks (CC0) und generierte Cover – "
                         "keine geschützten Songs, Bilder oder Texte. Echte, lizenzierte Musik wird später "
                         "über den Katalog-Anbieter eingebunden."),
            genres=["Rap", "Demo"],
            image=dict(small="assets/img/artist-jul-sm.jpg", large="assets/img/artist-jul.jpg"),
            demo=True)],
        albums=albums_json,
        tracks=tracks_json,
        playlists=[dict(id=p["id"], title=p["title"], description=p["description"], ownerName="ROUGE",
                        artistIds=["jul"], trackIds=p["tracks"], demo=True) for p in PLAYLISTS],
    )
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), "utf-8")
    print("Fertig.")


if __name__ == "__main__":
    main()
