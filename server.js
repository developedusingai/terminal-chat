const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// rooms: Map<roomCode, Set<{ ws, userId }>>
const rooms = new Map();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'init') {
      userId = msg.userId;
    }

    else if (msg.type === 'create') {
      let roomCode;
      do { roomCode = generateCode(); } while (rooms.has(roomCode));

      rooms.set(roomCode, new Set());
      currentRoom = roomCode;
      rooms.get(roomCode).add({ ws, userId });

      ws.send(JSON.stringify({ type: 'created', roomCode }));
    }

    else if (msg.type === 'join') {
      const { roomCode } = msg;
      if (!rooms.has(roomCode)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check the code and try again.' }));
        return;
      }

      currentRoom = roomCode;
      rooms.get(roomCode).add({ ws, userId });

      // notify others
      broadcast(currentRoom, ws, { type: 'system', message: `${userId} joined the room.` });

      ws.send(JSON.stringify({ type: 'joined', roomCode }));
    }

    else if (msg.type === 'message') {
      if (!currentRoom || !rooms.has(currentRoom)) return;

      const payload = { type: 'message', userId, text: msg.text };
      rooms.get(currentRoom).forEach(({ ws: client }) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    }
  });

  ws.on('close', () => {
    if (!currentRoom || !rooms.has(currentRoom)) return;

    const room = rooms.get(currentRoom);
    room.forEach((client) => { if (client.ws === ws) room.delete(client); });

    if (room.size === 0) {
      rooms.delete(currentRoom);
    } else {
      broadcast(currentRoom, null, { type: 'system', message: `${userId} left the room.` });
    }
  });
});

function broadcast(roomCode, exclude, payload) {
  if (!rooms.has(roomCode)) return;
  const data = JSON.stringify(payload);
  rooms.get(roomCode).forEach(({ ws }) => {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Terminal running → http://localhost:${PORT}`));
