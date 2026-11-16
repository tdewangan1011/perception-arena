"""Simulate exposure by scaling linear-light RGB and clipping highlights."""


def exposure_lut(stops):
    multiplier = 2.0 ** stops
    table = []
    for value in range(256):
        srgb = value / 255
        linear = srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4
        scaled = min(1.0, linear * multiplier)
        encoded = 12.92 * scaled if scaled <= 0.0031308 else 1.055 * scaled ** (1 / 2.4) - 0.055
        table.append(round(encoded * 255))
    return table
