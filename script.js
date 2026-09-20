const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start-btn');
const mobileButtons = document.querySelectorAll('[data-action]');

const COLORS = ['#4dd0ff', '#ffd166', '#c084fc', '#4ade80'];

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

let board = [];
let currentPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let isRunning = false;
let isPaused = false;
let gameOver = false;
let lastDropAt = 0;
let dropInterval = 650;
let powderParticles = [];
const MAX_POWDER_PARTICLES = 8000;
const SAND_BIN_SIZE = 3;
const SAND_BIN_COUNT = Math.ceil((COLS * BLOCK_SIZE) / SAND_BIN_SIZE);
let sandHeights = new Float32Array(SAND_BIN_COUNT);
let sandEdgeCoverage = new Map();
let pendingSandClear = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function randomPiece() {
  const pieceTypes = Object.keys(SHAPES);
  const type = pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
  const matrix = cloneMatrix(SHAPES[type]);

  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function updateStats() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  levelEl.textContent = String(level);
}

function spawnPiece() {
  currentPiece = randomPiece();

  if (collides(currentPiece, 0, 0, currentPiece.matrix)) {
    gameOver = true;
    isRunning = false;
    statusEl.textContent = 'Game over. Press Start to try again.';
    startBtn.textContent = 'Start Game';
  }
}

function resetGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 650;
  gameOver = false;
  isRunning = true;
  isPaused = false;
  lastDropAt = 0;
  powderParticles = [];
  sandHeights = new Float32Array(SAND_BIN_COUNT);
  sandEdgeCoverage = new Map();
  pendingSandClear = null;
  statusEl.textContent = 'Game running';
  updateStats();
  spawnPiece();
}

function collides(piece, offsetX = 0, offsetY = 0, testMatrix = piece.matrix) {
  for (let y = 0; y < testMatrix.length; y += 1) {
    for (let x = 0; x < testMatrix[y].length; x += 1) {
      if (!testMatrix[y][x]) {
        continue;
      }

      const newX = piece.x + x + offsetX;
      const newY = piece.y + y + offsetY;

      if (newX < 0 || newX >= COLS || newY >= ROWS) {
        return true;
      }

      // Sand is visual material, not a hidden grid of solid collision blocks.
    }
  }

  return false;
}

function mergePiece() {
  currentPiece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) {
        return;
      }

      const boardY = currentPiece.y + y;
      const boardX = currentPiece.x + x;

      if (boardY < 0) return;
    });
  });

  // Treat a landed tetromino as one material burst, not four solid blocks.
  createPiecePowder(currentPiece);
}

function createPiecePowder(piece) {
  const cells = [];

  piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) cells.push({ x: piece.x + x, y: piece.y + y });
  }));

  if (!cells.length) return;

  const grainsPerPiece = 360;
  for (let index = 0; index < grainsPerPiece; index += 1) {
    const cell = cells[Math.floor(Math.random() * cells.length)];
    createPowder(cell.x, cell.y, piece.color, 1);
  }
}

function createPowder(boardX, boardY, color, particleCount = 180, persistent = true) {
  const centerX = boardX * BLOCK_SIZE + BLOCK_SIZE / 2;
  const topY = boardY * BLOCK_SIZE;

  for (let index = 0; index < particleCount; index += 1) {
    const size = 3.5 + Math.random() * 2.5;
    powderParticles.push({
      x: centerX + (Math.random() - 0.5) * (BLOCK_SIZE - 4),
      y: topY - 10 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 3.2,
      vy: 1.2 + Math.random() * 1.8,
      size,
      color,
      life: 1,
      persistent,
      cellX: boardX,
      cellY: boardY,
      settled: false,
    });
  }

  if (powderParticles.length > MAX_POWDER_PARTICLES) {
    powderParticles.splice(0, powderParticles.length - MAX_POWDER_PARTICLES);
  }
}

function updatePowder() {
  powderParticles = powderParticles.filter((particle) => particle.life > 0);

  powderParticles.forEach((particle) => {
    if (particle.settled) {
      if (!particle.persistent) {
        particle.life -= 0.02;
      }
      return;
    }

    // Sand should drop decisively to the bottom of the playfield.
    particle.vy += 0.42;
    particle.x += particle.vx;
    particle.y += particle.vy;

    const leftWall = 2;
    const rightWall = canvas.width - particle.size - 2;

    if (particle.x < leftWall || particle.x > rightWall) {
      particle.x = Math.max(leftWall, Math.min(particle.x, rightWall));
      particle.vx *= -0.45;
    }

    const bin = Math.max(0, Math.min(SAND_BIN_COUNT - 1, Math.floor(particle.x / SAND_BIN_SIZE)));
    const leftBin = Math.max(0, bin - 1);
    const rightBin = Math.min(SAND_BIN_COUNT - 1, bin + 1);
    const lowestNeighbor = sandHeights[leftBin] < sandHeights[rightBin] ? leftBin : rightBin;
    const surfaceY = canvas.height - particle.size - sandHeights[bin];

    if (particle.y >= surfaceY) {
      // Let grains roll down steep slopes before they settle, creating a mound.
      if (sandHeights[bin] > sandHeights[lowestNeighbor] + particle.size * 1.5) {
        const direction = lowestNeighbor < bin ? -1 : 1;
        const rolledX = particle.x + direction * SAND_BIN_SIZE;
        particle.x = Math.max(leftWall, Math.min(rolledX, rightWall));
        particle.vx = direction * (0.35 + Math.random() * 0.55);
        particle.y = Math.min(particle.y, canvas.height - particle.size - sandHeights[lowestNeighbor]);
        return;
      }

      particle.y = surfaceY;
      particle.vy = 0;
      particle.vx *= 0.45;
      particle.settled = true;
      particle.life = 1;
      particle.pileBin = bin;

      if (particle.persistent) {
        sandHeights[bin] += particle.size * 0.82;
        recordSandEdge(particle);
      }
    }
  });

  if (pendingSandClear) {
    clearSandColor(pendingSandClear);
    pendingSandClear = null;
  }
}

function recordSandEdge(particle) {
  const column = Math.max(0, Math.min(COLS - 1, Math.floor(particle.x / BLOCK_SIZE)));
  const coveredColumns = sandEdgeCoverage.get(particle.color) || new Set();

  coveredColumns.add(column);
  sandEdgeCoverage.set(particle.color, coveredColumns);

  // A mountain is uneven, so the color may reach each wall at different heights.
  if (coveredColumns.has(0) && coveredColumns.has(COLS - 1)) {
    pendingSandClear = particle.color;
  }
}

function clearSandColor(color) {
  powderParticles = powderParticles.filter((particle) => particle.color !== color);
  sandHeights = new Float32Array(SAND_BIN_COUNT);
  sandEdgeCoverage = new Map();

  // Let the remaining colors settle again into the space that just opened.
  powderParticles.forEach((particle) => {
    if (particle.persistent) {
      particle.settled = false;
      particle.vy = 0;
    }
  });

  lines += 1;
  score += 500 * level;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(120, 650 - (level - 1) * 55);
  updateStats();
  statusEl.textContent = 'Color span cleared!';
}

function clearLines() {
  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y -= 1) {
    const rowColor = board[y][0];
    const isSingleColorRow = rowColor && board[y].every((cell) => cell === rowColor);

    if (isSingleColorRow) {
      createLinePowder(y, rowColor);
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared] * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(120, 650 - (level - 1) * 55);
    updateStats();
  }
}

function createLinePowder(rowY, color) {
  for (let x = 0; x < COLS; x += 1) {
    createPowder(x, rowY, color, 24, false);
  }
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, columnIndex) =>
    matrix.map((row) => row[columnIndex]).reverse()
  );
}

function rotatePiece() {
  if (!isRunning || isPaused || gameOver) {
    return;
  }

  const rotated = rotateMatrix(currentPiece.matrix);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    if (!collides(currentPiece, kick, 0, rotated)) {
      currentPiece.matrix = rotated;
      currentPiece.x += kick;
      return;
    }
  }
}

function movePiece(dx, dy) {
  if (!isRunning || isPaused || gameOver) {
    return false;
  }

  if (!collides(currentPiece, dx, dy)) {
    currentPiece.x += dx;
    currentPiece.y += dy;
    return true;
  }

  if (dy > 0) {
    mergePiece();
    clearLines();
    spawnPiece();
  }

  return false;
}

function hardDrop() {
  if (!isRunning || isPaused || gameOver) {
    return;
  }

  let distance = 0;
  while (!collides(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    distance += 1;
  }

  score += distance * 2;
  updateStats();
  mergePiece();
  clearLines();
  spawnPiece();
}

function drawCell(x, y, color) {
  const px = x * BLOCK_SIZE;
  const py = y * BLOCK_SIZE;
  const inset = color ? 2 : 0;

  if (!color) {
    ctx.fillStyle = '#080c1c';
    ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
    ctx.strokeStyle = 'rgba(140, 165, 255, 0.075)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
    return;
  }

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 13;
  const fill = ctx.createLinearGradient(px, py, px + BLOCK_SIZE, py + BLOCK_SIZE);
  fill.addColorStop(0, '#ffffff');
  fill.addColorStop(0.07, color);
  fill.addColorStop(1, color);
  ctx.fillStyle = fill;
  ctx.fillRect(px + inset, py + inset, BLOCK_SIZE - inset * 2, BLOCK_SIZE - inset * 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.fillRect(px + inset + 2, py + inset + 2, BLOCK_SIZE - inset * 2 - 4, 2);
  ctx.strokeStyle = 'rgba(7, 13, 36, 0.38)';
  ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, BLOCK_SIZE - inset * 2 - 1, BLOCK_SIZE - inset * 2 - 1);
  ctx.restore();
}

function drawGhostPiece() {
  if (!currentPiece || !isRunning || isPaused) return;
  let ghostY = currentPiece.y;
  while (!collides({ ...currentPiece, y: ghostY }, 0, 1)) ghostY += 1;
  if (ghostY === currentPiece.y) return;
  ctx.save();
  ctx.globalAlpha = 0.22;
  currentPiece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && ghostY + y >= 0) drawCell(currentPiece.x + x, ghostY + y, currentPiece.color);
  }));
  ctx.restore();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      // The board still tracks collisions, but powder is the only visible
      // material after a piece locks.
      drawCell(x, y, null);
    }
  }

  drawGhostPiece();

  if (currentPiece) {
    currentPiece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) {
          return;
        }

        const drawX = currentPiece.x + x;
        const drawY = currentPiece.y + y;

        if (drawY >= 0) {
          drawCell(drawX, drawY, currentPiece.color);
        }
      });
    });
  }

  powderParticles.forEach((particle) => {
    particle.x = Math.max(0, Math.min(particle.x, canvas.width - particle.size));
    ctx.globalAlpha = particle.life;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function togglePause() {
  if (!isRunning || gameOver) {
    return;
  }

  isPaused = !isPaused;
  statusEl.textContent = isPaused ? 'Paused' : 'Game running';
}

function applyAction(action) {
  if (!isRunning && action !== 'drop') {
    return;
  }

  if (action === 'pause') {
    togglePause();
    return;
  }

  if (isPaused) {
    return;
  }

  switch (action) {
    case 'left':
      movePiece(-1, 0);
      break;
    case 'right':
      movePiece(1, 0);
      break;
    case 'down':
      movePiece(0, 1);
      score += 1;
      updateStats();
      break;
    case 'rotate':
      rotatePiece();
      break;
    case 'drop':
      if (!isRunning) {
        resetGame();
        return;
      }
      hardDrop();
      break;
    default:
      break;
  }
}

function handleKeydown(event) {
  const key = event.key;

  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'p', 'P'].includes(key)) {
    event.preventDefault();
  }

  if (!isRunning) {
    if (key === 'Enter' || key === ' ') {
      resetGame();
    }
    return;
  }

  if (key === 'p' || key === 'P') {
    togglePause();
    return;
  }

  if (isPaused) {
    return;
  }

  switch (key) {
    case 'ArrowLeft':
      applyAction('left');
      break;
    case 'ArrowRight':
      applyAction('right');
      break;
    case 'ArrowDown':
      applyAction('down');
      break;
    case 'ArrowUp':
      applyAction('rotate');
      break;
    case ' ':
      applyAction('drop');
      break;
    default:
      break;
  }
}

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (event) => {
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;

  if (Math.abs(deltaX) < 24 && Math.abs(deltaY) < 24) {
    applyAction('rotate');
    return;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    applyAction(deltaX < 0 ? 'left' : 'right');
  } else {
    applyAction(deltaY < 0 ? 'rotate' : 'down');
  }
}, { passive: true });

mobileButtons.forEach((button) => {
  button.addEventListener('click', () => applyAction(button.dataset.action));
});

function startGame() {
  resetGame();
  startBtn.textContent = 'Restart Game';
}

startBtn.addEventListener('click', startGame);

function update(timestamp) {
  if (isRunning && !isPaused && !gameOver) {
    if (timestamp - lastDropAt > dropInterval) {
      movePiece(0, 1);
      lastDropAt = timestamp;
    }
  }

  updatePowder();
  drawBoard();
  requestAnimationFrame(update);
}

document.addEventListener('keydown', handleKeydown);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js?v=10').then((registration) => {
      registration.update();
    }).catch(() => {
      // Ignore registration errors; the game still works in the browser.
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  });
}

board = createBoard();
updateStats();
drawBoard();
requestAnimationFrame(update);
