## Snake Game (Windows)

Simple Snake game built with Python and Pygame.

### Features
- 32x32 playfield grid
- Main menu: Start Game, Leaderboard, Fruits info, Exit
- Leaderboard: top 15 scores (saved locally in `scores.json`)
- Multiple fruit types with different points (1–5) by rarity
- Special rare 2x2 fruit appears in the center (+10 points)
- WASD controls (W/A/S/D)
- Snake grows by the points of the eaten fruit
- Self-collision ends the game
- Wrap-around walls (appear on opposite side)

### Requirements
- Python 3.8+ installed on Windows

### Setup & Run
From the project directory:

```
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -U pip
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe main.py
```

If your shell blocks script execution, you can run the last two commands without activating the venv by using the full path as shown above.

### Controls
- W: Up
- A: Left
- S: Down
- D: Right
- R: Restart after game over (in play)
- Enter/Space: Select (in menus); Enter on Game Over returns to menu
- Esc / window close: Quit

### Build for Web (GitHub Pages)
- Install dependencies (above), then build with pygbag:
```
./.venv/Scripts/python.exe -m pygbag --build --deploy --no_opt --quiet main.py
```
This creates a `build/web/` directory. Copy its contents to a `docs/` folder for GitHub Pages, or run with `--out docs` in newer pygbag versions. You can enable Pages in your repo settings to serve from `docs/` on the `main` branch.


