## Snake Game (Windows)

Simple 32x32 Snake game written in Python with Pygame.

### Controls
- W / A / S / D: Move Up / Left / Down / Right
- R: Restart after Game Over
- Esc: Quit

### Features
- 32x32 grid playfield
- Snake wraps around edges
- Random fruit types (visual only), each worth +1 point
- Snake grows by 1 for each fruit
- Self-collision ends the game

### Run (recommended)
1. Install Python 3.9+ from the Microsoft Store or python.org if not already installed.
2. In a terminal (PowerShell) at the project root, run:

```powershell
py -3 -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe snake_game.py
```

### Build a Windows executable (optional)
```powershell
./.venv/Scripts/python.exe -m pip install pyinstaller
./.venv/Scripts/pyinstaller --onefile --windowed snake_game.py
```
Output will be in `dist/snake_game.exe`.



