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
const ADMIN_PASSWORD = "placeholder"; // Admin panel password

// Create default room
rooms.push({
    id: 'default',
    name: 'Default Arena',
    maxPlayers: 16,
    type: 'public',
    players: {},
    blocks: [],
    code: null // No code for public rooms
});

// Helper function to generate room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Format as XXX-XXX
    return code.substring(0, 3) + '-' + code.substring(3);
}

function getAdminData() {
    return {
        playerCount: Object.keys(players).length,
        blockCount: blocks.length,
        rooms: rooms.map(room => ({
            id: room.id,
            name: room.name,
            maxPlayers: room.maxPlayers,
            type: room.type,
            code: room.code, // Include room code for admin
            playerCount: Object.keys(room.players).length,
            blockCount: room.blocks.length,
            players: Object.values(room.players).map(p => ({
                id: p.id,
                username: p.username,
                ip: p.ip
            }))
        })),
        players: Object.values(players).map(p => ({
            id: p.id,
            username: p.username,
            ip: p.ip,
            roomId: p.roomId,
            roomName: rooms.find(r => r.id === p.roomId)?.name || 'Unknown'
        })),
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
    
    // Get client IP address
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    // Player registers as a game client
    socket.on('registerPlayer', (data) => {
        if (adminSockets.has(socket)) return; // Admins can't be players
        
        const roomId = data.roomId || 'default';
        const room = rooms.find(r => r.id === roomId);
        
        if (!room) {
            socket.emit('joinRoomError', { message: 'Room not found' });
            return;
        }
        
        if (Object.keys(room.players).length >= room.maxPlayers) {
            socket.emit('joinRoomError', { message: 'Room is full' });
            return;
        }
        
        // If player was already in a different room, remove them
        if (players[socket.id] && players[socket.id].roomId !== roomId) {
            const oldRoomId = players[socket.id].roomId;
            const oldRoom = rooms.find(r => r.id === oldRoomId);
            if (oldRoom) {
                delete oldRoom.players[socket.id];
                socket.leave(oldRoomId);
                socket.to(oldRoomId).emit('disconnectPlayer', socket.id);
            }
        }
        
        console.log('Player registered:', socket.id, 'Username:', data.username, 'Room:', room.name);
        
        // Create or update player object
        players[socket.id] = {
            id: socket.id,
            username: (data && data.username) ? data.username : "Player",
            ip: clientIp,
            x: 0,
            y: 3,
            z: 0,
            rotation: 0,
            playerId: socket.id,
            roomId: roomId
        };

        // Add to room
        room.players[socket.id] = players[socket.id];
        
        // Emit the current players IN THE SAME ROOM to the new client
        const roomPlayers = {};
        Object.keys(room.players).forEach(id => {
            if (players[id]) {
                roomPlayers[id] = players[id];
            }
        });
        socket.emit('currentPlayers', roomPlayers);
        
        // Emit existing blocks in the room to the new client
        socket.emit('currentBlocks', room.blocks);
        
        // Emit available rooms to the client
        socket.emit('availableRooms', rooms.map(r => ({
            id: r.id,
            name: r.name,
            playerCount: Object.keys(r.players).length,
            maxPlayers: r.maxPlayers,
            type: r.type
        })));

        // Broadcast the new player to other clients IN THE SAME ROOM
        socket.to(roomId).emit('newPlayer', players[socket.id]);
        
        // Join the room for socket.io broadcasts
        socket.join(roomId);

        // Notify admins
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'join', message: `${data.username} (${socket.id.substring(0, 8)}) joined ${room.name}` });
    });

    socket.on('disconnect', () => {
        console.log('socket disconnected:', socket.id);
        
        // Check if it was a player
        if (players[socket.id]) {
            const playerName = players[socket.id].username;
            const roomId = players[socket.id].roomId;
            const room = rooms.find(r => r.id === roomId);
            const roomName = room ? room.name : 'Unknown';
            
            // Remove from room
            rooms.forEach(room => {
                delete room.players[socket.id];
            });
            
            delete players[socket.id];
            
            // Only notify players in the same room
            socket.to(roomId).emit('disconnectPlayer', socket.id);
            
            // Notify admins
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { type: 'leave', message: `${playerName} (${socket.id.substring(0, 8)}) left ${roomName}` });
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
            players[socket.id].grenadeChargeLevel = movementData.grenadeChargeLevel;
            players[socket.id].droneChargeLevel = movementData.droneChargeLevel;
            players[socket.id].isDroneMode = movementData.isDroneMode;
            players[socket.id].droneX = movementData.droneX;
            players[socket.id].droneY = movementData.droneY;
            players[socket.id].droneZ = movementData.droneZ;
            
            const roomId = players[socket.id].roomId;
            
            // Only broadcast to players in the same room
            socket.to(roomId).emit('playerMoved', {
                playerId: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                vx: players[socket.id].vx,
                vy: players[socket.id].vy,
                vz: players[socket.id].vz,
                rotation: players[socket.id].rotation,
                animState: players[socket.id].animState,
                chargeLevel: players[socket.id].chargeLevel,
                grenadeChargeLevel: players[socket.id].grenadeChargeLevel,
                droneChargeLevel: players[socket.id].droneChargeLevel,
                isDroneMode: players[socket.id].isDroneMode,
                droneX: players[socket.id].droneX,
                droneY: players[socket.id].droneY,
                droneZ: players[socket.id].droneZ
            });
        }
    });

    socket.on('spawnBlock', (blockData) => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                room.blocks.push(blockData);
                // Only broadcast to players in the same room
                socket.to(roomId).emit('blockSpawned', blockData);
                broadcastToAdmins('adminData', getAdminData());
            }
        }
    });

    // Handle block hit (knockback sync)
    socket.on('blockHit', (hitData) => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Broadcast to other players in the same room
            socket.to(roomId).emit('blockHit', hitData);
        }
    });

    socket.on('shootBall', (ballData) => {
        // Add shooter ID to ball data
        ballData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('ballShot', ballData);
        }
    });

    socket.on('shootUltimate', (ultimateData) => {
        // Add shooter ID to ultimate data
        ultimateData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('ultimateShot', ultimateData);
        }
    });

    socket.on('batSwing', (batData) => {
        batData.playerId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('batSwung', batData);
        }
    });

    socket.on('shootGrenade', (grenadeData) => {
        grenadeData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('grenadeShot', grenadeData);
        }
    });

    socket.on('grenadeExploded', (explosionData) => {
        explosionData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Broadcast explosion to ALL players in the room including the sender
            io.to(roomId).emit('grenadeExplosion', explosionData);
        }
    });

    // Drone bomb exploded (lighter effect than grenade)
    socket.on('droneBombExploded', (explosionData) => {
        explosionData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Broadcast to other players only (not the sender - they already see it)
            socket.to(roomId).emit('droneBombExplosion', explosionData);
        }
    });

    // Drone bomb dropped (so others can see the falling bomb)
    socket.on('droneBombDropped', (bombData) => {
        bombData.shooterId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            socket.to(roomId).emit('droneBombDropped', bombData);
        }
    });

    // Drone was hit by a projectile
    socket.on('droneHit', (hitData) => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Notify the drone owner that their drone was hit
            io.to(hitData.droneOwnerId).emit('yourDroneHit', hitData);
        }
    });

    // Mine placed by player
    socket.on('minePlaced', (mineData) => {
        mineData.placerId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Broadcast to other players in the room
            socket.to(roomId).emit('minePlaced', mineData);
        }
    });

    // Mine triggered
    socket.on('mineTriggered', (mineData) => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Broadcast to all players in the room
            io.to(roomId).emit('mineTriggered', mineData);
        }
    });

    socket.on('grappleStart', (grappleData) => {
        grappleData.playerId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            socket.to(roomId).emit('playerGrappleStart', grappleData);
        }
    });

    socket.on('grappleEnd', (grappleData) => {
        grappleData = grappleData || {};
        grappleData.playerId = socket.id;
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            socket.to(roomId).emit('playerGrappleEnd', grappleData);
        }
    });

    socket.on('playerDied', (data) => {
        const killerId = data ? data.killerId : null;
        const cause = data ? data.cause : 'unknown';
        const killerName = (killerId && players[killerId]) ? players[killerId].username : 'Unknown';
        
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('playerDied', { 
                playerId: socket.id,
                killerId: killerId,
                killerName: killerName,
                cause: cause
            });
            
            if (killerId && players[killerId]) {
                // Notify the killer
                io.to(killerId).emit('killConfirmed', {
                    victimId: socket.id,
                    victimName: players[socket.id] ? players[socket.id].username : 'Player'
                });
            }
        }
    });

    socket.on('playerRespawned', () => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            // Only broadcast to players in the same room
            socket.to(roomId).emit('playerRespawned', socket.id);
        }
    });

    socket.on('clearBlocks', () => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                room.blocks.length = 0;
                // Only clear for players in the same room
                io.to(roomId).emit('clearBlocks');
                broadcastToAdmins('adminData', getAdminData());
                broadcastToAdmins('adminLog', { type: 'action', message: `Blocks cleared in ${room.name} by ${players[socket.id].username}` });
            }
        }
    });
    
    // Get available rooms
    socket.on('getRooms', () => {
        socket.emit('availableRooms', rooms.map(r => ({
            id: r.id,
            name: r.name,
            playerCount: Object.keys(r.players).length,
            maxPlayers: r.maxPlayers,
            type: r.type
        })));
    });
    
    // Leave room
    socket.on('leaveRoom', (data) => {
        if (players[socket.id]) {
            const roomId = data.roomId;
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                delete room.players[socket.id];
                socket.leave(roomId);
                socket.to(roomId).emit('disconnectPlayer', socket.id);
            }
        }
    });
    
    // Join private room with code
    socket.on('joinPrivateRoom', (data) => {
        const code = data.code.toUpperCase();
        const room = rooms.find(r => r.type === 'private' && r.code === code);
        
        if (!room) {
            socket.emit('privateRoomError', { message: 'Invalid room code' });
            return;
        }
        
        if (Object.keys(room.players).length >= room.maxPlayers) {
            socket.emit('privateRoomError', { message: 'Room is full' });
            return;
        }
        
        // Leave current room if in one
        if (players[socket.id]) {
            const oldRoomId = players[socket.id].roomId;
            const oldRoom = rooms.find(r => r.id === oldRoomId);
            if (oldRoom) {
                delete oldRoom.players[socket.id];
                socket.leave(oldRoomId);
                socket.to(oldRoomId).emit('disconnectPlayer', socket.id);
            }
        }
        
        // Join the private room
        players[socket.id] = {
            id: socket.id,
            username: data.username,
            ip: clientIp,
            x: 0,
            y: 3,
            z: 0,
            rotation: 0,
            playerId: socket.id,
            roomId: room.id
        };
        
        room.players[socket.id] = players[socket.id];
        
        // Get room players
        const roomPlayers = {};
        Object.keys(room.players).forEach(id => {
            if (players[id]) {
                roomPlayers[id] = players[id];
            }
        });
        
        socket.emit('currentPlayers', roomPlayers);
        socket.emit('currentBlocks', room.blocks);
        socket.to(room.id).emit('newPlayer', players[socket.id]);
        socket.join(room.id);
        
        socket.emit('privateRoomJoined', { roomId: room.id, roomName: room.name });
        
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'join', message: `${data.username} (${socket.id.substring(0, 8)}) joined private room ${room.name}` });
    });

    // Admin events
    socket.on('adminConnect', (data) => {
        // Verify admin password
        if (!data || data.password !== ADMIN_PASSWORD) {
            socket.emit('adminAuthFailed', { message: 'Invalid password' });
            return;
        }
        
        adminSockets.add(socket);
        // If this socket was a player, remove them
        if (players[socket.id]) {
            rooms.forEach(room => {
                delete room.players[socket.id];
            });
            delete players[socket.id];
            io.emit('disconnectPlayer', socket.id);
        }
        socket.emit('adminAuthSuccess');
        socket.emit('adminData', getAdminData());
    });

    socket.on('adminCreateRoom', (roomData) => {
        const roomCode = roomData.type === 'private' ? generateRoomCode() : null;
        const newRoom = {
            id: 'room_' + Date.now(),
            name: roomData.name,
            maxPlayers: roomData.maxPlayers,
            type: roomData.type,
            code: roomCode,
            players: {},
            blocks: []
        };
        rooms.push(newRoom);
        broadcastToAdmins('adminData', getAdminData());
        const codeMsg = roomCode ? ` (Code: ${roomCode})` : '';
        broadcastToAdmins('adminLog', { type: 'action', message: `Room "${roomData.name}" created${codeMsg}` });
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

server.listen(80, () => {
    console.log('🎮 Block Battle Arena server running on http://localhost');
    console.log('⚙️  Admin panel available at http://localhost/admin');
});
