const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const GRID = 30;
const TICK = 140;
let players = {};
let food = spawnFood();
let loop = null;

function spawnFood() {
  return { x: Math.floor(Math.random()*GRID), y: Math.floor(Math.random()*GRID) };
}
function randomColor() {
  const c = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c'];
  return c[Math.floor(Math.random()*c.length)];
}
function createPlayer(id, name) {
  const sx = Math.floor(Math.random()*(GRID-8))+3;
  const sy = Math.floor(Math.random()*(GRID-4))+2;
  const body = [];
  for (let i=0;i<3;i++) body.push({x:sx-i,y:sy});
  return { id, name, body, dir:{x:1,y:0}, next:{x:1,y:0}, alive:true, color:randomColor(), score:0 };
}

function tick() {
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    if (p.next.x !== -p.dir.x || p.next.y !== -p.dir.y) p.dir = p.next;
  }
  const heads = {};
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    heads[id] = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };
  }
  const dead = new Set();
  for (const id in heads) {
    const nh = heads[id];
    if (nh.x<0||nh.x>=GRID||nh.y<0||nh.y>=GRID) { dead.add(id); continue; }
    for (const oid in players) {
      const o = players[oid];
      if (!o.alive) continue;
      for (const seg of o.body.slice(0, o.body.length-1)) {
        if (seg.x===nh.x && seg.y===nh.y) { dead.add(id); break; }
      }
      if (dead.has(id)) break;
    }
    for (const oid in heads) {
      if (oid!==id && heads[oid].x===nh.x && heads[oid].y===nh.y) dead.add(id);
    }
  }
  for (const id of dead) if (players[id]) players[id].alive = false;

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const nh = heads[id];
    p.body.unshift(nh);
    if (nh.x===food.x && nh.y===food.y) { p.score += 10; food = spawnFood(); }
    else p.body.pop();
  }

  io.emit('state', {
    players: Object.values(players).map(p => ({
      id: p.id, name: p.name, body: p.body, alive: p.alive,
      color: p.color, score: p.score
    })),
    food, gridSize: GRID
  });

  const aliveList = Object.values(players).filter(p => p.alive);
  const total = Object.values(players);
  if (total.length >= 2 && aliveList.length <= 1) {
    clearInterval(loop); loop = null;
    const winner = aliveList[0] ? aliveList[0].name : 'Personne';
    io.emit('gameOver', { winner });
    setTimeout(() => {
      players = {};
      food = spawnFood();
      io.emit('waiting');
    }, 6000);
  }
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    const name = (data && data.name) ? String(data.name).slice(0,12) : 'Joueur';
    players[socket.id] = createPlayer(socket.id, name);
    socket.emit('joined', { id: socket.id });
    if (!loop) setTimeout(() => { if (!loop && Object.keys(players).length>=1) loop = setInterval(tick, TICK); }, 400);
  });
  socket.on('direction', (dir) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    const map = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
    if (map[dir]) p.next = map[dir];
  });
  socket.on('disconnect', () => { delete players[socket.id]; });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🐍 Snake Arena port ' + PORT));
