const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'game.db'));

// Create tables
db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        profile_id TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_admin INTEGER DEFAULT 0,
        is_vip INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        profile_photo TEXT,
        profile_bio TEXT,
        profile_title TEXT
    );

    -- User sessions / login history
    CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- IP tracking table
    CREATE TABLE IF NOT EXISTS ip_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        connection_count INTEGER DEFAULT 1,
        UNIQUE(user_id, ip_address),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Player stats table
    CREATE TABLE IF NOT EXISTS player_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        -- Weapon-specific kills
        ball_kills INTEGER DEFAULT 0,
        ultimate_kills INTEGER DEFAULT 0,
        grenade_kills INTEGER DEFAULT 0,
        bat_kills INTEGER DEFAULT 0,
        drone_kills INTEGER DEFAULT 0,
        mine_kills INTEGER DEFAULT 0,
        knockback_kills INTEGER DEFAULT 0,
        -- Other stats
        games_played INTEGER DEFAULT 0,
        time_played INTEGER DEFAULT 0,
        blocks_placed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Match history (individual kills/deaths)
    CREATE TABLE IF NOT EXISTS kill_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        killer_id INTEGER,
        victim_id INTEGER NOT NULL,
        weapon TEXT,
        room_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (killer_id) REFERENCES users(id),
        FOREIGN KEY (victim_id) REFERENCES users(id)
    );

    -- Admin sessions
    CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

// Migration: Add VIP columns if they don't exist (for existing databases)
try {
    db.exec(`ALTER TABLE users ADD COLUMN is_vip INTEGER DEFAULT 0`);
} catch (e) { /* Column already exists */ }

try {
    db.exec(`ALTER TABLE users ADD COLUMN profile_photo TEXT`);
} catch (e) { /* Column already exists */ }

try {
    db.exec(`ALTER TABLE users ADD COLUMN profile_bio TEXT`);
} catch (e) { /* Column already exists */ }

try {
    db.exec(`ALTER TABLE users ADD COLUMN profile_title TEXT`);
} catch (e) { /* Column already exists */ }

// Prepared statements for common operations
const statements = {
    // User operations
    createUser: db.prepare(`
        INSERT INTO users (username, email, password_hash, profile_id)
        VALUES (?, ?, ?, ?)
    `),
    
    getUserByUsername: db.prepare(`
        SELECT * FROM users WHERE username = ?
    `),
    
    getUserByEmail: db.prepare(`
        SELECT * FROM users WHERE email = ?
    `),
    
    getUserById: db.prepare(`
        SELECT * FROM users WHERE id = ?
    `),
    
    getUserByProfileId: db.prepare(`
        SELECT * FROM users WHERE profile_id = ?
    `),
    
    updateLastLogin: db.prepare(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    `),
    
    setUserAdmin: db.prepare(`
        UPDATE users SET is_admin = ? WHERE id = ?
    `),
    
    banUser: db.prepare(`
        UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?
    `),
    
    unbanUser: db.prepare(`
        UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
    `),
    
    getAllUsers: db.prepare(`
        SELECT id, username, email, profile_id, created_at, last_login, is_admin, is_vip, is_banned, ban_reason, profile_photo, profile_bio, profile_title
        FROM users ORDER BY created_at DESC
    `),
    
    setUserVIP: db.prepare(`
        UPDATE users SET is_vip = ? WHERE id = ?
    `),
    
    updateProfile: db.prepare(`
        UPDATE users SET profile_photo = ?, profile_bio = ?, profile_title = ? WHERE id = ?
    `),
    
    getFullUserByProfileId: db.prepare(`
        SELECT id, username, email, profile_id, created_at, last_login, is_admin, is_vip, is_banned, profile_photo, profile_bio, profile_title
        FROM users WHERE profile_id = ?
    `),
    
    // Login history
    recordLogin: db.prepare(`
        INSERT INTO login_history (user_id, ip_address, user_agent)
        VALUES (?, ?, ?)
    `),
    
    getLoginHistory: db.prepare(`
        SELECT * FROM login_history WHERE user_id = ? ORDER BY login_time DESC LIMIT 50
    `),
    
    // IP tracking
    trackIP: db.prepare(`
        INSERT INTO ip_addresses (user_id, ip_address)
        VALUES (?, ?)
        ON CONFLICT(user_id, ip_address) DO UPDATE SET 
            last_seen = CURRENT_TIMESTAMP,
            connection_count = connection_count + 1
    `),
    
    getUserIPs: db.prepare(`
        SELECT * FROM ip_addresses WHERE user_id = ? ORDER BY last_seen DESC
    `),
    
    getUsersByIP: db.prepare(`
        SELECT DISTINCT u.id, u.username, u.email, u.profile_id, u.is_banned
        FROM users u
        JOIN ip_addresses ip ON u.id = ip.user_id
        WHERE ip.ip_address = ?
    `),
    
    // Stats operations
    createStats: db.prepare(`
        INSERT OR IGNORE INTO player_stats (user_id) VALUES (?)
    `),
    
    getStats: db.prepare(`
        SELECT * FROM player_stats WHERE user_id = ?
    `),
    
    getStatsByProfileId: db.prepare(`
        SELECT ps.*, u.username, u.profile_id, u.created_at as member_since, u.is_admin, u.is_vip, u.profile_photo, u.profile_bio, u.profile_title
        FROM player_stats ps
        JOIN users u ON ps.user_id = u.id
        WHERE u.profile_id = ?
    `),
    
    incrementKills: db.prepare(`
        UPDATE player_stats SET kills = kills + 1 WHERE user_id = ?
    `),
    
    incrementDeaths: db.prepare(`
        UPDATE player_stats SET deaths = deaths + 1 WHERE user_id = ?
    `),
    
    incrementWeaponKill: db.prepare(`
        UPDATE player_stats SET 
            kills = kills + 1,
            ball_kills = ball_kills + CASE WHEN ? = 'ball' THEN 1 ELSE 0 END,
            ultimate_kills = ultimate_kills + CASE WHEN ? = 'ultimate' THEN 1 ELSE 0 END,
            grenade_kills = grenade_kills + CASE WHEN ? = 'grenade' THEN 1 ELSE 0 END,
            bat_kills = bat_kills + CASE WHEN ? = 'bat' THEN 1 ELSE 0 END,
            drone_kills = drone_kills + CASE WHEN ? = 'drone' THEN 1 ELSE 0 END,
            mine_kills = mine_kills + CASE WHEN ? = 'mine' THEN 1 ELSE 0 END,
            knockback_kills = knockback_kills + CASE WHEN ? = 'knockback' THEN 1 ELSE 0 END
        WHERE user_id = ?
    `),
    
    incrementBlocksPlaced: db.prepare(`
        UPDATE player_stats SET blocks_placed = blocks_placed + 1 WHERE user_id = ?
    `),
    
    incrementGamesPlayed: db.prepare(`
        UPDATE player_stats SET games_played = games_played + 1 WHERE user_id = ?
    `),
    
    addTimePlayed: db.prepare(`
        UPDATE player_stats SET time_played = time_played + ? WHERE user_id = ?
    `),
    
    // Kill log
    logKill: db.prepare(`
        INSERT INTO kill_log (killer_id, victim_id, weapon, room_id)
        VALUES (?, ?, ?, ?)
    `),
    
    getRecentKills: db.prepare(`
        SELECT kl.*, 
            killer.username as killer_name,
            victim.username as victim_name
        FROM kill_log kl
        LEFT JOIN users killer ON kl.killer_id = killer.id
        JOIN users victim ON kl.victim_id = victim.id
        WHERE kl.killer_id = ? OR kl.victim_id = ?
        ORDER BY kl.timestamp DESC
        LIMIT 100
    `),
    
    // Leaderboard
    getLeaderboard: db.prepare(`
        SELECT ps.*, u.username, u.profile_id, u.is_admin, u.is_vip, u.profile_photo, u.profile_bio, u.profile_title,
            CASE WHEN ps.deaths > 0 THEN ROUND(CAST(ps.kills AS FLOAT) / ps.deaths, 2) ELSE ps.kills END as kdr
        FROM player_stats ps
        JOIN users u ON ps.user_id = u.id
        WHERE u.is_banned = 0
        ORDER BY ps.kills DESC
        LIMIT ?
    `),
    
    // Admin sessions
    createAdminSession: db.prepare(`
        INSERT INTO admin_sessions (user_id, session_token, ip_address, expires_at)
        VALUES (?, ?, ?, datetime('now', '+24 hours'))
    `),
    
    getAdminSession: db.prepare(`
        SELECT ats.*, u.username, u.is_admin 
        FROM admin_sessions ats
        JOIN users u ON ats.user_id = u.id
        WHERE ats.session_token = ? AND ats.expires_at > datetime('now')
    `),
    
    deleteAdminSession: db.prepare(`
        DELETE FROM admin_sessions WHERE session_token = ?
    `),
    
    cleanExpiredSessions: db.prepare(`
        DELETE FROM admin_sessions WHERE expires_at <= datetime('now')
    `)
};

// Helper functions
const SALT_ROUNDS = 10;

async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

function generateProfileId() {
    // Generate a URL-friendly unique ID
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function generateSessionToken() {
    const { v4: uuidv4 } = require('uuid');
    return uuidv4();
}

// Database API
module.exports = {
    db,
    statements,
    hashPassword,
    verifyPassword,
    generateProfileId,
    generateSessionToken,
    
    // User management
    async createUser(username, email, password) {
        const hash = await hashPassword(password);
        const profileId = generateProfileId();
        
        try {
            const result = statements.createUser.run(username, email, hash, profileId);
            // Create stats entry for new user
            statements.createStats.run(result.lastInsertRowid);
            return { success: true, userId: result.lastInsertRowid, profileId };
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                if (error.message.includes('username')) {
                    return { success: false, error: 'Username already exists' };
                }
                if (error.message.includes('email')) {
                    return { success: false, error: 'Email already registered' };
                }
            }
            return { success: false, error: error.message };
        }
    },
    
    async loginUser(username, password, ip, userAgent) {
        const user = statements.getUserByUsername.get(username);
        
        if (!user) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        if (user.is_banned) {
            return { success: false, error: `Account banned: ${user.ban_reason || 'No reason provided'}` };
        }
        
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return { success: false, error: 'Invalid username or password' };
        }
        
        // Update last login and track IP
        statements.updateLastLogin.run(user.id);
        statements.recordLogin.run(user.id, ip, userAgent);
        statements.trackIP.run(user.id, ip);
        
        return { 
            success: true, 
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profileId: user.profile_id,
                isAdmin: user.is_admin === 1,
                isVIP: user.is_vip === 1,
                profilePhoto: user.profile_photo,
                profileBio: user.profile_bio,
                profileTitle: user.profile_title
            }
        };
    },
    
    trackUserIP(userId, ip) {
        statements.trackIP.run(userId, ip);
    },
    
    recordKill(killerId, victimId, weapon, roomId) {
        statements.logKill.run(killerId, victimId, weapon, roomId);
        if (killerId) {
            // Map weapon cause to weapon type
            const weaponType = mapCauseToWeapon(weapon);
            statements.incrementWeaponKill.run(
                weaponType, weaponType, weaponType, weaponType, 
                weaponType, weaponType, weaponType, killerId
            );
        }
        statements.incrementDeaths.run(victimId);
    },
    
    getPublicProfile(profileId) {
        return statements.getStatsByProfileId.get(profileId);
    },
    
    getLeaderboard(limit = 100) {
        return statements.getLeaderboard.all(limit);
    },
    
    getUserById(id) {
        return statements.getUserById.get(id);
    },
    
    getUserByProfileId(profileId) {
        return statements.getUserByProfileId.get(profileId);
    },
    
    getAllUsers() {
        return statements.getAllUsers.all();
    },
    
    getUserIPs(userId) {
        return statements.getUserIPs.all(userId);
    },
    
    getUsersByIP(ip) {
        return statements.getUsersByIP.all(ip);
    },
    
    getLoginHistory(userId) {
        return statements.getLoginHistory.all(userId);
    },
    
    banUser(userId, reason) {
        statements.banUser.run(reason, userId);
    },
    
    unbanUser(userId) {
        statements.unbanUser.run(userId);
    },
    
    setUserAdmin(userId, isAdmin) {
        statements.setUserAdmin.run(isAdmin ? 1 : 0, userId);
    },
    
    setUserAdminByUsername(username, isAdmin) {
        const user = this.statements.getUserByUsername.get(username);
        if (user) {
            this.statements.setUserAdmin.run(isAdmin ? 1 : 0, user.id);
            return true;
        }
        return false;
    },
    
    setUserVIP(userId, isVIP) {
        statements.setUserVIP.run(isVIP ? 1 : 0, userId);
    },
    
    setUserVIPByUsername(username, isVIP) {
        const user = this.statements.getUserByUsername.get(username);
        if (user) {
            this.statements.setUserVIP.run(isVIP ? 1 : 0, user.id);
            return true;
        }
        return false;
    },
    
    updateProfile(userId, photo, bio, title) {
        statements.updateProfile.run(photo, bio, title, userId);
    },
    
    getFullUserByProfileId(profileId) {
        return statements.getFullUserByProfileId.get(profileId);
    },
    
    // Admin session management
    createAdminSession(userId, ip) {
        const token = generateSessionToken();
        statements.createAdminSession.run(userId, token, ip);
        return token;
    },
    
    validateAdminSession(token) {
        return statements.getAdminSession.get(token);
    },
    
    deleteAdminSession(token) {
        statements.deleteAdminSession.run(token);
    },
    
    cleanExpiredSessions() {
        statements.cleanExpiredSessions.run();
    },
    
    incrementBlocksPlaced(userId) {
        statements.incrementBlocksPlaced.run(userId);
    },
    
    getStats(userId) {
        return statements.getStats.get(userId);
    }
};

// Helper to map cause of death to weapon type
function mapCauseToWeapon(cause) {
    if (!cause) return 'knockback';
    const causeLower = cause.toLowerCase();
    if (causeLower.includes('ultimate')) return 'ultimate';
    if (causeLower.includes('grenade')) return 'grenade';
    if (causeLower.includes('bat')) return 'bat';
    if (causeLower.includes('drone') || causeLower.includes('bomb')) return 'drone';
    if (causeLower.includes('mine')) return 'mine';
    if (causeLower.includes('ball')) return 'ball';
    return 'knockback';
}
