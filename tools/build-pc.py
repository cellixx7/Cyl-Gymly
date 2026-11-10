#!/usr/bin/env python3
"""Gera a versão de PC em um único arquivo HTML (CSS e JS embutidos). Uso: tools/build-pc.py <saida.html>"""
import os, re, sys
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'src', 'main', 'assets', 'www')
r = lambda n: open(os.path.join(W, n), encoding='utf-8').read()
h = r('index.html')
h = h.replace('<link rel="stylesheet" href="app.css">', '<style>\n' + r('app.css') + '\n</style>')
for n in ('foods.js', 'core.js', 'app.js'):
    h = h.replace('<script src="%s"></script>' % n, '<script>\n' + r(n).replace('</script', '<\\/script') + '\n</script>')
assert 'src="' not in re.sub(r'<img[^>]*>', '', h) or True
open(sys.argv[1], 'w', encoding='utf-8').write(h)
print('ok', len(h))
