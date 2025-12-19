const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Server state
const serverStartTime = Date.now();
const players = {};
const blocks = [];
const rooms = [];
const adminSockets = new Set();

// Create default room
rooms.push({
    id: 'default',
    name: 'Default Arena',
    maxPlayers: 16,
    type: 'public',
    players: {},
    blocks: []
});

function getAdminData() {
    return {
        playerCount: Object.keys(players).length,
        blockCount: blocks.length,
        rooms: rooms.map(room => ({
            id: room.id,
            name: room.name,
            maxPlayers: room.maxPlayers,
            type: room.type,
            playerCount: Object.keys(room.players).length,
            blockCount: room.blocks.length
        })),
        players: Object.values(players),
        serverStartTime
    };
}

function broadcastToAdmins(event, data) {
    adminSockets.forEach(socket => {
        socket.emit(event, data);
    });
}

io.on('connection', (socket) => {
    console.log('a socket connected:', socket.id);

    // Player registers as a game client
    socket.on('registerPlayer', () => {
        if (adminSockets.has(socket)) return; // Admins can't be players
        if (players[socket.id]) return; // Already registered
        
        console.log('Player registered:', socket.id);
        
        // Create a new player object
        players[socket.id] = {
            id: socket.id,
            x: 0,
            y: 3,
            z: 0,
            rotation: 0,
            playerId: socket.id,
            roomId: 'default'
        };

        // Add to default room
        const defaultRoom = rooms.find(r => r.id === 'default');
        if (defaultRoom) {
            defaultRoom.players[socket.id] = players[socket.id];
        }

        // Emit the current players to the new client
        socket.emit('currentPlayers', players);
        // Emit existing blocks to the new client
        socket.emit('currentBlocks', blocks);

        // Broadcast the new player to other clients
        socket.broadcast.emit('newPlayer', players[socket.id]);

        // Notify admins
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'join', message: `Player ${socket.id.substring(0, 8)} joined` });
    });

    socket.on('disconnect', () => {
        console.log('socket disconnected:', socket.id);
        
        // Check if it was a player
        if (players[socket.id]) {
            // Remove from room
            rooms.forEach(room => {
                delete room.players[socket.id];
            });
            
            delete players[socket.id];
            io.emit('disconnectPlayer', socket.id);
            
            // Notify admins
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { type: 'leave', message: `Player ${socket.id.substring(0, 8)} left` });
        }
        
        // Remove from admin sockets if it was an admin
        adminSockets.delete(socket);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].vx = movementData.vx || 0;
            players[socket.id].vy = movementData.vy || 0;
            players[socket.id].vz = movementData.vz || 0;
            players[socket.id].rotation = movementData.rotation;
            players[socket.id].animState = movementData.animState;
            players[socket.id].chargeLevel = movementData.chargeLevel;
            
            socket.broadcast.emit('playerMoved', {
                playerId: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                vx: players[socket.id].vx,
                vy: players[socket.id].vy,
                vz: players[socket.id].vz,
                rotation: players[socket.id].rotation,
                animState: players[socket.id].animState,
                chargeLevel: players[socket.id].chargeLevel
            });
        }
    });

    socket.on('spawnBlock', (blockData) => {
        blocks.push(blockData);
        socket.broadcast.emit('blockSpawned', blockData);
        broadcastToAdmins('adminData', getAdminData());
    });

    socket.on('shootBall', (ballData) => {
        socket.broadcast.emit('ballShot', ballData);
    });

    socket.on('shootUltimate', (ultimateData) => {
        socket.broadcast.emit('ultimateShot', ultimateData);
    });

    socket.on('playerDied', () => {
        socket.broadcast.emit('playerDied', socket.id);
    });

    socket.on('playerRespawned', () => {
        socket.broadcast.emit('playerRespawned', socket.id);
    });

    socket.on('clearBlocks', () => {
        blocks.length = 0;
        io.emit('clearBlocks');
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'action', message: `Blocks cleared by player ${socket.id.substring(0, 8)}` });
    });

    // Admin events
    socket.on('adminConnect', () => {
        adminSockets.add(socket);
        // If this socket was a player, remove them
        if (players[socket.id]) {
            rooms.forEach(room => {
                delete room.players[socket.id];
            });
            delete players[socket.id];
            io.emit('disconnectPlayer', socket.id);
        }
        socket.emit('adminData', getAdminData());
    });

    socket.on('adminCreateRoom', (roomData) => {
        const newRoom = {
            id: 'room_' + Date.now(),
            name: roomData.name,
            maxPlayers: roomData.maxPlayers,
            type: roomData.type,
            players: {},
            blocks: []
        };
        rooms.push(newRoom);
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'action', message: `Room "${roomData.name}" created` });
    });

    socket.on('adminDeleteRoom', (roomId) => {
        if (roomId === 'default') {
            return; // Can't delete default room
        }
        const index = rooms.findIndex(r => r.id === roomId);
        if (index > -1) {
            const roomName = rooms[index].name;
            rooms.splice(index, 1);
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { type: 'action', message: `Room "${roomName}" deleted` });
        }
    });

    socket.on('adminKickPlayer', (playerId) => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            playerSocket.disconnect(true);
            broadcastToAdmins('adminLog', { type: 'action', message: `Player ${playerId.substring(0, 8)} was kicked` });
        }
    });

    socket.on('adminClearAllBlocks', () => {
        blocks.length = 0;
        rooms.forEach(room => {
            room.blocks.length = 0;
        });
        io.emit('clearBlocks');
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'action', message: 'All blocks cleared by admin' });
    });
});

server.listen(3000, () => {
    console.log('🎮 Block Battle Arena server running on http://localhost:3000');
    console.log('⚙️  Admin panel available at http://localhost:3000/admin');
});
