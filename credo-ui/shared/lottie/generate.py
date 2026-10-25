#!/usr/bin/env python3
"""Generates original, vector-only Credentis milestone and onboarding animations.

Run: python3 credo-ui/shared/lottie/generate.py
Replace any file with a LottieFiles/Creator export of the same name to restyle it.
"""
import json
import math
import os

OUT = os.path.dirname(os.path.abspath(__file__))
FR = 60
W = H = 200
EXPORT_SIZE = 1080


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
    return anim((t0, [0, 0, 100]), (t1, [104, 104, 100]), (t1 + 8, [100, 100, 100]))


def check_layers(op, t0=0, color=GREEN, size=120, start_ind=1):
    """Filled circle pop, white tick drawn on, soft ring pulse."""
    k = size / 120
    tick = [[-26 * k, 2 * k], [-8 * k, 20 * k], [28 * k, -18 * k]]
    return [
        layer(start_ind, 'tick', [group([path(tick), trim(t0 + 16, t0 + 38), stroke(WHITE, 12 * k)])], op),
        layer(start_ind + 1, 'disc', [group([ellipse(size), fill(color)])], op, s=pop(t0, t0 + 18)),
        layer(start_ind + 2, 'ring', [group([ellipse(size), stroke(color, 4)])], op,
              s=anim((t0 + 10, [100, 100, 100]), (t0 + 50, [128, 128, 100])),
              o=anim((t0 + 10, 30), (t0 + 50, 0))),
    ]


def doc(name, op, layers):
    # Lottie shape groups are front-to-back; details must precede their opaque backing.
    for item in layers:
        item['shapes'].reverse()
    layers += [
        layer(900, 'ambient-blue', [group([ellipse(144), fill(hexc('#EDF6FC'))])], op, p=(100, 96)),
        layer(901, 'ground-shadow', [group([ellipse(92), fill(hexc('#DCEAF3'))])], op,
              p=(100, 178), s=static([100, 10, 100])),
    ]
    scale = EXPORT_SIZE / W
    for item in layers:
        for property_name in ('p', 's'):
            prop = item['ks'][property_name]
            values = [key['s'] for key in prop['k']] if prop['a'] else [prop['k']]
            for value in values:
                value[0] *= scale
                value[1] *= scale
    return {'v': '5.7.4', 'fr': FR, 'ip': 0, 'op': op, 'w': EXPORT_SIZE, 'h': EXPORT_SIZE, 'nm': name,
            'ddd': 0, 'assets': [], 'layers': layers}


def success():
    op = 100
    card = [
        group([rect(112, 136, 16), fill(WHITE), stroke(LIGHT_BLUE, 2)]),
        group([rect(58, 5, 2), fill(BLUE)], p=(0, -46)),
        group([rect(42, 4, 2), fill(LIGHT_BLUE)], p=(0, -34)),
        group([rect(50, 4, 2), fill(LIGHT_BLUE)], p=(0, 48)),
    ]
    return doc('success', op, check_layers(op, t0=12, size=62) + [
        layer(10, 'signed-record', card, op, o=anim((0, 0), (16, 100)),
              s=anim((0, [92, 92, 100]), (20, [100, 100, 100]))),
    ])


def payment():
    op = 100
    card = [
        group([rect(124, 80, 12), fill(BLUE), stroke(hexc('#155782'), 2)]),
        group([rect(124, 14, 0), fill(hexc('#155782'))], p=(0, -16)),
        group([rect(34, 8, 4), fill(LIGHT_BLUE)], p=(-36, 18)),
        group([rect(18, 14, 4), fill(GOLD)], p=(32, 16)),
        group([path([[-6, 0], [6, 0]]), stroke(hexc('#B07B20'), 1.5)], p=(32, 16)),
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
        dist = 72 + (n % 3) * 5
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


def onboarding_receive():
    op = 120
    wallet = [
        group([rect(114, 146, 20), fill(hexc('#123E66'))]),
        group([rect(102, 132, 14), fill(WHITE)]),
        group([rect(32, 4, 2), fill(LIGHT_BLUE)], p=(0, -54)),
        group([rect(70, 48, 10), fill(hexc('#EAF4FA')), stroke(LIGHT_BLUE, 1.6)], p=(0, 10)),
        group([rect(54, 5, 2), fill(LIGHT_BLUE)], p=(0, -6)),
        group([rect(40, 5, 2), fill(LIGHT_BLUE)], p=(0, 6)),
    ]
    receipt = [
        group([rect(92, 58, 10), fill(BLUE), stroke(hexc('#155782'), 2)]),
        group([ellipse(14), fill(WHITE)], p=(-26, -8)),
        group([rect(24, 6, 3), fill(LIGHT_BLUE)], p=(14, -9)),
        group([rect(34, 4, 2), fill(LIGHT_BLUE)], p=(8, 3)),
        group([rect(26, 4, 2), fill(LIGHT_BLUE)], p=(-18, 16)),
    ]
    sender = [
        group([ellipse(26), fill(WHITE), stroke(LIGHT_BLUE, 1.5)]),
        group([ellipse(9), fill(hexc('#7AB9DE'))], p=(0, -4)),
        group([path([[-12, 10], [-8, 3], [8, 3], [12, 10]], True), fill(hexc('#7AB9DE'))]),
    ]
    arriving = layer(10, 'receipt-arrives', receipt, op,
                     o=anim((0, 0), (10, 100)),
                     s=anim((0, [112, 112, 100]), (26, [100, 100, 100]), (54, [84, 84, 100])))
    arriving['ks']['p'] = anim((0, [60, 42, 0]), (26, [92, 72, 0]), (54, [100, 98, 0]))
    avatar = layer(11, 'sender-avatar', sender, op, p=(52, 58),
                   o=anim((0, 0), (16, 100), (60, 100), (84, 0)),
                   s=anim((0, [84, 84, 100]), (18, [100, 100, 100])))
    pulse = layer(12, 'arrival-pulse', [group([ellipse(124), stroke(hexc('#88C4E3'), 2)])], op, p=(100, 98),
                  o=anim((26, 0), (34, 40), (74, 0)),
                  s=anim((26, [56, 56, 100]), (74, [124, 124, 100])))
    badge = check_layers(op, t0=56, size=42, start_ind=1)
    for item in badge:
        item['ks']['p'] = static([146, 130, 0])
    return doc('onboarding_receive', op, badge + [pulse, avatar, arriving, layer(20, 'wallet', wallet, op)])


def onboarding_share():
    op = 120
    request = [
        group([rect(118, 132, 14), fill(WHITE), stroke(LIGHT_BLUE, 2)]),
        group([rect(62, 6, 3), fill(BLUE)], p=(0, -46)),
        group([rect(44, 4, 2), fill(LIGHT_BLUE)], p=(0, -32)),
        group([rect(60, 5, 2), fill(LIGHT_BLUE)], p=(4, -8)),
        group([ellipse(7), fill(GREEN)], p=(-34, -8)),
        group([rect(60, 5, 2), fill(LIGHT_BLUE)], p=(4, 9)),
        group([ellipse(7), fill(GREEN)], p=(-34, 9)),
    ]
    approver = [
        group([ellipse(32), fill(hexc('#EAF4FA')), stroke(LIGHT_BLUE, 2)]),
        group([ellipse(10), fill(hexc('#5AA6D3'))], p=(0, -7)),
        group([path([[-15, 12], [-10, 2], [10, 2], [15, 12]], True), fill(hexc('#5AA6D3'))]),
    ]
    pill = [
        group([rect(84, 22, 11), fill(BLUE)]),
        group([path([[-10, 0], [10, 0], [4, -5], [10, 0], [4, 5]]), stroke(WHITE, 2)]),
    ]
    shield = [
        group([path([[0, -24], [22, -16], [20, 10], [0, 26], [-20, 10], [-22, -16]], True),
               fill(GREEN), stroke(hexc('#147D57'), 2)]),
        group([path([[-9, 0], [-2, 7], [10, -7]]), trim(56, 84), stroke(WHITE, 4)]),
    ]
    bridge = layer(3, 'review-path', [group([path([[-20, 0], [20, 0]]), trim(8, 44), stroke(BLUE, 3)])], op, p=(118, 88))
    request_layer = layer(10, 'review-request', request, op, p=(84, 98),
                          o=anim((0, 0), (18, 100)), s=anim((0, [92, 92, 100]), (22, [100, 100, 100])))
    approver_layer = layer(11, 'approver', approver, op, p=(150, 88),
                           o=anim((10, 0), (28, 100)), s=anim((10, [84, 84, 100]), (30, [100, 100, 100])))
    action = layer(12, 'approve-action', pill, op, p=(118, 136),
                   o=anim((28, 0), (38, 100), (94, 100), (110, 0)),
                   s=anim((28, [86, 86, 100]), (40, [100, 100, 100])))
    return doc('onboarding_share', op, [
        layer(1, 'consent-shield', shield, op, p=(154, 132), s=pop(44, 60)),
        bridge,
        action,
        approver_layer,
        request_layer,
    ])


if __name__ == '__main__':
    for fn in (success, payment, celebration, welcome, completion, empty, onboarding_receive, onboarding_share):
        data = fn()
        with open(os.path.join(OUT, f'{fn.__name__}.json'), 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        print(fn.__name__, os.path.getsize(os.path.join(OUT, f'{fn.__name__}.json')), 'bytes')
