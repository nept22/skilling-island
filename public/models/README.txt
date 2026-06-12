Drop your Blender exports here.

player.glb  -> replaces the placeholder capsule character automatically.
  - Export from Blender as glTF Binary (.glb) with default settings.
  - Aim for roughly 1.7 units tall (the game rescales, but proportions matter).
  - Animation clips named Idle, Walk and Fish (case-insensitive) are picked up
    and crossfaded automatically. Missing clips are simply skipped.
  - The character should face Blender's front view (-Y). If it walks backwards
    in game, rotate the root 180 degrees and re-export.
