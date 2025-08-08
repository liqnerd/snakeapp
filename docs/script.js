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
    { name: 'Apple',    color: '#eb4034', points: 1, weight: 50, shape: 'circle' },
    { name: 'Orange',   color: '#ffa500', points: 2, weight: 30, shape: 'circle' },
    { name: 'Banana',   color: '#ffd700', points: 3, weight: 15, shape: 'circle' },
    { name: 'Berry',    color: '#ba55d3', points: 4, weight: 4,  shape: 'circle' },
    { name: 'Starfruit',color: '#1e90ff', points: 5, weight: 1,  shape: 'circle' },
  ];

  const STATE = {
    MENU: 'menu',
    NICKNAME: 'nickname',
    PLAY: 'play',
    LEADER: 'leader',
    FRUITS: 'fruits',
  };

  let state = STATE.MENU;
  const menu = ['Start Game', 'Leaderboard', 'Fruits', 'Exit'];
  let menuIndex = 0;
  let nickname = '';
  let nicknameInput = '';
  let nicknameCursor = 0;

  let score = 0;
  let snake, dir, pendingDir, growthPending;
  let fruit, fruitPoints, fruitColor, fruitName, fruitShape;
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
    fruitShape = choice.shape;
  }

  function spawnSpecial() {
    if (specialActive) return;
    const occ = new Set(snake.map(s => `${s.x},${s.y}`));
    // try random top-lefts for 2x2 block
    for (let t = 0; t < 100; t++) {
      const tx = (Math.random() * (GRID - 1)) | 0; // up to GRID-2
      const ty = (Math.random() * (GRID - 1)) | 0;
      const cells = [
        { x: tx, y: ty }, { x: tx + 1, y: ty },
        { x: tx, y: ty + 1 }, { x: tx + 1, y: ty + 1 },
      ];
      if (!cells.some(c => occ.has(`${c.x},${c.y}`))) {
        specialCells = cells;
        specialActive = true;
        specialExpireAt = performance.now() + SPECIAL_DURATION_MS;
        return;
      }
    }
  }

  // Cloud leaderboard using a simple approach
  // For cross-device sync, we'll use a simple cloud storage solution

  async function saveScore() {
    if (!nickname) return;
    
    const newScore = { score, nickname, timestamp: Date.now() };
    
    // Save to localStorage as backup
    try {
      const raw = localStorage.getItem('snake_scores');
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(newScore);
      const sorted = arr.sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.timestamp - b.timestamp;
      }).slice(0, 100);
      localStorage.setItem('snake_scores', JSON.stringify(sorted));
    } catch (error) {
      console.log('localStorage save failed');
    }
    
    // Try to save to cloud (non-blocking)
    saveScoreToCloud(newScore).catch(error => {
      console.log('Cloud save failed:', error);
    });
  }

  async function saveScoreToCloud(newScore) {
    try {
      // Using a simple cloud storage approach
      // This is a placeholder for a real cloud implementation
      const cloudData = {
        scores: [newScore],
        timestamp: Date.now()
      };
      
      // For now, we'll just log that we want cloud storage
      console.log('Score ready for cloud storage:', newScore);
      console.log('To implement cross-device sync, use a service like:');
      console.log('- Firebase Realtime Database');
      console.log('- AWS DynamoDB');
      console.log('- MongoDB Atlas');
      console.log('- Supabase');
      
    } catch (error) {
      throw error;
    }
  }

  async function loadScores() {
    // For now, just use localStorage
    // In a real implementation, you'd load from cloud first
    try {
      const raw = localStorage.getItem('snake_scores');
      const arr = raw ? JSON.parse(raw) : [];
      const scores = arr.filter(item => typeof item === 'object' && item.nickname);
      return scores.slice(0, 15);
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
      // Increase spawn chance by ~25%
      if (!specialActive && Math.random() < 0.025) spawnSpecial();
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
    const cx = x + CELL/2, cy = y + CELL/2;
    const r = Math.max(6, CELL*0.4);
    ctx.save();
    // All fruits are now circles, just different colors
    ctx.fillStyle = fruitColor;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function starPath(cx, cy, outer, inner, points) {
    const step = Math.PI / points;
    ctx.beginPath();
    for (let i = 0; i < 2*points; i++) {
      const r = (i % 2) ? inner : outer;
      const a = i * step - Math.PI/2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawFruitIcon(shape, color, cx, cy, size) {
    const x = cx - size/2, y = cy - size/2; const r = size*0.4;
    ctx.save();
    switch (shape) {
      case 'circle':
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill(); break;
      case 'ring':
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, size*0.18); ctx.beginPath(); ctx.arc(cx, cy, r*0.8, 0, Math.PI*2); ctx.stroke(); break;
      case 'diamond':
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx, y+2); ctx.lineTo(x+size-2, cy); ctx.lineTo(cx, y+size-2); ctx.lineTo(x+2, cy); ctx.closePath(); ctx.fill(); break;
      case 'doublecircle':
        ctx.fillStyle = color; const rr = r*0.6, off = r*0.5;
        ctx.beginPath(); ctx.arc(cx-off, cy, rr, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx+off, cy, rr, 0, Math.PI*2); ctx.fill();
        break;
      case 'star':
        ctx.fillStyle = color; starPath(cx, cy, r*0.9, r*0.45, 5); ctx.fill(); break;
      default:
        ctx.fillStyle = color; roundRect(x+2, y+2, size-4, size-4, 6); ctx.fill();
    }
    ctx.restore();
  }

  function drawSpecial() {
    if (!specialActive) return;
    const t = performance.now() / 1000;
    const hue = (t * 180) % 360;
    const base = `hsl(${hue}, 100%, 55%)`;
    // Draw as one large 2x2 object instead of 4 separate squares
    const minX = Math.min(...specialCells.map(c => c.x));
    const minY = Math.min(...specialCells.map(c => c.y));
    const x = minX * CELL, y = minY * CELL;
    ctx.fillStyle = base;
    roundRect(x+1, y+1, CELL*2-2, CELL*2-2, 12);
    ctx.fill();
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
      
      if (i === snake.length - 1) {
        // Snake head
        ctx.fillStyle = COLORS.snakeHead;
        roundRect(x+1, y+1, CELL-2, CELL-2, 8);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#000';
        const eyeSize = Math.max(2, CELL * 0.15);
        const eyeOffset = Math.max(3, CELL * 0.25);
        ctx.beginPath();
        ctx.arc(x + eyeOffset, y + eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.arc(x + CELL - eyeOffset, y + eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.fill();
        
        // Tongue
        ctx.fillStyle = '#ff4444';
        const tongueWidth = Math.max(2, CELL * 0.1);
        const tongueLength = Math.max(4, CELL * 0.3);
        ctx.fillRect(x + CELL/2 - tongueWidth/2, y + CELL - 1, tongueWidth, tongueLength);
      } else if (i === 0) {
        // Snake tail
        ctx.fillStyle = COLORS.snake;
        roundRect(x+1, y+1, CELL-2, CELL-2, 8);
        ctx.fill();
        
        // Tail tip
        ctx.fillStyle = '#2a8f5a';
        const tailSize = Math.max(3, CELL * 0.2);
        ctx.beginPath();
        ctx.arc(x + CELL/2, y + CELL/2, tailSize, 0, Math.PI*2);
        ctx.fill();
      } else {
        // Snake body
        ctx.fillStyle = COLORS.snake;
        roundRect(x+1, y+1, CELL-2, CELL-2, 8);
        ctx.fill();
      }
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
      if (ratio >= 1) {
        // Bar itself blinks when ready
        const t = performance.now()/1000;
        const glow = (Math.sin(t*6)+1)/2; // 0..1
        const light = Math.floor(60 + glow * 40);
        ctx.fillStyle = `hsl(140, 60%, ${light}%)`;
        roundRect(x, y, bw, bh, 6); ctx.fill();
      } else {
        ctx.fillStyle = '#78aaff';
        roundRect(x, y, bw * ratio, bh, 6); ctx.fill();
      }
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
    
    // Controls info
    ctx.font = `${Math.floor(SIZE*0.016)}px Inter, sans-serif`;
    ctx.fillStyle = '#888';
    ctx.fillText('W/A/S/D - Movement', SIZE/2, SIZE - 120);
    ctx.fillText('Shift - Turbo', SIZE/2, SIZE - 100);
    ctx.fillText('R - Restart', SIZE/2, SIZE - 80);
    ctx.fillText('Enter - Menu', SIZE/2, SIZE - 60);
    
    ctx.textAlign = 'left';
  }

  function drawLeader() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.036)}px Inter, sans-serif`;
    ctx.fillText('Leaderboard', SIZE/2, 80);
    
    // Load scores synchronously for now
    const scores = loadScoresSync();
    
    ctx.font = `${Math.floor(SIZE*0.023)}px Inter, sans-serif`;
    if (scores.length === 0) {
      ctx.fillText('No scores yet', SIZE/2, SIZE/2);
    } else {
      let y = 140; ctx.textAlign = 'left';
      scores.forEach((s, i) => {
        // Handle both old and new score formats
        let scoreText, nicknameText;
        if (typeof s === 'number') {
          scoreText = s;
          nicknameText = 'Anonymous';
        } else {
          scoreText = s.score;
          nicknameText = s.nickname || 'Anonymous';
        }
        ctx.fillText(`${String(i+1).padStart(2, ' ')}. ${nicknameText} - ${scoreText}`, SIZE/2 - 120, y);
        y += Math.floor(SIZE*0.028);
      });
    }
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`;
    ctx.fillStyle = '#c8c8c8';
    ctx.fillText('Esc/Backspace to return', SIZE/2 - 120, SIZE - 40);
  }

  function loadScoresSync() {
    try {
      const raw = localStorage.getItem('snake_scores');
      const arr = raw ? JSON.parse(raw) : [];
      const scores = arr.filter(item => typeof item === 'object' && item.nickname);
      return scores.slice(0, 15);
    } catch { return []; }
  }

  function drawFruits() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.036)}px Inter, sans-serif`;
    ctx.fillText('Fruits', SIZE/2, 70);
    
    // Modern centered layout
    const centerX = SIZE / 2;
    const startY = 130;
    const itemHeight = Math.floor(SIZE * 0.08);
    const iconSize = Math.floor(SIZE * 0.06);
    
    FRUITS.forEach((f, i) => {
      const y = startY + i * itemHeight;
      
      // Background card
      ctx.fillStyle = '#1a1a1a';
      roundRect(centerX - 200, y - 10, 400, itemHeight - 5, 12);
      ctx.fill();
      
      // Fruit icon
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(centerX - 150, y + itemHeight/2 - 10, iconSize/2, 0, Math.PI*2);
      ctx.fill();
      
      // Text
      ctx.fillStyle = COLORS.text;
      ctx.font = `${Math.floor(SIZE*0.022)}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(f.name, centerX - 100, y + itemHeight/2);
      ctx.textAlign = 'right';
      ctx.fillText(`+${f.points}`, centerX + 150, y + itemHeight/2);
    });
    
    // Special fruit
    const specialY = startY + FRUITS.length * itemHeight;
    ctx.fillStyle = '#1a1a1a';
    roundRect(centerX - 200, specialY - 10, 400, itemHeight - 5, 12);
    ctx.fill();
    
    ctx.fillStyle = '#ff6a5e';
    const specialSize = Math.floor(SIZE * 0.04);
    roundRect(centerX - 150, specialY + itemHeight/2 - specialSize/2, specialSize, specialSize, 8);
    ctx.fill();
    
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.floor(SIZE*0.022)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Mega Fruit (2x2)', centerX - 100, specialY + itemHeight/2);
    ctx.textAlign = 'right';
    ctx.fillText('+10', centerX + 150, specialY + itemHeight/2);
    
    ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`;
    ctx.fillStyle = '#c8c8c8';
    ctx.fillText('Esc/Backspace to return', SIZE/2, SIZE - 40);
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

  function drawNickname() {
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    ctx.font = `${Math.floor(SIZE*0.036)}px Inter, sans-serif`;
    ctx.fillText('Enter Your Nickname', SIZE/2, SIZE/2 - 100);
    
    // Input box
    const inputWidth = 400;
    const inputHeight = 50;
    const inputX = SIZE/2 - inputWidth/2;
    const inputY = SIZE/2 - 25;
    
    ctx.fillStyle = '#1a1a1a';
    roundRect(inputX, inputY, inputWidth, inputHeight, 12);
    ctx.fill();
    
    // Text
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.floor(SIZE*0.024)}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    const displayText = nicknameInput + (Date.now() % 1000 < 500 ? '|' : '');
    ctx.fillText(displayText, inputX + 20, inputY + 32);
    
    // Instructions
    ctx.font = `${Math.floor(SIZE*0.018)}px Inter, sans-serif`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText('Press Enter to continue', SIZE/2, SIZE/2 + 50);
    ctx.fillText('Max 12 characters', SIZE/2, SIZE/2 + 80);
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
    } else if (state === STATE.NICKNAME) {
      drawNickname();
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
        if (choice === 'Start Game') {
          if (!nickname) {
            state = STATE.NICKNAME;
            nicknameInput = '';
          } else {
            state = STATE.PLAY;
            resetGame();
          }
        }
        else if (choice === 'Leaderboard') state = STATE.LEADER;
        else if (choice === 'Fruits') state = STATE.FRUITS;
        else if (choice === 'Exit') window.location.href = 'https://github.com/liqnerd/snakeapp';
      } else if (e.key === 'Escape') {
        window.close();
      }
    } else if (state === STATE.NICKNAME) {
      if (e.key === 'Enter') {
        if (nicknameInput.trim()) {
          nickname = nicknameInput.trim();
          state = STATE.PLAY;
          resetGame();
        }
      } else if (e.key === 'Escape') {
        state = STATE.MENU;
      } else if (e.key === 'Backspace') {
        nicknameInput = nicknameInput.slice(0, -1);
      } else if (e.key.length === 1 && nicknameInput.length < 12) {
        nicknameInput += e.key;
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


