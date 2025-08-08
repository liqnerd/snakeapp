(() => {
  const GRID = 32;
  let SIZE = 1200; // px
  let CELL = Math.floor(SIZE / GRID);
  const FPS = 12;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const maxSide = Math.min(window.innerWidth, window.innerHeight) - 20;
    let target = Math.min(1200, Math.max(600, maxSide));
    const cell = Math.max(10, Math.floor(target / GRID));
    SIZE = cell * GRID;
    CELL = cell;
    canvas.width = SIZE;
    canvas.height = SIZE;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const COLORS = {
    bg: '#121418',
    grid: '#1e1f24',
    snake: '#3ccd78',
    snakeHead: '#28b464',
    text: '#eaeaea',
  };

  const FRUITS = [
    { name: 'Apple', color: '#eb4034', points: 1, weight: 50 },
    { name: 'Orange', color: '#ffa500', points: 2, weight: 30 },
    { name: 'Banana', color: '#ffd700', points: 3, weight: 15 },
    { name: 'Berry', color: '#ba55d3', points: 4, weight: 4 },
    { name: 'Starfruit', color: '#1e90ff', points: 5, weight: 1 },
  ];

  const STATE = {
    MENU: 'menu',
    PLAY: 'play',
    LEADER: 'leader',
    FRUITS: 'fruits',
  };

  let state = STATE.MENU;
  const menu = ['Start Game', 'Leaderboard', 'Fruits', 'Exit'];
  let menuIndex = 0;

  let score = 0;
  let snake, dir, pendingDir, growthPending;
  let fruit, fruitPoints, fruitColor, fruitName;
  let specialActive = false;
  let specialCells = [];
  let specialExpireAt = 0;
  const SPECIAL_POINTS = 10;
  const SPECIAL_DURATION_MS = 5000;
  let snakeGlowUntil = 0;

  let lastTick = 0;
  const STEP_MS = Math.floor(1000 / FPS);

  // TURBO
  let turboActive = false;
  const TURBO_DUR = 1200;
  let turboLast = -999999;
  let TURBO_COOLDOWN = 12000;

  function randFreeCell() {
    const occ = new Set(snake.map(s => `${s.x},${s.y}`));
    while (true) {
      const x = (Math.random() * GRID) | 0;
      const y = (Math.random() * GRID) | 0;
      if (!occ.has(`${x},${y}`)) return { x, y };
    }
  }

  function rollFruit() {
    const total = FRUITS.reduce((a, f) => a + f.weight, 0);
    let r = Math.random() * total;
    let choice = FRUITS[0];
    for (const f of FRUITS) {
      r -= f.weight;
      if (r <= 0) { choice = f; break; }
    }
    fruit = randFreeCell();
    fruitPoints = choice.points;
    fruitColor = choice.color;
    fruitName = choice.name;
  }

  function spawnSpecial() {
    if (specialActive) return;
    const cx = (GRID >> 1) - 1, cy = (GRID >> 1) - 1;
    const cells = [
      { x: cx, y: cy }, { x: cx + 1, y: cy },
      { x: cx, y: cy + 1 }, { x: cx + 1, y: cy + 1 },
    ];
    const occ = new Set(snake.map(s => `${s.x},${s.y}`));
    if (cells.some(c => occ.has(`${c.x},${c.y}`))) return;
    specialCells = cells;
    specialActive = true;
    specialExpireAt = performance.now() + SPECIAL_DURATION_MS;
  }

  function saveScore() {
    try {
      const raw = localStorage.getItem('snake_scores');
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(score);
      const unique = Array.from(new Set(arr)).sort((a,b) => b-a).slice(0, 100);
      localStorage.setItem('snake_scores', JSON.stringify(unique));
    } catch {}
  }

  function loadScores() {
    try {
      const raw = localStorage.getItem('snake_scores');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.from(new Set(arr)).sort((a,b) => b-a).slice(0, 15);
    } catch { return []; }
  }

  function resetGame() {
    score = 0;
    const c = { x: GRID >> 1, y: GRID >> 1 };
    snake = [ { x: c.x - 2, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y } ];
    dir = { x: 1, y: 0 };
    pendingDir = { x: 1, y: 0 };
    growthPending = 0;
    specialActive = false;
    specialCells = [];
    snakeGlowUntil = 0;
    rollFruit();
  }

  function wrap(n) {
    n %= GRID; if (n < 0) n += GRID; return n;
  }

  function step() {
    // commit dir
    dir = pendingDir;
    const head = snake[snake.length - 1];
    const nx = wrap(head.x + dir.x);
    const ny = wrap(head.y + dir.y);
    snake.push({ x: nx, y: ny });
    if (growthPending > 0) growthPending--; else snake.shift();
    // self-hit
    const hit = snake.slice(0, -1).some(s => s.x === nx && s.y === ny);
    if (hit) return true;
    // eat special
    if (specialActive && specialCells.some(c => c.x === nx && c.y === ny)) {
      score += SPECIAL_POINTS;
      growthPending += SPECIAL_POINTS;
      specialActive = false; specialCells = [];
      snakeGlowUntil = performance.now() + 2000;
      rollFruit();
      return false;
    }
    // eat fruit
    if (nx === fruit.x && ny === fruit.y) {
      score += fruitPoints;
      growthPending += fruitPoints;
      rollFruit();
      // 2% chance each time you eat to spawn special
      if (!specialActive && Math.random() < 0.02) spawnSpecial();
    }
    // expire special
    if (specialActive && performance.now() >= specialExpireAt) {
      specialActive = false; specialCells = [];
    }
    return false;
  }

  function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const x = i * CELL;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SIZE); ctx.stroke();
      const y = i * CELL;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
    }
  }

  function drawFruit() {
    const x = fruit.x * CELL, y = fruit.y * CELL;
    ctx.fillStyle = fruitColor;
    roundRect(x+2, y+2, CELL-4, CELL-4, 6);
    ctx.fill();
  }

  function drawSpecial() {
    if (!specialActive) return;
    const t = performance.now() / 1000;
    const hue = (t * 180) % 360;
    const base = `hsl(${hue}, 100%, 55%)`;
    for (const c of specialCells) {
      const x = c.x * CELL, y = c.y * CELL;
      ctx.fillStyle = base;
      roundRect(x+1, y+1, CELL-2, CELL-2, 8);
      ctx.fill();
    }
  }

  function drawSnakeGlow() {
    if (performance.now() > snakeGlowUntil) return;
    const t = performance.now() / 1000;
    const hue = (t * 360) % 360;
    ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.25)`;
    for (const s of snake) {
      const x = s.x * CELL - 4, y = s.y * CELL - 4;
      roundRect(x, y, CELL + 8, CELL + 8, 12);
      ctx.fill();
    }
  }

  function drawSnake() {
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      const x = s.x * CELL, y = s.y * CELL;
      ctx.fillStyle = (i === snake.length - 1) ? COLORS.snakeHead : COLORS.snake;
      roundRect(x+1, y+1, CELL-2, CELL-2, 8);
      ctx.fill();
    }
  }

  function drawScoreAndTurbo() {
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.floor(SIZE*0.023)}px Inter, sans-serif`;
    ctx.fillText(`Score: ${score}`, 12, 32);

    // turbo bar top-right
    const bw = Math.floor(SIZE*0.17), bh = Math.floor(SIZE*0.013), m = 12; const x = SIZE - bw - m, y = m;
    ctx.fillStyle = '#3a3a3a'; roundRect(x, y, bw, bh, 6); ctx.fill();
    if (turboActive) {
      const ratio = 1 - Math.min(1, (performance.now() - turboLast) / TURBO_DUR);
      ctx.fillStyle = '#ff6a5e'; roundRect(x, y, bw * ratio, bh, 6); ctx.fill();
    } else {
      const since = performance.now() - turboLast;
      const ratio = Math.min(1, since / TURBO_COOLDOWN);
      ctx.fillStyle = ratio >= 1 ? '#5bd18a' : '#78aaff';
      roundRect(x, y, bw * ratio, bh, 6); ctx.fill();
    }
    ctx.fillStyle = COLORS.text; ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`;
    ctx.fillText('TURBO', x - 90, y + 13);
  }

  function drawMenu() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.04)}px Inter, sans-serif`;
    ctx.fillText('Snake 32x32', SIZE/2, SIZE/2 - 180);
    ctx.font = `${Math.floor(SIZE*0.023)}px Inter, sans-serif`;
    menu.forEach((m, i) => {
      ctx.fillStyle = (i === menuIndex) ? '#fff' : '#c8c8c8';
      ctx.fillText(m, SIZE/2, SIZE/2 - Math.floor(SIZE*0.033) + i * Math.floor(SIZE*0.04));
    });
    ctx.textAlign = 'left';
  }

  function drawLeader() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.036)}px Inter, sans-serif`;
    ctx.fillText('Leaderboard', SIZE/2, 80);
    const scores = loadScores();
    ctx.font = `${Math.floor(SIZE*0.023)}px Inter, sans-serif`;
    if (scores.length === 0) {
      ctx.fillText('No scores yet', SIZE/2, SIZE/2);
    } else {
      let y = 140; ctx.textAlign = 'left';
      scores.forEach((s, i) => {
        ctx.fillText(`${String(i+1).padStart(2, ' ')}. ${s}`, SIZE/2 - 80, y);
        y += Math.floor(SIZE*0.028);
      });
    }
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`;
    ctx.fillStyle = '#c8c8c8';
    ctx.fillText('Esc/Backspace to return', SIZE/2 - 120, SIZE - 40);
  }

  function drawFruits() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.036)}px Inter, sans-serif`;
    ctx.fillText('Fruits', SIZE/2, 70);
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(SIZE*0.022)}px Inter, sans-serif`;
    let y = 130;
    FRUITS.forEach(f => {
      ctx.fillStyle = f.color; roundRect(120, y, Math.floor(SIZE*0.026), Math.floor(SIZE*0.023), 6); ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`${f.name}  +${f.points}`, 170, y + 22);
      y += 50;
    });
    ctx.fillStyle = '#ff6a5e';
    // draw 2x2 block
    const cell = Math.floor(SIZE*0.018); const bx = 120, by = y + 10;
    roundRect(bx, by, cell, cell, 6); ctx.fill();
    roundRect(bx+cell+4, by, cell, cell, 6); ctx.fill();
    roundRect(bx, by+cell+4, cell, cell, 6); ctx.fill();
    roundRect(bx+cell+4, by+cell+4, cell, cell, 6); ctx.fill();
    ctx.fillStyle = COLORS.text; ctx.fillText('Mega Fruit (2x2 center)  +10', 170, by + 20);
    ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`; ctx.fillStyle = '#c8c8c8';
    ctx.fillText('Esc/Backspace to return', SIZE/2 - 120, SIZE - 40);
  }

  function drawPlay() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    drawGrid();
    drawFruit();
    drawSpecial();
    drawSnakeGlow();
    drawSnake();
    drawScoreAndTurbo();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function tick(ts) {
    if (state === STATE.PLAY) {
      const interval = turboActive ? Math.max(1, STEP_MS * 0.45) : STEP_MS;
      if (!lastTick) lastTick = ts;
      if (ts - lastTick >= interval) {
        lastTick = ts;
        const over = step();
        if (over) {
          saveScore();
          state = STATE.MENU;
        }
      }
      drawPlay();
    } else if (state === STATE.MENU) {
      drawMenu();
    } else if (state === STATE.LEADER) {
      drawLeader();
    } else if (state === STATE.FRUITS) {
      drawFruits();
    }
    requestAnimationFrame(tick);
  }

  function start() {
    canvas.width = SIZE; canvas.height = SIZE;
    resetGame();
    drawMenu();
    requestAnimationFrame(tick);
  }

  window.addEventListener('keydown', (e) => {
    if (state === STATE.MENU) {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') menuIndex = (menuIndex - 1 + menu.length) % menu.length;
      else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') menuIndex = (menuIndex + 1) % menu.length;
      else if (e.key === 'Enter' || e.key === ' ') {
        const choice = menu[menuIndex];
        if (choice === 'Start Game') state = STATE.PLAY, resetGame();
        else if (choice === 'Leaderboard') state = STATE.LEADER;
        else if (choice === 'Fruits') state = STATE.FRUITS;
        else if (choice === 'Exit') window.location.href = 'https://github.com/liqnerd/snakeapp';
      } else if (e.key === 'Escape') {
        window.close();
      }
    } else if (state === STATE.PLAY) {
      if (e.key === 'Escape') { state = STATE.MENU; return; }
      if (e.key.toLowerCase() === 'w' && dir.y !== 1) pendingDir = { x: 0, y: -1 };
      else if (e.key.toLowerCase() === 's' && dir.y !== -1) pendingDir = { x: 0, y: 1 };
      else if (e.key.toLowerCase() === 'a' && dir.x !== 1) pendingDir = { x: -1, y: 0 };
      else if (e.key.toLowerCase() === 'd' && dir.x !== -1) pendingDir = { x: 1, y: 0 };
      else if (e.key === 'Shift') {
        const now = performance.now();
        if (!turboActive && (now - turboLast >= TURBO_COOLDOWN)) { turboActive = true; turboLast = now; }
      } else if (e.key.toLowerCase() === 'r') {
        saveScore(); resetGame();
      } else if (e.key === 'Enter') {
        saveScore(); state = STATE.MENU;
      }
    } else if (state === STATE.LEADER || state === STATE.FRUITS) {
      if (e.key === 'Escape' || e.key === 'Backspace') state = STATE.MENU;
    }
  });

  // End turbo
  setInterval(() => {
    if (turboActive && performance.now() - turboLast >= TURBO_DUR) turboActive = false;
  }, 50);

  start();
})();


