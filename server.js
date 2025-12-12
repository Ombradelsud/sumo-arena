const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// CONFIGURAZIONE
const GAME_SPEED = 1000 / 60; 
const BASE_ARENA_RADIUS = 2000; 
const SCALE_RATIO = 50; 

let rooms = {};

// --- FUNZIONI FISICA ---
function checkCollision(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < p1.radius + p2.radius;
}

function resolveCollision(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;
    const nx = dx / distance; const ny = dy / distance;
    const dvx = p1.vx - p2.vx; const dvy = p1.vy - p2.vy;
    const velAlongNormal = dvx * nx + dvy * ny;
    if (velAlongNormal > 0) return;
    const restitution = 0.8; 
    let j = -(1 + restitution) * velAlongNormal;
    j /= (1 / p1.mass + 1 / p2.mass);
    const impulseX = j * nx; const impulseY = j * ny;
    p1.vx += (impulseX / p1.mass); p1.vy += (impulseY / p1.mass);
    p2.vx -= (impulseX / p2.mass); p2.vy -= (impulseY / p2.mass);
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join_game', (config) => {
        const roomName = (config.room || "Arena 1").trim().substring(0, 15);
        let safeName = (config.name || "Ospite").substring(0, 12).replace(/[^a-zA-Z0-9 ]/g, "");
        if(!safeName.trim()) safeName = "Ospite";

        if (!rooms[roomName]) {
            rooms[roomName] = { players: {}, eliminated: [], arenaRadius: BASE_ARENA_RADIUS };
        }
        const room = rooms[roomName];

        if (Object.keys(room.players).length >= 20) {
            socket.emit('error_msg', 'Stanza piena!');
            return;
        }

        socket.join(roomName);
        currentRoom = roomName;

        let mass = Math.max(10, Math.min(90, config.mass));
        let radius = 15 + (mass * 0.5);

        room.players[socket.id] = {
            id: socket.id, name: safeName, room: roomName,
            x: (Math.random() * 400) - 200, y: (Math.random() * 400) - 200,
            vx: 0, vy: 0, mass: mass, friction: 0.9 + ((100 - mass) / 1000),
            radius: radius, color: 'hsl(' + Math.random() * 360 + ', 70%, 50%)', 
            inputAngle: null, isPushing: false
        };

        socket.emit('joined_success', { roomName: roomName });
    });

    socket.on('input', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
            const p = rooms[currentRoom].players[socket.id];
            p.inputAngle = data.angle; p.isPushing = data.isPushing;
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            if (rooms[currentRoom].players[socket.id]) delete rooms[currentRoom].players[socket.id];
            if(Object.keys(rooms[currentRoom].players).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

// LOOP DI GIOCO
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        const playerIds = Object.keys(room.players);

        if (playerIds.length === 0) continue;

        // --- WIN CONDITION (Modificata per Classifica) ---
        // Se c'è solo 1 giocatore e la partita era iniziata (c'è almeno un eliminato)
        if (playerIds.length === 1 && room.eliminated.length > 0) {
            const winnerId = playerIds[0];
            const winner = room.players[winnerId];

            // Aggiungi il vincitore in cima alla lista eliminati con Rank 1
            room.eliminated.unshift({ name: winner.name, rank: 1, isWinner: true });

            // Invia la classifica completa a tutti
            io.to(roomName).emit('game_over', { 
                leaderboard: room.eliminated,
                winnerName: winner.name
            });

            // Chiudi la stanza
            delete rooms[roomName];
            continue; 
        }
        // ------------------------------------------------

        // Arena Logic
        let totalArea = 0;
        playerIds.forEach(id => totalArea += Math.PI * Math.pow(room.players[id].radius, 2));
        let targetRadius = Math.max(400, Math.sqrt((totalArea * SCALE_RATIO) / Math.PI));
        room.arenaRadius += (targetRadius - room.arenaRadius) * 0.01;

        // Physics Logic
        playerIds.forEach(id => {
            let p = room.players[id];
            if (p.isPushing && p.inputAngle !== null) {
                const force = 1.5; 
                p.vx += Math.cos(p.inputAngle) * (force / (p.mass / 20));
                p.vy += Math.sin(p.inputAngle) * (force / (p.mass / 20));
            }
            p.vx *= p.friction; p.vy *= p.friction; p.x += p.vx; p.y += p.vy;

            // Check Eliminazione
            if (Math.sqrt(p.x*p.x + p.y*p.y) > room.arenaRadius + p.radius) {
                const rank = playerIds.length;
                // Aggiungi alla lista (unshift mette in testa all'array)
                room.eliminated.unshift({ name: p.name, rank: rank });
                io.to(p.id).emit('you_died', { rank: rank });
                delete room.players[id];
            }
        });

        // Collision Logic
        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                let p1 = room.players[playerIds[i]];
                let p2 = room.players[playerIds[j]];
                if (p1 && p2 && checkCollision(p1, p2)) {
                    resolveCollision(p1, p2);
                    const dx = p1.x - p2.x; const dy = p1.y - p2.y; const dist = Math.sqrt(dx*dx + dy*dy);
                    if(dist > 0) {
                        const overlap = (p1.radius + p2.radius - dist) / 2;
                        p1.x += (dx/dist)*overlap; p1.y += (dy/dist)*overlap;
                        p2.x -= (dx/dist)*overlap; p2.y -= (dy/dist)*overlap;
                    }
                }
            }
        }

        io.to(roomName).emit('state', { players: room.players, arenaRadius: room.arenaRadius, eliminated: room.eliminated });
    }
}, GAME_SPEED);

// Broadcast Lobby
setInterval(() => {
    const roomList = [];
    for(let name in rooms) {
        roomList.push({ name: name, count: Object.keys(rooms[name].players).length });
    }
    io.emit('room_list_update', roomList);
}, 1000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));