#!/usr/bin/env python3
"""Generates the Credentis milestone Lottie animations (brand colours, flat, short).

Run: python3 credo-ui/shared/lottie/generate.py
Replace any file with a LottieFiles/Creator export of the same name to restyle it.
"""
import json
import math
import os

OUT = os.path.dirname(os.path.abspath(__file__))
FR = 60
W = H = 200


def hexc(h, a=1):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [a]


BLUE, GREEN, WHITE = hexc('#2188ca'), hexc('#1fb87e'), hexc('#ffffff')
LIGHT_BLUE, GOLD = hexc('#d0e6f3'), hexc('#f5b83d')
EASE_OUT = {'i': {'x': [0.2], 'y': [1]}, 'o': {'x': [0.3], 'y': [0]}}


def static(v):
    return {'a': 0, 'k': v}


def anim(*keys):
    """keys: (frame, value) pairs; eased out between each."""
    k = []
    for n, (t, v) in enumerate(keys):
        v = v if isinstance(v, list) else [v]
        frame = {'t': t, 's': v}
        if n < len(keys) - 1:
            frame.update(EASE_OUT)
        k.append(frame)
    return {'a': 1, 'k': k}


def tr(p=(0, 0), s=None, o=None, r=None):
    return {'ty': 'tr', 'p': static(list(p)), 'a': static([0, 0]),
            's': s or static([100, 100]), 'r': r or static(0),
            'o': o or static(100), 'sk': static(0), 'sa': static(0)}


def group(items, **t):
    return {'ty': 'gr', 'nm': 'g', 'it': items + [tr(**t)]}


def ellipse(d):
    return {'ty': 'el', 'd': 1, 's': static([d, d]), 'p': static([0, 0])}


def rect(w, h, r):
    return {'ty': 'rc', 'd': 1, 's': static([w, h]), 'p': static([0, 0]), 'r': static(r)}


def path(points, closed=False):
    z = [[0, 0]] * len(points)
    return {'ty': 'sh', 'd': 1, 'ks': static({'i': z, 'o': z, 'v': points, 'c': closed})}


def fill(c):
    return {'ty': 'fl', 'c': static(c), 'o': static(100), 'r': 1}


def stroke(c, w):
    return {'ty': 'st', 'c': static(c), 'o': static(100), 'w': static(w), 'lc': 2, 'lj': 2}


def trim(t0, t1):
    return {'ty': 'tm', 's': static(0), 'e': anim((t0, 0), (t1, 100)), 'o': static(0), 'm': 1}


def layer(ind, name, shapes, op, p=(100, 100), s=None, o=None):
    ks = {'o': o or static(100), 'r': static(0), 'p': static([p[0], p[1], 0]),
          'a': static([0, 0, 0]), 's': s or static([100, 100, 100])}
    return {'ddd': 0, 'ind': ind, 'ty': 4, 'nm': name, 'sr': 1, 'ks': ks, 'ao': 0,
            'shapes': shapes, 'ip': 0, 'op': op, 'st': 0, 'bm': 0}


def pop(t0, t1):
    return anim((t0, [0, 0, 100]), (t1, [112, 112, 100]), (t1 + 8, [100, 100, 100]))


def check_layers(op, t0=0, color=GREEN, size=120, start_ind=1):
    """Filled circle pop, white tick drawn on, soft ring pulse."""
    k = size / 120
    tick = [[-26 * k, 2 * k], [-8 * k, 20 * k], [28 * k, -18 * k]]
    return [
        layer(start_ind, 'tick', [group([path(tick), trim(t0 + 16, t0 + 38), stroke(WHITE, 12 * k)])], op),
        layer(start_ind + 1, 'disc', [group([ellipse(size), fill(color)])], op, s=pop(t0, t0 + 18)),
        layer(start_ind + 2, 'ring', [group([ellipse(size), stroke(color, 4)])], op,
              s=anim((t0 + 10, [100, 100, 100]), (t0 + 50, [150, 150, 100])),
              o=anim((t0 + 10, 60), (t0 + 50, 0))),
    ]


def doc(name, op, layers):
    return {'v': '5.7.4', 'fr': FR, 'ip': 0, 'op': op, 'w': W, 'h': H, 'nm': name,
            'ddd': 0, 'assets': [], 'layers': layers}


def success():
    return doc('success', 90, check_layers(90))


def payment():
    op = 100
    card = [
        group([rect(124, 80, 12), fill(BLUE)]),
        group([rect(124, 14, 0), fill(hexc('#155782'))], p=(0, -16)),
        group([rect(34, 8, 4), fill(LIGHT_BLUE)], p=(-36, 18)),
    ]
    card_layer = layer(10, 'card', card, op, p=(92, 96),
                       o=anim((0, 0), (16, 100)),
                       s=anim((0, [90, 90, 100]), (16, [100, 100, 100])))
    badge = [dict(l) for l in check_layers(op, t0=22, size=64, start_ind=1)]
    for l in badge:
        l['ks']['p'] = static([142, 128, 0])
    return doc('payment', op, badge + [card_layer])


def celebration():
    op = 110
    layers = check_layers(op)
    colours = [BLUE, GOLD, GREEN, hexc('#88c4e3')]
    for n in range(12):
        ang = n * math.pi * 2 / 12 + 0.2
        dist = 78 + (n % 3) * 8
        end = [100 + math.cos(ang) * dist, 100 + math.sin(ang) * dist, 0]
        shape = ellipse(10) if n % 2 else rect(10, 6, 2)
        confetti = layer(20 + n, 'confetti', [group([shape, fill(colours[n % 4])], r=static(n * 30))], op,
                         o=anim((14, 0), (18, 100), (60, 100), (80, 0)))
        confetti['ks']['p'] = anim((14, [100, 100, 0]), (52, end))
        layers.append(confetti)
    return doc('celebration', op, layers)


def welcome():
    op = 90
    person = [
        group([ellipse(30), fill(WHITE)], p=(0, -18)),
        group([path([[-30, 34], [-30, 24], [-20, 8], [20, 8], [30, 24], [30, 34]], closed=True), fill(WHITE)]),
    ]
    return doc('welcome', op, [
        layer(1, 'person', person, op, o=anim((14, 0), (28, 100)), s=anim((14, [70, 70, 100]), (30, [100, 100, 100]))),
        layer(2, 'disc', [group([ellipse(120), fill(BLUE)])], op, s=pop(0, 18)),
        layer(3, 'ring', [group([ellipse(120), stroke(BLUE, 4)])], op,
              s=anim((10, [100, 100, 100]), (50, [150, 150, 100])), o=anim((10, 60), (50, 0))),
    ])


def completion():
    op = 110
    progress = layer(10, 'progress', [group([ellipse(124), trim(0, 40), stroke(BLUE, 8)])], op,
                     o=anim((40, 100), (52, 0)))
    progress['ks']['r'] = static(-90)
    track = layer(11, 'track', [group([ellipse(124), stroke(LIGHT_BLUE, 8)])], op, o=anim((40, 100), (52, 0)))
    return doc('completion', op, check_layers(op, t0=38) + [progress, track])


def empty():
    op = 180
    bob = anim((0, [100, 104, 0]), (90, [100, 92, 0]), (180, [100, 104, 0]))
    badge = layer(1, 'badge', [group([ellipse(44), fill(GREEN)]),
                               group([path([[-10, 0], [-3, 7], [11, -7]]), stroke(WHITE, 5)])], op)
    badge['ks']['p'] = anim((0, [100, 70, 0]), (90, [100, 60, 0]), (180, [100, 70, 0]))
    tray = [
        group([path([[-56, 0], [-40, 0], [-30, 16], [30, 16], [40, 0], [56, 0], [56, 36], [-56, 36]], closed=True),
               fill(LIGHT_BLUE)]),
        group([path([[-56, 0], [-40, 0], [-30, 16], [30, 16], [40, 0], [56, 0], [56, 36], [-56, 36]], closed=True),
               stroke(BLUE, 4)]),
    ]
    tray_layer = layer(2, 'tray', tray, op, p=(100, 112))
    tray_layer['ks']['p'] = bob
    shadow = layer(3, 'shadow', [group([ellipse(90), fill(hexc('#2188ca', 0.12))])], op, p=(100, 162),
                   s=anim((0, [100, 14, 100]), (90, [88, 12, 100]), (180, [100, 14, 100])))
    return doc('empty', op, [badge, tray_layer, shadow])


if __name__ == '__main__':
    for fn in (success, payment, celebration, welcome, completion, empty):
        data = fn()
        with open(os.path.join(OUT, f'{fn.__name__}.json'), 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        print(fn.__name__, os.path.getsize(os.path.join(OUT, f'{fn.__name__}.json')), 'bytes')
