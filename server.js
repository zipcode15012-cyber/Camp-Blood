// Camp Blood — server.js
// Run: node server.js
// Requires: npm install ws

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = 3000;

// ── HTTP server: serve the HTML file ─────────────────────────────────
const httpServer = http.createServer((req, res) => {
  // serve any .html file from the same directory
  let filePath = path.join(__dirname, req.url === '/' ? 'camp-blood-multiplayer.html' : req.url.slice(1));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
    } else {
      const ext = path.extname(filePath);
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

// ── WebSocket server ──────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// ── State ─────────────────────────────────────────────────────────────
const rooms = {}; // roomCode → Room

function makeId(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

function Room(code) {
  return {
    code,
    players: {},   // id → player
    hostId: null,
    claimedKillerId: null,
    phase: 'lobby', // 'lobby' | 'class_select' | 'game' | 'post'
    classUnlockTimer: null,
  };
}

function Player(id, ws, name) {
  return {
    id, ws, name,
    class: null, role: null,
    locked: false,
    readyInLobby: false,
    hitState: 0,
    isGA: false, gaTarget: null,
    x: 0, y: 0, z: 0, yaw: 0,
    escaped: false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj, exceptId) {
  Object.values(room.players).forEach(p => {
    if (p.id !== exceptId) send(p.ws, obj);
  });
}

function broadcastAll(room, obj) {
  Object.values(room.players).forEach(p => send(p.ws, obj));
}

function playerList(room) {
  return Object.values(room.players).map(p => ({
    id: p.id, name: p.name, class: p.class, role: p.role,
    locked: p.locked, readyInLobby: p.readyInLobby, hitState: p.hitState,
    isGA: p.isGA, gaTarget: p.gaTarget, escaped: p.escaped,
  }));
}

function assignHost(room) {
  const ids = Object.keys(room.players);
  if (ids.length === 0) return;
  room.hostId = ids[0];
  send(room.players[ids[0]].ws, { t: 'host_transfer' });
}

// Spawn positions for up to 5 players (well spread)
const SPAWN_POINTS = [
  { x:  0, z:  0 },
  { x: 15, z: 10 },
  { x:-15, z: 10 },
  { x:  8, z:-18 },
  { x:-8,  z:-18 },
];

function killerSpawn() { return { x: 0, z: 40 }; }

// ── Connection handler ────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let myId = null;
  let myRoomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const t = msg.t;

    // ── JOIN ──────────────────────────────────────────────────────────
    if (t === 'join') {
      const name = (msg.name || 'Player').slice(0, 20);
      let roomCode = (msg.room || '').toUpperCase().trim();

      // Find or create room
      let room;
      if (roomCode && rooms[roomCode]) {
        room = rooms[roomCode];
        if (room.phase !== 'lobby') {
          send(ws, { t: 'error', msg: 'Game already in progress' });
          return;
        }
        if (Object.keys(room.players).length >= 5) {
          send(ws, { t: 'error', msg: 'Room is full (5/5)' });
          return;
        }
      } else {
        // Create new room
        roomCode = makeId(4);
        while (rooms[roomCode]) roomCode = makeId(4);
        room = Room(roomCode);
        rooms[roomCode] = room;
      }

      myId = makeId(8);
      myRoomCode = roomCode;
      const player = Player(myId, ws, name);
      room.players[myId] = player;

      const isHost = Object.keys(room.players).length === 1;
      if (isHost) room.hostId = myId;

      // Confirm join to this client
      send(ws, {
        t: 'joined',
        id: myId,
        room: roomCode,
        isHost,
        players: playerList(room),
        claimedKillerId: room.claimedKillerId,
      });

      // Notify others
      broadcast(room, { t: 'player_join', id: myId, name }, myId);
      return;
    }

    // All subsequent messages need a valid room/player
    const room = myRoomCode && rooms[myRoomCode];
    const player = room && room.players[myId];
    if (!room || !player) return;

    // ── READY ─────────────────────────────────────────────────────────
    if (t === 'ready') {
      player.readyInLobby = !player.readyInLobby;
      broadcastAll(room, { t: 'player_lobby_ready', id: myId, ready: player.readyInLobby });
      return;
    }

    // ── CLAIM KILLER ──────────────────────────────────────────────────
    if (t === 'claim_killer') {
      if (room.claimedKillerId) {
        send(ws, { t: 'error', msg: 'Killer already claimed' });
        return;
      }
      room.claimedKillerId = myId;
      broadcastAll(room, { t: 'killer_claimed', claimerId: myId, claimerName: player.name });
      return;
    }

    if (t === 'unclaim_killer') {
      if (room.claimedKillerId === myId) {
        room.claimedKillerId = null;
        broadcastAll(room, { t: 'killer_unclaimed' });
      }
      return;
    }

    // ── START (host only) ─────────────────────────────────────────────
    if (t === 'start') {
      if (myId !== room.hostId) {
        send(ws, { t: 'error', msg: 'Only the host can start' });
        return;
      }
      if (Object.keys(room.players).length < 2) {
        send(ws, { t: 'error', msg: 'Need at least 2 players' });
        return;
      }

      room.phase = 'class_select';

      // Assign roles
      const ids = Object.keys(room.players);
      const killerId = room.claimedKillerId && room.players[room.claimedKillerId]
        ? room.claimedKillerId
        : ids[Math.floor(Math.random() * ids.length)];

      const roles = {};
      ids.forEach(id => {
        room.players[id].role = (id === killerId) ? 'killer' : 'survivor';
        roles[id] = room.players[id].role;
      });

      broadcastAll(room, { t: 'class_select', roles });
      return;
    }

    // ── CLASS SELECTION ───────────────────────────────────────────────
    if (t === 'class') {
      player.class = msg.class;
      broadcastAll(room, { t: 'class_update', id: myId, class: player.class });
      return;
    }

    if (t === 'lockin') {
      if (!player.class) {
        send(ws, { t: 'error', msg: 'Pick a class first' });
        return;
      }
      player.locked = true;
      broadcastAll(room, { t: 'player_locked', id: myId });

      // If everyone locked in, start the game
      const allLocked = Object.values(room.players).every(p => p.locked);
      if (allLocked) {
        startGame(room);
      }
      return;
    }

    // ── IN-GAME MESSAGES ──────────────────────────────────────────────
    if (t === 'state') {
      // Update stored position
      player.x = msg.x || 0;
      player.y = msg.y || 0;
      player.z = msg.z || 0;
      player.yaw = msg.yaw || 0;
      // Relay to all others
      broadcast(room, { t: 'state', id: myId, x: player.x, y: player.y, z: player.z,
        yaw: player.yaw, moving: msg.moving, hitState: player.hitState }, myId);
      return;
    }

    if (t === 'hit') {
      const victim = room.players[msg.victimId];
      if (!victim) return;
      const newState = Math.min((victim.hitState || 0) + 1, 3);
      victim.hitState = newState;
      broadcastAll(room, { t: 'hit', victimId: msg.victimId, attackerId: myId,
        newState, recovered: false });
      if (newState >= 3) {
        broadcastAll(room, { t: 'player_dead', id: msg.victimId });
        checkLastSurvivor(room);
      }
      // Apply attack cooldown to killer
      send(ws, { t: 'killer_cd', duration: 4 });
      return;
    }

    if (t === 'heal') {
      const target = room.players[msg.targetId];
      if (!target) return;
      const newState = Math.max((target.hitState || 0) - 1, 0);
      target.hitState = newState;
      broadcastAll(room, { t: 'healed', targetId: msg.targetId, newState });
      return;
    }

    if (t === 'escape') {
      player.escaped = true;
      player.hitState = 4;
      broadcastAll(room, { t: 'escaped', id: myId, name: player.name });
      checkGameOver(room);
      return;
    }

    if (t === 'item_found') {
      broadcastAll(room, { t: 'item_found', itemId: msg.itemId, finderId: myId });
      return;
    }

    if (t === 'ability_used') {
      broadcast(room, { t: 'ability_used', id: myId, ability: msg.ability, data: msg.data || {} }, myId);
      return;
    }

    if (t === 'stun') {
      broadcast(room, { t: 'stun', killerId: msg.killerId, duration: msg.duration || 5, blind: msg.blind }, myId);
      return;
    }

    if (t === 'chat') {
      const text = (msg.text || '').slice(0, 80);
      broadcastAll(room, { t: 'chat', id: myId, name: player.name, text });
      return;
    }

    if (t === 'ga_update') {
      player.gaTarget = msg.targetId;
      broadcastAll(room, { t: 'ga_update', gaId: myId, targetId: msg.targetId });
      return;
    }

    if (t === 'ga_block') {
      broadcastAll(room, { t: 'ga_block', gaId: myId });
      // Undo the kill — restore victim hitState
      const victim = room.players[msg.victimId];
      if (victim) { victim.hitState = Math.max(0, victim.hitState - 1); }
      return;
    }
  });

  ws.on('close', () => {
    const room = myRoomCode && rooms[myRoomCode];
    if (!room || !myId) return;
    const player = room.players[myId];
    const name = player ? player.name : '?';
    delete room.players[myId];

    if (Object.keys(room.players).length === 0) {
      // Clean up empty room
      if (room.classUnlockTimer) clearTimeout(room.classUnlockTimer);
      delete rooms[myRoomCode];
      return;
    }

    // Transfer host if needed
    if (room.hostId === myId) assignHost(room);
    if (room.claimedKillerId === myId) {
      room.claimedKillerId = null;
      broadcastAll(room, { t: 'killer_unclaimed' });
    }

    broadcast(room, { t: 'player_leave', id: myId, name });

    if (room.phase === 'game') checkGameOver(room);
  });
});

// ── Game start ────────────────────────────────────────────────────────
function startGame(room) {
  room.phase = 'game';

  const ids = Object.keys(room.players);
  const roles = {};
  const classes = {};
  const spawns = {};

  let survivorIdx = 0;
  ids.forEach(id => {
    const p = room.players[id];
    roles[id] = p.role;
    classes[id] = p.class;
    if (p.role === 'killer') {
      spawns[id] = killerSpawn();
    } else {
      spawns[id] = SPAWN_POINTS[survivorIdx % SPAWN_POINTS.length];
      survivorIdx++;
    }
  });

  broadcastAll(room, { t: 'start', roles, classes, spawns });

  // Schedule class unlock after 210 seconds
  room.classUnlockTimer = setTimeout(() => {
    if (room.phase === 'game') {
      broadcastAll(room, { t: 'class_unlock' });
    }
  }, 210000);
}

// ── Game-over checks ──────────────────────────────────────────────────
function checkLastSurvivor(room) {
  const survivors = Object.values(room.players).filter(p => p.role === 'survivor' && p.hitState < 3 && !p.escaped);
  if (survivors.length === 1) {
    broadcastAll(room, { t: 'last_survivor', id: survivors[0].id });
  } else if (survivors.length === 0) {
    endGame(room, 'killer');
  }
}

function checkGameOver(room) {
  const survivors = Object.values(room.players).filter(p => p.role === 'survivor');
  const escaped   = survivors.filter(p => p.escaped);
  const dead      = survivors.filter(p => p.hitState >= 3);

  if (escaped.length > 0 && escaped.length + dead.length === survivors.length) {
    endGame(room, 'survivors');
  } else if (dead.length === survivors.length && survivors.length > 0) {
    endGame(room, 'killer');
  }
}

function endGame(room, winner) {
  if (room.phase !== 'game') return;
  room.phase = 'post';
  if (room.classUnlockTimer) { clearTimeout(room.classUnlockTimer); room.classUnlockTimer = null; }

  // Build basic stats
  const stats = Object.values(room.players).map(p => ({
    id: p.id, name: p.name, role: p.role, class: p.class,
    escaped: p.escaped, hitState: p.hitState,
  }));

  broadcastAll(room, { t: 'game_over', winner, stats });

  // Reset room back to lobby after 30s
  setTimeout(() => resetRoom(room), 30000);
}

function resetRoom(room) {
  room.phase = 'lobby';
  room.claimedKillerId = null;
  const ids = Object.keys(room.players);
  Object.values(room.players).forEach(p => {
    p.class = null; p.role = null; p.locked = false;
    p.readyInLobby = false; p.hitState = 0;
    p.isGA = false; p.gaTarget = null; p.escaped = false;
  });
  broadcastAll(room, {
    t: 'back_to_lobby',
    code: room.code,
    hostId: room.hostId,
    players: playerList(room),
  });
}

// ── Start listening ───────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Camp Blood server running at http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}`);
});
