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

// --- FUNZIONI UTILI ---
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
    const restitution = 0.8; 
    let j = -(1 + restitution) * velAlongNormal;
    j /= (1 / p1.mass + 1 / p2.mass);
    const impulseX = j * nx; const impulseY = j * ny;
    p1.vx += (impulseX / p1.mass); p1.vy += (impulseY / p1.mass);
    p2.vx -= (impulseX / p2.mass); p2.vy -= (impulseY / p2.mass);
}

// Funzione per creare un oggetto giocatore "Fisico" partendo dai dati statici
function createPlayerEntity(participantData) {
    let mass = participantData.mass;
    let radius = 15 + (mass * 0.5);
    return {
        id: participantData.id,
        name: participantData.name,
        skin: participantData.skin,
        color: participantData.color,
        mass: mass,
        friction: 0.9 + ((100 - mass) / 1000),
        radius: radius,
        x: (Math.random() * 400) - 200, 
        y: (Math.random() * 400) - 200,
        vx: 0, vy: 0,
        inputAngle: null, isPushing: false
    };
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('join_game', (config) => {
        const roomName = (config.room || "Arena 1").trim().substring(0, 15);
        let safeName = (config.name || "Ospite").substring(0, 12).replace(/[^a-zA-Z0-9 ]/g, "");
        if(!safeName.trim()) safeName = "Ospite";

        // CREAZIONE STANZA
        if (!rooms[roomName]) {
            let rounds = parseInt(config.totalRounds) || 1;
            if(rounds < 1) rounds = 1; 
            if(rounds > 10) rounds = 10;

            rooms[roomName] = { 
                players: {},        // Entità fisiche in gioco ora
                participants: {},   // Dati di tutti i giocatori (per respawn e punteggi)
                eliminated: [],     // Lista morti del round corrente
                arenaRadius: BASE_ARENA_RADIUS,
                currentRound: 1,
                totalRounds: rounds,
                status: 'waiting'   // waiting, playing, cooldown
            };
        }
        const room = rooms[roomName];

        if (Object.keys(room.participants).length >= 20) {
            socket.emit('error_msg', 'Stanza piena!');
            return;
        }

        socket.join(roomName);
        currentRoom = roomName;

        // Salviamo i dati del partecipante
        let mass = Math.max(10, Math.min(90, config.mass));
        
        const participant = {
            id: socket.id,
            name: safeName,
            mass: mass,
            skin: config.skin || null,
            color: 'hsl(' + Math.random() * 360 + ', 70%, 50%)',
            score: 0 // Vittorie totali
        };

        room.participants[socket.id] = participant;
        
        // Se il gioco è in attesa o sta giocando, lo aggiungiamo subito alla fisica
        // (Chi entra a round iniziato spawna subito? Sì, per semplicità)
        room.players[socket.id] = createPlayerEntity(participant);

        if(room.status === 'waiting') room.status = 'playing';

        socket.emit('joined_success', { 
            roomName: roomName, 
            currentRound: room.currentRound, 
            totalRounds: room.totalRounds 
        });
    });

    socket.on('input', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
            const p = rooms[currentRoom].players[socket.id];
            p.inputAngle = data.angle; p.isPushing = data.isPushing;
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            // Rimuovi dalla fisica
            if (rooms[currentRoom].players[socket.id]) delete rooms[currentRoom].players[socket.id];
            // Rimuovi dai partecipanti (per sempre)
            if (rooms[currentRoom].participants[socket.id]) delete rooms[currentRoom].participants[socket.id];

            // Se stanza vuota, cancella
            if(Object.keys(rooms[currentRoom].participants).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

// LOOP DI GIOCO
setInterval(() => {
    for (const roomName in rooms) {
        const room = rooms[roomName];
        
        // Se siamo in cooldown (pausa tra round), non calcolare fisica
        if (room.status === 'cooldown') continue;

        const playerIds = Object.keys(room.players);
        // Se non c'è nessuno (o solo 1 in attesa di avversari all'inizio), salta check vittoria
        // (Ma lasciamo muovere la fisica per divertimento)

        // --- WIN CONDITION DEL ROUND ---
        // Almeno 1 eliminato (significa che si sono scontrati) E rimane solo 1 vivo
        if (playerIds.length === 1 && room.eliminated.length > 0) {
            const winnerId = playerIds[0];
            const winner = room.participants[winnerId]; // Prendi dati da participants
            
            if(winner) {
                winner.score += 1; // Aumenta punteggio totale
                
                // Aggiungilo alla lista eliminati del round come PRIMO (Rank 1)
                room.eliminated.unshift({ name: winner.name, rank: 1, isWinner: true });
            }

            // CONTROLLO FINE TORNEO
            if (room.currentRound >= room.totalRounds) {
                // PARTITA FINITA DEFINITIVAMENTE
                // Calcoliamo classifica finale basata sui punteggi (score)
                let finalLeaderboard = Object.values(room.participants).sort((a,b) => b.score - a.score);
                
                io.to(roomName).emit('game_over', { 
                    leaderboard: finalLeaderboard, 
                    winnerName: finalLeaderboard[0].name 
                });
                
                delete rooms[roomName]; // Cancella stanza
                continue;

            } else {
                // FINE ROUND (Ma non Torneo)
                room.status = 'cooldown'; // Blocca fisica
                io.to(roomName).emit('round_end', { 
                    winnerName: winner ? winner.name : "Nessuno",
                    nextRound: room.currentRound + 1
                });

                // AVVIA PROSSIMO ROUND DOPO 3 SECONDI
                setTimeout(() => {
                    // Check se la stanza esiste ancora (potrebbero essersi disconnessi tutti)
                    if(!rooms[roomName]) return; 
                    
                    const r = rooms[roomName];
                    r.currentRound++;
                    r.status = 'playing';
                    r.arenaRadius = BASE_ARENA_RADIUS;
                    r.eliminated = []; // Resetta morti del round
                    r.players = {}; // Svuota fisica vecchia

                    // RESPANA TUTTI I PARTECIPANTI
                    for (let pid in r.participants) {
                        r.players[pid] = createPlayerEntity(r.participants[pid]);
                        // Avvisa i client che sono vivi
                        io.to(pid).emit('respawn', { round: r.currentRound });
                    }

                }, 3000);
            }
            continue; 
        }

        // --- ARENA & FISICA (Standard) ---
        let totalArea = 0;
        playerIds.forEach(id => totalArea += Math.PI * Math.pow(room.players[id].radius, 2));
        let targetRadius = Math.max(400, Math.sqrt((totalArea * SCALE_RATIO) / Math.PI));
        room.arenaRadius += (targetRadius - room.arenaRadius) * 0.01;

        playerIds.forEach(id => {
            let p = room.players[id];
            if (p.isPushing && p.inputAngle !== null) {
                const force = 1.5; 
                p.vx += Math.cos(p.inputAngle) * (force / (p.mass / 20));
                p.vy += Math.sin(p.inputAngle) * (force / (p.mass / 20));
            }
            p.vx *= p.friction; p.vy *= p.friction; p.x += p.vx; p.y += p.vy;

            if (Math.sqrt(p.x*p.x + p.y*p.y) > room.arenaRadius + p.radius) {
                const rank = playerIds.length; // Posizione in questo round
                room.eliminated.unshift({ name: p.name, rank: rank });
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

        // Invia update (includiamo il round corrente)
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
        roomList.push({ name: name, count: Object.keys(rooms[name].participants).length });
    }
    io.emit('room_list_update', roomList);
}, 1000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server attivo su porta ${PORT}`));
