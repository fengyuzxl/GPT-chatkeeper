#!/usr/bin/env python3
"""List translation keys used in source and missing from the EN dictionary.

Usage: python tools/check-i18n.py [report-path]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "i18n-report.txt")


def json_dump(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'

JS_FILES = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in ("tools", "icons", "_locales", ".git", "node_modules")]
    for name in files:
        if name.endswith(".js") or name.endswith(".html"):
            JS_FILES.append(os.path.join(base, name))

keys = set()
call_pattern = re.compile(r"(?<![A-Za-z0-9_$])(?:t|tr)\(\s*(['\"])((?:\\.|(?!\1).)*?)\1", re.S)
attr_pattern = re.compile(r'data-i18n(?:-title|-placeholder|-aria)?="([^"]+)"')

for path in JS_FILES:
    text = open(path, encoding="utf-8").read()
    for match in call_pattern.finditer(text):
        source = match.group(2)
        if "${" in source or "\\" in source:
            continue
        keys.add(source)
    for match in attr_pattern.finditer(text):
        keys.add(match.group(1))

i18n_text = open(os.path.join(ROOT, "src", "shared", "i18n.js"), encoding="utf-8").read()
en_block = i18n_text.split("const EN = {", 1)[1].split("\n  };", 1)[0]
en_keys = set()
en_values = {}
conflicts = []
for match in re.finditer(r"^\s*'((?:\\.|[^'\\])*)'\s*:\s*'((?:\\.|[^'\\])*)'", en_block, re.M):
    key = match.group(1).replace("\\'", "'")
    value = match.group(2)
    en_keys.add(key)
    if key in en_values and en_values[key] != value:
        conflicts.append((key, en_values[key], value))
    en_values[key] = value

missing = sorted(keys - en_keys)
extra = sorted(en_keys - keys)

with open(REPORT, "w", encoding="utf-8") as out:
    out.write("SOURCE KEYS: %d\nEN KEYS: %d\nMISSING: %d\n\n" % (len(keys), len(en_keys), len(missing)))
    out.write("=== MISSING ===\n")
    for key in missing:
        out.write(json_dump(key) + "\n")
    out.write("\n=== EN KEYS NOT USED IN SOURCE ===\n")
    for key in extra:
        out.write(json_dump(key) + "\n")
    out.write("\n=== CONFLICTING DUPLICATE TRANSLATIONS: %d ===\n" % len(conflicts))
    for key, first, second in conflicts:
        out.write("%s => %r | %r\n" % (json_dump(key), first, second))


print("report:", REPORT)
print("source keys:", len(keys), "en keys:", len(en_keys), "missing:", len(missing))
