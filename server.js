const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// CONFIGURAZIONE
const GAME_SPEED = 1000 / 60; 
const BASE_ARENA_RADIUS = 2000; 

let rooms = {};

// --- FISICA (Collisioni elastiche) ---
function checkCollision(p1, p2) {
    const dx = p1.x - p2.x; const dy = p1.y - p2.y;
    // Usiamo una hitbox circolare inscritta nel quadrato per fluidità
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
    const restitution = 0.5; // Meno rimbalzoso per i quadrati (più pesante)
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
        radius: 20 + (participant.mass * 0.6), // Dimensione quadrato
        x: (Math.random() * 400) - 200, 
        y: (Math.random() * 400) - 200,
        vx: 0, vy: 0,
        inputAngle: 0, // Angolo di rotazione del quadrato
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
            if(rounds > 10) rounds = 10; // CONTROLLO MAX 10 ROUND

            rooms[roomName] = { 
                hostId: socket.id,  // Il primo che crea è l'host
                players: {},        // Giocatori in campo
                participants: {},   // Tutti i connessi
                eliminated: [],     
                arenaRadius: BASE_ARENA_RADIUS,
                currentRound: 1,
                totalRounds: rounds,
                status: 'lobby'     // STATO INIZIALE: LOBBY
            };
        }
        
        const room = rooms[roomName];

        // Se la partita è già iniziata (playing) non si può entrare, solo se è lobby
        if (room.status !== 'lobby') {
            socket.emit('error_msg', 'Partita già in corso! Impossibile entrare.');
            return;
        }

        if (Object.keys(room.participants).length >= 20) {
            socket.emit('error_msg', 'Stanza piena!');
            return;
        }

        socket.join(roomName);
        currentRoom = roomName;

        // Aggiungi partecipante
        room.participants[socket.id] = {
            id: socket.id,
            name: safeName,
            mass: Math.max(10, Math.min(90, config.mass)),
            skin: config.skin || null,
            color: 'hsl(' + Math.random() * 360 + ', 70%, 50%)',
            score: 0
        };

        // Invia aggiornamento Lobby a tutti nella stanza
        io.to(roomName).emit('lobby_update', { 
            players: Object.values(room.participants),
            isHost: room.hostId === socket.id, // Dice al client se è host
            hostId: room.hostId
        });
    });

    // AVVIO PARTITA (Solo Host)
    socket.on('start_match', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];

        if (socket.id !== room.hostId) return; // Sicurezza

        room.status = 'playing';
        
        // Crea le entità fisiche per tutti
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
            // Se spinge o si muove, aggiorniamo l'angolo per ruotare il quadrato
            if (data.isPushing || (data.angle !== 0)) {
                p.inputAngle = data.angle;
            }
            p.isPushing = data.isPushing;
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            
            // Rimuovi
            delete room.players[socket.id];
            delete room.participants[socket.id];

            // Gestione Host disconnesso
            if (socket.id === room.hostId) {
                // Passa l'host al prossimo
                const remaining = Object.keys(room.participants);
                if (remaining.length > 0) {
                    room.hostId = remaining[0];
                } else {
                    delete rooms[currentRoom]; // Stanza vuota
                    return;
                }
            }

            // Se siamo in lobby, aggiorna la lista
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
        
        // Se siamo in lobby o cooldown, non fare fisica
        if (room.status !== 'playing') continue;

        const playerIds = Object.keys(room.players);
        
        // RESTRIZIONE ARENA (Costante nel tempo)
        // Diminuisce di 0.5 pixel ogni frame (30 pixel al secondo)
        if (room.arenaRadius > 200) {
            room.arenaRadius -= 0.5;
        }

        // --- WIN CONDITION DEL ROUND ---
        // Se rimane 1 solo giocatore (e la partita aveva > 1 partecipante)
        const totalStartPlayers = Object.keys(room.participants).length;
        
        if (playerIds.length <= 1 && totalStartPlayers > 1) {
            
            // Assegnazione Punti
            // Recuperiamo tutti gli eliminati + il vincitore
            const winnerId = playerIds[0];
            const winner = winnerId ? room.participants[winnerId] : null;

            if (winner) {
                // Il vincitore prende punti = Numero sconfitti
                // Esempio: 10 giocatori. Vincitore Rank 1. Punti: 9.
                // Ultimo (Rank 10). Punti: 0.
                room.eliminated.unshift({ 
                    id: winnerId, 
                    name: winner.name, 
                    rank: 1 
                });
            }

            // Calcolo Punti Finale per questo round
            const roundParticipantCount = room.eliminated.length;
            room.eliminated.forEach(p => {
                // Formula: Punti = (Numero Partecipanti - Rank)
                // Esempio 10 player. Rank 1 -> 10 - 1 = 9 punti. Rank 10 -> 10 - 10 = 0 punti.
                const points = roundParticipantCount - p.rank;
                if (room.participants[p.id]) {
                    room.participants[p.id].score += points;
                }
            });

            // CHECK FINE TORNEO
            if (room.currentRound >= room.totalRounds) {
                // Classifica Finale
                let finalLeaderboard = Object.values(room.participants).sort((a,b) => b.score - a.score);
                io.to(roomName).emit('game_over', { 
                    leaderboard: finalLeaderboard, 
                    winnerName: finalLeaderboard[0].name 
                });
                delete rooms[roomName];
                continue;
            } else {
                // FINE ROUND
                room.status = 'cooldown';
                io.to(roomName).emit('round_end', { 
                    winnerName: winner ? winner.name : "Nessuno",
                    nextRound: room.currentRound + 1
                });

                setTimeout(() => {
                    if(!rooms[roomName]) return; 
                    const r = rooms[roomName];
                    r.currentRound++;
                    r.status = 'playing';
                    r.arenaRadius = BASE_ARENA_RADIUS;
                    r.eliminated = []; 
                    r.players = {}; 
                    // Respawn
                    for (let pid in r.participants) {
                        r.players[pid] = createPlayerEntity(r.participants[pid]);
                        io.to(pid).emit('respawn', { round: r.currentRound });
                    }
                }, 4000); // 4 secondi di pausa
            }
            continue; 
        }

        // FISICA
        playerIds.forEach(id => {
            let p = room.players[id];
            
            // Spinta
            if (p.isPushing) {
                const force = 1.2; 
                p.vx += Math.cos(p.inputAngle) * (force / (p.mass / 20));
                p.vy += Math.sin(p.inputAngle) * (force / (p.mass / 20));
            }

            p.vx *= p.friction; p.vy *= p.friction; 
            p.x += p.vx; p.y += p.vy;

            // Check Fuori Arena
            // Usiamo distanza dal centro
            if (Math.sqrt(p.x*p.x + p.y*p.y) > room.arenaRadius + p.radius) {
                const rank = playerIds.length; // Esempio: rimasti in 5, arrivo 5°
                // Salva ID per assegnare punti dopo
                room.eliminated.unshift({ id: p.id, name: p.name, rank: rank });
                io.to(p.id).emit('you_died', { rank: rank });
                delete room.players[id];
            }
        });

        // Collisioni
        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                let p1 = room.players[playerIds[i]];
                let p2 = room.players[playerIds[j]];
                if (p1 && p2 && checkCollision(p1, p2)) {
                    resolveCollision(p1, p2);
                    // Anti-overlap
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
            players: room.players, 
            arenaRadius: room.arenaRadius, 
            eliminated: room.eliminated,
            round: room.currentRound,
            totalRounds: room.totalRounds
        });
    }
}, GAME_SPEED);

// Broadcast Lobby
setInterval(() => {
    const roomList = [];
    for(let name in rooms) {
        if (rooms[name].status === 'lobby') { // Mostra solo stanze in attesa
            roomList.push({ name: name, count: Object.keys(rooms[name].participants).length });
        }
    }
    io.emit('room_list_update', roomList);
}, 1000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));
