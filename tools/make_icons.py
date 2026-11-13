#!/usr/bin/env python3
"""Generate ChatKeeper extension icons without third-party deps.

Design: emerald rounded square + white speech bubble with three dots.
Rendered with 4x supersampling for smooth edges, then box-downsampled.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
SS = 4  # supersampling factor


def inside_rounded_rect(px, py, x0, y0, x1, y1, r):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    dx = px - cx
    dy = py - cy
    return dx * dx + dy * dy <= r * r


def inside_circle(px, py, cx, cy, r):
    dx = px - cx
    dy = py - cy
    return dx * dx + dy * dy <= r * r


def inside_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade_at(u, v):
    # 背景渐变
    t = (u + v) / 2.0
    bg = lerp((23, 184, 144), (9, 104, 84), min(max(t, 0.0), 1.0))

    # 三个点（必须在气泡底色之前判断）
    for cx in (0.355, 0.50, 0.645):
        if inside_circle(u, v, cx, 0.45, 0.045):
            return (9, 104, 84, 255)
    # 对话气泡主体
    if inside_rounded_rect(u, v, 0.20, 0.235, 0.80, 0.665, 0.12):
        return (255, 255, 255, 255)
    # 气泡尾巴
    if inside_triangle(u, v, (0.285, 0.60), (0.30, 0.80), (0.465, 0.635)):
        return (255, 255, 255, 255)
    # 背景（圆角之外透明）
    if inside_rounded_rect(u, v, 0.02, 0.02, 0.98, 0.98, 0.235):
        return (*bg, 255)
    return (0, 0, 0, 0)


def render(size):
    big = size * SS
    # 先在超采样网格上求颜色，再按 SSxSS 块平均
    accum = [[[0, 0, 0, 0] for _ in range(size)] for _ in range(size)]
    step = 1.0 / big
    for by in range(big):
        v = (by + 0.5) * step
        for bx in range(big):
            u = (bx + 0.5) * step
            r, g, b, a = shade_at(u, v)
            cell = accum[by // SS][bx // SS]
            cell[0] += r * a
            cell[1] += g * a
            cell[2] += b * a
            cell[3] += a
    n = SS * SS
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter type: none
        for x in range(size):
            pr, pg, pb, pa = accum[y][x]
            if pa == 0:
                row.extend((0, 0, 0, 0))
            else:
                # 用 alpha 加权得到未预乘颜色
                row.extend((
                    min(255, round(pr / pa)),
                    min(255, round(pg / pa)),
                    min(255, round(pb / pa)),
                    min(255, round(pa / n)),
                ))
        rows.append(bytes(row))
    return bytes().join(rows)


def write_png(path, size):
    raw = render(size)
    width = height = size

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        write_png(path, size)
        print("wrote", path)


if __name__ == "__main__":
    main()
