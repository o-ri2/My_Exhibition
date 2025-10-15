import * as THREE from 'three';

console.log("Script loaded successfully!");

// --- 게임 설정 ---
const GRID_WIDTH = 25;
const GRID_HEIGHT = 50;
const CELL_SIZE = 1.5;
const NORMAL_DROP_SPEED = 3.0;
const FALL_ANIMATION_DURATION = 100;
const AGING_INTERVAL = 30000; // 30초마다 노후화 (밀리초)
const GRAVITY_COLLAPSE_INTERVAL = 60000; // 60초마다 중력 붕괴 (밀리초)

// 성능 최적화를 위한 상수
const MAX_FALLING_BLOCKS = 200; // 최대 떨어지는 블록 수
const MAX_SAND_BLOCKS = 500; // 최대 sandBlocks 수
const PERFORMANCE_CHECK_INTERVAL = 1000; // 성능 체크 간격 (1초)

// --- 3D 환경 설정 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 0, 75); // 카메라를 더 가깝게 이동
camera.lookAt(0, 0, 0);

const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// --- 조명 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(15, 25, 30);
directionalLight.castShadow = true;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.8);
fillLight.position.set(-15, 15, 20);
scene.add(fillLight);

const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
topLight.position.set(0, 40, 0);
scene.add(topLight);

// --- 그룹 및 오디오 ---
const landedCubes = new THREE.Group();
scene.add(landedCubes);

const listener = new THREE.AudioListener();
camera.add(listener);
const sounds = {};
const bgmNature = new THREE.Audio(listener);
const bgmCity = new THREE.Audio(listener);

// --- 로더 ---
const textureLoader = new THREE.TextureLoader();
const audioLoader = new THREE.AudioLoader();
const cubeTextureLoader = new THREE.CubeTextureLoader();

// --- 환경맵 (선택사항) ---
// 환경맵 파일이 없어도 게임은 정상 작동함
let envMap = null;
cubeTextureLoader.load([
  'textures/env/px.jpg',
  'textures/env/nx.jpg',
  'textures/env/py.jpg',
  'textures/env/ny.jpg',
  'textures/env/pz.jpg',
  'textures/env/nz.jpg',
], tex => { 
  envMap = tex; 
  envMap.colorSpace = THREE.SRGBColorSpace;
}, undefined, () => { 
  // 환경맵 파일이 없어도 조용히 처리 - 게임은 정상 진행됨
});

// --- 머티리얼 ---
const materialNames = ['c', 'b', 'd', 'g', 'i', 'w', 'h'];
const soundNames = ['concrete', 'brick', 'diamond', 'glass', 'iron', 'wire', 'hazard'];
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

// ========================================
// 블록 성질 설정 - 여기서 각 블록의 특성을 조정할 수 있습니다
// 
// 각 속성의 의미:
// - agingSpeed: 노후화 속도 (높을수록 빠르게 노후화됨)
// - durability: 내구성 (높을수록 천천히 노후화됨)
// - weight: 무게 (떨어질 때 속도와 안정성에 영향)
// - corrosion: 부식성 (높을수록 부식에 취약함)
//
// 블록의 시각적 외형은 텍스처로만 결정됩니다.
//
// 예시: 다이아몬드를 더 빠르게 노후화시키려면 agingSpeed를 1.5에서 3.0으로 변경
// 예시: 철을 더 가볍게 만들려면 weight를 1.5에서 0.8로 변경
// ========================================
const blockProperties = {
  'c': { // Concrete - 콘크리트
    name: 'Concrete',
    agingSpeed: 1.0,    // 노후화 속도 (높을수록 빠르게 노후화, 0.1~5.0 권장)
    durability: 0.8,    // 내구성 (높을수록 천천히 노후화, 0.1~1.0 권장)
    weight: 1.2,        // 무게 (떨어질 때 속도에 영향, 0.1~3.0 권장)
    corrosion: 0.3      // 부식성 (낮을수록 부식에 강함, 0.0~1.0 권장)
  },
  'b': { // Brick - 벽돌
    name: 'Brick',
    agingSpeed: 1.5,    // 벽돌은 중간 정도로 빠르게 노후화
    durability: 0.9,    // 벽돌은 내구성이 높음
    weight: 1.0,        // 표준 무게
    corrosion: 0.2      // 부식에 강함
  },
  'd': { // Diamond - 다이아몬드
    name: 'Diamond',
    agingSpeed: 1.5,    // 매우 천천히 노후화 (거의 영구적)
    durability: 1.0,    // 최고 내구성
    weight: 0.8,        // 가벼움
    corrosion: 0.0      // 부식되지 않음
  },
  'g': { // Glass - 유리
    name: 'Glass',
    agingSpeed: 2.0,    // 빠르게 노후화
    durability: 0.3,    // 매우 부서지기 쉬움
    weight: 0.6,        // 가벼움
    corrosion: 0.1      // 부식에 강함
  },
  'i': { // Iron - 철
    name: 'Iron',
    agingSpeed: 1.8,    // 빠르게 녹슬음
    durability: 0.7,    // 중간 내구성
    weight: 1.5,        // 무거움
    corrosion: 0.9      // 매우 부식되기 쉬움
  },
  'w': { // Wire - 와이어
    name: 'Wire',
    agingSpeed: 3.0,    // 매우 빠르게 노후화
    durability: 0.2,    // 매우 부서지기 쉬움
    weight: 0.3,        // 매우 가벼움
    corrosion: 0.8      // 부식되기 쉬움
  },
  'h': { // Hazard - 위험물
    name: 'Hazard',
    agingSpeed: 2.5,    // 빠르게 노후화
    durability: 0.5,    // 중간 내구성
    weight: 1.1,        // 약간 무거움
    corrosion: 0.7      // 부식되기 쉬움
  }
};

// 안전한 텍스처 로딩 - 파일이 없어도 오류 없이 진행
function safeLoadTexture(path) {
  return new Promise(resolve => {
    textureLoader.load(
      path,
      // 성공: 텍스처 설정 후 반환
      (tex) => { 
        tex.colorSpace = THREE.SRGBColorSpace; 
        tex.anisotropy = maxAnisotropy; 
        resolve(tex); 
      },
      // 진행 중: 무시
      undefined,
      // 실패: null 반환하여 메테리얼이 텍스처 없이 생성되도록 함
      (error) => { 
        console.log(`Texture not available: ${path}`);
        resolve(null); 
      }
    );
  });
}

async function createMaterialSet(name, isGlass, isWire) {
  const materialSet = {};
  const properties = blockProperties[name];
  
  // properties가 없으면 기본값 사용
  if (!properties) {
    console.error(`Block properties not found for: ${name}`);
    return materialSet;
  }
  
  for (let i = 1; i <= 5; i++) {
    // 텍스처 로딩 시도 (파일이 없으면 null 반환되어 무시됨)
    const colorMap = await safeLoadTexture(`textures/${name}${i}.jpg`);
    const normalMap = await safeLoadTexture(`textures/${name}_normal.jpg`);
    const roughnessMap = await safeLoadTexture(`textures/${name}_rough.jpg`);
    const metalnessMap = await safeLoadTexture(`textures/${name}_metal.jpg`);
    const alphaMap = (isWire || isGlass) ? await safeLoadTexture(`textures/${name}_alpha.jpg`) : null;

    // Wire 타입일 때만 텍스처 반복 설정 (텍스처가 있을 경우에만)
    if (isWire) {
      const scale = 0.5;
      [colorMap, normalMap, roughnessMap, metalnessMap, alphaMap].forEach(tex => {
        if (tex) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(scale, scale);
        }
      });
    }

    // 노후화 단계에 따른 메테리얼 속성 변화
    const agingProgress = (i - 1) / 4; // 0.0 ~ 1.0
    const metalness = isGlass ? 0.3 : isWire ? 1.0 : (0.7 + agingProgress * 0.3);
    const roughness = isGlass ? 0.1 : isWire ? 0.2 : (0.6 + agingProgress * 0.4);
    
    // 메테리얼 생성 - 텍스처가 없어도 기본 속성으로 작동
    const materialConfig = {
      metalness: metalness,
      roughness: roughness,
      transparent: isGlass || isWire,
      opacity: 1.0,
      envMapIntensity: isGlass ? 1.5 : isWire ? 1.5 : (0.4 + agingProgress * 0.6),
      side: (isWire || isGlass) ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: (isWire || isGlass) ? false : true,
      alphaTest: (isWire || isGlass) ? 0.1 : 0,
    };
    
    // 텍스처가 있으면 추가 (없으면 자동으로 무시됨)
    if (colorMap) materialConfig.map = colorMap;
    if (normalMap) materialConfig.normalMap = normalMap;
    if (roughnessMap) materialConfig.roughnessMap = roughnessMap;
    if (metalnessMap) materialConfig.metalnessMap = metalnessMap;
    if (alphaMap) materialConfig.alphaMap = alphaMap;
    if (envMap) materialConfig.envMap = envMap;
    
    materialSet[`s${i}`] = new THREE.MeshStandardMaterial(materialConfig);
  }
  return materialSet;
}

let materials = {};
let isAssetsLoaded = false;

// 게임 초기화 함수 (loadAssets에서 호출됨)
function initializeGame() {
  isAssetsLoaded = true;
  console.log("Game ready to start.");
  console.log("Materials available:", Object.keys(materials));

  const startScreen = document.getElementById('start-screen');
  if (!startScreen) {
    console.error("Start screen element not found!");
    return;
  }
  
  startScreen.style.opacity = 1;
  startScreen.addEventListener('click', () => {
    if (listener.context.state === 'suspended') {
      listener.context.resume();
    }
    
    startScreen.style.opacity = 0;
    setTimeout(() => startScreen.style.display = 'none', 1000);
    
    try {
      if (!bgmNature.isPlaying) bgmNature.play();
      if (!bgmCity.isPlaying) bgmCity.play();
    } catch (error) {
      // BGM 재생 실패는 무시
    }
    
    // 게임 시작 상태 설정 및 첫 블록 생성
    gameRunning = true;
    gameStartTime = performance.now();
    lastGravityCollapseTime = gameStartTime;
    isGravityCollapsing = false;
    resetPlayer();
    animate(); // 애니메이션 루프 시작

  }, { once: true });
}

async function loadAssets() {
  await Promise.all(materialNames.map(async name => {
    const isGlass = name === 'g';
    const isWire = name === 'w';
    materials[name] = await createMaterialSet(name, isGlass, isWire);
  }));
  console.log("Materials loaded:", Object.keys(materials));
  
  // 머티리얼 로딩 완료 후 게임 초기화
  initializeGame();
}

// DOM 로드 완료 후 에셋 로딩 시작
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, starting asset loading...");
    loadAssets();
  });
} else {
  // DOM이 이미 로드된 경우 즉시 실행
  console.log("DOM already loaded, starting asset loading...");
  loadAssets();
}

// --- 사운드 로드 (선택사항) ---
// 사운드 파일이 없어도 게임은 정상 작동함
soundNames.forEach(name => {
  audioLoader.load(`sounds/${name}.ogg`, buffer => { 
    const sound = new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sounds[name] = sound;
  }, undefined, () => {
    // 사운드 파일이 없어도 무음으로 정상 진행
  });
});

audioLoader.load('sounds/bgm_nature.ogg', buffer => { 
  bgmNature.setBuffer(buffer); 
  bgmNature.setLoop(true); 
  bgmNature.setVolume(0.5); // 시작 시 자연 소리 100%
}, undefined, () => {
  // BGM 파일이 없어도 무음으로 정상 진행
});

audioLoader.load('sounds/bgm_city.ogg', buffer => { 
  bgmCity.setBuffer(buffer); 
  bgmCity.setLoop(true); 
  bgmCity.setVolume(0); // 시작 시 도시 소리 0%
}, undefined, () => {
  // BGM 파일이 없어도 무음으로 정상 진행
});

// --- 게임 로직 ---
let board = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
const playerGroup = new THREE.Group();
scene.add(playerGroup);
const player = { pos: { x: 0, y: 0 }, shape: null, materialName: '', shapeWithIDs: null, originalWidth: 0, originalHeight: 0 };

const SHAPES = [
  null,
  [[1,1,1,1]],
  [[1,1],[1,1]],
  [[0,1,0],[1,1,1]],
  [[0,0,1],[1,1,1]],
  [[1,0,0],[1,1,1]],
  [[0,1,1],[1,1,0]],
  [[1,1,0],[0,1,1]],
];

let fallingBlocks = [];
let sandBlocks = [];
let gameRunning = false;
let gameStartTime = 0; // 게임 시작 시간
let lastGravityCollapseTime = 0; // 마지막 중력 붕괴 시간
let isGravityCollapsing = false; // 중력 붕괴 중인지 여부

// 성능 최적화를 위한 변수
let lastPerformanceCheck = 0;
let frameCount = 0;
let lastFrameTime = 0;

function rotateShape(shape) { 
  return shape[0].map((_, i) => shape.map(r => r[i])).reverse(); 
}

function createShapeWithIDs(shape) {
  let id = 0;
  const result = [];
  for (let y = 0; y < shape.length; y++) {
    const row = [];
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        row.push({ id: id++, originalX: x, originalY: y });
      } else {
        row.push(null);
      }
    }
    result.push(row);
  }
  return result;
}

function rotateShapeWithIDs(shape) {
  return shape[0].map((_, i) => shape.map(r => r[i]).reverse());
}

function hardDrop() {
  if (!player.shape || !gameRunning) return;
  
  while (true) {
    const nextPos = { x: player.pos.x, y: player.pos.y - 1 };
    if (!isValidMove(nextPos, player.shape, player.shapeWithIDs)) break;
    player.pos = nextPos;
  }
  
  mergeToBoard();
  
  if (gameRunning) {
    resetPlayer();
  }
}

function isValidMove(pos, shape, shapeWithIDs = null) {
  const checkShape = shapeWithIDs || shape;
  
  for (let y = 0; y < checkShape.length; y++) {
    for (let x = 0; x < checkShape[y].length; x++) {
      const hasBlock = shapeWithIDs ? (checkShape[y][x] !== null) : checkShape[y][x];
      
      if (!hasBlock) continue;
      
      const bx = Math.floor(pos.x + x);
      // ✅ FIX: y좌표 계산 시 Math.floor()가 정확히 적용되도록 수정
      const by = Math.floor(pos.y - y); 
      
      if (bx < 0 || bx >= GRID_WIDTH || by < 0) return false;
      // ✅ FIX: board[by]가 undefined일 경우를 대비한 안전장치 추가
      if (by < GRID_HEIGHT && board[by] && board[by][bx]) return false;
    }
  }
  return true;
}

function resetPlayer() {
  if (!isAssetsLoaded) {
    return;
  }
  
  const matKeys = Object.keys(materials);
  if (matKeys.length === 0) {
    return;
  }
  
  const shapeIndex = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
  const originalShape = SHAPES[shapeIndex];
  
  player.originalWidth = originalShape[0].length;
  player.originalHeight = originalShape.length;
  player.shapeWithIDs = createShapeWithIDs(originalShape);
  player.shape = originalShape.map(row => row.map(cell => cell ? 1 : 0));
  player.materialName = matKeys[Math.floor(Math.random() * matKeys.length)];
  // ... player.pos 설정 직후
player.pos = { 
  x: Math.floor(GRID_WIDTH / 2) - Math.ceil(player.shape[0].length / 2), 
  y: GRID_HEIGHT - 1
};

// ✅ 게임 오버 판정 로직 추가
if (!isValidMove(player.pos, player.shape, player.shapeWithIDs)) {
    console.log("Game Over");
    triggerCollapse(); // 모든 블록을 무너뜨리는 함수 호출
    return; // 함수 종료
}

updatePlayerGroupVisuals();
}

function updatePlayerGroupVisuals() {
  playerGroup.clear();
  if (!player.shape) {
    return;
  }
  if (!materials[player.materialName]) {
    return;
  }
  
  const shapeHeight = player.shapeWithIDs.length;
  const shapeWidth = player.shapeWithIDs[0].length;
  const maxSize = Math.max(player.originalWidth, player.originalHeight);
  
  for (let y = 0; y < shapeHeight; y++) {
    for (let x = 0; x < shapeWidth; x++) {
      const cell = player.shapeWithIDs[y][x];
      if (!cell) continue;
      
      const cubeMat = materials[player.materialName]['s1'].clone();
      const cubeGeometry = geometry.clone();
      const uvAttribute = cubeGeometry.attributes.uv;
      
      for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i);
        const v = uvAttribute.getY(i);
        const newU = (cell.originalX + u) / maxSize;
        const newV = (cell.originalY + v) / maxSize;
        uvAttribute.setXY(i, newU, newV);
      }
      uvAttribute.needsUpdate = true;
      
      const cube = new THREE.Mesh(cubeGeometry, cubeMat);
      cube.castShadow = true;
      cube.receiveShadow = true;
      cube.position.set(x * CELL_SIZE, -y * CELL_SIZE, 0);
      playerGroup.add(cube);
    }
  }
}

function mergeToBoard() {
  if (!player.shape) return;
  
  const materialMap = { 
    c: 'concrete', b: 'brick', d: 'diamond', 
    g: 'glass', i: 'iron', w: 'wire', h: 'hazard' 
  };
  const materialName = player.materialName;
  const shapeHeight = player.shapeWithIDs.length;
  const shapeWidth = player.shapeWithIDs[0].length;
  const maxSize = Math.max(player.originalWidth, player.originalHeight);

  for (let y = 0; y < shapeHeight; y++) {
    for (let x = 0; x < shapeWidth; x++) {
      const cell = player.shapeWithIDs[y][x];
      if (!cell) continue;
      
      const bx = Math.floor(player.pos.x + x);
      const by = Math.floor(player.pos.y - y);
      
      if (bx < 0 || bx >= GRID_WIDTH || by < 0) continue;
      
    

      const cubeMat = materials[materialName]['s1'].clone();
      const cubeGeometry = geometry.clone();
      const uvAttribute = cubeGeometry.attributes.uv;
      
      for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i);
        const v = uvAttribute.getY(i);
        const newU = (cell.originalX + u) / maxSize;
        const newV = (cell.originalY + v) / maxSize;
        uvAttribute.setXY(i, newU, newV);
      }
      uvAttribute.needsUpdate = true;
      
      const mesh = new THREE.Mesh(cubeGeometry, cubeMat);
      mesh.position.set(
        (bx - (GRID_WIDTH - 1) / 2) * CELL_SIZE, 
        (by - GRID_HEIGHT / 2) * CELL_SIZE, 
        0
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      board[by][bx] = { 
        mesh: mesh,
        materialName: materialName,
        age: 1,
        createdTime: performance.now(),
        originalUV: { x: cell.originalX, y: cell.originalY, maxSize: maxSize },
        shapeWidth: shapeWidth,
        shapeHeight: shapeHeight,
        properties: blockProperties[materialName] // 블록의 고유 성질 저장
      };
      landedCubes.add(mesh);
    }
  }

  if (sounds[materialMap[materialName]]) {
    try {
      const soundClone = sounds[materialMap[materialName]].clone();
      soundClone.play();
    } catch (error) {}
  }
  
  player.shape = null;
  player.shapeWithIDs = null;
  playerGroup.clear();
}

// 게임오버 단계
let gameOverPhase = 'none'; // 'none', 'gravity', 'settled', 'disappearing', 'restarting'
let disappearingBlocks = [];
let disappearTimer = 0;

function triggerCollapse() {
  gameRunning = false;
  gameOverPhase = 'gravity';
  
  // 플레이어 블록 제거
  player.shape = null;
  player.shapeWithIDs = null;
  playerGroup.clear();
  
  // 1단계: 모든 블록에 중력 적용
  const now = performance.now();
  const allBlocks = [];
  
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (board[y][x]) {
        allBlocks.push({ x, y, block: board[y][x] });
      }
    }
  }
  
  // 블록을 보드에서 제거하고 sandBlocks에 추가
  allBlocks.forEach(({ x, y, block }, index) => {
    const mesh = block.mesh;
    
    // landedCubes에서 제거하고 scene에 직접 추가
    landedCubes.remove(mesh);
    scene.add(mesh);
    
    sandBlocks.push({
      mesh: mesh,
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      startTime: now + index * 3, // 아주 짧은 딜레이로 순차적으로
      lifetime: 20000,
      materialName: block.materialName,
      age: block.age,
      createdTime: block.createdTime,
      originalUV: block.originalUV,
      shapeWidth: block.shapeWidth,
      shapeHeight: block.shapeHeight,
      properties: block.properties,
      isGravityCollapse: true,
      hasStarted: false,
      isGameOver: true // 게임오버 블록 표시
    });
    
    board[y][x] = null;
  });
  
  console.log(`Game Over: ${allBlocks.length} blocks falling with gravity`);
}

function applyGravityToAllBlocks() {
  const now = performance.now();
  isGravityCollapsing = true;
  
  // 현재 플레이어 블록 제거
  player.shape = null;
  player.shapeWithIDs = null;
  playerGroup.clear();
  
  // 모든 블록을 한번에 아래로 이동시키는 새로운 시스템
  // 먼저 기존 sandBlocks 배열을 비움
  sandBlocks = [];
  
  // 모든 블록의 원래 위치를 저장하고 그리드에서 제거
  const allBlocks = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!board[y][x]) continue;
      
      const block = board[y][x];
      allBlocks.push({
        mesh: block.mesh,
        gridX: x,
        gridY: y,
        materialName: block.materialName,
        age: block.age,
        createdTime: block.createdTime,
        originalUV: block.originalUV,
        shapeWidth: block.shapeWidth,
        shapeHeight: block.shapeHeight
      });
      
      board[y][x] = null; // 그리드에서 제거
    }
  }
  
  // 성능 최적화: 너무 많은 블록이 처리되지 않도록 제한
  const maxBlocks = Math.min(allBlocks.length, MAX_SAND_BLOCKS);
  
  // 모든 블록을 sandBlocks에 추가하되, 각 블록의 성질에 맞게 설정
  for (let i = 0; i < maxBlocks; i++) {
    const blockData = allBlocks[i];
    const mesh = blockData.mesh;
    const properties = blockProperties[blockData.materialName];
    landedCubes.remove(mesh);
    
    // 블록의 무게에 따른 초기 속도 조정
    const weightMultiplier = properties.weight;
    const durabilityMultiplier = 1.0 / properties.durability; // 내구성이 낮을수록 더 불안정
    
    sandBlocks.push({
      mesh: mesh,
      velocity: { 
        x: (Math.random() - 0.5) * 0.005 * durabilityMultiplier, // 내구성에 따른 수평 움직임
        y: -0.01 * weightMultiplier, // 무게에 따른 떨어지는 속도
        z: (Math.random() - 0.5) * 0.005 * durabilityMultiplier 
      },
      rotation: {
        x: (Math.random() - 0.5) * 0.008 * durabilityMultiplier,
        y: (Math.random() - 0.5) * 0.008 * durabilityMultiplier,
        z: (Math.random() - 0.5) * 0.008 * durabilityMultiplier
      },
      startTime: now + (i * 10), // 매우 작은 딜레이로 순차적 시작
      lifetime: 15000,
      materialName: blockData.materialName,
      age: blockData.age,
      createdTime: blockData.createdTime,
      originalUV: blockData.originalUV,
      shapeWidth: blockData.shapeWidth,
      shapeHeight: blockData.shapeHeight,
      isFragment: false,
      isGravityCollapse: true,
      gridPosition: { x: blockData.gridX, y: blockData.gridY },
      hasStarted: false,
      properties: properties // 블록의 성질 저장
    });
  }
}

// 메모리 정리 최적화 함수
function disposeMesh(mesh) {
  if (!mesh) return;
  
  scene.remove(mesh);
  if (mesh.parent) mesh.parent.remove(mesh);
  
  if (mesh.geometry) {
    mesh.geometry.dispose();
  }
  
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => {
        if (mat.map) mat.map.dispose();
        if (mat.normalMap) mat.normalMap.dispose();
        if (mat.roughnessMap) mat.roughnessMap.dispose();
        if (mat.metalnessMap) mat.metalnessMap.dispose();
        mat.dispose();
      });
    } else {
      if (mesh.material.map) mesh.material.map.dispose();
      if (mesh.material.normalMap) mesh.material.normalMap.dispose();
      if (mesh.material.roughnessMap) mesh.material.roughnessMap.dispose();
      if (mesh.material.metalnessMap) mesh.material.metalnessMap.dispose();
      mesh.material.dispose();
    }
  }
}

const clock = new THREE.Clock();
let animateStarted = false;

function animate() {
  if (!animateStarted) {
    console.log("Animate function started!");
    animateStarted = true;
  }
  
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();
  const now = performance.now();

  // 성능 모니터링
  frameCount++;
  if (now - lastPerformanceCheck > PERFORMANCE_CHECK_INTERVAL) {
    lastPerformanceCheck = now;
    frameCount = 0;
  }

  // BGM 크로스페이드: 블록 개수에 따라 자연↔도시 사운드 전환
  if (gameRunning || gameOverPhase !== 'none') {
    // 보드에 있는 블록 개수 계산
    let blockCount = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (board[y][x]) blockCount++;
      }
    }
    
    // 최대 블록 수 (대략적인 기준)
    const maxBlocks = GRID_WIDTH * GRID_HEIGHT * 0.3; // 그리드의 30%가 차면 완전히 도시 사운드
    const blockRatio = Math.min(blockCount / maxBlocks, 1.0); // 0.0 ~ 1.0
    
    // 볼륨 계산 (자연: 1→0, 도시: 0→1)
    const natureVolume = (1 - blockRatio) * 0.5; // 최대 0.5
    const cityVolume = blockRatio * 0.5; // 최대 0.5
    
    // 부드러운 전환을 위해 서서히 변경
    if (bgmNature.getVolume) {
      const currentNatureVol = bgmNature.getVolume();
      const currentCityVol = bgmCity.getVolume();
      const lerpSpeed = 0.02; // 전환 속도
      
      bgmNature.setVolume(currentNatureVol + (natureVolume - currentNatureVol) * lerpSpeed);
      bgmCity.setVolume(currentCityVol + (cityVolume - currentCityVol) * lerpSpeed);
    }
  }

  const gameOverGravity = -0.018;
  
  for (let i = fallingBlocks.length - 1; i >= 0; i--) {
    const b = fallingBlocks[i];
    if (now < b.startTime) continue;
    
    const elapsed = now - b.startTime;
    const progress = elapsed / b.lifetime;
    
    if (progress >= 1) {
      // 메모리 정리 최적화
      disposeMesh(b.mesh);
      fallingBlocks.splice(i, 1);
      
      if (fallingBlocks.length === 0) {
        board = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
        while(landedCubes.children.length > 0) {
          landedCubes.remove(landedCubes.children[0]);
        }
        setTimeout(() => {
          gameRunning = true;
          gameStartTime = performance.now();
          lastGravityCollapseTime = performance.now();
          isGravityCollapsing = false;
          resetPlayer();
        }, 1000);
      }
      continue;
    }
    
    b.velocity.y += gameOverGravity;
    b.mesh.position.x += b.velocity.x;
    b.mesh.position.y += b.velocity.y;
    b.mesh.position.z += b.velocity.z;
    b.mesh.rotation.x += b.rotation.x;
    b.mesh.rotation.y += b.rotation.y;
    b.mesh.rotation.z += b.rotation.z;
    
    if (progress > 0.4) {
      const fadeProgress = (progress - 0.4) / 0.6;
      const opacity = 1 - Math.pow(fadeProgress, 2);
      b.mesh.material.opacity = Math.max(0, opacity);
    }
  }

  // 플레이어 이동 (중력 붕괴 중이 아닐 때만)
  if (gameRunning && player.shape && !isGravityCollapsing) {
    const nextPos = { x: player.pos.x, y: player.pos.y - NORMAL_DROP_SPEED * deltaTime };
    
    if (isValidMove(nextPos, player.shape, player.shapeWithIDs)) {
      player.pos = nextPos;
    } else {
      mergeToBoard();
      if (gameRunning && !isGravityCollapsing) {
        setTimeout(() => {
          if (gameRunning && !isGravityCollapsing) resetPlayer();
        }, 0);
      }
    }

    const offsetX = (GRID_WIDTH - 1) / 2;
    const offsetY = GRID_HEIGHT / 2;
    const newX = (player.pos.x - offsetX) * CELL_SIZE;
    const newY = (player.pos.y - offsetY) * CELL_SIZE;
    playerGroup.position.set(newX, newY, 0);
  }

  // 정기적인 중력 붕괴 체크
  if (gameRunning && !isGravityCollapsing) {
    const timeSinceLastCollapse = now - lastGravityCollapseTime;
    if (timeSinceLastCollapse >= GRAVITY_COLLAPSE_INTERVAL) {
      lastGravityCollapseTime = now;
      applyGravityToAllBlocks();
    }
  }

  if (gameRunning) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const block = board[y][x];
        if (!block) continue;

        const elapsedTime = now - block.createdTime;
        const properties = block.properties;
        
        // 각 블록의 고유한 노후화 속도 적용
        const effectiveAgingInterval = AGING_INTERVAL / (properties.agingSpeed * properties.durability);
        const newAge = Math.min(5, Math.floor(elapsedTime / effectiveAgingInterval) + 1);

        // 노후도가 변경되었으면 머티리얼 교체
        if (newAge !== block.age && materials[block.materialName] && materials[block.materialName][`s${newAge}`]) {
          block.age = newAge;
          const newMaterial = materials[block.materialName][`s${newAge}`].clone();
          
          if (newMaterial && block.mesh) {
            // 기존 머티리얼 정리
            block.mesh.material.dispose();
            block.mesh.material = newMaterial;
            
            // 노후화에 따른 추가 효과는 텍스처로 처리됨
          }
        }
      }
    }
  }
  
  const sandGravity = -0.007; // 중력을 훨씬 느리게 설정
  
  for (let i = sandBlocks.length - 1; i >= 0; i--) {
    const s = sandBlocks[i];
    
    // 딜레이 체크
    if (now < s.startTime) continue;
    
    // 애니메이션이 처음 시작될 때 처리
    if (!s.hasStarted && s.isGravityCollapse) {
      s.hasStarted = true;
      // 그리드에서 이미 제거되었으므로 추가 처리 불필요
    }
    
    const elapsed = now - s.startTime;
    const progress = elapsed / s.lifetime;
    
    // 중력 붕괴 블록의 경우 약간의 지연 후 떨어지기 시작
    if (s.isGravityCollapse && elapsed < 200) {
      // 처음 200ms는 제자리에서 약간 흔들리는 효과
      const originalPos = s.mesh.position;
      s.mesh.position.x = originalPos.x + Math.sin(elapsed * 0.02) * 0.1;
      s.mesh.position.y = originalPos.y + Math.sin(elapsed * 0.025) * 0.05;
      continue;
    }
    
    // 블록의 무게에 따른 중력 적용
    const weightMultiplier = s.properties ? s.properties.weight : 1.0;
    s.velocity.y += sandGravity * weightMultiplier;
    s.mesh.position.x += s.velocity.x;
    s.mesh.position.y += s.velocity.y;
    s.mesh.position.z += s.velocity.z;
    s.mesh.rotation.x += s.rotation.x;
    s.mesh.rotation.y += s.rotation.y;
    s.mesh.rotation.z += s.rotation.z;
    
    if (s.isFragment) {
      s.mesh.material.opacity = 1 - progress;
      
      if (progress >= 1) {
        disposeMesh(s.mesh);
        sandBlocks.splice(i, 1);
      }
      continue;
    }
    
    if (s.velocity.y < 0) {
      const currentGridX = Math.round((s.mesh.position.x + (GRID_WIDTH - 1) / 2 * CELL_SIZE) / CELL_SIZE);
      const currentGridY = Math.round((s.mesh.position.y + GRID_HEIGHT / 2 * CELL_SIZE) / CELL_SIZE);
      
      if (currentGridX >= 0 && currentGridX < GRID_WIDTH && currentGridY >= 0 && currentGridY < GRID_HEIGHT) {
        const canLand = (currentGridY === 0) || (currentGridY > 0 && board[currentGridY - 1][currentGridX] !== null);
        const isSpotEmpty = board[currentGridY][currentGridX] === null;
        
        if (canLand && isSpotEmpty && Math.abs(s.velocity.y) < 3) {
          s.mesh.position.set(
            (currentGridX - (GRID_WIDTH - 1) / 2) * CELL_SIZE,
            (currentGridY - GRID_HEIGHT / 2) * CELL_SIZE,
            0
          );
          s.mesh.rotation.set(0, 0, 0);
          
          if (s.mesh.material) {
            s.mesh.material.opacity = 1.0;
            s.mesh.material.transparent = false;
          }
          
          board[currentGridY][currentGridX] = {
            mesh: s.mesh,
            materialName: s.materialName,
            age: s.age,
            createdTime: s.createdTime,
            originalUV: s.originalUV,
            shapeWidth: s.shapeWidth,
            shapeHeight: s.shapeHeight,
            properties: s.properties || blockProperties[s.materialName],
            isGameOver: s.isGameOver || false // 게임오버 블록인지 표시
          };
          
          // scene에서 제거하고 landedCubes에 추가
          scene.remove(s.mesh);
          landedCubes.add(s.mesh);
          sandBlocks.splice(i, 1);
          continue;
        }
      }
    }
    
    if (progress >= 1 || s.mesh.position.y < -150) {
      disposeMesh(s.mesh);
      sandBlocks.splice(i, 1);
    }
  }

  // 모든 sandBlocks가 처리되었으면 중력 붕괴 종료
  if (isGravityCollapsing && sandBlocks.length === 0) {
    isGravityCollapsing = false;
    
    // 게임 재시작을 위한 약간의 지연
    setTimeout(() => {
      if (gameRunning) {
        resetPlayer();
      }
    }, 500);
  }

  // 게임오버 단계 처리
  if (gameOverPhase === 'gravity' && sandBlocks.length === 0) {
    // 중력 단계 완료 -> 안착 확인 단계로 전환
    gameOverPhase = 'settled';
    disappearTimer = now + 500; // 0.5초 대기 후 사라지기 시작
    console.log("All blocks settled, preparing to disappear...");
  }
  
  if (gameOverPhase === 'settled' && now >= disappearTimer) {
    // 안착 완료 -> 사라지기 시작
    gameOverPhase = 'disappearing';
    
    // 보드에서 게임오버 블록들을 찾아서 위에서부터 순서대로 정렬
    for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (board[y][x] && board[y][x].isGameOver) {
          disappearingBlocks.push({
            x: x,
            y: y,
            block: board[y][x],
            disappearTime: now + (GRID_HEIGHT - 1 - y) * 80 // 위에서부터 순차적으로
          });
        }
      }
    }
    console.log(`Starting to disappear ${disappearingBlocks.length} blocks from top to bottom`);
  }
  
  if (gameOverPhase === 'disappearing') {
    let allDisappeared = true;
    
    for (let i = disappearingBlocks.length - 1; i >= 0; i--) {
      const item = disappearingBlocks[i];
      
      if (now >= item.disappearTime) {
        // 블록 사라지는 애니메이션
        const elapsed = now - item.disappearTime;
        const fadeOutDuration = 300;
        
        if (elapsed < fadeOutDuration) {
          const opacity = 1 - (elapsed / fadeOutDuration);
          if (item.block.mesh && item.block.mesh.material) {
            const mat = item.block.mesh.material;
            if (!mat.transparent) {
              mat.transparent = true;
            }
            mat.opacity = opacity;
          }
          allDisappeared = false;
        } else {
          // 완전히 사라짐
          if (item.block.mesh) {
            landedCubes.remove(item.block.mesh);
            disposeMesh(item.block.mesh);
          }
          board[item.y][item.x] = null;
          disappearingBlocks.splice(i, 1);
        }
      } else {
        allDisappeared = false;
      }
    }
    
    if (allDisappeared && disappearingBlocks.length === 0) {
      // 모든 블록이 사라짐 -> 재시작 단계
      gameOverPhase = 'restarting';
      console.log("All blocks disappeared, restarting game...");
      
      setTimeout(() => {
        gameOverPhase = 'none';
        gameRunning = true;
        gameStartTime = performance.now();
        lastGravityCollapseTime = performance.now();
        isGravityCollapsing = false;
        resetPlayer();
      }, 500);
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (event) => {
  if (!player.shape || !gameRunning) return;
  
  switch (event.code) {
    case 'ArrowLeft': {
      const next = { x: player.pos.x - 1, y: player.pos.y };
      if (isValidMove(next, player.shape)) player.pos = next;
      break;
    }
    case 'ArrowRight': {
      const next = { x: player.pos.x + 1, y: player.pos.y };
      if (isValidMove(next, player.shape)) player.pos = next;
      break;
    }
    case 'ArrowDown': {
      const next = { x: player.pos.x, y: player.pos.y - 1 };
      if (isValidMove(next, player.shape)) player.pos = next;
      break;
    }
    case 'ArrowUp': {
      const rotated = rotateShape(player.shape);
      const rotatedWithIDs = rotateShapeWithIDs(player.shapeWithIDs);
      if (isValidMove(player.pos, rotated)) {
        player.shape = rotated;
        player.shapeWithIDs = rotatedWithIDs;
        updatePlayerGroupVisuals();
      }
      break;
    }
    case 'Space': {
      hardDrop();
      break;
    }
  }
});