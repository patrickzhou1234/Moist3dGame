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

// Jump state
let playerCanJump = true;

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
            
            // Add skin selection button
            const skinBtn = document.createElement("button");
            skinBtn.id = "skinBtn";
            skinBtn.className = "mui-btn mui-btn--raised";
            skinBtn.innerHTML = "🎨 Select Skin";
            skinBtn.style.cssText = "width:100%; margin-bottom:10px; background-color:#9c27b0 !important;";
            skinBtn.onclick = () => {
                settingsMenu.style.display = 'none';
                if (currentUser && (currentUser.isVIP || currentUser.isAdmin)) {
                    showSkinSelector();
                } else {
                    Swal.fire({
                        title: '👑 VIP Only',
                        text: 'Skin customization is a VIP-exclusive feature!',
                        icon: 'info',
                        background: '#1a1a2e',
                        color: '#fff',
                        confirmButtonColor: '#ffd700',
                        confirmButtonText: 'Got it!'
                    });
                }
            };
            settingsMenu.insertBefore(skinBtn, leaderboardBtn.nextSibling);
            
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

// Show skin selector popup using SweetAlert2
function showSkinSelector() {
    const skinOptions = AVAILABLE_SKINS.map(skin => {
        const isSelected = selectedSkin === skin.id;
        return `
            <div class="skin-option ${isSelected ? 'selected' : ''}" data-skin-id="${skin.id}" style="
                display: inline-block;
                width: 120px;
                padding: 15px;
                margin: 10px;
                border-radius: 12px;
                background: ${isSelected ? 'linear-gradient(135deg, #4a90d9, #7c3aed)' : 'rgba(255,255,255,0.1)'};
                border: 2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.2)'};
                cursor: pointer;
                transition: all 0.3s;
                text-align: center;
            ">
                <div style="font-size: 40px; margin-bottom: 10px;">${skin.icon}</div>
                <div style="color: white; font-weight: bold;">${skin.name}</div>
                ${isSelected ? '<div style="color: #4caf50; font-size: 12px; margin-top: 5px;">✓ Equipped</div>' : ''}
            </div>
        `;
    }).join('');
    
    Swal.fire({
        title: '🎨 Select Your Skin',
        html: `
            <div style="text-align: center; padding: 10px;">
                <p style="color: #888; margin-bottom: 20px;">Choose a skin for your character</p>
                <div id="skinGrid" style="display: flex; flex-wrap: wrap; justify-content: center;">
                    ${skinOptions}
                </div>
            </div>
        `,
        background: '#1a1a2e',
        color: '#fff',
        showConfirmButton: true,
        confirmButtonText: 'Close',
        confirmButtonColor: '#4a90d9',
        width: '600px',
        didOpen: () => {
            // Add click handlers to skin options
            document.querySelectorAll('.skin-option').forEach(option => {
                option.addEventListener('click', () => {
                    const skinId = option.getAttribute('data-skin-id');
                    selectSkin(skinId);
                    Swal.close();
                    // Reopen to show updated selection
                    setTimeout(() => showSkinSelector(), 100);
                });
                
                // Add hover effect
                option.addEventListener('mouseenter', () => {
                    if (!option.classList.contains('selected')) {
                        option.style.background = 'rgba(255,255,255,0.2)';
                        option.style.transform = 'scale(1.05)';
                    }
                });
                option.addEventListener('mouseleave', () => {
                    if (!option.classList.contains('selected')) {
                        option.style.background = 'rgba(255,255,255,0.1)';
                        option.style.transform = 'scale(1)';
                    }
                });
            });
        }
    });
}

// Select a skin and apply it
function selectSkin(skinId) {
    if (selectedSkin === skinId) return;
    
    selectedSkin = skinId;
    console.log('Selected skin:', skinId);
    
    // Apply skin to local player if game is running
    if (player && scene) {
        changeSkin(player, skinId, scene);
    }
    
    // Notify server about skin change (for other players)
    if (socket && socket.connected) {
        socket.emit('skinChanged', { skin: skinId });
    }
    
    // Save to localStorage for persistence
    localStorage.setItem('selectedSkin', skinId);
    
    Swal.fire({
        icon: 'success',
        title: 'Skin Changed!',
        text: `You are now using the ${AVAILABLE_SKINS.find(s => s.id === skinId)?.name || skinId} skin`,
        timer: 1500,
        showConfirmButton: false,
        background: '#1a1a2e',
        color: '#fff'
    });
}

// Load saved skin from localStorage
function loadSavedSkin() {
    const saved = localStorage.getItem('selectedSkin');
    if (saved && SKIN_MODEL_URLS.hasOwnProperty(saved)) {
        selectedSkin = saved;
    }
}
// loadSavedSkin() is called after SKIN_MODEL_URLS is defined

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

// Select Skin button
const selectSkinBtn = document.getElementById("selectSkinBtn");
if (selectSkinBtn) {
    selectSkinBtn.onclick = function() {
        settingsMenu.style.display = 'none';
        if (currentUser && (currentUser.isVIP || currentUser.isAdmin)) {
            showSkinSelector();
        } else {
            Swal.fire({
                title: '👑 VIP Only',
                text: 'Skin customization is a VIP-exclusive feature!',
                icon: 'info',
                background: '#1a1a2e',
                color: '#fff',
                confirmButtonColor: '#ffd700',
                confirmButtonText: 'Got it!'
            });
        }
    };
}

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
    
    // Map display names
    const mapNames = {
        'default': '🏟️ Default Arena',
        'tokyo': '🏯 Little Tokyo',
        'plaza': '🏖️ Sunny Plaza',
        'forest': '🌲 Enchanted Forest',
        'complex': '🏗️ Complex Arena',
        'urban': '🏙️ Urban District'
    };
    
    roomsList.innerHTML = availableRooms.map(room => {
        const isFull = room.playerCount >= room.maxPlayers;
        const mapId = room.mapId || 'default';
        const mapDisplay = mapNames[mapId] || mapId;
        return `
            <div style="background:rgba(255,255,255,0.05); border:2px solid ${room.id === selectedRoomId ? '#4a90d9' : 'rgba(255,255,255,0.1)'}; border-radius:12px; padding:20px; cursor:pointer; transition:all 0.3s;" onclick="selectRoom('${room.id}')">
                <div style="font-size:20px; color:white; font-weight:600; margin-bottom:10px;">${room.name}</div>
                <div style="display:flex; gap:15px; margin-bottom:10px; color:#888; font-size:14px;">
                    <span>👥 ${room.playerCount}/${room.maxPlayers}</span>
                    <span>${room.type === 'private' ? '🔒' : '🌐'} ${room.type}</span>
                </div>
                <div style="margin-bottom:15px; padding:6px 10px; background:rgba(74,144,217,0.2); border-radius:6px; display:inline-block; font-size:13px; color:#88bbff;">
                    🗺️ ${mapDisplay}
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
    socket.emit('registerPlayer', { roomId: selectedRoomId, skin: selectedSkin });
    
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
        socket.emit('registerPlayer', { roomId: selectedRoomId, skin: selectedSkin });
        
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

// Killstreak tracking
let killstreak = 0;

// Function to update killstreak display
function updateKillstreakDisplay() {
    const killstreakDisplay = document.getElementById('killstreakDisplay');
    const killstreakCount = document.getElementById('killstreakCount');
    
    if (killstreakDisplay && killstreakCount) {
        if (killstreak > 0) {
            killstreakCount.textContent = killstreak;
            killstreakDisplay.style.display = 'block';
            
            // Add animation effect for new killstreak milestones
            killstreakDisplay.style.animation = 'none';
            setTimeout(() => {
                killstreakDisplay.style.animation = 'killstreakPulse 0.3s ease-out';
            }, 10);
        } else {
            killstreakDisplay.style.display = 'none';
        }
    }
}

// Spawn immunity state
let hasSpawnImmunity = false;
let spawnImmunityTimer = null;
const SPAWN_IMMUNITY_DURATION = 5000; // 5 seconds of immunity
let shieldBubbleMesh = null; // Shield bubble 3D model mesh

// Function to create and show shield bubble around player
function showShieldBubble() {
    if (shieldBubbleMesh) {
        shieldBubbleMesh.setEnabled(true);
        return;
    }
    
    // Load shield bubble 3D model
    loadCachedMesh('shieldBubble', scene, function(meshes) {
        if (meshes.length > 0 && playerPhysicsBody && !playerPhysicsBody.isDisposed()) {
            const shieldModel = new BABYLON.TransformNode("shieldBubbleModel", scene);
            
            meshes.forEach(mesh => {
                mesh.parent = shieldModel;
                mesh.isPickable = false;
                // Make sure the mesh doesn't affect physics
                if (mesh.physicsImpostor) {
                    mesh.physicsImpostor.dispose();
                }
            });
            
            shieldModel.parent = playerPhysicsBody;
            shieldModel.position = new BABYLON.Vector3(0, 0, 0);
            shieldModel.scaling = new BABYLON.Vector3(0.05, 0.05, 0.05); // Adjust scale as needed
            shieldBubbleMesh = shieldModel;
        }
    }, function(scene, message, exception) {
        console.error("Failed to load shield bubble model:", message, exception);
        // Fallback: create a simple transparent sphere
        const fallbackShield = BABYLON.MeshBuilder.CreateSphere("shieldBubbleFallback", {diameter: 2.5, segments: 16}, scene);
        const shieldMat = new BABYLON.StandardMaterial("shieldMat", scene);
        shieldMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
        shieldMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.5);
        shieldMat.alpha = 0.3;
        shieldMat.backFaceCulling = false;
        fallbackShield.material = shieldMat;
        fallbackShield.parent = playerPhysicsBody;
        fallbackShield.position = new BABYLON.Vector3(0, 0, 0);
        fallbackShield.isPickable = false;
        shieldBubbleMesh = fallbackShield;
    });
}

// Function to hide shield bubble
function hideShieldBubble() {
    if (shieldBubbleMesh) {
        shieldBubbleMesh.setEnabled(false);
    }
}

// Function to show shield bubble on another player
function showOtherPlayerShieldBubble(playerId) {
    const playerData = otherPlayers[playerId];
    if (!playerData || !playerData.collider) return;
    
    // Clear any existing shield timer
    if (playerData.shieldBubbleTimer) {
        clearTimeout(playerData.shieldBubbleTimer);
        playerData.shieldBubbleTimer = null;
    }
    
    // Dispose existing shield if any
    if (playerData.shieldBubbleMesh) {
        playerData.shieldBubbleMesh.dispose();
        playerData.shieldBubbleMesh = null;
    }
    
    // Load shield bubble 3D model
    loadCachedMesh('shieldBubble', scene, function(meshes) {
        if (meshes.length > 0 && playerData.collider && !playerData.collider.isDisposed()) {
            const shieldModel = new BABYLON.TransformNode("otherShieldBubbleModel_" + playerId, scene);
            
            meshes.forEach(mesh => {
                mesh.parent = shieldModel;
                mesh.isPickable = false;
                // Make sure the mesh doesn't affect physics
                if (mesh.physicsImpostor) {
                    mesh.physicsImpostor.dispose();
                }
            });
            
            shieldModel.parent = playerData.collider;
            shieldModel.position = new BABYLON.Vector3(0, 0, 0);
            shieldModel.scaling = new BABYLON.Vector3(0.05, 0.05, 0.05);
            playerData.shieldBubbleMesh = shieldModel;
        }
    }, function(scene, message, exception) {
        console.error("Failed to load other player shield bubble model:", message, exception);
        // Fallback: create a simple transparent sphere
        if (playerData.collider && !playerData.collider.isDisposed()) {
            const fallbackShield = BABYLON.MeshBuilder.CreateSphere("otherShieldBubbleFallback_" + playerId, {diameter: 2.5, segments: 16}, scene);
            const shieldMat = new BABYLON.StandardMaterial("otherShieldMat_" + playerId, scene);
            shieldMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
            shieldMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.5);
            shieldMat.alpha = 0.3;
            shieldMat.backFaceCulling = false;
            fallbackShield.material = shieldMat;
            fallbackShield.parent = playerData.collider;
            fallbackShield.position = new BABYLON.Vector3(0, 0, 0);
            fallbackShield.isPickable = false;
            playerData.shieldBubbleMesh = fallbackShield;
        }
    });
    
    // Set timer to remove shield after immunity duration
    playerData.shieldBubbleTimer = setTimeout(() => {
        if (playerData.shieldBubbleMesh) {
            playerData.shieldBubbleMesh.dispose();
            playerData.shieldBubbleMesh = null;
        }
        playerData.shieldBubbleTimer = null;
    }, SPAWN_IMMUNITY_DURATION);
}

// Function to hide shield bubble on another player
function hideOtherPlayerShieldBubble(playerId) {
    const playerData = otherPlayers[playerId];
    if (!playerData) return;
    
    if (playerData.shieldBubbleTimer) {
        clearTimeout(playerData.shieldBubbleTimer);
        playerData.shieldBubbleTimer = null;
    }
    
    if (playerData.shieldBubbleMesh) {
        playerData.shieldBubbleMesh.dispose();
        playerData.shieldBubbleMesh = null;
    }
}

// Function to break spawn immunity (called when player attacks)
function breakSpawnImmunity() {
    if (hasSpawnImmunity) {
        hasSpawnImmunity = false;
        if (spawnImmunityTimer) {
            clearTimeout(spawnImmunityTimer);
            spawnImmunityTimer = null;
        }
        // Hide the immunity indicator
        const immunityIndicator = document.getElementById('spawnImmunityIndicator');
        if (immunityIndicator) {
            immunityIndicator.style.display = 'none';
        }
        // Hide the shield bubble
        hideShieldBubble();
        console.log('Spawn immunity broken - player attacked!');
    }
}

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
let batHitsThisSwing = new Set(); // Track what's been hit during current swing
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
const ULTIMATE_MODEL_URL = "https://files.catbox.moe/84ufxa.glb";
const BALL_MODEL_URL = "https://files.catbox.moe/5esvct.glb";
const KATANA_MODEL_URL = "https://files.catbox.moe/nlqntj.glb";
const DRONE_BOMB_MODEL_URL = "https://files.catbox.moe/qeyyrr.glb";
const GRENADE_MODEL_URL = "https://files.catbox.moe/nmw7yv.glb";
const MINE_MODEL_URL = "https://files.catbox.moe/qmnt2u.glb";
const SHIELD_BUBBLE_MODEL_URL = "https://files.catbox.moe/i5d8fc.glb"; // TODO: Replace with actual shield bubble model
const KNOCKBACK_EXPLOSION_MODEL_URL = "https://dl.dropboxusercontent.com/scl/fi/3bfqc1g8l59zd83axg3kk/flame__test.glb?rlkey=1i9jbvz516f1poghtj0w4h08t&st=s7qz0834&dl=1";

// ============ MAP SYSTEM ============
// Map configurations - .babylon files for custom arenas
// Each map has: url (babylon file), scaling, position offset, rotation
const MAP_CONFIGS = {
    'default': { 
        url: null, // Uses default ground and walls
        name: 'Default Arena',
        icon: '🏟️',
        scaling: [1, 1, 1],
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        spawnY: 3, // Player spawn height
        groundY: 0 // Minimum Y level for ground (used for other player interpolation)
    },
    'tokyo': { 
        url: 'https://files.catbox.moe/v6664x.babylon', // Local .babylon file
        name: 'Little Tokyo',
        icon: '🏯',
        scaling: [0.05, 0.05, 0.05],
        offset: [0, -5, 0],
        rotation: [-Math.PI/2, 0, 0],
        spawnY: 20,
        groundY: -100 // No ground clamping for 3D model maps (let actual server Y prevail)
    },
    'plaza': {
        url: 'https://files.catbox.moe/3sjbxo.babylon',
        name: 'Sunny Plaza',
        icon: '🏖️',
        scaling: [0.005, 0.005, 0.005],
        offset: [50, 0, 0],
        rotation: [-Math.PI/2, -Math.PI/2, 0],
        spawnY: 5,
        groundY: -5
    },
    'forest': {
        url: 'https://files.catbox.moe/ddmfcx.babylon',
        name: 'Forest',
        icon: '🌲',
        scaling: [0.01, 0.01, 0.01],
        offset: [-60, -10, 50],
        rotation: [-Math.PI/2, 0, 0],
        spawnY: 40,
        groundY: 0
    },
    'complex': {
        url: null, // Uses primitive-based map
        name: 'Complex Arena',
        icon: '🏗️',
        scaling: [1, 1, 1],
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        spawnY: 8, // Spawn on top of central tower
        groundY: 0,
        isPrimitive: true // Flag to indicate this uses primitives
    },
    'urban': {
        url: null, // Uses primitive-based map
        name: 'Urban District',
        icon: '🏙️',
        scaling: [1, 1, 1],
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        spawnY: 3,
        groundY: 0,
        isPrimitive: true
    }
};

// Available maps for selection in UI
const AVAILABLE_MAPS = Object.entries(MAP_CONFIGS).map(([id, config]) => ({
    id: id,
    name: config.name,
    icon: config.icon
}));

// Currently loaded map
let currentMapId = 'default';
let loadedMapMeshes = []; // Store loaded map meshes for cleanup

// Player Skin Models with custom transforms
// rotation: [x, y, z] in radians, scaling: [x, y, z]
// Use -1 as placeholder values to be configured later
const SKIN_CONFIGS = {
    'default': { 
        url: null, 
        rotation: [0, 0, 0], 
        scaling: [1, 1, 1],
        offset: [0, 0, 0]
    },
    'patrick': { 
        url: 'https://files.catbox.moe/vj5k7v.glb', 
        rotation: [0, 0, 0], 
        scaling: [0.01, 0.01, 0.01],
        offset: [0, 0, 0]
    },
    'beavis': { 
        url: 'https://files.catbox.moe/4yym71.glb', 
        rotation: [-Math.PI/2, 0, 0], 
        scaling: [1, 1, 1],
        offset: [0, 0, 0]
    },
    'homer': { 
        url: 'https://files.catbox.moe/w0zl03.glb', 
        rotation: [Math.PI/2, 0, Math.PI], 
        scaling: [1, 1, 1],
        offset: [0, 0, 0]
    },
    'patrick simpson': { 
        url: 'https://files.catbox.moe/015t9e.glb', 
        rotation: [0, -Math.PI/2, 0],
        scaling: [0.1, 0.1, 0.1],
        offset: [0, 0, 0]
    },
    'peter griffin': {
        url: 'https://files.catbox.moe/fszlyv.glb', // Placeholder URL
        rotation: [0, 0, 0],
        scaling: [1, 1, 1],
        offset: [0, 0, 0]
    }
};

// Legacy compatibility - extract just URLs
const SKIN_MODEL_URLS = Object.fromEntries(
    Object.entries(SKIN_CONFIGS).map(([id, config]) => [id, config.url])
);
    
// Available skins for selection
const AVAILABLE_SKINS = [
    { id: 'default', name: 'Default', icon: '👤' },
    { id: 'patrick', name: 'Patrick', icon: '👨‍🦱' },
    { id: 'beavis', name: 'Beavis', icon: '👨‍🦳' },
    { id: 'homer', name: 'Homer', icon: '👴' },
    { id: 'patrick simpson', name: 'Patrick Simpson', icon: '🍩' },
    { id: 'peter griffin', name: 'Peter Griffin', icon: '🍔' }
];

// Currently selected skin
let selectedSkin = 'default';
let mySkinModel = null; // Reference to loaded skin 3D model for local player

// Load saved skin preference from localStorage
loadSavedSkin();

// ============ ASSET CACHE SYSTEM (IndexedDB) ============
// Caches 3D models locally so they don't need to be re-downloaded each visit

const ASSET_CACHE_VERSION = 1; // Increment this to force re-download all assets
const ASSET_DB_NAME = 'Moist3DGameAssets';
const ASSET_STORE_NAME = 'models';

// All models to cache
const MODELS_TO_CACHE = [
    { name: 'drone', url: DRONE_MODEL_URL },
    { name: 'ultimate', url: ULTIMATE_MODEL_URL },
    { name: 'ball', url: BALL_MODEL_URL },
    { name: 'katana', url: KATANA_MODEL_URL },
    { name: 'droneBomb', url: DRONE_BOMB_MODEL_URL },
    { name: 'grenade', url: GRENADE_MODEL_URL },
    { name: 'mine', url: MINE_MODEL_URL },
    { name: 'shieldBubble', url: SHIELD_BUBBLE_MODEL_URL },
    { name: 'knockbackExplosion', url: KNOCKBACK_EXPLOSION_MODEL_URL },
    // Skin models (only add non-null skin URLs)
    ...Object.entries(SKIN_MODEL_URLS)
        .filter(([id, url]) => url !== null)
        .map(([id, url]) => ({ name: 'skin_' + id, url: url })),
    // Map models (only add non-null map URLs that are remote)
    ...Object.entries(MAP_CONFIGS)
        .filter(([id, config]) => config.url !== null && config.url.startsWith('http'))
        .map(([id, config]) => ({ name: 'map_' + id, url: config.url }))
];

// Cached blob URLs for instant loading
const cachedModelUrls = {};

// Open IndexedDB connection
function openAssetDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(ASSET_DB_NAME, ASSET_CACHE_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Clear old stores on version upgrade
            if (db.objectStoreNames.contains(ASSET_STORE_NAME)) {
                db.deleteObjectStore(ASSET_STORE_NAME);
            }
            db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'name' });
            console.log('[AssetCache] Database upgraded to version', ASSET_CACHE_VERSION);
        };
    });
}

// Get cached asset from IndexedDB
async function getCachedAsset(db, name) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ASSET_STORE_NAME], 'readonly');
        const store = transaction.objectStore(ASSET_STORE_NAME);
        const request = store.get(name);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// Save asset to IndexedDB
async function cacheAsset(db, name, url, blob) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([ASSET_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(ASSET_STORE_NAME);
        const request = store.put({ name, url, blob, cachedAt: Date.now() });
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

// Download and cache a single model
async function downloadAndCacheModel(db, model, onProgress) {
    try {
        const response = await fetch(model.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const blob = await response.blob();
        await cacheAsset(db, model.name, model.url, blob);
        
        // Create blob URL - Babylon.js will auto-detect GLB from content
        cachedModelUrls[model.name] = URL.createObjectURL(blob);
        
        console.log(`[AssetCache] Downloaded and cached: ${model.name}`);
        
        if (onProgress) onProgress(model.name, true);
        return true;
    } catch (error) {
        console.error(`[AssetCache] Failed to cache ${model.name}:`, error);
        // Fall back to original URL
        cachedModelUrls[model.name] = model.url;
        if (onProgress) onProgress(model.name, false);
        return false;
    }
}

// Initialize asset cache - call this before game starts
async function initAssetCache(onProgress) {
    try {
        const db = await openAssetDB();
        let loadedFromCache = 0;
        let downloadedNew = 0;
        
        for (let i = 0; i < MODELS_TO_CACHE.length; i++) {
            const model = MODELS_TO_CACHE[i];
            
            // Check if already cached
            const cached = await getCachedAsset(db, model.name);
            
            if (cached && cached.blob && cached.url === model.url) {
                // Load from cache - create blob URL
                cachedModelUrls[model.name] = URL.createObjectURL(cached.blob);
                
                console.log(`[AssetCache] Loaded from cache: ${model.name}`);
                loadedFromCache++;
                if (onProgress) onProgress(model.name, true, i + 1, MODELS_TO_CACHE.length);
            } else {
                // Download and cache
                await downloadAndCacheModel(db, model, (name, success) => {
                    if (success) downloadedNew++;
                    if (onProgress) onProgress(name, success, i + 1, MODELS_TO_CACHE.length);
                });
            }
        }
        
        db.close();
        console.log(`[AssetCache] Ready! ${loadedFromCache} from cache, ${downloadedNew} downloaded`);
        return true;
    } catch (error) {
        console.error('[AssetCache] Failed to initialize:', error);
        // Fall back to original URLs
        MODELS_TO_CACHE.forEach(m => cachedModelUrls[m.name] = m.url);
        return false;
    }
}

// Get the cached URL for a model (use this instead of the original URL)
function getCachedModelUrl(modelName) {
    const cachedUrl = cachedModelUrls[modelName];
    if (cachedUrl) {
        return cachedUrl; // Blob URL or original URL as fallback
    }
    // Fallback to original URL
    const model = MODELS_TO_CACHE.find(m => m.name === modelName);
    return model ? model.url : null;
}

// Check if a URL is a cached blob URL
function isCachedBlobUrl(url) {
    return url && url.startsWith('blob:');
}

// Load a cached 3D model - handles blob URLs properly with plugin extension
function loadCachedMesh(modelName, scene, onSuccess, onError) {
    const url = getCachedModelUrl(modelName);
    if (!url) {
        if (onError) onError(null, 'Model not found: ' + modelName, null);
        return;
    }
    
    // For blob URLs, we need to specify the plugin extension
    if (isCachedBlobUrl(url)) {
        BABYLON.SceneLoader.ImportMesh("", url, "", scene, onSuccess, null, onError, ".glb");
    } else {
        BABYLON.SceneLoader.ImportMesh("", url, "", scene, onSuccess, null, onError);
    }
}

// Helper to load a cached model into the scene (legacy)
function loadCachedModel(modelName, scene, onSuccess, onError) {
    loadCachedMesh(modelName, scene, onSuccess, onError);
}

// ============ HELPER FUNCTIONS ============

// ============ MAP LOADING SYSTEM ============
// Load a map by ID - handles cleanup of old map and loading new one
function loadMap(mapId, targetScene) {
    const mapConfig = MAP_CONFIGS[mapId];
    if (!mapConfig) {
        console.error('Map not found:', mapId);
        return;
    }
    
    console.log('Loading map:', mapId, mapConfig.name);
    
    // Cleanup previously loaded map meshes
    loadedMapMeshes.forEach(mesh => {
        if (mesh && !mesh.isDisposed()) {
            if (mesh.physicsImpostor) {
                mesh.physicsImpostor.dispose();
            }
            mesh.dispose();
        }
    });
    loadedMapMeshes = [];
    
    // Always destroy complex map elements when switching maps
    if (window.destroyComplexMap) {
        window.destroyComplexMap();
    }
    // Always destroy urban map elements when switching maps
    if (window.destroyUrbanMap) {
        window.destroyUrbanMap();
    }
    
    // Handle default arena (plain ground + walls)
    if (mapId === 'default') {
        // Show default ground and walls
        if (window.arenaGround) {
            window.arenaGround.setEnabled(true);
            if (!window.arenaGround.physicsImpostor || window.arenaGround.physicsImpostor.isDisposed) {
                window.arenaGround.physicsImpostor = new BABYLON.PhysicsImpostor(
                    window.arenaGround, BABYLON.PhysicsImpostor.MeshImpostor, 
                    {mass: 0, restitution: 0.3}, targetScene
                );
            }
        }
        if (window.arenaWalls) {
            window.arenaWalls.forEach(wall => {
                if (!isHardcoreMode) {
                    wall.setEnabled(true);
                    if (!wall.physicsImpostor || wall.physicsImpostor.isDisposed) {
                        wall.physicsImpostor = new BABYLON.PhysicsImpostor(
                            wall, BABYLON.PhysicsImpostor.BoxImpostor, 
                            {mass: 0, restitution: 0.9}, targetScene
                        );
                    }
                }
            });
        }
        currentMapId = 'default';
        return;
    }
    
    // Handle complex primitive map
    if (mapId === 'complex' && mapConfig.isPrimitive) {
        // Show default ground and walls (complex map uses the same base)
        if (window.arenaGround) {
            window.arenaGround.setEnabled(true);
            if (!window.arenaGround.physicsImpostor || window.arenaGround.physicsImpostor.isDisposed) {
                window.arenaGround.physicsImpostor = new BABYLON.PhysicsImpostor(
                    window.arenaGround, BABYLON.PhysicsImpostor.MeshImpostor, 
                    {mass: 0, restitution: 0.3}, targetScene
                );
            }
        }
        if (window.arenaWalls) {
            window.arenaWalls.forEach(wall => {
                if (!isHardcoreMode) {
                    wall.setEnabled(true);
                    if (!wall.physicsImpostor || wall.physicsImpostor.isDisposed) {
                        wall.physicsImpostor = new BABYLON.PhysicsImpostor(
                            wall, BABYLON.PhysicsImpostor.BoxImpostor, 
                            {mass: 0, restitution: 0.9}, targetScene
                        );
                    }
                }
            });
        }
        // Create the complex map elements
        if (window.createComplexMap) {
            window.createComplexMap(targetScene);
        }
        currentMapId = 'complex';
        console.log('Complex arena loaded with primitives');
        return;
    }
    
    // Handle urban primitive map
    if (mapId === 'urban' && mapConfig.isPrimitive) {
        // Show default ground and walls (urban map uses the same base)
        if (window.arenaGround) {
            window.arenaGround.setEnabled(true);
            if (!window.arenaGround.physicsImpostor || window.arenaGround.physicsImpostor.isDisposed) {
                window.arenaGround.physicsImpostor = new BABYLON.PhysicsImpostor(
                    window.arenaGround, BABYLON.PhysicsImpostor.MeshImpostor, 
                    {mass: 0, restitution: 0.3}, targetScene
                );
            }
        }
        if (window.arenaWalls) {
            window.arenaWalls.forEach(wall => {
                if (!isHardcoreMode) {
                    wall.setEnabled(true);
                    if (!wall.physicsImpostor || wall.physicsImpostor.isDisposed) {
                        wall.physicsImpostor = new BABYLON.PhysicsImpostor(
                            wall, BABYLON.PhysicsImpostor.BoxImpostor, 
                            {mass: 0, restitution: 0.9}, targetScene
                        );
                    }
                }
            });
        }
        // Create the urban map elements
        if (window.createUrbanMap) {
            window.createUrbanMap(targetScene);
        }
        currentMapId = 'urban';
        console.log('Urban district loaded with primitives');
        return;
    }
    
    // For external URL maps, hide default ground and walls
    if (window.arenaGround) {
        window.arenaGround.setEnabled(false);
        if (window.arenaGround.physicsImpostor) {
            window.arenaGround.physicsImpostor.dispose();
        }
    }
    if (window.arenaWalls) {
        window.arenaWalls.forEach(wall => {
            wall.setEnabled(false);
            if (wall.physicsImpostor) {
                wall.physicsImpostor.dispose();
            }
        });
    }
    
    // Apply transforms and physics to meshes
    const applyMapTransforms = (meshes) => {
        console.log('Applying transforms to map:', mapId, 'meshes:', meshes.length);
        
        meshes.forEach(mesh => {
            // Skip non-mesh nodes (like TransformNodes)
            if (!mesh.getBoundingInfo) {
                console.log('Skipping non-mesh:', mesh.name);
                return;
            }
            
            // Mark as map mesh for filtering in raycasts
            mesh.isMapMesh = true;
            
            // Disable picking to avoid raycast errors with complex geometry
            mesh.isPickable = false;
            
            // Apply transforms from config
            mesh.scaling = new BABYLON.Vector3(
                mapConfig.scaling[0], 
                mapConfig.scaling[1], 
                mapConfig.scaling[2]
            );
            mesh.position.addInPlace(new BABYLON.Vector3(
                mapConfig.offset[0],
                mapConfig.offset[1],
                mapConfig.offset[2]
            ));
            mesh.rotation = new BABYLON.Vector3(
                mapConfig.rotation[0],
                mapConfig.rotation[1],
                mapConfig.rotation[2]
            );
            
            // Only add physics to meshes with actual geometry
            try {
                if (mesh.getTotalVertices && mesh.getTotalVertices() > 0) {
                    mesh.physicsImpostor = new BABYLON.PhysicsImpostor(
                        mesh, BABYLON.PhysicsImpostor.MeshImpostor, 
                        {mass: 0, restitution: 0.3}, targetScene
                    );
                }
            } catch (e) {
                console.warn('Failed to add physics to mesh:', mesh.name, e);
            }
            
            // Store for cleanup
            loadedMapMeshes.push(mesh);
        });
        
        currentMapId = mapId;
        console.log('Map ready:', mapConfig.name);
    };
    
    // Check if map is preloaded (instant loading)
    if (window.preloadedMapContainers && window.preloadedMapContainers[mapId]) {
        console.log('Using preloaded map container:', mapId);
        const container = window.preloadedMapContainers[mapId];
        const instantiatedMeshes = container.instantiateModelsToScene().rootNodes
            .flatMap(root => [root, ...root.getChildMeshes()]);
        applyMapTransforms(instantiatedMeshes);
        return;
    }
    
    // Load custom map from URL
    const loadMapModel = (url) => {
        console.log('Loading map from URL:', url);
        
        // For .babylon files, we need to split the URL into rootUrl and filename
        const lastSlash = url.lastIndexOf('/');
        const rootUrl = url.substring(0, lastSlash + 1);
        const sceneFile = url.substring(lastSlash + 1);
        const pluginExt = url.endsWith('.babylon') ? ".babylon" : ".glb";
        
        console.log('Map loading - rootUrl:', rootUrl, 'sceneFile:', sceneFile, 'pluginExt:', pluginExt);
        
        BABYLON.SceneLoader.ImportMesh("", rootUrl, sceneFile, targetScene, function(meshes) {
            console.log('Map meshes loaded:', meshes.length);
            applyMapTransforms(meshes);
        }, function(event) {
            // Progress callback
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                console.log('Map loading progress:', percent + '%');
            }
        }, function(scene, message, exception) {
            console.error('Failed to load map:', mapId, message, exception);
            // Fallback to default arena
            loadMap('default', targetScene);
        }, pluginExt);
    };
    
    // Check if map is cached (for remote URLs)
    const cachedUrl = getCachedModelUrl('map_' + mapId);
    if (cachedUrl && isCachedBlobUrl(cachedUrl)) {
        // For blob URLs, use them directly
        console.log('Loading map from cached blob:', cachedUrl);
        const pluginExt = mapConfig.url.endsWith('.babylon') ? ".babylon" : ".glb";
        BABYLON.SceneLoader.ImportMesh("", cachedUrl, "", targetScene, function(meshes) {
            applyMapTransforms(meshes);
        }, null, function(scene, message, exception) {
            console.error('Failed to load cached map:', mapId, message, exception);
            loadMap('default', targetScene);
        }, pluginExt);
    } else {
        // Load directly from URL
        loadMapModel(mapConfig.url);
    }
}

// Preload a map for instant switching (call before game starts)
async function preloadMap(mapId, targetScene) {
    return new Promise((resolve, reject) => {
        const mapConfig = MAP_CONFIGS[mapId];
        if (!mapConfig || !mapConfig.url) {
            resolve(null);
            return;
        }
        
        // For local .babylon files, we can preload them
        const cachedUrl = getCachedModelUrl('map_' + mapId);
        const url = cachedUrl || mapConfig.url;
        const pluginExt = url.endsWith('.babylon') ? ".babylon" : ".glb";
        
        BABYLON.SceneLoader.ImportMesh("", "", url, targetScene, function(meshes) {
            // Hide preloaded meshes immediately
            meshes.forEach(mesh => {
                mesh.setEnabled(false);
                mesh.isPickable = false;
            });
            console.log('Preloaded map:', mapId);
            resolve(meshes);
        }, null, function(scene, message, exception) {
            console.warn('Failed to preload map:', mapId, message);
            resolve(null);
        }, pluginExt);
    });
}

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

// Spawn knockback explosion effect at a position (no physics)
function spawnKnockbackExplosion(position) {
    loadCachedMesh('knockbackExplosion', scene, function(meshes) {
        if (meshes.length > 0) {
            const explosionRoot = new BABYLON.TransformNode("knockbackExplosionRoot", scene);
            explosionRoot.position = position.clone();
            
            meshes.forEach(mesh => {
                mesh.setEnabled(false);
                mesh.parent = explosionRoot;
                mesh.isPickable = false;
                // No physics impostor - purely visual
                mesh.setEnabled(true);
            });
            
            explosionRoot.scaling = new BABYLON.Vector3(1, 1, 1); // Adjust scale as needed
            
            // Remove the explosion effect after a short time
            setTimeout(() => {
                if (explosionRoot && !explosionRoot.isDisposed()) {
                    explosionRoot.dispose();
                }
            }, 2000); // 0.5 seconds display time
        }
    }, function(scene, message, exception) {
        console.error("Failed to load knockback explosion model:", message, exception);
    });
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
    
    // Load the mine 3D model (from IndexedDB cache)
    loadCachedMesh('mine', scene, function(meshes) {
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
    if (playerData.mesh) {
        // Dispose skin model if present
        if (playerData.mesh.skinModel) {
            playerData.mesh.skinModel.getChildMeshes().forEach(mesh => mesh.dispose());
            playerData.mesh.skinModel.dispose();
        }
        playerData.mesh.dispose();
    }
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
    if (playerData.shieldBubbleMesh) playerData.shieldBubbleMesh.dispose();
    if (playerData.shieldBubbleTimer) clearTimeout(playerData.shieldBubbleTimer);
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
// Respects skins - if a skin is active, default mesh parts stay hidden
function setPlayerMeshVisibility(characterRoot, visible) {
    if (!characterRoot) return;
    
    // Check if this character has a skin model active
    const hasSkin = characterRoot.skinModel && !characterRoot.skinModel.isDisposed();
    
    if (hasSkin) {
        // Only toggle visibility on the skin model, keep default parts hidden
        const skinMeshes = characterRoot.skinModel.getChildMeshes();
        skinMeshes.forEach(mesh => {
            mesh.isVisible = visible;
        });
        
        // Ensure default mesh parts stay hidden
        if (characterRoot.defaultMeshParts) {
            characterRoot.defaultMeshParts.forEach(part => {
                part.isVisible = false;
            });
        }
    } else {
        // No skin, toggle all child meshes (default behavior)
        const children = characterRoot.getChildMeshes();
        children.forEach(child => {
            child.isVisible = visible;
        });
    }
}

// Active key state tracking
const keysPressed = {};

// Create a humanoid character mesh
function createCharacterMesh(scene, name, color, username, skinId) {
    const characterRoot = new BABYLON.TransformNode(name, scene);
    
    // Store the skin ID on the character for reference
    characterRoot.skinId = skinId || 'default';
    
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
    
    // Array to store all default mesh parts (for visibility toggle when using skins)
    const defaultMeshParts = [];
    
    // Helper function to setup mesh and prevent culling issues
    function setupMesh(mesh) {
        mesh.material = mat;
        mesh.parent = characterRoot;
        mesh.alwaysSelectAsActiveMesh = true; // Prevent frustum culling
        defaultMeshParts.push(mesh);
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
    defaultMeshParts.push(leftEye);
    
    const rightEye = BABYLON.MeshBuilder.CreateSphere(name + "RightEye", {diameter: 0.1}, scene);
    rightEye.position.set(0.1, 1.1, 0.2);
    rightEye.material = eyeMat;
    rightEye.parent = characterRoot;
    rightEye.alwaysSelectAsActiveMesh = true;
    defaultMeshParts.push(rightEye);
    
    // Pupils
    const pupilMat = new BABYLON.StandardMaterial(name + "PupilMat", scene);
    pupilMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    
    const leftPupil = BABYLON.MeshBuilder.CreateSphere(name + "LeftPupil", {diameter: 0.05}, scene);
    leftPupil.position.set(-0.1, 1.1, 0.24);
    leftPupil.material = pupilMat;
    leftPupil.parent = characterRoot;
    leftPupil.alwaysSelectAsActiveMesh = true;
    defaultMeshParts.push(leftPupil);
    
    const rightPupil = BABYLON.MeshBuilder.CreateSphere(name + "RightPupil", {diameter: 0.05}, scene);
    rightPupil.position.set(0.1, 1.1, 0.24);
    rightPupil.material = pupilMat;
    rightPupil.parent = characterRoot;
    rightPupil.alwaysSelectAsActiveMesh = true;
    defaultMeshParts.push(rightPupil);
    
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
    
    // Store default mesh parts for visibility control
    characterRoot.defaultMeshParts = defaultMeshParts;
    
    // Load and apply 3D skin model if not default
    if (skinId && skinId !== 'default' && SKIN_MODEL_URLS[skinId]) {
        loadSkinModel(characterRoot, skinId, scene);
    }
    
    return characterRoot;
}

// Load a 3D skin model and attach it to a character
function loadSkinModel(characterRoot, skinId, scene) {
    const skinCacheName = 'skin_' + skinId;
    const skinConfig = SKIN_CONFIGS[skinId] || SKIN_CONFIGS['default'];
    
    loadCachedMesh(skinCacheName, scene, function(meshes) {
        if (meshes.length > 0 && characterRoot && !characterRoot.isDisposed()) {
            // Create a container for the skin model
            const skinModel = new BABYLON.TransformNode("skinModel_" + characterRoot.name, scene);
            skinModel.parent = characterRoot;
            
            // Apply custom offset (use 0 if placeholder -1)
            const offset = skinConfig.offset;
            skinModel.position = new BABYLON.Vector3(
                offset[0] === -1 ? 0 : offset[0],
                offset[1] === -1 ? 0 : offset[1],
                offset[2] === -1 ? 0 : offset[2]
            );
            
            // Apply custom scaling (use 1 if placeholder -1)
            const scale = skinConfig.scaling;
            skinModel.scaling = new BABYLON.Vector3(
                scale[0] === -1 ? 1 : scale[0],
                scale[1] === -1 ? 1 : scale[1],
                scale[2] === -1 ? 1 : scale[2]
            );
            
            // Apply custom rotation (use 0 if placeholder -1)
            const rot = skinConfig.rotation;
            skinModel.rotation = new BABYLON.Vector3(
                rot[0] === -1 ? 0 : rot[0],
                rot[1] === -1 ? 0 : rot[1],
                rot[2] === -1 ? 0 : rot[2]
            );
            
            // Attach all loaded meshes to the skin container
            meshes.forEach(mesh => {
                mesh.parent = skinModel;
                mesh.isPickable = false;
                mesh.alwaysSelectAsActiveMesh = true;
            });
            
            // Hide the default mesh parts (for both local player and other players)
            if (characterRoot.defaultMeshParts) {
                characterRoot.defaultMeshParts.forEach(part => {
                    part.isVisible = false;
                });
            }
            
            // Store reference to the skin model
            characterRoot.skinModel = skinModel;
            
            console.log('Loaded skin model:', skinId, 'for', characterRoot.name, 'with config:', skinConfig);
        }
    }, null, function(scene, message, exception) {
        console.error("Failed to load skin model:", skinId, message, exception);
        // Keep using default mesh on failure
    });
}

// Change skin for a character (used when player changes their skin)
function changeSkin(characterRoot, newSkinId, scene) {
    if (!characterRoot) return;
    
    // Remove existing skin model if any
    if (characterRoot.skinModel) {
        // Dispose child meshes first
        characterRoot.skinModel.getChildMeshes().forEach(mesh => mesh.dispose());
        characterRoot.skinModel.dispose();
        characterRoot.skinModel = null;
    }
    
    // Update stored skin ID
    characterRoot.skinId = newSkinId;
    
    if (newSkinId === 'default' || !SKIN_MODEL_URLS[newSkinId]) {
        // Show default mesh parts
        if (characterRoot.defaultMeshParts) {
            characterRoot.defaultMeshParts.forEach(part => {
                part.isVisible = true;
            });
        }
    } else {
        // Load new skin model
        loadSkinModel(characterRoot, newSkinId, scene);
    }
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
    
    // Store ground globally for map system control
    window.arenaGround = ground;
    
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

    // ========== COMPLEX MAP WITH PRIMITIVES ==========
    // Store all map elements for potential toggling
    window.complexMapElements = [];
    
    // Create complex map function - called when complex map is selected
    window.createComplexMap = function(targetScene) {
        // Clean up existing complex map elements
        if (window.complexMapElements) {
            window.complexMapElements.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    if (mesh.physicsImpostor) mesh.physicsImpostor.dispose();
                    mesh.dispose();
                }
            });
        }
        window.complexMapElements = [];
        
        // Materials for map elements
        var stoneMat = new BABYLON.StandardMaterial("stoneMat", targetScene);
        stoneMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.55);
        stoneMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        
        var metalMat = new BABYLON.StandardMaterial("metalMat", targetScene);
        metalMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.75);
        metalMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        metalMat.specularPower = 64;
        
        var redMat = new BABYLON.StandardMaterial("redMat", targetScene);
        redMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2);
        redMat.emissiveColor = new BABYLON.Color3(0.2, 0.05, 0.05);
        
        var blueMat = new BABYLON.StandardMaterial("blueMat", targetScene);
        blueMat.diffuseColor = new BABYLON.Color3(0.2, 0.3, 0.8);
        blueMat.emissiveColor = new BABYLON.Color3(0.05, 0.08, 0.2);
        
        var greenMat = new BABYLON.StandardMaterial("greenMat", targetScene);
        greenMat.diffuseColor = new BABYLON.Color3(0.2, 0.7, 0.3);
        greenMat.emissiveColor = new BABYLON.Color3(0.05, 0.15, 0.08);
        
        var yellowMat = new BABYLON.StandardMaterial("yellowMat", targetScene);
        yellowMat.diffuseColor = new BABYLON.Color3(0.9, 0.8, 0.2);
        yellowMat.emissiveColor = new BABYLON.Color3(0.2, 0.18, 0.05);
        
        var purpleMat = new BABYLON.StandardMaterial("purpleMat", targetScene);
        purpleMat.diffuseColor = new BABYLON.Color3(0.6, 0.2, 0.8);
        purpleMat.emissiveColor = new BABYLON.Color3(0.15, 0.05, 0.2);
        
        var slideMat = new BABYLON.StandardMaterial("slideMat", targetScene);
        slideMat.diffuseColor = new BABYLON.Color3(0.3, 0.6, 0.9);
        slideMat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9);
        slideMat.specularPower = 128;
        slideMat.alpha = 0.85;
        
        // Helper function to create a map element with physics
        function createMapBox(name, width, height, depth, x, y, z, mat, rotY = 0, rotX = 0, rotZ = 0) {
            var box = BABYLON.MeshBuilder.CreateBox(name, {width: width, height: height, depth: depth}, targetScene);
            box.position.set(x, y, z);
            box.rotation.set(rotX, rotY, rotZ);
            box.material = mat;
            box.physicsImpostor = new BABYLON.PhysicsImpostor(box, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.3, friction: 0.5}, targetScene);
            window.complexMapElements.push(box);
            return box;
        }
        
        function createMapCylinder(name, diameter, height, x, y, z, mat) {
            var cyl = BABYLON.MeshBuilder.CreateCylinder(name, {diameter: diameter, height: height, tessellation: 24}, targetScene);
            cyl.position.set(x, y, z);
            cyl.material = mat;
            cyl.physicsImpostor = new BABYLON.PhysicsImpostor(cyl, BABYLON.PhysicsImpostor.CylinderImpostor, {mass: 0, restitution: 0.3, friction: 0.5}, targetScene);
            window.complexMapElements.push(cyl);
            return cyl;
        }
        
        function createMapSphere(name, diameter, x, y, z, mat) {
            var sphere = BABYLON.MeshBuilder.CreateSphere(name, {diameter: diameter, segments: 16}, targetScene);
            sphere.position.set(x, y, z);
            sphere.material = mat;
            sphere.physicsImpostor = new BABYLON.PhysicsImpostor(sphere, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0, restitution: 0.3, friction: 0.5}, targetScene);
            window.complexMapElements.push(sphere);
            return sphere;
        }
        
        // ===== CENTRAL TOWER STRUCTURE =====
        createMapCylinder("centralPillar", 3, 6, 0, 3, 0, stoneMat);
        createMapBox("centralTop", 6, 0.5, 6, 0, 6.25, 0, metalMat);
        
        // ===== CORNER ELEVATED PLATFORMS =====
        createMapBox("neStep1", 4, 1, 4, 10, 0.5, 10, redMat);
        createMapBox("neStep2", 3, 1, 3, 11, 1.5, 11, redMat);
        createMapBox("neStep3", 2.5, 1, 2.5, 11.5, 2.5, 11.5, redMat);
        
        createMapCylinder("seTower1", 2.5, 4, 10, 2, -10, blueMat);
        createMapCylinder("seTower2", 2, 6, 12, 3, -12, blueMat);
        createMapBox("seBridge", 5, 0.3, 1.5, 11, 4.5, -11, metalMat, Math.PI/4);
        
        createMapBox("swPlatform", 6, 2, 6, -10, 1, -10, greenMat);
        createMapBox("swRim1", 6.5, 0.5, 0.5, -10, 2.25, -7, greenMat);
        createMapBox("swRim2", 6.5, 0.5, 0.5, -10, 2.25, -13, greenMat);
        createMapBox("swRim3", 0.5, 0.5, 5.5, -7, 2.25, -10, greenMat);
        createMapBox("swRim4", 0.5, 0.5, 5.5, -13, 2.25, -10, greenMat);
        
        createMapBox("nwBase", 7, 0.8, 7, -10, 0.4, 10, yellowMat);
        createMapBox("nwMid", 5, 0.8, 5, -10, 1.2, 10, yellowMat);
        createMapBox("nwTop", 3, 0.8, 3, -10, 2.0, 10, yellowMat);
        createMapBox("nwPeak", 1.5, 0.8, 1.5, -10, 2.8, 10, yellowMat);
        
        // ===== SLIDES (low friction for sliding) =====
        var slideNorth = createMapBox("slideNorth", 2.5, 0.2, 8, 0, 3.5, 8, slideMat, 0, 0.4, 0);
        slideNorth.physicsImpostor.dispose();
        slideNorth.physicsImpostor = new BABYLON.PhysicsImpostor(slideNorth, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        
        var slideSouth1 = createMapBox("slideSouth1", 2.5, 0.2, 4, 0, 5, -4, slideMat, 0, 0.3, 0);
        slideSouth1.physicsImpostor.dispose();
        slideSouth1.physicsImpostor = new BABYLON.PhysicsImpostor(slideSouth1, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        var slideSouth2 = createMapBox("slideSouth2", 2.5, 0.2, 4, 0, 3.5, -7.5, slideMat, 0, 0.5, 0);
        slideSouth2.physicsImpostor.dispose();
        slideSouth2.physicsImpostor = new BABYLON.PhysicsImpostor(slideSouth2, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        var slideSouth3 = createMapBox("slideSouth3", 2.5, 0.2, 3, 0, 1.5, -10.5, slideMat, 0, 0.7, 0);
        slideSouth3.physicsImpostor.dispose();
        slideSouth3.physicsImpostor = new BABYLON.PhysicsImpostor(slideSouth3, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        
        var slideE1 = createMapBox("slideE1", 3, 0.2, 3, 5, 5.5, 0, slideMat, 0.3, 0.35, 0);
        slideE1.physicsImpostor.dispose();
        slideE1.physicsImpostor = new BABYLON.PhysicsImpostor(slideE1, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        var slideE2 = createMapBox("slideE2", 3, 0.2, 3, 7, 4.2, 2, slideMat, 0.6, 0.4, 0);
        slideE2.physicsImpostor.dispose();
        slideE2.physicsImpostor = new BABYLON.PhysicsImpostor(slideE2, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        var slideE3 = createMapBox("slideE3", 3, 0.2, 3, 9, 2.8, 4, slideMat, 0.9, 0.45, 0);
        slideE3.physicsImpostor.dispose();
        slideE3.physicsImpostor = new BABYLON.PhysicsImpostor(slideE3, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        var slideE4 = createMapBox("slideE4", 3, 0.2, 3, 10, 1.3, 7, slideMat, 1.2, 0.5, 0);
        slideE4.physicsImpostor.dispose();
        slideE4.physicsImpostor = new BABYLON.PhysicsImpostor(slideE4, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.1, friction: 0.05}, targetScene);
        
        // ===== RAMPS FOR ELEVATION CHANGES =====
        createMapBox("westRamp", 3, 0.3, 8, -6, 3, 0, metalMat, 0, 0, 0.42);
        createMapBox("eastRamp", 2.5, 0.3, 6, 6, 2.5, 3, stoneMat, 0.5, 0, 0.55);
        
        // ===== FLOATING PLATFORMS (jump challenges) =====
        createMapBox("float1", 2, 0.4, 2, 5, 3, -5, purpleMat);
        createMapBox("float2", 1.8, 0.4, 1.8, 7, 4, -7, purpleMat);
        createMapBox("float3", 1.5, 0.4, 1.5, 9, 5, -5, purpleMat);
        createMapBox("float4", 2, 0.4, 2, 8, 6.5, -2, purpleMat);
        
        // ===== TUNNEL / UNDERPASS =====
        createMapBox("tunnelWall1", 0.3, 2, 8, -4, 1, 6, stoneMat);
        createMapBox("tunnelWall2", 0.3, 2, 8, -2, 1, 6, stoneMat);
        createMapBox("tunnelRoof", 2.3, 0.3, 8, -3, 2, 6, stoneMat);
        
        // ===== OBSTACLE PILLARS =====
        createMapCylinder("pillar1", 1, 3, 4, 1.5, 0, stoneMat);
        createMapCylinder("pillar2", 1, 3, -4, 1.5, 0, stoneMat);
        createMapCylinder("pillar3", 0.8, 2.5, 0, 1.25, 6, stoneMat);
        createMapCylinder("pillar4", 0.8, 2.5, 0, 1.25, -6, stoneMat);
        
        // ===== DECORATIVE SPHERES (obstacles) =====
        createMapSphere("sphere1", 1.5, -6, 0.75, -5, redMat);
        createMapSphere("sphere2", 1.2, 6, 0.6, 5, blueMat);
        createMapSphere("sphere3", 1.8, -5, 0.9, 5, greenMat);
        
        // ===== BRIDGE CONNECTING CORNERS =====
        createMapBox("bridgeN1", 3, 0.4, 2, -5, 3.5, 11, metalMat);
        createMapBox("bridgeN2", 3, 0.4, 2, 0, 4, 11, metalMat);
        createMapBox("bridgeN3", 3, 0.4, 2, 5, 3.5, 11, metalMat);
        createMapCylinder("bridgeSupport1", 0.5, 7, -5, 1.75, 11, stoneMat);
        createMapCylinder("bridgeSupport2", 0.5, 8, 0, 2, 11, stoneMat);
        createMapCylinder("bridgeSupport3", 0.5, 7, 5, 1.75, 11, stoneMat);
        
        // ===== HALF-PIPE / BOWL AREA =====
        createMapBox("bowl1", 6, 0.3, 4, -8, 0.8, 0, stoneMat, 0, 0, -0.4);
        createMapBox("bowl2", 6, 0.3, 4, 8, 0.8, 0, stoneMat, 0, 0, 0.4);
        
        // ===== STAIRCASE =====
        for (let i = 0; i < 6; i++) {
            createMapBox("stair" + i, 2, 0.3, 1, 12 - i * 0.5, 0.3 + i * 0.5, -3 - i, stoneMat);
        }
        
        // ===== LOW COVER WALLS =====
        createMapBox("cover1", 3, 1, 0.4, 3, 0.5, 8, stoneMat);
        createMapBox("cover2", 3, 1, 0.4, -3, 0.5, -8, stoneMat);
        createMapBox("cover3", 0.4, 1, 3, 8, 0.5, 3, stoneMat);
        createMapBox("cover4", 0.4, 1, 3, -8, 0.5, -3, stoneMat);
        
        // ===== ELEVATED RING AROUND CENTER =====
        createMapBox("ring1", 8, 0.5, 1.5, 0, 1.5, 5, metalMat);
        createMapBox("ring2", 8, 0.5, 1.5, 0, 1.5, -5, metalMat);
        createMapBox("ring3", 1.5, 0.5, 7, 5, 1.5, 0, metalMat);
        createMapBox("ring4", 1.5, 0.5, 7, -5, 1.5, 0, metalMat);
        
        console.log('Complex map created with', window.complexMapElements.length, 'elements');
    };
    
    // Function to destroy complex map elements
    window.destroyComplexMap = function() {
        if (window.complexMapElements) {
            window.complexMapElements.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    if (mesh.physicsImpostor) mesh.physicsImpostor.dispose();
                    mesh.dispose();
                }
            });
            window.complexMapElements = [];
        }
    };
    
    // ========== END OF COMPLEX MAP DEFINITION ==========

    // ========== URBAN MAP WITH BUILDINGS ==========
    window.urbanMapElements = [];
    
    window.createUrbanMap = function(targetScene) {
        // Clean up existing urban map elements
        if (window.urbanMapElements) {
            window.urbanMapElements.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    if (mesh.physicsImpostor) mesh.physicsImpostor.dispose();
                    mesh.dispose();
                }
            });
        }
        window.urbanMapElements = [];
        
        // Materials
        var concreteMat = new BABYLON.StandardMaterial("concreteMat", targetScene);
        concreteMat.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
        concreteMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        
        var brickMat = new BABYLON.StandardMaterial("brickMat", targetScene);
        brickMat.diffuseColor = new BABYLON.Color3(0.7, 0.4, 0.3);
        brickMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        
        var darkBrickMat = new BABYLON.StandardMaterial("darkBrickMat", targetScene);
        darkBrickMat.diffuseColor = new BABYLON.Color3(0.5, 0.3, 0.25);
        darkBrickMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        
        var windowMat = new BABYLON.StandardMaterial("windowMat", targetScene);
        windowMat.diffuseColor = new BABYLON.Color3(0.3, 0.5, 0.7);
        windowMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        windowMat.alpha = 0.6;
        windowMat.emissiveColor = new BABYLON.Color3(0.1, 0.15, 0.2);
        
        var roofMat = new BABYLON.StandardMaterial("roofMat", targetScene);
        roofMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35);
        roofMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        
        var floorMat = new BABYLON.StandardMaterial("floorMat", targetScene);
        floorMat.diffuseColor = new BABYLON.Color3(0.45, 0.4, 0.35);
        floorMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        
        var doorMat = new BABYLON.StandardMaterial("doorMat", targetScene);
        doorMat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.15);
        doorMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        
        var metalRailMat = new BABYLON.StandardMaterial("metalRailMat", targetScene);
        metalRailMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45);
        metalRailMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
        
        var accentMat = new BABYLON.StandardMaterial("accentMat", targetScene);
        accentMat.diffuseColor = new BABYLON.Color3(0.8, 0.6, 0.2);
        accentMat.emissiveColor = new BABYLON.Color3(0.2, 0.15, 0.05);
        
        // Helper functions
        function createBox(name, w, h, d, x, y, z, mat, rotY = 0) {
            var box = BABYLON.MeshBuilder.CreateBox(name, {width: w, height: h, depth: d}, targetScene);
            box.position.set(x, y, z);
            box.rotation.y = rotY;
            box.material = mat;
            box.physicsImpostor = new BABYLON.PhysicsImpostor(box, BABYLON.PhysicsImpostor.BoxImpostor, {mass: 0, restitution: 0.3, friction: 0.5}, targetScene);
            window.urbanMapElements.push(box);
            return box;
        }
        
        function createCylinder(name, diam, h, x, y, z, mat) {
            var cyl = BABYLON.MeshBuilder.CreateCylinder(name, {diameter: diam, height: h, tessellation: 16}, targetScene);
            cyl.position.set(x, y, z);
            cyl.material = mat;
            cyl.physicsImpostor = new BABYLON.PhysicsImpostor(cyl, BABYLON.PhysicsImpostor.CylinderImpostor, {mass: 0, restitution: 0.3, friction: 0.5}, targetScene);
            window.urbanMapElements.push(cyl);
            return cyl;
        }
        
        // ===== BUILDING 1: Northwest - Two-story building with rooms =====
        // Ground floor walls
        createBox("b1_wall_n", 10, 3, 0.3, -9, 1.5, 6.85, brickMat);
        createBox("b1_wall_s", 10, 3, 0.3, -9, 1.5, -1.15, brickMat);
        createBox("b1_wall_w", 0.3, 3, 8, -13.85, 1.5, 2.85, brickMat);
        createBox("b1_wall_e1", 0.3, 3, 2.5, -4.15, 1.5, 5.6, brickMat); // East wall with door gap
        createBox("b1_wall_e2", 0.3, 3, 2.5, -4.15, 1.5, 0.1, brickMat);
        // Ground floor
        createBox("b1_floor1", 10, 0.3, 8, -9, 0.15, 2.85, floorMat);
        // First floor (ceiling of ground, floor of second)
        createBox("b1_floor2", 10, 0.3, 8, -9, 3.15, 2.85, floorMat);
        // Second floor walls
        createBox("b1_wall2_n", 10, 3, 0.3, -9, 4.65, 6.85, darkBrickMat);
        createBox("b1_wall2_s", 10, 3, 0.3, -9, 4.65, -1.15, darkBrickMat);
        createBox("b1_wall2_w", 0.3, 3, 8, -13.85, 4.65, 2.85, darkBrickMat);
        createBox("b1_wall2_e", 0.3, 3, 8, -4.15, 4.65, 2.85, darkBrickMat);
        // Roof
        createBox("b1_roof", 10.6, 0.4, 8.6, -9, 6.35, 2.85, roofMat);
        // Interior wall dividing ground floor into 2 rooms
        createBox("b1_interior1", 0.2, 3, 3.5, -9, 1.5, 5.1, concreteMat);
        // Window on north wall
        createBox("b1_window1", 2, 1.5, 0.1, -9, 2, 6.9, windowMat);
        // Stairs inside (to second floor)
        for (let i = 0; i < 6; i++) {
            createBox("b1_stair" + i, 2, 0.25, 0.8, -12.5, 0.4 + i * 0.5, 1 + i * 0.8, concreteMat);
        }
        
        // ===== BUILDING 2: Northeast - Small shop with open front =====
        createBox("b2_wall_n", 6, 3, 0.3, 9, 1.5, 11.85, brickMat);
        createBox("b2_wall_e", 0.3, 3, 5, 11.85, 1.5, 9.35, brickMat);
        createBox("b2_wall_w", 0.3, 3, 5, 6.15, 1.5, 9.35, brickMat);
        // Open front (south) - just pillars
        createCylinder("b2_pillar1", 0.5, 3, 6.4, 1.5, 6.85, concreteMat);
        createCylinder("b2_pillar2", 0.5, 3, 11.6, 1.5, 6.85, concreteMat);
        createBox("b2_floor", 6, 0.3, 5, 9, 0.15, 9.35, floorMat);
        createBox("b2_roof", 6.6, 0.3, 5.6, 9, 3.15, 9.35, roofMat);
        // Counter inside
        createBox("b2_counter", 4, 1, 0.6, 9, 0.5, 10.5, accentMat);
        
        // ===== BUILDING 3: Southeast - L-shaped building =====
        // Main section
        createBox("b3_wall_s", 8, 4, 0.3, 10, 2, -13.85, darkBrickMat);
        createBox("b3_wall_e", 0.3, 4, 6, 13.85, 2, -10.85, darkBrickMat);
        createBox("b3_wall_n1", 4, 4, 0.3, 12, 2, -7.85, darkBrickMat);
        createBox("b3_wall_w1", 0.3, 4, 3, 10.15, 2, -9.35, darkBrickMat);
        // L extension
        createBox("b3_wall_w2", 0.3, 4, 3, 6.15, 2, -12.35, darkBrickMat);
        createBox("b3_wall_n2", 4, 4, 0.3, 8, 2, -10.85, darkBrickMat);
        createBox("b3_floor", 8, 0.3, 6, 10, 0.15, -10.85, floorMat);
        createBox("b3_roof", 8.6, 0.4, 6.6, 10, 4.2, -10.85, roofMat);
        // Door opening on west side
        createBox("b3_door_frame_t", 1.8, 0.3, 0.3, 6.15, 3.5, -13, doorMat);
        // Windows
        createBox("b3_window1", 2, 1.5, 0.1, 10, 2.5, -13.9, windowMat);
        createBox("b3_window2", 1.5, 1.5, 0.1, 13.9, 2.5, -11, windowMat);
        
        // ===== BUILDING 4: Southwest - Warehouse with large door =====
        createBox("b4_wall_s", 8, 5, 0.3, -10, 2.5, -13.85, concreteMat);
        createBox("b4_wall_w", 0.3, 5, 8, -13.85, 2.5, -9.85, concreteMat);
        createBox("b4_wall_n", 8, 5, 0.3, -10, 2.5, -5.85, concreteMat);
        // East wall with big door gap
        createBox("b4_wall_e1", 0.3, 5, 2, -6.15, 2.5, -12.85, concreteMat);
        createBox("b4_wall_e2", 0.3, 5, 2, -6.15, 2.5, -6.85, concreteMat);
        createBox("b4_wall_e3", 0.3, 1.5, 4, -6.15, 4.25, -9.85, concreteMat); // Above door
        createBox("b4_floor", 8, 0.3, 8, -10, 0.15, -9.85, floorMat);
        createBox("b4_roof", 8.6, 0.4, 8.6, -10, 5.2, -9.85, roofMat);
        // Crates inside warehouse
        createBox("b4_crate1", 1.5, 1.5, 1.5, -12, 0.9, -11, accentMat);
        createBox("b4_crate2", 1.2, 1.2, 1.2, -12, 0.75, -8.5, accentMat);
        createBox("b4_crate3", 1, 2, 1, -11, 1.15, -7, accentMat);
        createBox("b4_crate4", 1.5, 1, 1.5, -12, 2.4, -11, accentMat); // Stacked
        
        // ===== CENTRAL PLAZA AREA =====
        // Fountain base
        createCylinder("fountain_base", 4, 0.5, 0, 0.25, 0, concreteMat);
        createCylinder("fountain_inner", 3, 0.8, 0, 0.65, 0, windowMat);
        createCylinder("fountain_pillar", 0.6, 2, 0, 1.5, 0, concreteMat);
        
        // Benches around fountain
        createBox("bench1", 2, 0.5, 0.6, 3, 0.25, 0, accentMat);
        createBox("bench2", 2, 0.5, 0.6, -3, 0.25, 0, accentMat);
        createBox("bench3", 0.6, 0.5, 2, 0, 0.25, 3, accentMat);
        createBox("bench4", 0.6, 0.5, 2, 0, 0.25, -3, accentMat);
        
        // ===== CORRIDORS / ALLEYWAYS =====
        // Alley between building 1 and 4 (west side)
        createBox("alley_w_floor", 2, 0.1, 5, -14, 0.05, -2.5, floorMat);
        
        // Covered walkway on east side
        createBox("walkway_roof", 2, 0.2, 12, 5, 3, 0, roofMat);
        createCylinder("walkway_pillar1", 0.4, 3, 5, 1.5, 5, metalRailMat);
        createCylinder("walkway_pillar2", 0.4, 3, 5, 1.5, 0, metalRailMat);
        createCylinder("walkway_pillar3", 0.4, 3, 5, 1.5, -5, metalRailMat);
        
        // ===== ELEVATED WALKWAY / BRIDGE =====
        createBox("bridge1", 8, 0.3, 2, 0, 4, 9, metalRailMat);
        createBox("bridge_rail1", 8, 0.5, 0.1, 0, 4.4, 8.05, metalRailMat);
        createBox("bridge_rail2", 8, 0.5, 0.1, 0, 4.4, 9.95, metalRailMat);
        // Bridge supports
        createCylinder("bridge_sup1", 0.4, 4, -3.5, 2, 9, metalRailMat);
        createCylinder("bridge_sup2", 0.4, 4, 3.5, 2, 9, metalRailMat);
        // Stairs up to bridge
        for (let i = 0; i < 8; i++) {
            createBox("bridge_stair_l" + i, 1.5, 0.2, 0.6, -4.5 - i * 0.2, 0.3 + i * 0.5, 9, concreteMat);
        }
        
        // ===== ROOFTOP ACCESS BUILDING (small) =====
        createBox("roof_access_wall1", 3, 2, 0.2, -9, 7.35, 5.7, concreteMat);
        createBox("roof_access_wall2", 3, 2, 0.2, -9, 7.35, 3.5, concreteMat);
        createBox("roof_access_wall3", 0.2, 2, 2.4, -10.4, 7.35, 4.6, concreteMat);
        createBox("roof_access_roof", 3.4, 0.2, 2.8, -9, 8.45, 4.6, roofMat);
        // Ladder to roof access
        createBox("ladder1", 0.1, 2, 0.3, -7.7, 7.35, 4.6, metalRailMat);
        createBox("ladder2", 0.1, 2, 0.3, -7.5, 7.35, 4.6, metalRailMat);
        
        // ===== STREET LAMPS =====
        createCylinder("lamp1_pole", 0.15, 4, 5, 2, 5, metalRailMat);
        createBox("lamp1_light", 0.6, 0.3, 0.6, 5, 4.15, 5, accentMat);
        createCylinder("lamp2_pole", 0.15, 4, -5, 2, -5, metalRailMat);
        createBox("lamp2_light", 0.6, 0.3, 0.6, -5, 4.15, -5, accentMat);
        
        // ===== BARRIER WALLS / LOW WALLS =====
        createBox("barrier1", 4, 0.8, 0.3, 2, 0.4, -6, concreteMat);
        createBox("barrier2", 4, 0.8, 0.3, -2, 0.4, 6, concreteMat);
        createBox("barrier3", 0.3, 0.8, 3, 6, 0.4, -3, concreteMat);
        
        // ===== DUMPSTERS =====
        createBox("dumpster1", 2, 1.2, 1, -5.5, 0.6, -4, darkBrickMat);
        createBox("dumpster2", 2, 1.2, 1, 4, 0.6, 11.5, darkBrickMat);
        
        console.log('Urban map created with', window.urbanMapElements.length, 'elements');
    };
    
    // Function to destroy urban map elements
    window.destroyUrbanMap = function() {
        if (window.urbanMapElements) {
            window.urbanMapElements.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    if (mesh.physicsImpostor) mesh.physicsImpostor.dispose();
                    mesh.dispose();
                }
            });
            window.urbanMapElements = [];
        }
    };
    
    // ========== END OF URBAN MAP DEFINITION ==========

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
    
    // Player visual mesh (humanoid character) with selected skin
    player = createCharacterMesh(scene, "player", new BABYLON.Color3(0.2, 0.6, 1), myUsername, selectedSkin);
    player.position.y = 3;

    // Create bat attached to player's right arm (invisible physics hitbox)
    batMesh = BABYLON.MeshBuilder.CreateCapsule("bat", {height: 3.0, radius: 0.08}, scene);
    batMesh.parent = player.rightArm; // Attach to right arm
    batMesh.position.set(0, -1.5, 0); // Position at end of arm
    batMesh.rotation.set(0, 0, 0);
    batMesh.visibility = 0; // Always invisible - katana model will be shown instead
    
    // Load katana 3D model (from IndexedDB cache)
    loadCachedMesh('katana', scene, function(meshes) {
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

    // Jump state
    jumpreloading = false;
    playerCanJump = true; // Reset to true when scene loads

    scene.registerBeforeRender(function() {
        // Update jump availability based on grounded state
        if (playerPhysicsBody && playerPhysicsBody.physicsImpostor) {
            var vel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
            var groundRay = new BABYLON.Ray(playerPhysicsBody.position, new BABYLON.Vector3(0, -1, 0), 1.1);
            var groundHit = scene.pickWithRay(groundRay, function (mesh) {
                return mesh.isPickable && 
                       mesh !== playerPhysicsBody && 
                       !mesh.name.startsWith("player") && 
                       mesh.name !== "skybox" &&
                       mesh.name !== "front";
            });
            // Player can jump only when on ground with stable Y velocity
            if (groundHit && groundHit.hit && vel.y > -1 && vel.y < 1) {
                playerCanJump = true;
            }
        }
        
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
                
                // Load the 3D model (from IndexedDB cache)
                loadCachedMesh('ultimate', scene, function(meshes) {
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
                return mesh.isPickable && 
                       mesh !== playerPhysicsBody && 
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
                
                // Load the grenade 3D model (from IndexedDB cache)
                loadCachedMesh('grenade', scene, function(meshes) {
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
        
        // Reset killstreak when player dies
        killstreak = 0;
        updateKillstreakDisplay();
        
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
        
        // Activate spawn immunity for 5 seconds
        hasSpawnImmunity = true;
        
        // Show shield bubble 3D model around player
        showShieldBubble();
        
        // Show immunity indicator
        let immunityIndicator = document.getElementById('spawnImmunityIndicator');
        if (!immunityIndicator) {
            immunityIndicator = document.createElement('div');
            immunityIndicator.id = 'spawnImmunityIndicator';
            immunityIndicator.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -60px); background:rgba(0,255,255,0.3); border:2px solid cyan; border-radius:10px; padding:10px 20px; color:white; font-size:18px; font-weight:bold; text-shadow:0 0 10px cyan; z-index:1000; pointer-events:none;';
            document.body.appendChild(immunityIndicator);
        }
        immunityIndicator.innerHTML = `🛡️ SPAWN IMMUNITY (${SPAWN_IMMUNITY_DURATION / 1000}s)`;
        immunityIndicator.style.display = 'block';
        
        // Countdown display
        let timeLeft = SPAWN_IMMUNITY_DURATION / 1000;
        const countdownInterval = setInterval(() => {
            timeLeft--;
            if (hasSpawnImmunity && timeLeft > 0) {
                immunityIndicator.innerHTML = `🛡️ SPAWN IMMUNITY (${timeLeft}s)`;
            } else {
                clearInterval(countdownInterval);
            }
        }, 1000);
        
        // Clear any existing timer
        if (spawnImmunityTimer) {
            clearTimeout(spawnImmunityTimer);
        }
        
        // Set timer to remove immunity after 5 seconds
        spawnImmunityTimer = setTimeout(() => {
            hasSpawnImmunity = false;
            spawnImmunityTimer = null;
            immunityIndicator.style.display = 'none';
            // Hide shield bubble
            hideShieldBubble();
            console.log('Spawn immunity expired');
        }, SPAWN_IMMUNITY_DURATION);
        
        console.log(`Spawn immunity activated for ${SPAWN_IMMUNITY_DURATION / 1000} seconds`);
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
        
        // Load the external 3D model (from IndexedDB cache)
        loadCachedMesh('ultimate', scene, function(meshes) {
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
            // Break spawn immunity when attacking
            breakSpawnImmunity();
            
            isChargingUltimate = true;
            ultimateCharge = 0;
            document.getElementById('ultimateContainer').style.display = 'block';
        }
    };
    
    // Swing bat
    window.swingBat = function() {
        if (!canSwingBat || isDead || isSwingingBat || isChargingUltimate || isChargingGrenade || isChargingDrone) return;
        
        // Break spawn immunity when attacking
        breakSpawnImmunity();
        
        canSwingBat = false;
        isSwingingBat = true;
        batHitsThisSwing.clear(); // Reset hit tracking for new swing
        
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
                        // Spawn explosion effect at point of contact (only once per swing per player)
                        if (!batHitsThisSwing.has('player_' + playerId)) {
                            batHitsThisSwing.add('player_' + playerId);
                            spawnKnockbackExplosion(otherPlayer.collider.position);
                        }
                        
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
                    
                    // Spawn explosion effect at point of contact (only once per swing per block)
                    const blockKey = 'block_' + (block.blockId || block.uniqueId);
                    if (!batHitsThisSwing.has(blockKey)) {
                        batHitsThisSwing.add(blockKey);
                        spawnKnockbackExplosion(block.position);
                    }
                    
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
        
        // Load the grenade 3D model (from IndexedDB cache)
        loadCachedMesh('grenade', scene, function(meshes) {
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
        
        // Break spawn immunity when attacking
        breakSpawnImmunity();
        
        isChargingGrenade = true;
        grenadeCharge = 0;
        currentAnimState = 'charging';
    };
    
    // Start charging drone
    window.startChargingDrone = function() {
        if (isDead || isChargingDrone || isDroneMode || isChargingUltimate || isChargingGrenade || isSwingingBat) return;
        
        // Break spawn immunity when attacking
        breakSpawnImmunity();
        
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
        
        // Load the external 3D model (from IndexedDB cache)
        loadCachedMesh('drone', scene, function(meshes) {
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
        
        // If player is dead, skip the transition animation to avoid camera conflicts
        if (isDead) {
            // Instant switch - no transition
            scene.activeCamera = camera;
            camera.attachControl(canvas, true);
        }
        // Cool camera transition back to player (only if alive)
        else if (droneCamera && droneMesh && playerPhysicsBody) {
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
                if (transitionProgress >= 1 || isDead) {
                    clearInterval(transitionInterval);
                    if (transitionCamera && !transitionCamera.isDisposed) {
                        transitionCamera.dispose();
                    }
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
            loadCachedMesh('droneBomb', scene, function(meshes, particleSystems, skeletons, animationGroups) {
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
        var currentVel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
        var ray = new BABYLON.Ray(playerPhysicsBody.position, new BABYLON.Vector3(0, -1, 0), 1.1);
        var hit = scene.pickWithRay(ray, function (mesh) {
            // Exclude player physics body and all player visual mesh parts (names start with "player")
            return mesh.isPickable && 
                   mesh !== playerPhysicsBody && 
                   !mesh.name.startsWith("player") && 
                   mesh.name !== "skybox" &&
                   mesh.name !== "front";
        });

        // Only brake if on the ground - Y velocity between -3 and 3 allows for small ground fluctuations
        if (hit && hit.hit && currentVel.y > -3 && currentVel.y < 3) {
            // Only scale horizontal velocity, preserve Y to not interfere with gravity
            var newVel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
            playerPhysicsBody.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(newVel.x * 0.9, newVel.y, newVel.z * 0.9));
            playerPhysicsBody.physicsImpostor.setAngularVelocity(playerPhysicsBody.physicsImpostor.getAngularVelocity().scale(0.9));
        }
    }
}

// Initialize asset cache first, then create scene
let scene;

async function initializeGame() {
    console.log("Initializing asset cache...");
    
    if (loadingText) loadingText.textContent = "Checking cached assets...";
    
    // Initialize the IndexedDB cache BEFORE creating the scene
    await initAssetCache((modelName, success, current, total) => {
        const progress = Math.round((current / total) * 50); // First 50% for caching
        
        if (loadingBar) loadingBar.style.width = progress + "%";
        if (loadingPercent) loadingPercent.textContent = progress + "%";
        if (loadingText) loadingText.textContent = success ? 
            `${modelName} ready (${cachedModelUrls[modelName]?.startsWith('blob:') ? 'cached' : 'online'})` : 
            `${modelName} will load on use...`;
        
        console.log(`Asset progress: ${current}/${total} (${progress}%) - ${modelName}`);
    });
    
    console.log("Asset cache ready, creating scene...");
    if (loadingText) loadingText.textContent = "Creating game world...";
    
    // Now create the scene (models will use cached URLs)
    scene = createScene();
    
    // Initialize scene-dependent extras (multiplayer interpolation, etc.)
    initializeSceneExtras();
    
    // Preload models into Babylon's asset system
    preloadModels();
}

// Preload 3D models using IndexedDB cache (loads from disk after first visit)
async function preloadModels() {
    console.log("Loading models into scene...");
    if (loadingText) loadingText.textContent = "Loading 3D models...";
    
    const modelNames = ['drone', 'ultimate', 'ball', 'katana', 'droneBomb', 'grenade', 'mine'];
    let loadedCount = 0;
    const totalModels = modelNames.length;
    
    function updateLoadingProgress(modelName, success) {
        loadedCount++;
        const progress = 50 + Math.round((loadedCount / totalModels) * 40); // 40% for models
        
        if (loadingBar) loadingBar.style.width = progress + "%";
        if (loadingPercent) loadingPercent.textContent = progress + "%";
        if (loadingText) loadingText.textContent = success ? 
            `Loaded ${modelName}...` : 
            `${modelName} will load on use...`;
        
        console.log(`Loading progress: ${loadedCount}/${totalModels} (${progress}%) - ${modelName}`);
        
        if (loadedCount >= totalModels) {
            // After models, preload maps
            preloadMaps();
        }
    }
    
    // Load all models using cached URLs
    modelNames.forEach(modelName => {
        const url = getCachedModelUrl(modelName);
        const displayName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        
        // Use .glb plugin extension for blob URLs
        const pluginExtension = isCachedBlobUrl(url) ? ".glb" : undefined;
        
        BABYLON.SceneLoader.LoadAssetContainer(url, "", scene, 
            function(container) {
                console.log(`${displayName} model loaded successfully`);
                updateLoadingProgress(displayName, true);
            }, 
            function(event) {
                // Progress callback for individual model (optional)
            },
            function(scene, message, exception) {
                console.warn(`Failed to preload ${displayName} model (will load on first use):`, message);
                updateLoadingProgress(displayName, false);
            },
            pluginExtension
        );
    });
}

// Preload local .babylon maps for instant switching
async function preloadMaps() {
    console.log("Preloading maps...");
    if (loadingText) loadingText.textContent = "Loading maps...";
    
    // Get maps with local .babylon files (not remote URLs)
    const localMaps = Object.entries(MAP_CONFIGS)
        .filter(([id, config]) => config.url && !config.url.startsWith('http'))
        .map(([id, config]) => ({ id, ...config }));
    
    let loadedMaps = 0;
    const totalMaps = localMaps.length;
    
    function onMapLoadComplete() {
        loadedMaps++;
        const progress = 90 + Math.round((loadedMaps / Math.max(totalMaps, 1)) * 10);
        
        if (loadingBar) loadingBar.style.width = progress + "%";
        if (loadingPercent) loadingPercent.textContent = progress + "%";
        
        if (loadedMaps >= totalMaps) {
            onAllAssetsLoaded();
        }
    }
    
    if (localMaps.length === 0) {
        onAllAssetsLoaded();
        return;
    }
    
    // Preload each local map
    localMaps.forEach(map => {
        console.log(`Preloading map: ${map.name} (${map.url})`);
        
        BABYLON.SceneLoader.LoadAssetContainer("", map.url, scene,
            function(container) {
                console.log(`Map ${map.name} preloaded successfully`);
                // Store container for instant instantiation later
                window.preloadedMapContainers = window.preloadedMapContainers || {};
                window.preloadedMapContainers[map.id] = container;
                onMapLoadComplete();
            },
            null,
            function(scene, message, exception) {
                console.warn(`Failed to preload map ${map.name}:`, message);
                onMapLoadComplete();
            },
            ".babylon"
        );
    });
}

function onAllAssetsLoaded() {
    console.log("All assets loaded!");
    modelsLoaded = true;
    
    if (loadingText) loadingText.textContent = "Ready!";
    
    // Load pending map if one was received before scene was ready
    if (pendingMapId && pendingMapId !== currentMapId) {
        console.log('Loading pending map:', pendingMapId);
        loadMap(pendingMapId, scene);
        const mapConfig = MAP_CONFIGS[pendingMapId];
        if (mapConfig && mapConfig.spawnY && playerPhysicsBody) {
            playerPhysicsBody.position.y = mapConfig.spawnY;
            if (player) player.position.y = mapConfig.spawnY;
        }
        pendingMapId = null;
    }
    
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

// Initialize game on startup (cache first, then scene)
initializeGame();

// Chat input blur handler
document.getElementById('chatInput').addEventListener('blur', function() {
    document.getElementById('chatInputContainer').style.opacity = '0';
    if (document.getElementById('chatMessages').children.length === 0) {
        document.getElementById('chatWrapper').style.display = 'none';
    }
});

// Velocity-based prediction and smooth interpolation for other players
let lastFrameTime = Date.now();

// This function sets up scene-dependent code after the scene is created
function initializeSceneExtras() {
    setupPointerObservable();
    startRenderLoop();
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
                
                // Clamp target Y to not go below ground (use map's groundY level)
                const mapGroundY = (currentMapId && MAP_CONFIGS[currentMapId]) ? MAP_CONFIGS[currentMapId].groundY : 0;
                if (p.targetY < mapGroundY) {
                    p.targetY = mapGroundY;
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
}

// Multiplayer Logic
function addOtherPlayer(playerInfo) {
    console.log('Adding other player:', playerInfo.playerId.substring(0, 8), 'skin:', playerInfo.skin || 'default');
    
    // Visual humanoid character (red) with their selected skin
    const mesh = createCharacterMesh(scene, "otherPlayer_" + playerInfo.playerId, new BABYLON.Color3(1, 0.3, 0.3), playerInfo.username || "Player", playerInfo.skin || 'default');
    mesh.position.set(playerInfo.x, playerInfo.y - 0.5, playerInfo.z);
    
    // Create bat for this player (attached to their right arm, hidden by default)
    const otherBat = BABYLON.MeshBuilder.CreateCapsule("otherBat_" + playerInfo.playerId, {height: 3.0, radius: 0.08}, scene);
    otherBat.parent = mesh.rightArm;
    otherBat.position.set(0, -1.5, 0);
    otherBat.visibility = 0; // Always invisible - katana model will be shown instead
    
    // Load katana 3D model for this player (from IndexedDB cache)
    loadCachedMesh('katana', scene, function(meshes) {
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
        shieldBubbleMesh: null,  // For showing their spawn immunity shield
        shieldBubbleTimer: null,  // Timer to remove shield after immunity duration
        lastAnimState: 'idle',
        username: playerInfo.username || "Player", // Store username here for easy access
        skin: playerInfo.skin || 'default', // Store their selected skin
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
            
            // Load the 3D model (from IndexedDB cache)
            const targetBall = playerData.chargingBall;
            loadCachedMesh('ultimate', scene, function(meshes) {
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
            
            // Load the grenade 3D model (from IndexedDB cache)
            loadCachedMesh('grenade', scene, function(meshes) {
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

// Room settings (hardcore mode, map, etc.)
let isHardcoreMode = false;
let pendingMapId = null; // Store map ID if scene isn't ready yet

socket.on('roomSettings', (settings) => {
    console.log('Room settings received:', settings);
    isHardcoreMode = settings.hardcoreMode;
    
    // Load map if specified
    const mapId = settings.mapId || 'default';
    console.log('Map ID from settings:', mapId, 'Current map:', currentMapId);
    
    // Check if scene is ready
    if (!scene) {
        console.log('Scene not ready yet, storing pending map:', mapId);
        pendingMapId = mapId;
        return;
    }
    
    if (mapId !== currentMapId) {
        console.log('Loading new map:', mapId);
        loadMap(mapId, scene);
        
        // Show notification about map change
        const mapConfig = MAP_CONFIGS[mapId];
        if (mapConfig && mapId !== 'default') {
            Swal.fire({
                icon: 'info',
                title: `${mapConfig.icon} ${mapConfig.name}`,
                text: 'Custom map loaded!',
                timer: 2500,
                showConfirmButton: false,
                background: '#1a1a2e',
                color: '#fff'
            });
        }
        
        // Adjust player spawn height based on map
        if (mapConfig && mapConfig.spawnY && playerPhysicsBody) {
            playerPhysicsBody.position.y = mapConfig.spawnY;
            if (player) player.position.y = mapConfig.spawnY;
        }
    } else if (mapId === 'default') {
        // For default map, handle wall visibility based on hardcore mode
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
    }
    
    // Show notification about hardcore mode (only for default map)
    if (settings.hardcoreMode && mapId === 'default') {
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
                
                // Load the external 3D model (from IndexedDB cache)
                loadCachedMesh('drone', scene, function(meshes) {
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

// Handle other player changing their skin
socket.on('playerSkinChanged', (data) => {
    const { playerId, skin } = data;
    if (otherPlayers[playerId] && otherPlayers[playerId].mesh) {
        console.log('Player', playerId.substring(0, 8), 'changed skin to:', skin);
        changeSkin(otherPlayers[playerId].mesh, skin, scene);
        otherPlayers[playerId].skin = skin;
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
    
    // Increment killstreak
    killstreak++;
    updateKillstreakDisplay();
    
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
        
        // Show shield bubble for the respawned player
        showOtherPlayerShieldBubble(playerId);
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
    
    // Load the 3D model (from IndexedDB cache)
    loadCachedMesh('ball', scene, function(meshes) {
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
        // Check for spawn immunity
        if (hasSpawnImmunity) {
            console.log('BALL BLOCKED BY SPAWN IMMUNITY!');
            return;
        }
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
    
    // Load the external 3D model (from IndexedDB cache)
    loadCachedMesh('ultimate', scene, function(meshes) {
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
        // Check for spawn immunity
        if (hasSpawnImmunity) {
            console.log('ULTIMATE BLOCKED BY SPAWN IMMUNITY!');
            return;
        }
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
        // Check for spawn immunity
        if (hasSpawnImmunity) {
            console.log('BAT SWING BLOCKED BY SPAWN IMMUNITY!');
            return;
        }
        const batPos = new BABYLON.Vector3(batData.x, batData.y, batData.z);
        const distance = BABYLON.Vector3.Distance(batPos, playerPhysicsBody.position);
        
        if (distance < 5.0) { // Extended range for long bat + network latency
            const knockbackDir = playerPhysicsBody.position.subtract(batPos).normalize();
            knockbackDir.y += 0.3; // Add some upward force
            
            // Spawn explosion effect at our position (victim sees it too)
            spawnKnockbackExplosion(playerPhysicsBody.position.clone());
            
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
    
    // Load the grenade 3D model (from IndexedDB cache)
    loadCachedMesh('grenade', scene, function(meshes) {
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
    
    // Temporarily disable walls when grenade explodes
    const WALL_DISABLE_DURATION = 5000; // 5 seconds
    if (window.arenaWalls && window.arenaWalls.length > 0) {
        window.arenaWalls.forEach(wall => {
            if (wall && !wall.isDisposed()) {
                // Make wall invisible and disable physics
                wall.visibility = 0;
                wall.checkCollisions = false;
                if (wall.physicsImpostor) {
                    wall.physicsImpostor.setMass(0);
                    wall.physicsImpostor.dispose();
                    wall._tempPhysicsDisabled = true;
                }
            }
        });
        
        // Re-enable walls after duration
        setTimeout(() => {
            if (window.arenaWalls) {
                window.arenaWalls.forEach(wall => {
                    if (wall && !wall.isDisposed()) {
                        wall.visibility = 1;
                        wall.checkCollisions = true;
                        if (wall._tempPhysicsDisabled) {
                            wall.physicsImpostor = new BABYLON.PhysicsImpostor(
                                wall,
                                BABYLON.PhysicsImpostor.BoxImpostor,
                                {mass: 0, restitution: 0.9},
                                scene
                            );
                            wall._tempPhysicsDisabled = false;
                        }
                    }
                });
            }
        }, WALL_DISABLE_DURATION);
    }
    
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
                // Check for spawn immunity
                if (hasSpawnImmunity) {
                    console.log('GRENADE BLOCKED BY SPAWN IMMUNITY!');
                    return;
                }
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
    const explosionRadius = 5;
    const knockbackForce = 800;
    
    if (playerPhysicsBody && !isDead && !hasSpawnImmunity) {
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
    } else if (hasSpawnImmunity) {
        console.log('DRONE BOMB BLOCKED BY SPAWN IMMUNITY!');
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
        loadCachedMesh('droneBomb', scene, function(meshes, particleSystems, skeletons, animationGroups) {
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
        // Check for spawn immunity - no knockback when immune
        if (!hasSpawnImmunity) {
            playerPhysicsBody.physicsImpostor.applyImpulse(
                new BABYLON.Vector3(0, MINE_BOOST_FORCE, 0),
                playerPhysicsBody.getAbsolutePosition()
            );
        } else {
            console.log('MINE BOOST BLOCKED BY SPAWN IMMUNITY!');
        }
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

// Pointer observable setup (called after scene is created)
function setupPointerObservable() {
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
            
            // Break spawn immunity when attacking
            breakSpawnImmunity();
            
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
            
            // Load the 3D model (from IndexedDB cache)
            loadCachedMesh('ball', scene, function(meshes) {
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
}

clearBtn.onclick = function() {
    socket.emit('clearBlocks');
}

// Players overlay (Tab key) functionality
const playersOverlay = document.getElementById('playersOverlay');
const playersList = document.getElementById('playersList');
const playersCount = document.getElementById('playersCount');

function updatePlayersOverlay() {
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    // Collect all players (self + others)
    const allPlayers = [];
    
    // Add self
    if (hasJoined && myUsername) {
        allPlayers.push({
            id: socket.id,
            username: myUsername,
            color: document.getElementById('colorpicker').value,
            isYou: true
        });
    }
    
    // Add other players
    for (const playerId in otherPlayers) {
        const player = otherPlayers[playerId];
        if (player && player.mesh) {
            allPlayers.push({
                id: playerId,
                username: player.username || 'Player',
                color: player.color || '#ffffff',
                isYou: false
            });
        }
    }
    
    // Sort alphabetically by username
    allPlayers.sort((a, b) => a.username.localeCompare(b.username));
    
    // Create list items
    allPlayers.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-list-item' + (player.isYou ? ' is-you' : '');
        
        const colorDot = document.createElement('div');
        colorDot.className = 'player-color-dot';
        colorDot.style.backgroundColor = player.color;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.username;
        
        item.appendChild(colorDot);
        item.appendChild(nameSpan);
        
        if (player.isYou) {
            const youTag = document.createElement('span');
            youTag.className = 'player-you-tag';
            youTag.textContent = 'YOU';
            item.appendChild(youTag);
        }
        
        playersList.appendChild(item);
    });
    
    // Update count
    playersCount.textContent = `${allPlayers.length} player${allPlayers.length !== 1 ? 's' : ''} in room`;
}

function showPlayersOverlay() {
    updatePlayersOverlay();
    playersOverlay.style.display = 'block';
}

function hidePlayersOverlay() {
    playersOverlay.style.display = 'none';
}

// Key state tracking
document.addEventListener('keydown', function(event) {
    // Show players overlay on Tab
    if (event.code === "Tab") {
        event.preventDefault();
        showPlayersOverlay();
        return;
    }
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
        // Only allow jump if playerCanJump is true (set by render loop when grounded)
        if (playerCanJump) {
            playerCanJump = false; // Immediately prevent double jump
            playerPhysicsBody.physicsImpostor.applyImpulse(new BABYLON.Vector3(0, 1, 0).scale(10), playerPhysicsBody.getAbsolutePosition());
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
    // Hide players overlay when Tab is released
    if (event.code === "Tab") {
        hidePlayersOverlay();
        return;
    }
    
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

// Render loop setup (called after scene is created)
function startRenderLoop() {
    engine.runRenderLoop(function () {
        scene.render();
    });
}

window.addEventListener("resize", function () {
    engine.resize();
});
