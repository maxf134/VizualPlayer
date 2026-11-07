const audio = document.getElementById('audio');
const fileInput = document.getElementById('audiofile');
const playlistEl = document.getElementById('playlist');
const trackCountEl = document.getElementById('track-count');

const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const seekBar = document.getElementById('seek-bar');
const volumeBar = document.getElementById('volume-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

const btnZenInline = document.getElementById('btn-zen-inline');
const btnZenFloating = document.getElementById('btn-zen-floating');
const btnMic = document.getElementById('btn-mic');
const btnSysAudio = document.getElementById('btn-sys-audio');
const micSelect = document.getElementById('mic-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;

let liveMode = 'none'; // 'none' | 'mic' | 'system'
let liveStream = null;
let liveStreamSource = null;

// ============================================================================
// 0. ПОЛНОЭКРАННЫЙ РЕЖИМ И АВТОСКРЫТИЕ КНОПКИ ПРИ НЕАКТИВНОЙ МЫШКЕ
// ============================================================================
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

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) setZenUIState(false);
});
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) setZenUIState(false);
});

// ============================================================================
// 1. АУДИО-ДВИЖОК С АВТОПОДСТРОЙКОЙ ЧУВСТВИТЕЛЬНОСТИ AGC (AGS)
// ============================================================================
let audioCtx, analyser, fileSource;
let freqData, waveData, audioTextureData, audioTexture;
const FFT_SIZE = 512;
const BIN_COUNT = 256;

const audioState = {
    autoGainEnabled: true,
    targetLevel: 0.42,
    manualGain: 1.35,
    currentGain: 1.35,
    agcEnvelope: 0.25,
    beatHoldTime: 18,
    beatThreshold: 0.32,
    beatDecayRate: 0.97,
    smoothing: 0.80,
    volume: 0,
    sub: 0,
    bass: 0,
    mid: 0,
    high: 0,
    beatPulse: 0,
    beatCutoff: 0.35,
    beatFrames: 0,
    beatCounter: 0,
    audioTime: 0
};

function updateStatusUI(modeLabel, isActive) {
    if (statusText) statusText.textContent = modeLabel;
    if (statusDot) {
        if (isActive) statusDot.classList.add('live');
        else statusDot.classList.remove('live');
    }
    if (btnMic) btnMic.classList.toggle('active', liveMode === 'mic');
    if (btnSysAudio) btnSysAudio.classList.toggle('active', liveMode === 'system');
    if (micSelect) micSelect.style.display = (liveMode === 'mic' && micSelect.options.length > 0) ? 'block' : 'none';
}

function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = audioState.smoothing;

            fileSource = audioCtx.createMediaElementSource(audio);
            fileSource.connect(analyser);
            fileSource.connect(audioCtx.destination);

            freqData = new Uint8Array(BIN_COUNT);
            waveData = new Uint8Array(BIN_COUNT);
        } catch (err) {
            console.error("Ошибка инициализации аудио:", err);
        }
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function stopLiveStream() {
    if (liveStreamSource) {
        try { liveStreamSource.disconnect(); } catch (e) {}
        liveStreamSource = null;
    }
    if (liveStream) {
        liveStream.getTracks().forEach(track => track.stop());
        liveStream = null;
    }
    liveMode = 'none';
    updateStatusUI(isPlaying ? 'Источник: Плейлист (Играет)' : 'Источник: Плейлист (Ожидание)', isPlaying);
}

async function populateAudioDevices(selectedDeviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        micSelect.innerHTML = '';
        audioInputs.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Аудиовход #${idx + 1}`;
            if (selectedDeviceId && dev.deviceId === selectedDeviceId) opt.selected = true;
            micSelect.appendChild(opt);
        });
        if (liveMode === 'mic' && audioInputs.length > 0) {
            micSelect.style.display = 'block';
        }
    } catch (e) {
        console.warn("Не удалось получить список устройств:", e);
    }
}

async function startMicrophoneCapture(deviceId = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Ваш браузер не поддерживает захват микрофона.");
        return;
    }

    try {
        initAudioContext();
        if (isPlaying) pauseTrack();
        stopLiveStream();

        const audioConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        };
        if (deviceId) {
            audioConstraints.deviceId = { exact: deviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        liveStream = stream;
        liveMode = 'mic';

        liveStreamSource = audioCtx.createMediaStreamSource(stream);
        liveStreamSource.connect(analyser);

        const activeTrack = stream.getAudioTracks()[0];
        const currentSettings = activeTrack && activeTrack.getSettings ? activeTrack.getSettings() : {};
        await populateAudioDevices(currentSettings.deviceId || deviceId);

        const label = (activeTrack && activeTrack.label) ? activeTrack.label : 'Микрофон';
        updateStatusUI(`🎤 LIVE: ${label}`, true);

        stream.getAudioTracks()[0].addEventListener('ended', () => {
            if (liveMode === 'mic') stopLiveStream();
        });
    } catch (err) {
        console.error("Ошибка доступа к микрофону:", err);
        alert("Не удалось получить доступ к микрофону. Проверьте разрешения в браузере.");
        stopLiveStream();
    }
}

async function startSystemAudioCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Захват системного звука через окно выбора поддерживается на ПК. На телефоне используйте кнопку «🎤 Микрофон».");
        return;
    }

    try {
        initAudioContext();
        if (isPlaying) pauseTrack();
        stopLiveStream();

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1, height: 1, frameRate: 1 },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                suppressLocalAudioPlayback: false
            }
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            stream.getTracks().forEach(t => t.stop());
            alert("Отметьте галочку «Предоставить доступ к аудио» внизу окна выбора!");
            return;
        }

        stream.getVideoTracks().forEach(vTrack => {
            vTrack.enabled = false;
        });

        liveStream = stream;
        liveMode = 'system';

        liveStreamSource = audioCtx.createMediaStreamSource(stream);
        liveStreamSource.connect(analyser);

        updateStatusUI('🖥️ LIVE: Системный звук (Яндекс Музыка / ПК)', true);

        audioTracks[0].addEventListener('ended', () => {
            if (liveMode === 'system') stopLiveStream();
        });
    } catch (err) {
        stopLiveStream();
    }
}

if (btnMic) {
    btnMic.addEventListener('click', () => {
        if (liveMode === 'mic') stopLiveStream();
        else startMicrophoneCapture();
    });
}

if (btnSysAudio) {
    btnSysAudio.addEventListener('click', () => {
        if (liveMode === 'system') stopLiveStream();
        else startSystemAudioCapture();
    });
}

if (micSelect) {
    micSelect.addEventListener('change', (e) => {
        if (e.target.value) startMicrophoneCapture(e.target.value);
    });
}

// ============================================================================
// 2. СПИСОК 16 ШЕЙДЕРОВ И 12 ЦВЕТОВЫХ ПАЛИТР
// ============================================================================
const TOTAL_GLSL_SHADERS = 16;

const GLSL_SHADER_LIST = {
    '1. Cyber Synthwave Waves (Гладкие холмы)': 0,
    '2. Octagrams Fractal (Волюметрик Shadertoy)': 1,
    '3. Silk Audio Ribbons (Неоновая ткань)': 2,
    '4. Ferrofluid Core (Жидкий металл 3D)': 3,
    '5. UberViz Hyper-Portal (Портал)': 4,
    '6. Quantum Gyroid (Гироидный лабиринт)': 5,
    '7. SoundEclipse (Спектральное затмение)': 6,
    '8. Quantum Plasma Vortex (Плазменный реактор)': 7,
    '9. Singularity Black Hole (Черная дыра)': 8,
    '10. Supernova Plasma Nebula (Туманность)': 9,
    '11. Cyber DNA Double Helix (3D Спираль ДНК)': 10,
    '12. Sacred Mandala Kaleido (Сакральная мандала)': 11,
    '13. Voronoi Cellular Lava (Клеточная плазма)': 12,
    '14. Synthwave Retro Sun & Grid (Ретро-солнце)': 13,
    '15. Quantum Torus Knot (Энерго-узел 3D)': 14,
    '16. Aurora Borealis Flow (Северное сияние)': 15
};

const COLOR_PALETTE_LIST = {
    '1. Cyberpunk Neon (Голубой / Пурпур)': 0,
    '2. Sunset Retrowave (Огонь / Фиолет)': 1,
    '3. Matrix Bio-Lab (Изумруд / Циан)': 2,
    '4. Gold & Ice (Золото / Лед)': 3,
    '5. Tokyo Blood Moon (Алый / Синий)': 4,
    '6. Ultraviolet Acid (Лайм / Ультрафиолет)': 5,
    '7. Arctic Aurora (Северное сияние)': 6,
    '8. Inferno Magma (Раскаленная лава)': 7,
    '9. Pastel Vaporwave (Мята / Розовый неон)': 8,
    '10. Deep Ocean Biolum (Глубоководный неон)': 9,
    '11. Monochrome Silver (Хром и серебро)': 10,
    '12. Rainbow Spectrum (Динамическая радуга)': 11
};

// ============================================================================
// 3. 20 ОТКАЛИБРОВАННЫХ ПРЕСЕТОВ (10 LITE + 10 ULTRA)
// ============================================================================
const PRESETS_CATALOG = {
    // --- 10 LITE ПРЕСЕТОВ ---
    '🟢 LITE 1: Synthwave Retro Horizon': {
        tier: 'lite', shader: 13, palette: 1, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 1.0, tilt: false
    },
    '🟢 LITE 2: Silk Neon Ribbons': {
        tier: 'lite', shader: 2, palette: 0, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.003, glslOp: 1.0, tilt: true
    },
    '🟢 LITE 3: Eclipse Blood Moon': {
        tier: 'lite', shader: 6, palette: 4, layers: ['crystal'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 1.0, tilt: false
    },
    '🟢 LITE 4: Aurora Borealis Flow': {
        tier: 'lite', shader: 15, palette: 6, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.002, glslOp: 1.0, tilt: false
    },
    '🟢 LITE 5: Smooth Cyber Hills': {
        tier: 'lite', shader: 0, palette: 0, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.004, glslOp: 1.0, tilt: true
    },
    '🟢 LITE 6: Sacred Mandala Gold': {
        tier: 'lite', shader: 11, palette: 3, layers: ['wheel'], mirror: 1, barrel: 0.0, wobble: 0.0, glslOp: 0.95, tilt: false
    },
    '🟢 LITE 7: Deep Ocean Ripples': {
        tier: 'lite', shader: 9, palette: 9, layers: ['ripples', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.003, glslOp: 0.95, tilt: true
    },
    '🟢 LITE 8: Silver Prism Core': {
        tier: 'lite', shader: 14, palette: 10, layers: ['crystal', 'eclipse'], mirror: 1, barrel: 0.0, wobble: 0.0, glslOp: 0.9, tilt: false
    },
    '🟢 LITE 9: Arctic Audio Strips': {
        tier: 'lite', shader: 2, palette: 6, layers: ['strips', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 0.95, tilt: true
    },
    '🟢 LITE 10: Vaporwave Neon Tunnel': {
        tier: 'lite', shader: 4, palette: 8, layers: ['tunnel', 'stars'], mirror: 3, barrel: 0.0, wobble: 0.003, glslOp: 0.9, tilt: false
    },

    // --- 10 ULTRA ПРЕСЕТОВ ---
    '🔥 ULTRA 1: Cyber Waves & Crystal (Твой пресет)': {
        tier: 'ultra', shader: 0, palette: 0, layers: ['crystal', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.006, glslOp: 1.0, tilt: true
    },
    '🔥 ULTRA 2: Singularity Black Hole': {
        tier: 'ultra', shader: 8, palette: 3, layers: ['eclipse', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.003, glslOp: 0.95, tilt: false
    },
    '🔥 ULTRA 3: Octagrams Fractal Kaleido': {
        tier: 'ultra', shader: 1, palette: 0, layers: ['crystal', 'stars'], mirror: 3, barrel: 0.08, wobble: 0.004, glslOp: 0.72, tilt: false
    },
    '🔥 ULTRA 4: Ferrofluid Liquid Metal': {
        tier: 'ultra', shader: 3, palette: 4, layers: ['ripples', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.005, glslOp: 0.95, tilt: false
    },
    '🔥 ULTRA 5: Hyper-Portal 8x Kaleido': {
        tier: 'ultra', shader: 4, palette: 5, layers: ['tunnel', 'stars'], mirror: 4, barrel: 0.10, wobble: 0.005, glslOp: 0.90, tilt: false
    },
    '🔥 ULTRA 6: Bio-Gyroid Lab': {
        tier: 'ultra', shader: 5, palette: 2, layers: ['crystal', 'stars'], mirror: 1, barrel: 0.08, wobble: 0.004, glslOp: 0.92, tilt: true
    },
    '🔥 ULTRA 7: Quantum Plasma Reactor': {
        tier: 'ultra', shader: 7, palette: 5, layers: ['crystal', 'wheel'], mirror: 3, barrel: 0.08, wobble: 0.004, glslOp: 0.88, tilt: false
    },
    '🔥 ULTRA 8: Helix DNA Evolution': {
        tier: 'ultra', shader: 10, palette: 6, layers: ['ripples', 'stars'], mirror: 0, barrel: 0.06, wobble: 0.004, glslOp: 0.74, tilt: false
    },
    '🔥 ULTRA 9: Supernova Magma Core': {
        tier: 'ultra', shader: 12, palette: 7, layers: ['wheel', 'eclipse'], mirror: 3, barrel: 0.10, wobble: 0.005, glslOp: 0.90, tilt: false
    },
    '🔥 ULTRA 10: Quantum Torus Nexus': {
        tier: 'ultra', shader: 14, palette: 11, layers: ['strips', 'stars'], mirror: 1, barrel: 0.08, wobble: 0.004, glslOp: 0.88, tilt: false
    }
};

const PRESET_KEYS = Object.keys(PRESETS_CATALOG);
const LITE_PRESET_KEYS = PRESET_KEYS.filter(k => PRESETS_CATALOG[k].tier === 'lite');
const ULTRA_PRESET_KEYS = PRESET_KEYS.filter(k => PRESETS_CATALOG[k].tier === 'ultra');

const CONTROL_MODES = [
    '🎛️ Пресеты (Ручной выбор)',
    '🟢 Auto-DJ: Перемешивать LITE (10)',
    '🔥 Auto-DJ: Перемешивать ULTRA (10)'
];

const vizConfig = {
    controlMode: '🎛️ Пресеты (Ручной выбор)',
    preset: '🔥 ULTRA 1: Cyber Waves & Crystal (Твой пресет)',
    performanceMode: 'Lite (Макс FPS)',
    shaderMode: 0,
    glslOpacity: 1.0,
    enable3DLayers: true,
    barsPerSwitch: 8,

    enableShakeAndWobble: true,
    shakeLevel: 0.85,

    cameraTilt: true,
    tiltSpeed: 0.6,
    tiltAmount: 0.28,
    colorPalette: 0,
    speed: 1.0,
    raySteps: 20,

    ripples:   { on: false, opacity: 0.0,  targetOpacity: 0.0,  depth: 140 },
    crystal:   { on: true,  opacity: 0.85, targetOpacity: 0.85, freakout: 0.55 },
    tunnel:    { on: false, opacity: 0.0,  targetOpacity: 0.0,  twist: 1.2 },
    wheel:     { on: false, opacity: 0.0,  targetOpacity: 0.0,  hueRange: 0.6 },
    eclipse:   { on: false, opacity: 0.0,  targetOpacity: 0.0,  radius: 0.36, brightness: 1.2 },
    strips:    { on: false, opacity: 0.0,  targetOpacity: 0.0,  audioDepth: 120 },
    bars:      { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    stars:     { on: true,  opacity: 0.80, targetOpacity: 0.80 },
    lightLeak: { on: false, opacity: 0.0,  targetOpacity: 0.0,  freakOut: 0.45 }
};

// Твои стандартные настройки яркости со скриншота
const fxConfig = {
    masterExposure: 1.1,
    gamma: 0.8,
    blackLift: -0.05,
    bloomStrength: 0.15,
    bloomRadius: 0.40,
    contrast: 1.28,
    saturation: 1.35,
    vignette: 0.6,

    mirrorMode: 0,
    mirrorAdditive: false,
    rgbShift: 0.003,
    barrelBlur: 0.0,
    wobbleStrength: 0.006,
    wobbleSize: 10.0,
    shakeAmount: 0.012,
    scanlines: 0.08,
    halftone: 0.0,
    strobeOnBeat: false
};

// ============================================================================
// 4. ОПТИМИЗИРОВАННЫЕ 16 GLSL ШЕЙДЕРОВ (ИДЕАЛЬНАЯ ЦЕНТРОВКА ЧЕРЕЗ vUv)
// ============================================================================
const backgroundGLSLVertex = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.999, 1.0);
    }
`;

const backgroundGLSLFragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
    #else
        precision mediump float;
    #endif

    varying vec2 vUv;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_audioTime;
    uniform float u_sub;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_beat;
    uniform int u_mode;
    uniform int u_palette;
    uniform int u_maxSteps;
    uniform float u_opacity;
    uniform sampler2D u_audioTex;

    #define PI 3.14159265359
    #define MAX_LOOP 32

    float safeAtan(float y, float x) {
        return atan(y, abs(x) < 0.0001 ? 0.0001 : x);
    }

    float safePow(float x, float y) {
        return pow(max(x, 0.0001), y);
    }

    vec3 safePow3(vec3 x, float y) {
        return pow(max(x, vec3(0.0001)), vec3(y));
    }

    mat2 rot(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, -s, s, c);
    }

    vec3 getPalette(float t) {
        vec3 a = vec3(0.5, 0.4, 0.6);
        vec3 b = vec3(0.5, 0.4, 0.4);
        vec3 c = vec3(1.0, 1.0, 1.0);
        vec3 d = vec3(0.55, 0.20, 0.75);

        if (u_palette == 1) {
            a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5); c = vec3(1.0, 0.7, 0.4); d = vec3(0.0, 0.15, 0.20);
        } else if (u_palette == 2) {
            a = vec3(0.2, 0.5, 0.3); b = vec3(0.2, 0.5, 0.3); c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30);
        } else if (u_palette == 3) {
            a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5); c = vec3(2.0, 1.0, 0.0); d = vec3(0.50, 0.20, 0.25);
        } else if (u_palette == 4) {
            a = vec3(0.5, 0.2, 0.3); b = vec3(0.5, 0.3, 0.4); c = vec3(1.0, 0.6, 0.8); d = vec3(0.00, 0.35, 0.55);
        } else if (u_palette == 5) {
            a = vec3(0.45, 0.5, 0.45); b = vec3(0.45, 0.5, 0.45); c = vec3(1.0, 1.0, 1.0); d = vec3(0.25, 0.75, 0.0);
        } else if (u_palette == 6) {
            a = vec3(0.2, 0.55, 0.6); b = vec3(0.3, 0.45, 0.4); c = vec3(1.0, 0.8, 1.0); d = vec3(0.45, 0.60, 0.75);
        } else if (u_palette == 7) {
            a = vec3(0.55, 0.25, 0.1); b = vec3(0.45, 0.3, 0.15); c = vec3(1.0, 0.8, 0.5); d = vec3(0.0, 0.10, 0.25);
        } else if (u_palette == 8) {
            a = vec3(0.65, 0.55, 0.7); b = vec3(0.35, 0.35, 0.3); c = vec3(1.0, 1.0, 1.0); d = vec3(0.45, 0.15, 0.65);
        } else if (u_palette == 9) {
            a = vec3(0.15, 0.45, 0.75); b = vec3(0.25, 0.45, 0.35); c = vec3(1.0, 1.0, 1.2); d = vec3(0.50, 0.62, 0.78);
        } else if (u_palette == 10) {
            a = vec3(0.55, 0.58, 0.62); b = vec3(0.45, 0.45, 0.48); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.02, 0.05);
        } else if (u_palette == 11) {
            t += u_time * 0.08;
            a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0, 0.33, 0.67);
        }
        return a + b * cos(6.28318 * (c * t + d));
    }

    vec3 acesToneMapping(vec3 x) {
        x = clamp(x, 0.0, 20.0);
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float sampleFFT(float x) {
        return texture2D(u_audioTex, vec2(clamp(x, 0.01, 0.99), 0.25)).r;
    }

    float sampleWave(float x) {
        return (texture2D(u_audioTex, vec2(clamp(x, 0.01, 0.99), 0.75)).r - 0.5) * 2.0;
    }

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    // --- 0. CYBER SYNTHWAVE WAVES ---
    float wavesHeight(vec2 p) {
        float amp = 0.65 + u_bass * 0.55;
        float h = sin(p.x * 0.45 + u_audioTime * 1.1) * cos(p.y * 0.38 + u_audioTime * 0.9) * amp;
        h += sin(p.x * 0.9 - p.y * 0.6 + u_audioTime * 1.4) * (0.25 + u_mid * 0.25);
        return h;
    }

    vec3 renderCyberWaves(vec2 uv) {
        vec3 ro = vec3(0.0, 2.3, u_audioTime * 3.2);
        vec3 rd = normalize(vec3(uv.x, uv.y - 0.12, 1.35));

        float fftX = sampleFFT(abs(uv.x) * 0.7);
        vec3 skyCol = getPalette(uv.y * 0.5 + 0.2) * (0.08 + 0.15 * exp(-abs(uv.y) * 4.0));
        float aurora = smoothstep(0.08, 0.0, abs(uv.y - 0.22 - fftX * 0.18 + sin(uv.x * 4.0 + u_time) * 0.04));
        skyCol += getPalette(abs(uv.x) + u_time * 0.1) * aurora * (0.4 + u_mid * 0.8);

        if (rd.y > 0.05) return skyCol;

        float t = 1.2;
        bool hit = false;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = p.y - wavesHeight(p.xz);
            if (d < 0.025) { hit = true; break; }
            if (t > 35.0) break;
            t += d * 0.72;
        }
        if (!hit) return skyCol;

        vec3 p = ro + rd * t;
        float h0 = wavesHeight(p.xz);
        vec3 n = normalize(vec3(
            h0 - wavesHeight(p.xz + vec2(0.05, 0.0)),
            0.05,
            h0 - wavesHeight(p.xz + vec2(0.0, 0.05))
        ));

        vec3 lightDir = normalize(vec3(0.3, 0.8, 1.0));
        float diff = max(dot(n, lightDir), 0.0);
        float fresnel = safePow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        float colorIndex = p.y * 0.22 + p.z * 0.03 - u_audioTime * 0.08;
        vec3 waveCol = getPalette(colorIndex);
        vec3 rimCol = getPalette(colorIndex + 0.35);

        vec3 col = waveCol * (0.28 + diff * 0.75) + rimCol * fresnel * (0.75 + u_bass * 0.9);
        float fog = exp(-t * 0.045);
        return mix(skyCol, col, fog);
    }

    // --- 1. OCTAGRAMS FRACTAL (ULTRA 3: Сбалансированная яркость без белых засветов!) ---
    float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    float mapOctagrams(vec3 p) {
        p.z = mod(p.z, 8.0) - 4.0;
        for (int i = 0; i < 4; i++) {
            p = abs(p) - vec3(0.68 + u_bass * 0.16, 0.68 + u_mid * 0.14, 0.85);
            p.xy *= rot(0.48 + u_time * 0.05);
            p.xz *= rot(0.35 + u_audioTime * 0.08);
        }
        return sdBox(p, vec3(0.48, 0.14, 0.14));
    }

    vec3 renderOctagrams(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 2.5);
        vec3 rd = normalize(vec3(uv, 1.2));
        rd.xy *= rot(sin(u_time * 0.2) * 0.25);

        vec3 accCol = vec3(0.0);
        float t = 0.6;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = mapOctagrams(p);
            // Мягкое затухание свечения с защитой от выгорания в белый
            float glow = (0.0032 / (0.055 + d * d * 2.2)) * exp(-t * 0.08);
            vec3 c = getPalette(t * 0.07 + float(i) * 0.025 + u_time * 0.1);
            accCol += c * glow * (0.48 + u_bass * 0.45);
            t += max(abs(d) * 0.68, 0.06);
            if (t > 20.0) break;
        }
        return accCol * 0.42;
    }

    // --- 2. SILK AUDIO RIBBONS ---
    vec3 renderSilkRibbons(vec2 uv) {
        vec3 col = vec3(0.01, 0.01, 0.03);
        float xNorm = uv.x * 0.5 + 0.5;
        float fft = sampleFFT(abs(uv.x) * 0.8);
        float wave = sampleWave(xNorm);

        for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float phase = fi * 0.75 + u_audioTime * (0.85 + fi * 0.15);
            float yRibbon = sin(uv.x * (2.2 + fi * 0.45) + phase) * (0.24 + u_bass * 0.22)
                          + cos(uv.x * (4.2 - fi * 0.3) - u_time * 1.3) * (0.09 + u_mid * 0.14)
                          + wave * 0.13 * (1.0 - fi * 0.12);
            float dist = abs(uv.y - yRibbon);
            float thickness = 0.008 + fft * 0.03;
            float intensity = thickness / (dist + 0.007);
            float fold = 0.5 + 0.5 * sin(uv.x * 10.0 + phase * 2.0);
            vec3 ribbonCol = getPalette(fi * 0.18 + uv.x * 0.25 + u_time * 0.08);
            col += ribbonCol * intensity * (0.4 + fold * 0.65) * (0.5 + u_bass * 0.45);
        }
        return col * 0.65;
    }

    // --- 3. FERROFLUID CORE ---
    float mapFerrofluid(vec3 p) {
        vec3 q = p;
        q.xz *= rot(u_time * 0.35);
        q.xy *= rot(u_time * 0.25);

        float r = length(q);
        vec3 n = q / max(r, 0.001);
        float spikes = sin(n.x * 6.0 + u_audioTime * 2.0) 
                     * sin(n.y * 6.0 - u_audioTime * 1.8) 
                     * sin(n.z * 6.0 + u_audioTime * 2.2);
        float disp = spikes * (0.24 + u_bass * 0.55);
        float sphere = r - (1.48 + u_sub * 0.25 + disp);

        vec3 rp = p;
        rp.xy *= rot(0.4 + sin(u_time * 0.5) * 0.2);
        float ringDist = length(vec2(length(rp.xz) - (2.35 + u_bass * 0.3), rp.y)) - 0.05;
        return min(sphere, ringDist);
    }

    vec3 renderFerrofluid(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -4.5);
        vec3 rd = normalize(vec3(uv, 1.3));

        float rUV = length(uv);
        float angle = safeAtan(uv.y, uv.x);
        float fftRay = sampleFFT(abs(angle) / PI);
        vec3 bgCol = getPalette(rUV + u_time * 0.1) * exp(-rUV * 2.2) * (0.2 + fftRay * 0.4);

        float t = 1.5;
        float glow = 0.0;
        bool hit = false;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = mapFerrofluid(p);
            glow += 0.005 / (0.025 + d * d);
            if (d < 0.015) { hit = true; break; }
            if (t > 8.0) break;
            t += d * 0.7;
        }

        vec3 col = bgCol + getPalette(u_time * 0.15 + 0.3) * glow * (0.35 + u_bass * 0.55);
        if (hit) {
            vec3 p = ro + rd * t;
            float d0 = mapFerrofluid(p);
            vec3 n = normalize(vec3(
                mapFerrofluid(p + vec3(0.01, 0.0, 0.0)) - d0,
                mapFerrofluid(p + vec3(0.0, 0.01, 0.0)) - d0,
                mapFerrofluid(p + vec3(0.0, 0.0, 0.01)) - d0
            ));
            vec3 l1 = normalize(vec3(2.0, 3.0, -2.0));
            float diff1 = max(dot(n, l1), 0.0);
            float spec = safePow(max(dot(reflect(-l1, n), -rd), 0.0), 24.0);
            float fresnel = safePow(1.0 - max(dot(n, -rd), 0.0), 3.0);

            vec3 baseColor = getPalette(length(p) * 0.5 - u_audioTime * 0.2);
            vec3 rimColor = getPalette(length(p) * 0.5 + 0.4);
            col = baseColor * (0.22 + diff1 * 0.75)
                + rimColor * fresnel * (0.9 + u_bass * 0.8)
                + vec3(0.9, 0.95, 1.0) * spec * (0.6 + u_high * 0.7);
        }
        return col;
    }

    // --- 4. UBERVIZ HYPER-PORTAL ---
    vec3 renderHyperPortal(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 4.5);
        vec3 rd = normalize(vec3(uv, 1.1));
        rd.xy *= rot(u_audioTime * 0.12);

        vec3 col = vec3(0.0);
        float t = 0.3;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            p.x += sin(p.z * 0.18) * 0.45;
            p.y += cos(p.z * 0.18) * 0.45;
            p.xy *= rot(p.z * 0.12);

            vec2 q = abs(p.xy);
            float oct = max(max(q.x, q.y), (q.x + q.y) * 0.7071);
            float ringZ = mod(p.z, 1.5) - 0.75;
            float fftVal = sampleFFT(fract(p.z * 0.05));
            float radius = 1.85 + fftVal * 0.45 + u_bass * 0.25;

            float tunnelWall = abs(oct - radius) - 0.04;
            float ribs = length(vec2(tunnelWall, ringZ)) - 0.05;
            float d = min(tunnelWall + 0.12, ribs);

            float glow = 0.008 / (0.02 + d * d);
            vec3 ringCol = getPalette(p.z * 0.05 - u_time * 0.2 + fftVal * 0.3);
            col += ringCol * glow * (0.55 + fftVal * 1.1 + u_beat * 0.35);

            t += max(d * 0.72, 0.06);
            if (t > 26.0) break;
        }
        return col * 0.52;
    }

    // --- 5. QUANTUM GYROID ---
    float mapGyroid(vec3 p) {
        p.xy *= rot(p.z * 0.08);
        float scale = 1.6;
        vec3 q = p * scale;
        float g = abs(dot(sin(q), cos(q.yzx))) / scale - (0.06 + u_bass * 0.06);
        float tunnel = 0.95 - length(p.xy);
        return max(g, tunnel);
    }

    vec3 renderGyroid(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 2.2);
        vec3 rd = normalize(vec3(uv, 1.1));
        rd.xy *= rot(u_time * 0.08);

        float t = 0.0;
        vec3 accGlow = vec3(0.0);
        bool hit = false;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = mapGyroid(p);
            accGlow += getPalette(p.z * 0.08 + u_time * 0.1) * (0.004 / (0.025 + d * d));
            if (d < 0.015) { hit = true; break; }
            if (t > 20.0) break;
            t += d * 0.72;
        }

        vec3 col = accGlow * (0.6 + u_bass * 0.65);
        if (hit) {
            vec3 p = ro + rd * t;
            float veins = smoothstep(0.88, 0.99, sin(p.x * 10.0) * sin(p.y * 10.0) * sin(p.z * 10.0));
            vec3 surfCol = getPalette(p.z * 0.1 + length(p.xy) * 0.3);
            col += surfCol * 0.65 * exp(-t * 0.08) + getPalette(u_time) * veins * (1.0 + u_high * 1.5);
        }
        return col;
    }

    // --- 6. SOUNDECLIPSE SPECTRUM (LITE 3: Идеально отцентрировано по (0, 0)) ---
    vec3 renderSoundEclipse(vec2 uv) {
        float r = length(uv);
        float a = safeAtan(uv.y, uv.x);
        float normAngle = abs(a) / PI;

        float fft = sampleFFT(normAngle * 0.85);
        float wave = sampleWave(a / (2.0 * PI) + 0.5);
        float baseRadius = 0.32 + u_bass * 0.07;

        float coronaDist = abs(r - (baseRadius + wave * 0.045));
        float corona = 0.014 / (coronaDist + 0.005);
        vec3 col = getPalette(normAngle + u_time * 0.1) * corona * (0.65 + u_bass * 0.6);

        float numBars = 72.0;
        float barCell = fract(normAngle * numBars) - 0.5;
        float barIndex = floor(normAngle * numBars) / numBars;
        float barFFT = sampleFFT(barIndex * 0.85);
        float barLen = barFFT * (0.36 + u_bass * 0.14);

        if (r > baseRadius + 0.018 && r < baseRadius + 0.018 + barLen) {
            float barMask = smoothstep(0.38, 0.15, abs(barCell));
            float tipGlow = smoothstep(0.0, 1.0, (r - baseRadius) / max(barLen, 0.01));
            vec3 barCol = getPalette(barIndex + u_time * 0.15 + tipGlow * 0.3);
            col += barCol * barMask * (0.9 + tipGlow * 1.1);
        }

        if (r < baseRadius) {
            vec2 p = uv * rot(u_audioTime * 0.4) / max(baseRadius, 0.01);
            float rings = sin(length(p) * 14.0 - u_audioTime * 4.0 + sin(a * 6.0) * 1.2);
            col += getPalette(length(p) + u_time * 0.2) * smoothstep(0.65, 0.98, rings) * (0.45 + u_mid * 0.75);
        }
        return col;
    }

    // --- 7. QUANTUM PLASMA VORTEX (НОВЫЙ ULTRA 7: 3D Плазменный реактор вместо скучного города) ---
    float mapPlasmaVortex(vec3 p) {
        p.xz *= rot(u_time * 0.3);
        p.xy *= rot(p.z * 0.35 - u_audioTime * 0.8);

        float r = length(p.xy);
        float a = safeAtan(p.y, p.x);

        // Трехрукавный спиральный плазменный тор-реактор
        float spiral = sin(a * 3.0 + p.z * 2.2 - u_audioTime * 3.5) * (0.28 + u_bass * 0.25);
        float tube = abs(r - (1.25 + spiral)) - (0.08 + u_mid * 0.06);

        // Пульсирующее энергетическое ядро по центру
        float core = length(p) - (0.55 + u_sub * 0.25 + sin(p.x * 6.0 + u_time * 4.0) * 0.06);
        return min(tube, core);
    }

    vec3 renderPlasmaVortex(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -4.2);
        vec3 rd = normalize(vec3(uv, 1.2));

        vec3 col = vec3(0.0);
        float t = 0.4;
        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = mapPlasmaVortex(p);
            float fft = sampleFFT(fract(length(p.xy) * 0.35 + float(i) * 0.03));
            float glow = (0.0045 / (0.035 + d * d * 1.8)) * exp(-t * 0.07);
            vec3 c = getPalette(length(p) * 0.28 - u_audioTime * 0.15 + fft * 0.35);
            col += c * glow * (0.55 + fft * 0.95 + u_bass * 0.5);
            t += max(abs(d) * 0.65, 0.06);
            if (t > 14.0) break;
        }
        return col * 0.52;
    }

    // --- 8. SINGULARITY BLACK HOLE (ULTRA 2: Строго отцентрировано по (0, 0)!) ---
    vec3 renderBlackHole(vec2 uv) {
        // Камера смотрит строго в центр (0,0,0) без вертикального смещения
        vec3 ro = vec3(0.0, 0.0, -4.6);
        vec3 rd = normalize(vec3(uv, 1.3));

        vec3 p = ro;
        vec3 col = vec3(0.0);
        float holeRadius = 0.62 + u_sub * 0.15;
        mat2 diskTilt = rot(0.32 + sin(u_time * 0.3) * 0.08);
        mat2 diskRoll = rot(sin(u_time * 0.2) * 0.12);

        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            float r = length(p);
            if (r < holeRadius) break;

            // Симметричная гравитационная линза к центру (0, 0, 0)
            vec3 gravity = -normalize(p) * (0.075 + u_bass * 0.045) / max(r * r, 0.14);
            rd = normalize(rd + gravity);
            p += rd * 0.18;

            // Наклоняем сам аккреционный диск вокруг центра (0, 0, 0)
            vec3 dp = p;
            dp.yz *= diskTilt;
            dp.xy *= diskRoll;

            float diskDist = abs(dp.y);
            float radialDist = length(dp.xz);
            if (radialDist > holeRadius * 1.18 && radialDist < 3.5) {
                float angle = safeAtan(dp.z, dp.x);
                float spiral = sin(radialDist * 9.0 - u_audioTime * 5.0 + angle * 3.0);
                float fft = sampleFFT(clamp((radialDist - 0.75) / 2.75, 0.01, 0.99));
                float density = exp(-diskDist * 13.0) * smoothstep(3.5, 1.35, radialDist);
                vec3 diskCol = getPalette(radialDist * 0.35 - u_audioTime * 0.15 + fft * 0.3);
                col += diskCol * density * (0.11 + 0.05 * spiral + fft * 0.22) * (0.85 + u_bass * 0.85);
            }
            if (r > 9.5) break;
        }
        // Фотонное кольцо идеально совпадает с центром черной дыры
        float ring = 0.013 / (abs(length(uv) - 0.22 - u_bass * 0.035) + 0.008);
        col += getPalette(u_time * 0.2 + 0.5) * ring * (0.55 + u_high * 0.85);
        return col;
    }

    // --- 9. SUPERNOVA / DEEP OCEAN PLASMA NEBULA ---
    vec3 renderSupernovaNebula(vec2 uv) {
        vec2 p = uv * 2.1;
        vec3 col = vec3(0.0);
        float amp = 0.58 + u_bass * 0.48;

        for (int i = 1; i <= 4; i++) {
            float fi = float(i);
            p *= rot(0.38 + u_time * 0.03);
            p += vec2(
                sin(p.y * (1.2 + fi * 0.35) + u_audioTime * 1.1),
                cos(p.x * (1.4 + fi * 0.35) - u_audioTime * 0.9)
            ) * (amp / fi);

            float fft = sampleFFT(fract(length(p) * 0.25 + fi * 0.18));
            float filament = 0.045 / (abs(sin(p.x + p.y + u_audioTime * 0.5)) + 0.03);
            vec3 layerCol = getPalette(fi * 0.2 + length(uv) * 0.4 + u_time * 0.08);
            col += layerCol * filament * (0.16 + fft * 0.38);
        }
        return col * 0.58;
    }

    // --- 10. CYBER DNA DOUBLE HELIX (ULTRA 8: Отрегулирована яркость, без белых засветов!) ---
    vec3 renderCyberDNA(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -3.6);
        vec3 rd = normalize(vec3(uv, 1.15));
        vec3 col = vec3(0.0);
        float t = 0.5;

        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            p.xy *= rot(u_time * 0.22);

            float z = p.z + u_audioTime * 2.8;
            float twist = z * 0.85;
            float rad = 1.0 + u_bass * 0.32;

            vec2 s1 = vec2(cos(twist), sin(twist)) * rad;
            float dStrand1 = length(p.xy - s1) - 0.14;
            float dStrand2 = length(p.xy + s1) - 0.14;

            vec2 rp = p.xy * rot(-twist);
            float rungZ = abs(mod(z, 0.65) - 0.325);
            float dRung = max(length(vec2(rp.y, rungZ)) - (0.06 + u_mid * 0.04), abs(rp.x) - rad);

            float d = min(min(dStrand1, dStrand2), dRung);

            float fft = sampleFFT(fract(z * 0.06));
            // Мягкая формула свечения с защитой от выгорания в белый цвет
            float glow = (0.0028 / (0.055 + d * d * 2.4)) * exp(-t * 0.09);
            col += getPalette(z * 0.08 + fft * 0.35 + u_time * 0.1) * glow * (0.42 + fft * 0.55 + u_bass * 0.35);

            t += max(abs(d) * 0.68, 0.08);
            if (t > 15.0) break;
        }
        return col * 0.42;
    }

    // --- 11. SACRED MANDALA KALEIDOSCOPE ---
    vec3 renderSacredMandala(vec2 uv) {
        vec2 p = uv * (1.8 - u_bass * 0.35);
        vec3 col = vec3(0.0);

        for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float r = length(p);
            float a = safeAtan(p.y, p.x);
            float segments = 6.0 + mod(fi, 2.0) * 2.0;
            a = mod(a, 2.0 * PI / segments);
            a = abs(a - PI / segments);
            p = vec2(cos(a), sin(a)) * r;

            p = abs(p) - (0.42 + u_mid * 0.15);
            p *= rot(u_audioTime * 0.35 + fi * 0.45);

            float fft = sampleFFT(clamp(r * 0.45, 0.02, 0.98));
            float line = abs(sin(p.x * 8.0 + u_time * 2.0) * cos(p.y * 8.0 - u_time * 2.0));
            float glow = (0.014 + fft * 0.02) / (abs(length(p) - 0.35) + 0.015);
            col += getPalette(r * 0.35 + fi * 0.2 + u_time * 0.1) * (glow + smoothstep(0.88, 0.99, line) * 0.4);
        }
        return col * (0.34 + u_bass * 0.25);
    }

    // --- 12. VORONOI CELLULAR LAVA ---
    vec3 renderVoronoiLava(vec2 uv) {
        vec2 p = uv * (4.0 - u_bass * 0.55);
        p += vec2(u_audioTime * 0.6, sin(u_time * 0.4) * 0.8);

        vec2 n = floor(p);
        vec2 f = fract(p) - 0.5;

        float md1 = 8.0;
        float md2 = 8.0;
        vec2 bestCell = vec2(0.0);

        for (int j = 0; j <= 1; j++) {
            for (int i = 0; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j)) - 0.5;
                vec2 cellId = n + g;
                float h = hash21(cellId);
                vec2 o = 0.38 * sin(u_audioTime * 1.4 + 6.2831 * vec2(h, fract(h * 17.3)));
                vec2 r = g + o - f;
                float d = dot(r, r);
                if (d < md1) {
                    md2 = md1;
                    md1 = d;
                    bestCell = cellId;
                } else if (d < md2) {
                    md2 = d;
                }
            }
        }

        float edge = sqrt(md2) - sqrt(md1);
        float cellRnd = hash21(bestCell);
        float fft = sampleFFT(cellRnd);

        vec3 cellCol = getPalette(cellRnd + u_time * 0.08) * (0.2 + fft * 0.85);
        vec3 borderCol = getPalette(cellRnd + 0.45) * (0.024 / (edge + 0.014)) * (0.7 + u_bass * 1.0);
        float corePulse = exp(-md1 * (4.5 - fft * 2.5)) * (0.4 + u_beat * 0.7);

        return cellCol * corePulse + borderCol * 0.58;
    }

    // --- 13. SYNTHWAVE RETRO SUN & GRID (LITE 1: Отцентрировано относительно центра (0, 0)!) ---
    vec3 renderRetroSunGrid(vec2 uv) {
        vec3 col = vec3(0.02, 0.0, 0.06);

        // Солнце расположено строго в центре экрана (0.0, 0.0)
        float sunR = length(uv);
        float sunRadius = 0.34 + u_bass * 0.045;

        if (sunR < sunRadius) {
            float stripes = sin((uv.y + 0.15) * 60.0 - u_time * 3.0);
            float mask = step(0.0, stripes + (uv.y + 0.05) * 3.0);
            vec3 sunCol = mix(vec3(1.0, 0.1, 0.55), vec3(1.0, 0.85, 0.1), clamp((uv.y + sunRadius) / (2.0 * sunRadius), 0.0, 1.0));
            col += sunCol * mask * (1.05 + u_bass * 0.45);
        }
        // Центральный ореол солнца
        col += getPalette(length(uv) + u_time * 0.08) * exp(-sunR * 3.8) * (0.55 + u_bass * 0.55);

        // Симметричная центральная линия горизонта с эквалайзером гор вверху и перспективой сетки внизу
        if (uv.y >= 0.0) {
            float fftMtn = sampleFFT(abs(uv.x) * 0.85);
            float mtnH = 0.03 + fftMtn * (0.16 + u_bass * 0.12);
            if (uv.y < mtnH) {
                float edgeGlow = smoothstep(0.018, 0.0, abs(uv.y - mtnH));
                col = mix(col * 0.35, getPalette(abs(uv.x) + 0.2) * 1.35, edgeGlow);
            }
        } else {
            float py = max(abs(uv.y), 0.006);
            vec2 gridUV = vec2(uv.x / py, 1.0 / py + u_audioTime * 4.5);
            vec2 grid = abs(fract(gridUV * 0.65) - 0.5);
            float line = min(grid.x, grid.y);
            float intensity = smoothstep(0.08, 0.0, line) * exp(-0.14 / py);
            vec3 gridCol = getPalette(gridUV.y * 0.04 + u_time * 0.1);
            col += gridCol * intensity * (0.9 + u_bass * 1.0) + gridCol * 0.12 * py;
        }
        return col;
    }

    // --- 14. QUANTUM TORUS KNOT ---
    float mapTorusKnot(vec3 p) {
        p.xz *= rot(u_time * 0.35);
        p.xy *= rot(u_time * 0.22);

        float r = length(p.xz);
        float a = safeAtan(p.z, p.x);

        float kAngle = a * 1.5 + u_audioTime * 0.8;
        vec2 cp = vec2(r - 1.5, p.y);
        cp *= rot(kAngle);
        cp.x = abs(cp.x) - (0.42 + u_bass * 0.22);

        return length(cp) - (0.16 + u_mid * 0.08);
    }

    vec3 renderTorusKnot(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -4.5);
        vec3 rd = normalize(vec3(uv, 1.25));
        vec3 col = vec3(0.0);
        float t = 0.8;

        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            vec3 p = ro + rd * t;
            float d = mapTorusKnot(p);
            float glow = (0.0045 / (0.03 + d * d * 1.8)) * exp(-t * 0.07);
            col += getPalette(length(p) * 0.3 + float(i) * 0.02 + u_time * 0.12) * glow * (0.55 + u_bass * 0.85);
            t += max(abs(d) * 0.68, 0.06);
            if (t > 11.0) break;
        }
        return col * 0.55;
    }

    // --- 15. AURORA BOREALIS FLOW (НОВЫЙ LITE 4: Плавное северное сияние без ряби в глазах!) ---
    vec3 renderAuroraFlow(vec2 uv) {
        vec3 col = vec3(0.01, 0.02, 0.05);
        float r = length(uv);

        // Мягкие перетекающие световые завесы северного сияния + плавное центральное кольцо
        for (int i = 1; i <= 4; i++) {
            float fi = float(i);
            vec2 p = uv * rot(fi * 0.35 + u_time * 0.06);
            float wave = sin(p.x * (1.8 + fi * 0.35) + u_audioTime * 0.75 + fi) * (0.22 + u_bass * 0.18)
                       + cos(p.y * (1.5 + fi * 0.25) - u_time * 0.55) * (0.14 + u_mid * 0.12);
            float dist = abs(p.y - wave);
            float fft = sampleFFT(clamp(abs(p.x) * 0.6 + fi * 0.12, 0.02, 0.98));
            float curtain = (0.022 + fft * 0.035) / (dist + 0.045);
            vec3 c = getPalette(fi * 0.22 + p.x * 0.3 + u_time * 0.06);
            col += c * curtain * (0.28 + u_bass * 0.32);
        }

        float halo = 0.018 / (abs(r - (0.34 + u_bass * 0.08)) + 0.035);
        col += getPalette(r + u_time * 0.1) * halo * (0.45 + u_mid * 0.5);
        return col * 0.62;
    }

    void main() {
        if (u_opacity <= 0.01) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        // Гарантированный геометрический центр (0.0, 0.0) при любом масштабе и pixelRatio
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
        if (aspect < 1.0) {
            uv = (vUv - 0.5) * vec2(1.0, 1.0 / max(aspect, 0.01));
        }

        vec3 col = vec3(0.0);
        if (u_mode == 0) col = renderCyberWaves(uv);
        else if (u_mode == 1) col = renderOctagrams(uv);
        else if (u_mode == 2) col = renderSilkRibbons(uv);
        else if (u_mode == 3) col = renderFerrofluid(uv);
        else if (u_mode == 4) col = renderHyperPortal(uv);
        else if (u_mode == 5) col = renderGyroid(uv);
        else if (u_mode == 6) col = renderSoundEclipse(uv);
        else if (u_mode == 7) col = renderPlasmaVortex(uv);
        else if (u_mode == 8) col = renderBlackHole(uv);
        else if (u_mode == 9) col = renderSupernovaNebula(uv);
        else if (u_mode == 10) col = renderCyberDNA(uv);
        else if (u_mode == 11) col = renderSacredMandala(uv);
        else if (u_mode == 12) col = renderVoronoiLava(uv);
        else if (u_mode == 13) col = renderRetroSunGrid(uv);
        else if (u_mode == 14) col = renderTorusKnot(uv);
        else col = renderAuroraFlow(uv);

        col = acesToneMapping(col);
        col = safePow3(col, 0.92);

        gl_FragColor = vec4(clamp(col * u_opacity, 0.0, 1.5), 1.0);
    }
`;

// ============================================================================
// 5. THREE.JS СЦЕНА И ОБЛЕГЧЕННЫЕ 3D-СЛОИ ÜBERVIZ
// ============================================================================
let scene, camera, renderer, composer, bloomPass, uberFXPass;
let bgShaderMaterial, bgUniforms;
let mainStage;
let gui;
const layers = {};
const layerKeys = ['ripples', 'crystal', 'tunnel', 'wheel', 'eclipse', 'strips', 'bars', 'stars', 'lightLeak'];

function createAudioDataTexture() {
    audioTextureData = new Uint8Array(256 * 2);
    audioTexture = new THREE.DataTexture(
        audioTextureData,
        256,
        2,
        THREE.LuminanceFormat,
        THREE.UnsignedByteType
    );
    audioTexture.magFilter = THREE.LinearFilter;
    audioTexture.minFilter = THREE.LinearFilter;
    audioTexture.wrapS = THREE.ClampToEdgeWrapping;
    audioTexture.wrapT = THREE.ClampToEdgeWrapping;
    audioTexture.generateMipmaps = false;
    audioTexture.needsUpdate = true;
}

function noise3D(x, y, z) {
    return (
        Math.sin(x * 1.2 + Math.cos(y * 1.3 + z * 0.9)) * 0.55 +
        Math.cos(y * 1.7 - Math.sin(z * 1.4 + x * 1.1)) * 0.45
    );
}

function getThemeColor(t, paletteIdx = vizConfig.colorPalette) {
    const c = new THREE.Color();
    const frac = ((t % 1.0) + 1.0) % 1.0;
    const s = Math.sin(frac * Math.PI * 2);
    const p = Number(paletteIdx);

    if (p === 0) c.setHSL(0.52 + s * 0.18, 0.95, 0.58);
    else if (p === 1) c.setHSL(0.92 + s * 0.12, 0.95, 0.58);
    else if (p === 2) c.setHSL(0.38 + s * 0.08, 0.95, 0.54);
    else if (p === 3) c.setHSL(frac > 0.5 ? 0.11 : 0.56, 0.9, 0.60);
    else if (p === 4) c.setHSL(frac > 0.4 ? 0.98 : 0.62, 0.95, 0.56);
    else if (p === 5) c.setHSL(0.26 + s * 0.16, 0.98, 0.56);
    else if (p === 6) c.setHSL(0.46 + s * 0.10, 0.90, 0.60);
    else if (p === 7) c.setHSL(0.04 + Math.abs(s) * 0.08, 0.98, 0.55);
    else if (p === 8) c.setHSL(0.78 + s * 0.15, 0.85, 0.68);
    else if (p === 9) c.setHSL(0.55 + s * 0.08, 0.95, 0.60);
    else if (p === 10) c.setHSL(0.60, 0.12, 0.62 + s * 0.22);
    else c.setHSL(frac, 0.95, 0.58);

    return c;
}

function createGlowDotTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(200, 240, 255, 0.85)');
    grad.addColorStop(0.7, 'rgba(0, 180, 255, 0.25)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

function buildSceneAndLayers() {
    createAudioDataTexture();

    bgUniforms = {
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_time:       { value: 0.0 },
        u_audioTime:  { value: 0.0 },
        u_sub:        { value: 0.0 },
        u_bass:       { value: 0.0 },
        u_mid:        { value: 0.0 },
        u_high:       { value: 0.0 },
        u_beat:       { value: 0.0 },
        u_mode:       { value: Number(vizConfig.shaderMode) },
        u_palette:    { value: Number(vizConfig.colorPalette) },
        u_maxSteps:   { value: vizConfig.raySteps },
        u_opacity:    { value: vizConfig.glslOpacity },
        u_audioTex:   { value: audioTexture }
    };

    bgShaderMaterial = new THREE.ShaderMaterial({
        vertexShader: backgroundGLSLVertex,
        fragmentShader: backgroundGLSLFragment,
        uniforms: bgUniforms,
        depthTest: false,
        depthWrite: false
    });

    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgShaderMaterial);
    bgQuad.frustumCulled = false;
    bgQuad.renderOrder = -100;
    scene.add(bgQuad);

    const dotTex = createGlowDotTexture();
    mainStage = new THREE.Group();
    scene.add(mainStage);

    // СЛОЙ 1: RIPPLES
    layers.ripples = new THREE.Group();
    layers.ripples.lines = [];
    for (let j = 0; j < 14; j++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
        const mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        layers.ripples.add(line);
        layers.ripples.lines.push(line);
    }
    mainStage.add(layers.ripples);

    // СЛОЙ 2: CRYSTAL
    layers.crystal = new THREE.Group();
    const crystalGeo = new THREE.IcosahedronGeometry(135, 1);
    crystalGeo.userData.basePositions = crystalGeo.attributes.position.array.slice();
    layers.crystal.wireMesh = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({
        color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending
    }));
    layers.crystal.coreMesh = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({
        color: 0xff0077, wireframe: false, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    layers.crystal.coreMesh.scale.setScalar(0.92);
    layers.crystal.add(layers.crystal.wireMesh);
    layers.crystal.add(layers.crystal.coreMesh);
    mainStage.add(layers.crystal);

    // СЛОЙ 3: TUNNEL
    layers.tunnel = new THREE.Group();
    layers.tunnel.rings = [];
    const ringGeo = new THREE.RingGeometry(150, 158, 6);
    for (let i = 0; i < 18; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.position.z = -i * 75 + 200;
        layers.tunnel.add(mesh);
        layers.tunnel.rings.push(mesh);
    }
    mainStage.add(layers.tunnel);

    // СЛОЙ 4: WHEEL
    layers.wheel = new THREE.Group();
    layers.wheel.spokes = [];
    const spokeGeo = new THREE.PlaneGeometry(10, 120);
    spokeGeo.translate(0, 60, 0);
    for (let i = 0; i < 32; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const spoke = new THREE.Mesh(spokeGeo, mat);
        spoke.rotation.z = (i / 32) * Math.PI * 2;
        layers.wheel.add(spoke);
        layers.wheel.spokes.push(spoke);
    }
    mainStage.add(layers.wheel);

    // СЛОЙ 5: ECLIPSE
    layers.eclipse = new THREE.Group();
    const eclipseShaderMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
            u_time: { value: 0 }, u_bass: { value: 0 }, u_mid: { value: 0 },
            u_radius: { value: 0.36 }, u_brightness: { value: 1.3 }, u_opacity: { value: 1.0 },
            u_color1: { value: new THREE.Color(0x00ffff) }, u_color2: { value: new THREE.Color(0xff0088) }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv; uniform float u_time, u_bass, u_mid, u_radius, u_brightness, u_opacity; uniform vec3 u_color1, u_color2;
            void main() {
                float r = length(vUv);
                float a = atan(vUv.y, abs(vUv.x) < 0.0001 ? 0.0001 : vUv.x);
                float rad = u_radius + u_bass * 0.08;
                float flare = sin(a * 12.0 + u_time * 3.0) * cos(a * 7.0 - u_time * 2.0) * (0.02 + u_mid * 0.05);
                float corona = (0.02 * u_brightness) / (abs(r - (rad + flare)) + 0.008) * smoothstep(rad - 0.04, rad, r);
                vec3 col = mix(u_color1, u_color2, 0.5 + 0.5 * sin(a * 3.0 + u_time));
                gl_FragColor = vec4(clamp(col * corona * u_opacity, 0.0, 2.0), clamp(corona * u_opacity, 0.0, 1.0));
            }
        `
    });
    layers.eclipse.shaderMat = eclipseShaderMat;
    layers.eclipse.add(new THREE.Mesh(new THREE.PlaneGeometry(750, 750), eclipseShaderMat));
    mainStage.add(layers.eclipse);

    // СЛОЙ 6: STRIPS
    layers.strips = new THREE.Group();
    layers.strips.lines = [];
    layers.strips.history = Array.from({ length: 12 }, () => new Float32Array(36));
    for (let s = 0; s < 12; s++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x00ffcc, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
        }));
        layers.strips.add(line);
        layers.strips.lines.push(line);
    }
    mainStage.add(layers.strips);

    // СЛОЙ 7: BARS
    layers.bars = new THREE.Group();
    layers.bars.meshes = [];
    const barGeo = new THREE.BoxGeometry(12, 85, 12);
    for (let i = 0; i < 24; i++) {
        const mesh = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        }));
        mesh.userData = { angle: (i / 24) * Math.PI * 2, zOffset: (i / 24) * 1200 };
        layers.bars.add(mesh);
        layers.bars.meshes.push(mesh);
    }
    mainStage.add(layers.bars);

    // СЛОЙ 8: STARS
    layers.stars = new THREE.Group();
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(450 * 3);
    for (let i = 0; i < 450 * 3; i += 3) {
        starPos[i]     = (Math.random() - 0.5) * 1400;
        starPos[i + 1] = (Math.random() - 0.5) * 1400;
        starPos[i + 2] = (Math.random() - 0.5) * 1400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    layers.stars.points = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 20, map: dotTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xaaffff
    }));
    layers.stars.add(layers.stars.points);
    mainStage.add(layers.stars);

    // СЛОЙ 9: LIGHT LEAK
    layers.lightLeak = new THREE.Group();
    const leakShaderMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { u_time: { value: 0 }, u_bass: { value: 0 }, u_opacity: { value: 0.0 }, u_freak: { value: 0.45 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv; uniform float u_time, u_bass, u_opacity, u_freak;
            void main() {
                if (u_opacity <= 0.01) discard;
                vec2 p = vUv * 2.0 - 1.0;
                float n1 = sin(p.x * 2.5 + u_time * 0.7) * cos(p.y * 2.0 - u_time * 0.5);
                float n2 = cos(p.x * 3.5 - u_time * 0.9 + p.y * 2.5);
                float leak = smoothstep(0.2, 0.95, (n1 + n2) * 0.5 + u_bass * 0.35 * u_freak);
                vec3 col = mix(vec3(1.0, 0.1, 0.5), vec3(0.0, 0.8, 1.0), 0.5 + 0.5 * sin(u_time * 0.4 + p.x));
                gl_FragColor = vec4(clamp(col * leak * u_opacity * 0.55, 0.0, 1.0), 1.0);
            }
        `
    });
    const leakMesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1000), leakShaderMat);
    leakMesh.position.z = 150;
    layers.lightLeak.shaderMat = leakShaderMat;
    layers.lightLeak.add(leakMesh);
    scene.add(layers.lightLeak);
}

// ============================================================================
// 6. ОПТИМИЗИРОВАННЫЙ FX RACK (МИНИМУМ ЧТЕНИЙ ТЕКСТУРЫ)
// ============================================================================
const UberVizFXShader = {
    uniforms: {
        tDiffuse:         { value: null },
        u_time:           { value: 0.0 },
        u_bass:           { value: 0.0 },
        u_beat:           { value: 0.0 },
        u_shakeMode:      { value: 1.0 },
        u_shakeLevel:     { value: 0.85 },
        u_mirrorMode:     { value: 0 },
        u_mirrorAdditive: { value: 0.0 },
        u_rgbShift:       { value: 0.003 },
        u_barrelBlur:     { value: 0.0 },
        u_wobbleStrength: { value: 0.006 },
        u_wobbleSize:     { value: 10.0 },
        u_shake:          { value: 0.012 },
        u_scanlines:      { value: 0.08 },
        u_halftone:       { value: 0.0 },
        u_vignette:       { value: 0.60 },
        u_saturation:     { value: 1.35 },
        u_contrast:       { value: 1.28 },
        u_exposure:       { value: 1.10 },
        u_gamma:          { value: 0.80 },
        u_blackLift:      { value: -0.05 },
        u_strobe:         { value: 0.0 },
        u_resolution:     { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
        #else
            precision mediump float;
        #endif

        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float u_time, u_bass, u_beat, u_shakeMode, u_shakeLevel;
        uniform int u_mirrorMode;
        uniform float u_mirrorAdditive, u_rgbShift, u_barrelBlur, u_wobbleStrength, u_wobbleSize;
        uniform float u_shake, u_scanlines, u_halftone, u_vignette, u_saturation, u_contrast;
        uniform float u_exposure, u_gamma, u_blackLift, u_strobe;
        uniform vec2 u_resolution;

        #define PI 3.14159265359

        vec3 safePow3(vec3 x, float y) {
            return pow(max(x, vec3(0.0001)), vec3(y));
        }

        vec2 applyMirror(vec2 uv, int mode) {
            vec2 p = uv - 0.5;
            if (mode == 1) p.x = -abs(p.x);
            else if (mode == 2) p.y = -abs(p.y);
            else if (mode == 3) p = -abs(p);
            else if (mode == 4) {
                float r = length(p);
                float safeX = abs(p.x) < 0.0001 ? 0.0001 : p.x;
                float a = mod(atan(p.y, safeX), PI / 4.0);
                a = abs(a - PI / 8.0);
                p = vec2(cos(a), sin(a)) * r;
            }
            return clamp(p + 0.5, 0.001, 0.999);
        }

        vec3 sampleWithLensFX(vec2 uv) {
            vec2 center = uv - 0.5;
            float dist2 = dot(center, center);
            vec2 u = clamp(uv + center * (u_barrelBlur * 0.22 * dist2), 0.001, 0.999);

            float shiftAmt = u_rgbShift + (u_bass * 0.003 + u_beat * 0.003) * u_shakeLevel * u_shakeMode;
            if (shiftAmt < 0.0004) {
                return texture2D(tDiffuse, u).rgb;
            }

            vec2 shiftDir = (u_shakeMode > 0.5)
                ? vec2(cos(u_time * 1.5), sin(u_time * 1.5)) * shiftAmt
                : center * shiftAmt;

            float r = texture2D(tDiffuse, clamp(u + shiftDir, 0.001, 0.999)).r;
            float g = texture2D(tDiffuse, u).g;
            float b = texture2D(tDiffuse, clamp(u - shiftDir, 0.001, 0.999)).b;
            return vec3(r, g, b);
        }

        void main() {
            vec2 uv = vUv;

            if (u_shakeMode > 0.5 && u_shakeLevel > 0.001) {
                float effShake = u_shake * u_shakeLevel;
                if (effShake > 0.0001) {
                    uv += vec2(sin(u_time * 45.0), cos(u_time * 38.0)) * effShake * (u_beat * 0.7 + u_bass * 0.3);
                }
                float effWobble = u_wobbleStrength * u_shakeLevel;
                if (effWobble > 0.0001) {
                    float w = effWobble * (0.4 + u_bass * 0.8);
                    uv.x += sin(uv.y * u_wobbleSize + u_time * 3.0) * w;
                    uv.y += cos(uv.x * u_wobbleSize - u_time * 2.5) * w;
                }
            }

            vec2 finalUv = (u_mirrorMode > 0) ? applyMirror(uv, u_mirrorMode) : clamp(uv, 0.001, 0.999);
            vec3 col = sampleWithLensFX(finalUv);

            if (u_mirrorMode > 0 && u_mirrorAdditive > 0.5) {
                vec3 origCol = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
                col = max(col, origCol * 0.65) + col * 0.3;
            }

            if (u_halftone > 0.05) {
                vec2 grid = fract(vUv * u_resolution / (6.0 + (1.0 - u_halftone) * 8.0)) - 0.5;
                float dotMask = smoothstep(0.45, 0.2, length(grid));
                col = mix(col, col * (0.4 + 0.8 * dotMask), u_halftone);
            }

            if (u_scanlines > 0.01) {
                float line = sin(vUv.y * u_resolution.y * 1.2) * 0.5 + 0.5;
                col *= 1.0 - u_scanlines * (1.0 - line) * 0.6;
            }

            col = max(col + vec3(u_blackLift), vec3(0.0));
            col *= u_exposure;
            col = safePow3(col, 1.0 / max(u_gamma, 0.2));

            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(luma), col, u_saturation);
            col = (col - 0.5) * u_contrast + 0.5;
            col = max(col, 0.0);

            col = col / (1.0 + col * 0.28);

            if (u_strobe > 0.5 && u_beat > 0.82) {
                col = mix(col, vec3(1.0) - col, 0.6);
            }

            float dCenter = length(vUv - 0.5);
            col *= smoothstep(0.96, 0.96 - u_vignette * 0.7, dCenter);

            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
    `
};

// ============================================================================
// 7. УПРАВЛЕНИЕ: РУЧНОЙ ВЫБОР ИЛИ AUTO-DJ ПЕРЕМЕШИВАНИЕ LITE / ULTRA
// ============================================================================
function applyPerformanceProfile(profile) {
    if (!renderer || !composer) return;
    if (profile === 'Lite (Макс FPS)') {
        vizConfig.raySteps = 18;
        renderer.setPixelRatio(0.85);
    } else if (profile === 'Balanced (Авто FPS)') {
        vizConfig.raySteps = 24;
        renderer.setPixelRatio(1.0);
    } else {
        vizConfig.raySteps = 32;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bgUniforms) bgUniforms.u_maxSteps.value = vizConfig.raySteps;
}

function loadPresetInternal(presetName) {
    const p = PRESETS_CATALOG[presetName];
    if (!p) return;

    vizConfig.preset = presetName;

    layerKeys.forEach(k => {
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

// Случайное перемешивание пресетов внутри выбранной категории (LITE или ULTRA)
function shufflePresetByTier(tier) {
    const pool = (tier === 'lite') ? LITE_PRESET_KEYS : ULTRA_PRESET_KEYS;
    if (pool.length === 0) return;
    const candidates = pool.filter(k => k !== vizConfig.preset);
    const randomKey = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : pool[0];
    loadPresetInternal(randomKey);
}

function stepAutoDJShuffle() {
    if (vizConfig.controlMode === '🟢 Auto-DJ: Перемешивать LITE (10)') {
        shufflePresetByTier('lite');
    } else if (vizConfig.controlMode === '🔥 Auto-DJ: Перемешивать ULTRA (10)') {
        shufflePresetByTier('ultra');
    } else {
        // Если нажали горячую клавишу R в ручном режиме — перемешиваем внутри текущего класса пресета
        const curPreset = PRESETS_CATALOG[vizConfig.preset];
        const curTier = curPreset ? curPreset.tier : 'ultra';
        shufflePresetByTier(curTier);
    }
}

function initGUI() {
    gui = new dat.GUI({ autoPlace: true, width: isMobile ? 270 : 370 });
    if (isMobile) gui.close();

    // ПАПКА 1: Режим (Пресеты / Auto-DJ LITE / Auto-DJ ULTRA) + Тряска и Оптимизация
    const fMain = gui.addFolder('1. РЕЖИМ: ПРЕСЕТЫ ИЛИ AUTO-DJ');
    fMain.add({ fullscreen: toggleZenFullscreen }, 'fullscreen').name('⛶ ПОЛНЫЙ ЭКРАН (Скрыть UI)');

    fMain.add(vizConfig, 'controlMode', CONTROL_MODES).name('🎛️ Режим работы').listen().onChange(mode => {
        if (mode === '🟢 Auto-DJ: Перемешивать LITE (10)') {
            const cur = PRESETS_CATALOG[vizConfig.preset];
            if (!cur || cur.tier !== 'lite') shufflePresetByTier('lite');
        } else if (mode === '🔥 Auto-DJ: Перемешивать ULTRA (10)') {
            const cur = PRESETS_CATALOG[vizConfig.preset];
            if (!cur || cur.tier !== 'ultra') shufflePresetByTier('ultra');
        }
    });

    fMain.add(vizConfig, 'preset', PRESET_KEYS).name('🎬 Выбрать пресет (20)').listen().onChange(onUserSelectPreset);

    fMain.add(vizConfig, 'performanceMode', [
        'Lite (Макс FPS)',
        'Balanced (Авто FPS)',
        'Ultra (Макс Графика)'
    ]).name('⚡ Профиль нагрузки GPU').onChange(applyPerformanceProfile);

    fMain.add(vizConfig, 'enableShakeAndWobble').name('🔥 Тряска под бит (Вкл/Выкл)').listen();
    fMain.add(vizConfig, 'shakeLevel', 0.0, 2.0, 0.05).name('💥 Уровень тряски (0-200%)').listen();

    fMain.add(vizConfig, 'shaderMode', GLSL_SHADER_LIST).name('Фон (16 GLSL)').listen().onChange(v => {
        vizConfig.controlMode = '🎛️ Пресеты (Ручной выбор)';
        bgUniforms.u_mode.value = Number(v);
        if (gui) gui.updateDisplay();
    });
    fMain.add(vizConfig, 'colorPalette', COLOR_PALETTE_LIST).name('Цветовая палитра (12)').listen().onChange(v => {
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
    if (!isMobile) fBright.open();

    // ПАПКА 3: Автоподстройка чувствительности AGC (AGS)
    const fAudio = gui.addFolder('3. АВТО-ЧУВСТВИТЕЛЬНОСТЬ (AGC / AGS)');
    fAudio.add(audioState, 'autoGainEnabled').name('⚡ Авто-чувств. AGC (Вкл)').listen();
    fAudio.add(audioState, 'targetLevel', 0.15, 0.75, 0.02).name('Целевой уровень AGC');
    fAudio.add(audioState, 'manualGain', 0.3, 3.5, 0.05).name('Ручной Gain / Множитель');
    fAudio.add(audioState, 'currentGain', 0.1, 5.0, 0.01).name('📊 Текущий Gain (Auto)').listen();
    fAudio.add(audioState, 'beatThreshold', 0.15, 0.7, 0.02).name('Порог бита (Threshold)');
    fAudio.add(vizConfig, 'barsPerSwitch', 4, 32, 4).name('Битов до смены Auto-DJ');

    // ПАПКА 4: Ручной конструктор 3D-слоев ÜberViz
    const fViz = gui.addFolder('4. 3D СЛОИ ÜBERVIZ (Конструктор)');
    fViz.add(vizConfig, 'enable3DLayers').name('Включить 3D слои').listen();
    fViz.add({ nextPreset: stepAutoDJShuffle }, 'nextPreset').name('🎲 Случайный пресет (R)');

    const bindLayerToggle = (key, label) => {
        fViz.add(vizConfig[key], 'on').name(label).listen().onChange(v => {
            vizConfig.enable3DLayers = true;
            vizConfig.controlMode = '🎛️ Пресеты (Ручной выбор)';
            vizConfig[key].targetOpacity = v ? 0.88 : 0.0;
            if (gui) gui.updateDisplay();
        });
    };
    bindLayerToggle('ripples',   '🌊 Ripples (Шум-волны)');
    bindLayerToggle('crystal',   '💎 Crystal (Гео-ядро)');
    bindLayerToggle('tunnel',    '🌀 Tunnel (Туннель)');
    bindLayerToggle('wheel',     '🎡 Wheel (Лучи спектра)');
    bindLayerToggle('eclipse',   '🌑 Eclipse (Затмение)');
    bindLayerToggle('strips',    '📊 Strips (3D-История)');
    bindLayerToggle('bars',      '⚡ Bars (Неон-колонны)');
    bindLayerToggle('stars',     '✨ Stars (Частицы)');
    bindLayerToggle('lightLeak', '🌈 Light Leak (Засветы)');

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

// ============================================================================
// 8. ИНИЦИАЛИЗАЦИЯ WEBGL И КОМПОЗЕРА
// ============================================================================
function initThree() {
    if (scene) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, 600);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', depth: false, stencil: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(0.85);

    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    document.body.appendChild(renderer.domElement);

    buildSceneAndLayers();

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
// 9. УПРАВЛЕНИЕ ПЛЕЕРОМ И ПЛЕЙЛИСТОМ
// ============================================================================
fileInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const wasEmpty = playlist.length === 0;
    files.forEach(file => {
        playlist.push({
            name: file.name.replace(/\.[^/.]+$/, ""),
            url: URL.createObjectURL(file)
        });
    });

    updatePlaylistUI();

    if (!isPlaying && wasEmpty) {
        loadTrack(0);
        playTrack();
    }
});

function updatePlaylistUI() {
    playlistEl.innerHTML = '';
    trackCountEl.textContent = playlist.length;

    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${track.name}`;
        if (index === currentTrackIndex) li.classList.add('active');
        
        li.addEventListener('dblclick', () => {
            loadTrack(index);
            playTrack();
        });
        li.addEventListener('touchend', () => {
            loadTrack(index);
            playTrack();
        });
        playlistEl.appendChild(li);
    });
}

function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    audio.src = playlist[currentTrackIndex].url;
    updatePlaylistUI();
    initAudioContext();
}

function playTrack() {
    if (!audio.src && playlist.length > 0) {
        loadTrack(0);
    }
    if (!audio.src) return;
    if (liveMode !== 'none') stopLiveStream();
    initAudioContext();
    audio.play().catch(() => {});
    isPlaying = true;
    btnPlay.textContent = '⏸';
    updateStatusUI(`🎵 Играет: ${playlist[currentTrackIndex]?.name || 'Трек'}`, true);
}

function pauseTrack() {
    audio.pause();
    isPlaying = false;
    btnPlay.textContent = '▶';
    if (liveMode === 'none') updateStatusUI('Источник: Плейлист (Пауза)', false);
}

function stopTrack() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    btnPlay.textContent = '▶';
    if (liveMode === 'none') updateStatusUI('Источник: Плейлист (Стоп)', false);
}

btnPlay.addEventListener('click', () => {
    if (isPlaying) pauseTrack();
    else playTrack();
});

btnStop.addEventListener('click', stopTrack);

btnNext.addEventListener('click', () => {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    loadTrack(currentTrackIndex);
    playTrack();
});

btnPrev.addEventListener('click', () => {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrackIndex);
    playTrack();
});

volumeBar.addEventListener('input', (e) => {
    audio.volume = e.target.value;
});

audio.addEventListener('timeupdate', () => {
    if (!isNaN(audio.duration) && audio.duration > 0) {
        seekBar.value = (audio.currentTime / audio.duration) * 100;
        currentTimeEl.textContent = formatTime(audio.currentTime);
        durationEl.textContent = formatTime(audio.duration);
    }
});

seekBar.addEventListener('input', (e) => {
    if (!isNaN(audio.duration) && audio.duration > 0) {
        audio.currentTime = (e.target.value / 100) * audio.duration;
    }
});

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

audio.addEventListener('ended', () => {
    if (playlist.length > 0) {
        currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
        loadTrack(currentTrackIndex);
        playTrack();
    }
});

// ============================================================================
// 10. ГЛАВНЫЙ ЦИКЛ АНИМАЦИИ И АЛГОРИТМ АВТО-ЧУВСТВИТЕЛЬНОСТИ (AGC)
// ============================================================================
const clock = new THREE.Clock();
initThree();
animate();

function updateAudioAnalysis(delta) {
    const isAudioSourceActive = isPlaying || (liveMode !== 'none');

    if (analyser && freqData && isAudioSourceActive) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(waveData);

        let subSum = 0, bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
        for (let i = 0; i < 4; i++) subSum += freqData[i];
        for (let i = 4; i < 14; i++) bassSum += freqData[i];
        for (let i = 14; i < 80; i++) midSum += freqData[i];
        for (let i = 80; i < 200; i++) highSum += freqData[i];
        for (let i = 0; i < BIN_COUNT; i++) totalSum += freqData[i];

        const rawAvg = totalSum / BIN_COUNT / 255;
        const rawBassNorm = bassSum / 10 / 255;
        const energySignal = Math.max(rawAvg * 0.65 + rawBassNorm * 0.35, 0.001);

        const isSilentSignal = (liveMode !== 'none' && rawAvg < 0.009);

        if (!isSilentSignal) {
            if (audioState.autoGainEnabled) {
                const attackOrRelease = (energySignal > audioState.agcEnvelope) ? 0.14 : 0.025;
                audioState.agcEnvelope += (energySignal - audioState.agcEnvelope) * attackOrRelease;
                const clampedEnv = Math.max(audioState.agcEnvelope, 0.055);
                const computedAutoGain = (audioState.targetLevel / clampedEnv) * (audioState.manualGain / 1.35);
                audioState.currentGain = Math.min(Math.max(computedAutoGain, 0.35), 4.5);
            } else {
                audioState.currentGain = audioState.manualGain;
            }

            const g = audioState.currentGain;

            audioTextureData.set(freqData, 0);
            audioTextureData.set(waveData, 256);
            audioTexture.needsUpdate = true;

            const targetSub  = Math.min((subSum / 4 / 255) * g, 2.2);
            const targetBass = Math.min(rawBassNorm * g, 2.2);
            const targetMid  = Math.min((midSum / 66 / 255) * g, 2.0);
            const targetHigh = Math.min((highSum / 120 / 255) * g, 2.0);
            const targetVol  = Math.min(rawAvg * g, 2.0);

            audioState.sub    += (targetSub  - audioState.sub)  * 0.35;
            audioState.bass   += (targetBass - audioState.bass) * 0.35;
            audioState.mid    += (targetMid  - audioState.mid)  * 0.25;
            audioState.high   += (targetHigh - audioState.high) * 0.25;
            audioState.volume += (targetVol  - audioState.volume) * 0.25;

            if (audioState.volume > audioState.beatCutoff && audioState.volume > audioState.beatThreshold) {
                audioState.beatPulse = 1.0;
                audioState.beatCutoff = audioState.volume * 1.15;
                audioState.beatFrames = 0;
                audioState.beatCounter++;

                // Перемешивание либо LITE, либо ULTRA пресетов в зависимости от выбранного режима Auto-DJ
                if (audioState.beatCounter % vizConfig.barsPerSwitch === 0) {
                    if (vizConfig.controlMode === '🟢 Auto-DJ: Перемешивать LITE (10)') {
                        shufflePresetByTier('lite');
                    } else if (vizConfig.controlMode === '🔥 Auto-DJ: Перемешивать ULTRA (10)') {
                        shufflePresetByTier('ultra');
                    }
                }
            } else {
                if (audioState.beatFrames <= audioState.beatHoldTime) {
                    audioState.beatFrames++;
                } else {
                    audioState.beatCutoff *= audioState.beatDecayRate;
                    audioState.beatCutoff = Math.max(audioState.beatCutoff, audioState.beatThreshold);
                }
            }
            audioState.beatPulse *= 0.86;
        } else {
            audioState.sub    *= 0.90;
            audioState.bass   *= 0.90;
            audioState.mid    *= 0.90;
            audioState.high   *= 0.90;
            audioState.volume *= 0.90;
            audioState.beatPulse *= 0.82;
        }
    } else {
        audioState.sub    *= 0.90;
        audioState.bass   *= 0.90;
        audioState.mid    *= 0.90;
        audioState.high   *= 0.90;
        audioState.volume *= 0.90;
        audioState.beatPulse *= 0.82;
    }

    audioState.audioTime += delta * vizConfig.speed * (0.35 + audioState.bass * 1.3 + audioState.beatPulse * 0.4);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.getElapsedTime();
    updateAudioAnalysis(delta);

    const t = audioState.audioTime;
    const bass = audioState.bass;
    const mid = audioState.mid;
    const beat = audioState.beatPulse;
    const hasActiveSignal = isPlaying || (liveMode !== 'none');
    const effShakeLvl = vizConfig.enableShakeAndWobble ? vizConfig.shakeLevel : 0.0;

    if (bgUniforms) {
        bgUniforms.u_time.value = elapsed * vizConfig.speed;
        bgUniforms.u_audioTime.value = t;
        bgUniforms.u_sub.value = audioState.sub;
        bgUniforms.u_bass.value = bass;
        bgUniforms.u_mid.value = mid;
        bgUniforms.u_high.value = audioState.high;
        bgUniforms.u_beat.value = beat;
    }

    mainStage.visible = vizConfig.enable3DLayers;
    layers.lightLeak.visible = vizConfig.enable3DLayers && vizConfig.lightLeak.opacity > 0.01;

    if (vizConfig.enableShakeAndWobble && vizConfig.cameraTilt && effShakeLvl > 0.01) {
        const tiltAmp = vizConfig.tiltAmount * Math.min(effShakeLvl, 1.5);
        mainStage.rotation.x = Math.sin(elapsed * vizConfig.tiltSpeed * 0.7) * tiltAmp;
        mainStage.rotation.y = Math.cos(elapsed * vizConfig.tiltSpeed * 0.5) * tiltAmp;
        mainStage.rotation.z = Math.sin(elapsed * 0.25) * 0.15 * Math.min(effShakeLvl, 1.5);
    } else {
        mainStage.rotation.set(0, 0, 0);
    }

    if (vizConfig.enable3DLayers) {
        layerKeys.forEach(k => {
            const cfg = vizConfig[k];
            cfg.opacity += (cfg.targetOpacity - cfg.opacity) * 0.12;
            layers[k].visible = cfg.opacity > 0.01;
        });

        // СЛОЙ 1: RIPPLES
        if (layers.ripples.visible) {
            const op = vizConfig.ripples.opacity;
            const lines = layers.ripples.lines;
            const count = lines.length;
            for (let j = 0; j < count; j++) {
                const line = lines[j];
                line.material.opacity = op * 0.95;
                const posAttr = line.geometry.attributes.position;
                const colAttr = line.geometry.attributes.color;
                const posArr = posAttr.array;
                const colArr = colAttr.array;
                const segs = posArr.length / 3;
                const yBase = (j - count / 2) * 26;
                const lineColor = getThemeColor(j / count + t * 0.08);

                for (let i = 0; i < segs; i++) {
                    const normX = i / (segs - 1) - 0.5;
                    const waveVal = (waveData && hasActiveSignal) ? ((waveData[i * 4] - 128) / 128) : 0;
                    const n = noise3D(normX * 3.5, j * 0.28, t * 0.8);
                    posArr[i * 3]     = normX * 720;
                    posArr[i * 3 + 1] = yBase + n * 35 * (0.35 + mid);
                    posArr[i * 3 + 2] = n * (45 + bass * vizConfig.ripples.depth) + waveVal * 70 * bass;

                    const bright = 0.65 + 0.35 * Math.sin(normX * Math.PI);
                    colArr[i * 3]     = lineColor.r * bright;
                    colArr[i * 3 + 1] = lineColor.g * bright;
                    colArr[i * 3 + 2] = lineColor.b * bright;
                }
                posAttr.needsUpdate = true;
                colAttr.needsUpdate = true;
            }
        }

        // СЛОЙ 2: CRYSTAL
        if (layers.crystal.visible) {
            const op = vizConfig.crystal.opacity;
            const geo = layers.crystal.wireMesh.geometry;
            const pos = geo.attributes.position.array;
            const base = geo.userData.basePositions;

            for (let i = 0; i < pos.length; i += 3) {
                const bin = (i / 3) % 64;
                const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[bin] / 255) * audioState.currentGain * 0.75, 1.5) : 0;
                const spike = 1.0 + fVal * vizConfig.crystal.freakout * 0.85 + beat * 0.25;
                pos[i]     = base[i] * spike;
                pos[i + 1] = base[i + 1] * spike;
                pos[i + 2] = base[i + 2] * spike;
            }
            geo.attributes.position.needsUpdate = true;

            layers.crystal.rotation.x += delta * (0.4 + bass);
            layers.crystal.rotation.y += delta * (0.6 + mid);
            layers.crystal.wireMesh.material.opacity = op * 0.9;
            layers.crystal.coreMesh.material.opacity = op * (0.15 + beat * 0.25);
            layers.crystal.wireMesh.material.color.copy(getThemeColor(t * 0.1));
            layers.crystal.coreMesh.material.color.copy(getThemeColor(t * 0.1 + 0.4));
        }

        // СЛОЙ 3: TUNNEL
        if (layers.tunnel.visible) {
            const op = vizConfig.tunnel.opacity;
            const rings = layers.tunnel.rings;
            rings.forEach((ring, idx) => {
                ring.position.z += delta * 260 * (0.5 + bass * 1.4);
                if (ring.position.z > 520) ring.position.z -= rings.length * 75;

                const depthNorm = (ring.position.z + 1150) / 1670;
                const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[(idx * 4) % 128] / 255) * audioState.currentGain * 0.75, 1.4) : 0;
                const scale = 0.8 + fVal * 0.9 + bass * 0.35;
                ring.scale.set(scale, scale, 1);
                ring.rotation.z = idx * 0.16 * vizConfig.tunnel.twist + t * 0.4;
                ring.material.opacity = op * Math.sin(Math.max(0, Math.min(1, depthNorm)) * Math.PI) * 0.85;
                ring.material.color.copy(getThemeColor(idx / rings.length + t * 0.1));
            });
        }

        // СЛОЙ 4: WHEEL
        if (layers.wheel.visible) {
            const op = vizConfig.wheel.opacity;
            layers.wheel.rotation.z += delta * 0.35;
            layers.wheel.spokes.forEach((spoke, i) => {
                const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[i * 4] / 255) * audioState.currentGain * 0.75, 1.4) : 0.1;
                spoke.scale.y = 0.25 + fVal * 2.4 + bass * 0.5;
                spoke.scale.x = 0.6 + fVal * 1.2;
                spoke.material.opacity = op * (0.3 + fVal * 0.7);
                spoke.material.color.copy(getThemeColor((i / 32) * vizConfig.wheel.hueRange + t * 0.15));
            });
        }

        // СЛОЙ 5: ECLIPSE
        if (layers.eclipse.visible) {
            const u = layers.eclipse.shaderMat.uniforms;
            u.u_time.value = t;
            u.u_bass.value = bass;
            u.u_mid.value = mid;
            u.u_opacity.value = vizConfig.eclipse.opacity;
            u.u_color1.value.copy(getThemeColor(t * 0.08));
            u.u_color2.value.copy(getThemeColor(t * 0.08 + 0.45));
        }

        // СЛОЙ 6: STRIPS
        if (layers.strips.visible) {
            const op = vizConfig.strips.opacity;
            const lines = layers.strips.lines;
            const hist = layers.strips.history;
            for (let s = 0; s < lines.length; s++) {
                const arr = hist[s];
                for (let k = arr.length - 1; k > 0; k--) arr[k] = arr[k - 1];
                const binVal = (freqData && hasActiveSignal) ? Math.min((freqData[s * 6] / 255) * audioState.currentGain * 0.75, 1.4) : 0;
                arr[0] = binVal * vizConfig.strips.audioDepth * (0.6 + bass);

                const line = lines[s];
                line.material.opacity = op * 0.85;
                line.material.color.copy(getThemeColor(s / lines.length + t * 0.1));
                const posAttr = line.geometry.attributes.position;
                const pos = posAttr.array;
                const xBase = (s - lines.length / 2) * 44;
                for (let k = 0; k < arr.length; k++) {
                    pos[k * 3]     = xBase;
                    pos[k * 3 + 1] = arr[k] - 60;
                    pos[k * 3 + 2] = 220 - k * 34;
                }
                posAttr.needsUpdate = true;
            }
        }

        // СЛОЙ 7: BARS
        if (layers.bars.visible) {
            const op = vizConfig.bars.opacity;
            layers.bars.meshes.forEach((mesh, i) => {
                const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[(i * 4) % 128] / 255) * audioState.currentGain * 0.75, 1.4) : 0.1;
                const z = ((mesh.userData.zOffset + t * 240) % 1200) - 700;
                const radius = 240 + Math.sin(t + i) * 40;
                mesh.position.set(Math.cos(mesh.userData.angle) * radius, Math.sin(mesh.userData.angle) * radius, z);
                mesh.rotation.z = mesh.userData.angle;
                mesh.scale.y = 0.2 + fVal * 3.0 + bass;
                mesh.material.opacity = op * 0.8;
                mesh.material.color.copy(getThemeColor(i / 24 + t * 0.1));
            });
        }

        // СЛОЙ 8: STARS
        if (layers.stars.visible) {
            const posAttr = layers.stars.points.geometry.attributes.position;
            const arr = posAttr.array;
            const speed = (120 + bass * 380 + effShakeLvl * beat * 200) * delta;
            for (let i = 2; i < arr.length; i += 3) {
                arr[i] += speed;
                if (arr[i] > 600) arr[i] -= 1400;
            }
            posAttr.needsUpdate = true;
            layers.stars.points.material.opacity = vizConfig.stars.opacity * 0.9;
            layers.stars.points.material.size = 18 + bass * 10;
        }

        // СЛОЙ 9: LIGHT LEAK
        if (layers.lightLeak.visible) {
            const u = layers.lightLeak.shaderMat.uniforms;
            u.u_time.value = elapsed;
            u.u_bass.value = bass + beat * 0.5;
            u.u_opacity.value = vizConfig.lightLeak.opacity;
            u.u_freak.value = vizConfig.lightLeak.freakOut;
        }
    }

    if (bloomPass) {
        bloomPass.enabled = fxConfig.bloomStrength > 0.01;
        bloomPass.strength = fxConfig.bloomStrength + beat * 0.10;
        bloomPass.radius = fxConfig.bloomRadius;
    }

    if (uberFXPass) {
        const u = uberFXPass.uniforms;
        u.u_time.value = elapsed;
        u.u_bass.value = bass;
        u.u_beat.value = beat;
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