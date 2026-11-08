# Blender entry for the shaman: Boulder's town pipeline (pipeline/town/blender/town_build.py) with this folder on the
# path, so `--who shaman` finds shaman.py here (and lyra.py, whose ears and hair she borrows, in Boulder's people/).
import os, runpy, sys
HERE = os.path.dirname(os.path.abspath(__file__))
BOULDER = os.environ.get('BOULDER', os.path.expanduser('~/codeprojects/boulder'))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
runpy.run_path(os.path.join(BOULDER, 'pipeline', 'town', 'blender', 'town_build.py'), run_name='__main__')
