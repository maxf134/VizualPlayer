// ============================================================================
// МОДУЛЬ 5: APP.JS — 3 РЕЖИМА ПРОЦЕДУРНОГО AUTO-DJ (LITE / STANDART / ULTRA)
// ============================================================================
const btnZenInline = document.getElementById('btn-zen-inline');
const btnZenFloating = document.getElementById('btn-zen-floating');

let idleTimer = null;
const IDLE_TIMEOUT_MS = 2400;

function resetIdleTimer() {
    document.body.classList.remove('user-idle');
    if (idleTimer) clearTimeout(idleTimer);
    if (document.body.classList.contains('zen-mode')) {
        idleTimer = setTimeout(() => {
            if (document.body.classList.contains('zen-mode')) {
                document.body.classList.add('user-idle');
            }
        }, IDLE_TIMEOUT_MS);
    }
}

['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
});

function setZenUIState(isZen) {
    if (isZen) {
        document.body.classList.add('zen-mode');
        if (btnZenFloating) btnZenFloating.textContent = '✕ Показать UI / Выйти';
        resetIdleTimer();
    } else {
        document.body.classList.remove('zen-mode');
        document.body.classList.remove('user-idle');
        if (idleTimer) clearTimeout(idleTimer);
        if (btnZenFloating) btnZenFloating.textContent = '⛶ Полный экран (Скрыть UI)';
    }
}

function toggleZenFullscreen() {
    const isCurrentlyZen = document.body.classList.contains('zen-mode');
    if (!isCurrentlyZen) {
        setZenUIState(true);
        const docEl = document.documentElement;
        const requestFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
        if (!document.fullscreenElement && !document.webkitFullscreenElement && requestFS) {
            requestFS.call(docEl).catch(() => {});
        }
    } else {
        setZenUIState(false);
        const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if ((document.fullscreenElement || document.webkitFullscreenElement) && exitFS) {
            exitFS.call(document).catch(() => {});
        }
    }
}

if (btnZenInline) btnZenInline.addEventListener('click', toggleZenFullscreen);
if (btnZenFloating) btnZenFloating.addEventListener('click', toggleZenFullscreen);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setZenUIState(false); });
document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement) setZenUIState(false); });

let scene, camera, renderer, composer, bloomPass, uberFXPass;
let gui;
let currentPixelRatio = 0.85;
let targetPixelRatio = 0.85;

function setRendererScale(pr) {
    currentPixelRatio = Math.min(Math.max(pr, 0.55), 1.5);
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function applyPerformanceProfile(profile) {
    if (!renderer || !composer) return;
    if (profile === 'Lite (Макс FPS)') {
        vizConfig.raySteps = 18;
        targetPixelRatio = 0.80;
    } else if (profile === 'Balanced (Авто FPS)') {
        vizConfig.raySteps = 24;
        targetPixelRatio = 1.0;
    } else {
        vizConfig.raySteps = 32;
        targetPixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    }
    setRendererScale(targetPixelRatio);
    if (bgUniforms) bgUniforms.u_maxSteps.value = vizConfig.raySteps;
}

function loadPresetInternal(presetName) {
    const p = PRESETS_CATALOG[presetName];
    if (!p) return;

    vizConfig.preset = presetName;
    LAYER_KEYS.forEach(k => {
        vizConfig[k].on = false;
        vizConfig[k].targetOpacity = 0.0;
    });

    p.layers.forEach(layerKey => {
        if (vizConfig[layerKey]) {
            vizConfig[layerKey].on = true;
            vizConfig[layerKey].targetOpacity = 0.88;
        }
    });

    vizConfig.shaderMode = p.shader;
    vizConfig.colorPalette = p.palette;
    vizConfig.glslOpacity = (p.glslOp !== undefined) ? p.glslOp : 1.0;
    vizConfig.enable3DLayers = p.layers.length > 0;
    vizConfig.cameraTilt = (p.tilt !== undefined) ? p.tilt : true;

    fxConfig.mirrorMode = p.mirror;
    fxConfig.barrelBlur = p.barrel;
    fxConfig.wobbleStrength = p.wobble;

    if (vizConfig.performanceMode === 'Lite (Макс FPS)' || p.tier === 'lite') {
        vizConfig.raySteps = 18;
    } else if (vizConfig.performanceMode === 'Balanced (Авто FPS)') {
        vizConfig.raySteps = 24;
    } else {
        vizConfig.raySteps = 30;
    }

    if (bgUniforms) {
        bgUniforms.u_mode.value = Number(vizConfig.shaderMode);
        bgUniforms.u_palette.value = Number(vizConfig.colorPalette);
        bgUniforms.u_opacity.value = vizConfig.glslOpacity;
        bgUniforms.u_maxSteps.value = vizConfig.raySteps;
    }
    if (gui) gui.updateDisplay();
}

function onUserSelectPreset(presetName) {
    vizConfig.controlMode = '🎛️ Пресеты (Ручной выбор)';
    loadPresetInternal(presetName);
}

// ============================================================================
// ПРОЦЕДУРНЫЙ РАНДОМНЫЙ AUTO-DJ В 3 РЕЖИМАХ: LITE (1-2), STANDART (2-3), ULTRA (3-4)
// ============================================================================
function randomizeProceduralAutoDJ(tier) {
    // 1. Выключаем все 3D-слои перед новой генерацией
    LAYER_KEYS.forEach(k => {
        vizConfig[k].on = false;
        vizConfig[k].targetOpacity = 0.0;
    });

    // 2. Определяем количество случайных 3D-слоев в зависимости от режима:
    // LITE: от 1 до 2 слоев | STANDART: от 2 до 3 слоев | ULTRA: от 3 до 4 слоев
    let numLayers = 2;
    if (tier === 'lite') {
        numLayers = Math.random() < 0.35 ? 1 : 2;
        vizConfig.raySteps = 18;
    } else if (tier === 'standart') {
        numLayers = Math.random() < 0.40 ? 2 : 3;
        vizConfig.raySteps = 22;
    } else {
        numLayers = Math.random() < 0.45 ? 3 : 4;
        vizConfig.raySteps = 26;
    }

    // 3. Перемешиваем все 21 3D-слой по алгоритму Фишера-Йетса и берем первые numLayers
    const shuffledLayers = LAYER_KEYS.slice();
    for (let i = shuffledLayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffledLayers[i];
        shuffledLayers[i] = shuffledLayers[j];
        shuffledLayers[j] = temp;
    }

    const chosenLayers = shuffledLayers.slice(0, numLayers);
    chosenLayers.forEach((key, idx) => {
        vizConfig[key].on = true;
        // Чтобы при 3-4 слоях экран не засвечивался, слегка балансируем прозрачность дополнительных слоев
        vizConfig[key].targetOpacity = idx === 0 ? 0.90 : (idx === 1 ? 0.80 : 0.68);
    });
    vizConfig.enable3DLayers = true;

    // 4. Выбираем ЛЮБОЙ случайный фоновый GLSL-шейдер из 16 (не повторяя предыдущий)
    let nextShader = Math.floor(Math.random() * TOTAL_GLSL_SHADERS);
    if (nextShader === Number(vizConfig.shaderMode)) {
        nextShader = (nextShader + 1 + Math.floor(Math.random() * (TOTAL_GLSL_SHADERS - 1))) % TOTAL_GLSL_SHADERS;
    }
    vizConfig.shaderMode = nextShader;

    // Для ярких волюметрических шейдеров (Octagrams #1 и DNA #10) ставим мягкую яркость фона
    vizConfig.glslOpacity = (nextShader === 1 || nextShader === 10) ? 0.74 : 0.94;

    // 5. Выбираем случайную палитру из 18 (если выпала Лава-лампа, с вероятностью 65% берем одну из лава-палитр 12..17)
    if (chosenLayers.includes('lavaLamp') && Math.random() < 0.65) {
        vizConfig.colorPalette = 12 + Math.floor(Math.random() * 6);
    } else {
        vizConfig.colorPalette = Math.floor(Math.random() * TOTAL_PALETTES);
    }

    // 6. Если активен Лабиринт Звезды Давида или Ретро-солнце — держим камеру ровно по центру
    if (chosenLayers.includes('starOfDavid') || nextShader === 13 || nextShader === 8) {
        vizConfig.cameraTilt = false;
    } else {
        vizConfig.cameraTilt = Math.random() < 0.65;
    }

    // 7. Случайный режим зеркал (в Lite чаще без зеркал, в Standart/Ultra — разнообразные симметрии)
    const mirrorPool = (tier === 'lite') ? [0, 0, 0, 1, 3] : [0, 0, 1, 2, 3, 4];
    fxConfig.mirrorMode = mirrorPool[Math.floor(Math.random() * mirrorPool.length)];

    if (bgUniforms) {
        bgUniforms.u_mode.value = Number(vizConfig.shaderMode);
        bgUniforms.u_palette.value = Number(vizConfig.colorPalette);
        bgUniforms.u_opacity.value = vizConfig.glslOpacity;
        bgUniforms.u_maxSteps.value = vizConfig.raySteps;
    }

    if (gui) gui.updateDisplay();
}

function stepAutoDJShuffle() {
    if (vizConfig.controlMode === '🟢 Auto-DJ: LITE (1-2 слоя + любой фон)') {
        randomizeProceduralAutoDJ('lite');
    } else if (vizConfig.controlMode === '🟡 Auto-DJ: STANDART (2-3 слоя + любой фон)') {
        randomizeProceduralAutoDJ('standart');
    } else if (vizConfig.controlMode === '🔥 Auto-DJ: ULTRA (3-4 слоя + любой фон)') {
        randomizeProceduralAutoDJ('ultra');
    } else {
        randomizeProceduralAutoDJ('standart');
    }
}

function initGUI() {
    gui = new dat.GUI({ autoPlace: true, width: isMobile ? 270 : 380 });
    if (isMobile) gui.close();

    // ПАПКА 1: 3 Режима Auto-DJ (Lite / Standart / Ultra), Четверти и Пресеты
    const fMain = gui.addFolder('1. AUTO-DJ (LITE / STANDART / ULTRA) & BPM');
    fMain.add({ fullscreen: toggleZenFullscreen }, 'fullscreen').name('⛶ ПОЛНЫЙ ЭКРАН (Скрыть UI)');

    fMain.add(vizConfig, 'controlMode', CONTROL_MODES).name('🎛️ Режим работы').listen().onChange(mode => {
        audioState.lastSwitchBeatStep = Math.floor(audioState.bpmClockBeats / Number(vizConfig.noteDivision));
        if (mode === '🟢 Auto-DJ: LITE (1-2 слоя + любой фон)') {
            randomizeProceduralAutoDJ('lite');
        } else if (mode === '🟡 Auto-DJ: STANDART (2-3 слоя + любой фон)') {
            randomizeProceduralAutoDJ('standart');
        } else if (mode === '🔥 Auto-DJ: ULTRA (3-4 слоя + любой фон)') {
            randomizeProceduralAutoDJ('ultra');
        }
    });

    fMain.add(vizConfig, 'noteDivision', NOTE_DIVISION_LIST).name('⏱️ Смена Auto-DJ').onChange(() => {
        audioState.lastSwitchBeatStep = Math.floor(audioState.bpmClockBeats / Number(vizConfig.noteDivision));
    });

    fMain.add(audioState, 'detectedBPM', 60, 180, 1).name('🥁 Авто-BPM трека').listen();
    fMain.add(vizConfig, 'preset', PRESET_KEYS).name('🎬 Готовые пресеты (24)').listen().onChange(onUserSelectPreset);

    fMain.add(vizConfig, 'performanceMode', [
        'Lite (Макс FPS)',
        'Balanced (Авто FPS)',
        'Ultra (Макс Графика)'
    ]).name('⚡ Профиль нагрузки GPU').onChange(applyPerformanceProfile);
    fMain.add(vizConfig, 'autoDRS').name('🚀 Авто-удержание 60 FPS').listen();
    fMain.add(vizConfig, 'currentFPS', 0, 120, 1).name('📈 Текущий FPS').listen();

    fMain.add(vizConfig, 'enableShakeAndWobble').name('🔥 Тряска под бит (Вкл/Выкл)').listen();
    fMain.add(vizConfig, 'shakeLevel', 0.0, 2.0, 0.05).name('💥 Уровень тряски (0-200%)').listen();

    fMain.add(vizConfig, 'shaderMode', GLSL_SHADER_LIST).name('Фон (16 GLSL)').listen().onChange(v => {
        vizConfig.controlMode = '🎛️ Пресеты (Ручной выбор)';
        bgUniforms.u_mode.value = Number(v);
        if (gui) gui.updateDisplay();
    });
    fMain.add(vizConfig, 'colorPalette', COLOR_PALETTE_LIST).name('Палитра (18 + Лава)').listen().onChange(v => {
        bgUniforms.u_palette.value = Number(v);
    });
    fMain.add(vizConfig, 'speed', 0.1, 2.5, 0.05).name('Скорость анимации');
    if (!isMobile) fMain.open();

    // ПАПКА 2: Яркость и цветокоррекция
    const fBright = gui.addFolder('2. ЯРКОСТЬ И ЦВЕТОКОРРЕКЦИЯ');
    fBright.add(fxConfig, 'masterExposure', 0.2, 2.5, 0.05).name('☀️ Общая яркость (Exp)').listen();
    fBright.add(fxConfig, 'gamma', 0.5, 1.8, 0.05).name('🌓 Гамма (Светлота)').listen();
    fBright.add(fxConfig, 'blackLift', -0.10, 0.25, 0.01).name('🖤 Уровень черного').listen();
    fBright.add(fxConfig, 'bloomStrength', 0.0, 2.2, 0.05).name('✨ Свечение (Bloom)').listen();
    fBright.add(vizConfig, 'glslOpacity', 0.0, 1.5, 0.05).name('🔆 Яркость фона GLSL').listen().onChange(v => {
        bgUniforms.u_opacity.value = v;
    });
    fBright.add(fxConfig, 'contrast', 0.7, 1.6, 0.02).name('Контрастность').listen();
    fBright.add(fxConfig, 'saturation', 0.0, 2.0, 0.05).name('Насыщенность цвета').listen();
    fBright.add(fxConfig, 'vignette', 0.0, 0.9, 0.05).name('Виньетка краев').listen();

    // ПАПКА 3: Автоподстройка чувствительности AGC
    const fAudio = gui.addFolder('3. АВТО-ЧУВСТВИТЕЛЬНОСТЬ (AGC / AGS)');
    fAudio.add(audioState, 'autoGainEnabled').name('⚡ Авто-чувств. AGC (Вкл)').listen();
    fAudio.add(audioState, 'targetLevel', 0.15, 0.75, 0.02).name('Целевой уровень AGC');
    fAudio.add(audioState, 'manualGain', 0.3, 3.5, 0.05).name('Ручной Gain / Множитель');
    fAudio.add(audioState, 'currentGain', 0.1, 5.0, 0.01).name('📊 Текущий Gain (Auto)').listen();
    fAudio.add(audioState, 'beatThreshold', 0.15, 0.7, 0.02).name('Порог бита (Threshold)');

    // ПАПКА 4: Все 21 слой конструктора ÜberViz
    const fViz = gui.addFolder('4. ВСЕ 21 СЛОЙ ÜBERVIZ (Конструктор)');
    fViz.add(vizConfig, 'enable3DLayers').name('Включить 3D слои').listen();
    fViz.add({ nextRandom: stepAutoDJShuffle }, 'nextRandom').name('🎲 Сгенерировать сцену (R)');

    const bindLayerToggle = (key, label) => {
        fViz.add(vizConfig[key], 'on').name(label).listen().onChange(v => {
            vizConfig.enable3DLayers = true;
            vizConfig.controlMode = '🎛️ Пресеты (Ручной выбор)';
            vizConfig[key].targetOpacity = v ? 0.88 : 0.0;
            if (gui) gui.updateDisplay();
        });
    };
    bindLayerToggle('starOfDavid',  '✡️ Лабиринт Звезды Давида');
    bindLayerToggle('lavaLamp',     '🫧 Большая Лава-лампа');
    bindLayerToggle('tesla',        '⚡ Катушка Теслы (Молнии)');
    bindLayerToggle('lasers',       '🔦 Клубные лазеры (Лучи)');
    bindLayerToggle('joyDivision',  '📈 Пульсар Joy Division');
    bindLayerToggle('spirograph',   '🌀 Спирограф Лиссажу');
    bindLayerToggle('fireflies',    '🦋 Рой светлячков (Boids)');
    bindLayerToggle('waterRipples', '💧 Дождь на воде (Волны)');
    bindLayerToggle('dyson',        '⚙️ Сфера Дайсона (Гироскоп)');
    bindLayerToggle('hud',          '🎯 Кибер-прицел (HUD)');
    bindLayerToggle('neuralWeb',    '🧬 Нейросеть (Синапсы)');
    bindLayerToggle('origami',      '💎 Оригами-Вормхолл');
    bindLayerToggle('ripples',      '🌊 Ripples (Шум-волны)');
    bindLayerToggle('crystal',      '💎 Crystal (Гео-ядро)');
    bindLayerToggle('tunnel',       '🌀 Tunnel (Туннель)');
    bindLayerToggle('wheel',        '🎡 Wheel (Лучи спектра)');
    bindLayerToggle('eclipse',      '🌑 Eclipse (Затмение)');
    bindLayerToggle('strips',       '📊 Strips (3D-История)');
    bindLayerToggle('bars',         '⚡ Bars (Неон-колонны)');
    bindLayerToggle('stars',        '✨ Stars (Частицы)');
    bindLayerToggle('lightLeak',    '🌈 Light Leak (Засветы)');
    if (!isMobile) fViz.open();

    // ПАПКА 5: FX Rack
    const fFX = gui.addFolder('5. FX RACK (Зеркала и Спецэффекты)');
    fFX.add(fxConfig, 'mirrorMode', {
        'Off (Без зеркала)': 0,
        'Left / Right': 1,
        'Top / Bottom': 2,
        'Quad Mirror (4x)': 3,
        'Kaleidoscope (8x)': 4
    }).name('Mirror (Зеркало)').listen();
    fFX.add(fxConfig, 'mirrorAdditive').name('Mirror Additive').listen();
    fFX.add(fxConfig, 'barrelBlur', 0.0, 0.8, 0.02).name('Barrel Blur (Линза)').listen();
    fFX.add(fxConfig, 'wobbleStrength', 0.0, 0.03, 0.001).name('Базовый Wobble').listen();
    fFX.add(fxConfig, 'shakeAmount', 0.0, 0.04, 0.001).name('Базовый Shake').listen();
    fFX.add(vizConfig, 'cameraTilt').name('3D Tilt Камеры').listen();
    fFX.add(fxConfig, 'rgbShift', 0.0, 0.02, 0.001).name('RGB Shift (Хром)');
    fFX.add(fxConfig, 'scanlines', 0.0, 0.6, 0.05).name('Lines (Сканлайны)');
    fFX.add(fxConfig, 'halftone', 0.0, 1.0, 0.05).name('Half Tone (Точки)');
    fFX.add(fxConfig, 'strobeOnBeat').name('Strobe на пиках');
}

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f' || k === 'а' || k === 'q' || k === 'й') {
        toggleZenFullscreen();
    } else if (k === 'r' || k === 'к') {
        stepAutoDJShuffle();
    } else if (k === 's' || k === 'ы') {
        vizConfig.enableShakeAndWobble = !vizConfig.enableShakeAndWobble;
        if (gui) gui.updateDisplay();
    }
});

function initThree() {
    if (scene) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, 600);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', depth: false, stencil: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(currentPixelRatio);

    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    document.body.appendChild(renderer.domElement);

    const tex = createAudioDataTexture();
    buildSceneAndLayers(scene, tex);

    const renderScene = new THREE.RenderPass(scene, camera);
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);

    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
        fxConfig.bloomStrength,
        fxConfig.bloomRadius,
        0.28
    );
    composer.addPass(bloomPass);

    uberFXPass = new THREE.ShaderPass(UberVizFXShader);
    composer.addPass(uberFXPass);

    initGUI();
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    if (!renderer || !composer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bgUniforms) bgUniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    if (uberFXPass) uberFXPass.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
}

// ============================================================================
// ГЛАВНЫЙ ЦИКЛ РЕНДЕРА С КОНТРОЛЛЕРОМ FPS (AUTO-DRS)
// ============================================================================
const clock = new THREE.Clock();
let fpsFrames = 0;
let fpsLastTime = performance.now();

initThree();
animate();

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.getElapsedTime();

    fpsFrames++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
        vizConfig.currentFPS = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
        fpsFrames = 0;
        fpsLastTime = now;

        if (vizConfig.autoDRS && !document.hidden) {
            if (vizConfig.currentFPS < 48 && currentPixelRatio > 0.60) {
                setRendererScale(currentPixelRatio - 0.10);
            } else if (vizConfig.currentFPS >= 58 && currentPixelRatio < targetPixelRatio) {
                setRendererScale(Math.min(currentPixelRatio + 0.05, targetPixelRatio));
            }
        }
    }

    // Срабатывание Auto-DJ ровно по выбранной доле (четверти)
    updateAudioAnalysis(delta, () => {
        if (vizConfig.controlMode === '🟢 Auto-DJ: LITE (1-2 слоя + любой фон)') {
            randomizeProceduralAutoDJ('lite');
        } else if (vizConfig.controlMode === '🟡 Auto-DJ: STANDART (2-3 слоя + любой фон)') {
            randomizeProceduralAutoDJ('standart');
        } else if (vizConfig.controlMode === '🔥 Auto-DJ: ULTRA (3-4 слоя + любой фон)') {
            randomizeProceduralAutoDJ('ultra');
        }
    });

    if (document.hidden) return;

    const hasActiveSignal = isPlaying || (liveMode !== 'none');
    updateAllLayers(delta, elapsed, hasActiveSignal);

    if (bloomPass) {
        bloomPass.enabled = fxConfig.bloomStrength > 0.01;
        bloomPass.strength = fxConfig.bloomStrength + audioState.beatPulse * 0.10;
        bloomPass.radius = fxConfig.bloomRadius;
    }

    if (uberFXPass) {
        const u = uberFXPass.uniforms;
        u.u_time.value = elapsed;
        u.u_bass.value = audioState.bass;
        u.u_snare.value = audioState.snare;
        u.u_high.value = audioState.high;
        u.u_beat.value = audioState.beatPulse;
        u.u_shakeMode.value = vizConfig.enableShakeAndWobble ? 1.0 : 0.0;
        u.u_shakeLevel.value = vizConfig.shakeLevel;
        u.u_mirrorMode.value = Number(fxConfig.mirrorMode);
        u.u_mirrorAdditive.value = fxConfig.mirrorAdditive ? 1.0 : 0.0;
        u.u_rgbShift.value = fxConfig.rgbShift;
        u.u_barrelBlur.value = fxConfig.barrelBlur;
        u.u_wobbleStrength.value = fxConfig.wobbleStrength;
        u.u_wobbleSize.value = fxConfig.wobbleSize;
        u.u_shake.value = fxConfig.shakeAmount;
        u.u_scanlines.value = fxConfig.scanlines;
        u.u_halftone.value = fxConfig.halftone;
        u.u_vignette.value = fxConfig.vignette;
        u.u_saturation.value = fxConfig.saturation;
        u.u_contrast.value = fxConfig.contrast;
        u.u_exposure.value = fxConfig.masterExposure;
        u.u_gamma.value = fxConfig.gamma;
        u.u_blackLift.value = fxConfig.blackLift;
        u.u_strobe.value = fxConfig.strobeOnBeat ? 1.0 : 0.0;
    }

    composer.render();
}