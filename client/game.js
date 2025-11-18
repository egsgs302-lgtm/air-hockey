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

  state.puck.x += state.puck.vx;
  state.puck.y += state.puck.vy;
  state.puck.vx *= F.friction;
  state.puck.vy *= F.friction;

  collideMallet(state.me, state.puck);
  collideMallet(state.opp, state.puck);
  handleWalls(state.puck);

  if (state.connected && state.started && ws.readyState === 1) {
    ws.send(JSON.stringify({
      t: 'move',
      ox: state.me.x, oy: state.me.y,
      px: state.puck.x, py: state.puck.y,
      pvx: state.puck.vx, pvy: state.puck.vy
    }));
  }

  draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
