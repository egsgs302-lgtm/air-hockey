// server/server.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();

// Simple health route (Render expects HTTP responses)
app.get('/', (_req, res) => res.send('Air Hockey Relay OK'));
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 8080;

// In-memory sessions: code -> [ws1, ws2]
const sessions = new Map();

// Generate short share code
function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase(); // e.g. A1B2C
}

// Relay to the other player in session
function relayToPeer(code, fromWs, msg) {
  const s = sessions.get(code);
  if (!s) return;
  for (const p of s) {
    if (p !== fromWs && p.readyState === 1) {
      p.send(JSON.stringify(msg));
    }
  }
}

wss.on('connection', ws => {
  let code = null;

  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // Create a new session with single player
    if (msg.t === 'create') {
      code = generateCode();
      sessions.set(code, [ws]);
      ws.send(JSON.stringify({ t: 'created', code }));
      return;
    }

    // Join existing session (second player)
    if (msg.t === 'join') {
      code = String(msg.code || '').toUpperCase();
      const s = sessions.get(code);
      if (!s || s.length !== 1) {
        ws.send(JSON.stringify({ t: 'error', message: 'Invalid or full code' }));
        code = null;
        return;
      }
      s.push(ws);
      // Notify both players that match started
      s.forEach(p => p.send(JSON.stringify({ t: 'start' })));
      return;
    }

    // Relay movement/puck snapshot
    if (msg.t === 'move' && code) {
      relayToPeer(code, ws, msg);
      return;
    }

    // Relay score events
    if (msg.t === 'score' && code) {
      relayToPeer(code, ws, msg);
      return;
    }
  });

  ws.on('close', () => {
    if (!code) return;
    const s = sessions.get(code);
    if (!s) return;
    // Notify remaining peer (optional)
    s.forEach(p => {
      if (p !== ws && p.readyState === 1) {
        p.send(JSON.stringify({ t: 'error', message: 'Peer disconnected' }));
      }
    });
    sessions.delete(code); // Destroy ephemeral session
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

