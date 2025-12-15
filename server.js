<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sumo Box Arena</title>
    <style>
        body { margin: 0; overflow: hidden; background: #1a1a1a; color: white; font-family: 'Segoe UI', sans-serif; touch-action: none; }

        /* UI GENERALE */
        .panel { 
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
            text-align: center; background: rgba(15, 15, 15, 0.98); padding: 30px;
            border-radius: 15px; border: 1px solid #444; box-shadow: 0 0 50px rgba(0,0,0,0.8);
            z-index: 20; width: 350px; max-height: 90vh; overflow-y: auto;
        }

        h1 { color: #ff4757; text-transform: uppercase; margin: 0 0 15px 0; letter-spacing: 2px; font-size: 1.8em; }
        
        input[type="text"], input[type="number"] {
            background: #333; border: 1px solid #555; color: white; padding: 10px;
            font-size: 1em; border-radius: 8px; width: 90%; text-align: center; margin-bottom: 10px; outline: none;
        }
        input[type="text"]:focus, input[type="number"]:focus { border-color: #ff4757; }
        
        button { padding: 12px; font-size: 1.1em; cursor: pointer; background: #ff4757; color: white; border: none; border-radius: 50px; font-weight: bold; width: 100%; margin-top: 10px; transition: 0.2s; }
        button:hover { background: #ff6b81; transform: scale(1.02); }
        button:active { transform: scale(0.98); }
        button:disabled { background: #555; cursor: not-allowed; transform: none; }

        /* BOTTONE INVITO (Nuovo) */
        .btn-invite { background: #3498db; margin-bottom: 15px; }
        .btn-invite:hover { background: #2980b9; }

        /* 1. LOGIN SCREEN */
        .skin-upload-container { margin: 15px 0; cursor: pointer; position: relative; display: inline-block; }
        #skinPreview { width: 80px; height: 80px; border-radius: 12px; background: #333; border: 3px solid #ff4757; object-fit: cover; }
        .skin-label { display: block; font-size: 0.8em; color: #aaa; margin-top: 5px; }
        
        .stats-row { display: flex; gap: 10px; margin: 10px 0; }
        .stat-box { background: #222; padding: 8px; border-radius: 5px; flex: 1; border: 1px solid #333; font-size: 0.9em; }
        input[type=range] { width: 100%; accent-color: #ff4757; cursor: pointer; }

        #active-rooms { margin-top: 20px; text-align: left; border-top: 1px solid #444; padding-top: 10px; }
        .room-item { background: #2d3436; padding: 8px; margin-bottom: 4px; border-radius: 4px; display: flex; justify-content: space-between; cursor: pointer; border: 1px solid #444; font-size: 0.9em; }
        .room-item:hover { border-color: #ff4757; background: #333; }

        /* 2. LOBBY SCREEN */
        #lobbyScreen { display: none; }
        .lobby-list { text-align: left; background: #222; padding: 10px; border-radius: 8px; margin: 15px 0; min-height: 100px; max-height: 300px; overflow-y: auto; }
        .lobby-player { padding: 8px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .lobby-player:last-child { border-bottom: none; }
        .host-badge { color: #f1c40f; margin-right: 5px; }

        /* 3. VICTORY SCREEN */
        #victoryScreen { display: none; width: 400px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { text-align: left; border-bottom: 1px solid #555; padding: 10px; color: #aaa; font-size: 0.8em; }
        td { padding: 10px; border-bottom: 1px solid #333; }
        .rank-1 { color: #f1c40f; font-weight: bold; font-size: 1.1em; } 
        .rank-2 { color: #bdc3c7; } 
        .rank-3 { color: #d35400; }

        /* HUD GIOCO */
        #gameCanvas { display: none; width: 100%; height: 100%; position: absolute; top:0; left:0; z-index: 1; }
        #joystickZone { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5; display: none; }

        #topHud { display: none; position: absolute; top: 20px; width: 100%; text-align: center; pointer-events: none; z-index: 10; }
        #roundDisplay { font-size: 1.8em; font-weight: 900; color: #f1c40f; text-shadow: 2px 2px 0 #000; letter-spacing: 1px; }
        
        #overlayInstruction { display: none; position: absolute; top: 60px; width: 100%; text-align: center; pointer-events: none; color: rgba(255,255,255,0.5); font-weight: bold; z-index: 10; font-size: 0.9em; }

        #centerMsg { 
            display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            text-align: center; z-index: 30; pointer-events: none; width: 100%;
        }
        .msg-box { background: rgba(0,0,0,0.85); padding: 20px; border: 2px solid #ff4757; display: inline-block; border-radius: 10px; }
        .big-text { font-size: 2em; font-weight: bold; color: white; text-shadow: 2px 2px 0 black; margin-bottom: 5px; }
        .sub-text { color: #aaa; font-size: 1em; }
    </style>
</head>
<body>

    <div id="loginScreen" class="panel">
        <h1>Sumo Box</h1>
        
        <div class="skin-upload-container" onclick="document.getElementById('skinInput').click()">
            <img id="skinPreview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
            <input type="file" id="skinInput" accept="image/*" style="display:none">
            <span class="skin-label">📷 Carica Foto</span>
        </div>

        <input type="text" id="nickname" placeholder="Il tuo Nome" maxlength="12">
        <input type="text" id="roomName" placeholder="Nome Arena" maxlength="15">
        
        <div class="stats-row" style="align-items: center; justify-content: center;">
            <label>Round (Max 10):</label>
            <input type="number" id="roundsInput" min="1" max="10" value="3" style="width:60px; margin:0;">
        </div>

        <div class="stats-row">
            <div class="stat-box">
                Peso: <span id="massVal" style="color:#ff4757">50</span>kg
                <input type="range" id="massRange" min="10" max="90" value="50">
            </div>
        </div>

        <button onclick="joinLobby()">ENTRA IN LOBBY</button>
        
        <div id="active-rooms">
            <div style="font-size:0.8em; color:#888; margin-bottom:5px;">ARENE IN ATTESA:</div>
            <div id="roomListContainer" style="font-size:0.9em; color:#666; font-style:italic;">Caricamento...</div>
        </div>
    </div>

    <div id="lobbyScreen" class="panel">
        <h1>Sala d'Attesa</h1>
        
        <button class="btn-invite" onclick="copyInviteLink()">🔗 INVITA AMICI</button>
        
        <div style="font-size:0.9em; color:#aaa;">Partecipanti pronti:</div>
        <div class="lobby-list" id="lobbyPlayerList"></div>

        <div id="hostControls" style="display:none;">
            <button onclick="startMatch()">AVVIA PARTITA</button>
            <div style="font-size:0.8em; color:#666; margin-top:5px;">Solo tu puoi avviare.</div>
        </div>
        
        <div id="clientMsg" style="color:#f1c40f; margin-top:15px; font-style:italic; display:none;">
            In attesa che l'Host avvii la partita...
        </div>
    </div>

    <div id="victoryScreen" class="panel">
        <h1 style="color:#f1c40f">CLASSIFICA FINALE</h1>
        <table id="leaderboardTable">
            <thead><tr><th>#</th><th>GIOCATORE</th><th>PUNTI</th></tr></thead>
            <tbody></tbody>
        </table>
        <button onclick="window.location.href='/'" style="background:#2ed573;">NUOVA PARTITA</button>
    </div>

    <div id="topHud">
        <div id="roundDisplay">ROUND 1 / 3</div>
    </div>
    <div id="overlayInstruction">Usa il Joystick (Touch) o Mouse (PC)</div>

    <div id="centerMsg">
        <div class="msg-box">
            <div id="msgTitle" class="big-text">MESSAGGIO</div>
            <div id="msgSub" class="sub-text">Sottotitolo</div>
        </div>
    </div>

    <div id="joystickZone"></div>
    <canvas id="gameCanvas"></canvas>

    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.10.1/nipplejs.min.js"></script>

    <script>
        const socket = io();
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        // --- 0. AUTO-COMPILAZIONE LINK INVITO ---
        window.onload = () => {
            const params = new URLSearchParams(window.location.search);
            const roomParam = params.get('room');
            if(roomParam) {
                document.getElementById('roomName').value = roomParam;
                // Opzionale: scrollare o focus
            }
        };

        // Funzione per copiare il link
        function copyInviteLink() {
            const room = document.getElementById('roomName').value;
            // Genera l'URL base (senza parametri vecchi)
            const baseUrl = window.location.origin + window.location.pathname;
            const inviteUrl = `${baseUrl}?room=${encodeURIComponent(room)}`;
            
            navigator.clipboard.writeText(inviteUrl).then(() => {
                alert("Link copiato! Invialo ai tuoi amici.");
            }).catch(err => {
                alert("Errore copia, ecco il link: " + inviteUrl);
            });
        }

        // Stato Globale
        let myId = null;
        let gameRunning = false;
        let isSpectator = false;
        let dpr = 1;

        // Input
        let joystickManager = null;
        let joystickActive = false;
        let joystickAngle = 0;
        let isPushing = false;
        let mouseX = 0, mouseY = 0;

        // Assets
        let mySkinData = null;
        const imageCache = {};

        // === 1. GESTIONE SKIN E UI ===
        const savedSkin = localStorage.getItem('sumoSquareSkin');
        if (savedSkin) { mySkinData = savedSkin; document.getElementById('skinPreview').src = savedSkin; }
        
        document.getElementById('skinInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const c = document.createElement('canvas');
                    const x = c.getContext('2d');
                    c.width = 100; c.height = 100;
                    x.drawImage(img, 0, 0, 100, 100);
                    mySkinData = c.toDataURL('image/jpeg', 0.8);
                    document.getElementById('skinPreview').src = mySkinData;
                    localStorage.setItem('sumoSquareSkin', mySkinData);
                }
                img.src = event.target.result;
            }
            reader.readAsDataURL(file);
        });

        document.getElementById('massRange').oninput = (e) => document.getElementById('massVal').innerText = e.target.value;

        socket.on('room_list_update', (rooms) => {
            const el = document.getElementById('roomListContainer');
            if(rooms.length === 0) { el.innerHTML = "Nessuna arena in attesa."; return; }
            let h = '';
            rooms.forEach(r => {
                h += `<div class="room-item" onclick="document.getElementById('roomName').value='${r.name}'">
                        <span>${r.name}</span>
                        <span style="color:#2ed573">${r.count} in attesa</span>
                      </div>`;
            });
            el.innerHTML = h;
        });

        // === 2. LOGICA LOBBY ===
        function joinLobby() {
            const room = document.getElementById('roomName').value.trim();
            const name = document.getElementById('nickname').value.trim();
            const rounds = document.getElementById('roundsInput').value;
            
            if(!room) { alert("Inserisci nome arena!"); return; }
            
            socket.emit('join_game', { 
                room: room, 
                name: name || "Boxer", 
                mass: parseInt(document.getElementById('massRange').value), 
                skin: mySkinData,
                totalRounds: rounds 
            });
        }

        socket.on('connect', () => {
            myId = socket.id;
            console.log("Connesso con ID:", myId);
        });

        socket.on('lobby_update', (data) => {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('lobbyScreen').style.display = 'block';
            
            const list = document.getElementById('lobbyPlayerList');
            let h = '';
            data.players.forEach(p => {
                const isHostBadge = (p.id === data.hostId) ? '<span class="host-badge">👑</span>' : '';
                const isMe = (p.id === myId) ? ' (Tu)' : '';
                h += `<div class="lobby-player">
                        <span>${isHostBadge}${p.name}${isMe}</span>
                        <span style="color:#888; font-size:0.8em;">${p.mass}kg</span>
                      </div>`;
            });
            list.innerHTML = h;

            if (myId === data.hostId) {
                document.getElementById('hostControls').style.display = 'block';
                document.getElementById('clientMsg').style.display = 'none';
            } else {
                document.getElementById('hostControls').style.display = 'none';
                document.getElementById('clientMsg').style.display = 'block';
            }
        });

        function startMatch() {
            socket.emit('start_match');
        }

        socket.on('error_msg', (msg) => { alert(msg); location.reload(); });

        // === 3. LOGICA GIOCO ===
        socket.on('game_start', (data) => {
            document.getElementById('lobbyScreen').style.display = 'none';
            document.getElementById('gameCanvas').style.display = 'block';
            document.getElementById('joystickZone').style.display = 'block';
            document.getElementById('topHud').style.display = 'block';
            document.getElementById('overlayInstruction').style.display = 'block';
            
            gameRunning = true;
            resize();
            initJoystick();
        });

        socket.on('you_died', (data) => {
            isSpectator = true;
            showCenterMsg("ELIMINATO", "Attendi il prossimo round...", '#ff4757');
        });

        socket.on('round_end', (data) => {
            showCenterMsg("FINE ROUND", `Vincitore: ${data.winnerName}`, '#f1c40f');
        });

        socket.on('respawn', (data) => {
            isSpectator = false;
            hideCenterMsg();
        });

        socket.on('game_over', (data) => {
            gameRunning = false;
            document.getElementById('topHud').style.display = 'none';
            hideCenterMsg();
            document.getElementById('victoryScreen').style.display = 'block';
            
            const tb = document.querySelector('#leaderboardTable tbody');
            tb.innerHTML = '';
            data.leaderboard.forEach((p, i) => {
                let rankClass = (i===0) ? 'rank-1' : (i===1 ? 'rank-2' : (i===2 ? 'rank-3' : ''));
                tb.innerHTML += `<tr class="${rankClass}"><td>${i+1}</td><td>${p.name}</td><td>${p.score}</td></tr>`;
            });
            
            if(joystickManager) joystickManager.destroy();
        });

        function showCenterMsg(title, sub, color) {
            const el = document.getElementById('centerMsg');
            document.getElementById('msgTitle').innerText = title;
            document.getElementById('msgTitle').style.color = color;
            document.getElementById('msgSub').innerText = sub;
            el.style.display = 'block';
        }
        function hideCenterMsg() { document.getElementById('centerMsg').style.display = 'none'; }


        // === 4. INPUT E RENDER ===
        function initJoystick() {
            if(joystickManager) joystickManager.destroy();
            joystickManager = nipplejs.create({ zone: document.getElementById('joystickZone'), mode: 'dynamic', color: 'white' });
            joystickManager.on('move', (evt, data) => { 
                if(data && data.angle) { joystickActive = true; joystickAngle = -data.angle.radian; }
            });
            joystickManager.on('end', () => joystickActive = false);
        }

        function updatePos(cx, cy) { mouseX = cx - window.innerWidth/2; mouseY = cy - window.innerHeight/2; }
        window.addEventListener('mousemove', e=>updatePos(e.clientX, e.clientY));
        window.addEventListener('mousedown', ()=> { if(!joystickActive) isPushing=true; }); 
        window.addEventListener('mouseup', ()=> { if(!joystickActive) isPushing=false; });

        function resize() {
            dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px';
            ctx.scale(dpr, dpr);
        }
        window.onresize = resize;

        setInterval(() => {
            if (!gameRunning) return;
            if (isSpectator) return;
            let finalAngle = joystickActive ? joystickAngle : Math.atan2(mouseY, mouseX);
            let finalPush = joystickActive ? true : isPushing;
            socket.emit('input', { angle: finalAngle, isPushing: finalPush });
        }, 50);

        socket.on('state', (state) => {
            if (!gameRunning) return;
            
            document.getElementById('roundDisplay').innerText = `ROUND ${state.round} / ${state.totalRounds}`;

            const w = window.innerWidth; const h = window.innerHeight;
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.translate(w/2, h/2);
            
            const scale = Math.min(1, (Math.min(w, h)/2) / (state.arenaRadius + 150));
            ctx.scale(scale, scale);

            // Arena
            ctx.beginPath();
            ctx.arc(0, 0, state.arenaRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#222'; ctx.fill();
            ctx.lineWidth = 20; ctx.strokeStyle = '#d63031'; ctx.stroke();

            // Giocatori
            for (let id in state.players) {
                let p = state.players[id];
                
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.inputAngle); 
                
                const size = p.radius * 2;
                const half = p.radius;
                
                // Disegna Skin
                ctx.beginPath(); ctx.rect(-half, -half, size, size);
                ctx.save(); ctx.clip();

                if (p.skin) {
                    if (!imageCache[id]) { const i = new Image(); i.src = p.skin; imageCache[id] = i; }
                    try { ctx.drawImage(imageCache[id], -half, -half, size, size); } 
                    catch(e) { ctx.fillStyle = p.color; ctx.fillRect(-half, -half, size, size); }
                } else {
                    ctx.fillStyle = p.color; ctx.fillRect(-half, -half, size, size);
                }
                ctx.restore();

                // Bordo
                ctx.beginPath(); ctx.rect(-half, -half, size, size);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
                
                // Occhi
                ctx.fillStyle = "white";
                ctx.fillRect(half/2, -half/2, 5, 5);
                ctx.fillRect(half/2, half/4, 5, 5);

                ctx.restore();

                // Nome
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1/scale, 1/scale);
                ctx.fillStyle = 'white'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
                ctx.shadowColor="black"; ctx.shadowBlur=4;
                ctx.fillText(p.name, 0, -(p.radius * scale) - 20);
                ctx.restore();
            }
            ctx.restore();
        });
    </script>
</body>
</html>
