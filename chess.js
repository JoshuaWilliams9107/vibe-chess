'use strict';

// ---------- Representation ----------
// board[r][c]; r=0 is the top row (8th rank, black side).
// Piece: { t: 'p'|'n'|'b'|'r'|'q'|'k', c: 'w'|'b' }
// Move:  { from:[r,c], to:[r,c], kind:'move'|'castle-k'|'castle-q'|'ep', promo:bool }

const VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const opp = (c) => (c === 'w' ? 'b' : 'w');
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function initialState() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { t: back[c], c: 'b' };
    board[1][c] = { t: 'p', c: 'b' };
    board[6][c] = { t: 'p', c: 'w' };
    board[7][c] = { t: back[c], c: 'w' };
  }
  return {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    epTarget: null,
    over: false,
    result: null, // 'win' | 'lose' | 'draw'
  };
}

function cloneBoard(board) {
  return board.map((row) => row.map((p) => (p ? { t: p.t, c: p.c } : null)));
}

// ---------- Attacks / checks ----------

function isAttacked(board, r, c, by) {
  for (const [dr, dc] of KNIGHT_D) {
    const rr = r + dr, cc = c + dc;
    if (inBoard(rr, cc)) {
      const p = board[rr][cc];
      if (p && p.c === by && p.t === 'n') return true;
    }
  }
  for (const [dr, dc] of KING_D) {
    const rr = r + dr, cc = c + dc;
    if (inBoard(rr, cc)) {
      const p = board[rr][cc];
      if (p && p.c === by && p.t === 'k') return true;
    }
  }
  for (const [dr, dc] of ROOK_D) {
    let rr = r + dr, cc = c + dc;
    while (inBoard(rr, cc)) {
      const p = board[rr][cc];
      if (p) {
        if (p.c === by && (p.t === 'r' || p.t === 'q')) return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of BISHOP_D) {
    let rr = r + dr, cc = c + dc;
    while (inBoard(rr, cc)) {
      const p = board[rr][cc];
      if (p) {
        if (p.c === by && (p.t === 'b' || p.t === 'q')) return true;
        break;
      }
      rr += dr; cc += dc;
    }
  }
  // Pawns attack one row ahead of their own position.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (inBoard(pr, c + dc)) {
      const p = board[pr][c + dc];
      if (p && p.c === by && p.t === 'p') return true;
    }
  }
  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.t === 'k' && p.c === color) return [r, c];
    }
  }
  return null;
}

function inCheck(board, color) {
  const k = findKing(board, color);
  return k !== null && isAttacked(board, k[0], k[1], opp(color));
}

// ---------- Move generation ----------

function pseudoMoves(st, r, c) {
  const board = st.board;
  const p = board[r][c];
  const moves = [];
  const add = (rr, cc, extra = {}) => moves.push({ from: [r, c], to: [rr, cc], ...extra });

  if (p.t === 'p') {
    const dir = p.c === 'w' ? -1 : 1;
    const startRow = p.c === 'w' ? 6 : 1;
    const promoRow = p.c === 'w' ? 0 : 7;
    if (inBoard(r + dir, c) && !board[r + dir][c]) {
      add(r + dir, c, { kind: 'move', promo: r + dir === promoRow });
      if (r === startRow && !board[r + 2 * dir][c]) {
        add(r + 2 * dir, c, { kind: 'move', promo: false });
      }
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir, cc = c + dc;
      if (!inBoard(rr, cc)) continue;
      const t = board[rr][cc];
      if (t && t.c !== p.c) add(rr, cc, { kind: 'move', promo: rr === promoRow });
      else if (st.epTarget && st.epTarget[0] === rr && st.epTarget[1] === cc) {
        add(rr, cc, { kind: 'ep', promo: false });
      }
    }
  } else if (p.t === 'n') {
    for (const [dr, dc] of KNIGHT_D) {
      const rr = r + dr, cc = c + dc;
      if (inBoard(rr, cc) && (!board[rr][cc] || board[rr][cc].c !== p.c)) add(rr, cc, { kind: 'move' });
    }
  } else if (p.t === 'k') {
    for (const [dr, dc] of KING_D) {
      const rr = r + dr, cc = c + dc;
      if (inBoard(rr, cc) && (!board[rr][cc] || board[rr][cc].c !== p.c)) add(rr, cc, { kind: 'move' });
    }
    const row = p.c === 'w' ? 7 : 0;
    const enemy = opp(p.c);
    if (r === row && !isAttacked(board, row, 4, enemy)) {
      const canK = p.c === 'w' ? st.castling.wK : st.castling.bK;
      const canQ = p.c === 'w' ? st.castling.wQ : st.castling.bQ;
      if (
        canK && !board[row][5] && !board[row][6] &&
        board[row][7] && board[row][7].t === 'r' && board[row][7].c === p.c &&
        !isAttacked(board, row, 5, enemy) && !isAttacked(board, row, 6, enemy)
      ) {
        add(row, 6, { kind: 'castle-k' });
      }
      if (
        canQ && !board[row][1] && !board[row][2] && !board[row][3] &&
        board[row][0] && board[row][0].t === 'r' && board[row][0].c === p.c &&
        !isAttacked(board, row, 3, enemy) && !isAttacked(board, row, 2, enemy)
      ) {
        add(row, 2, { kind: 'castle-q' });
      }
    }
  } else {
    const dirs = p.t === 'r' ? ROOK_D : p.t === 'b' ? BISHOP_D : [...ROOK_D, ...BISHOP_D];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inBoard(rr, cc)) {
        const t = board[rr][cc];
        if (!t) {
          add(rr, cc, { kind: 'move' });
        } else {
          if (t.c !== p.c) add(rr, cc, { kind: 'move' });
          break;
        }
        rr += dr; cc += dc;
      }
    }
  }
  return moves;
}

function applyToBoard(board, m) {
  const [fr, fc] = m.from;
  const [tr, tc] = m.to;
  const p = board[fr][fc];
  board[tr][tc] = p;
  board[fr][fc] = null;
  if (m.kind === 'ep') board[fr][tc] = null;
  if (m.kind === 'castle-k') { board[tr][5] = board[tr][7]; board[tr][7] = null; }
  if (m.kind === 'castle-q') { board[tr][3] = board[tr][0]; board[tr][0] = null; }
  if (m.promo) p.t = 'q';
}

function legalMoves(st, color) {
  color = color || st.turn;
  const legal = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = st.board[r][c];
      if (!p || p.c !== color) continue;
      for (const m of pseudoMoves(st, r, c)) {
        const b2 = cloneBoard(st.board);
        applyToBoard(b2, m);
        if (!inCheck(b2, color)) legal.push(m);
      }
    }
  }
  return legal;
}

function makeMove(st, m) {
  const piece = st.board[m.from[0]][m.from[1]];
  applyToBoard(st.board, m);
  const cr = st.castling;
  const [tr, tc] = m.to;
  if (piece.t === 'k') {
    if (piece.c === 'w') { cr.wK = false; cr.wQ = false; }
    else { cr.bK = false; cr.bQ = false; }
  }
  if (piece.t === 'r') {
    if (m.from[0] === 7 && m.from[1] === 0) cr.wQ = false;
    if (m.from[0] === 7 && m.from[1] === 7) cr.wK = false;
    if (m.from[0] === 0 && m.from[1] === 0) cr.bQ = false;
    if (m.from[0] === 0 && m.from[1] === 7) cr.bK = false;
  }
  if (tr === 7 && tc === 0) cr.wQ = false;
  if (tr === 7 && tc === 7) cr.wK = false;
  if (tr === 0 && tc === 0) cr.bQ = false;
  if (tr === 0 && tc === 7) cr.bK = false;
  if (piece.t === 'p' && Math.abs(m.to[0] - m.from[0]) === 2) {
    st.epTarget = [(m.to[0] + m.from[0]) / 2, m.from[1]];
  } else {
    st.epTarget = null;
  }
  st.turn = opp(st.turn);
}

function checkGameEnd(st) {
  const hasMoves = legalMoves(st, st.turn).length > 0;
  if (!hasMoves) {
    st.over = true;
    st.result = inCheck(st.board, st.turn)
      ? (st.turn === 'b' ? 'win' : 'lose')
      : 'draw';
  }
}

// ---------- Simple AI (black): greedy captures with a slight center bias ----------

function aiMove(st) {
  const moves = legalMoves(st, 'b');
  if (!moves.length) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const cap = st.board[m.to[0]][m.to[1]];
    let s = cap ? VALUE[cap.t] : 0;
    const [tr, tc] = m.to;
    s += 0.1 * (3.5 - Math.abs(tr - 3.5)) + 0.1 * (3.5 - Math.abs(tc - 3.5));
    s += Math.random() * 0.5;
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

// ---------- UI ----------

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const newGameBtn = document.getElementById('newGame');
const thinkbarEl = document.getElementById('thinkbar');

const THINK_TIME = 3100; // ms of thinking animation before the computer plays
const THINKING_MSGS = [
  'Stirring the lava…',
  'Reading the position…',
  'Weighing every option…',
  'Pondering a sacrifice…',
  'Counting escape squares…',
  'Consulting the lava lamp…',
  'Buffering brilliance…',
  'Simulating 12,400 games…',
];

let st = initialState();
let selected = null; // { r, c }
let targets = null;  // legal moves from the selected piece
let thinking = false;
let thinkTimers = null; // { msg: interval, move: timeout }

function render() {
  boardEl.innerHTML = '';
  const checkSq = !st.over && inCheck(st.board, st.turn) ? findKing(st.board, st.turn) : null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;
      if (c === 0) {
        const rk = document.createElement('span');
        rk.className = 'coord rank';
        rk.textContent = String(8 - r);
        sq.appendChild(rk);
      }
      if (r === 7) {
        const fl = document.createElement('span');
        fl.className = 'coord file';
        fl.textContent = FILES[c];
        sq.appendChild(fl);
      }
      const p = st.board[r][c];
      if (p) {
        const img = document.createElement('img');
        img.src = `assets/pieces/${p.c}${p.t}.svg`;
        img.className = 'piece ' + p.c;
        img.alt = (p.c === 'w' ? 'White ' : 'Black ') + p.t.toUpperCase();
        img.draggable = false;
        sq.appendChild(img);
      }
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (checkSq && checkSq[0] === r && checkSq[1] === c) sq.classList.add('in-check');
      if (targets) {
        const t = targets.find((m) => m.to[0] === r && m.to[1] === c);
        if (t) sq.classList.add(p ? 'hint-capture' : 'hint');
      }
      boardEl.appendChild(sq);
    }
  }
}

// ---------- Move animation (click & computer moves) ----------

const MOVE_ANIM_MS = 240;
let animating = false;
let animCount = 0;
const activeAnims = new Set();

function playAnim(el, keyframes, options, onDone) {
  animCount++;
  animating = true;
  const a = el.animate(keyframes, options);
  activeAnims.add(a);
  const settle = () => {
    if (!activeAnims.has(a)) return;
    activeAnims.delete(a);
    animCount = Math.max(0, animCount - 1);
    if (!animCount) animating = false;
    if (onDone) onDone();
  };
  a.onfinish = settle;
  a.oncancel = settle;
  return a;
}

function cancelAnimations() {
  const anims = [...activeAnims];
  activeAnims.clear();
  for (const a of anims) a.cancel();
  animCount = 0;
  animating = false;
  document.querySelectorAll('.piece-fade').forEach((el) => el.remove());
}

function animatePieceTo(from, to, pawnSrc = null) {
  const toSq = boardEl.children[to[0] * 8 + to[1]];
  const el = toSq.querySelector('.piece');
  if (!el) return;
  const rect = toSq.getBoundingClientRect();
  const dx = (to[1] - from[1]) * rect.width;
  const dy = (to[0] - from[0]) * rect.height;
  toSq.style.zIndex = 2;
  const a = playAnim(
    el,
    [{ transform: `translate(${-dx}px, ${-dy}px)` }, { transform: 'translate(0, 0)' }],
    { duration: MOVE_ANIM_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    () => { toSq.style.zIndex = ''; }
  );
  if (pawnSrc) {
    // Show the pawn during the flight, swap to the promoted piece on arrival.
    const src = el.src;
    el.src = pawnSrc;
    a.finished.then(() => { el.src = src; }).catch(() => {});
  }
}

function fadeCapturedPiece(sq, color, t) {
  const cell = boardEl.children[sq[0] * 8 + sq[1]];
  const rect = cell.getBoundingClientRect();
  const ghost = document.createElement('img');
  ghost.src = `assets/pieces/${color}${t}.svg`;
  ghost.className = 'piece-fade';
  ghost.alt = '';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  document.body.appendChild(ghost);
  playAnim(
    ghost,
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.85)' }],
    { duration: 200, easing: 'ease-out' },
    () => ghost.remove()
  );
}

// Snapshot of what a move will capture/promote; must be taken before makeMove().
function captureCtx(m) {
  const color = st.board[m.from[0]][m.from[1]].c;
  let cap = null;
  if (m.kind === 'ep') {
    cap = { t: 'p', c: opp(color), sq: [m.from[0], m.to[1]] };
  } else {
    const p = st.board[m.to[0]][m.to[1]];
    if (p && p.c !== color) cap = { t: p.t, c: p.c, sq: m.to };
  }
  return { cap, promo: !!m.promo, color };
}

function animateMove(m, ctx) {
  if (ctx.cap) fadeCapturedPiece(ctx.cap.sq, ctx.cap.c, ctx.cap.t);
  // Land the sound as the piece arrives (~MOVE_ANIM_MS in).
  if (window.SFX) window.SFX.play(ctx.cap ? 'capture' : 'move', MOVE_ANIM_MS);
  const pawnSrc = ctx.promo ? `assets/pieces/${ctx.color}p.svg` : null;
  animatePieceTo(m.from, m.to, pawnSrc);
  if (m.kind === 'castle-k') animatePieceTo([m.to[0], 7], [m.to[0], 5]);
  else if (m.kind === 'castle-q') animatePieceTo([m.to[0], 0], [m.to[0], 3]);
}

function updateStatus() {
  if (st.over) {
    statusEl.textContent =
      st.result === 'draw' ? 'Stalemate — draw.'
      : st.result === 'win' ? 'Checkmate — you win!'
      : 'Checkmate — the computer wins.';
    return;
  }
  if (st.turn === 'w') {
    statusEl.textContent = inCheck(st.board, 'w') ? 'Check! Your move (White).' : 'Your move (White).';
  }
  // Black's turn: startThinking() owns the status line.
}

function startThinking() {
  thinking = true;
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const msg = document.createElement('span');
  msg.className = 'think-msg';
  msg.textContent = THINKING_MSGS[0];
  statusEl.textContent = '';
  statusEl.append(spinner, msg);
  thinkbarEl.classList.remove('loading');
  requestAnimationFrame(() => requestAnimationFrame(() => thinkbarEl.classList.add('loading')));
  let i = 0;
  thinkTimers = {
    msg: setInterval(() => {
      i = (i + 1) % THINKING_MSGS.length;
      msg.classList.add('fading');
      setTimeout(() => {
        msg.textContent = THINKING_MSGS[i];
        msg.classList.remove('fading');
      }, 200);
    }, 900),
    move: setTimeout(finishAiTurn, THINK_TIME),
  };
}

function stopThinking() {
  if (thinkTimers) {
    clearInterval(thinkTimers.msg);
    clearTimeout(thinkTimers.move);
    thinkTimers = null;
  }
  thinking = false;
  thinkbarEl.classList.remove('loading');
}

function finishAiTurn() {
  stopThinking();
  const am = aiMove(st);
  const ctx = am ? captureCtx(am) : null;
  if (am) makeMove(st, am);
  checkGameEnd(st);
  if (st.over && st.result !== 'draw') {
    if (window.SFX) window.SFX.play('checkmate', MOVE_ANIM_MS);
    if (window.Confetti) window.Confetti.celebrate(MOVE_ANIM_MS);
  }
  updateStatus();
  render();
  if (am) animateMove(am, ctx);
}

function doPlayerMove(m, animate = true) {
  const ctx = animate ? captureCtx(m) : null;
  makeMove(st, m);
  selected = null;
  targets = null;
  checkGameEnd(st);
  if (st.over && st.result !== 'draw') {
    if (window.SFX) window.SFX.play('checkmate', animate ? MOVE_ANIM_MS : 0);
    if (window.Confetti) window.Confetti.celebrate(animate ? MOVE_ANIM_MS : 0);
  }
  if (!st.over) startThinking();
  updateStatus();
  render();
  if (animate) animateMove(m, ctx);
}

boardEl.addEventListener('click', (e) => {
  if (st.over || thinking || animating || st.turn !== 'w') return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  const r = Number(sq.dataset.r);
  const c = Number(sq.dataset.c);
  const p = st.board[r][c];
  if (selected) {
    const m = targets.find((m) => m.to[0] === r && m.to[1] === c);
    if (m) {
      doPlayerMove(m);
      return;
    }
  }
  if (p && p.c === 'w') {
    selected = { r, c };
    targets = legalMoves(st, 'w').filter((m) => m.from[0] === r && m.from[1] === c);
  } else {
    selected = null;
    targets = null;
  }
  render();
});

// ---------- Drag & drop (pointer events; mouse + touch) ----------

const DRAG_THRESHOLD = 5; // px of movement before a press counts as a drag

let drag = null; // { r, c, x, y, pointerId, started, ghost, size, originSq, hover }

function squareAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.square') : null;
}

function moveGhost(d, x, y) {
  if (d.ghost) {
    d.ghost.style.left = x - d.size / 2 + 'px';
    d.ghost.style.top = y - d.size / 2 + 'px';
  }
}

function updateDragHover(d, x, y) {
  const sq = squareAt(x, y);
  if (d.hover === sq) return;
  if (d.hover) d.hover.classList.remove('drop-ok', 'drop-bad');
  d.hover = sq;
  if (sq) {
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);
    const ok = targets.some((t) => t.to[0] === r && t.to[1] === c);
    sq.classList.add(ok ? 'drop-ok' : 'drop-bad');
  }
}

function clearDragVisuals(d) {
  if (d.ghost) d.ghost.remove();
  if (d.originSq) d.originSq.classList.remove('drag-origin');
  if (d.hover) d.hover.classList.remove('drop-ok', 'drop-bad');
  boardEl.classList.remove('dragging');
}

function beginDrag(d, x, y) {
  d.started = true;
  const sq = squareAt(x, y) || d.originSq;
  d.originSq = sq;
  d.size = sq.getBoundingClientRect().width;
  const src = sq.querySelector('.piece');
  if (src) {
    d.ghost = document.createElement('img');
    d.ghost.src = src.src;
    d.ghost.className = 'piece-ghost';
    d.ghost.alt = '';
    d.ghost.style.width = d.size + 'px';
    d.ghost.style.height = d.size + 'px';
    document.body.appendChild(d.ghost);
  }
  sq.classList.add('drag-origin');
  boardEl.classList.add('dragging');
  moveGhost(d, x, y);
  updateDragHover(d, x, y);
}

boardEl.addEventListener('pointerdown', (e) => {
  if (st.over || thinking || animating || st.turn !== 'w') return;
  if (drag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  const r = Number(sq.dataset.r);
  const c = Number(sq.dataset.c);
  const p = st.board[r][c];
  if (!p || p.c !== 'w') return;
  // Select the piece, same as a click.
  selected = { r, c };
  targets = legalMoves(st, 'w').filter((t) => t.from[0] === r && t.from[1] === c);
  render(); // show selection + move hints while the pointer is held down
  drag = { r, c, x: e.clientX, y: e.clientY, pointerId: e.pointerId, started: false, ghost: null, size: 0, originSq: boardEl.children[r * 8 + c], hover: null };
  e.preventDefault(); // suppresses the compatibility click
  boardEl.setPointerCapture(e.pointerId);
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const d = drag;
  if (!d.started) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
    beginDrag(d, e.clientX, e.clientY);
  }
  moveGhost(d, e.clientX, e.clientY);
  updateDragHover(d, e.clientX, e.clientY);
});

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  try { boardEl.releasePointerCapture(d.pointerId); } catch (_) {}
  clearDragVisuals(d);
  if (d.started) {
    const sq = squareAt(e.clientX, e.clientY);
    if (sq) {
      const r = Number(sq.dataset.r);
      const c = Number(sq.dataset.c);
      const m = targets ? targets.find((t) => t.to[0] === r && t.to[1] === c) : null;
      if (m) {
        if (window.SFX) window.SFX.play(captureCtx(m).cap ? 'capture' : 'move', 0);
        doPlayerMove(m, false);
        return;
      }
    }
  }
  // Dropped on an invalid square (or a tap with no move): keep the piece selected.
  render();
}

boardEl.addEventListener('pointerup', endDrag);
boardEl.addEventListener('pointercancel', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  clearDragVisuals(d);
  render();
});

newGameBtn.addEventListener('click', () => {
  stopThinking();
  cancelAnimations();
  st = initialState();
  selected = null;
  targets = null;
  updateStatus();
  render();
});

updateStatus();
render();
