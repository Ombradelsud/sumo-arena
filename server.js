const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// CONFIGURAZIONE
const GAME_SPEED = 1000 / 60; 
const BASE_ARENA_RADIUS = 2000; 

let rooms = {};

// --- FISICA ---
function checkCollision(p1, p2) {
    const dx = p1.x - p2.x; const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < p1.radius + p2.radius;
}

function resolveCollision(p1, p2) {
    const dx = p1.x - p2.x; const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;
    const nx = dx / distance; const ny = dy / distance;
    const dvx = p1.vx - p2.vx; const dvy = p1.vy - p2.vy;
    const velAlongNormal = dvx * nx + dvy * ny;
    if (velAlongNormal > 0) return;
    const restitution = 0.5; 
    let j = -(1 + restitution) * velAlongNormal;
    j /= (1 / p1.mass + 1 / p2.mass);
    const impulseX = j * nx; const impulseY = j * ny;
    p1.vx += (impulseX / p1.mass); p1.vy += (impulseY / p1.mass);
    p2.vx -= (impulseX / p2.mass); p2.vy -= (impulseY / p2.mass);
}

function createPlayerEntity(participant) {
    return {
        id: participant.id,
        name: participant.name,
        skin: participant.skin,
        color: participant.color,
        mass: participant.mass,
        friction: 0.9 + ((100 - participant.mass) / 1000),
        radius: 20 + (participant.mass * 0.6),
        x: (Math.random() * 400) - 200, 
        y: (Math.random() * 400) - 200,
        vx: 0, vy: 0,
        inputAngle: 0, 
        isPushing: false
    };
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join_game', (config) => {
        const roomName = (config.room || "Arena 1").trim().substring(0, 15);
        let safeName = (config.name || "Ospite").substring(0, 12).replace(/[^a-zA-Z0-9 ]/g, "");
        if(!safeName.trim()) safeName = "Ospite";

        // CREAZIONE O RECUPERO STANZA
        if (!rooms[roomName]) {
            let rounds = parseInt(config.totalRounds) || 3;
            if(rounds < 1) rounds = 1; 
            if(rounds > 10) rounds = 10;

            rooms[roomName] = { 
                hostId: socket.id,  // Il primo che crea è l'host
                players: {}, participants: {}, eliminated: [],     
                arenaRadius: BASE_ARENA_RADIUS,
                currentRound: 1, totalRounds: rounds,
                status: 'lobby'
            };
        }
        
        const room = rooms[roomName];

        if (room.status !== 'lobby') {
            socket.emit('error_msg', 'Partita già in corso!');
            return;
        }
        if (Object.keys(room.participants).length >= 20) {
            socket.emit('error_msg', 'Stanza piena!');
            return;
        }

        socket.join(roomName);
        currentRoom = roomName;

        room.participants[socket.id] = {
            id: socket.id,
            name: safeName,
            mass: Math.max(10, Math.min(90, config.mass)),
            skin: config.skin || null,
            color: 'hsl(' + Math.random() * 360 + ', 70%, 50%)',
            score: 0
        };

        // --- CORREZIONE QUI ---
        // Inviamo solo hostId, non calcoliamo isHost qui
        io.to(roomName).emit('lobby_update', { 
            players: Object.values(room.participants),
            hostId: room.hostId
        });
    });

    socket.on('start_match', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (socket.id !== room.hostId) return;

        room.status = 'playing';
        for (let pid in room.participants) {
            room.players[pid] = createPlayerEntity(room.participants[pid]);
        }

        io.to(currentRoom).emit('game_start', { 
            currentRound: room.currentRound, 
            totalRounds: room.totalRounds 
        });
    });

    socket.on('input', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
            const p = rooms[currentRoom].players[socket.id];
            if (data.isPushing || (data.angle !== 0)) p.inputAngle = data.angle;
            p.isPushing = data.isPushing;
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            delete room.players[socket.id];
            delete room.participants[socket.id];

            if (socket.id === room.hostId) {
                const remaining = Object.keys(room.participants);
                if (remaining.length > 0) {
                    room.hostId = remaining[0]; // Passa host al prossimo
                } else {
                    delete rooms[currentRoom];
                    return;
                }
            }

            if (room.status === 'lobby') {
                io.to(currentRoom).emit('lobby_update', { 
                    players: Object.values(room.participants),
                    hostId: room.hostId
                });
            }
        }
    });
});

// LOOP DI GIOCO
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.status !== 'playing') continue;

        const playerIds = Object.keys(room.players);
        
        // Restringimento costante
        if (room.arenaRadius > 200) room.arenaRadius -= 0.5;

        // WIN CONDITION
        const totalStartPlayers = Object.keys(room.participants).length;
        if (playerIds.length <= 1 && totalStartPlayers > 1) {
            const winnerId = playerIds[0];
            const winner = winnerId ? room.participants[winnerId] : null;

            if (winner) room.eliminated.unshift({ id: winnerId, name: winner.name, rank: 1 });

            // Punteggi
            const roundParticipantCount = room.eliminated.length;
            room.eliminated.forEach(p => {
                const points = roundParticipantCount - p.rank;
                if (room.participants[p.id]) room.participants[p.id].score += points;
            });

            if (room.currentRound >= room.totalRounds) {
                let finalLeaderboard = Object.values(room.participants).sort((a,b) => b.score - a.score);
                io.to(roomName).emit('game_over', { leaderboard: finalLeaderboard, winnerName: finalLeaderboard[0].name });
                delete rooms[roomName];
                continue;
            } else {
                room.status = 'cooldown';
                io.to(roomName).emit('round_end', { winnerName: winner ? winner.name : "Nessuno", nextRound: room.currentRound + 1 });

                setTimeout(() => {
                    if(!rooms[roomName]) return; 
                    const r = rooms[roomName];
                    r.currentRound++;
                    r.status = 'playing';
                    r.arenaRadius = BASE_ARENA_RADIUS;
                    r.eliminated = []; r.players = {}; 
                    for (let pid in r.participants) {
                        r.players[pid] = createPlayerEntity(r.participants[pid]);
                        io.to(pid).emit('respawn', { round: r.currentRound });
                    }
                }, 4000);
            }
            continue; 
        }

        // FISICA
        playerIds.forEach(id => {
            let p = room.players[id];
            if (p.isPushing) {
                const force = 1.2; 
                p.vx += Math.cos(p.inputAngle) * (force / (p.mass / 20));
                p.vy += Math.sin(p.inputAngle) * (force / (p.mass / 20));
            }
            p.vx *= p.friction; p.vy *= p.friction; p.x += p.vx; p.y += p.vy;

            if (Math.sqrt(p.x*p.x + p.y*p.y) > room.arenaRadius + p.radius) {
                const rank = playerIds.length;
                room.eliminated.unshift({ id: p.id, name: p.name, rank: rank });
                io.to(p.id).emit('you_died', { rank: rank });
                delete room.players[id];
            }
        });

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

        io.to(roomName).emit('state', { 
            players: room.players, arenaRadius: room.arenaRadius, eliminated: room.eliminated,
            round: room.currentRound, totalRounds: room.totalRounds
        });
    }
}, GAME_SPEED);

setInterval(() => {
    const roomList = [];
    for(let name in rooms) {
        if (rooms[name].status === 'lobby') {
            roomList.push({ name: name, count: Object.keys(rooms[name].participants).length });
        }
    }
    io.emit('room_list_update', roomList);
}, 1000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));
