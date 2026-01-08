const canvas = document.getElementById("babcanv");
const menuselections = document.getElementById("menuselections");
const frontfacingvis = document.getElementById("frontfacingvis");
let checked = true;
const meshtype = document.getElementById("meshtype");
const slimyToggle = document.getElementById("slimyToggle");
const menureveal = document.getElementById("menureveal");
const size = document.getElementById("sizeToggle");
const clearBtn = document.getElementById("clearBtn");
const engine = new BABYLON.Engine(canvas, true);

const socket = io();
const otherPlayers = {};
const spawnedBlocks = [];
const spawnedBlocksById = {}; // Map of blockId -> block mesh for syncing
let blockIdCounter = 0; // Local counter for generating block IDs

// Username state
let myUsername = "Player";
let myProfileId = null;
let currentUser = null;
let hasJoined = false;
let selectedRoomId = 'default'; // Default room selection
let availableRooms = [];

// Check authentication on page load
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        
        if (response.ok && data.success && data.user) {
            currentUser = data.user;
            myUsername = currentUser.username;
            myProfileId = currentUser.profile_id;
            // Update UI to show logged-in user
            const usernameInput = document.getElementById("usernameInput");
            const welcomeMessage = document.getElementById("welcomeMessage");
            const viewProfileBtn = document.getElementById("viewProfileBtn");
            
            if (usernameInput) {
                usernameInput.value = myUsername;
                usernameInput.disabled = true;
            }
            if (welcomeMessage) {
                welcomeMessage.textContent = `Welcome back, ${myUsername}!`;
            }
            if (viewProfileBtn && myProfileId) {
                viewProfileBtn.style.display = 'inline-block';
                viewProfileBtn.onclick = () => window.open('/profile/' + myProfileId, '_blank');
            }
            // Update profile button if exists
            updateProfileButton();
        } else {
            // Not logged in - redirect to auth page
            window.location.href = '/auth';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/auth';
    }
}

function updateProfileButton() {
    const settingsMenu = document.getElementById("settingsMenu");
    if (settingsMenu && myProfileId) {
        // Check if profile button already exists
        if (!document.getElementById("profileBtn")) {
            const profileBtn = document.createElement("button");
            profileBtn.id = "profileBtn";
            profileBtn.className = "mui-btn mui-btn--primary mui-btn--raised";
            profileBtn.innerHTML = "👤 My Profile";
            profileBtn.onclick = () => window.open('/profile/' + myProfileId, '_blank');
            profileBtn.style.cssText = "width:100%; margin-bottom:10px;";
            settingsMenu.insertBefore(profileBtn, settingsMenu.firstChild);
            
            // Add leaderboard button
            const leaderboardBtn = document.createElement("button");
            leaderboardBtn.id = "leaderboardBtn";
            leaderboardBtn.className = "mui-btn mui-btn--accent mui-btn--raised";
            leaderboardBtn.innerHTML = "🏆 Leaderboard";
            leaderboardBtn.onclick = () => window.open('/leaderboard', '_blank');
            leaderboardBtn.style.cssText = "width:100%; margin-bottom:10px;";
            settingsMenu.insertBefore(leaderboardBtn, profileBtn.nextSibling);
            
            // Add logout button
            const logoutBtn = document.createElement("button");
            logoutBtn.id = "logoutBtn";
            logoutBtn.className = "mui-btn mui-btn--danger mui-btn--raised";
            logoutBtn.innerHTML = "🚪 Logout";
            logoutBtn.onclick = async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/auth';
            };
            logoutBtn.style.cssText = "width:100%; margin-top:10px;";
            settingsMenu.appendChild(logoutBtn);
        }
    }
}

// Check auth immediately
checkAuth();

const usernameInput = document.getElementById("usernameInput");
const startGameBtn = document.getElementById("startGameBtn");
const usernameOverlay = document.getElementById("usernameOverlay");
const roomSelectorOverlay = document.getElementById("roomSelectorOverlay");
const closeRoomSelector = document.getElementById("closeRoomSelector");
const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const browseRoomsBtn = document.getElementById("browseRoomsBtn");
const loadingScreen = document.getElementById("loadingScreen");
const loadingBar = document.getElementById("loadingBar");
const loadingText = document.getElementById("loadingText");
const loadingPercent = document.getElementById("loadingPercent");
let modelsLoaded = false;
const toggleThirdPersonBtn = document.getElementById("toggleThirdPersonBtn");
const joinPrivateRoomBtn = document.getElementById("joinPrivateRoomBtn");
const privateRoomOverlay = document.getElementById("privateRoomOverlay");
const privateRoomCodeInput = document.getElementById("privateRoomCodeInput");
const joinPrivateRoomSubmit = document.getElementById("joinPrivateRoomSubmit");
const closePrivateRoomOverlay = document.getElementById("closePrivateRoomOverlay");
const currentRoomDisplay = document.getElementById("currentRoomDisplay");
const howToPlayBtn = document.getElementById("howToPlayBtn");

// Toggle settings menu
settingsBtn.onclick = function(e) {
    e.stopPropagation();
    const menu = settingsMenu;
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
};

// How to Play button
howToPlayBtn.onclick = function() {
    settingsMenu.style.display = 'none';
    
    Swal.fire({
        title: '<span style="font-size:32px;">🎮 How to Play</span>',
        html: `
            <div style="text-align:left; max-height:60vh; overflow-y:auto; padding:10px;">
                <h3 style="color:#4a90d9; margin-top:15px;">🎯 Objective</h3>
                <p style="margin:8px 0;">Eliminate other players using various weapons and abilities. Survive and dominate the arena!</p>
                
                <h3 style="color:#4a90d9; margin-top:20px;">🕹️ Controls</h3>
                <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; margin:8px 0;">
                    <p><strong>WASD</strong> - Move around</p>
                    <p><strong>SPACE</strong> - Jump</p>
                    <p><strong>Mouse</strong> - Look around</p>
                    <p><strong>Left Click</strong> - Shoot ball projectile</p>
                    <p><strong>Right Click</strong> - Place block (color & type from menu)</p>
                    <p><strong>Enter</strong> - Open chat</p>
                </div>
                
                <h3 style="color:#4a90d9; margin-top:20px;">⚔️ Weapons & Abilities</h3>
                
                <div style="background:rgba(255,100,0,0.1); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid #ff6400;">
                    <h4 style="margin:0 0 8px 0;">💥 Ultimate Ability (X)</h4>
                    <p style="margin:5px 0;"><strong>Hold X</strong> to charge for 3 seconds</p>
                    <p style="margin:5px 0;">Release to fire a massive explosive projectile</p>
                    <p style="margin:5px 0; color:#ff9800;">⚡ Instant kill on direct hit!</p>
                </div>
                
                <div style="background:rgba(0,200,0,0.1); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid #00c800;">
                    <h4 style="margin:0 0 8px 0;">💣 Grenade (Q)</h4>
                    <p style="margin:5px 0;"><strong>Hold Q</strong> to charge (larger = bigger explosion)</p>
                    <p style="margin:5px 0;">Release to throw. Explodes on impact!</p>
                    <p style="margin:5px 0;">Creates explosive fragments that deal damage</p>
                </div>
                
                <div style="background:rgba(255,0,100,0.1); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid #ff0064;">
                    <h4 style="margin:0 0 8px 0;">🏏 Katana Bat (F)</h4>
                    <p style="margin:5px 0;"><strong>Press F</strong> to swing your katana</p>
                    <p style="margin:5px 0;">Massive knockback effect - send players flying!</p>
                    <p style="margin:5px 0;">1.5 second cooldown</p>
                </div>
                
                <div style="background:rgba(0,255,255,0.1); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid #00ffff;">
                    <h4 style="margin:0 0 8px 0;">🚁 Combat Drone (R)</h4>
                    <p style="margin:5px 0;"><strong>Hold R</strong> to charge for 2.5 seconds</p>
                    <p style="margin:5px 0;">Take control of a flying drone with camera view</p>
                    <p style="margin:5px 0;"><strong>WASD</strong> to fly, <strong>Click</strong> to drop bombs</p>
                    <p style="margin:5px 0;"><strong>P</strong> to exit drone mode</p>
                    <p style="margin:5px 0; color:#ff5555;">⚠️ Drone can be destroyed (2 hit points)</p>
                </div>
                
                <div style="background:rgba(150,150,0,0.1); padding:12px; border-radius:8px; margin:12px 0; border-left:4px solid #969600;">
                    <h4 style="margin:0 0 8px 0;">💀 Proximity Mine (Selectable from Build)</h4>
                    <p style="margin:5px 0;"><strong>Left click</strong> to place a mine at your position</p>
                    <p style="margin:5px 0;">Mines flash red and explode when players get close</p>
                    <p style="margin:5px 0;">Launches players upward with explosive force</p>
                </div>
                
                <h3 style="color:#4a90d9; margin-top:20px;">🏗️ Building System</h3>
                <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; margin:8px 0;">
                    <p>Use the top menu (⇧ button) to customize your blocks:</p>
                    <p style="margin:8px 0;"><strong>Color Picker</strong> - Choose block color</p>
                    <p style="margin:8px 0;"><strong>Mesh Type</strong> - Box, Sphere, Cylinder, Capsule, Mine</p>
                    <p style="margin:8px 0;"><strong>Size Slider</strong> - Adjust block size</p>
                    <p style="margin:8px 0;"><strong>Slimy</strong> - Makes blocks bouncy/slippery</p>
                    <p style="margin:8px 0;">Build defensive structures or platforms!</p>
                </div>
                
                <h3 style="color:#4a90d9; margin-top:20px;">💀 Death & Respawn</h3>
                <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; margin:8px 0;">
                    <p>• Fall below the map or go too high = Death!</p>
                    <p>• Hit by weapons/abilities = Death!</p>
                    <p>• Respawn after 5 seconds at spawn point</p>
                    <p>• Your stats track kills, deaths, and K/D ratio</p>
                </div>
                
                <h3 style="color:#4a90d9; margin-top:20px;">🏆 Tips & Strategy</h3>
                <div style="background:rgba(74,144,217,0.1); padding:12px; border-radius:8px; margin:8px 0;">
                    <p>✓ Use blocks to decrease momentum</p>
                    <p>✓ Charge ultimate for guaranteed kills</p>
                    <p>✓ Katana bat is perfect for close combat</p>
                    <p>✓ Hit other players with balls to boost them upwards a little. Then, use the katana bat to hit them again</p>
                    <p>✓ KB Stick (Katana) is better when your opponent is above you.</p>
                    <p>✓ Drone gives you aerial advantage</p>
                    <p>✓ Place mines in high-traffic areas</p>
                    <p>✓ Grenades are great for area denial</p>
                    <p>✓ Keep moving to avoid becoming an easy target</p>
                </div>
                
                <div style="text-align:center; margin-top:20px; padding:15px; background:rgba(74,144,217,0.2); border-radius:8px;">
                    <p style="font-size:18px; margin:0;"><strong>🎮 Good luck and have fun!</strong></p>
                </div>
            </div>
        `,
        width: '700px',
        confirmButtonText: 'Got it!',
        confirmButtonColor: '#4a90d9',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: '#e0e0e0',
        customClass: {
            popup: 'how-to-play-popup'
        }
    });
};

// Browse rooms from settings menu
browseRoomsBtn.onclick = function() {
    if (!hasJoined) {
        Swal.fire({
            icon: 'warning',
            title: 'Not Started',
            text: 'Please enter your username and start the game first!',
            confirmButtonColor: '#4a90d9'
        });
        return;
    }
    socket.emit('getRooms');
    roomSelectorOverlay.style.display = 'block';
    settingsMenu.style.display = 'none';
    
    // Update current room display
    const currentRoom = availableRooms.find(r => r.id === selectedRoomId);
    if (currentRoom) {
        currentRoomDisplay.textContent = `Currently in: ${currentRoom.name}`;
    }
};

// Join private room button
joinPrivateRoomBtn.onclick = function() {
    if (!hasJoined) {
        Swal.fire({
            icon: 'warning',
            title: 'Not Started',
            text: 'Please enter your username and start the game first!',
            confirmButtonColor: '#4a90d9'
        });
        return;
    }
    privateRoomOverlay.style.display = 'flex';
    settingsMenu.style.display = 'none';
    privateRoomCodeInput.value = '';
    privateRoomCodeInput.focus();
};

// Close private room overlay
closePrivateRoomOverlay.onclick = function() {
    privateRoomOverlay.style.display = 'none';
};

// Submit private room code
joinPrivateRoomSubmit.onclick = function() {
    const code = privateRoomCodeInput.value.trim().toUpperCase();
    if (!code) {
        Swal.fire({
            icon: 'error',
            title: 'Missing Code',
            text: 'Please enter a room code!',
            confirmButtonColor: '#4a90d9'
        });
        return;
    }
    
    // Request to join private room with code (username comes from session)
    socket.emit('joinPrivateRoom', { code: code });
};

// Allow enter key to submit private room code
privateRoomCodeInput.addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
        joinPrivateRoomSubmit.click();
    }
});

// Handle private room join response
socket.on('privateRoomJoined', (data) => {
    privateRoomOverlay.style.display = 'none';
    selectedRoomId = data.roomId;
    
    clearRoomState();
    
    Swal.fire({
        icon: 'success',
        title: 'Room Joined!',
        text: `Successfully joined: ${data.roomName}`,
        timer: 2000,
        showConfirmButton: false
    });
});

socket.on('privateRoomError', (data) => {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: data.message,
        confirmButtonColor: '#4a90d9'
    });
});

// Toggle third person camera from settings menu
toggleThirdPersonBtn.onclick = function() {
    isThirdPerson = !isThirdPerson;
    settingsMenu.style.display = 'none';
};

// Open room selector
const openRoomSelectorBtn = document.getElementById("openRoomSelectorBtn");
if (openRoomSelectorBtn) {
    openRoomSelectorBtn.onclick = function() {
        const name = usernameInput.value.trim();
        if (!name) {
            Swal.fire({
                icon: 'warning',
                title: 'Username Required',
                text: 'Please enter a username first!',
                confirmButtonColor: '#4a90d9'
            });
            return;
        }
        myUsername = name;
        socket.emit('getRooms');
        roomSelectorOverlay.style.display = 'block';
    };
}

// Close room selector
closeRoomSelector.onclick = function() {
    roomSelectorOverlay.style.display = 'none';
};

// Close settings menu when clicking outside
document.addEventListener('click', function(event) {
    const menu = settingsMenu;
    const btn = settingsBtn;
    if (menu.style.display === 'block' && !menu.contains(event.target) && event.target !== btn) {
        menu.style.display = 'none';
    }
});

// Receive available rooms
socket.on('availableRooms', (rooms) => {
    // Filter out private rooms
    availableRooms = rooms.filter(r => r.type !== 'private');
    renderRoomsList();
});

// Render rooms list
function renderRoomsList() {
    const roomsList = document.getElementById('roomsList');
    if (availableRooms.length === 0) {
        roomsList.innerHTML = '<div style="color:#888; text-align:center; grid-column:1/-1;">No rooms available</div>';
        return;
    }
    
    roomsList.innerHTML = availableRooms.map(room => {
        const isFull = room.playerCount >= room.maxPlayers;
        return `
            <div style="background:rgba(255,255,255,0.05); border:2px solid ${room.id === selectedRoomId ? '#4a90d9' : 'rgba(255,255,255,0.1)'}; border-radius:12px; padding:20px; cursor:pointer; transition:all 0.3s;" onclick="selectRoom('${room.id}')">
                <div style="font-size:20px; color:white; font-weight:600; margin-bottom:10px;">${room.name}</div>
                <div style="display:flex; gap:15px; margin-bottom:15px; color:#888; font-size:14px;">
                    <span>👥 ${room.playerCount}/${room.maxPlayers}</span>
                    <span>${room.type === 'private' ? '🔒' : '🌐'} ${room.type}</span>
                </div>
                ${isFull ? 
                    '<div style="background:rgba(229,57,53,0.2); color:#e53935; padding:8px; border-radius:6px; text-align:center; font-size:14px; font-weight:600;">FULL</div>' :
                    '<div style="background:rgba(76,175,80,0.2); color:#4caf50; padding:8px; border-radius:6px; text-align:center; font-size:14px; font-weight:600;">JOIN</div>'
                }
            </div>
        `;
    }).join('');
}

// Select a room
window.selectRoom = function(roomId) {
    const room = availableRooms.find(r => r.id === roomId);
    if (!room) return;
    
    if (room.playerCount >= room.maxPlayers) {
        Swal.fire({
            icon: 'error',
            title: 'Room Full',
            text: 'This room is full!',
            confirmButtonColor: '#4a90d9'
        });
        return;
    }
    
    // If already in a room, leave it first
    if (hasJoined && selectedRoomId !== roomId) {
        socket.emit('leaveRoom', { roomId: selectedRoomId });
        clearRoomState();
    }
    
    selectedRoomId = roomId;
    renderRoomsList();
    
    // Close room selector
    roomSelectorOverlay.style.display = 'none';
    
    if (!hasJoined) {
        usernameOverlay.style.display = 'none';
        hasJoined = true;
    }
    
    // Register player with selected room (username comes from session)
    socket.emit('registerPlayer', { roomId: selectedRoomId });
    
    // Request pointer lock
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
    canvas.requestPointerLock();
};

startGameBtn.onclick = function() {
    // Username comes from session, no need to enter it
    if (currentUser && myUsername) {
        usernameOverlay.style.display = "none";
        hasJoined = true;
        // Register player with default room
        socket.emit('registerPlayer', { roomId: selectedRoomId });
        
        // Request pointer lock
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
        canvas.requestPointerLock();
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Not Logged In',
            text: 'Please log in to play!',
            confirmButtonColor: '#4a90d9'
        }).then(() => {
            window.location.href = '/auth';
        });
    }
}

// Allow enter key to start game
usernameInput.addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
        startGameBtn.click();
    }
});

// Register as a player when connected
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    // Don't register automatically anymore, wait for username and room selection
});

// Handle auth required - server requests authentication
socket.on('authRequired', () => {
    console.log('Auth required - redirecting to login');
    window.location.href = '/auth';
});

// Handle banned user
socket.on('banned', (data) => {
    Swal.fire({
        icon: 'error',
        title: 'Account Banned',
        text: data.reason || 'Your account has been banned.',
        confirmButtonColor: '#e53935',
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then(() => {
        window.location.href = '/auth';
    });
});

socket.on('joinRoomError', (data) => {
    Swal.fire({
        icon: 'error',
        title: 'Cannot Join Room',
        text: data.message,
        confirmButtonColor: '#4a90d9'
    });
    // Show room selector again
    roomSelectorOverlay.style.display = 'block';
    hasJoined = false;
});

socket.on('roomDeleted', (data) => {
    Swal.fire({
        icon: 'info',
        title: 'Room Deleted',
        text: data.message,
        confirmButtonColor: '#4a90d9',
        timer: 5000,
        timerProgressBar: true
    });
    // Update current room display if applicable
    console.log('Moved to room:', data.newRoomName);
});

socket.on('disconnect', () => {
    console.log('Socket disconnected!');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
});

// Third person toggle state
let isThirdPerson = false;

// Last hit tracking
let lastHitterId = null;
let lastHitterTime = 0;
let lastHitCause = null; // Track what caused the last hit

// Death/respawn state
let isDead = false;
const DEATH_HEIGHT = -15;
const DEATH_CEILING = 100; // Die if you go above this height
const SPAWN_POSITION = new BABYLON.Vector3(0, 3, 0);

// Ultimate ability state
let isChargingUltimate = false;
let ultimateCharge = 0;
let chargingBall = null; // Visual ball that grows while charging
const ULTIMATE_CHARGE_TIME = 3000; // 3 seconds to fully charge
const ULTIMATE_CHARGE_RATE = 100 / (ULTIMATE_CHARGE_TIME / 16.67); // % per frame at 60fps
const ULTIMATE_MIN_SIZE = 0.1;
const ULTIMATE_MAX_SIZE = 0.6;

// Bat swing state
let batMesh = null;
let isSwingingBat = false;
let canSwingBat = true;
const BAT_COOLDOWN = 1500; // 1.5 seconds
const BAT_SWING_DURATION = 300; // ms - slower swing
const BAT_KNOCKBACK_FORCE = 60; // MASSIVE knockback
const BAT_RANGE = 3.0; // Extended range for long bat

// Grenade state
let isChargingGrenade = false;
let grenadeCharge = 0;
let grenadeChargingBall = null;
const GRENADE_CHARGE_TIME = 3000; // 3 seconds to fully charge
const GRENADE_CHARGE_RATE = 100 / (GRENADE_CHARGE_TIME / 16.67);
const GRENADE_MIN_SIZE = 0.2;
const GRENADE_MAX_SIZE = 0.8;

// Mine state
const spawnedMines = [];
const MINE_BOOST_FORCE = 1; // Upward boost when triggered
const MINE_TRIGGER_RADIUS = 1.2; // How close to trigger

// Drone state
let isChargingDrone = false;
let droneCharge = 0;
let droneChargingBall = null;
let isDroneMode = false;
let droneMesh = null;
let droneCamera = null;
let droneHealth = 2; // Drone dies after 2 hits
const DRONE_CHARGE_TIME = 2500; // 2.5 seconds to fully charge
const DRONE_CHARGE_RATE = 100 / (DRONE_CHARGE_TIME / 16.67);
const DRONE_SPEED = 0.3; // Movement speed
const DRONE_BOMB_COOLDOWN = 1000; // 1 second between bombs
let canDropBomb = true;

// Preloaded 3D models
const DRONE_MODEL_URL = "https://files.catbox.moe/z7hxt9.glb";
const ULTIMATE_MODEL_URL = "https://files.catbox.moe/84ufxa.glb"; // TODO: Replace with actual ultimate model URL
const BALL_MODEL_URL = "https://files.catbox.moe/5esvct.glb"; // TODO: Replace with actual ball model URL
const KATANA_MODEL_URL = "https://files.catbox.moe/nlqntj.glb"; // TODO: Replace with actual katana model URL
const DRONE_BOMB_MODEL_URL = "https://files.catbox.moe/qeyyrr.glb"; // TODO: Replace with actual drone bomb model URL
const GRENADE_MODEL_URL = "https://files.catbox.moe/nmw7yv.glb"; // TODO: Replace with actual grenade model URL
const MINE_MODEL_URL = "https://files.catbox.moe/qmnt2u.glb"; // TODO: Replace with actual mine model URL

// ============ HELPER FUNCTIONS ============

// Reset player arms to default idle position
function resetPlayerArms() {
    if (player && player.leftArm && player.rightArm) {
        player.leftArm.rotation.x = 0;
        player.rightArm.rotation.x = 0;
        player.leftArm.rotation.z = Math.PI / 6;
        player.rightArm.rotation.z = -Math.PI / 6;
    }
}

// Reset other player's arms to default idle position
function resetOtherPlayerArms(mesh) {
    if (mesh && mesh.leftArm && mesh.rightArm) {
        mesh.leftArm.rotation.x = 0;
        mesh.rightArm.rotation.x = 0;
        mesh.leftArm.rotation.z = Math.PI / 6;
        mesh.rightArm.rotation.z = -Math.PI / 6;
    }
}

// Clear all room state (when switching rooms)
function clearRoomState() {
    Object.values(otherPlayers).forEach(p => cleanupOtherPlayerResources(p));
    Object.keys(otherPlayers).forEach(key => delete otherPlayers[key]);
    
    spawnedBlocks.forEach(mesh => mesh.dispose());
    spawnedBlocks.length = 0;
    Object.keys(spawnedBlocksById).forEach(key => delete spawnedBlocksById[key]);
    
    spawnedMines.forEach(mine => disposeMine(mine));
    spawnedMines.length = 0;
}

// Cancel all charging abilities (used when hit by projectiles)
function cancelAllChargingAbilities() {
    if (typeof cancelUltimate === 'function' && isChargingUltimate) {
        cancelUltimate();
    }
    if (typeof cancelGrenade === 'function' && isChargingGrenade) {
        cancelGrenade();
    }
    if (typeof window.cancelDrone === 'function' && isChargingDrone) {
        window.cancelDrone();
    }
}

// Create explosion flash effect at position
function createFlashEffect(position, color = new BABYLON.Color3(1, 0.5, 0)) {
    const flash = BABYLON.MeshBuilder.CreateSphere("flash", {diameter: 1, segments: 8}, scene);
    const flashMat = new BABYLON.StandardMaterial("flashMat", scene);
    flashMat.diffuseColor = color;
    flashMat.emissiveColor = color;
    flashMat.alpha = 0.8;
    flash.material = flashMat;
    flash.position.copyFrom(position);
    
    let scale = 1;
    const expandInterval = setInterval(() => {
        scale += 0.5;
        flashMat.alpha -= 0.15;
        flash.scaling.setAll(scale);
        if (flashMat.alpha <= 0) {
            clearInterval(expandInterval);
            flash.dispose();
        }
    }, 30);
    
    return flash;
}

// Create mine mesh with flashing effect
function createMineMesh(mineId, position) {
    const mine = BABYLON.MeshBuilder.CreateCylinder("mine_" + mineId, {
        height: 0.15,
        diameter: 0.8,
        tessellation: 16
    }, scene);
    
    mine.position.copyFrom(position);
    mine.visibility = 0; // Make invisible, only show the 3D model
    
    mine.mineId = mineId;
    
    // Load the mine 3D model
    BABYLON.SceneLoader.ImportMesh("", MINE_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && mine && !mine.isDisposed()) {
            const mineModel = new BABYLON.TransformNode("mineModel_" + mineId, scene);
            
            meshes.forEach(mesh => {
                // Hide mesh initially to prevent it appearing at world origin
                mesh.setEnabled(false);
                mesh.parent = mineModel;
                mesh.isPickable = false;
            });
            
            mineModel.parent = mine;
            mineModel.position = new BABYLON.Vector3(0, 0, 0);
            mineModel.scaling = new BABYLON.Vector3(0.52, 0.52, 0.52); // Adjust scale as needed
            mineModel.rotation.x = -Math.PI / 2; // Rotate to lay flat on the ground
            mine.mineModel = mineModel;
            
            // Re-enable meshes after parenting
            meshes.forEach(mesh => {
                mesh.setEnabled(true);
            });
            
            // Add flashing effect to the 3D model
            let flashState = true;
            mine.flashInterval = setInterval(() => {
                if (mine.isDisposed() || !mineModel) {
                    clearInterval(mine.flashInterval);
                    return;
                }
                flashState = !flashState;
                // Apply emissive flashing to all meshes in the model
                meshes.forEach(mesh => {
                    if (mesh.material) {
                        if (flashState) {
                            mesh.material.emissiveColor = new BABYLON.Color3(0.8, 0, 0);
                        } else {
                            mesh.material.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
                        }
                    }
                });
            }, 300);
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load mine model:", message, exception);
        // Fallback: make visible with red material
        mine.visibility = 1;
        const mineMat = new BABYLON.StandardMaterial("mineMat_" + mineId, scene);
        mineMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
        mineMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0);
        mine.material = mineMat;
        
        mine.enableEdgesRendering();
        mine.edgesWidth = 3.0;
        mine.edgesColor = new BABYLON.Color4(1, 0.3, 0.3, 1);
        
        let flashState = true;
        mine.flashInterval = setInterval(() => {
            if (mine.isDisposed()) {
                clearInterval(mine.flashInterval);
                return;
            }
            flashState = !flashState;
            if (flashState) {
                mineMat.emissiveColor = new BABYLON.Color3(0.8, 0, 0);
                mineMat.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
            } else {
                mineMat.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
                mineMat.diffuseColor = new BABYLON.Color3(0.5, 0, 0);
            }
        }, 300);
    });
    
    return mine;
}

// Dispose mine safely
function disposeMine(mine) {
    if (mine) {
        if (mine.flashInterval) clearInterval(mine.flashInterval);
        if (mine.mineModel) mine.mineModel.dispose();
        mine.dispose();
    }
}

// Cleanup other player resources
function cleanupOtherPlayerResources(playerData) {
    if (!playerData) return;
    if (playerData.mesh) playerData.mesh.dispose();
    if (playerData.collider) playerData.collider.dispose();
    if (playerData.chargingBall) {
        if (playerData.chargingBall.chargingModel) {
            playerData.chargingBall.chargingModel.dispose();
        }
        playerData.chargingBall.dispose();
    }
    if (playerData.grenadeChargingBall) playerData.grenadeChargingBall.dispose();
    if (playerData.droneChargingBall) playerData.droneChargingBall.dispose();
    if (playerData.grappleHook) playerData.grappleHook.dispose();
    if (playerData.grappleLine) playerData.grappleLine.dispose();
    if (playerData.droneMesh) {
        if (playerData.droneMesh.droneModel) {
            playerData.droneMesh.droneModel.getChildMeshes().forEach(mesh => mesh.dispose());
            playerData.droneMesh.droneModel.dispose();
        }
        playerData.droneMesh.dispose();
    }
}

// Show red damage overlay flash
function showDamageFlash(duration = 150) {
    const redOverlay = document.createElement('div');
    redOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.5);pointer-events:none;z-index:9999;';
    document.body.appendChild(redOverlay);
    setTimeout(() => redOverlay.remove(), duration);
}

// Animation state for network sync
let currentAnimState = 'idle'; // 'idle', 'shooting', 'building', 'charging'

// Network sync throttling
let lastPositionUpdateTime = 0;
const POSITION_UPDATE_INTERVAL = 33; // ~30 updates per second for smoother sync

// Helper to set visibility on all child meshes of a character
function setPlayerMeshVisibility(characterRoot, visible) {
    const children = characterRoot.getChildMeshes();
    children.forEach(child => {
        child.isVisible = visible;
    });
}

// Active key state tracking
const keysPressed = {};

// Create a humanoid character mesh
function createCharacterMesh(scene, name, color, username) {
    const characterRoot = new BABYLON.TransformNode(name, scene);
    
    // Create Username Label
    if (username) {
        const dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", 512, scene, true);
        dynamicTexture.hasAlpha = true;
        dynamicTexture.drawText(username, null, null, "bold 60px Arial", "white", "transparent", true);
        
        const plane = BABYLON.Mesh.CreatePlane("namePlane", 2, scene);
        plane.parent = characterRoot;
        plane.position.y = 2.2;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        
        const planeMat = new BABYLON.StandardMaterial("nameMat", scene);
        planeMat.diffuseTexture = dynamicTexture;
        planeMat.backFaceCulling = false;
        planeMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        planeMat.disableLighting = true;
        plane.material = planeMat;
    }
    
    const mat = new BABYLON.StandardMaterial(name + "Mat", scene);
    mat.diffuseColor = color;
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    
    // Helper function to setup mesh and prevent culling issues
    function setupMesh(mesh) {
        mesh.material = mat;
        mesh.parent = characterRoot;
        mesh.alwaysSelectAsActiveMesh = true; // Prevent frustum culling
    }
    
    // Body (torso)
    const body = BABYLON.MeshBuilder.CreateCylinder(name + "Body", {
        height: 0.8, 
        diameterTop: 0.5, 
        diameterBottom: 0.6
    }, scene);
    body.position.y = 0.4;
    setupMesh(body);
    
    // Head
    const head = BABYLON.MeshBuilder.CreateSphere(name + "Head", {
        diameter: 0.5, 
        segments: 16
    }, scene);
    head.position.y = 1.05;
    setupMesh(head);
    
    // Eyes
    const eyeMat = new BABYLON.StandardMaterial(name + "EyeMat", scene);
    eyeMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    eyeMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    
    const leftEye = BABYLON.MeshBuilder.CreateSphere(name + "LeftEye", {diameter: 0.1}, scene);
    leftEye.position.set(-0.1, 1.1, 0.2);
    leftEye.material = eyeMat;
    leftEye.parent = characterRoot;
    leftEye.alwaysSelectAsActiveMesh = true;
    
    const rightEye = BABYLON.MeshBuilder.CreateSphere(name + "RightEye", {diameter: 0.1}, scene);
    rightEye.position.set(0.1, 1.1, 0.2);
    rightEye.material = eyeMat;
    rightEye.parent = characterRoot;
    rightEye.alwaysSelectAsActiveMesh = true;
    
    // Pupils
    const pupilMat = new BABYLON.StandardMaterial(name + "PupilMat", scene);
    pupilMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    
    const leftPupil = BABYLON.MeshBuilder.CreateSphere(name + "LeftPupil", {diameter: 0.05}, scene);
    leftPupil.position.set(-0.1, 1.1, 0.24);
    leftPupil.material = pupilMat;
    leftPupil.parent = characterRoot;
    leftPupil.alwaysSelectAsActiveMesh = true;
    
    const rightPupil = BABYLON.MeshBuilder.CreateSphere(name + "RightPupil", {diameter: 0.05}, scene);
    rightPupil.position.set(0.1, 1.1, 0.24);
    rightPupil.material = pupilMat;
    rightPupil.parent = characterRoot;
    rightPupil.alwaysSelectAsActiveMesh = true;
    
    // Left Arm
    const leftArm = BABYLON.MeshBuilder.CreateCapsule(name + "LeftArm", {
        height: 0.6, 
        radius: 0.1
    }, scene);
    leftArm.position.set(-0.4, 0.5, 0);
    leftArm.rotation.z = Math.PI / 6;
    setupMesh(leftArm);
    
    // Right Arm
    const rightArm = BABYLON.MeshBuilder.CreateCapsule(name + "RightArm", {
        height: 0.6, 
        radius: 0.1
    }, scene);
    rightArm.position.set(0.4, 0.5, 0);
    rightArm.rotation.z = -Math.PI / 6;
    setupMesh(rightArm);
    
    // Left Leg
    const leftLeg = BABYLON.MeshBuilder.CreateCapsule(name + "LeftLeg", {
        height: 0.6, 
        radius: 0.12
    }, scene);
    leftLeg.position.set(-0.15, -0.3, 0);
    setupMesh(leftLeg);
    
    // Right Leg
    const rightLeg = BABYLON.MeshBuilder.CreateCapsule(name + "RightLeg", {
        height: 0.6, 
        radius: 0.12
    }, scene);
    rightLeg.position.set(0.15, -0.3, 0);
    setupMesh(rightLeg);
    
    // Store arm references for animation
    characterRoot.leftArm = leftArm;
    characterRoot.rightArm = rightArm;
    
    return characterRoot;
}

var createScene = function () {
    var scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    scene.enablePhysics(new BABYLON.Vector3(0,-9.81, 0), new BABYLON.AmmoJSPlugin);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);
    
    // Camera setup
    camera = new BABYLON.FreeCamera("Camera", new BABYLON.Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true);
    camera.keysUp.pop(38);
    camera.keysDown.pop(40);
    camera.keysLeft.pop(37);
    camera.keysRight.pop(39);
    camera.angularSensibility = 10000;

    // Lights
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    
    var dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
    dirLight.intensity = 0.5;

    var wallmat = new BABYLON.StandardMaterial("wallmat", scene);
    wallmat.diffuseTexture = new BABYLON.Texture("wood.jpg", scene);
    wallmat.backFaceCulling = false;

    var groundmat = new BABYLON.StandardMaterial("groundmat", scene);
    groundmat.diffuseTexture = new BABYLON.Texture("https://i.imgur.com/fr2946D.png", scene);
    var ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 30, height: 30}, scene);
    ground.material = groundmat;
    ground.physicsImpostor = new BABYLON.PhysicsImpostor(ground, BABYLON.PhysicsImpostor.MeshImpostor, {mass:0, restitution:0.3}, scene);
    
    var wallz = [15, 0, 0, -15];
    var wallrot = [0, 1, 1, 0];
    var wallx = [null, -15, 15, null];
    const walls = []; // Store walls for hardcore mode toggle
    for (let i=0; i<4; i++) {
        var wall = BABYLON.MeshBuilder.CreateBox("wall", {width:30, height:2, depth:0.5}, scene);
        wall.physicsImpostor = new BABYLON.PhysicsImpostor(wall, BABYLON.PhysicsImpostor.BoxImpostor, {mass:0, restitution: 0.9}, scene);
        wall.position.y = 1;
        wall.position.z = wallz[i];
        wall.material = wallmat;
        if (wallrot[i] == 1) {
            wall.rotate(new BABYLON.Vector3(0, 1, 0), Math.PI/2, BABYLON.Space.LOCAL);
        }
        if (!(wallx[i] == null)) {
            wall.position.x = wallx[i];
        }
        walls.push(wall);
    }
    
    // Store walls globally for hardcore mode toggle
    window.arenaWalls = walls;

    // Skybox gradient
    var bluemat = new BABYLON.StandardMaterial("bluemat", scene);
    bluemat.diffuseColor = new BABYLON.Color3.FromHexString("#87CEEB");
    bluemat.backFaceCulling = false;
    bluemat.emissiveColor = new BABYLON.Color3(0.3, 0.4, 0.5);
    var skybox = BABYLON.MeshBuilder.CreateSphere("skybox", {segments:32, diameter:100}, scene);
    skybox.material = bluemat;

    // Player physics body (invisible sphere for physics)
    playerPhysicsBody = BABYLON.MeshBuilder.CreateSphere("playerPhysics", {diameter:1.5, segments:8}, scene);
    playerPhysicsBody.position.y = 3;
    playerPhysicsBody.visibility = 0;
    playerPhysicsBody.physicsImpostor = new BABYLON.PhysicsImpostor(playerPhysicsBody, BABYLON.PhysicsImpostor.SphereImpostor, {mass:1, restitution:0.3, friction: 0.5}, scene);
    
    // Player visual mesh (humanoid character)
    player = createCharacterMesh(scene, "player", new BABYLON.Color3(0.2, 0.6, 1), myUsername);
    player.position.y = 3;

    // Create bat attached to player's right arm (invisible physics hitbox)
    batMesh = BABYLON.MeshBuilder.CreateCapsule("bat", {height: 3.0, radius: 0.08}, scene);
    batMesh.parent = player.rightArm; // Attach to right arm
    batMesh.position.set(0, -1.5, 0); // Position at end of arm
    batMesh.rotation.set(0, 0, 0);
    batMesh.visibility = 0; // Always invisible - katana model will be shown instead
    
    // Load katana 3D model (cached from preload)
    BABYLON.SceneLoader.ImportMesh("", KATANA_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && batMesh && !batMesh.isDisposed()) {
            const katanaModel = new BABYLON.TransformNode("katanaModel", scene);
            
            meshes.forEach(mesh => {
                mesh.parent = katanaModel;
                mesh.isPickable = false;
            });
            
            katanaModel.parent = batMesh;
            katanaModel.position = new BABYLON.Vector3(0, 0, 0); // Adjust X, Y, Z as needed to align with hand
            katanaModel.scaling = new BABYLON.Vector3(3, 3, 3); // 3x larger
            katanaModel.rotation = new BABYLON.Vector3(0, 0, Math.PI); // 180 degrees flip around Z-axis
            batMesh.katanaModel = katanaModel;
            katanaModel.setEnabled(false); // Hidden until swing
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load katana model:", message, exception);
        // Fallback: make the capsule visible with a material
        const batMat = new BABYLON.StandardMaterial("batMat", scene);
        batMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
        batMat.emissiveColor = new BABYLON.Color3(0.1, 0.05, 0.025);
        batMesh.material = batMat;
        // Visibility will be controlled by swingBat function
    });

    frontfacing = BABYLON.Mesh.CreateBox("front", 1, scene);
    frontfacing.visibility = 0.5;
    var frontMat = new BABYLON.StandardMaterial("frontMat", scene);
    frontMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    frontMat.alpha = 0.3;
    frontfacing.material = frontMat;

    // Jump reload
    jumpreloading = false;

    scene.registerBeforeRender(function() {
        // Check for death (fell below world or went too high)
        if (!isDead && (playerPhysicsBody.position.y < DEATH_HEIGHT || playerPhysicsBody.position.y > DEATH_CEILING)) {
            // Determine if it was a suicide or kill based on last hit
            let killerId = null;
            let cause = playerPhysicsBody.position.y > DEATH_CEILING ? "Flew Too High" : "Fell to Death";
            
            if (Date.now() - lastHitterTime < 5000) { // If hit in last 5 seconds
                killerId = lastHitterId;
                cause = lastHitCause || "Knocked into Void";
            }
            
            window.triggerDeath(killerId, cause);
        }
        
        // Sync player visual mesh to physics body
        player.position.copyFrom(playerPhysicsBody.position);
        player.position.y -= 0.5; // Offset for character feet
        
        // Calculate character facing direction from camera look direction
        var lookDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        player.rotation.y = Math.atan2(lookDir.x, lookDir.z); // Face where camera looks
        
        // Camera follows player
        if (!isThirdPerson) {
            camera.position.set(playerPhysicsBody.position.x, playerPhysicsBody.position.y + 0.5, playerPhysicsBody.position.z);
            // Hide player in first person
            setPlayerMeshVisibility(player, false);
        } else {
            var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            camera.position = playerPhysicsBody.position.subtract(forward.scale(8)).add(new BABYLON.Vector3(0, 3, 0));
            // Show player in third person
            setPlayerMeshVisibility(player, true);
        }

        // Update frontfacing position
        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        frontfacing.position = playerPhysicsBody.position.add(forward.scale(5));
        
        // Check mine collisions with player
        if (!isDead && playerPhysicsBody && playerPhysicsBody.physicsImpostor) {
            const playerVel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
            const playerPos = playerPhysicsBody.position;
            
            for (let i = spawnedMines.length - 1; i >= 0; i--) {
                const mine = spawnedMines[i];
                if (mine && !mine.isDisposed()) {
                    const minePos = mine.position;
                    
                    // Calculate distances
                    const dx = playerPos.x - minePos.x;
                    const dz = playerPos.z - minePos.z;
                    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                    const verticalDiff = playerPos.y - minePos.y;
                    
                    // Log when player is near mine (for debugging)
                    if (horizontalDist < 2.0) {
                        console.log("Near mine:", { 
                            horizontalDist: horizontalDist.toFixed(2), 
                            verticalDiff: verticalDiff.toFixed(2), 
                            playerVelY: playerVel.y.toFixed(2),
                            isClose: horizontalDist < 1.2,
                            isReasonableHeight: verticalDiff > -0.5 && verticalDiff < 3.0,
                            notFastJumping: playerVel.y < 8
                        });
                    }
                    
                    // Very generous trigger conditions
                    const isClose = horizontalDist < 1.5; // Player physics body radius is ~0.75
                    const isReasonableHeight = verticalDiff > -0.5 && verticalDiff < 3.0;
                    const notFastJumping = playerVel.y < 8;
                    
                    if (isClose && isReasonableHeight && notFastJumping) {
                        console.log("MINE TRIGGERED!");
                        
                        // Trigger mine - set velocity for small upward boost
                        const currentVel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
                        playerPhysicsBody.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(
                            currentVel.x,
                            Math.max(currentVel.y, 0) + 6, // Small upward boost
                            currentVel.z
                        ));
                        
                        // Emit mine triggered event
                        if (mine.mineId) {
                            socket.emit('mineTriggered', { mineId: mine.mineId });
                        }
                        
                        // Dispose mine
                        if (mine.flashInterval) clearInterval(mine.flashInterval);
                        mine.dispose();
                        spawnedMines.splice(i, 1);
                        
                        break;
                    }
                }
            }
        }
        
        // Check mine collisions with blocks
        for (let i = spawnedMines.length - 1; i >= 0; i--) {
            const mine = spawnedMines[i];
            if (mine && !mine.isDisposed()) {
                for (const block of spawnedBlocks) {
                    if (block && block.physicsImpostor) {
                        const dist = BABYLON.Vector3.Distance(block.position, mine.position);
                        if (dist < MINE_TRIGGER_RADIUS + 0.5) {
                            console.log("MINE TRIGGERED BY BLOCK!");
                            
                            // Trigger mine - boost block upward with direct velocity change
                            const currentVel = block.physicsImpostor.getLinearVelocity();
                            block.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(
                                currentVel.x,
                                Math.max(currentVel.y, 0) + 8, // Upward boost for block
                                currentVel.z
                            ));
                            
                            // Emit mine triggered event
                            if (mine.mineId) {
                                socket.emit('mineTriggered', { mineId: mine.mineId });
                            }
                            
                            // Dispose mine
                            if (mine.flashInterval) clearInterval(mine.flashInterval);
                            mine.dispose();
                            spawnedMines.splice(i, 1);
                            break;
                        }
                    }
                }
            }
        }
        
        // Check mine collisions with other players
        Object.values(otherPlayers).forEach(p => {
            if (p.collider) {
                for (let i = spawnedMines.length - 1; i >= 0; i--) {
                    const mine = spawnedMines[i];
                    if (mine && !mine.isDisposed()) {
                        const dist = BABYLON.Vector3.Distance(p.collider.position, mine.position);
                        if (dist < MINE_TRIGGER_RADIUS + 0.5) {
                            // Emit mine triggered (server will handle boost for other player)
                            if (mine.mineId) {
                                socket.emit('mineTriggered', { mineId: mine.mineId });
                            }
                            
                            // Dispose mine locally
                            mine.dispose();
                            spawnedMines.splice(i, 1);
                            break;
                        }
                    }
                }
            }
        });
        
        // Continuous movement based on active keys (disabled when dead or in drone mode)
        if (!isDead && !isDroneMode) {
            handleMovement();
        }
        
        // Ultimate charging logic
        if (isChargingUltimate && !isDead) {
            currentAnimState = 'charging';
            ultimateCharge += ULTIMATE_CHARGE_RATE;
            document.getElementById('ultimateBar').style.width = Math.min(ultimateCharge, 100) + '%';
            
            // Position both arms forward while charging
            if (player.leftArm && player.rightArm) {
                player.leftArm.rotation.x = -1.2; // Arms forward
                player.rightArm.rotation.x = -1.2;
                player.leftArm.rotation.z = 0.3; // Slightly together
                player.rightArm.rotation.z = -0.3;
            }
            
            // Create or update growing ball in front of character
            var lookDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            var ballPos = playerPhysicsBody.position.add(lookDir.scale(1.5));
            ballPos.y += 0.3; // Raise to hand height
            
            if (!chargingBall) {
                // Create invisible container for the charging ball
                chargingBall = BABYLON.MeshBuilder.CreateSphere("chargingBall", {diameter: 1, segments: 8}, scene);
                chargingBall.visibility = 0;
                
                // Load the 3D model (cached from preload, so loads instantly)
                BABYLON.SceneLoader.ImportMesh("", ULTIMATE_MODEL_URL, "", scene, function(meshes) {
                    if (meshes.length > 0 && chargingBall && !chargingBall.isDisposed()) {
                        const chargingModel = new BABYLON.TransformNode("chargingModel", scene);
                        
                        meshes.forEach(mesh => {
                            mesh.parent = chargingModel;
                            mesh.isPickable = false;
                        });
                        
                        chargingModel.parent = chargingBall;
                        chargingModel.position = new BABYLON.Vector3(0, 0, 0);
                        chargingBall.chargingModel = chargingModel;
                    }
                }, null, function(scene, message, exception) {
                    console.error("Failed to load charging model:", message, exception);
                    // Fallback: make the container visible with a material
                    chargingBall.visibility = 1;
                    var fallbackMat = new BABYLON.StandardMaterial("chargeFallbackMat", scene);
                    fallbackMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5);
                    fallbackMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.3);
                    chargingBall.material = fallbackMat;
                });
            }
            
            // Grow the ball based on charge
            var currentSize = ULTIMATE_MIN_SIZE + (ultimateCharge / 100) * (ULTIMATE_MAX_SIZE - ULTIMATE_MIN_SIZE);
            chargingBall.scaling.setAll(currentSize);
            chargingBall.position.copyFrom(ballPos);
            
            // Auto-crouch while charging (same as shift)
            var ray = new BABYLON.Ray(playerPhysicsBody.position, new BABYLON.Vector3(0, -1, 0), 1.1);
            var hit = scene.pickWithRay(ray, function (mesh) {
                return mesh !== playerPhysicsBody && 
                       !mesh.name.startsWith("player") && 
                       mesh.name !== "skybox" &&
                       mesh.name !== "front";
            });
            if (hit && hit.hit) {
                playerPhysicsBody.physicsImpostor.setLinearVelocity(playerPhysicsBody.physicsImpostor.getLinearVelocity().scale(0.9));
                playerPhysicsBody.physicsImpostor.setAngularVelocity(playerPhysicsBody.physicsImpostor.getAngularVelocity().scale(0.9));
            }
            
            // Fire when fully charged
            if (ultimateCharge >= 100) {
                fireUltimate();
            }
        }
        
        // Grenade charging
        if (isChargingGrenade && !isDead) {
            grenadeCharge = Math.min(grenadeCharge + GRENADE_CHARGE_RATE, 100);
            
            const chargePercent = grenadeCharge / 100;
            const ballSize = GRENADE_MIN_SIZE + (GRENADE_MAX_SIZE - GRENADE_MIN_SIZE) * chargePercent;
            
            // Position both arms forward while charging (like ultimate)
            if (player.leftArm && player.rightArm) {
                player.leftArm.rotation.x = -1.2; // Arms forward
                player.rightArm.rotation.x = -1.2;
                player.leftArm.rotation.z = 0.3; // Slightly together
                player.rightArm.rotation.z = -0.3;
            }
            
            if (!grenadeChargingBall) {
                grenadeChargingBall = BABYLON.MeshBuilder.CreateSphere("grenadeChargingBall", {diameter: ballSize * 2, segments: 16}, scene);
                grenadeChargingBall.visibility = 0; // Make invisible, only show the 3D model
                
                // Load the grenade 3D model
                BABYLON.SceneLoader.ImportMesh("", GRENADE_MODEL_URL, "", scene, function(meshes) {
                    if (meshes.length > 0 && grenadeChargingBall && !grenadeChargingBall.isDisposed()) {
                        const grenadeModel = new BABYLON.TransformNode("grenadeChargingModel", scene);
                        
                        meshes.forEach(mesh => {
                            mesh.parent = grenadeModel;
                            mesh.isPickable = false;
                        });
                        
                        grenadeModel.parent = grenadeChargingBall;
                        grenadeModel.position = new BABYLON.Vector3(0, 0, 0);
                        grenadeModel.scaling = new BABYLON.Vector3(0.03, 0.03, 0.03); // Scale for charging grenade
                        grenadeChargingBall.grenadeModel = grenadeModel;
                    }
                }, null, function(scene, message, exception) {
                    console.error("Failed to load grenade model:", message, exception);
                    // Fallback: make visible with green material
                    grenadeChargingBall.visibility = 1;
                    const chargeMat = new BABYLON.StandardMaterial("grenadeChargeMat", scene);
                    chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
                    chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0);
                    chargeMat.alpha = 0.8;
                    grenadeChargingBall.material = chargeMat;
                });
            }
            
            grenadeChargingBall.scaling.setAll(ballSize * 2 / 0.1);
            
            // Rotate the grenade model while charging
            if (grenadeChargingBall.grenadeModel) {
                grenadeChargingBall.grenadeModel.rotation.y += 0.1;
                grenadeChargingBall.grenadeModel.rotation.x += 0.05;
            }
            
            // Position ball in front of player at hand height (like ultimate)
            var lookDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            var ballPos = playerPhysicsBody.position.add(lookDir.scale(1.5));
            ballPos.y += 0.3; // Raise to hand height
            grenadeChargingBall.position.copyFrom(ballPos);
            
            const grenadeBar = document.getElementById('grenadeBar');
            if (grenadeBar) {
                grenadeBar.style.width = grenadeCharge + '%';
            }
            
            const grenadeContainer = document.getElementById('grenadeContainer');
            if (grenadeContainer) {
                grenadeContainer.style.display = 'block';
            }
            
            currentAnimState = 'charging';
            
            // Fire when fully charged
            if (grenadeCharge >= 100) {
                fireGrenade();
            }
        }
        
        // Drone charging
        if (isChargingDrone && !isDead && !isDroneMode) {
            droneCharge = Math.min(droneCharge + DRONE_CHARGE_RATE, 100);
            
            // Position both arms up while charging
            if (player.leftArm && player.rightArm) {
                player.leftArm.rotation.x = -1.5;
                player.rightArm.rotation.x = -1.5;
                player.leftArm.rotation.z = 0.5;
                player.rightArm.rotation.z = -0.5;
            }
            
            // Create or update charging visual
            if (!droneChargingBall) {
                droneChargingBall = BABYLON.MeshBuilder.CreateBox("droneChargingBall", {size: 0.3}, scene);
                const chargeMat = new BABYLON.StandardMaterial("droneChargeMat", scene);
                chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
                chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.5);
                droneChargingBall.material = chargeMat;
            }
            
            const chargePercent = droneCharge / 100;
            droneChargingBall.scaling.setAll(0.3 + chargePercent * 0.5);
            
            // Position above player
            droneChargingBall.position.x = playerPhysicsBody.position.x;
            droneChargingBall.position.y = playerPhysicsBody.position.y + 2 + chargePercent;
            droneChargingBall.position.z = playerPhysicsBody.position.z;
            droneChargingBall.rotation.y += 0.1; // Spin effect
            
            const droneBar = document.getElementById('droneBar');
            if (droneBar) {
                droneBar.style.width = droneCharge + '%';
            }
            
            document.getElementById('droneContainer').style.display = 'block';
            
            currentAnimState = 'charging';
            
            // Launch drone when fully charged
            if (droneCharge >= 100) {
                launchDrone();
            }
        }
        
        // Drone mode controls
        if (isDroneMode && droneMesh && droneCamera) {
            // Drone movement with WASD
            const droneForward = droneCamera.getDirection(new BABYLON.Vector3(0, 0, 1));
            const droneRight = droneCamera.getDirection(new BABYLON.Vector3(1, 0, 0));
            droneForward.y = 0;
            droneForward.normalize();
            droneRight.y = 0;
            droneRight.normalize();
            
            let droneMove = new BABYLON.Vector3(0, 0, 0);
            
            if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
                droneMove.addInPlace(droneForward.scale(DRONE_SPEED));
            }
            if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
                droneMove.subtractInPlace(droneForward.scale(DRONE_SPEED));
            }
            if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
                droneMove.subtractInPlace(droneRight.scale(DRONE_SPEED));
            }
            if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
                droneMove.addInPlace(droneRight.scale(DRONE_SPEED));
            }
            if (keysPressed['Space']) {
                droneMove.y += DRONE_SPEED; // Go up
            }
            if (keysPressed['ShiftLeft'] || keysPressed['ShiftRight']) {
                droneMove.y -= DRONE_SPEED; // Go down
            }
            
            droneMesh.position.addInPlace(droneMove);
            
            // Check for collision with any object (except skybox)
            const droneRayDirs = [
                new BABYLON.Vector3(1, 0, 0),
                new BABYLON.Vector3(-1, 0, 0),
                new BABYLON.Vector3(0, 0, 1),
                new BABYLON.Vector3(0, 0, -1),
                new BABYLON.Vector3(0, -1, 0)
            ];
            
            for (let dir of droneRayDirs) {
                const ray = new BABYLON.Ray(droneMesh.position, dir, 0.5);
                const hit = scene.pickWithRay(ray, function(mesh) {
                    // Exclude the drone collider and any child meshes of the drone model
                    if (mesh === droneMesh) return false;
                    if (mesh.name.startsWith("drone")) return false;
                    if (mesh.name.startsWith("prop")) return false;
                    if (mesh.name === "skybox") return false;
                    if (mesh.name === "front") return false;
                    if (mesh === playerPhysicsBody) return false;
                    // Exclude bomb meshes (drone bomb and its loaded model)
                    if (mesh.name.startsWith("bomb")) return false;
                    if (mesh.name.includes("Bomb")) return false;
                    // Exclude meshes that are not pickable (loaded models set isPickable = false)
                    if (!mesh.isPickable) return false;
                    
                    // Check if this mesh is a descendant of droneMesh (including loaded model meshes)
                    let current = mesh;
                    while (current) {
                        if (current === droneMesh) {
                            return false;
                        }
                        current = current.parent;
                    }
                    
                    // Also check by checking if the mesh is in the drone model's children
                    if (droneMesh.droneModel) {
                        const droneChildren = droneMesh.droneModel.getChildMeshes(false);
                        if (droneChildren.includes(mesh)) {
                            return false;
                        }
                    }
                    
                    return true;
                });
                
                if (hit && hit.hit) {
                    // Drone crashed - exit drone mode
                    window.exitDrone();
                    return;
                }
            }
            
            // Keep drone above ground
            if (droneMesh.position.y < 2) {
                droneMesh.position.y = 2;
            }
            
            // Update drone camera position
            droneCamera.position.copyFrom(droneMesh.position);
            droneCamera.position.y += 0.5;
        }
        
        // Emit player movement to other players (throttled and volatile to prevent queue buildup)
        const now = Date.now();
        if (playerPhysicsBody && playerPhysicsBody.physicsImpostor && socket.connected && !isDead) {
            if (now - lastPositionUpdateTime >= POSITION_UPDATE_INTERVAL) {
                lastPositionUpdateTime = now;
                const pos = playerPhysicsBody.getAbsolutePosition();
                const vel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
                
                // Only skip if position is extremely invalid (below death threshold)
                if (pos.y >= DEATH_HEIGHT) {
                    // Use volatile to drop packets if network is congested (prevents old data arriving late)
                    socket.volatile.emit('playerMovement', {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z,
                        vx: vel.x,
                        vy: vel.y,
                        vz: vel.z,
                        rotation: player.rotation.y,
                        animState: currentAnimState,
                        chargeLevel: isChargingUltimate ? ultimateCharge : 0,
                        grenadeChargeLevel: isChargingGrenade ? grenadeCharge : 0,
                        droneChargeLevel: isChargingDrone ? droneCharge : 0,
                        isDroneMode: isDroneMode,
                        droneX: droneMesh ? droneMesh.position.x : 0,
                        droneY: droneMesh ? droneMesh.position.y : 0,
                        droneZ: droneMesh ? droneMesh.position.z : 0
                    });
                }
            }
        }
    });
    
    // Death and respawn functions (exposed to window for ultimate ball kills)
    window.triggerDeath = function(killerId, cause, killerName) {
        if (isDead) return; // Already dead
        isDead = true;
        
        // Cancel any charging abilities
        if (isChargingUltimate) {
            cancelUltimate();
        }
        
        if (isChargingGrenade) {
            cancelGrenade();
        }
        
        if (isChargingDrone) {
            window.cancelDrone();
        }
        
        // Exit drone mode if in it
        if (isDroneMode) {
            window.exitDrone();
        }
        
        // Notify other players that we died (hide our character on their screens)
        socket.emit('playerDied', { killerId: killerId, cause: cause });
        
        const overlay = document.getElementById('deathOverlay');
        const timerText = document.getElementById('respawnTimer');
        const causeText = document.getElementById('causeOfDeath');
        const killerText = document.getElementById('killerInfo');
        
        overlay.style.display = 'flex';
        causeText.textContent = "Cause of Death: " + (cause || "Unknown");
        
        // Prefer explicit killer name if passed (e.g. from server/kill event later), 
        // otherwise look up in otherPlayers
        let nameToShow = killerName || "Player";
        if (!killerName && killerId && otherPlayers[killerId]) {
            nameToShow = otherPlayers[killerId].username;
        } else if (!killerName && killerId === socket.id) {
             nameToShow = "Yourself";
        }

        if (killerId) {
             killerText.textContent = "Killed by: " + nameToShow;
             
             if (otherPlayers[killerId]) {
                const killerPos = otherPlayers[killerId].mesh.position;
                camera.setTarget(killerPos);
             }
        } else {
            killerText.textContent = "";
        }
        
        let countdown = 5;
        timerText.textContent = `Respawning in ${countdown}...`;
        
        const countdownInterval = setInterval(() => {
            countdown--;
            timerText.textContent = `Respawning in ${countdown}...`;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                respawnPlayer();
            }
        }, 1000);
    }
    
    function respawnPlayer() {
        // Reset position and velocity
        playerPhysicsBody.position.copyFrom(SPAWN_POSITION);
        playerPhysicsBody.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
        playerPhysicsBody.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
        
        // Notify other players that we respawned (show our character on their screens)
        socket.emit('playerRespawned');
        
        // Hide death overlay
        document.getElementById('deathOverlay').style.display = 'none';
        isDead = false;
    }
    
    // Fire ultimate ability
    window.fireUltimate = function() {
        isChargingUltimate = false;
        ultimateCharge = 0;
        document.getElementById('ultimateContainer').style.display = 'none';
        document.getElementById('ultimateBar').style.width = '0%';
        
        const shootDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        const startPos = playerPhysicsBody.position.add(shootDir.scale(2));
        
        // Dispose the charging ball visual
        if (chargingBall) {
            if (chargingBall.chargingModel) {
                chargingBall.chargingModel.dispose();
            }
            chargingBall.dispose();
            chargingBall = null;
        }
        
        // Arm throw animation - fling arms forward then reset
        if (player.leftArm && player.rightArm) {
            player.leftArm.rotation.x = -1.8;
            player.rightArm.rotation.x = -1.8;
            setTimeout(() => resetPlayerArms(), 200);
        }
        
        // Create invisible collider for the ultimate projectile
        const ultimateBall = BABYLON.MeshBuilder.CreateSphere("ultimateBall", {diameter: 0.6, segments: 8}, scene);
        ultimateBall.visibility = 0;
        ultimateBall.position = startPos.clone();
        ultimateBall.physicsImpostor = new BABYLON.PhysicsImpostor(ultimateBall, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 2, restitution: 0.8}, scene);
        
        // Load the external 3D model (cached from preload, so loads instantly)
        BABYLON.SceneLoader.ImportMesh("", ULTIMATE_MODEL_URL, "", scene, function(meshes) {
            if (meshes.length > 0 && ultimateBall && !ultimateBall.isDisposed()) {
                const ultimateModel = new BABYLON.TransformNode("ultimateModel", scene);
                
                meshes.forEach(mesh => {
                    // Hide mesh initially to prevent it appearing at world origin
                    mesh.setEnabled(false);
                    mesh.parent = ultimateModel;
                    mesh.isPickable = false;
                    // Re-enable after parenting
                    mesh.setEnabled(true);
                });
                
                ultimateModel.parent = ultimateBall;
                ultimateModel.position = new BABYLON.Vector3(0, 0, 0);
                ultimateModel.scaling = new BABYLON.Vector3(0.5, 0.5, 0.5); // Adjust scale as needed
                ultimateBall.ultimateModel = ultimateModel;
            }
        }, null, function(scene, message, exception) {
            console.error("Failed to load ultimate model:", message, exception);
            // Fallback: make the collider visible with a material
            ultimateBall.visibility = 1;
            const fallbackMat = new BABYLON.StandardMaterial("ultimateFallbackMat", scene);
            fallbackMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5);
            fallbackMat.emissiveColor = new BABYLON.Color3(0.8, 0, 0.4);
            ultimateBall.material = fallbackMat;
        });
        
        // ULTRA fast impulse (5x normal ball speed)
        ultimateBall.physicsImpostor.applyImpulse(shootDir.scale(225), ultimateBall.getAbsolutePosition());
        
        // MASSIVE recoil knockback - push player backwards very hard
        playerPhysicsBody.physicsImpostor.applyImpulse(shootDir.scale(-25), playerPhysicsBody.getAbsolutePosition());
        
        // Remove after 10 seconds
        setTimeout(() => {
            if (ultimateBall.ultimateModel) {
                ultimateBall.ultimateModel.dispose();
            }
            ultimateBall.dispose();
        }, 10000);
        
        // Emit to other players
        socket.emit('shootUltimate', {
            x: startPos.x, y: startPos.y, z: startPos.z,
            dirX: shootDir.x, dirY: shootDir.y, dirZ: shootDir.z
        });
    };
    
    // Cancel ultimate if X is released early or interrupted
    window.cancelUltimate = function() {
        if (isChargingUltimate) {
            isChargingUltimate = false;
            ultimateCharge = 0;
            currentAnimState = 'idle';
            document.getElementById('ultimateContainer').style.display = 'none';
            document.getElementById('ultimateBar').style.width = '0%';
            
            if (chargingBall) {
                if (chargingBall.chargingModel) {
                    chargingBall.chargingModel.dispose();
                }
                chargingBall.dispose();
                chargingBall = null;
            }
            
            resetPlayerArms();
        }
    };
    
    // Start charging ultimate
    window.startChargingUltimate = function() {
        if (!isDead && !isChargingUltimate && !isChargingGrenade && !isChargingDrone && !isSwingingBat) {
            isChargingUltimate = true;
            ultimateCharge = 0;
            document.getElementById('ultimateContainer').style.display = 'block';
        }
    };
    
    // Swing bat
    window.swingBat = function() {
        if (!canSwingBat || isDead || isSwingingBat || isChargingUltimate || isChargingGrenade || isChargingDrone) return;
        
        canSwingBat = false;
        isSwingingBat = true;
        
        // Show katana model (or fallback to capsule visibility)
        if (batMesh.katanaModel) {
            batMesh.katanaModel.setEnabled(true);
        } else {
            batMesh.visibility = 1;
        }
        
        // Store original arm rotation
        const originalArmRotX = player.rightArm.rotation.x;
        const originalArmRotZ = player.rightArm.rotation.z;
        
        // Animate swing by rotating the arm
        let frame = 0;
        const totalFrames = 25;
        const swingInterval = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            
            // Swing arc: arm goes from right side, forward, to left side
            // Rotation.x controls forward/back, rotation.z controls side angle
            const swingPhase = Math.sin(progress * Math.PI); // 0 -> 1 -> 0 arc
            
            // Arm swings forward and across
            player.rightArm.rotation.x = -1.5 * swingPhase; // Forward swing
            player.rightArm.rotation.z = -Math.PI / 6 + (Math.PI * 0.8 * progress); // Sweep from right to left
            player.rightArm.rotation.y = -0.5 * swingPhase; // Slight twist
            
            // Check for hits during swing
            checkBatHits();
            
            if (frame >= totalFrames) {
                clearInterval(swingInterval);
                // Hide katana model (or fallback to capsule visibility)
                if (batMesh.katanaModel) {
                    batMesh.katanaModel.setEnabled(false);
                } else {
                    batMesh.visibility = 0;
                }
                isSwingingBat = false;
                
                // Reset arm to original position
                player.rightArm.rotation.x = originalArmRotX;
                player.rightArm.rotation.z = originalArmRotZ;
                player.rightArm.rotation.y = 0;
            }
        }, BAT_SWING_DURATION / totalFrames);
        
        // Get forward direction for server emit
        const forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        
        // Emit to server
        socket.emit('batSwing', {
            x: playerPhysicsBody.position.x,
            y: playerPhysicsBody.position.y,
            z: playerPhysicsBody.position.z,
            dirX: forward.x,
            dirY: forward.y,
            dirZ: forward.z
        });
        
        // Cooldown
        setTimeout(() => {
            canSwingBat = true;
        }, BAT_COOLDOWN);
    };
    
    // Check for bat hits
    function checkBatHits() {
        if (!batMesh || !isSwingingBat) return;
        
        // Get bat world position (since it's parented to arm)
        const batWorldPos = batMesh.getAbsolutePosition();
        
        // Check other players
        Object.keys(otherPlayers).forEach(playerId => {
            const otherPlayer = otherPlayers[playerId];
            if (otherPlayer.collider) {
                const distance = BABYLON.Vector3.Distance(batWorldPos, otherPlayer.collider.position);
                if (distance < BAT_RANGE + 1.0) { // Slightly increased range since bat is on arm
                    // Apply knockback
                    const direction = otherPlayer.collider.position.subtract(batWorldPos).normalize();
                    if (otherPlayer.collider.physicsImpostor) {
                        otherPlayer.collider.physicsImpostor.applyImpulse(
                            direction.scale(BAT_KNOCKBACK_FORCE),
                            otherPlayer.collider.getAbsolutePosition()
                        );
                    }
                }
            }
        });
        
        // Check spawned blocks
        spawnedBlocks.forEach(block => {
            if (block.physicsImpostor) {
                const distance = BABYLON.Vector3.Distance(batWorldPos, block.position);
                if (distance < BAT_RANGE + 1.0) {
                    const direction = block.position.subtract(batWorldPos).normalize();
                    block.physicsImpostor.applyImpulse(
                        direction.scale(BAT_KNOCKBACK_FORCE * 2),
                        block.getAbsolutePosition()
                    );
                    
                    // Emit block hit to sync with other players
                    if (block.blockId) {
                        socket.emit('blockHit', {
                            blockId: block.blockId,
                            impulseX: direction.x * BAT_KNOCKBACK_FORCE * 2,
                            impulseY: direction.y * BAT_KNOCKBACK_FORCE * 2,
                            impulseZ: direction.z * BAT_KNOCKBACK_FORCE * 2
                        });
                    }
                }
            }
        });
    }
    
    // Fire grenade
    window.fireGrenade = function() {
        if (!grenadeChargingBall || isDead) return;
        
        const chargePercent = grenadeCharge / 100;
        const grenadeSize = GRENADE_MIN_SIZE + (GRENADE_MAX_SIZE - GRENADE_MIN_SIZE) * chargePercent;
        
        // Hide charging ball
        grenadeChargingBall.dispose();
        grenadeChargingBall = null;
        isChargingGrenade = false;
        grenadeCharge = 0;
        
        // Hide UI
        const grenadeContainer = document.getElementById('grenadeContainer');
        if (grenadeContainer) grenadeContainer.style.display = 'none';
        
        // Arm throw animation - fling arms forward then reset
        if (player.leftArm && player.rightArm) {
            player.leftArm.rotation.x = -1.8;
            player.rightArm.rotation.x = -1.8;
            setTimeout(() => resetPlayerArms(), 200);
        }
        
        // Create grenade projectile (invisible collider)
        const grenade = BABYLON.MeshBuilder.CreateSphere("grenade", {diameter: grenadeSize * 2, segments: 16}, scene);
        grenade.visibility = 0; // Make invisible, only show the 3D model
        
        // Load the grenade 3D model
        BABYLON.SceneLoader.ImportMesh("", GRENADE_MODEL_URL, "", scene, function(meshes) {
            if (meshes.length > 0 && grenade && !grenade.isDisposed()) {
                const grenadeModel = new BABYLON.TransformNode("grenadeModel", scene);
                
                meshes.forEach(mesh => {
                    mesh.parent = grenadeModel;
                    mesh.isPickable = false;
                });
                
                grenadeModel.parent = grenade;
                grenadeModel.position = new BABYLON.Vector3(0, 0, 0);
                grenadeModel.scaling = new BABYLON.Vector3(0.5, 0.5, 0.5); // Adjust scale as needed
                grenade.grenadeModel = grenadeModel;
                
                // Add rotation animation
                scene.registerBeforeRender(function() {
                    if (grenade && !grenade.isDisposed() && grenadeModel) {
                        grenadeModel.rotation.y += 0.1;
                        grenadeModel.rotation.x += 0.05;
                    }
                });
            }
        }, null, function(scene, message, exception) {
            console.error("Failed to load grenade model:", message, exception);
            // Fallback: make visible with green material
            grenade.visibility = 1;
            const grenadeMat = new BABYLON.StandardMaterial("grenadeMat", scene);
            grenadeMat.diffuseColor = new BABYLON.Color3(0, 0.8, 0); // Green
            grenadeMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0);
            grenadeMat.specularColor = new BABYLON.Color3(1, 1, 1);
            grenade.material = grenadeMat;
        });
        
        const forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        const spawnPos = camera.position.clone().add(forward.scale(1.5));
        grenade.position.copyFrom(spawnPos);
        
        grenade.physicsImpostor = new BABYLON.PhysicsImpostor(
            grenade,
            BABYLON.PhysicsImpostor.SphereImpostor,
            {mass: 2 * chargePercent, restitution: 0.6},
            scene
        );
        
        // Apply impulse based on charge
        const impulseStrength = 150 * chargePercent;
        grenade.physicsImpostor.applyImpulse(
            forward.scale(impulseStrength),
            grenade.getAbsolutePosition()
        );
        
        // Emit to server
        socket.emit('shootGrenade', {
            x: spawnPos.x,
            y: spawnPos.y,
            z: spawnPos.z,
            dirX: forward.x,
            dirY: forward.y,
            dirZ: forward.z,
            size: grenadeSize,
            charge: chargePercent
        });
        
        // Check for ground collision
        grenade.physicsImpostor.registerOnPhysicsCollide([scene.getMeshByName('ground').physicsImpostor], () => {
            // Clone position before disposal
            const explosionPos = grenade.position.clone();
            
            // Emit explosion to server - server will broadcast to everyone including us
            socket.emit('grenadeExploded', {
                x: explosionPos.x,
                y: explosionPos.y,
                z: explosionPos.z,
                size: grenadeSize
            });
            
            grenade.dispose();
        });
        
        // Remove after 10 seconds if it doesn't hit ground
        setTimeout(() => {
            if (!grenade.isDisposed()) {
                grenade.dispose();
            }
        }, 10000);
        
        currentAnimState = 'idle';
    };
    
    // Cancel grenade
    window.cancelGrenade = function() {
        if (!isChargingGrenade) return;
        
        isChargingGrenade = false;
        grenadeCharge = 0;
        
        if (grenadeChargingBall) {
            grenadeChargingBall.dispose();
            grenadeChargingBall = null;
        }
        
        const grenadeContainer = document.getElementById('grenadeContainer');
        if (grenadeContainer) grenadeContainer.style.display = 'none';
        
        resetPlayerArms();
        currentAnimState = 'idle';
    };
    
    // Start charging grenade
    window.startChargingGrenade = function() {
        if (isDead || isChargingGrenade || isDroneMode || isChargingUltimate || isChargingDrone || isSwingingBat) return;
        isChargingGrenade = true;
        grenadeCharge = 0;
        currentAnimState = 'charging';
    };
    
    // Start charging drone
    window.startChargingDrone = function() {
        if (isDead || isChargingDrone || isDroneMode || isChargingUltimate || isChargingGrenade || isSwingingBat) return;
        isChargingDrone = true;
        droneCharge = 0;
        currentAnimState = 'charging';
    };
    
    // Cancel drone charging
    window.cancelDrone = function() {
        if (isChargingDrone) {
            isChargingDrone = false;
            droneCharge = 0;
            currentAnimState = 'idle';
            document.getElementById('droneContainer').style.display = 'none';
            document.getElementById('droneBar').style.width = '0%';
            
            if (droneChargingBall) {
                droneChargingBall.dispose();
                droneChargingBall = null;
            }
            
            resetPlayerArms();
        }
    };
    
    // Launch drone after charging
    window.launchDrone = function() {
        isChargingDrone = false;
        droneCharge = 0;
        droneHealth = 2; // Reset drone health
        document.getElementById('droneContainer').style.display = 'none';
        document.getElementById('droneBar').style.width = '0%';
        
        // Dispose charging ball
        if (droneChargingBall) {
            droneChargingBall.dispose();
            droneChargingBall = null;
        }
        
        // Create invisible collider for the drone
        const droneCollider = BABYLON.MeshBuilder.CreateBox("droneCollider", {width: 0.8, height: 0.3, depth: 0.8}, scene);
        droneCollider.visibility = 0;
        droneCollider.position.x = playerPhysicsBody.position.x;
        droneCollider.position.y = playerPhysicsBody.position.y + 5;
        droneCollider.position.z = playerPhysicsBody.position.z;
        
        // Add physics collider for the drone so it can be hit
        droneCollider.physicsImpostor = new BABYLON.PhysicsImpostor(
            droneCollider,
            BABYLON.PhysicsImpostor.BoxImpostor,
            {mass: 0, restitution: 0.3},
            scene
        );
        
        droneMesh = droneCollider;
        
        // Load the external 3D model (cached from preload, so loads instantly)
        BABYLON.SceneLoader.ImportMesh("", DRONE_MODEL_URL, "", scene, function(meshes) {
            if (meshes.length > 0 && droneMesh) {
                const droneModel = new BABYLON.TransformNode("droneModel", scene);
                
                meshes.forEach(mesh => {
                    mesh.parent = droneModel;
                    mesh.isPickable = false;
                });
                
                droneModel.parent = droneCollider;
                droneModel.position = new BABYLON.Vector3(0, -0.4, 0); // Offset down to center model on collider (model pivot is below mesh)
                droneModel.scaling = new BABYLON.Vector3(5, 5, 5);
                droneCollider.droneModel = droneModel;
            }
        }, null, function(scene, message, exception) {
            console.error("Failed to load drone model:", message, exception);
            droneCollider.visibility = 1;
            const fallbackMat = new BABYLON.StandardMaterial("droneFallbackMat", scene);
            fallbackMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            fallbackMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.3);
            droneCollider.material = fallbackMat;
        });
        
        // Create drone camera
        droneCamera = new BABYLON.FreeCamera("droneCamera", droneMesh.position.clone(), scene);
        droneCamera.position.y += 0.5;
        droneCamera.attachControl(canvas, true);
        droneCamera.inertia = 0.5;
        droneCamera.angularSensibility = 500;
        
        // Cool camera transition - start from player camera position
        const startPos = camera.position.clone();
        const endPos = droneCamera.position.clone();
        let transitionProgress = 0;
        
        // Create transition camera
        const transitionCamera = new BABYLON.FreeCamera("transitionCam", startPos, scene);
        transitionCamera.rotation = camera.rotation.clone();
        scene.activeCamera = transitionCamera;
        
        const transitionInterval = setInterval(() => {
            transitionProgress += 0.05;
            if (transitionProgress >= 1) {
                clearInterval(transitionInterval);
                transitionCamera.dispose();
                scene.activeCamera = droneCamera;
                droneCamera.rotation = new BABYLON.Vector3(0.5, 0, 0); // Look slightly down
            } else {
                // Smooth interpolation
                const t = transitionProgress * transitionProgress * (3 - 2 * transitionProgress); // Smoothstep
                transitionCamera.position = BABYLON.Vector3.Lerp(startPos, endPos, t);
            }
        }, 16);
        
        isDroneMode = true;
        document.getElementById('droneModeIndicator').style.display = 'block';
        
        resetPlayerArms();
        currentAnimState = 'idle';
    };
    
    // Exit drone mode
    window.exitDrone = function() {
        if (!isDroneMode) return;
        
        isDroneMode = false;
        document.getElementById('droneModeIndicator').style.display = 'none';
        
        // Cool camera transition back to player
        if (droneCamera && droneMesh) {
            const startPos = droneCamera.position.clone();
            const endPos = playerPhysicsBody.position.clone();
            endPos.y += 1; // Eye height
            let transitionProgress = 0;
            
            // Create transition camera
            const transitionCamera = new BABYLON.FreeCamera("transitionCamBack", startPos, scene);
            transitionCamera.rotation = droneCamera.rotation.clone();
            scene.activeCamera = transitionCamera;
            
            const transitionInterval = setInterval(() => {
                transitionProgress += 0.08;
                if (transitionProgress >= 1) {
                    clearInterval(transitionInterval);
                    transitionCamera.dispose();
                    scene.activeCamera = camera;
                    camera.attachControl(canvas, true);
                } else {
                    // Smooth interpolation
                    const t = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
                    transitionCamera.position = BABYLON.Vector3.Lerp(startPos, endPos, t);
                }
            }, 16);
        } else {
            scene.activeCamera = camera;
            camera.attachControl(canvas, true);
        }
        
        // Dispose drone and its loaded model
        if (droneMesh) {
            // Dispose the loaded 3D model if it exists
            if (droneMesh.droneModel) {
                droneMesh.droneModel.getChildMeshes().forEach(mesh => mesh.dispose());
                droneMesh.droneModel.dispose();
            }
            droneMesh.dispose();
            droneMesh = null;
        }
        
        // Dispose drone camera
        if (droneCamera) {
            droneCamera.detachControl(canvas);
            droneCamera.dispose();
            droneCamera = null;
        }
    };
    
    // Drop bomb from drone
    window.dropDroneBomb = function() {
        if (!isDroneMode || !droneMesh || !canDropBomb) return;
        
        canDropBomb = false;
        
        // Create invisible physics bomb
        const bomb = BABYLON.MeshBuilder.CreateSphere("droneBomb", {diameter: 0.4, segments: 16}, scene);
        bomb.visibility = 0; // Make physics sphere invisible
        
        // Add rotation animation
        const rotationObserver = scene.onBeforeRenderObservable.add(() => {
            if (bomb && !bomb.isDisposed()) {
                if (bomb.bombModel) {
                    bomb.bombModel.rotation.y += 0.1;
                    bomb.bombModel.rotation.x += 0.05;
                } else {
                    // Fallback if model not loaded yet or failed
                    bomb.rotation.y += 0.1;
                    bomb.rotation.x += 0.05;
                }
            } else {
                scene.onBeforeRenderObservable.remove(rotationObserver);
            }
        });
        
        // Drop from drone position
        bomb.position.copyFrom(droneMesh.position);
        bomb.position.y -= 0.5;
        
        // Track animation groups count before loading to find new ones
        const animGroupCountBefore = scene.animationGroups.length;
        
        // Load the 3D model for visual appearance (async, doesn't affect mechanics)
        try {
            BABYLON.SceneLoader.ImportMesh("", DRONE_BOMB_MODEL_URL, "", scene, function(meshes, particleSystems, skeletons, animationGroups) {
                if (meshes.length > 0 && bomb && !bomb.isDisposed()) {
                    const bombModel = new BABYLON.TransformNode("bombModel", scene);
                    
                    // Add all meshes
                    meshes.forEach(mesh => {
                        mesh.parent = bombModel;
                        mesh.isPickable = false;
                        // Ensure mesh doesn't interfere with game logic
                        if (mesh.actionManager) {
                            mesh.actionManager.dispose();
                            mesh.actionManager = null;
                        }
                    });
                    
                    bombModel.parent = bomb;
                    bombModel.position = new BABYLON.Vector3(0, 0, 0);
                    bombModel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3); // Adjust scale as needed
                    bomb.bombModel = bombModel;
                    
                    // Get newly added animation groups from scene
                    const newAnimGroups = scene.animationGroups.slice(animGroupCountBefore);
                    
                    // Debug logging
                    console.log("Bomb model loaded - meshes:", meshes.length);
                    console.log("Animation groups from callback:", animationGroups ? animationGroups.length : 0);
                    console.log("New animation groups from scene:", newAnimGroups.length);
                    console.log("Total scene animation groups:", scene.animationGroups.length);
                    if (animationGroups && animationGroups.length > 0) {
                        console.log("Animation group names:", animationGroups.map(a => a.name));
                    }
                    
                    // Play all new animations
                    if (newAnimGroups.length > 0) {
                        console.log("Playing new anim groups from scene");
                        newAnimGroups.forEach(animGroup => {
                            console.log("Starting animation:", animGroup.name, "from:", animGroup.from, "to:", animGroup.to);
                            animGroup.stop();
                            animGroup.start(true, 1.0, animGroup.from, animGroup.to, false);
                        });
                        bomb.animationGroups = newAnimGroups;
                    } else if (animationGroups && animationGroups.length > 0) {
                        // Fallback to callback parameter
                        console.log("Playing anim groups from callback");
                        animationGroups.forEach(animGroup => {
                            console.log("Starting animation:", animGroup.name, "from:", animGroup.from, "to:", animGroup.to);
                            animGroup.stop();
                            animGroup.start(true, 1.0, animGroup.from, animGroup.to, false);
                        });
                        bomb.animationGroups = animationGroups;
                    } else {
                        console.log("No animation groups found!");
                    }
                }
            }, null, function(sceneRef, message, exception) {
                // Model load failed - show fallback visual
                console.error("Failed to load bomb model:", message, exception);
                if (bomb && !bomb.isDisposed()) {
                    bomb.visibility = 1;
                    const fallbackMat = new BABYLON.StandardMaterial("bombFallbackMat_" + Date.now(), scene);
                    fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                    fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0);
                    bomb.material = fallbackMat;
                }
            });
        } catch (e) {
            // If model loading throws, show fallback visual
            if (bomb && !bomb.isDisposed()) {
                bomb.visibility = 1;
                const fallbackMat = new BABYLON.StandardMaterial("bombFallbackMat_" + Date.now(), scene);
                fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0);
                bomb.material = fallbackMat;
            }
        }
        
        // Emit bomb drop to other players
        socket.emit('droneBombDropped', {
            x: bomb.position.x,
            y: bomb.position.y,
            z: bomb.position.z
        });
        
        // Add physics - just falls down
        bomb.physicsImpostor = new BABYLON.PhysicsImpostor(
            bomb,
            BABYLON.PhysicsImpostor.SphereImpostor,
            {mass: 1, restitution: 0.3},
            scene
        );
        
        // Explode on ground collision
        bomb.physicsImpostor.registerOnPhysicsCollide([scene.getMeshByName('ground').physicsImpostor], () => {
            explodeDroneBomb(bomb.position.clone());
            bomb.dispose();
        });
        
        // Also explode after timeout
        setTimeout(() => {
            if (!bomb.isDisposed()) {
                explodeDroneBomb(bomb.position.clone());
                bomb.dispose();
            }
        }, 5000);
        
        // Cooldown
        setTimeout(() => {
            canDropBomb = true;
        }, DRONE_BOMB_COOLDOWN);
    };
    
    // Explode drone bomb (simple flash - no particles)
    function explodeDroneBomb(position) {
        createFlashEffect(position);
        
        // Apply knockback to nearby blocks only (not the player who dropped it)
        const explosionRadius = 16;
        const knockbackForce = 50;
        
        // Knockback blocks
        spawnedBlocks.forEach(block => {
            if (block && block.physicsImpostor) {
                const dist = BABYLON.Vector3.Distance(block.position, position);
                if (dist < explosionRadius) {
                    const dir = block.position.subtract(position).normalize();
                    const force = knockbackForce * (1 - dist / explosionRadius);
                    block.physicsImpostor.applyImpulse(
                        dir.scale(force).add(new BABYLON.Vector3(0, force * 0.3, 0)),
                        block.getAbsolutePosition()
                    );
                }
            }
        });
        
        // Emit drone bomb explosion to other players (lighter effect)
        socket.emit('droneBombExploded', {
            x: position.x,
            y: position.y,
            z: position.z
        });
    }
    
    return scene;
};

function handleMovement() {
    if (!playerPhysicsBody || !playerPhysicsBody.physicsImpostor) return;
    
    // Disable movement while chatting
    if (document.activeElement === document.getElementById('chatInput')) return;
    
    var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
    var right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
    forward.y = 0;
    forward.normalize();
    right.y = 0;
    right.normalize();
    
    const moveSpeed = 6;
    let moveDirection = new BABYLON.Vector3(0, 0, 0);
    let hasInput = false;

    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
        moveDirection.addInPlace(forward);
        hasInput = true;
    }
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
        moveDirection.subtractInPlace(forward);
        hasInput = true;
    }
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
        moveDirection.subtractInPlace(right);
        hasInput = true;
    }
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
        moveDirection.addInPlace(right);
        hasInput = true;
    }

    // Only apply movement if there's an actual movement direction (prevents W+S or A+D canceling knockback)
    if (hasInput && moveDirection.length() > 0.01) {
        moveDirection.normalize();
        const currentVel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
        // Apply velocity directly for instant response, preserving Y (gravity)
        playerPhysicsBody.physicsImpostor.setLinearVelocity(
            new BABYLON.Vector3(
                moveDirection.x * moveSpeed,
                currentVel.y,
                moveDirection.z * moveSpeed
            )
        );
    }
    
    // Brake/crouch - only works when grounded
    if (keysPressed['ShiftLeft'] || keysPressed['ShiftRight']) {
        var ray = new BABYLON.Ray(playerPhysicsBody.position, new BABYLON.Vector3(0, -1, 0), 1.1);
        var hit = scene.pickWithRay(ray, function (mesh) {
            // Exclude player physics body and all player visual mesh parts (names start with "player")
            return mesh !== playerPhysicsBody && 
                   !mesh.name.startsWith("player") && 
                   mesh.name !== "skybox" &&
                   mesh.name !== "front";
        });

        if (hit && hit.hit) {
            playerPhysicsBody.physicsImpostor.setLinearVelocity(playerPhysicsBody.physicsImpostor.getLinearVelocity().scale(0.9));
            playerPhysicsBody.physicsImpostor.setAngularVelocity(playerPhysicsBody.physicsImpostor.getAngularVelocity().scale(0.9));
        }
    }
}

const scene = createScene();

// Preload 3D models to cache them (they load instantly when spawning since already in browser cache)
function preloadModels() {
    console.log("Preloading 3D models...");
    
    const modelsToLoad = [
        { url: DRONE_MODEL_URL, name: "Drone" },
        { url: ULTIMATE_MODEL_URL, name: "Ultimate" },
        { url: BALL_MODEL_URL, name: "Ball" },
        { url: KATANA_MODEL_URL, name: "Katana" },
        { url: DRONE_BOMB_MODEL_URL, name: "Drone Bomb" },
        { url: GRENADE_MODEL_URL, name: "Grenade" },
        { url: MINE_MODEL_URL, name: "Mine" }
    ];
    
    let loadedCount = 0;
    const totalModels = modelsToLoad.length;
    
    function updateLoadingProgress(modelName, success) {
        loadedCount++;
        const progress = Math.round((loadedCount / totalModels) * 100);
        
        if (loadingBar) loadingBar.style.width = progress + "%";
        if (loadingPercent) loadingPercent.textContent = progress + "%";
        if (loadingText) loadingText.textContent = success ? 
            `Loaded ${modelName}...` : 
            `${modelName} will load on use...`;
        
        console.log(`Loading progress: ${loadedCount}/${totalModels} (${progress}%) - ${modelName}`);
        
        if (loadedCount >= totalModels) {
            onAllModelsLoaded();
        }
    }
    
    function onAllModelsLoaded() {
        console.log("All models loaded!");
        modelsLoaded = true;
        
        if (loadingText) loadingText.textContent = "Ready!";
        
        // Fade out loading screen after a brief moment
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.style.transition = "opacity 0.5s ease";
                loadingScreen.style.opacity = "0";
                setTimeout(() => {
                    loadingScreen.style.display = "none";
                }, 500);
            }
        }, 300);
    }
    
    // Load all models
    modelsToLoad.forEach(model => {
        BABYLON.SceneLoader.LoadAssetContainer(model.url, "", scene, 
            function(container) {
                console.log(`${model.name} model cached successfully`);
                updateLoadingProgress(model.name, true);
            }, 
            function(event) {
                // Progress callback for individual model (optional)
            },
            function(scene, message, exception) {
                console.warn(`Failed to preload ${model.name} model (will load on first use):`, message);
                updateLoadingProgress(model.name, false);
            }
        );
    });
}

// Preload models on startup
preloadModels();

// Chat input blur handler
document.getElementById('chatInput').addEventListener('blur', function() {
    document.getElementById('chatInputContainer').style.opacity = '0';
    if (document.getElementById('chatMessages').children.length === 0) {
        document.getElementById('chatWrapper').style.display = 'none';
    }
});

// Velocity-based prediction and smooth interpolation for other players
let lastFrameTime = Date.now();
scene.registerBeforeRender(function() {
    const now = Date.now();
    const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.1); // Cap at 100ms to prevent huge jumps
    lastFrameTime = now;
    
    Object.values(otherPlayers).forEach(p => {
        if (p.mesh && p.targetX !== undefined) {
            // Predict where the player should be using velocity
            // This fills in the gaps between network updates
            p.targetX += p.velocityX * deltaTime;
            p.targetY += p.velocityY * deltaTime;
            p.targetZ += p.velocityZ * deltaTime;
            
            // Apply gravity to Y prediction (prevents floating)
            p.velocityY -= 9.81 * deltaTime;
            
            // Clamp target Y to not go below ground (approximate)
            if (p.targetY < 0) {
                p.targetY = 0;
                p.velocityY = 0;
            }
            
            // Smoothly move mesh toward predicted target position
            // Use faster interpolation when there's significant velocity
            const speed = Math.sqrt(p.velocityX * p.velocityX + p.velocityZ * p.velocityZ);
            const lerpSpeed = speed > 0.5 ? 0.4 : 0.25;
            
            p.mesh.position.x += (p.targetX - p.mesh.position.x) * lerpSpeed;
            p.mesh.position.y += (p.targetY - p.mesh.position.y) * lerpSpeed;
            p.mesh.position.z += (p.targetZ - p.mesh.position.z) * lerpSpeed;
            
            // Lerp rotation (handle wrap-around for smooth turning)
            let rotDiff = p.targetRotation - p.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            p.mesh.rotation.y += rotDiff * 0.35;
            
            // Update collider to match mesh (with offset)
            if (p.collider) {
                p.collider.position.x = p.mesh.position.x;
                p.collider.position.y = p.mesh.position.y + 0.5;
                p.collider.position.z = p.mesh.position.z;
            }
            
            // Smooth interpolation for other player's drone
            if (p.droneMesh && p.droneTargetX !== undefined) {
                p.droneMesh.position.x += (p.droneTargetX - p.droneMesh.position.x) * 0.3;
                p.droneMesh.position.y += (p.droneTargetY - p.droneMesh.position.y) * 0.3;
                p.droneMesh.position.z += (p.droneTargetZ - p.droneMesh.position.z) * 0.3;
            }
        }
    });
});

// Multiplayer Logic
function addOtherPlayer(playerInfo) {
    console.log('Adding other player:', playerInfo.playerId.substring(0, 8));
    
    // Visual humanoid character (red)
    const mesh = createCharacterMesh(scene, "otherPlayer_" + playerInfo.playerId, new BABYLON.Color3(1, 0.3, 0.3), playerInfo.username || "Player");
    mesh.position.set(playerInfo.x, playerInfo.y - 0.5, playerInfo.z);
    
    // Create bat for this player (attached to their right arm, hidden by default)
    const otherBat = BABYLON.MeshBuilder.CreateCapsule("otherBat_" + playerInfo.playerId, {height: 3.0, radius: 0.08}, scene);
    otherBat.parent = mesh.rightArm;
    otherBat.position.set(0, -1.5, 0);
    otherBat.visibility = 0; // Always invisible - katana model will be shown instead
    
    // Load katana 3D model for this player (cached from preload)
    BABYLON.SceneLoader.ImportMesh("", KATANA_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && otherBat && !otherBat.isDisposed()) {
            const katanaModel = new BABYLON.TransformNode("otherKatanaModel_" + playerInfo.playerId, scene);
            
            meshes.forEach(mesh => {
                mesh.parent = katanaModel;
                mesh.isPickable = false;
            });
            
            katanaModel.parent = otherBat;
            katanaModel.position = new BABYLON.Vector3(0, 0, 0); // Adjust X, Y, Z as needed to align with hand
            katanaModel.scaling = new BABYLON.Vector3(3, 3, 3); // 3x larger
            katanaModel.rotation = new BABYLON.Vector3(0, 0, Math.PI); // 180 degrees flip around Z-axis
            otherBat.katanaModel = katanaModel;
            katanaModel.setEnabled(false); // Hidden until swing
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load other player katana model:", message, exception);
        // Fallback: make the capsule visible with a material when swinging
        const otherBatMat = new BABYLON.StandardMaterial("otherBatMat_" + playerInfo.playerId, scene);
        otherBatMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
        otherBatMat.emissiveColor = new BABYLON.Color3(0.1, 0.05, 0.025);
        otherBat.material = otherBatMat;
    });
    
    // Physics collider (invisible, for collisions)
    const collider = BABYLON.MeshBuilder.CreateSphere("otherCollider_" + playerInfo.playerId, {diameter: 1.5, segments: 8}, scene);
    collider.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    collider.visibility = 0;
    collider.physicsImpostor = new BABYLON.PhysicsImpostor(collider, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0, restitution: 0.3}, scene);
    
    otherPlayers[playerInfo.playerId] = { 
        mesh, 
        collider,
        batMesh: otherBat,  // Store the bat mesh for this player
        chargingBall: null,  // For showing their charging ultimate
        grenadeChargingBall: null,  // For showing their charging grenade
        lastAnimState: 'idle',
        username: playerInfo.username || "Player", // Store username here for easy access
        // Position and velocity for smooth interpolation
        serverX: playerInfo.x,
        serverY: playerInfo.y - 0.5,
        serverZ: playerInfo.z,
        targetX: playerInfo.x,
        targetY: playerInfo.y - 0.5,
        targetZ: playerInfo.z,
        targetRotation: 0,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0
    };
}

// Apply animation to other player's character
function applyOtherPlayerAnimation(playerData, animState, chargeLevel, grenadeChargeLevel, droneChargeLevel) {
    const mesh = playerData.mesh;
    if (!mesh || !mesh.leftArm || !mesh.rightArm) return;
    
    grenadeChargeLevel = grenadeChargeLevel || 0;
    droneChargeLevel = droneChargeLevel || 0;
    
    // Handle ultimate charging ball
    if (animState === 'charging' && chargeLevel > 0) {
        // Create or update charging ball
        if (!playerData.chargingBall) {
            playerData.chargingBall = BABYLON.MeshBuilder.CreateSphere("otherChargingBall", {diameter: 1, segments: 8}, scene);
            playerData.chargingBall.visibility = 0;
            
            // Load the 3D model (cached from preload, so loads instantly)
            const targetBall = playerData.chargingBall;
            BABYLON.SceneLoader.ImportMesh("", ULTIMATE_MODEL_URL, "", scene, function(meshes) {
                if (meshes.length > 0 && targetBall && !targetBall.isDisposed()) {
                    const chargingModel = new BABYLON.TransformNode("otherChargingModel", scene);
                    
                    meshes.forEach(mesh => {
                        mesh.parent = chargingModel;
                        mesh.isPickable = false;
                    });
                    
                    chargingModel.parent = targetBall;
                    chargingModel.position = new BABYLON.Vector3(0, 0, 0);
                    targetBall.chargingModel = chargingModel;
                }
            }, null, function(scene, message, exception) {
                console.error("Failed to load other player charging model:", message, exception);
                // Fallback: make the container visible with a material
                if (targetBall && !targetBall.isDisposed()) {
                    targetBall.visibility = 1;
                    const fallbackMat = new BABYLON.StandardMaterial("otherChargeFallbackMat", scene);
                    fallbackMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5);
                    fallbackMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.3);
                    targetBall.material = fallbackMat;
                }
            });
        }
        
        // Size based on charge
        const currentSize = ULTIMATE_MIN_SIZE + (chargeLevel / 100) * (ULTIMATE_MAX_SIZE - ULTIMATE_MIN_SIZE);
        playerData.chargingBall.scaling.setAll(currentSize);
        
        // Position in front of character
        const forward = new BABYLON.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
        const ballPos = mesh.position.add(forward.scale(1.5));
        ballPos.y += 0.8;
        playerData.chargingBall.position.copyFrom(ballPos);
        
        // Arms forward
        mesh.leftArm.rotation.x = -1.2;
        mesh.rightArm.rotation.x = -1.2;
        mesh.leftArm.rotation.z = 0.3;
        mesh.rightArm.rotation.z = -0.3;
    } else {
        // Dispose ultimate charging ball if not charging ultimate
        if (playerData.chargingBall) {
            if (playerData.chargingBall.chargingModel) {
                playerData.chargingBall.chargingModel.dispose();
            }
            playerData.chargingBall.dispose();
            playerData.chargingBall = null;
        }
    }
    
    // Handle grenade charging ball (separate from ultimate)
    if (animState === 'charging' && grenadeChargeLevel > 0) {
        // Create or update grenade charging ball
        if (!playerData.grenadeChargingBall) {
            playerData.grenadeChargingBall = BABYLON.MeshBuilder.CreateSphere("otherGrenadeChargingBall", {diameter: 1, segments: 8}, scene);
            playerData.grenadeChargingBall.visibility = 0; // Make invisible, only show the 3D model
            
            // Load the grenade 3D model
            BABYLON.SceneLoader.ImportMesh("", GRENADE_MODEL_URL, "", scene, function(meshes) {
                if (meshes.length > 0 && playerData.grenadeChargingBall && !playerData.grenadeChargingBall.isDisposed()) {
                    const grenadeModel = new BABYLON.TransformNode("otherGrenadeChargingModel", scene);
                    
                    meshes.forEach(mesh => {
                        mesh.parent = grenadeModel;
                        mesh.isPickable = false;
                    });
                    
                    grenadeModel.parent = playerData.grenadeChargingBall;
                    grenadeModel.position = new BABYLON.Vector3(0, 0, 0);
                    grenadeModel.scaling = new BABYLON.Vector3(0.03, 0.03, 0.03); // Scale for charging grenade (same as local player)
                    playerData.grenadeChargingBall.grenadeModel = grenadeModel;
                }
            }, null, function(scene, message, exception) {
                console.error("Failed to load other player grenade model:", message, exception);
                // Fallback: make visible with green material
                playerData.grenadeChargingBall.visibility = 1;
                const chargeMat = new BABYLON.StandardMaterial("otherGrenadeChargeMat", scene);
                chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
                chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0);
                chargeMat.alpha = 0.8;
                playerData.grenadeChargingBall.material = chargeMat;
            });
        }
        
        // Size based on charge
        const chargePercent = grenadeChargeLevel / 100;
        const ballSize = GRENADE_MIN_SIZE + (GRENADE_MAX_SIZE - GRENADE_MIN_SIZE) * chargePercent;
        playerData.grenadeChargingBall.scaling.setAll(ballSize * 2 / 0.1);
        
        // Rotate the grenade model while charging
        if (playerData.grenadeChargingBall.grenadeModel) {
            playerData.grenadeChargingBall.grenadeModel.rotation.y += 0.1;
            playerData.grenadeChargingBall.grenadeModel.rotation.x += 0.05;
        }
        
        // Position in front of character
        const forward = new BABYLON.Vector3(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
        const ballPos = mesh.position.add(forward.scale(1.5));
        ballPos.y += 0.8;
        playerData.grenadeChargingBall.position.copyFrom(ballPos);
        
        // Arms forward (if not already set by ultimate)
        if (chargeLevel <= 0) {
            mesh.leftArm.rotation.x = -1.2;
            mesh.rightArm.rotation.x = -1.2;
            mesh.leftArm.rotation.z = 0.3;
            mesh.rightArm.rotation.z = -0.3;
        }
    } else {
        // Dispose grenade charging ball if not charging grenade
        if (playerData.grenadeChargingBall) {
            playerData.grenadeChargingBall.dispose();
            playerData.grenadeChargingBall = null;
        }
    }
    
    // Handle drone charging (cyan box above head)
    if (animState === 'charging' && droneChargeLevel > 0) {
        // Create or update drone charging visual
        if (!playerData.droneChargingBall) {
            playerData.droneChargingBall = BABYLON.MeshBuilder.CreateBox("otherDroneChargingBall", {size: 0.3}, scene);
            const chargeMat = new BABYLON.StandardMaterial("otherDroneChargeMat", scene);
            chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
            chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.5);
            playerData.droneChargingBall.material = chargeMat;
        }
        
        // Size based on charge
        const chargePercent = droneChargeLevel / 100;
        playerData.droneChargingBall.scaling.setAll(0.3 + chargePercent * 0.5);
        
        // Position above character
        playerData.droneChargingBall.position.x = mesh.position.x;
        playerData.droneChargingBall.position.y = mesh.position.y + 2 + chargePercent;
        playerData.droneChargingBall.position.z = mesh.position.z;
        playerData.droneChargingBall.rotation.y += 0.1; // Spin effect
        
        // Arms up
        mesh.leftArm.rotation.x = -1.5;
        mesh.rightArm.rotation.x = -1.5;
        mesh.leftArm.rotation.z = 0.5;
        mesh.rightArm.rotation.z = -0.5;
    } else {
        // Dispose drone charging ball if not charging drone
        if (playerData.droneChargingBall) {
            playerData.droneChargingBall.dispose();
            playerData.droneChargingBall = null;
        }
    }
    
    // Handle other animations when not charging anything
    if (!(animState === 'charging' && (chargeLevel > 0 || grenadeChargeLevel > 0 || droneChargeLevel > 0))) {
        if (animState === 'shooting') {
            // One arm punch
            mesh.rightArm.rotation.x = -1.2;
            mesh.rightArm.rotation.z = 0;
        } else if (animState === 'building') {
            // Both arms forward
            mesh.leftArm.rotation.x = -0.5;
            mesh.rightArm.rotation.x = -0.5;
        } else {
            // Idle - reset arms
            mesh.leftArm.rotation.x = 0;
            mesh.rightArm.rotation.x = 0;
            mesh.leftArm.rotation.z = Math.PI / 6;
            mesh.rightArm.rotation.z = -Math.PI / 6;
        }
    }
    
    playerData.lastAnimState = animState;
}

socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        if (id === socket.id) return;
        addOtherPlayer(players[id]);
    });
});

// Room settings (hardcore mode, etc.)
let isHardcoreMode = false;
socket.on('roomSettings', (settings) => {
    console.log('Room settings received:', settings);
    isHardcoreMode = settings.hardcoreMode;
    
    // Toggle wall visibility and physics based on hardcore mode
    if (window.arenaWalls) {
        window.arenaWalls.forEach(wall => {
            if (isHardcoreMode) {
                // Hide walls and disable physics
                wall.setEnabled(false);
                if (wall.physicsImpostor) {
                    wall.physicsImpostor.setMass(0);
                    wall.physicsImpostor.dispose();
                }
            } else {
                // Show walls and restore physics
                wall.setEnabled(true);
                if (!wall.physicsImpostor || wall.physicsImpostor.isDisposed) {
                    wall.physicsImpostor = new BABYLON.PhysicsImpostor(wall, BABYLON.PhysicsImpostor.BoxImpostor, {mass:0, restitution: 0.9}, scene);
                }
            }
        });
    }
    
    // Show notification about mode
    if (settings.hardcoreMode) {
        Swal.fire({
            icon: 'warning',
            title: '☠️ HARDCORE MODE',
            text: 'No walls! Fall off and you die!',
            timer: 3000,
            showConfirmButton: false,
            background: '#1a1a2e',
            color: '#fff'
        });
    }
});

socket.on('currentBlocks', (blocks) => {
    blocks.forEach((block) => {
        spawnBlock(block);
    });
});

socket.on('newPlayer', (playerInfo) => {
    addOtherPlayer(playerInfo);
});

let moveCount = 0;
socket.on('playerMoved', (playerInfo) => {
    moveCount++;
    if (moveCount % 60 === 0) { // Log every 60 messages
        console.log('Received', moveCount, 'movement updates');
    }
    
    if (otherPlayers[playerInfo.playerId]) {
        const p = otherPlayers[playerInfo.playerId];
        
        // Snap the internal target to the authoritative server position
        // The mesh will smoothly interpolate toward this
        p.serverX = playerInfo.x;
        p.serverY = playerInfo.y - 0.5;
        p.serverZ = playerInfo.z;
        p.targetRotation = playerInfo.rotation || 0;
        
        // Store velocity for prediction between updates
        p.velocityX = playerInfo.vx || 0;
        p.velocityY = playerInfo.vy || 0;
        p.velocityZ = playerInfo.vz || 0;
        
        // Reset prediction target to server position
        p.targetX = p.serverX;
        p.targetY = p.serverY;
        p.targetZ = p.serverZ;
        
        // Apply animation state immediately
        applyOtherPlayerAnimation(p, playerInfo.animState || 'idle', playerInfo.chargeLevel || 0, playerInfo.grenadeChargeLevel || 0, playerInfo.droneChargeLevel || 0);
        
        // Handle other player's drone
        if (playerInfo.isDroneMode) {
            // Create drone mesh if it doesn't exist
            if (!p.droneMesh) {
                // Create invisible collider for the drone
                p.droneMesh = BABYLON.MeshBuilder.CreateBox("otherDrone_" + playerInfo.playerId, {width: 0.8, height: 0.3, depth: 0.8}, scene);
                p.droneMesh.visibility = 0;
                
                // Initialize position
                p.droneMesh.position.set(playerInfo.droneX, playerInfo.droneY, playerInfo.droneZ);
                
                // Load the external 3D model (cached from preload, so loads instantly)
                BABYLON.SceneLoader.ImportMesh("", DRONE_MODEL_URL, "", scene, function(meshes) {
                    if (meshes.length > 0 && p.droneMesh) {
                        const droneModel = new BABYLON.TransformNode("otherDroneModel_" + playerInfo.playerId, scene);
                        
                        meshes.forEach(mesh => {
                            mesh.parent = droneModel;
                            mesh.isPickable = false;
                        });
                        
                        droneModel.parent = p.droneMesh;
                        droneModel.position = new BABYLON.Vector3(0, -0.6, 0); // Offset down to center model on collider (model pivot is below mesh)
                        droneModel.scaling = new BABYLON.Vector3(5, 5, 5);
                        p.droneMesh.droneModel = droneModel;
                    }
                }, null, function(scene, message, exception) {
                    console.error("Failed to load other player drone model:", message, exception);
                    if (p.droneMesh) {
                        p.droneMesh.visibility = 1;
                        const fallbackMat = new BABYLON.StandardMaterial("otherDroneFallbackMat_" + playerInfo.playerId, scene);
                        fallbackMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
                        fallbackMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.3);
                        p.droneMesh.material = fallbackMat;
                    }
                });
            }
            
            // Store target position for smooth interpolation
            p.droneTargetX = playerInfo.droneX;
            p.droneTargetY = playerInfo.droneY;
            p.droneTargetZ = playerInfo.droneZ;
        } else {
            // Dispose drone mesh if player exits drone mode
            if (p.droneMesh) {
                // Dispose the loaded 3D model if it exists
                if (p.droneMesh.droneModel) {
                    p.droneMesh.droneModel.getChildMeshes().forEach(mesh => mesh.dispose());
                    p.droneMesh.droneModel.dispose();
                }
                p.droneMesh.dispose();
                p.droneMesh = null;
            }
        }
    }
});

socket.on('disconnectPlayer', (playerId) => {
    if (otherPlayers[playerId]) {
        cleanupOtherPlayerResources(otherPlayers[playerId]);
        delete otherPlayers[playerId];
    }
});

// Kill notification state
let killFeedTimeout;
let killAnimTimeout;

socket.on('killConfirmed', (data) => {
    // Show kill animation
    const killAnim = document.getElementById('killAnimation');
    const killedName = document.getElementById('killedName');
    killedName.textContent = data.victimName;
    killAnim.style.display = 'block';
    
    // Play sound or particle effect could go here
    
    // Hide after 2 seconds
    clearTimeout(killAnimTimeout);
    killAnimTimeout = setTimeout(() => {
        killAnim.style.display = 'none';
    }, 2000);
});

// Update kill feed when someone dies
socket.on('playerDied', (data) => {
    const p = otherPlayers[data.playerId];
    if (p) {
        setPlayerMeshVisibility(p.mesh, false);
        if (p.collider) p.collider.visibility = 0;
        if (p.chargingBall) { p.chargingBall.dispose(); p.chargingBall = null; }
        if (p.grenadeChargingBall) { p.grenadeChargingBall.dispose(); p.grenadeChargingBall = null; }
        if (p.grappleHook) { p.grappleHook.dispose(); p.grappleHook = null; }
        if (p.grappleLine) { p.grappleLine.dispose(); p.grappleLine = null; }
        p.isGrappling = false;
    }
    
    // Add to killfeed
    const victimName = otherPlayers[data.playerId] ? 
        (otherPlayers[data.playerId].username || "Player") : "Player";
         
    // We'd ideally need the names from the server for perfect accuracy in killfeed
});

// New death handler with info
socket.on('youDied', (data) => {
    // This is a custom event we should emit from server just for the victim
});

// Show player when they respawn
socket.on('playerRespawned', (playerId) => {
    if (otherPlayers[playerId]) {
        setPlayerMeshVisibility(otherPlayers[playerId].mesh, true);
    }
});


socket.on('blockSpawned', (blockData) => {
    spawnBlock(blockData);
});

socket.on('blockHit', (hitData) => {
    // Apply the same impulse to the block on this client
    const block = spawnedBlocksById[hitData.blockId];
    if (block && block.physicsImpostor) {
        const impulse = new BABYLON.Vector3(hitData.impulseX, hitData.impulseY, hitData.impulseZ);
        block.physicsImpostor.applyImpulse(impulse, block.getAbsolutePosition());
    }
});

socket.on('clearBlocks', () => {
    spawnedBlocks.forEach(mesh => {
        mesh.dispose();
    });
    spawnedBlocks.length = 0;
    
    // Also clear mines
    spawnedMines.forEach(mine => {
        if (mine.flashInterval) clearInterval(mine.flashInterval);
        mine.dispose();
    });
    spawnedMines.length = 0;
});

// Receive balls shot by other players
socket.on('ballShot', (ballData) => {
    // Create invisible physics ball
    const ball = BABYLON.MeshBuilder.CreateSphere("ball", {diameter: 0.3, segments: 8}, scene);
    ball.visibility = 0;
    ball.position.set(ballData.x, ballData.y, ballData.z);
    ball.physicsImpostor = new BABYLON.PhysicsImpostor(ball, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0.5, restitution: 0.5}, scene);
    
    // Load the 3D model (cached from preload, so loads instantly)
    BABYLON.SceneLoader.ImportMesh("", BALL_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && ball && !ball.isDisposed()) {
            const ballModel = new BABYLON.TransformNode("ballModel", scene);
            
            meshes.forEach(mesh => {
                mesh.parent = ballModel;
                mesh.isPickable = false;
            });
            
            ballModel.parent = ball;
            ballModel.position = new BABYLON.Vector3(0, 0, 0);
            ballModel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3); // Adjust scale as needed
            ball.ballModel = ballModel;
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load ball model:", message, exception);
        // Fallback: make the ball visible with a material
        ball.visibility = 1;
        const fallbackMat = new BABYLON.StandardMaterial("ballFallbackMat", scene);
        fallbackMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0); // Orange for other players
        fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0);
        ball.material = fallbackMat;
    });
    
    // Apply impulse in the direction it was shot
    const dir = new BABYLON.Vector3(ballData.dirX, ballData.dirY, ballData.dirZ);
    ball.physicsImpostor.applyImpulse(dir.scale(15), ball.getAbsolutePosition());

    // Check for collision with player
    ball.physicsImpostor.registerOnPhysicsCollide(playerPhysicsBody.physicsImpostor, () => {
        // Apply massive knockback to player when hit
        const knockbackStrength = 12; 
        const knockbackDir = dir.clone();
        knockbackDir.y += 0.5; // Add some lift
        knockbackDir.normalize();
        
        playerPhysicsBody.physicsImpostor.applyImpulse(knockbackDir.scale(knockbackStrength), playerPhysicsBody.getAbsolutePosition());
        
        // If we want to track who knocked us off, we should store the last hitter
        lastHitterId = ballData.shooterId;
        lastHitterTime = Date.now();
        lastHitCause = "Knocked into the void by Ball";
        
        cancelAllChargingAbilities();
    });
    
    // Check for collision with our drone
    if (droneMesh && droneMesh.physicsImpostor) {
        ball.physicsImpostor.registerOnPhysicsCollide(droneMesh.physicsImpostor, () => {
            // Drone was hit!
            droneHealth--;
            
            // Apply knockback to the drone
            if (droneMesh) {
                const knockbackDir = dir.clone().normalize();
                const knockbackStrength = 12;
                droneMesh.position.addInPlace(knockbackDir.scale(knockbackStrength));
                // Also update camera position
                if (droneCamera) {
                    droneCamera.position.addInPlace(knockbackDir.scale(knockbackStrength));
                }
            }
            
            // Flash the screen red (damage indicator)
            showDamageFlash();
            
            // Flash the drone mesh red too
            if (droneMesh && droneMesh.material) {
                const originalColor = droneMesh.material.emissiveColor.clone();
                droneMesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
                setTimeout(() => {
                    if (droneMesh && droneMesh.material) {
                        droneMesh.material.emissiveColor = originalColor;
                    }
                }, 200);
            }
            
            // If drone is dead, exit drone mode
            if (droneHealth <= 0) {
                window.exitDrone();
            }
        });
    }
    
    // Remove ball after 5 seconds
    setTimeout(() => {
        if (ball.ballModel) {
            ball.ballModel.dispose();
        }
        ball.dispose();
    }, 5000);
});

// Receive ultimate shots from other players
socket.on('ultimateShot', (ultimateData) => {
    // Create invisible collider for the ultimate projectile
    const ultimateBall = BABYLON.MeshBuilder.CreateSphere("ultimateBall", {diameter: 0.6, segments: 8}, scene);
    ultimateBall.visibility = 0;
    ultimateBall.position.set(ultimateData.x, ultimateData.y, ultimateData.z);
    ultimateBall.physicsImpostor = new BABYLON.PhysicsImpostor(ultimateBall, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 2, restitution: 0.8}, scene);
    
    // Load the external 3D model (cached from preload, so loads instantly)
    BABYLON.SceneLoader.ImportMesh("", ULTIMATE_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && ultimateBall && !ultimateBall.isDisposed()) {
            const ultimateModel = new BABYLON.TransformNode("ultimateModel", scene);
            
            meshes.forEach(mesh => {
                // Hide mesh initially to prevent it appearing at world origin
                mesh.setEnabled(false);
                mesh.parent = ultimateModel;
                mesh.isPickable = false;
                // Re-enable after parenting
                mesh.setEnabled(true);
            });
            
            ultimateModel.parent = ultimateBall;
            ultimateModel.position = new BABYLON.Vector3(0, 0, 0);
            ultimateModel.scaling = new BABYLON.Vector3(0.5, 0.5, 0.5); // Adjust scale as needed
            ultimateBall.ultimateModel = ultimateModel;
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load ultimate model:", message, exception);
        // Fallback: make the collider visible with a material
        ultimateBall.visibility = 1;
        const fallbackMat = new BABYLON.StandardMaterial("ultimateFallbackMat", scene);
        fallbackMat.diffuseColor = new BABYLON.Color3(0.8, 0, 0.8);
        fallbackMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.5);
        ultimateBall.material = fallbackMat;
    });
    
    // Ultimate ball is an INSTANT KILL - triggers death on collision with player
    ultimateBall.physicsImpostor.registerOnPhysicsCollide(playerPhysicsBody.physicsImpostor, () => {
        console.log('HIT BY ULTIMATE - INSTANT DEATH!');
        window.triggerDeath(ultimateData.shooterId, "Obliterated by Ultimate");
        // Dispose the ultimate ball after killing
        ultimateBall.dispose();
    });
    
    // Check for collision with our drone (instant destroy)
    if (droneMesh && droneMesh.physicsImpostor) {
        ultimateBall.physicsImpostor.registerOnPhysicsCollide(droneMesh.physicsImpostor, () => {
            // Ultimate instantly destroys drone
            droneHealth = 0;
            window.exitDrone();
        });
    }
    
    // ULTRA fast impulse (5x normal ball speed)
    const dir = new BABYLON.Vector3(ultimateData.dirX, ultimateData.dirY, ultimateData.dirZ);
    ultimateBall.physicsImpostor.applyImpulse(dir.scale(225), ultimateBall.getAbsolutePosition());
    
    // Remove after 10 seconds
    setTimeout(() => {
        if (ultimateBall && !ultimateBall.isDisposed()) {
            if (ultimateBall.ultimateModel) {
                ultimateBall.ultimateModel.dispose();
            }
            ultimateBall.dispose();
        }
    }, 10000);
});

// Receive bat swings from other players
socket.on('batSwung', (batData) => {
    const playerId = batData.playerId;
    
    // Show arm swing animation and bat on the other player
    if (otherPlayers[playerId]) {
        const otherPlayer = otherPlayers[playerId];
        const mesh = otherPlayer.mesh;
        const bat = otherPlayer.batMesh;
        
        if (mesh && mesh.rightArm) {
            // Show the katana model (or fallback to capsule visibility)
            if (bat) {
                if (bat.katanaModel) {
                    bat.katanaModel.setEnabled(true);
                } else {
                    bat.visibility = 1;
                }
            }
            
            // Store original arm rotation
            const originalRotX = mesh.rightArm.rotation.x;
            const originalRotZ = mesh.rightArm.rotation.z;
            const originalRotY = mesh.rightArm.rotation.y || 0;
            
            // Animate the swing (must match BAT_SWING_DURATION)
            let frame = 0;
            const totalFrames = 25;
            const swingDuration = BAT_SWING_DURATION; // Match BAT_SWING_DURATION
            const swingInterval = setInterval(() => {
                frame++;
                const progress = frame / totalFrames;
                const swingPhase = Math.sin(progress * Math.PI);
                
                mesh.rightArm.rotation.x = -1.5 * swingPhase;
                mesh.rightArm.rotation.z = -Math.PI / 6 + (Math.PI * 0.8 * progress);
                mesh.rightArm.rotation.y = -0.5 * swingPhase;
                
                if (frame >= totalFrames) {
                    clearInterval(swingInterval);
                    mesh.rightArm.rotation.x = originalRotX;
                    mesh.rightArm.rotation.z = originalRotZ;
                    mesh.rightArm.rotation.y = originalRotY;
                    
                    // Hide the katana model after swing (or fallback to capsule)
                    if (bat) {
                        if (bat.katanaModel) {
                            bat.katanaModel.setEnabled(false);
                        } else {
                            bat.visibility = 0;
                        }
                    }
                }
            }, swingDuration / totalFrames);
        }
    }
    
    // Check if we're close enough to get hit
    if (playerPhysicsBody) {
        const batPos = new BABYLON.Vector3(batData.x, batData.y, batData.z);
        const distance = BABYLON.Vector3.Distance(batPos, playerPhysicsBody.position);
        
        if (distance < 5.0) { // Extended range for long bat + network latency
            const knockbackDir = playerPhysicsBody.position.subtract(batPos).normalize();
            knockbackDir.y += 0.3; // Add some upward force
            playerPhysicsBody.physicsImpostor.applyImpulse(
                knockbackDir.scale(BAT_KNOCKBACK_FORCE),
                playerPhysicsBody.getAbsolutePosition()
            );
            
            // Track who hit us and how
            lastHitterId = playerId;
            lastHitterTime = Date.now();
            lastHitCause = "Knocked into the void with Knockback Stick";
            
            cancelAllChargingAbilities();
        }
    }
});

// Receive grenades from other players
socket.on('grenadeShot', (grenadeData) => {
    const grenade = BABYLON.MeshBuilder.CreateSphere("grenade", {diameter: grenadeData.size * 2, segments: 16}, scene);
    grenade.visibility = 0; // Make invisible, only show the 3D model
    grenade.position.set(grenadeData.x, grenadeData.y, grenadeData.z);
    
    // Load the grenade 3D model
    BABYLON.SceneLoader.ImportMesh("", GRENADE_MODEL_URL, "", scene, function(meshes) {
        if (meshes.length > 0 && grenade && !grenade.isDisposed()) {
            const grenadeModel = new BABYLON.TransformNode("grenadeModel", scene);
            
            meshes.forEach(mesh => {
                mesh.parent = grenadeModel;
                mesh.isPickable = false;
            });
            
            grenadeModel.parent = grenade;
            grenadeModel.position = new BABYLON.Vector3(0, 0, 0);
            grenadeModel.scaling = new BABYLON.Vector3(0.5, 0.5, 0.5); // Adjust scale as needed
            grenade.grenadeModel = grenadeModel;
            
            // Add rotation animation
            scene.registerBeforeRender(function() {
                if (grenade && !grenade.isDisposed() && grenadeModel) {
                    grenadeModel.rotation.y += 0.1;
                    grenadeModel.rotation.x += 0.05;
                }
            });
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load grenade model:", message, exception);
        // Fallback: make visible with green material
        grenade.visibility = 1;
        const grenadeMat = new BABYLON.StandardMaterial("grenadeMat", scene);
        grenadeMat.diffuseColor = new BABYLON.Color3(0, 0.8, 0); // Green
        grenadeMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0);
        grenadeMat.specularColor = new BABYLON.Color3(1, 1, 1);
        grenade.material = grenadeMat;
    });
    
    grenade.physicsImpostor = new BABYLON.PhysicsImpostor(
        grenade,
        BABYLON.PhysicsImpostor.SphereImpostor,
        {mass: 2 * grenadeData.charge, restitution: 0.6},
        scene
    );
    
    const dir = new BABYLON.Vector3(grenadeData.dirX, grenadeData.dirY, grenadeData.dirZ);
    const impulseStrength = 150 * grenadeData.charge;
    grenade.physicsImpostor.applyImpulse(
        dir.scale(impulseStrength),
        grenade.getAbsolutePosition()
    );
    
    // Check for ground collision - just dispose the grenade, explosion comes from server
    grenade.physicsImpostor.registerOnPhysicsCollide([scene.getMeshByName('ground').physicsImpostor], () => {
        // Dispose grenade - explosion will be triggered by grenadeExplosion event from server
        grenade.dispose();
    });
    
    setTimeout(() => {
        if (!grenade.isDisposed()) {
            grenade.dispose();
        }
    }, 10000);
});

// Grenade explosion effect with fragments
function explodeGrenade(position, size, shooterId) {
    const numFragments = 100; // More fragments for emphasis
    const fragmentSpeed = 10;
    
    for (let i = 0; i < numFragments; i++) {
        const fragment = BABYLON.MeshBuilder.CreateSphere(
            "fragment",
            {diameter: 1, segments: 8}, // Larger and smoother
            scene
        );
        const fragmentMat = new BABYLON.StandardMaterial("fragmentMat", scene);
        fragmentMat.diffuseColor = new BABYLON.Color3(1, 0.8, 0); // Bright yellow-orange
        fragmentMat.emissiveColor = new BABYLON.Color3(1, 0.6, 0); // Strong glow
        fragmentMat.specularColor = new BABYLON.Color3(1, 1, 0.5);
        fragment.material = fragmentMat;
        fragment.position.copyFrom(position);
        
        fragment.physicsImpostor = new BABYLON.PhysicsImpostor(
            fragment,
            BABYLON.PhysicsImpostor.SphereImpostor,
            {mass: 0.2, restitution: 0.7},
            scene
        );
        
        // Random direction
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const direction = new BABYLON.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)
        );
        
        fragment.physicsImpostor.applyImpulse(
            direction.scale(fragmentSpeed),
            fragment.getAbsolutePosition()
        );
        
        // Check collision with player
        fragment.physicsImpostor.registerOnPhysicsCollide(
            playerPhysicsBody.physicsImpostor,
            () => {
                if (!isDead) {
                    // Stronger damage knockback
                    const knockbackDir = playerPhysicsBody.position.subtract(position).normalize();
                    playerPhysicsBody.physicsImpostor.applyImpulse(
                        knockbackDir.scale(15), // Increased from 10 to 15
                        playerPhysicsBody.getAbsolutePosition()
                    );
                    
                    // Track that we were hit by grenade (for death messages)
                    lastHitterId = shooterId;
                    lastHitterTime = Date.now();
                    lastHitCause = "Killed by Grenade";
                }
            }
        );
        
        // Remove after 5 seconds (longer lifetime for emphasis)
        setTimeout(() => {
            if (!fragment.isDisposed()) {
                fragment.dispose();
            }
        }, 3000);
    }
}

// Receive grenade explosion from server
socket.on('grenadeExplosion', (explosionData) => {
    const position = new BABYLON.Vector3(explosionData.x, explosionData.y, explosionData.z);
    explodeGrenade(position, explosionData.size, explosionData.shooterId);
});

// ============ CHAT SYSTEM ============

// Receive chat messages from server
socket.on('chatMessage', (data) => {
    addChatMessage(data);
});

// Handle chat errors (rate limiting, etc.)
socket.on('chatError', (data) => {
    // Show error message in red
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(255,0,0,0.9);color:white;padding:15px 30px;border-radius:8px;z-index:9999;font-size:16px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    errorDiv.textContent = data.message;
    document.body.appendChild(errorDiv);
    
    // Remove after 3 seconds
    setTimeout(() => errorDiv.remove(), 3000);
});

function addChatMessage(data) {
    const chatWrapper = document.getElementById('chatWrapper');
    const chatMessages = document.getElementById('chatMessages');

    // Ensure chat is visible
    chatWrapper.style.display = 'block';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';

    // Handle system messages (death notifications)
    if (data.isSystem) {
        messageDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(231, 76, 60, 0.2); border-left: 3px solid #e74c3c; border-radius: 4px;">
                <span style="font-size: 18px;">💀</span>
                <span style="color: #ecf0f1; font-weight: 500;">${data.message}</span>
            </div>
        `;
    } else {
        // Regular user messages
        // Create badges based on roles
        let badgeHtml = '';
        if (data.isAdmin) {
            badgeHtml = '<span class="chat-badge badge-admin">Admin</span>';
        } else if (data.isVIP) {
            badgeHtml = '<span class="chat-badge badge-vip">VIP</span>';
        }

        // Add profile title if it exists
        if (data.profileTitle) {
            badgeHtml += `<span class="chat-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: #ccc;">${data.profileTitle}</span>`;
        }

        // Profile picture (always show, fallback to default if missing)
        const profilePicUrl = data.profilePicUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.username || 'Player') + '&background=4a90d9&color=fff&size=128';
        const profilePicHtml = `<img src="${profilePicUrl}" alt="Profile" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #4a90d9;" onerror="this.src='https://ui-avatars.com/api/?name=User&background=4a90d9&color=fff&size=128'">`;

        // Set message content with sanitized HTML for badges, profile pic, and username
        messageDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                ${profilePicHtml}
                <div style="display: flex; flex-direction: column;">
                    <div style="display: flex; align-items: center; gap: 5px;">
                        ${badgeHtml}
                        <span class="chat-username" style="color: ${data.isAdmin ? '#ff3333' : (data.isVIP ? '#ffd700' : '#4a90d9')}">${data.username}:</span>
                    </div>
                    <span class="chat-text" style="flex: 1; word-break: break-all;">${data.message}</span>
                </div>
            </div>
        `;
    }

    chatMessages.appendChild(messageDiv);

    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Clean up old messages after 15 seconds
    setTimeout(() => {
        // Only fade/remove if input is not focused
        if (document.activeElement !== document.getElementById('chatInput')) {
            messageDiv.style.transition = 'opacity 2s';
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv.parentNode === chatMessages) {
                    messageDiv.remove();
                    // Hide wrapper if no messages left and input not focused
                    if (chatMessages.children.length === 0 && document.activeElement !== document.getElementById('chatInput')) {
                        chatWrapper.style.display = 'none';
                    }
                }
            }, 2000);
        }
    }, 15000);
}

// Receive drone bomb explosion from server (lighter effect - just flash and knockback)
socket.on('droneBombExplosion', (explosionData) => {
    const position = new BABYLON.Vector3(explosionData.x, explosionData.y, explosionData.z);
    
    createFlashEffect(position);
    
    // Apply knockback to player if nearby (stronger to match grenade power)
    const explosionRadius = 16;
    const knockbackForce = 50;
    
    if (playerPhysicsBody && !isDead) {
        const dist = BABYLON.Vector3.Distance(playerPhysicsBody.position, position);
        if (dist < explosionRadius) {
            const knockbackDir = playerPhysicsBody.position.subtract(position).normalize();
            const force = knockbackForce * (1 - dist / explosionRadius);
            playerPhysicsBody.physicsImpostor.applyImpulse(
                knockbackDir.scale(force).add(new BABYLON.Vector3(0, force * 0.5, 0)),
                playerPhysicsBody.getAbsolutePosition()
            );
            
            // Track that we were hit by drone bomb (for death messages)
            lastHitterId = explosionData.shooterId;
            lastHitterTime = Date.now();
            lastHitCause = "Blown up by Drone";
        }
    }
});

// Receive drone bomb dropped by another player (show falling bomb)
socket.on('droneBombDropped', (bombData) => {
    // Create invisible physics bomb
    const bomb = BABYLON.MeshBuilder.CreateSphere("otherDroneBomb", {diameter: 0.4, segments: 16}, scene);
    bomb.visibility = 0; // Make physics sphere invisible
    
    // Add rotation animation
    const rotationObserver = scene.onBeforeRenderObservable.add(() => {
        if (bomb && !bomb.isDisposed()) {
            if (bomb.bombModel) {
                bomb.bombModel.rotation.y += 0.1;
                bomb.bombModel.rotation.x += 0.05;
            } else {
                // Fallback if model not loaded yet or failed
                bomb.rotation.y += 0.1;
                bomb.rotation.x += 0.05;
            }
        } else {
            scene.onBeforeRenderObservable.remove(rotationObserver);
        }
    });
    
    bomb.position.set(bombData.x, bombData.y, bombData.z);
    
    // Track animation groups count before loading to find new ones
    const animGroupCountBefore = scene.animationGroups.length;
    
    // Load the 3D model for visual appearance (async, doesn't affect mechanics)
    try {
        BABYLON.SceneLoader.ImportMesh("", DRONE_BOMB_MODEL_URL, "", scene, function(meshes, particleSystems, skeletons, animationGroups) {
            if (meshes.length > 0 && bomb && !bomb.isDisposed()) {
                const bombModel = new BABYLON.TransformNode("otherBombModel", scene);
                
                // Add all meshes
                meshes.forEach(mesh => {
                    mesh.parent = bombModel;
                    mesh.isPickable = false;
                    // Ensure mesh doesn't interfere with game logic
                    if (mesh.actionManager) {
                        mesh.actionManager.dispose();
                        mesh.actionManager = null;
                    }
                });
                
                bombModel.parent = bomb;
                bombModel.position = new BABYLON.Vector3(0, 0, 0);
                bombModel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3); // Adjust scale as needed
                bomb.bombModel = bombModel;
                
                // Get newly added animation groups from scene
                const newAnimGroups = scene.animationGroups.slice(animGroupCountBefore);
                
                // Play all new animations
                if (newAnimGroups.length > 0) {
                    newAnimGroups.forEach(animGroup => {
                        animGroup.stop();
                        animGroup.start(true, 1.0, animGroup.from, animGroup.to, false);
                    });
                    bomb.animationGroups = newAnimGroups;
                } else if (animationGroups && animationGroups.length > 0) {
                    // Fallback to callback parameter
                    animationGroups.forEach(animGroup => {
                        animGroup.stop();
                        animGroup.start(true, 1.0, animGroup.from, animGroup.to, false);
                    });
                    bomb.animationGroups = animationGroups;
                }
            }
        }, null, function(sceneRef, message, exception) {
            // Model load failed - show fallback visual
            if (bomb && !bomb.isDisposed()) {
                bomb.visibility = 1;
                const fallbackMat = new BABYLON.StandardMaterial("otherBombFallbackMat_" + Date.now(), scene);
                fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0);
                bomb.material = fallbackMat;
            }
        });
    } catch (e) {
        // If model loading throws, show fallback visual
        if (bomb && !bomb.isDisposed()) {
            bomb.visibility = 1;
            const fallbackMat = new BABYLON.StandardMaterial("otherBombFallbackMat_" + Date.now(), scene);
            fallbackMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0);
            bomb.material = fallbackMat;
        }
    }
    
    // Add physics so it falls
    bomb.physicsImpostor = new BABYLON.PhysicsImpostor(
        bomb,
        BABYLON.PhysicsImpostor.SphereImpostor,
        {mass: 1, restitution: 0.3},
        scene
    );
    
    // Remove after 5 seconds (explosion handled separately)
    setTimeout(() => {
        if (!bomb.isDisposed()) {
            bomb.dispose();
        }
    }, 5000);
});

// Your drone was hit by a projectile
socket.on('yourDroneHit', (hitData) => {
    if (isDroneMode && droneMesh) {
        droneHealth--;
        
        // Apply knockback to the drone
        if (hitData.dirX !== undefined) {
            const knockbackDir = new BABYLON.Vector3(hitData.dirX, hitData.dirY, hitData.dirZ).normalize();
            const knockbackStrength = 12;
            droneMesh.position.addInPlace(knockbackDir.scale(knockbackStrength));
            if (droneCamera) {
                droneCamera.position.addInPlace(knockbackDir.scale(knockbackStrength));
            }
        }
        
        // Flash the screen red (damage indicator)
        showDamageFlash();
        
        // Flash the drone mesh red too
        if (droneMesh.droneModel) {
            // Flash all child meshes of the loaded model
            const childMeshes = droneMesh.droneModel.getChildMeshes();
            const originalColors = [];
            
            childMeshes.forEach((mesh, i) => {
                if (mesh.material) {
                    originalColors[i] = mesh.material.emissiveColor ? mesh.material.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
                    mesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
                }
            });
            
            setTimeout(() => {
                if (droneMesh && droneMesh.droneModel) {
                    const meshes = droneMesh.droneModel.getChildMeshes();
                    meshes.forEach((mesh, i) => {
                        if (mesh.material && originalColors[i]) {
                            mesh.material.emissiveColor = originalColors[i];
                        }
                    });
                }
            }, 200);
        } else if (droneMesh.material) {
            // Fallback for box mesh
            const originalColor = droneMesh.material.emissiveColor.clone();
            droneMesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
            setTimeout(() => {
                if (droneMesh && droneMesh.material) {
                    droneMesh.material.emissiveColor = originalColor;
                }
            }, 200);
        }
        
        // If drone is dead, exit drone mode
        if (droneHealth <= 0) {
            window.exitDrone();
        }
    }
});

// Receive mine placed by another player
socket.on('minePlaced', (data) => {
    const position = new BABYLON.Vector3(data.x, data.y, data.z);
    const mine = createMineMesh(data.mineId, position);
    spawnedMines.push(mine);
});

// Receive mine triggered event (remove mine and apply boost if needed)
socket.on('mineTriggered', (data) => {
    // Find and remove the mine
    for (let i = spawnedMines.length - 1; i >= 0; i--) {
        const mine = spawnedMines[i];
        if (mine && mine.mineId === data.mineId) {
            disposeMine(mine);
            spawnedMines.splice(i, 1);
            break;
        }
    }
    
    // If we're the one who got boosted
    if (data.targetPlayerId === socket.id && playerPhysicsBody && playerPhysicsBody.physicsImpostor) {
        playerPhysicsBody.physicsImpostor.applyImpulse(
            new BABYLON.Vector3(0, MINE_BOOST_FORCE, 0),
            playerPhysicsBody.getAbsolutePosition()
        );
    }
});

// Helper function to spawn block
function spawnBlock(data) {
    var mesh;
    
    // Handle mine type separately (with physics for dropping)
    if (data.type == "mine") {
        const mineId = data.blockId || (socket.id + '_mine_' + Date.now());
        const position = new BABYLON.Vector3(data.position.x, data.position.y, data.position.z);
        
        mesh = createMineMesh(mineId, position);
        
        // Add physics so mine drops to floor first, then becomes static
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(
            mesh,
            BABYLON.PhysicsImpostor.CylinderImpostor,
            { mass: 0.5, restitution: 0, friction: 1000 },
            scene
        );
        
        // After 1 second, make the mine static so player can't push it
        setTimeout(() => {
            if (mesh && !mesh.isDisposed() && mesh.physicsImpostor) {
                const currentPos = mesh.position.clone();
                mesh.physicsImpostor.dispose();
                mesh.position.copyFrom(currentPos);
                mesh.physicsImpostor = new BABYLON.PhysicsImpostor(
                    mesh,
                    BABYLON.PhysicsImpostor.CylinderImpostor,
                    { mass: 0, restitution: 0, friction: 1000 },
                    scene
                );
            }
        }, 1000);
        
        spawnedMines.push(mesh);
        return; // Don't add to spawnedBlocks
    }
    
    var meshmat = new BABYLON.StandardMaterial("meshmat", scene);
    meshmat.diffuseColor = new BABYLON.Color3.FromHexString(data.color);
    meshmat.backFaceCulling = false;

    var frictionVal = data.slimy ? 300 : 0.5;
    
    if (data.type == "box") {
        mesh = BABYLON.MeshBuilder.CreateBox("mesh", {size:data.size}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.BoxImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "sphere") {
        mesh = BABYLON.MeshBuilder.CreateSphere("mesh", {diameter:data.size, segments:32}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.SphereImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "cylinder") {
        mesh = BABYLON.MeshBuilder.CreateCylinder("mesh", {height:data.size, diameter:data.size}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.CylinderImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    else if (data.type == "capsule") {
        mesh = BABYLON.MeshBuilder.CreateCapsule("mesh", {height:data.size, radius:(data.size/3)}, scene);
        mesh.physicsImpostor = new BABYLON.PhysicsImpostor(mesh, BABYLON.PhysicsImpostor.CapsuleImpostor, {mass:1, restitution:0, friction: frictionVal}, scene);
    }
    
    mesh.material = meshmat;
    if (data.type == "box" || data.type == "cylinder") {
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 4.0;
        mesh.edgesColor = new BABYLON.Color4(1, 1, 1, 1);
    }
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    
    // Store blockId for syncing
    if (data.blockId) {
        mesh.blockId = data.blockId;
        spawnedBlocksById[data.blockId] = mesh;
    }
    
    spawnedBlocks.push(mesh);
}

frontfacingvis.onchange = function() {
    if (checked) {
        frontfacing.visibility = 0;
        checked = false;
    } else {
        frontfacing.visibility = 0.5;
        checked = true;
    }
}

// Building arm animation (both arms)
function playBuildAnimation() {
    if (!player.leftArm || !player.rightArm) return;
    
    currentAnimState = 'building';
    const leftArm = player.leftArm;
    const rightArm = player.rightArm;
    const originalLeftX = leftArm.rotation.x;
    const originalRightX = rightArm.rotation.x;
    
    // Animate arms forward
    let frame = 0;
    const animInterval = setInterval(() => {
        frame++;
        if (frame <= 5) {
            // Arms swing forward
            leftArm.rotation.x = originalLeftX - (frame * 0.15);
            rightArm.rotation.x = originalRightX - (frame * 0.15);
        } else if (frame <= 10) {
            // Arms swing back
            leftArm.rotation.x = originalLeftX - ((10 - frame) * 0.15);
            rightArm.rotation.x = originalRightX - ((10 - frame) * 0.15);
        } else {
            // Reset
            leftArm.rotation.x = originalLeftX;
            rightArm.rotation.x = originalRightX;
            currentAnimState = 'idle';
            clearInterval(animInterval);
        }
    }, 30);
}

// Shooting animation (one arm - right arm)
function playShootAnimation() {
    if (!player.rightArm) return;
    
    currentAnimState = 'shooting';
    const rightArm = player.rightArm;
    const originalX = rightArm.rotation.x;
    const originalZ = rightArm.rotation.z;
    
    // Quick punch forward
    rightArm.rotation.x = -1.2;
    rightArm.rotation.z = 0;
    
    // Return to normal after short delay
    setTimeout(() => {
        if (player.rightArm) {
            player.rightArm.rotation.x = originalX;
            player.rightArm.rotation.z = originalZ;
            currentAnimState = 'idle';
        }
    }, 150);
}

// Prevent default context menu
canvas.oncontextmenu = function(e) { e.preventDefault(); };

// Fire rate limits
let canShoot = true;
let canBuild = true;
const SHOOT_COOLDOWN = 150; // ms
const BUILD_COOLDOWN = 200; // ms

// Use Babylon.js pointer observable for proper pointer lock support
scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        // Request pointer lock on any click
        if (!document.pointerLockElement) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
            canvas.requestPointerLock();
            return; // Don't shoot/build on the click that requests lock
        }
        
        const button = pointerInfo.event.button;
        
        if (button === 0) {
            // Left click
            
            // If in drone mode, drop a bomb instead of shooting
            if (isDroneMode) {
                window.dropDroneBomb();
                return;
            }
            
            // Normal shooting - shoot ball
            if (!canShoot || isDead || isChargingUltimate || isChargingGrenade || isChargingDrone) return; // Fire rate limit and death check
            
            canShoot = false;
            setTimeout(() => { canShoot = true; }, SHOOT_COOLDOWN);

            playShootAnimation(); // One arm punch animation
            
            const shootDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            const startPos = playerPhysicsBody.position.add(shootDir.scale(1.5));
            
            // Create invisible physics ball
            const ball = BABYLON.MeshBuilder.CreateSphere("ball", {diameter: 0.3, segments: 8}, scene);
            ball.visibility = 0;
            ball.position = startPos.clone();
            ball.physicsImpostor = new BABYLON.PhysicsImpostor(ball, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0.5, restitution: 0.5}, scene);
            
            // Load the 3D model (cached from preload, so loads instantly)
            BABYLON.SceneLoader.ImportMesh("", BALL_MODEL_URL, "", scene, function(meshes) {
                if (meshes.length > 0 && ball && !ball.isDisposed()) {
                    const ballModel = new BABYLON.TransformNode("ballModel", scene);
                    
                    meshes.forEach(mesh => {
                        mesh.parent = ballModel;
                        mesh.isPickable = false;
                    });
                    
                    ballModel.parent = ball;
                    ballModel.position = new BABYLON.Vector3(0, 0, 0);
                    ballModel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3); // Adjust scale as needed
                    ball.ballModel = ballModel;
                }
            }, null, function(scene, message, exception) {
                console.error("Failed to load ball model:", message, exception);
                // Fallback: make the ball visible with a material
                ball.visibility = 1;
                const fallbackMat = new BABYLON.StandardMaterial("ballFallbackMat", scene);
                fallbackMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
                fallbackMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0);
                ball.material = fallbackMat;
            });
            
            ball.physicsImpostor.applyImpulse(shootDir.scale(15), ball.getAbsolutePosition());
            
            // Recoil knockback - push player backwards
            playerPhysicsBody.physicsImpostor.applyImpulse(shootDir.scale(-3), playerPhysicsBody.getAbsolutePosition());
            
            setTimeout(() => {
                if (ball.ballModel) {
                    ball.ballModel.dispose();
                }
                ball.dispose();
            }, 5000);
            
            socket.emit('shootBall', {
                x: startPos.x, y: startPos.y, z: startPos.z,
                dirX: shootDir.x, dirY: shootDir.y, dirZ: shootDir.z
            });
        } else if (button === 2) {
            // Right click - spawn block
            if (!canBuild || isDead) return; // Build rate limit and death check
            
            canBuild = false;
            setTimeout(() => { canBuild = true; }, BUILD_COOLDOWN);
            
            playBuildAnimation();
            
            const sizeval = 0.1 + (size.value / 100) * 2.9; // Range: 0.1 (tiny) to 3 (large)
            const spawnPos = frontfacing.getAbsolutePosition();
            
            // Generate unique block ID
            blockIdCounter++;
            const blockId = socket.id + '_' + blockIdCounter + '_' + Date.now();
            
            const blockData = {
                blockId: blockId,
                type: meshtype.value,
                size: sizeval,
                position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
                color: document.getElementById("colorpicker").value,
                slimy: slimyToggle.checked
            };

            spawnBlock(blockData);
            socket.emit('spawnBlock', blockData);
        }
    }
});

clearBtn.onclick = function() {
    socket.emit('clearBlocks');
}

// Key state tracking
document.addEventListener('keydown', function(event) {
    if (document.activeElement === document.getElementById('chatInput')) {
        if (event.code === "Enter") {
            const chatInput = document.getElementById('chatInput');
            const chatInputContainer = document.getElementById('chatInputContainer');
            const chatWrapper = document.getElementById('chatWrapper');
            const message = chatInput.value.trim();
            
            if (message.length > 0) {
                socket.emit('chatMessage', message);
            }
            chatInput.value = '';
            chatInput.blur();
            chatInputContainer.style.opacity = '0';
            // If no messages, hide wrapper after a delay
            if (document.getElementById('chatMessages').children.length === 0) {
                chatWrapper.style.display = 'none';
            }
        }
        return; // Don't process other keys while chatting
    }

    keysPressed[event.code] = true;
    
    // Chat functionality - Toggle with Enter
    if (event.code === "Enter") {
        const chatInput = document.getElementById('chatInput');
        const chatInputContainer = document.getElementById('chatInputContainer');
        const chatWrapper = document.getElementById('chatWrapper');

        chatWrapper.style.display = 'block';
        chatInputContainer.style.opacity = '1';
        chatInput.focus();
        event.preventDefault(); // Prevent enter from being typed in field
        return;
    }

    // Toggle Camera 'C'
    if (event.code === "KeyC") {
        isThirdPerson = !isThirdPerson;
    }

    // Jump - only works when grounded and NOT in drone mode
    if (event.code === "Space" && !isDroneMode) {
        if (!jumpreloading) {
            // Check if grounded before allowing jump
            var ray = new BABYLON.Ray(playerPhysicsBody.position, new BABYLON.Vector3(0, -1, 0), 1.1);
            var hit = scene.pickWithRay(ray, function (mesh) {
                return mesh !== playerPhysicsBody && 
                       !mesh.name.startsWith("player") && 
                       mesh.name !== "skybox" &&
                       mesh.name !== "front";
            });
            
            if (hit && hit.hit) {
                jumpreloading = true;
                playerPhysicsBody.physicsImpostor.applyImpulse(new BABYLON.Vector3(0, 1, 0).scale(10), playerPhysicsBody.getAbsolutePosition());
                setTimeout(function() {
                    jumpreloading = false;
                }, 500); // Reduced cooldown since we check grounded anyway
            }
        }
    }
    
    // Ultimate ability - hold X to charge
    if (event.code === "KeyX") {
        startChargingUltimate();
    }
    
    // Bat swing - F key
    if (event.code === "KeyF") {
        window.swingBat();
    }
    
    // Grenade - hold Q to charge
    if (event.code === "KeyQ") {
        window.startChargingGrenade();
    }
    
    // Drone - hold R to charge (auto-deploys when ready)
    if (event.code === "KeyR") {
        if (!isDroneMode) {
            window.startChargingDrone();
        }
    }
    
    // Exit drone mode with P
    if (event.code === "KeyP") {
        if (isDroneMode) {
            window.exitDrone();
        }
    }
});

document.addEventListener('keyup', function(event) {
    if (document.activeElement === document.getElementById('chatInput')) return;
    
    keysPressed[event.code] = false;
    
    // Cancel ultimate if X is released before fully charged
    if (event.code === "KeyX") {
        cancelUltimate();
    }
    
    // Cancel grenade if Q is released (same as ultimate)
    if (event.code === "KeyQ") {
        cancelGrenade();
    }
    
    // Cancel drone if R is released before fully charged
    if (event.code === "KeyR") {
        window.cancelDrone();
    }
});

menureveal.onclick = function() {
    if (menureveal.innerHTML == "⇧") {
        menureveal.innerHTML = "⇩";
        menureveal.style.top = "0px";
        menuselections.style.top = "-80px";
    } else {
        menureveal.innerHTML = "⇧";
        menureveal.style.top = "70px";
        menuselections.style.top = "0px";
    }
}

engine.runRenderLoop(function () {
    scene.render();
});

window.addEventListener("resize", function () {
    engine.resize();
});
