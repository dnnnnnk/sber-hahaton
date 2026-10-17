# Собственная Lottie-анимация «вспышка»: звезда + кольцо + разлетающиеся точки. 60 fps, 0.9 с, 200×200.
import json, math, sys

OP = 54

def static(v):
    return {"a": 0, "k": v}

def anim(frames, dims):
    """frames: [(t, value), ...] — value: число или список."""
    ease_i = {"x": [0.25] * dims, "y": [1] * dims}
    ease_o = {"x": [0.45] * dims, "y": [0] * dims}
    keys = []
    for idx, (t, v) in enumerate(frames):
        k = {"t": t, "s": v if isinstance(v, list) else [v]}
        if idx < len(frames) - 1:
            k["i"] = ease_i
            k["o"] = ease_o
        keys.append(k)
    return {"a": 1, "k": keys}

def tr():
    return {"ty": "tr", "p": static([0, 0]), "a": static([0, 0]), "s": static([100, 100]), "r": static(0),
            "o": static(100), "sk": static(0), "sa": static(0), "nm": "Transform"}

def fill(rgb):
    return {"ty": "fl", "c": static(rgb + [1]), "o": static(100), "r": 1, "bm": 0, "nm": "Fill"}

def stroke(rgb, w):
    return {"ty": "st", "c": static(rgb + [1]), "o": static(100), "w": static(w), "lc": 2, "lj": 2, "bm": 0, "nm": "Stroke"}

def layer(ind, name, shapes, ks):
    base = {"o": static(100), "r": static(0), "p": static([100, 100, 0]), "a": static([0, 0, 0]), "s": static([100, 100, 100])}
    base.update(ks)
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": name, "sr": 1, "ks": base, "ao": 0,
            "shapes": [{"ty": "gr", "nm": name, "it": shapes + [tr()]}], "ip": 0, "op": OP, "st": 0, "bm": 0}

GOLD = [1, 0.79, 0.24]
LIGHT = [1, 0.91, 0.55]
COLORS = [GOLD, [0.13, 0.63, 0.22], [0.24, 0.55, 1], GOLD, [1, 0.48, 0.35], [0.61, 0.42, 1]]

layers = []
star = {"ty": "sr", "sy": 1, "d": 1, "pt": static(4), "p": static([0, 0]), "r": static(0),
        "ir": static(12), "is": static(0), "or": static(54), "os": static(0), "nm": "Star"}
layers.append(layer(1, "star", [star, fill(GOLD)], {
    "s": anim([(0, [0, 0, 100]), (12, [125, 125, 100]), (20, [100, 100, 100]), (40, [100, 100, 100]), (OP, [0, 0, 100])], 3),
    "r": anim([(0, -45), (OP, 45)], 1),
}))
ring = {"ty": "el", "d": 1, "s": static([60, 60]), "p": static([0, 0]), "nm": "Ring"}
layers.append(layer(2, "ring", [ring, stroke(LIGHT, 6)], {
    "s": anim([(0, [40, 40, 100]), (30, [270, 270, 100])], 3),
    "o": anim([(0, 100), (30, 0)], 1),
}))
for i, color in enumerate(COLORS):
    a = math.radians(i * 60 + 30)
    dot = {"ty": "el", "d": 1, "s": static([14, 14]), "p": static([0, 0]), "nm": "Dot"}
    end = [100 + math.cos(a) * 82, 100 + math.sin(a) * 82, 0]
    layers.append(layer(3 + i, f"dot{i}", [dot, fill(color)], {
        "p": {"a": 1, "k": [
            {"t": 4, "s": [100, 100, 0], "i": {"x": 0.2, "y": 1}, "o": {"x": 0.4, "y": 0}, "to": [0, 0, 0], "ti": [0, 0, 0]},
            {"t": 36, "s": end},
        ]},
        "s": anim([(4, [0, 0, 100]), (12, [100, 100, 100]), (44, [0, 0, 100])], 3),
    }))

doc = {"v": "5.7.4", "fr": 60, "ip": 0, "op": OP, "w": 200, "h": 200, "nm": "sparkle", "ddd": 0, "assets": [], "layers": layers}
json.dump(doc, open(sys.argv[1], "w"), separators=(",", ":"))
print("ok")
