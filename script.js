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
let hasJoined = false;
let selectedRoomId = 'default'; // Default room selection
let availableRooms = [];

const usernameInput = document.getElementById("usernameInput");
const startGameBtn = document.getElementById("startGameBtn");
const usernameOverlay = document.getElementById("usernameOverlay");
const roomSelectorOverlay = document.getElementById("roomSelectorOverlay");
const closeRoomSelector = document.getElementById("closeRoomSelector");
const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const browseRoomsBtn = document.getElementById("browseRoomsBtn");
const toggleThirdPersonBtn = document.getElementById("toggleThirdPersonBtn");
const joinPrivateRoomBtn = document.getElementById("joinPrivateRoomBtn");
const privateRoomOverlay = document.getElementById("privateRoomOverlay");
const privateRoomCodeInput = document.getElementById("privateRoomCodeInput");
const joinPrivateRoomSubmit = document.getElementById("joinPrivateRoomSubmit");
const closePrivateRoomOverlay = document.getElementById("closePrivateRoomOverlay");
const currentRoomDisplay = document.getElementById("currentRoomDisplay");

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
    
    // Request to join private room with code
    socket.emit('joinPrivateRoom', { code: code, username: myUsername });
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
    
    // Clear other players and blocks
    Object.values(otherPlayers).forEach(p => {
        if (p.mesh) p.mesh.dispose();
        if (p.collider) p.collider.dispose();
        if (p.chargingBall) p.chargingBall.dispose();
        if (p.grenadeChargingBall) p.grenadeChargingBall.dispose();
    });
    Object.keys(otherPlayers).forEach(key => delete otherPlayers[key]);
    
    spawnedBlocks.forEach(mesh => mesh.dispose());
    spawnedBlocks.length = 0;
    
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
        
        // Clear other players and blocks from current room
        Object.values(otherPlayers).forEach(p => {
            if (p.mesh) p.mesh.dispose();
            if (p.collider) p.collider.dispose();
            if (p.chargingBall) p.chargingBall.dispose();
            if (p.grenadeChargingBall) p.grenadeChargingBall.dispose();
        });
        Object.keys(otherPlayers).forEach(key => delete otherPlayers[key]);
        
        spawnedBlocks.forEach(mesh => mesh.dispose());
        spawnedBlocks.length = 0;
    }
    
    selectedRoomId = roomId;
    renderRoomsList();
    
    // Close room selector
    roomSelectorOverlay.style.display = 'none';
    
    if (!hasJoined) {
        usernameOverlay.style.display = 'none';
        hasJoined = true;
    }
    
    // Register player with selected room
    socket.emit('registerPlayer', { username: myUsername, roomId: selectedRoomId });
    
    // Request pointer lock
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
    canvas.requestPointerLock();
};

startGameBtn.onclick = function() {
    const name = usernameInput.value.trim();
    if (name) {
        myUsername = name;
        usernameOverlay.style.display = "none";
        hasJoined = true;
        // Register player with default room
        socket.emit('registerPlayer', { username: myUsername, roomId: selectedRoomId });
        
        // Request pointer lock
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
        canvas.requestPointerLock();
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
const BAT_KNOCKBACK_FORCE = 18; // MASSIVE knockback
const BAT_RANGE = 3.0; // Extended range for long bat

// Grenade state
let isChargingGrenade = false;
let grenadeCharge = 0;
let grenadeChargingBall = null;
const GRENADE_CHARGE_TIME = 3000; // 3 seconds to fully charge
const GRENADE_CHARGE_RATE = 100 / (GRENADE_CHARGE_TIME / 16.67);
const GRENADE_MIN_SIZE = 0.2;
const GRENADE_MAX_SIZE = 0.8;

// Grappling hook state
let isGrappling = false;
let grappleTarget = null;
let grappleLine = null;
let grappleHook = null;
let canGrapple = true;
const GRAPPLE_COOLDOWN = 2000; // 2 seconds cooldown
const GRAPPLE_RANGE = 50; // Max grapple distance
const GRAPPLE_PULL_FORCE = 25; // Force applied to pull player
const GRAPPLE_DURATION = 1500; // Max time grappling before auto-release

// Animation state for network sync
let currentAnimState = 'idle'; // 'idle', 'shooting', 'building', 'charging', 'grappling'

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
    }

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

    // Create bat attached to player's right arm
    batMesh = BABYLON.MeshBuilder.CreateCapsule("bat", {height: 3.0, radius: 0.08}, scene);
    const batMat = new BABYLON.StandardMaterial("batMat", scene);
    batMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1); // Brown
    batMat.emissiveColor = new BABYLON.Color3(0.1, 0.05, 0.025);
    batMesh.material = batMat;
    batMesh.parent = player.rightArm; // Attach to right arm
    batMesh.position.set(0, -1.5, 0); // Position at end of arm
    batMesh.rotation.set(0, 0, 0);
    batMesh.visibility = 0; // Hidden until swing

    frontfacing = BABYLON.Mesh.CreateBox("front", 1, scene);
    frontfacing.visibility = 0.5;
    var frontMat = new BABYLON.StandardMaterial("frontMat", scene);
    frontMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    frontMat.alpha = 0.3;
    frontfacing.material = frontMat;

    // Jump reload
    jumpreloading = false;

    scene.registerBeforeRender(function() {
        // Check for death (fell below world)
        if (!isDead && playerPhysicsBody.position.y < DEATH_HEIGHT) {
            // Determine if it was a suicide or kill based on last hit
            let killerId = null;
            let cause = "Fell to Death";
            
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
        
        // Continuous movement based on active keys (disabled when dead)
        if (!isDead) {
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
                // Create the charging ball
                chargingBall = BABYLON.MeshBuilder.CreateSphere("chargingBall", {diameter: 1, segments: 16}, scene);
                var chargeMat = new BABYLON.StandardMaterial("chargeMat", scene);
                chargeMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5);
                chargeMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.3);
                chargingBall.material = chargeMat;
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
                const chargeMat = new BABYLON.StandardMaterial("grenadeChargeMat", scene);
                chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
                chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0);
                chargeMat.alpha = 0.8;
                grenadeChargingBall.material = chargeMat;
            }
            
            grenadeChargingBall.scaling.setAll(ballSize * 2 / 0.1);
            
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
        
        // Grappling hook pull logic
        if (isGrappling && grappleTarget && !isDead) {
            currentAnimState = 'grappling';
            
            // Calculate direction to grapple target
            const pullDir = grappleTarget.subtract(playerPhysicsBody.position).normalize();
            const distanceToTarget = BABYLON.Vector3.Distance(playerPhysicsBody.position, grappleTarget);
            
            // Update grapple line visual
            if (grappleLine) {
                grappleLine.dispose();
            }
            grappleLine = BABYLON.MeshBuilder.CreateLines("grappleLine", {
                points: [playerPhysicsBody.position.clone(), grappleTarget.clone()],
                updatable: false
            }, scene);
            grappleLine.color = new BABYLON.Color3(0.8, 0.6, 0.2); // Golden rope color
            
            // Update hook position
            if (grappleHook) {
                grappleHook.position.copyFrom(grappleTarget);
            }
            
            // Apply pull force toward target
            if (distanceToTarget > 1.5) {
                playerPhysicsBody.physicsImpostor.applyImpulse(
                    pullDir.scale(GRAPPLE_PULL_FORCE * 0.1), // Per-frame force
                    playerPhysicsBody.getAbsolutePosition()
                );
                
                // Cap velocity to prevent crazy speeds
                const vel = playerPhysicsBody.physicsImpostor.getLinearVelocity();
                const maxSpeed = 30;
                if (vel.length() > maxSpeed) {
                    vel.normalize().scaleInPlace(maxSpeed);
                    playerPhysicsBody.physicsImpostor.setLinearVelocity(vel);
                }
            } else {
                // Close enough - release grapple
                releaseGrapple();
            }
            
            // Arm position - one arm extended toward grapple point
            if (player.rightArm) {
                player.rightArm.rotation.x = -1.5;
                player.rightArm.rotation.z = 0;
            }
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
                        grenadeChargeLevel: isChargingGrenade ? grenadeCharge : 0
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
        
        // Release grapple if grappling
        if (isGrappling) {
            releaseGrapple();
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
            chargingBall.dispose();
            chargingBall = null;
        }
        
        // Arm throw animation - fling arms forward then reset
        if (player.leftArm && player.rightArm) {
            player.leftArm.rotation.x = -1.8; // Fling forward
            player.rightArm.rotation.x = -1.8;
            setTimeout(() => {
                if (player.leftArm && player.rightArm) {
                    player.leftArm.rotation.x = 0;
                    player.rightArm.rotation.x = 0;
                    player.leftArm.rotation.z = Math.PI / 6;
                    player.rightArm.rotation.z = -Math.PI / 6;
                }
            }, 200);
        }
        
        // Create ultimate ball (placeholder - will be replaced with 3D model)
        // TODO: Replace with loaded 3D model using BABYLON.SceneLoader.ImportMesh
        const ultimateBall = BABYLON.MeshBuilder.CreateSphere("ultimateBall", {diameter: 0.6, segments: 16}, scene);
        const ultimateMat = new BABYLON.StandardMaterial("ultimateMat", scene);
        ultimateMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5); // Magenta/pink
        ultimateMat.emissiveColor = new BABYLON.Color3(0.8, 0, 0.4);
        ultimateMat.specularColor = new BABYLON.Color3(1, 1, 1);
        ultimateBall.material = ultimateMat;
        ultimateBall.position = startPos.clone();
        ultimateBall.physicsImpostor = new BABYLON.PhysicsImpostor(ultimateBall, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 2, restitution: 0.8}, scene);
        
        // ULTRA fast impulse (5x normal ball speed)
        ultimateBall.physicsImpostor.applyImpulse(shootDir.scale(225), ultimateBall.getAbsolutePosition());
        
        // MASSIVE recoil knockback - push player backwards very hard
        playerPhysicsBody.physicsImpostor.applyImpulse(shootDir.scale(-25), playerPhysicsBody.getAbsolutePosition());
        
        // Remove after 10 seconds
        setTimeout(() => { ultimateBall.dispose(); }, 10000);
        
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
            
            // Dispose the charging ball
            if (chargingBall) {
                chargingBall.dispose();
                chargingBall = null;
            }
            
            // Reset arms to normal position
            if (player.leftArm && player.rightArm) {
                player.leftArm.rotation.x = 0;
                player.rightArm.rotation.x = 0;
                player.leftArm.rotation.z = Math.PI / 6;
                player.rightArm.rotation.z = -Math.PI / 6;
            }
        }
    };
    
    // Start charging ultimate
    window.startChargingUltimate = function() {
        if (!isDead && !isChargingUltimate) {
            isChargingUltimate = true;
            ultimateCharge = 0;
            document.getElementById('ultimateContainer').style.display = 'block';
        }
    };
    
    // Swing bat
    window.swingBat = function() {
        if (!canSwingBat || isDead || isSwingingBat) return;
        
        canSwingBat = false;
        isSwingingBat = true;
        
        // Show bat
        batMesh.visibility = 1;
        
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
                batMesh.visibility = 0;
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
        if (!batMesh || batMesh.visibility === 0) return;
        
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
        
        // Arm throw animation - fling arms forward then reset (like ultimate)
        if (player.leftArm && player.rightArm) {
            player.leftArm.rotation.x = -1.8; // Fling forward
            player.rightArm.rotation.x = -1.8;
            setTimeout(() => {
                if (player.leftArm && player.rightArm) {
                    player.leftArm.rotation.x = 0;
                    player.rightArm.rotation.x = 0;
                    player.leftArm.rotation.z = Math.PI / 6;
                    player.rightArm.rotation.z = -Math.PI / 6;
                }
            }, 200);
        }
        
        // Create grenade projectile
        const grenade = BABYLON.MeshBuilder.CreateSphere("grenade", {diameter: grenadeSize * 2, segments: 16}, scene);
        const grenadeMat = new BABYLON.StandardMaterial("grenadeMat", scene);
        grenadeMat.diffuseColor = new BABYLON.Color3(0, 0.8, 0); // Green
        grenadeMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0);
        grenadeMat.specularColor = new BABYLON.Color3(1, 1, 1);
        grenade.material = grenadeMat;
        
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
    
    // Explode grenade
    function explodeGrenade(position, size) {
        const numFragments = 30; // More fragments for emphasis
        const fragmentSpeed = 25;
        
        for (let i = 0; i < numFragments; i++) {
            const fragment = BABYLON.MeshBuilder.CreateSphere(
                "fragment",
                {diameter: 0.25, segments: 8}, // Larger and smoother
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
        
        // Reset arms to normal position (like ultimate cancel)
        if (player.leftArm && player.rightArm) {
            player.leftArm.rotation.x = 0;
            player.rightArm.rotation.x = 0;
            player.leftArm.rotation.z = Math.PI / 6;
            player.rightArm.rotation.z = -Math.PI / 6;
        }
        
        currentAnimState = 'idle';
    };
    
    // Start charging grenade
    window.startChargingGrenade = function() {
        if (isDead || isChargingGrenade) return;
        isChargingGrenade = true;
        grenadeCharge = 0;
        currentAnimState = 'charging';
    };
    
    // Fire grappling hook
    window.fireGrapple = function() {
        if (!canGrapple || isDead || isGrappling) return;
        
        // Cast ray from camera to find grapple point
        const ray = camera.getForwardRay(GRAPPLE_RANGE);
        const hit = scene.pickWithRay(ray, function(mesh) {
            return mesh !== playerPhysicsBody && 
                   !mesh.name.startsWith("player") && 
                   mesh.name !== "skybox" &&
                   mesh.name !== "front" &&
                   mesh.name !== "grappleLine" &&
                   mesh.name !== "grappleHook";
        });
        
        if (hit && hit.hit) {
            isGrappling = true;
            canGrapple = false;
            grappleTarget = hit.pickedPoint.clone();
            
            // Create hook visual at target
            grappleHook = BABYLON.MeshBuilder.CreateSphere("grappleHook", {diameter: 0.3, segments: 8}, scene);
            const hookMat = new BABYLON.StandardMaterial("hookMat", scene);
            hookMat.diffuseColor = new BABYLON.Color3(0.6, 0.4, 0.1); // Bronze/golden
            hookMat.emissiveColor = new BABYLON.Color3(0.3, 0.2, 0.05);
            grappleHook.material = hookMat;
            grappleHook.position.copyFrom(grappleTarget);
            
            // Create initial line
            grappleLine = BABYLON.MeshBuilder.CreateLines("grappleLine", {
                points: [playerPhysicsBody.position.clone(), grappleTarget.clone()],
                updatable: false
            }, scene);
            grappleLine.color = new BABYLON.Color3(0.8, 0.6, 0.2);
            
            // Emit to other players
            socket.emit('grappleStart', {
                x: grappleTarget.x,
                y: grappleTarget.y,
                z: grappleTarget.z
            });
            
            // Auto-release after duration
            setTimeout(() => {
                if (isGrappling) {
                    releaseGrapple();
                }
            }, GRAPPLE_DURATION);
            
            // Play a satisfying initial pull
            const pullDir = grappleTarget.subtract(playerPhysicsBody.position).normalize();
            playerPhysicsBody.physicsImpostor.applyImpulse(
                pullDir.scale(GRAPPLE_PULL_FORCE),
                playerPhysicsBody.getAbsolutePosition()
            );
        }
    };
    
    // Release grappling hook
    window.releaseGrapple = function() {
        if (!isGrappling) return;
        
        isGrappling = false;
        grappleTarget = null;
        
        // Clean up visuals
        if (grappleLine) {
            grappleLine.dispose();
            grappleLine = null;
        }
        if (grappleHook) {
            grappleHook.dispose();
            grappleHook = null;
        }
        
        // Reset arm
        if (player.rightArm) {
            player.rightArm.rotation.x = 0;
            player.rightArm.rotation.z = -Math.PI / 6;
        }
        
        currentAnimState = 'idle';
        
        // Emit to other players
        socket.emit('grappleEnd', {});
        
        // Cooldown before can grapple again
        setTimeout(() => {
            canGrapple = true;
        }, GRAPPLE_COOLDOWN);
    };
    
    return scene;
};

function handleMovement() {
    if (!playerPhysicsBody || !playerPhysicsBody.physicsImpostor) return;
    
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

    if (hasInput) {
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
            
            // Update grapple line for other players
            if (p.isGrappling && p.grappleTarget) {
                if (p.grappleLine) {
                    p.grappleLine.dispose();
                }
                p.grappleLine = BABYLON.MeshBuilder.CreateLines("otherGrappleLine", {
                    points: [p.mesh.position.clone(), p.grappleTarget.clone()],
                    updatable: false
                }, scene);
                p.grappleLine.color = new BABYLON.Color3(0.8, 0.6, 0.2);
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
    const otherBatMat = new BABYLON.StandardMaterial("otherBatMat_" + playerInfo.playerId, scene);
    otherBatMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
    otherBatMat.emissiveColor = new BABYLON.Color3(0.1, 0.05, 0.025);
    otherBat.material = otherBatMat;
    otherBat.parent = mesh.rightArm;
    otherBat.position.set(0, -1.5, 0);
    otherBat.visibility = 0;
    
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
function applyOtherPlayerAnimation(playerData, animState, chargeLevel, grenadeChargeLevel) {
    const mesh = playerData.mesh;
    if (!mesh || !mesh.leftArm || !mesh.rightArm) return;
    
    grenadeChargeLevel = grenadeChargeLevel || 0;
    
    // Handle ultimate charging ball
    if (animState === 'charging' && chargeLevel > 0) {
        // Create or update charging ball
        if (!playerData.chargingBall) {
            playerData.chargingBall = BABYLON.MeshBuilder.CreateSphere("otherChargingBall", {diameter: 1, segments: 8}, scene);
            const chargeMat = new BABYLON.StandardMaterial("otherChargeMat", scene);
            chargeMat.diffuseColor = new BABYLON.Color3(1, 0, 0.5);
            chargeMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.3);
            playerData.chargingBall.material = chargeMat;
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
            playerData.chargingBall.dispose();
            playerData.chargingBall = null;
        }
    }
    
    // Handle grenade charging ball (separate from ultimate)
    if (animState === 'charging' && grenadeChargeLevel > 0) {
        // Create or update grenade charging ball
        if (!playerData.grenadeChargingBall) {
            playerData.grenadeChargingBall = BABYLON.MeshBuilder.CreateSphere("otherGrenadeChargingBall", {diameter: 1, segments: 8}, scene);
            const chargeMat = new BABYLON.StandardMaterial("otherGrenadeChargeMat", scene);
            chargeMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
            chargeMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0);
            chargeMat.alpha = 0.8;
            playerData.grenadeChargingBall.material = chargeMat;
        }
        
        // Size based on charge
        const chargePercent = grenadeChargeLevel / 100;
        const ballSize = GRENADE_MIN_SIZE + (GRENADE_MAX_SIZE - GRENADE_MIN_SIZE) * chargePercent;
        playerData.grenadeChargingBall.scaling.setAll(ballSize * 2 / 0.1);
        
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
    
    // Handle other animations when not charging anything
    if (!(animState === 'charging' && (chargeLevel > 0 || grenadeChargeLevel > 0))) {
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
        applyOtherPlayerAnimation(p, playerInfo.animState || 'idle', playerInfo.chargeLevel || 0, playerInfo.grenadeChargeLevel || 0);
    }
});

socket.on('disconnectPlayer', (playerId) => {
    if (otherPlayers[playerId]) {
        otherPlayers[playerId].mesh.dispose();
        if (otherPlayers[playerId].collider) {
            otherPlayers[playerId].collider.dispose();
        }
        if (otherPlayers[playerId].chargingBall) {
            otherPlayers[playerId].chargingBall.dispose();
        }
        if (otherPlayers[playerId].grenadeChargingBall) {
            otherPlayers[playerId].grenadeChargingBall.dispose();
        }
        if (otherPlayers[playerId].grappleHook) {
            otherPlayers[playerId].grappleHook.dispose();
        }
        if (otherPlayers[playerId].grappleLine) {
            otherPlayers[playerId].grappleLine.dispose();
        }
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
    if (otherPlayers[data.playerId]) {
        setPlayerMeshVisibility(otherPlayers[data.playerId].mesh, false);
        if (otherPlayers[data.playerId].collider) {
            otherPlayers[data.playerId].collider.visibility = 0;
        }
        if (otherPlayers[data.playerId].chargingBall) {
            otherPlayers[data.playerId].chargingBall.dispose();
            otherPlayers[data.playerId].chargingBall = null;
        }
        if (otherPlayers[data.playerId].grenadeChargingBall) {
            otherPlayers[data.playerId].grenadeChargingBall.dispose();
            otherPlayers[data.playerId].grenadeChargingBall = null;
        }
        if (otherPlayers[data.playerId].grappleHook) {
            otherPlayers[data.playerId].grappleHook.dispose();
            otherPlayers[data.playerId].grappleHook = null;
        }
        if (otherPlayers[data.playerId].grappleLine) {
            otherPlayers[data.playerId].grappleLine.dispose();
            otherPlayers[data.playerId].grappleLine = null;
        }
        otherPlayers[data.playerId].isGrappling = false;
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
});

// Receive balls shot by other players
socket.on('ballShot', (ballData) => {
    const ball = BABYLON.MeshBuilder.CreateSphere("ball", {diameter: 0.3, segments: 8}, scene);
    const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
    ballMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0); // Orange for other players
    ballMat.emissiveColor = new BABYLON.Color3(0.3, 0.15, 0);
    ball.material = ballMat;
    ball.position.set(ballData.x, ballData.y, ballData.z);
    ball.physicsImpostor = new BABYLON.PhysicsImpostor(ball, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0.5, restitution: 0.5}, scene);
    
    // Apply impulse in the direction it was shot
    const dir = new BABYLON.Vector3(ballData.dirX, ballData.dirY, ballData.dirZ);
    ball.physicsImpostor.applyImpulse(dir.scale(15), ball.getAbsolutePosition());

    // Check for collision with player
    ball.physicsImpostor.registerOnPhysicsCollide(playerPhysicsBody.physicsImpostor, () => {
        // Apply massive knockback to player when hit
        const knockbackStrength = 3; 
        const knockbackDir = dir.clone();
        knockbackDir.y += 0.5; // Add some lift
        knockbackDir.normalize();
        
        playerPhysicsBody.physicsImpostor.applyImpulse(knockbackDir.scale(knockbackStrength), playerPhysicsBody.getAbsolutePosition());
        
        // If we want to track who knocked us off, we should store the last hitter
        lastHitterId = ballData.shooterId;
        lastHitterTime = Date.now();
        lastHitCause = "Knocked into the void by Ball";
        
        if (isChargingUltimate) {
            cancelUltimate();
            console.log('Ultimate cancelled - hit by ball!');
        }
        
        if (isChargingGrenade) {
            cancelGrenade();
            console.log('Grenade cancelled - hit by ball!');
        }
    });
    
    // Remove ball after 5 seconds
    setTimeout(() => {
        ball.dispose();
    }, 5000);
});

// Receive ultimate shots from other players
socket.on('ultimateShot', (ultimateData) => {
    // TODO: Replace with loaded 3D model
    const ultimateBall = BABYLON.MeshBuilder.CreateSphere("ultimateBall", {diameter: 0.6, segments: 16}, scene);
    const ultimateMat = new BABYLON.StandardMaterial("ultimateMat", scene);
    ultimateMat.diffuseColor = new BABYLON.Color3(0.8, 0, 0.8); // Purple for other players
    ultimateMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.5);
    ultimateMat.specularColor = new BABYLON.Color3(1, 1, 1);
    ultimateBall.material = ultimateMat;
    ultimateBall.position.set(ultimateData.x, ultimateData.y, ultimateData.z);
    ultimateBall.physicsImpostor = new BABYLON.PhysicsImpostor(ultimateBall, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 2, restitution: 0.8}, scene);
    
    // Ultimate ball is an INSTANT KILL - triggers death on collision with player
    ultimateBall.physicsImpostor.registerOnPhysicsCollide(playerPhysicsBody.physicsImpostor, () => {
        console.log('HIT BY ULTIMATE - INSTANT DEATH!');
        window.triggerDeath(ultimateData.shooterId, "Obliterated by Ultimate");
        // Dispose the ultimate ball after killing
        ultimateBall.dispose();
    });
    
    // ULTRA fast impulse (5x normal ball speed)
    const dir = new BABYLON.Vector3(ultimateData.dirX, ultimateData.dirY, ultimateData.dirZ);
    ultimateBall.physicsImpostor.applyImpulse(dir.scale(225), ultimateBall.getAbsolutePosition());
    
    // Remove after 10 seconds
    setTimeout(() => {
        if (ultimateBall && !ultimateBall.isDisposed()) {
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
            // Show the bat
            if (bat) {
                bat.visibility = 1;
            }
            
            // Store original arm rotation
            const originalRotX = mesh.rightArm.rotation.x;
            const originalRotZ = mesh.rightArm.rotation.z;
            const originalRotY = mesh.rightArm.rotation.y || 0;
            
            // Animate the swing (must match BAT_SWING_DURATION = 300ms)
            let frame = 0;
            const totalFrames = 25;
            const swingDuration = 300; // Match BAT_SWING_DURATION
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
                    
                    // Hide the bat after swing
                    if (bat) {
                        bat.visibility = 0;
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
            
            // Cancel charging abilities when hit
            if (isChargingUltimate) {
                cancelUltimate();
                console.log('Ultimate cancelled - hit by bat!');
            }
            
            if (isChargingGrenade) {
                cancelGrenade();
                console.log('Grenade cancelled - hit by bat!');
            }
        }
    }
});

// Receive grenades from other players
socket.on('grenadeShot', (grenadeData) => {
    const grenade = BABYLON.MeshBuilder.CreateSphere("grenade", {diameter: grenadeData.size * 2, segments: 16}, scene);
    const grenadeMat = new BABYLON.StandardMaterial("grenadeMat", scene);
    grenadeMat.diffuseColor = new BABYLON.Color3(0, 0.8, 0); // Green
    grenadeMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0);
    grenadeMat.specularColor = new BABYLON.Color3(1, 1, 1);
    grenade.material = grenadeMat;
    grenade.position.set(grenadeData.x, grenadeData.y, grenadeData.z);
    
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

// Explode grenade from other player
function explodeOtherPlayerGrenade(position, size) {
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

// Receive grenade explosion from server (triggered by another player's grenade)
socket.on('grenadeExplosion', (explosionData) => {
    const position = new BABYLON.Vector3(explosionData.x, explosionData.y, explosionData.z);
    explodeOtherPlayerGrenade(position, explosionData.size);
});

// Receive grapple start from other players
socket.on('playerGrappleStart', (grappleData) => {
    const playerId = grappleData.playerId;
    if (otherPlayers[playerId]) {
        const p = otherPlayers[playerId];
        const targetPos = new BABYLON.Vector3(grappleData.x, grappleData.y, grappleData.z);
        
        // Create hook visual
        p.grappleHook = BABYLON.MeshBuilder.CreateSphere("otherGrappleHook", {diameter: 0.3, segments: 8}, scene);
        const hookMat = new BABYLON.StandardMaterial("otherHookMat", scene);
        hookMat.diffuseColor = new BABYLON.Color3(0.6, 0.4, 0.1);
        hookMat.emissiveColor = new BABYLON.Color3(0.3, 0.2, 0.05);
        p.grappleHook.material = hookMat;
        p.grappleHook.position.copyFrom(targetPos);
        
        // Store target for line updates
        p.grappleTarget = targetPos;
        p.isGrappling = true;
    }
});

// Receive grapple end from other players
socket.on('playerGrappleEnd', (grappleData) => {
    const playerId = grappleData.playerId;
    if (otherPlayers[playerId]) {
        const p = otherPlayers[playerId];
        
        if (p.grappleHook) {
            p.grappleHook.dispose();
            p.grappleHook = null;
        }
        if (p.grappleLine) {
            p.grappleLine.dispose();
            p.grappleLine = null;
        }
        p.grappleTarget = null;
        p.isGrappling = false;
    }
});

// Helper function to spawn block
function spawnBlock(data) {
    var meshmat = new BABYLON.StandardMaterial("meshmat", scene);
    meshmat.diffuseColor = new BABYLON.Color3.FromHexString(data.color);
    meshmat.backFaceCulling = false;

    var mesh;
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
            // Left click - shoot ball
            if (!canShoot || isDead) return; // Fire rate limit and death check
            
            canShoot = false;
            setTimeout(() => { canShoot = true; }, SHOOT_COOLDOWN);

            playShootAnimation(); // One arm punch animation
            
            const shootDir = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
            const startPos = playerPhysicsBody.position.add(shootDir.scale(1.5));
            
            const ball = BABYLON.MeshBuilder.CreateSphere("ball", {diameter: 0.3, segments: 8}, scene);
            const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
            ballMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
            ballMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0);
            ball.material = ballMat;
            ball.position = startPos.clone();
            ball.physicsImpostor = new BABYLON.PhysicsImpostor(ball, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0.5, restitution: 0.5}, scene);
            
            ball.physicsImpostor.applyImpulse(shootDir.scale(15), ball.getAbsolutePosition());
            
            // Recoil knockback - push player backwards
            playerPhysicsBody.physicsImpostor.applyImpulse(shootDir.scale(-3), playerPhysicsBody.getAbsolutePosition());
            
            setTimeout(() => { ball.dispose(); }, 5000);
            
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
    keysPressed[event.code] = true;
    
    // Toggle Camera 'C'
    if (event.code === "KeyC") {
        isThirdPerson = !isThirdPerson;
    }

    // Jump - only works when grounded
    if (event.code === "Space") {
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
    
    // Grappling hook - E key
    if (event.code === "KeyE") {
        window.fireGrapple();
    }
});

document.addEventListener('keyup', function(event) {
    keysPressed[event.code] = false;
    
    // Cancel ultimate if X is released before fully charged
    if (event.code === "KeyX") {
        cancelUltimate();
    }
    
    // Cancel grenade if Q is released (same as ultimate)
    if (event.code === "KeyQ") {
        cancelGrenade();
    }
    
    // Release grapple if E is released
    if (event.code === "KeyE") {
        window.releaseGrapple();
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
