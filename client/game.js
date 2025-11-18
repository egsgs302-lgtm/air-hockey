const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const copyBtn = document.getElementById('copyBtn');
const codeInput = document.getElementById('codeInput');

const W = canvas.width, H = canvas.height;
const state = {
  connected: false,
  started: false,
  code: null,
  me: { x: W/8, y: H/2, r: 24, color: '#fca311' },
  opp: { x: 7*W/8, y: H/2, r: 24, color: '#e5e5e5' },
  puck: { x: W/2, y: H/2, r: 14, vx: 0, vy: 0, color: '#00d1ff' },
  input: { x: W/8, y: H/2 },
  score: { me: 0, opp: 0 },
  lastTs: 0
};

let ws;

// UI events
createBtn.addEventListener('click', () => {
  ensureWS();
  ws.send(JSON.stringify({ t: 'create' }));
});
joinBtn.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  ensureWS();
  ws.send(JSON.stringify({ t: 'join', code }));
});
copyBtn.addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    statusEl.textContent = `Code ${code} copied!`;
  });
});

// Connect WebSocket
function ensureWS() {
  if (ws && ws.readyState === 1) return;
  ws = new WebSocket(window.SERVER_URL);
  ws.onopen = () => { statusEl.textContent = 'Connected'; state.connected = true; };
  ws.onclose = () => { statusEl.textContent = 'Disconnected'; state.connected = false; state.started = false; };
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.t === 'created') {
      state.code = msg.code;
      statusEl.textContent = `Share code: ${state.code}`;
      codeInput.value = state.code;
    } else if (msg.t === 'start') {
      state.started = true;
      statusEl.textContent = `Match started (${state.code || codeInput.value})`;
      resetPuck();
    } else if (msg.t === 'error') {
      statusEl.textContent = `Error: ${msg.message}`;
    } else if (msg.t === 'move') {
      if (typeof msg.ox === 'number') { state.opp.x = msg.ox; state.opp.y = msg.oy; }
      if (msg.px != null) {
        state.puck.x = lerp(state.puck.x, msg.px, 0.3);
        state.puck.y = lerp(state.puck.y, msg.py, 0.3);
        state.puck.vx = lerp(state.puck.vx, msg.pvx ?? state.puck.vx, 0.3);
        state.puck.vy = lerp(state.puck.vy, msg.pvy ?? state.puck.vy, 0.3);
      }
    } else if (msg.t === 'score') {
      if (msg.who === 'me') state.score.opp++;
      else state.score.me++;
      scoreEl.textContent = `${state.score.me} : ${state.score.opp}`;
      resetPuck();
    }
  };
}

// Input
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  state.input.x = e.clientX - r.left;
  state.input.y = e.clientY - r.top;
});
canvas.addEventListener('touchmove', e => {
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  state.input.x = t.clientX - r.left;
  state.input.y = t.clientY - r.top;
}, { passive: true });

function clampMallet(p, leftHalf = true) {
  const minX = p.r, maxX = leftHalf ? W/2 - p.r : W - p.r;
  const minY = p.r, maxY = H - p.r;
  p.x = Math.max(minX, Math.min(maxX, p.x));
  p.y = Math.max(minY, Math.min(maxY, p.y));
}

const F = { friction: 0.995, wallE: 0.98, hitE: 0.95, malletMass: 2.5, puckMass: 1.0 };
const goalH = 80;

function collideMallet(m, puck) {
  const dx = puck.x - m.x, dy = puck.y - m.y;
  const dist = Math.hypot(dx, dy), minDist = m.r + puck.r;
  if (dist < minDist && dist > 0) {
    const nx = dx / dist, ny = dy / dist;
    const overlap = minDist - dist;
    puck.x += nx * overlap;
    puck.y += ny * overlap;
    const relV = puck.vx * nx + puck.vy * ny;
    const J = (-(1 + F.hitE) * relV) / (1/F.puckMass + 1/F.malletMass);
    puck.vx += (J * nx) / F.puckMass;
    puck.vy += (J * ny) / F.puckMass;
  }
}

function handleWalls(p) {
  if (p.x - p.r < 0) { p.x = p.r; p.vx = -p.vx * F.wallE; }
  if (p.x + p.r > W) { p.x = W - p.r; p.vx = -p.vx * F.wallE; }
  if (p.y - p.r < 0) { p.y = p.r; p.vy = -p.vy * F.wallE; }
  if (p.y + p.r > H) { p.y = H - p.r; p.vy = -p.vy * F.wallE; }

  const inLeftGoal = (p.x - p.r <= 0) && Math.abs(p.y - H/2) < goalH/2;
  const inRightGoal = (p.x + p.r >= W) && Math.abs(p.y - H/2) < goalH/2;
  if (inLeftGoal) score('me');
  if (inRightGoal) score('opp');
}

function score(who) {
  if (who === 'me') state.score.me++;
  else state.score.opp++;
  scoreEl.textContent = `${state.score.me} : ${state.score.opp}`;
  resetPuck();

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ t: 'score', who }));
  }
}

function resetPuck() {
  state.puck.x = W/2; state.puck.y = H/2;
  state.puck.vx = 0; state.puck.vy = 0;
}

function draw() {
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = '#e0e1dd55'; ctx.setLineDash([12,8]);
  ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#e0e1dd';
  ctx.strokeRect(0, H/2 - goalH/2, 4, goalH);
  ctx.strokeRect(W-4, H/2 - goalH/2, 4, goalH);
  circle(state.puck.x, state.puck.y, state.puck.r, state.puck.color);
  circle(state.me.x, state.me.y, state.me.r, state.me.color);
  circle(state.opp.x, state.opp.y, state.opp.r, state.opp.color);
}

function circle(x,y,r,fill){ ctx.fillStyle=fill; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function lerp(a,b,t){ return a + (b - a) * t; }

function tick(ts) {
  const dt = Math.min(32, ts - (state.lastTs || ts)) / 16.666;
  state.lastTs = ts;

  state.me.x += (state.input.x - state.me.x) * 0.35;
  state.me.y += (state.input.y - state.me.y) * 0.35;
  clampMallet(state.me, true);
  clampMallet(state.opp, false);

  state.puck.x += state.puck.vx
