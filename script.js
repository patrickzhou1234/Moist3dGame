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

// Register as a player when connected
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('registerPlayer');
});

socket.on('disconnect', () => {
    console.log('Socket disconnected!');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
});

// Third person toggle state
let isThirdPerson = false;

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
function createCharacterMesh(scene, name, color) {
    const characterRoot = new BABYLON.TransformNode(name, scene);
    
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
    player = createCharacterMesh(scene, "player", new BABYLON.Color3(0.2, 0.6, 1));
    player.position.y = 3;

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
            window.triggerDeath();
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
                        chargeLevel: isChargingUltimate ? ultimateCharge : 0
                    });
                }
            }
        }
    });
    
    // Death and respawn functions (exposed to window for ultimate ball kills)
    window.triggerDeath = function() {
        if (isDead) return; // Already dead
        isDead = true;
        
        // Cancel any charging ultimate
        if (isChargingUltimate) {
            cancelUltimate();
        }
        
        // Notify other players that we died (hide our character on their screens)
        socket.emit('playerDied');
        
        const overlay = document.getElementById('deathOverlay');
        const timerText = document.getElementById('respawnTimer');
        overlay.style.display = 'flex';
        
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
    
    const impulseStrength = 0.08;
    
    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
        playerPhysicsBody.physicsImpostor.applyImpulse(forward.scale(impulseStrength), playerPhysicsBody.getAbsolutePosition());
    }
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
        playerPhysicsBody.physicsImpostor.applyImpulse(forward.scale(-impulseStrength), playerPhysicsBody.getAbsolutePosition());
    }
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
        playerPhysicsBody.physicsImpostor.applyImpulse(right.scale(-impulseStrength), playerPhysicsBody.getAbsolutePosition());
    }
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
        playerPhysicsBody.physicsImpostor.applyImpulse(right.scale(impulseStrength), playerPhysicsBody.getAbsolutePosition());
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
        }
    });
});

// Multiplayer Logic
function addOtherPlayer(playerInfo) {
    console.log('Adding other player:', playerInfo.playerId.substring(0, 8));
    
    // Visual humanoid character (red)
    const mesh = createCharacterMesh(scene, "otherPlayer_" + playerInfo.playerId, new BABYLON.Color3(1, 0.3, 0.3));
    mesh.position.set(playerInfo.x, playerInfo.y - 0.5, playerInfo.z);
    
    // Physics collider (invisible, for collisions)
    const collider = BABYLON.MeshBuilder.CreateSphere("otherCollider_" + playerInfo.playerId, {diameter: 1.5, segments: 8}, scene);
    collider.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    collider.visibility = 0;
    collider.physicsImpostor = new BABYLON.PhysicsImpostor(collider, BABYLON.PhysicsImpostor.SphereImpostor, {mass: 0, restitution: 0.3}, scene);
    
    otherPlayers[playerInfo.playerId] = { 
        mesh, 
        collider, 
        chargingBall: null,  // For showing their charging ultimate
        lastAnimState: 'idle',
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
function applyOtherPlayerAnimation(playerData, animState, chargeLevel) {
    const mesh = playerData.mesh;
    if (!mesh || !mesh.leftArm || !mesh.rightArm) return;
    
    // Handle charging ball
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
        // Dispose charging ball if not charging
        if (playerData.chargingBall) {
            playerData.chargingBall.dispose();
            playerData.chargingBall = null;
        }
        
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
        applyOtherPlayerAnimation(p, playerInfo.animState || 'idle', playerInfo.chargeLevel || 0);
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
        delete otherPlayers[playerId];
    }
});

// Hide player when they die
socket.on('playerDied', (playerId) => {
    if (otherPlayers[playerId]) {
        setPlayerMeshVisibility(otherPlayers[playerId].mesh, false);
        if (otherPlayers[playerId].collider) {
            otherPlayers[playerId].collider.visibility = 0;
        }
        if (otherPlayers[playerId].chargingBall) {
            otherPlayers[playerId].chargingBall.dispose();
            otherPlayers[playerId].chargingBall = null;
        }
    }
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
    
    // Check for collision with player to cancel ultimate
    ball.physicsImpostor.registerOnPhysicsCollide(playerPhysicsBody.physicsImpostor, () => {
        if (isChargingUltimate) {
            cancelUltimate();
            console.log('Ultimate cancelled - hit by ball!');
        }
    });
    
    // Apply impulse in the direction it was shot
    const dir = new BABYLON.Vector3(ballData.dirX, ballData.dirY, ballData.dirZ);
    ball.physicsImpostor.applyImpulse(dir.scale(15), ball.getAbsolutePosition());
    
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
        window.triggerDeath();
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
            playBuildAnimation();
            
            const sizeval = 0.1 + (size.value / 100) * 2.9; // Range: 0.1 (tiny) to 3 (large)
            const spawnPos = frontfacing.getAbsolutePosition();
            const blockData = {
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
});

document.addEventListener('keyup', function(event) {
    keysPressed[event.code] = false;
    
    // Cancel ultimate if X is released before fully charged
    if (event.code === "KeyX") {
        cancelUltimate();
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
