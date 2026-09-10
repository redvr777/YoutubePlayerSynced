// Sync Deck server
// Serves the player page and keeps every connected browser (phone, laptop,
// a friend across the world - anyone with the link) in sync over WebSocket.
//
// Run:   npm install && npm start
// Then open http://localhost:3000 on this machine, and share your public
// address (see README.md) with anyone you want to be able to add/control
// the queue.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// The single shared room's authoritative state, held in server memory.
// Restart the server = fresh empty queue. (See README for optional persistence.)
let state = {
  queue: [],          // [{ videoId, title }]
  currentIndex: -1,
  isPlaying: false,
  position: 0,
  ts: Date.now(),
  device: null
};

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  // Send the current authoritative state to the newly connected client.
  ws.send(JSON.stringify({ type: 'state', state }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return; // ignore malformed messages
    }

    if (msg.type === 'update' && msg.state && typeof msg.state === 'object') {
      // Merge the incoming partial/full state into the server's authoritative copy.
      // Basic shape validation so a bad client can't corrupt the room.
      const incoming = msg.state;
      const next = { ...state };

      if (Array.isArray(incoming.queue)) {
        next.queue = incoming.queue
          .filter((it) => it && typeof it.videoId === 'string')
          .slice(0, 500) // sane upper bound
          .map((it) => ({
            videoId: String(it.videoId).slice(0, 20),
            title: String(it.title || 'YouTube video').slice(0, 300)
          }));
      }
      if (typeof incoming.currentIndex === 'number') next.currentIndex = incoming.currentIndex;
      if (typeof incoming.isPlaying === 'boolean') next.isPlaying = incoming.isPlaying;
      if (typeof incoming.position === 'number') next.position = incoming.position;

      next.ts = Date.now(); // server clock is authoritative, avoids client clock skew
      next.device = typeof incoming.device === 'string' ? incoming.device : null;

      state = next;
      broadcast({ type: 'state', state });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Sync Deck running at http://localhost:${PORT}`);
});
