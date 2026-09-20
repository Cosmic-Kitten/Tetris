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

const COLORS = {
  I: '#4dd0ff',
  O: '#ffd166',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
};

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

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function randomPiece() {
  const type = Object.keys(SHAPES)[Math.floor(Math.random() * Object.keys(SHAPES).length)];
  const matrix = cloneMatrix(SHAPES[type]);

  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: -1,
    color: COLORS[type],
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

      if (newY >= 0 && board[newY][newX]) {
        return true;
      }
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

      if (boardY >= 0) {
        board[boardY][boardX] = currentPiece.color;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
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
  ctx.fillStyle = color || '#0f172a';
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.strokeRect(x * BLOCK_SIZE + 0.5, y * BLOCK_SIZE + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      drawCell(x, y, board[y][x] || '#0b1220');
    }
  }

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
}

function togglePause() {
  if (!isRunning || gameOver) {
    return;
  }

  isPaused = !isPaused;
  statusEl.textContent = isPaused ? 'Paused' : 'Game running';
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
      movePiece(-1, 0);
      break;
    case 'ArrowRight':
      movePiece(1, 0);
      break;
    case 'ArrowDown':
      movePiece(0, 1);
      score += 1;
      updateStats();
      break;
    case 'ArrowUp':
      rotatePiece();
      break;
    case ' ':
      hardDrop();
      break;
    default:
      break;
  }
}

function update(timestamp) {
  if (isRunning && !isPaused && !gameOver) {
    if (timestamp - lastDropAt > dropInterval) {
      movePiece(0, 1);
      lastDropAt = timestamp;
    }
  }

  drawBoard();
  requestAnimationFrame(update);
}

startBtn.addEventListener('click', () => {
  resetGame();
  startBtn.textContent = 'Restart Game';
});

document.addEventListener('keydown', handleKeydown);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // Ignore registration errors; the game still works in the browser.
    });
  });
}

updateStats();
drawBoard();
requestAnimationFrame(update);
