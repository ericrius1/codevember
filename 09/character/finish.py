"""Boulder's pipeline/town/finish.py for the shaman: her export scaled to her height into ../assets."""
import os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
BOULDER = os.environ.get('BOULDER', os.path.expanduser('~/codeprojects/boulder'))
src = os.path.join(BOULDER, 'pipeline', 'town', 'finish.py')
code = open(src).read()
# (finish.py finds people/<who>.py beside itself and writes into Boulder's web assets: here, ours)
code = code.replace("os.path.join(HERE, 'blender', 'people', WHO + '.py')", repr(os.path.join(HERE, 'shaman.py')))
code = code.replace("OUT = os.path.join(ROOT, 'web', 'public', 'assets', 'town')", 'OUT = ' + repr(os.path.join(HERE, '..', 'assets')))
sys.argv = [src, 'shaman', os.path.join(HERE, 'export')]
g = {'__name__': '__main__', '__file__': src}
exec(compile(code, src, 'exec'), g)
