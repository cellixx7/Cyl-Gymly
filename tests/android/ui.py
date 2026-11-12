#!/usr/bin/env python3
"""Ajuda para o emulador: lista textos da tela ou toca num elemento pelo texto.
Uso: ui.py texts | ui.py tap "<texto>" | ui.py has "<texto>"
Fecha automaticamente o aviso "System UI isn't responding" (emulador lento, sem aceleração)."""
import re, subprocess, sys, time
ADB = '/home/user/android-sdk/platform-tools/adb'

def sh(*a):
    return subprocess.run([ADB, 'shell', *a], capture_output=True, text=True, timeout=120).stdout

def dump():
    for _ in range(3):
        sh('uiautomator', 'dump', '/sdcard/ui.xml')
        x = sh('cat', '/sdcard/ui.xml')
        if "isn't responding" in x:
            m = re.search(r'text="Wait"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x)
            if m:
                a, b, c, d = map(int, m.groups()); sh('input', 'tap', str((a + c) // 2), str((b + d) // 2)); time.sleep(2); continue
        return x
    return x

def nodes(x):
    for m in re.finditer(r'<node [^>]*?(?:text|content-desc)="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
        yield m.group(1), tuple(map(int, m.groups()[1:]))
    for m in re.finditer(r'<node [^>]*?content-desc="([^"]+)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', x):
        yield m.group(1), tuple(map(int, m.groups()[1:]))

if __name__ == '__main__':
    cmd = sys.argv[1]
    x = dump()
    if cmd == 'texts':
        seen = []
        for t, _ in nodes(x):
            if t and t not in seen: seen.append(t)
        print('\n'.join(seen))
    elif cmd in ('tap', 'has'):
        want = sys.argv[2]
        for t, (a, b, c, d) in nodes(x):
            if t == want or (want.endswith('*') and t.startswith(want[:-1])):
                if cmd == 'tap': sh('input', 'tap', str((a + c) // 2), str((b + d) // 2))
                print('ok'); sys.exit(0)
        print('não encontrado: ' + want); sys.exit(1)
