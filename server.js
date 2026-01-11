const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');
const session = require('express-session');
const db = require('./database');

// Session configuration
const sessionMiddleware = session({
    secret: 'block-battle-arena-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Static files (but protect admin)
app.use((req, res, next) => {
    // Block direct access to admin.html without authentication
    if (req.path === '/admin.html') {
        return res.redirect('/admin/login');
    }
    next();
});

app.use(express.static(__dirname, {
    index: false
}));

// ============ AUTH ROUTES ============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/profile/:profileId', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

app.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// API: Register
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    if (username.length < 3 || username.length > 15) {
        return res.status(400).json({ success: false, error: 'Username must be 3-15 characters' });
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, and underscores' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await db.createUser(username, email, password);
    
    if (result.success) {
        const loginResult = await db.loginUser(username, password, ip, req.headers['user-agent']);
        if (loginResult.success) {
            req.session.user = loginResult.user;
            return res.json({ success: true, user: loginResult.user });
        }
    }
    
    res.status(400).json(result);
});

// API: Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await db.loginUser(username, password, ip, req.headers['user-agent']);
    
    if (result.success) {
        req.session.user = result.user;
        res.json({ success: true, user: result.user });
    } else {
        res.status(401).json(result);
    }
});

// API: Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// API: Change password
app.post('/api/auth/change-password', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Current and new password required' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }
    
    const result = await db.changePassword(req.session.user.id, currentPassword, newPassword);
    
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(400).json(result);
    }
});

// API: Get current user
app.get('/api/auth/me', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.json({ success: false, user: null });
    }
});

// API: Get public profile
app.get('/api/profile/:profileId', (req, res) => {
    const profile = db.getPublicProfile(req.params.profileId);
    
    if (profile) {
        const kdr = profile.deaths > 0 
            ? (profile.kills / profile.deaths).toFixed(2) 
            : profile.kills.toFixed(2);
        
        res.json({
            success: true,
            profile: {
                username: profile.username,
                profileId: profile.profile_id,
                memberSince: profile.member_since,
                isAdmin: profile.is_admin === 1,
                isVIP: profile.is_vip === 1,
                profilePhoto: profile.profile_photo,
                profileBio: profile.profile_bio,
                profileTitle: profile.profile_title,
                stats: {
                    kills: profile.kills,
                    deaths: profile.deaths,
                    kdr: parseFloat(kdr),
                    gamesPlayed: profile.games_played,
                    timePlayed: profile.time_played,
                    blocksPlaced: profile.blocks_placed,
                    weaponKills: {
                        ball: profile.ball_kills,
                        ultimate: profile.ultimate_kills,
                        grenade: profile.grenade_kills,
                        bat: profile.bat_kills,
                        drone: profile.drone_kills,
                        mine: profile.mine_kills,
                        knockback: profile.knockback_kills
                    }
                }
            }
        });
    } else {
        res.status(404).json({ success: false, error: 'Profile not found' });
    }
});

// API: Get leaderboard
app.get('/api/leaderboard', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const leaderboard = db.getLeaderboard(limit);
    
    res.json({
        success: true,
        leaderboard: leaderboard.map((entry, index) => ({
            rank: index + 1,
            username: entry.username,
            profileId: entry.profile_id,
            kills: entry.kills,
            deaths: entry.deaths,
            kdr: entry.kdr,
            gamesPlayed: entry.games_played,
            isAdmin: entry.is_admin === 1,
            isVIP: entry.is_vip === 1,
            profilePhoto: entry.profile_photo,
            profileBio: entry.profile_bio,
            profileTitle: entry.profile_title
        }))
    });
});

// API: Update profile (VIP only features)
app.post('/api/profile/update', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const user = db.getUserById(req.session.user.id);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // VIP users can update bio, title, and photo
    // Regular users can only update photo
    const { photo, bio, title } = req.body;
    
    // Validate photo URL if provided
    if (photo && photo.length > 500) {
        return res.status(400).json({ success: false, error: 'Photo URL too long' });
    }
    
    // Only VIP users can set bio and title
    const isVIP = user.is_vip === 1 || user.is_admin === 1;
    
    if (!isVIP && (bio || title)) {
        return res.status(403).json({ success: false, error: 'VIP membership required for bio and title customization' });
    }
    
    // Validate bio and title length
    if (bio && bio.length > 200) {
        return res.status(400).json({ success: false, error: 'Bio must be under 200 characters' });
    }
    
    if (title && title.length > 30) {
        return res.status(400).json({ success: false, error: 'Title must be under 30 characters' });
    }
    
    // Update profile
    db.updateProfile(
        user.id,
        photo || user.profile_photo,
        isVIP ? (bio !== undefined ? bio : user.profile_bio) : user.profile_bio,
        isVIP ? (title !== undefined ? title : user.profile_title) : user.profile_title
    );
    
    // Update session
    req.session.user.profilePhoto = photo || user.profile_photo;
    if (isVIP) {
        req.session.user.profileBio = bio !== undefined ? bio : user.profile_bio;
        req.session.user.profileTitle = title !== undefined ? title : user.profile_title;
    }
    
    res.json({ success: true });
});

// ============ ADMIN ROUTES ============

app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
    if (req.session.adminToken) {
        const adminSession = db.validateAdminSession(req.session.adminToken);
        if (adminSession && adminSession.is_admin) {
            return res.redirect('/admin/dashboard');
        }
    }
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Credentials required' });
    }
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await db.loginUser(username, password, ip, req.headers['user-agent']);
    
    if (result.success && result.user.isAdmin) {
        const token = db.createAdminSession(result.user.id, ip);
        req.session.adminToken = token;
        req.session.adminUser = result.user;
        res.json({ success: true, user: result.user });
    } else if (result.success && !result.user.isAdmin) {
        res.status(403).json({ success: false, error: 'Not authorized as admin' });
    } else {
        res.status(401).json(result);
    }
});

app.post('/api/admin/logout', (req, res) => {
    if (req.session.adminToken) {
        db.deleteAdminSession(req.session.adminToken);
    }
    req.session.adminToken = null;
    req.session.adminUser = null;
    res.json({ success: true });
});

function requireAdmin(req, res, next) {
    if (!req.session.adminToken) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const adminSession = db.validateAdminSession(req.session.adminToken);
    if (!adminSession || !adminSession.is_admin) {
        req.session.adminToken = null;
        return res.status(401).json({ success: false, error: 'Session expired or invalid' });
    }
    
    req.adminUser = adminSession;
    next();
}

app.get('/admin/dashboard', (req, res) => {
    if (!req.session.adminToken) {
        return res.redirect('/admin/login');
    }
    
    const adminSession = db.validateAdminSession(req.session.adminToken);
    if (!adminSession || !adminSession.is_admin) {
        return res.redirect('/admin/login');
    }
    
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: Get all users (admin)
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.getAllUsers();
    const usersWithIPs = users.map(user => ({
        ...user,
        ips: db.getUserIPs(user.id),
        stats: db.getStats(user.id)
    }));
    res.json({ success: true, users: usersWithIPs });
});

// API: Get user details (admin)
app.get('/api/admin/users/:userId', requireAdmin, (req, res) => {
    const user = db.getUserById(parseInt(req.params.userId));
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            profileId: user.profile_id,
            createdAt: user.created_at,
            lastLogin: user.last_login,
            isAdmin: user.is_admin === 1,
            isBanned: user.is_banned === 1,
            banReason: user.ban_reason
        },
        ips: db.getUserIPs(user.id),
        loginHistory: db.getLoginHistory(user.id),
        stats: db.getStats(user.id)
    });
});

// API: Get users by IP (admin)
app.get('/api/admin/ip/:ip', requireAdmin, (req, res) => {
    const users = db.getUsersByIP(req.params.ip);
    res.json({ success: true, users });
});

// API: Ban user (admin)
app.post('/api/admin/users/:userId/ban', requireAdmin, (req, res) => {
    try {
        const { reason } = req.body;
        const userId = parseInt(req.params.userId);
        
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }
        
        db.banUser(userId, reason || 'No reason provided');
        
        // Kick player if online
        for (const [socketId, player] of Object.entries(players)) {
            if (player.odPlayerId === userId) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('banned', { reason: reason || 'No reason provided' });
                    socket.disconnect(true);
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ success: false, error: 'Failed to ban user' });
    }
});

// API: Unban user (admin)
app.post('/api/admin/users/:userId/unban', requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (isNaN(userId)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }
        
        db.unbanUser(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error unbanning user:', error);
        res.status(500).json({ success: false, error: 'Failed to unban user' });
    }
});

// API: Set admin status (admin)
app.post('/api/admin/users/:userId/admin', requireAdmin, (req, res) => {
    const { isAdmin } = req.body;
    db.setUserAdmin(parseInt(req.params.userId), isAdmin);
    res.json({ success: true });
});

// API: Set VIP status (admin)
app.post('/api/admin/users/:userId/vip', requireAdmin, (req, res) => {
    const { isVIP } = req.body;
    db.setUserVIP(parseInt(req.params.userId), isVIP);
    res.json({ success: true });
});

// ============ SERVER STATE ============

const serverStartTime = Date.now();
const players = {};
const blocks = [];
const rooms = [];
const adminSockets = new Set();

// Available maps for rooms
const AVAILABLE_MAPS = ['default', 'tokyo', 'plaza'];

// Create default room
rooms.push({
    id: 'default',
    name: 'Default Arena',
    maxPlayers: 16,
    type: 'public',
    players: {},
    blocks: [],
    code: null, // No code for public rooms
    hardcoreMode: false, // No walls in hardcore mode
    mapId: 'default' // Map for this room
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
        availableMaps: AVAILABLE_MAPS,
        rooms: rooms.map(room => ({
            id: room.id,
            name: room.name,
            maxPlayers: room.maxPlayers,
            type: room.type,
            code: room.code,
            hardcoreMode: room.hardcoreMode || false,
            mapId: room.mapId || 'default',
            playerCount: Object.keys(room.players).length,
            blockCount: room.blocks.length,
            players: Object.values(room.players).map(p => ({
                id: p.id,
                odPlayerId: p.odPlayerId,
                username: p.username,
                profileId: p.profileId,
                ip: p.ip
            }))
        })),
        players: Object.values(players).map(p => ({
            id: p.id,
            odPlayerId: p.odPlayerId,
            username: p.username,
            profileId: p.profileId,
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
    
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const session = socket.request.session;

    // Player registers as a game client
    socket.on('registerPlayer', (data) => {
        if (adminSockets.has(socket)) return;
        
        // Check if user is authenticated
        if (!session || !session.user) {
            socket.emit('authRequired');
            return;
        }
        
        // Check if user is banned
        const user = db.getUserById(session.user.id);
        if (user && user.is_banned) {
            socket.emit('banned', { reason: user.ban_reason || 'No reason provided' });
            return;
        }
        
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
        
        console.log('Player registered:', socket.id, 'Username:', session.user.username, 'Room:', room.name, 'Skin:', data.skin || 'default');
        
        // Track IP
        db.trackUserIP(session.user.id, clientIp);
        
        // Increment games played
        db.statements.incrementGamesPlayed.run(session.user.id);
        
        // Create or update player object
        players[socket.id] = {
            id: socket.id,
            odPlayerId: session.user.id,
            username: session.user.username,
            profileId: session.user.profileId,
            profilePhoto: user.profile_photo,
            isAdmin: user.is_admin === 1,
            isVIP: user.is_vip === 1,
            profileTitle: user.profile_title,
            ip: clientIp,
            x: 0,
            y: 3,
            z: 0,
            rotation: 0,
            playerId: socket.id,
            roomId: roomId,
            joinTime: Date.now(),
            skin: data.skin || 'default' // Player's selected skin
        };

        // Add to room
        room.players[socket.id] = players[socket.id];
        
        // Emit the current players IN THE SAME ROOM to the new client
        const roomPlayers = {};
        Object.keys(room.players).forEach(id => {
            if (players[id]) {
                roomPlayers[id] = {
                    ...players[id],
                    profileId: players[id].profileId
                };
            }
        });
        socket.emit('currentPlayers', roomPlayers);
        
        // Emit room settings (including hardcore mode and map)
        socket.emit('roomSettings', {
            roomId: room.id,
            roomName: room.name,
            hardcoreMode: room.hardcoreMode || false,
            mapId: room.mapId || 'default'
        });
        
        // Emit existing blocks in the room to the new client
        socket.emit('currentBlocks', room.blocks);
        
        // Emit available rooms to the client
        socket.emit('availableRooms', rooms.map(r => ({
            id: r.id,
            name: r.name,
            playerCount: Object.keys(r.players).length,
            maxPlayers: r.maxPlayers,
            type: r.type,
            mapId: r.mapId || 'default'
        })));

        // Broadcast the new player to other clients IN THE SAME ROOM
        socket.to(roomId).emit('newPlayer', {
            ...players[socket.id],
            profileId: players[socket.id].profileId
        });
        
        // Join the room for socket.io broadcasts
        socket.join(roomId);

        // Notify admins
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'join', message: `${session.user.username} (${socket.id.substring(0, 8)}) joined ${room.name}` });
    });

    socket.on('disconnect', () => {
        console.log('socket disconnected:', socket.id);
        
        // Check if it was a player
        if (players[socket.id]) {
            const player = players[socket.id];
            const roomId = player.roomId;
            const room = rooms.find(r => r.id === roomId);
            const roomName = room ? room.name : 'Unknown';
            
            // Track time played
            if (player.joinTime && player.odPlayerId) {
                const timePlayed = Math.floor((Date.now() - player.joinTime) / 1000);
                db.statements.addTimePlayed.run(timePlayed, player.odPlayerId);
            }
            
            // Remove from room
            rooms.forEach(room => {
                delete room.players[socket.id];
            });
            
            delete players[socket.id];
            
            // Only notify players in the same room
            socket.to(roomId).emit('disconnectPlayer', socket.id);
            
            // Notify admins
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { type: 'leave', message: `${player.username} (${socket.id.substring(0, 8)}) left ${roomName}` });
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
                
                // Track blocks placed
                if (players[socket.id].odPlayerId) {
                    db.incrementBlocksPlaced(players[socket.id].odPlayerId);
                }
                
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

    // Handle skin change
    socket.on('skinChanged', (data) => {
        if (players[socket.id] && data.skin) {
            players[socket.id].skin = data.skin;
            const roomId = players[socket.id].roomId;
            // Broadcast skin change to other players in the same room
            socket.to(roomId).emit('playerSkinChanged', {
                playerId: socket.id,
                skin: data.skin
            });
            console.log(`Player ${players[socket.id].username} changed skin to: ${data.skin}`);
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        const player = players[socket.id];
        if (!player) return;

        // Rate limiting: 1 message per second (500ms for VIP/Admin)
        const now = Date.now();
        const cooldown = (player.isAdmin || player.isVIP) ? 500 : 1000;
        
        if (player.lastMessageTime && (now - player.lastMessageTime) < cooldown) {
            const timeLeft = Math.ceil((cooldown - (now - player.lastMessageTime)) / 1000);
            socket.emit('chatError', { message: `Please wait ${timeLeft}s before sending another message.` });
            return;
        }

        // Basic message validation
        if (typeof message !== 'string' || message.trim().length === 0) return;
        const sanitizedMessage = message.trim().substring(0, 100);

        // Update last message time
        player.lastMessageTime = now;

        const chatData = {
            id: socket.id,
            username: player.username,
            message: sanitizedMessage,
            isAdmin: player.isAdmin,
            isVIP: player.isVIP,
            profileTitle: player.profileTitle,
            profileId: player.profileId,
            profilePicUrl: player.profilePhoto
        };

        // Broadcast to everyone in the same room
        io.to(player.roomId).emit('chatMessage', chatData);
        
        // Notify admins
        broadcastToAdmins('adminLog', { 
            type: 'chat', 
            message: `[CHAT] ${player.username}: ${sanitizedMessage}`,
            roomId: player.roomId
        });
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
        
        if (players[socket.id]) {
            const victim = players[socket.id];
            const killer = killerId ? players[killerId] : null;
            const killerName = killer ? killer.username : 'Unknown';
            const roomId = victim.roomId;
            
            // Record kill in database
            if (victim.odPlayerId) {
                const killerDbId = killer ? killer.odPlayerId : null;
                db.recordKill(killerDbId, victim.odPlayerId, cause, roomId);
            }
            
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
                    victimName: victim.username
                });
                
                // Send system message to chat about the kill
                const weaponName = {
                    'ball': 'Ball',
                    'ultimate': 'Ultimate Ball',
                    'grenade': 'Grenade',
                    'bat': 'Katana',
                    'drone': 'Drone Bomb',
                    'mine': 'Mine',
                    'knockback': 'Knockback'
                }[cause] || cause;
                
                io.to(roomId).emit('chatMessage', {
                    isSystem: true,
                    message: `${victim.username} was killed by ${killer.username} with ${weaponName}`
                });
            } else {
                // Death without killer (fall, suicide, etc.)
                const deathMessage = cause === 'fall' ? `${victim.username} fell to their death` :
                                    cause === 'ceiling' ? `${victim.username} flew too high` :
                                    `${victim.username} died`;
                
                io.to(roomId).emit('chatMessage', {
                    isSystem: true,
                    message: deathMessage
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
            type: r.type,
            mapId: r.mapId || 'default'
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
        if (!session || !session.user) {
            socket.emit('authRequired');
            return;
        }
        
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
            odPlayerId: session.user.id,
            username: session.user.username,
            profileId: session.user.profileId,
            ip: clientIp,
            x: 0,
            y: 3,
            z: 0,
            rotation: 0,
            playerId: socket.id,
            roomId: room.id,
            joinTime: Date.now()
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
        broadcastToAdmins('adminLog', { type: 'join', message: `${session.user.username} (${socket.id.substring(0, 8)}) joined private room ${room.name}` });
    });

    // Admin events (require authenticated admin session via HTTP)
    socket.on('adminConnect', () => {
        if (!session || !session.adminToken) {
            socket.emit('adminAuthFailed', { message: 'Not authenticated. Please login via /admin/login' });
            return;
        }
        
        const adminSession = db.validateAdminSession(session.adminToken);
        if (!adminSession || !adminSession.is_admin) {
            socket.emit('adminAuthFailed', { message: 'Invalid or expired session' });
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
        if (!adminSockets.has(socket)) return;
        
        const roomCode = roomData.type === 'private' ? generateRoomCode() : null;
        const mapId = AVAILABLE_MAPS.includes(roomData.mapId) ? roomData.mapId : 'default';
        const newRoom = {
            id: 'room_' + Date.now(),
            name: roomData.name,
            maxPlayers: roomData.maxPlayers,
            type: roomData.type,
            code: roomCode,
            hardcoreMode: roomData.hardcoreMode || false,
            mapId: mapId,
            players: {},
            blocks: []
        };
        rooms.push(newRoom);
        broadcastToAdmins('adminData', getAdminData());
        const codeMsg = roomCode ? ` (Code: ${roomCode})` : '';
        const hardcoreMsg = newRoom.hardcoreMode ? ' [HARDCORE]' : '';
        const mapMsg = mapId !== 'default' ? ` [Map: ${mapId}]` : '';
        broadcastToAdmins('adminLog', { type: 'action', message: `Room "${roomData.name}" created${codeMsg}${hardcoreMsg}${mapMsg}` });
    });

    socket.on('adminDeleteRoom', (roomId) => {
        console.log('adminDeleteRoom received, roomId:', roomId);
        console.log('Is admin socket:', adminSockets.has(socket));
        
        if (!adminSockets.has(socket)) {
            console.log('Rejected: socket not in adminSockets');
            return;
        }
        
        if (roomId === 'default') {
            console.log('Rejected: cannot delete default room');
            return; // Can't delete default room
        }
        const index = rooms.findIndex(r => r.id === roomId);
        console.log('Room index found:', index);
        
        if (index > -1) {
            const room = rooms[index];
            const roomName = room.name;
            const defaultRoom = rooms.find(r => r.id === 'default');
            
            // Move all players in this room to the default room
            Object.keys(room.players).forEach(socketId => {
                const playerSocket = io.sockets.sockets.get(socketId);
                const player = players[socketId];
                
                if (playerSocket && player) {
                    // Leave the old room
                    playerSocket.leave(roomId);
                    
                    // Remove from old room
                    delete room.players[socketId];
                    
                    // Add to default room
                    player.roomId = 'default';
                    defaultRoom.players[socketId] = player;
                    
                    // Join the default room
                    playerSocket.join('default');
                    
                    // Notify the player they've been moved
                    playerSocket.emit('roomDeleted', {
                        message: `Room "${roomName}" was deleted. You have been moved to the Default Arena.`,
                        newRoomId: 'default',
                        newRoomName: 'Default Arena'
                    });
                    
                    // Send room settings for the new room
                    playerSocket.emit('roomSettings', {
                        roomId: 'default',
                        roomName: 'Default Arena',
                        hardcoreMode: defaultRoom.hardcoreMode || false,
                        mapId: defaultRoom.mapId || 'default'
                    });
                    
                    // Send current players in the default room
                    const roomPlayers = {};
                    Object.keys(defaultRoom.players).forEach(id => {
                        if (players[id]) {
                            roomPlayers[id] = {
                                ...players[id],
                                profileId: players[id].profileId
                            };
                        }
                    });
                    playerSocket.emit('currentPlayers', roomPlayers);
                    
                    // Send blocks in the default room
                    playerSocket.emit('currentBlocks', defaultRoom.blocks);
                    
                    // Notify other players in the default room about this player
                    playerSocket.to('default').emit('newPlayer', {
                        ...player,
                        profileId: player.profileId
                    });
                }
            });
            
            // Remove the room
            rooms.splice(index, 1);
            
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { type: 'action', message: `Room "${roomName}" deleted` });
        }
    });

    socket.on('adminToggleHardcore', (roomId) => {
        if (!adminSockets.has(socket)) return;
        
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            room.hardcoreMode = !room.hardcoreMode;
            
            // Notify all players in the room about the mode change
            io.to(roomId).emit('roomSettings', {
                roomId: room.id,
                roomName: room.name,
                hardcoreMode: room.hardcoreMode,
                mapId: room.mapId || 'default'
            });
            
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { 
                type: 'action', 
                message: `Room "${room.name}" hardcore mode ${room.hardcoreMode ? 'ENABLED' : 'DISABLED'}` 
            });
        }
    });

    // Admin change room map
    socket.on('adminChangeMap', (data) => {
        if (!adminSockets.has(socket)) return;
        
        const { roomId, mapId } = data;
        const room = rooms.find(r => r.id === roomId);
        if (room && AVAILABLE_MAPS.includes(mapId)) {
            const oldMapId = room.mapId || 'default';
            room.mapId = mapId;
            
            // Notify all players in the room about the map change
            io.to(roomId).emit('roomSettings', {
                roomId: room.id,
                roomName: room.name,
                hardcoreMode: room.hardcoreMode || false,
                mapId: room.mapId
            });
            
            broadcastToAdmins('adminData', getAdminData());
            broadcastToAdmins('adminLog', { 
                type: 'action', 
                message: `Room "${room.name}" map changed from ${oldMapId} to ${mapId}` 
            });
        }
    });

    socket.on('adminGetRoomDetails', (roomId) => {
        if (!adminSockets.has(socket)) return;
        
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            socket.emit('adminRoomDetails', {
                id: room.id,
                name: room.name,
                maxPlayers: room.maxPlayers,
                type: room.type,
                code: room.code,
                hardcoreMode: room.hardcoreMode || false,
                playerCount: Object.keys(room.players).length,
                blockCount: room.blocks.length,
                players: Object.values(room.players).map(p => ({
                    id: p.id,
                    username: p.username,
                    profileId: p.profileId,
                    ip: p.ip
                }))
            });
        } else {
            socket.emit('adminRoomDetails', null);
        }
    });

    socket.on('adminKickPlayer', (playerId) => {
        if (!adminSockets.has(socket)) return;
        
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            playerSocket.disconnect(true);
            broadcastToAdmins('adminLog', { type: 'action', message: `Player ${playerId.substring(0, 8)} was kicked` });
        }
    });

    socket.on('adminClearAllBlocks', () => {
        if (!adminSockets.has(socket)) return;
        
        blocks.length = 0;
        rooms.forEach(room => {
            room.blocks.length = 0;
        });
        io.emit('clearBlocks');
        broadcastToAdmins('adminData', getAdminData());
        broadcastToAdmins('adminLog', { type: 'action', message: 'All blocks cleared by admin' });
    });
});

// Clean expired sessions periodically
setInterval(() => {
    db.cleanExpiredSessions();
}, 60 * 60 * 1000);

server.listen(80, () => {
    console.log('🎮 Block Battle Arena server running on http://localhost');
    console.log('⚙️  Admin panel available at http://localhost/admin/login');
    console.log('📊 Leaderboard at http://localhost/leaderboard');
});
