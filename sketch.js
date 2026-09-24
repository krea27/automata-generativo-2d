/**
 * Autómata 2D Generativo con Morfismo Continuo de Imágenes
 * Optimizado para 3 imágenes (img/1.png, img/2.png, img/3.png)
 * Máxima nitidez, desplazamiento fluido y aceleración por tablas precalculadas (LUT)
 */

// Opciones de resolución de simulación
const RESOLUTION_MODES = [
  { val: 2, label: 'Alta Nitidez (2px)' },
  { val: 3, label: 'Equilibrado (3px)' },
  { val: 1, label: 'Ultra Máxima (1px)' }
];
let currentResIndex = 0;
let resolution = RESOLUTION_MODES[currentResIndex].val;

let cols, rows;

// Grillas de simulación numérica (Float32Array)
let gridR, nextR;
let gridG, nextG;
let gridB, nextB;

// Buffer de renderizado p5.Image
let caImage;

// Selección de las 3 mejores imágenes para máxima velocidad y ligereza
const LOCAL_IMAGE_PATHS = [
  'img/1.png',
  'img/6.png',
  'img/3.png'
];

let rawImages = [];
let imagesList = []; 
let currentIndex = 0;
let nextIndex = 1;

// Parámetros de simulación, onda y deformación líquida
let decay = 1.1;               // Decaimiento de energía
let cycleDuration = 6.0;       // Segundos por flor
let cycleTimer = 0;
let isPaused = false;
let brushRadius = 50;          // Radio del pincel
let fluidWarpFactor = 1.0;     // Intensidad del desplazamiento líquido

// Modos de Color
const COLOR_MODES = ['Color RGB Original', 'Neón / Ciber', 'Magma / Fuego', 'Blanco y Negro Orgánico'];
let currentModeIndex = 0;

// Estado de UI
let uiVisible = true;

// =========================================================================
// AUDIO INTERACTIVO FX (Lista de canciones)
// =========================================================================
// Puedes agregar todas las canciones que quieras de tu carpeta 'sonido/':
const LOCAL_AUDIO_PATHS = [
  { name: 'Dark Drone', path: 'sonido/dark.wav' }
  // Para agregar más, ponlas en 'sonido/' y descomenta o agrega líneas aquí:
  // { name: 'Pista 2', path: 'sonido/cancion2.mp3' },
  // { name: 'Pista 3', path: 'sonido/cancion3.wav' }
];

let audioList = []; // Array de { name: string, sound: p5.SoundFile }
let currentAudioIndex = 0;
let soundEnabled = true;
let masterVolume = 0.8;
let audioStarted = false;

// =========================================================================
// TABLA PRECALCULADA (LUT) PARA ONDAS SUAVES (Rendimiento extremo)
// =========================================================================
const LUT_SIZE = 1024;
const LUT_SMOOTH_FOLD = new Float32Array(LUT_SIZE);

(function buildLUT() {
  for (let i = 0; i < LUT_SIZE; i++) {
    let m = i % 512;
    let tri = m < 256 ? m : 512 - m;
    let n = tri * 0.0039215686; // / 255.0
    // Curva cúbica suave (Hermite / Smoothstep)
    LUT_SMOOTH_FOLD[i] = (n * n * (3.0 - 2.0 * n)) * 255.0;
  }
})();

// =========================================================================
// PRELOAD
// =========================================================================
function preload() {
  // Cargar lista de pistas de audio
  for (let i = 0; i < LOCAL_AUDIO_PATHS.length; i++) {
    let item = LOCAL_AUDIO_PATHS[i];
    let snd = loadSound(
      item.path,
      () => {
        console.log(`Audio cargado con éxito: ${item.name}`);
        updateAudioLabel();
      },
      (err) => {
        console.warn(`No se pudo precargar audio ${item.path}`, err);
      }
    );
    audioList.push({ name: item.name, sound: snd });
  }

  // Cargar las 3 imágenes seleccionadas
  for (let i = 0; i < LOCAL_IMAGE_PATHS.length; i++) {
    rawImages[i] = loadImage(
      LOCAL_IMAGE_PATHS[i],
      () => {},
      (err) => {
        console.warn(`No se pudo precargar ${LOCAL_IMAGE_PATHS[i]}`);
      }
    );
  }
}

// =========================================================================
// SETUP
// =========================================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  initDimensions();

  // Cargar las 3 imágenes
  let loadedCount = 0;
  for (let i = 0; i < rawImages.length; i++) {
    let img = rawImages[i];
    if (img && img.width > 1) {
      let flowerNum = LOCAL_IMAGE_PATHS[i].replace('img/', '').replace('.png', '');
      addLoadedImage(img, `Flor ${flowerNum}`);
      loadedCount++;
    }
  }

  if (loadedCount === 0) {
    generateProceduralDefaults();
  }

  setupUIEvents();
  setupDragAndDrop();

  seedCurrentToNext(0, imagesList.length > 1 ? 1 : 0);
}

function initDimensions() {
  cols = floor(width / resolution);
  rows = floor(height / resolution);

  let numCells = cols * rows;
  gridR = new Float32Array(numCells);
  nextR = new Float32Array(numCells);
  gridG = new Float32Array(numCells);
  nextG = new Float32Array(numCells);
  gridB = new Float32Array(numCells);
  nextB = new Float32Array(numCells);

  caImage = createImage(cols, rows);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  rebuildAtCurrentResolution();
}

function rebuildAtCurrentResolution() {
  initDimensions();
  for (let item of imagesList) {
    if (item.sourceImg) {
      item.data = resampleP5Image(item.sourceImg);
    }
  }
  seedCurrentToNext(currentIndex, nextIndex);
}

// =========================================================================
// BUCLE PRINCIPAL (DRAW)
// =========================================================================
function draw() {
  let dt = min(deltaTime / 1000, 0.1);

  if (!isPaused && imagesList.length > 0) {
    cycleTimer += dt;
    if (imagesList.length > 1) {
      if (cycleTimer >= cycleDuration) {
        cycleTimer = 0;
        currentIndex = nextIndex;
        nextIndex = (nextIndex + 1) % imagesList.length;
        updateBadge();
      }
    }
  }

  let progress = 0;
  if (imagesList.length > 1) {
    progress = cycleTimer / cycleDuration;
  } else if (imagesList.length === 1) {
    // Si hay una sola imagen, generamos una respiración ondulante continua
    progress = (sin(cycleTimer * 1.5) * 0.5 + 0.5) * 0.45;
  }

  // Actualizar indicador durante el morfismo
  if (progress > 0.65 && imagesList.length > 1) {
    let badge = document.getElementById('image-badge');
    if (badge) {
      let pct = Math.round(progress * 100);
      badge.textContent = `${imagesList[currentIndex].name} ➔ ${imagesList[nextIndex].name} (${pct}%)`;
    }
  }

  // 1. Simulación numérica del autómata celular
  stepAutomata(progress);

  // 2. Renderizado optimizado con desplazamiento fluido
  renderWithOrganicDisplacement(progress);

  // 3. Filtrado bilineal por hardware para eliminar cualquier pixelación
  smooth();
  image(caImage, 0, 0, width, height);

  // 4. Pincel con el mouse
  handleMouseInteraction();
}

// =========================================================================
// SIMULACIÓN CELULAR (DIFUSIÓN Y ONDAS)
// =========================================================================
function stepAutomata(progress) {
  let currData = imagesList[currentIndex]?.data;
  let nextData = imagesList[nextIndex]?.data;

  let morphWeight = 0;
  let injectStrength = 0.04;

  if (progress > 0.65) {
    morphWeight = map(progress, 0.65, 1.0, 0.0, 1.0, true);
    injectStrength = map(progress, 0.65, 1.0, 0.05, 0.20);
  } else if (progress < 0.20) {
    injectStrength = map(progress, 0.0, 0.20, 0.18, 0.04);
  }

  let effectiveDecay = decay;
  if (progress >= 0.35 && progress <= 0.70) {
    effectiveDecay = decay * 1.35;
  }

  for (let y = 0; y < rows; y++) {
    let up = ((y - 1 + rows) % rows) * cols;
    let down = ((y + 1) % rows) * cols;
    let cur = y * cols;

    for (let x = 0; x < cols; x++) {
      let idx = cur + x;

      let left = (x - 1 + cols) % cols;
      let right = (x + 1) % cols;

      // 8 vecinos inmediatos
      let n0 = up + left,   n1 = up + x,   n2 = up + right;
      let n3 = cur + left,                 n4 = cur + right;
      let n5 = down + left, n6 = down + x, n7 = down + right;

      // Canal Rojo
      let sumR = gridR[n0] + gridR[n1] + gridR[n2] +
                 gridR[n3] +             gridR[n4] +
                 gridR[n5] + gridR[n6] + gridR[n7];
      let valR = sumR * 0.125 - effectiveDecay;

      // Canal Verde
      let sumG = gridG[n0] + gridG[n1] + gridG[n2] +
                 gridG[n3] +             gridG[n4] +
                 gridG[n5] + gridG[n6] + gridG[n7];
      let valG = sumG * 0.125 - effectiveDecay;

      // Canal Azul
      let sumB = gridB[n0] + gridB[n1] + gridB[n2] +
                 gridB[n3] +             gridB[n4] +
                 gridB[n5] + gridB[n6] + gridB[n7];
      let valB = sumB * 0.125 - effectiveDecay;

      // Inyección continua de las flores
      if (currData && nextData) {
        let targetR = lerp(currData.r[idx], nextData.r[idx], morphWeight) * 2.8;
        let targetG = lerp(currData.g[idx], nextData.g[idx], morphWeight) * 2.8;
        let targetB = lerp(currData.b[idx], nextData.b[idx], morphWeight) * 2.8;

        valR = valR * (1 - injectStrength) + targetR * injectStrength;
        valG = valG * (1 - injectStrength) + targetG * injectStrength;
        valB = valB * (1 - injectStrength) + targetB * injectStrength;
      }

      nextR[idx] = max(valR, 0);
      nextG[idx] = max(valG, 0);
      nextB[idx] = max(valB, 0);
    }
  }

  // Intercambiar punteros
  let tempR = gridR; gridR = nextR; nextR = tempR;
  let tempG = gridG; gridG = nextG; nextG = tempG;
  let tempB = gridB; gridB = nextB; nextB = tempB;
}

// =========================================================================
// RENDERIZADO CON DESPLAZAMIENTO ORGÁNICO ULTRA RÁPIDO
// =========================================================================
function renderWithOrganicDisplacement(progress) {
  caImage.loadPixels();
  let pix = caImage.pixels;

  let currData = imagesList[currentIndex]?.data;
  let nextData = imagesList[nextIndex]?.data;

  let warpFactor = 0;
  let morphBlend = 0;

  if (progress < 0.30) {
    warpFactor = map(progress, 0.0, 0.30, 0.0, 0.25);
    morphBlend = 0;
  } else if (progress < 0.70) {
    warpFactor = map(progress, 0.30, 0.55, 0.25, 1.0, true);
    if (progress > 0.55) {
      warpFactor = map(progress, 0.55, 0.70, 1.0, 0.85);
    }
    morphBlend = map(progress, 0.45, 0.70, 0.0, 0.5, true);
  } else {
    warpFactor = map(progress, 0.70, 0.95, 0.85, 0.0, true);
    morphBlend = map(progress, 0.70, 1.0, 0.5, 1.0, true);
  }

  let displacementScale = warpFactor * fluidWarpFactor * 0.045;
  let waveInfluence = map(warpFactor, 0, 1, 0.12, 0.58);
  let invWave = 1.0 - waveInfluence;

  let mask1023 = LUT_SIZE - 1;

  for (let y = 0; y < rows; y++) {
    let cur = y * cols;
    let up = ((y - 1 + rows) % rows) * cols;
    let down = ((y + 1) % rows) * cols;

    for (let x = 0; x < cols; x++) {
      let idx = cur + x;
      let pIdx = idx << 2; // idx * 4 rápido

      let left = (x - 1 + cols) % cols;
      let right = (x + 1) % cols;

      // Gradiente de energía
      let gradX = (gridR[cur + right] - gridR[cur + left]) * 0.5 +
                  (gridG[cur + right] - gridG[cur + left]) * 0.3;
      let gradY = (gridR[down + x] - gridR[up + x]) * 0.5 +
                  (gridG[down + x] - gridG[up + x]) * 0.3;

      // Desplazamiento de coordenadas
      let sampleX = x;
      let sampleY = y;

      if (displacementScale > 0.001) {
        let sx = x + (gradX * displacementScale | 0);
        let sy = y + (gradY * displacementScale | 0);
        sampleX = sx < 0 ? 0 : (sx >= cols ? cols - 1 : sx);
        sampleY = sy < 0 ? 0 : (sy >= rows ? rows - 1 : sy);
      }
      let sampleIdx = sampleY * cols + sampleX;

      // Muestreo nítido de las 3 flores
      let photoR = 0, photoG = 0, photoB = 0;
      if (currData && nextData) {
        let rA = currData.r[sampleIdx], gA = currData.g[sampleIdx], bA = currData.b[sampleIdx];
        let rB = nextData.r[sampleIdx], gB = nextData.g[sampleIdx], bB = nextData.b[sampleIdx];
        photoR = rA + (rB - rA) * morphBlend;
        photoG = gA + (gB - gA) * morphBlend;
        photoB = bA + (bB - bA) * morphBlend;
      }

      // Ondas mediante tabla precalculada (LUT) de altísima velocidad
      let waveR = LUT_SMOOTH_FOLD[(gridR[idx] | 0) & mask1023];
      let waveG = LUT_SMOOTH_FOLD[(gridG[idx] | 0) & mask1023];
      let waveB = LUT_SMOOTH_FOLD[(gridB[idx] | 0) & mask1023];

      let finalR = photoR * invWave + waveR * waveInfluence;
      let finalG = photoG * invWave + waveG * waveInfluence;
      let finalB = photoB * invWave + waveB * waveInfluence;

      if (currentModeIndex === 0) {
        // Color RGB Original
        pix[pIdx + 0] = finalR;
        pix[pIdx + 1] = finalG;
        pix[pIdx + 2] = finalB;
        pix[pIdx + 3] = 255;
      } else if (currentModeIndex === 1) {
        // Neón / Ciber
        let lum = finalR * 0.299 + finalG * 0.587 + finalB * 0.114;
        let t = lum * 0.0039215686;
        pix[pIdx + 0] = sin(t * PI) * 255;
        pix[pIdx + 1] = cos(t * HALF_PI) * 220 + 30;
        pix[pIdx + 2] = sin(t * TWO_PI + HALF_PI) * 200 + 55;
        pix[pIdx + 3] = 255;
      } else if (currentModeIndex === 2) {
        // Magma / Fuego
        let lum = (finalR + finalG + finalB) * 0.3333;
        pix[pIdx + 0] = min(lum * 2.2, 255);
        pix[pIdx + 1] = min(max(lum * 1.5 - 60, 0), 255);
        pix[pIdx + 2] = min(max(lum * 2.5 - 200, 0), 255);
        pix[pIdx + 3] = 255;
      } else {
        // Blanco y Negro Orgánico
        let lum = finalR * 0.299 + finalG * 0.587 + finalB * 0.114;
        pix[pIdx + 0] = lum;
        pix[pIdx + 1] = lum;
        pix[pIdx + 2] = lum;
        pix[pIdx + 3] = 255;
      }
    }
  }

  caImage.updatePixels();
}

// =========================================================================
// INTERACCIÓN CON EL MOUSE Y AUDIO FX
// =========================================================================
function handleMouseInteraction() {
  let isInteracting = mouseIsPressed && mouseX >= 0 && mouseX < width && mouseY >= 0 && mouseY < height;

  if (isInteracting) {
    let gridX = floor(mouseX / resolution);
    let gridY = floor(mouseY / resolution);
    let r = floor(brushRadius / resolution);

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        let x = (gridX + dx + cols) % cols;
        let y = (gridY + dy + rows) % rows;
        let d = sqrt(dx * dx + dy * dy);

        if (d <= r) {
          let energy = (1 - d / r) * 260;
          let idx = y * cols + x;
          gridR[idx] += energy;
          gridG[idx] += energy * 0.85;
          gridB[idx] += energy * 1.25;
        }
      }
    }
  }

  // Modulación en tiempo real de Rate / Pitch / Pan de la pista actual
  handleAudioFX(isInteracting);
}

function getCurrentSound() {
  if (audioList.length > 0 && audioList[currentAudioIndex]) {
    return audioList[currentAudioIndex].sound;
  }
  return null;
}

function handleAudioFX(isInteracting) {
  let currentSound = getCurrentSound();
  if (!currentSound || !soundEnabled) return;

  if (isInteracting) {
    // Iniciar contexto de audio al primer clic si el navegador lo tenía suspendido
    if (!audioStarted) {
      userStartAudio();
      audioStarted = true;
    }

    // Iniciar loop si aún no está reproduciendo
    if (!currentSound.isPlaying()) {
      currentSound.setVolume(0.001);
      currentSound.loop();
    }

    // Velocidad a la que el usuario mueve el mouse
    let mouseSpeed = dist(mouseX, mouseY, pmouseX, pmouseY);

    // MODULACIÓN DE RATE / PITCH:
    // Eje Vertical (Y):
    // Arriba (Y=0) => Tono agudo y acelerado (~1.7x a 2.0x)
    // Abajo (Y=height) => Tono grave, oscuro y lento (~0.35x a 0.5x)
    let basePitch = map(mouseY, height, 0, 0.42, 1.85, true);

    // La velocidad del movimiento deforma el tono dinámicamente
    let speedWarp = map(mouseSpeed, 0, 45, 0.0, 0.35, true);
    let finalRate = constrain(basePitch + speedWarp, 0.25, 2.6);

    // PANNING ESTÉREO según la posición horizontal (X):
    let panVal = map(mouseX, 0, width, -0.75, 0.75, true);

    // VOLUMEN DINÁMICO:
    let strokeVol = map(mouseSpeed, 0, 30, 0.45, 1.0, true) * masterVolume;

    // Aplicar a la pista activa
    currentSound.rate(finalRate);
    currentSound.pan(panVal);
    currentSound.setVolume(strokeVol, 0.05);

  } else {
    // Cuando se suelta el mouse, desvanecer suavemente (fade out)
    if (currentSound.isPlaying()) {
      currentSound.setVolume(0.0, 0.28);
    }
  }
}

function switchNextAudioTrack() {
  if (audioList.length <= 1) return;

  // Detener la canción actual antes de cambiar
  let currentSound = getCurrentSound();
  if (currentSound && currentSound.isPlaying()) {
    currentSound.stop();
  }

  currentAudioIndex = (currentAudioIndex + 1) % audioList.length;
  updateAudioLabel();
}

function updateAudioLabel() {
  let label = document.getElementById('audio-track-label');
  if (label && audioList.length > 0 && audioList[currentAudioIndex]) {
    label.textContent = audioList[currentAudioIndex].name;
  }
}

// =========================================================================
// MUESTREO DE IMÁGENES
// =========================================================================
function seedCurrentToNext(curr, next) {
  currentIndex = curr;
  nextIndex = next;
  cycleTimer = 0;

  if (imagesList[curr]?.data) {
    let d = imagesList[curr].data;
    for (let i = 0; i < cols * rows; i++) {
      gridR[i] = d.r[i] * 2.6;
      gridG[i] = d.g[i] * 2.6;
      gridB[i] = d.b[i] * 2.6;
    }
  }
  updateBadge();
}

function resampleP5Image(img) {
  let gfx = createGraphics(cols, rows);
  gfx.pixelDensity(1);
  gfx.background(0);

  let imgAspect = img.width / img.height;
  let canvasAspect = cols / rows;
  let drawW, drawH, drawX, drawY;

  let margin = 0.95;
  if (imgAspect > canvasAspect) {
    drawW = cols * margin;
    drawH = (cols / imgAspect) * margin;
  } else {
    drawH = rows * margin;
    drawW = (rows * imgAspect) * margin;
  }
  drawX = (cols - drawW) / 2;
  drawY = (rows - drawH) / 2;

  gfx.image(img, drawX, drawY, drawW, drawH);
  gfx.loadPixels();

  let count = cols * rows;
  let rArr = new Float32Array(count);
  let gArr = new Float32Array(count);
  let bArr = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let p = i * 4;
    let alpha = gfx.pixels[p + 3] / 255.0;
    rArr[i] = gfx.pixels[p + 0] * alpha;
    gArr[i] = gfx.pixels[p + 1] * alpha;
    bArr[i] = gfx.pixels[p + 2] * alpha;
  }

  gfx.remove();
  return { r: rArr, g: gArr, b: bArr };
}

function addLoadedImage(img, name = "Imagen") {
  let processed = {
    name: name,
    sourceImg: img,
    data: resampleP5Image(img)
  };
  imagesList.push(processed);
  updateBadge();
}

function generateProceduralDefaults() {
  let g1 = createGraphics(600, 600);
  g1.pixelDensity(1);
  g1.background(10, 15, 25);
  g1.translate(300, 300);
  for (let i = 0; i < 16; i++) {
    g1.rotate(TWO_PI / 16);
    g1.stroke(255, 100, 180, 220);
    g1.noFill();
    g1.ellipse(0, 80, 110, 180);
  }
  addLoadedImage(g1, "Demo");
  g1.remove();
}

// =========================================================================
// EVENTOS Y CONTROLES UI
// =========================================================================
function setupUIEvents() {
  // Botón directo de carga
  let btnUpload = document.getElementById('btn-upload');
  let fileInput = document.getElementById('file-input');

  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      let files = e.target.files;
      if (files && files.length > 0) {
        loadFilesIntoGallery(files);
      }
      fileInput.value = ''; // Permite volver a seleccionar el mismo archivo si se desea
    });
  }

  // Botón abrir/cerrar panel lateral
  let btnToggle = document.getElementById('btn-toggle-ui');
  let btnClose = document.getElementById('btn-close-ui');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => setUIVisible(true));
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => setUIVisible(false));
  }

  let btnNext = document.getElementById('btn-next');
  if (btnNext) {
    btnNext.addEventListener('click', triggerNextTransition);
  }

  let btnMode = document.getElementById('btn-mode');
  let modeLabel = document.getElementById('mode-label');
  if (btnMode) {
    btnMode.addEventListener('click', () => {
      currentModeIndex = (currentModeIndex + 1) % COLOR_MODES.length;
      if (modeLabel) modeLabel.textContent = COLOR_MODES[currentModeIndex];
    });
  }

  let btnRes = document.getElementById('btn-res');
  let resLabel = document.getElementById('res-label');
  if (btnRes) {
    btnRes.addEventListener('click', () => {
      currentResIndex = (currentResIndex + 1) % RESOLUTION_MODES.length;
      resolution = RESOLUTION_MODES[currentResIndex].val;
      if (resLabel) resLabel.textContent = RESOLUTION_MODES[currentResIndex].label;
      rebuildAtCurrentResolution();
    });
  }

  let btnPause = document.getElementById('btn-pause');
  let pauseLabel = document.getElementById('pause-label');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      if (pauseLabel) pauseLabel.textContent = isPaused ? 'Reanudar' : 'Pausar';
    });
  }

  let decaySlider = document.getElementById('decay-slider');
  let decayVal = document.getElementById('decay-val');
  if (decaySlider) {
    decaySlider.addEventListener('input', (e) => {
      decay = parseFloat(e.target.value);
      if (decayVal) decayVal.textContent = decay.toFixed(1);
    });
  }

  let warpSlider = document.getElementById('warp-slider');
  let warpVal = document.getElementById('warp-val');
  if (warpSlider) {
    warpSlider.addEventListener('input', (e) => {
      fluidWarpFactor = parseFloat(e.target.value) / 100.0;
      if (warpVal) warpVal.textContent = e.target.value + '%';
    });
  }

  let speedSlider = document.getElementById('speed-slider');
  let speedVal = document.getElementById('speed-val');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      cycleDuration = parseFloat(e.target.value);
      if (speedVal) speedVal.textContent = cycleDuration + 's';
    });
  }

  // Control de Sonido FX
  let btnSound = document.getElementById('btn-sound');
  let soundLabel = document.getElementById('sound-label');
  if (btnSound) {
    btnSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      if (soundLabel) soundLabel.textContent = soundEnabled ? 'Activo' : 'Mudo';
      let currentSound = getCurrentSound();
      if (!soundEnabled && currentSound && currentSound.isPlaying()) {
        currentSound.setVolume(0.0, 0.1);
      }
      if (soundEnabled && !audioStarted) {
        userStartAudio();
        audioStarted = true;
      }
    });
  }

  // Botón Cambiar Pista de Audio
  let btnAudioNext = document.getElementById('btn-audio-next');
  if (btnAudioNext) {
    btnAudioNext.addEventListener('click', switchNextAudioTrack);
  }

  // Botón Subir Canción
  let btnAudioUpload = document.getElementById('btn-audio-upload');
  let audioFileInput = document.getElementById('audio-file-input');
  if (btnAudioUpload && audioFileInput) {
    btnAudioUpload.addEventListener('click', () => {
      audioFileInput.click();
    });
  }

  if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
      let files = e.target.files;
      if (files && files.length > 0) {
        loadCustomAudioFile(files[0]);
      }
      audioFileInput.value = '';
    });
  }

  // Slider de Volumen
  let volSlider = document.getElementById('vol-slider');
  let volVal = document.getElementById('vol-val');
  if (volSlider) {
    volSlider.addEventListener('input', (e) => {
      masterVolume = parseFloat(e.target.value) / 100.0;
      if (volVal) volVal.textContent = e.target.value + '%';
    });
  }

  // Inicializar estado del botón de reapertura
  setUIVisible(true);
}

function setUIVisible(show) {
  uiVisible = show;
  let ui = document.getElementById('ui-container');
  let btnToggle = document.getElementById('btn-toggle-ui');
  if (ui) {
    if (uiVisible) ui.classList.remove('hidden');
    else ui.classList.add('hidden');
  }
  if (btnToggle) {
    btnToggle.style.display = uiVisible ? 'none' : 'flex';
  }
}

function setupDragAndDrop() {
  let overlay = document.getElementById('drop-overlay');

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (overlay) overlay.classList.add('active');
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null && overlay) {
      overlay.classList.remove('active');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (overlay) overlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let files = Array.from(e.dataTransfer.files);
      let audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(f.name));
      let imageFiles = files.filter(isImageFile);

      if (audioFiles.length > 0) {
        loadCustomAudioFile(audioFiles[0]);
      }
      if (imageFiles.length > 0) {
        loadFilesIntoGallery(imageFiles);
      }
    }
  });
}

function loadCustomAudioFile(file) {
  let cleanName = file.name.replace(/\.[^/.]+$/, "");
  let blobUrl = URL.createObjectURL(file);
  loadSound(blobUrl, (snd) => {
    let currentSound = getCurrentSound();
    if (currentSound && currentSound.isPlaying()) {
      currentSound.stop();
    }
    audioList.push({ name: cleanName, sound: snd });
    currentAudioIndex = audioList.length - 1;
    updateAudioLabel();
    console.log("Canción cargada con éxito:", cleanName);
  }, (err) => {
    console.error("Error al cargar archivo de audio:", err);
  });
}

function isImageFile(f) {
  return f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name);
}

function loadFilesIntoGallery(files) {
  let validFiles = Array.from(files).filter(isImageFile);
  if (validFiles.length === 0) return;

  let newImages = [];
  let loadedCount = 0;

  for (let file of validFiles) {
    let reader = new FileReader();
    reader.onload = (event) => {
      loadImage(event.target.result, (p5Img) => {
        let cleanName = file.name.replace(/\.[^/.]+$/, "");
        newImages.push({
          name: cleanName,
          sourceImg: p5Img,
          data: resampleP5Image(p5Img)
        });
        loadedCount++;
        if (loadedCount === validFiles.length) {
          // Reemplazar la galería por las imágenes subidas
          imagesList = newImages;
          currentIndex = 0;
          nextIndex = imagesList.length > 1 ? 1 : 0;
          seedCurrentToNext(currentIndex, nextIndex);
          updateBadge();
        }
      }, (err) => {
        console.error("Error al decodificar la imagen:", err);
      });
    };
    reader.readAsDataURL(file);
  }
}

function triggerNextTransition() {
  if (imagesList.length <= 1) return;
  currentIndex = nextIndex;
  nextIndex = (nextIndex + 1) % imagesList.length;
  seedCurrentToNext(currentIndex, nextIndex);
}

function triggerPrevTransition() {
  if (imagesList.length <= 1) return;
  nextIndex = currentIndex;
  currentIndex = (currentIndex - 1 + imagesList.length) % imagesList.length;
  seedCurrentToNext(currentIndex, nextIndex);
}

function updateBadge() {
  let badge = document.getElementById('image-badge');
  if (badge && imagesList.length > 0) {
    badge.textContent = `${imagesList[currentIndex].name} (${currentIndex + 1} de ${imagesList.length})`;
  }
}

// =========================================================================
// ATAJOS DE TECLADO
// =========================================================================
function keyPressed() {
  if (key === ' ' || keyCode === 32) {
    triggerNextTransition();
  } else if (keyCode === RIGHT_ARROW) {
    triggerNextTransition();
  } else if (keyCode === LEFT_ARROW) {
    triggerPrevTransition();
  } else if (key === 'c' || key === 'C') {
    currentModeIndex = (currentModeIndex + 1) % COLOR_MODES.length;
    let modeLabel = document.getElementById('mode-label');
    if (modeLabel) modeLabel.textContent = COLOR_MODES[currentModeIndex];
  } else if (key === 'p' || key === 'P') {
    isPaused = !isPaused;
    let pauseLabel = document.getElementById('pause-label');
    if (pauseLabel) pauseLabel.textContent = isPaused ? 'Reanudar' : 'Pausar';
  } else if (key === 'a' || key === 'A') {
    // Tecla A: Cambiar pista de audio
    switchNextAudioTrack();
  } else if (key === 'm' || key === 'M') {
    soundEnabled = !soundEnabled;
    let soundLabel = document.getElementById('sound-label');
    if (soundLabel) soundLabel.textContent = soundEnabled ? 'Activo' : 'Mudo';
    let currentSound = getCurrentSound();
    if (!soundEnabled && currentSound && currentSound.isPlaying()) {
      currentSound.setVolume(0.0, 0.1);
    }
  } else if (key === 'h' || key === 'H') {
    setUIVisible(!uiVisible);
  }
}
