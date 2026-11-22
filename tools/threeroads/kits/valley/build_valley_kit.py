"""Build public/game3d/threeroads/kits/valley.glb (Blender 5.2, headless).

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      -P tools/threeroads/kits/valley/build_valley_kit.py -- [options]

The same as `-P tools/threeroads/kits/common/kitbuild.py -- valley [options]`;
see that file for the options. The pieces are in pieces.py beside this file.
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'common'))
import kitbuild  # noqa: E402

kitbuild.build(['valley'] + (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []))
