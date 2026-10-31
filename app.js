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

let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;

// ============================================================================
// УПРАВЛЕНИЕ ПОЛНОЭКРАННЫМ РЕЖИМОМ И СКРЫТИЕМ ИНТЕРФЕЙСА
// ============================================================================
function setZenUIState(isZen) {
    if (isZen) {
        document.body.classList.add('zen-mode');
        if (btnZenFloating) btnZenFloating.textContent = '✕ Показать UI / Выйти';
    } else {
        document.body.classList.remove('zen-mode');
        if (btnZenFloating) btnZenFloating.textContent = '⛶ Полный экран (Скрыть UI)';
    }
}

function toggleZenFullscreen() {
    const isCurrentlyZen = document.body.classList.contains('zen-mode');

    if (!isCurrentlyZen) {
        setZenUIState(true);
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    } else {
        setZenUIState(false);
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }
}

if (btnZenInline) btnZenInline.addEventListener('click', toggleZenFullscreen);
if (btnZenFloating) btnZenFloating.addEventListener('click', toggleZenFullscreen);

// Если пользователь вышел из полноэкранного режима по клавише Esc — возвращаем интерфейс
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        setZenUIState(false);
    }
});

// ============================================================================
// 1. АУДИО-ДВИЖОК (FFT + WAVEFORM DATA TEXTURE + BEAT DETECTOR ÜBERVIZ)
// ============================================================================
let audioCtx, analyser, source;
let freqData, waveData, audioTextureData, audioTexture;
const FFT_SIZE = 512;
const BIN_COUNT = 256;

const audioState = {
    gain: 1.35,
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

// ============================================================================
// 2. ОБЪЕДИНЕННАЯ КОНФИГУРАЦИЯ (8 GLSL ШЕЙДЕРОВ + 10 СЛОЕВ ÜBERVIZ + FX RACK)
// ============================================================================
const GLSL_SHADER_LIST = {
    '1. Cyber Synthwave Waves (Гладкие холмы)': 0,
    '2. Octagrams Fractal (Волюметрик Shadertoy)': 1,
    '3. Silk Audio Ribbons (Неоновая ткань)': 2,
    '4. Ferrofluid Core (Жидкий металл 3D)': 3,
    '5. UberViz Hyper-Portal (Портал)': 4,
    '6. Quantum Gyroid (Гироидный лабиринт)': 5,
    '7. SoundEclipse (Спектральное затмение)': 6,
    '8. Cybernetic City (Аудио-мегаполис)': 7,
    'Выкл (Черный фон для чистого ÜberViz)': 8
};

const vizConfig = {
    engineMode: 'GLSL + 3D ÜberViz (Гибрид)',
    preset: 'Lantern (Auto Mix)',
    shaderMode: 0,
    glslOpacity: 0.95,
    autoSwitchGLSL: false,
    automaticUberViz: true,
    enable3DLayers: true,
    barsPerSwitch: 8,

    // Главная галочка тряски (включает/выключает точь-в-точь режим с тряской)
    enableShakeAndWobble: true,

    cameraTilt: true,
    tiltSpeed: 0.6,
    tiltAmount: 0.35,
    colorPalette: 0,
    speed: 1.0,

    // Все 10 слоев VIZ из архитектуры ÜberViz v0.9.7
    ripples:    { on: true,  opacity: 1.0,  targetOpacity: 1.0,  depth: 140 },
    crystal:    { on: true,  opacity: 0.9,  targetOpacity: 0.9,  freakout: 0.6 },
    tunnel:     { on: false, opacity: 0.0,  targetOpacity: 0.0,  twist: 1.2 },
    wheel:      { on: false, opacity: 0.0,  targetOpacity: 0.0,  hueRange: 0.6 },
    eclipse:    { on: false, opacity: 0.0,  targetOpacity: 0.0,  radius: 0.36, brightness: 1.2 },
    strips:     { on: false, opacity: 0.0,  targetOpacity: 0.0,  audioDepth: 120 },
    bars:       { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    stars:      { on: true,  opacity: 0.8,  targetOpacity: 0.8 },
    cyberWaves: { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    lightLeak:  { on: true,  opacity: 0.45, targetOpacity: 0.45, freakOut: 0.5 }
};

const fxConfig = {
    mirrorMode: 3,
    mirrorAdditive: true,
    bloomStrength: 0.75,
    bloomRadius: 0.45,
    rgbShift: 0.004,
    barrelBlur: 0.25,
    wobbleStrength: 0.008,
    wobbleSize: 10.0,
    shakeAmount: 0.012,
    scanlines: 0.15,
    halftone: 0.0,
    vignette: 0.45,
    saturation: 1.15,
    contrast: 1.1,
    strobeOnBeat: false
};

// ============================================================================
// 3. ВСЕ 8 ПОЛНОЭКРАННЫХ GLSL ШЕЙДЕРОВ (С FFT-ТЕКСТУРОЙ И ACES TONE MAPPING)
// ============================================================================
const backgroundGLSLFragment = `
    precision highp float;

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
    uniform float u_opacity;
    uniform sampler2D u_audioTex;

    #define PI 3.14159265359

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
            a = vec3(0.5, 0.5, 0.5);
            b = vec3(0.5, 0.5, 0.5);
            c = vec3(1.0, 0.7, 0.4);
            d = vec3(0.0, 0.15, 0.20);
        } else if (u_palette == 2) {
            a = vec3(0.2, 0.5, 0.3);
            b = vec3(0.2, 0.5, 0.3);
            c = vec3(1.0, 1.0, 0.5);
            d = vec3(0.80, 0.90, 0.30);
        } else if (u_palette == 3) {
            a = vec3(0.5, 0.5, 0.5);
            b = vec3(0.5, 0.5, 0.5);
            c = vec3(2.0, 1.0, 0.0);
            d = vec3(0.50, 0.20, 0.25);
        }
        return a + b * cos(6.28318 * (c * t + d));
    }

    vec3 acesToneMapping(vec3 x) {
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

    // --- 0. CYBER SYNTHWAVE WAVES ---
    float wavesHeight(vec2 p) {
        float amp = 0.65 + u_bass * 0.55;
        float h = sin(p.x * 0.45 + u_audioTime * 1.1) * cos(p.y * 0.38 + u_audioTime * 0.9) * amp;
        h += sin(p.x * 0.9 - p.y * 0.6 + u_audioTime * 1.4) * (0.25 + u_mid * 0.25);
        h += cos(p.x * 0.2 + p.y * 0.25 - u_audioTime * 0.5) * 0.4;
        return h;
    }

    vec3 renderCyberWaves(vec2 uv) {
        vec3 ro = vec3(0.0, 2.3, u_audioTime * 3.2);
        vec3 rd = normalize(vec3(uv.x, uv.y - 0.12, 1.35));

        float fftX = sampleFFT(abs(uv.x) * 0.7);
        vec3 skyCol = getPalette(uv.y * 0.5 + 0.2) * (0.08 + 0.15 * exp(-abs(uv.y) * 4.0));
        float aurora = smoothstep(0.08, 0.0, abs(uv.y - 0.22 - fftX * 0.18 + sin(uv.x * 4.0 + u_time) * 0.04));
        skyCol += getPalette(abs(uv.x) + u_time * 0.1) * aurora * (0.4 + u_mid * 0.8);

        float t = 0.0;
        bool hit = false;
        for (int i = 0; i < 80; i++) {
            vec3 p = ro + rd * t;
            float d = p.y - wavesHeight(p.xz);
            if (d < 0.008) { hit = true; break; }
            if (t > 45.0) break;
            t += d * 0.55;
        }
        if (!hit) return skyCol;

        vec3 p = ro + rd * t;
        vec2 eps = vec2(0.03, 0.0);
        vec3 n = normalize(vec3(
            wavesHeight(p.xz - eps.xy) - wavesHeight(p.xz + eps.xy),
            2.0 * eps.x,
            wavesHeight(p.xz - eps.yx) - wavesHeight(p.xz + eps.yx)
        ));

        vec3 lightDir = normalize(vec3(sin(u_time * 0.3) * 0.5, 0.8, 1.0));
        float diff = max(dot(n, lightDir), 0.0);
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        float colorIndex = p.y * 0.22 + p.z * 0.03 - u_audioTime * 0.08;
        vec3 waveCol = getPalette(colorIndex);
        vec3 rimCol = getPalette(colorIndex + 0.35);

        vec3 col = waveCol * (0.25 + diff * 0.75) + rimCol * fresnel * (0.7 + u_bass * 0.9);
        float fog = exp(-t * 0.045);
        return mix(skyCol, col, fog);
    }

    // --- 1. OCTAGRAMS FRACTAL ---
    float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    float mapOctagrams(vec3 p) {
        p.z = mod(p.z, 8.0) - 4.0;
        for (int i = 0; i < 5; i++) {
            p = abs(p) - vec3(0.65 + u_bass * 0.18, 0.65 + u_mid * 0.15, 0.85);
            p.xy *= rot(0.45 + u_time * 0.05);
            p.xz *= rot(0.35 + u_audioTime * 0.08);
        }
        return sdBox(p, vec3(0.45, 0.12, 0.12));
    }

    vec3 renderOctagrams(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 2.5);
        vec3 rd = normalize(vec3(uv, 1.2));
        rd.xy *= rot(sin(u_time * 0.2) * 0.25);

        vec3 accCol = vec3(0.0);
        float t = 0.5;
        for (int i = 0; i < 64; i++) {
            vec3 p = ro + rd * t;
            float d = mapOctagrams(p);
            float glow = 0.008 / (0.015 + abs(d) * abs(d));
            vec3 c = getPalette(t * 0.06 + float(i) * 0.015 + u_time * 0.1);
            accCol += c * glow * (0.6 + u_bass * 0.8);
            t += max(abs(d) * 0.55, 0.03);
            if (t > 28.0) break;
        }
        return accCol * 0.45;
    }

    // --- 2. SILK AUDIO RIBBONS ---
    vec3 renderSilkRibbons(vec2 uv) {
        vec3 col = vec3(0.01, 0.01, 0.03);
        float xNorm = uv.x * 0.5 + 0.5;
        float fft = sampleFFT(abs(uv.x) * 0.8);
        float wave = sampleWave(xNorm);

        for (int i = 0; i < 7; i++) {
            float fi = float(i);
            float phase = fi * 0.65 + u_audioTime * (0.8 + fi * 0.12);
            float yRibbon = sin(uv.x * (2.2 + fi * 0.4) + phase) * (0.22 + u_bass * 0.2)
                          + cos(uv.x * (4.5 - fi * 0.3) - u_time * 1.3) * (0.08 + u_mid * 0.12)
                          + wave * 0.12 * (1.0 - fi * 0.1);
            float dist = abs(uv.y - yRibbon);
            float thickness = 0.006 + fft * 0.025;
            float intensity = thickness / (dist + 0.008);
            float fold = 0.5 + 0.5 * sin(uv.x * 12.0 + phase * 2.0);
            vec3 ribbonCol = getPalette(fi * 0.14 + uv.x * 0.25 + u_time * 0.08);
            col += ribbonCol * intensity * (0.35 + fold * 0.65) * (0.4 + u_bass * 0.4);
        }
        return col * 0.55;
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
        float detail = cos(n.x * 14.0 - u_time * 3.0) * cos(n.y * 14.0 + u_time * 3.0) * (0.04 + u_high * 0.08);
        float disp = spikes * (0.22 + u_bass * 0.55) + detail;
        float sphere = r - (1.45 + u_sub * 0.25 + disp);

        vec3 rp = p;
        rp.xy *= rot(0.4 + sin(u_time * 0.5) * 0.2);
        float ringDist = length(vec2(length(rp.xz) - (2.4 + u_bass * 0.3), rp.y)) - 0.04;
        return min(sphere, ringDist);
    }

    vec3 calcNormalFerro(vec3 p) {
        vec2 e = vec2(0.005, 0.0);
        return normalize(vec3(
            mapFerrofluid(p + e.xyy) - mapFerrofluid(p - e.xyy),
            mapFerrofluid(p + e.yxy) - mapFerrofluid(p - e.yxy),
            mapFerrofluid(p + e.yyx) - mapFerrofluid(p - e.yyx)
        ));
    }

    vec3 renderFerrofluid(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -4.5);
        vec3 rd = normalize(vec3(uv, 1.3));

        float rUV = length(uv);
        float angle = atan(uv.y, uv.x);
        float fftRay = sampleFFT(abs(angle) / PI);
        vec3 bgCol = getPalette(rUV + u_time * 0.1) * exp(-rUV * 2.5) * (0.15 + fftRay * 0.35);

        float t = 0.0;
        float glow = 0.0;
        bool hit = false;
        for (int i = 0; i < 70; i++) {
            vec3 p = ro + rd * t;
            float d = mapFerrofluid(p);
            glow += 0.004 / (0.02 + d * d);
            if (d < 0.004) { hit = true; break; }
            if (t > 10.0) break;
            t += d * 0.55;
        }

        vec3 col = bgCol + getPalette(u_time * 0.15 + 0.3) * glow * (0.3 + u_bass * 0.5);
        if (hit) {
            vec3 p = ro + rd * t;
            vec3 n = calcNormalFerro(p);
            vec3 l1 = normalize(vec3(2.0, 3.0, -2.0));
            vec3 l2 = normalize(vec3(-3.0, -2.0, -1.0));
            float diff1 = max(dot(n, l1), 0.0);
            float diff2 = max(dot(n, l2), 0.0);
            float spec = pow(max(dot(reflect(-l1, n), -rd), 0.0), 32.0);
            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);

            vec3 baseColor = getPalette(length(p) * 0.5 - u_audioTime * 0.2);
            vec3 rimColor = getPalette(length(p) * 0.5 + 0.4);
            col = baseColor * (0.15 + diff1 * 0.65 + diff2 * 0.25)
                + rimColor * fresnel * (0.9 + u_bass * 0.8)
                + vec3(0.9, 0.95, 1.0) * spec * (0.6 + u_high * 0.8);
        }
        return col;
    }

    // --- 4. UBERVIZ HYPER-PORTAL ---
    vec3 renderHyperPortal(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 4.5);
        vec3 rd = normalize(vec3(uv, 1.1));
        rd.xy *= rot(u_audioTime * 0.12);

        vec3 col = vec3(0.0);
        float t = 0.2;
        for (int i = 0; i < 64; i++) {
            vec3 p = ro + rd * t;
            p.x += sin(p.z * 0.18) * 0.6;
            p.y += cos(p.z * 0.18) * 0.6;
            p.xy *= rot(p.z * 0.12);

            vec2 q = abs(p.xy);
            float oct = max(max(q.x, q.y), (q.x + q.y) * 0.7071);
            float ringZ = mod(p.z, 1.5) - 0.75;
            float fftVal = sampleFFT(fract(p.z * 0.05));
            float radius = 1.85 + fftVal * 0.45 + u_bass * 0.25;

            float tunnelWall = abs(oct - radius) - 0.04;
            float ribs = length(vec2(tunnelWall, ringZ)) - 0.05;
            float d = min(tunnelWall + 0.12, ribs);

            float glow = 0.006 / (0.012 + d * d);
            vec3 ringCol = getPalette(p.z * 0.05 - u_time * 0.2 + fftVal * 0.3);
            col += ringCol * glow * (0.5 + fftVal * 1.2 + u_beat * 0.35);

            t += max(d * 0.6, 0.04);
            if (t > 35.0) break;
        }
        return col * 0.5;
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
        for (int i = 0; i < 70; i++) {
            vec3 p = ro + rd * t;
            float d = mapGyroid(p);
            accGlow += getPalette(p.z * 0.08 + u_time * 0.1) * (0.003 / (0.02 + d * d));
            if (d < 0.006) { hit = true; break; }
            if (t > 25.0) break;
            t += d * 0.6;
        }

        vec3 col = accGlow * (0.5 + u_bass * 0.6);
        if (hit) {
            vec3 p = ro + rd * t;
            vec2 e = vec2(0.01, 0.0);
            vec3 n = normalize(vec3(
                mapGyroid(p + e.xyy) - mapGyroid(p - e.xyy),
                mapGyroid(p + e.yxy) - mapGyroid(p - e.yxy),
                mapGyroid(p + e.yyx) - mapGyroid(p - e.yyx)
            ));
            float diff = max(dot(n, -rd), 0.0);
            float veins = smoothstep(0.92, 0.99, sin(p.x * 12.0) * sin(p.y * 12.0) * sin(p.z * 12.0));
            vec3 surfCol = getPalette(p.z * 0.1 + length(p.xy) * 0.3);
            col += surfCol * diff * exp(-t * 0.08) + getPalette(u_time) * veins * (1.0 + u_high * 2.0);
        }
        return col;
    }

    // --- 6. SOUNDECLIPSE SPECTRUM ---
    vec3 renderSoundEclipse(vec2 uv) {
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float normAngle = abs(a) / PI;

        float fft = sampleFFT(normAngle * 0.85);
        float wave = sampleWave(a / (2.0 * PI) + 0.5);
        float baseRadius = 0.34 + u_bass * 0.08;

        float coronaDist = abs(r - (baseRadius + wave * 0.05));
        float corona = 0.012 / (coronaDist + 0.004);
        vec3 col = getPalette(normAngle + u_time * 0.1) * corona * (0.6 + u_bass * 0.6);

        float numBars = 90.0;
        float barCell = fract(normAngle * numBars) - 0.5;
        float barIndex = floor(normAngle * numBars) / numBars;
        float barFFT = sampleFFT(barIndex * 0.85);
        float barLen = barFFT * (0.38 + u_bass * 0.15);

        if (r > baseRadius + 0.02 && r < baseRadius + 0.02 + barLen) {
            float barMask = smoothstep(0.38, 0.15, abs(barCell));
            float tipGlow = smoothstep(0.0, 1.0, (r - baseRadius) / max(barLen, 0.01));
            vec3 barCol = getPalette(barIndex + u_time * 0.15 + tipGlow * 0.3);
            col += barCol * barMask * (0.9 + tipGlow * 1.2);
        }

        if (r < baseRadius) {
            vec2 p = uv * rot(u_audioTime * 0.4) / baseRadius;
            float rings = sin(length(p) * 18.0 - u_audioTime * 4.0 + sin(a * 6.0) * 1.5);
            col += getPalette(length(p) + u_time * 0.2) * smoothstep(0.7, 0.98, rings) * (0.4 + u_mid * 0.8);
        }
        return col;
    }

    // --- 7. CYBERNETIC CITY MATRIX ---
    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    vec3 renderCyberCity(vec2 uv) {
        vec3 ro = vec3(0.0, 3.2, u_audioTime * 4.0);
        vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1.2));

        vec3 col = getPalette(uv.y + 0.3) * 0.06;
        float t = 0.0;
        vec3 glowAcc = vec3(0.0);

        for (int i = 0; i < 75; i++) {
            vec3 p = ro + rd * t;
            float roadMask = smoothstep(0.8, 1.8, abs(p.x));
            vec2 cellId = floor(p.xz * 0.8);
            vec2 local = fract(p.xz * 0.8) - 0.5;

            float rnd = hash21(cellId);
            float fftBin = sampleFFT(fract(rnd + abs(cellId.x) * 0.08));
            float buildingH = (0.4 + rnd * 1.8 + fftBin * (2.2 + u_bass * 1.5)) * roadMask;

            vec2 boxXZ = abs(local) - vec2(0.32);
            float dXZ = max(boxXZ.x, boxXZ.y) / 0.8;
            float dY = p.y - buildingH;
            float dBuilding = max(dXZ, dY);
            float d = min(dBuilding, p.y);

            float roofGlow = 0.003 / (0.015 + dBuilding * dBuilding);
            glowAcc += getPalette(rnd + fftBin * 0.5 + u_time * 0.05) * roofGlow * (0.3 + fftBin * 1.2);

            if (d < 0.01 || t > 40.0) break;
            t += min(max(d * 0.5, 0.04), 0.35);
        }
        return col + glowAcc * 0.45;
    }

    void main() {
        if (u_mode == 8 || u_opacity <= 0.01) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }

        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        vec3 col = vec3(0.0);
        if (u_mode == 0) col = renderCyberWaves(uv);
        else if (u_mode == 1) col = renderOctagrams(uv);
        else if (u_mode == 2) col = renderSilkRibbons(uv);
        else if (u_mode == 3) col = renderFerrofluid(uv);
        else if (u_mode == 4) col = renderHyperPortal(uv);
        else if (u_mode == 5) col = renderGyroid(uv);
        else if (u_mode == 6) col = renderSoundEclipse(uv);
        else if (u_mode == 7) col = renderCyberCity(uv);

        col = acesToneMapping(col);
        col = pow(col, vec3(0.92));

        gl_FragColor = vec4(col * u_opacity, 1.0);
    }
`;

// ============================================================================
// 4. THREE.JS СЦЕНА, ФОНОВЫЙ GLSL ШЕЙДЕР И ВСЕ 10 СЛОЕВ ÜBERVIZ v0.9.7
// ============================================================================
let scene, camera, renderer, composer, bloomPass, uberFXPass;
let bgShaderMaterial, bgUniforms;
let mainStage;
let gui, guiShaderModeCtrl;
const layers = {};
const layerKeys = ['ripples', 'crystal', 'tunnel', 'wheel', 'eclipse', 'strips', 'bars', 'stars', 'cyberWaves', 'lightLeak'];

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
    audioTexture.needsUpdate = true;
}

function noise3D(x, y, z) {
    return (
        Math.sin(x * 1.2 + Math.cos(y * 1.3 + z * 0.9)) * 0.5 +
        Math.cos(y * 1.7 - Math.sin(z * 1.4 + x * 1.1)) * 0.3 +
        Math.sin(z * 2.1 + x * 1.5 - y * 1.2) * 0.2
    );
}

function getThemeColor(t, paletteIdx = vizConfig.colorPalette) {
    const c = new THREE.Color();
    const frac = ((t % 1.0) + 1.0) % 1.0;
    if (paletteIdx == 0) {
        c.setHSL(0.52 + Math.sin(frac * Math.PI * 2) * 0.18, 0.95, 0.55);
    } else if (paletteIdx == 1) {
        c.setHSL(0.92 + Math.sin(frac * Math.PI * 2) * 0.12, 0.95, 0.55);
    } else if (paletteIdx == 2) {
        c.setHSL(0.38 + Math.sin(frac * Math.PI * 2) * 0.08, 0.95, 0.50);
    } else {
        c.setHSL(frac > 0.5 ? 0.11 : 0.56, 0.9, 0.58);
    }
    return c;
}

function createGlowDotTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(200, 240, 255, 0.8)');
    grad.addColorStop(0.7, 'rgba(0, 180, 255, 0.2)');
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
        u_opacity:    { value: vizConfig.glslOpacity },
        u_audioTex:   { value: audioTexture }
    };

    bgShaderMaterial = new THREE.ShaderMaterial({
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.999, 1.0); }',
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
    for (let j = 0; j < 28; j++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
        const mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        layers.ripples.add(line);
        layers.ripples.lines.push(line);
    }
    mainStage.add(layers.ripples);

    // СЛОЙ 2: CRYSTAL
    layers.crystal = new THREE.Group();
    const crystalGeo = new THREE.IcosahedronGeometry(135, 2);
    crystalGeo.userData.basePositions = crystalGeo.attributes.position.array.slice();
    layers.crystal.wireMesh = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({
        color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
    }));
    layers.crystal.coreMesh = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({
        color: 0xff0077, wireframe: false, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    layers.crystal.coreMesh.scale.setScalar(0.92);
    layers.crystal.add(layers.crystal.wireMesh);
    layers.crystal.add(layers.crystal.coreMesh);
    mainStage.add(layers.crystal);

    // СЛОЙ 3: TUNNEL
    layers.tunnel = new THREE.Group();
    layers.tunnel.rings = [];
    const ringGeo = new THREE.RingGeometry(150, 156, 6);
    for (let i = 0; i < 36; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(ringGeo, mat);
        mesh.position.z = -i * 45 + 200;
        layers.tunnel.add(mesh);
        layers.tunnel.rings.push(mesh);
    }
    mainStage.add(layers.tunnel);

    // СЛОЙ 4: WHEEL
    layers.wheel = new THREE.Group();
    layers.wheel.spokes = [];
    const spokeGeo = new THREE.PlaneGeometry(8, 120);
    spokeGeo.translate(0, 60, 0);
    for (let i = 0; i < 64; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const spoke = new THREE.Mesh(spokeGeo, mat);
        spoke.rotation.z = (i / 64) * Math.PI * 2;
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
            u_radius: { value: 0.36 }, u_brightness: { value: 1.2 }, u_opacity: { value: 1.0 },
            u_color1: { value: new THREE.Color(0x00ffff) }, u_color2: { value: new THREE.Color(0xff0088) }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv; uniform float u_time, u_bass, u_mid, u_radius, u_brightness, u_opacity; uniform vec3 u_color1, u_color2;
            void main() {
                float r = length(vUv); float a = atan(vUv.y, vUv.x);
                float rad = u_radius + u_bass * 0.08;
                float flare = sin(a * 12.0 + u_time * 3.0) * cos(a * 7.0 - u_time * 2.0) * (0.02 + u_mid * 0.05);
                float corona = (0.018 * u_brightness) / (abs(r - (rad + flare)) + 0.008) * smoothstep(rad - 0.04, rad, r);
                vec3 col = mix(u_color1, u_color2, 0.5 + 0.5 * sin(a * 3.0 + u_time));
                gl_FragColor = vec4(col * corona * u_opacity, clamp(corona * u_opacity, 0.0, 1.0));
            }
        `
    });
    layers.eclipse.shaderMat = eclipseShaderMat;
    layers.eclipse.add(new THREE.Mesh(new THREE.PlaneGeometry(750, 750), eclipseShaderMat));
    mainStage.add(layers.eclipse);

    // СЛОЙ 6: STRIPS
    layers.strips = new THREE.Group();
    layers.strips.lines = [];
    layers.strips.history = Array.from({ length: 22 }, () => new Float32Array(64));
    for (let s = 0; s < 22; s++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x00ffcc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        }));
        layers.strips.add(line);
        layers.strips.lines.push(line);
    }
    mainStage.add(layers.strips);

    // СЛОЙ 7: BARS
    layers.bars = new THREE.Group();
    layers.bars.meshes = [];
    const barGeo = new THREE.BoxGeometry(10, 80, 10);
    for (let i = 0; i < 48; i++) {
        const mesh = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({
            color: 0x00ffff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending
        }));
        mesh.userData = { angle: (i / 48) * Math.PI * 2, zOffset: (i / 48) * 1200 };
        layers.bars.add(mesh);
        layers.bars.meshes.push(mesh);
    }
    mainStage.add(layers.bars);

    // СЛОЙ 8: STARS
    layers.stars = new THREE.Group();
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400 * 3; i += 3) {
        starPos[i]     = (Math.random() - 0.5) * 1400;
        starPos[i + 1] = (Math.random() - 0.5) * 1400;
        starPos[i + 2] = (Math.random() - 0.5) * 1400;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    layers.stars.points = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 16, map: dotTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xaaffff
    }));
    layers.stars.add(layers.stars.points);
    mainStage.add(layers.stars);

    // СЛОЙ 9: CYBERWAVES (3D-плоскость)
    layers.cyberWaves = new THREE.Group();
    const wavesShaderMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { u_time: { value: 0 }, u_bass: { value: 0 }, u_mid: { value: 0 }, u_opacity: { value: 0 }, u_palette: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv; uniform float u_time, u_bass, u_mid, u_opacity, u_palette;
            vec3 pal(float t) {
                if (u_palette < 0.5) return vec3(0.5,0.4,0.6) + vec3(0.5,0.4,0.4)*cos(6.2831*(t + vec3(0.55,0.20,0.75)));
                if (u_palette < 1.5) return vec3(0.5) + vec3(0.5)*cos(6.2831*(t + vec3(0.0,0.15,0.20)));
                return vec3(0.2,0.5,0.3) + vec3(0.2,0.5,0.3)*cos(6.2831*(t + vec3(0.8,0.9,0.3)));
            }
            float hMap(vec2 p) {
                float amp = 0.65 + u_bass * 0.55;
                return sin(p.x * 0.45 + u_time * 1.1) * cos(p.y * 0.38 + u_time * 0.9) * amp
                     + sin(p.x * 0.85 - p.y * 0.5 + u_time * 1.4) * (0.25 + u_mid * 0.2);
            }
            void main() {
                if (u_opacity <= 0.01) discard;
                vec3 ro = vec3(0.0, 2.2, u_time * 3.0);
                vec3 rd = normalize(vec3(vUv.x * 1.3, vUv.y - 0.15, 1.3));
                float t = 0.0; bool hit = false;
                for (int i = 0; i < 64; i++) {
                    vec3 p = ro + rd * t;
                    float d = p.y - hMap(p.xz);
                    if (d < 0.01) { hit = true; break; }
                    if (t > 40.0) break;
                    t += d * 0.55;
                }
                if (!hit) discard;
                vec3 p = ro + rd * t; vec2 e = vec2(0.04, 0.0);
                vec3 n = normalize(vec3(hMap(p.xz-e.xy)-hMap(p.xz+e.xy), 2.0*e.x, hMap(p.xz-e.yx)-hMap(p.xz+e.yx)));
                float diff = max(dot(n, normalize(vec3(0.3, 0.8, 1.0))), 0.0);
                float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                vec3 c = pal(p.y * 0.22 + p.z * 0.03 - u_time * 0.08) * (0.3 + diff * 0.7) + pal(p.y * 0.2 + 0.35) * fres * 0.8;
                float fog = exp(-t * 0.05);
                gl_FragColor = vec4(c * fog * u_opacity, fog * u_opacity);
            }
        `
    });
    const wavesMesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), wavesShaderMat);
    wavesMesh.position.z = -450;
    layers.cyberWaves.shaderMat = wavesShaderMat;
    layers.cyberWaves.add(wavesMesh);
    scene.add(layers.cyberWaves);

    // СЛОЙ 10: LIGHT LEAK
    layers.lightLeak = new THREE.Group();
    const leakShaderMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { u_time: { value: 0 }, u_bass: { value: 0 }, u_opacity: { value: 0.45 }, u_freak: { value: 0.5 } },
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
                gl_FragColor = vec4(col * leak * u_opacity * 0.55, 1.0);
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
// 5. КАСКАД ПОСТ-ОБРАБОТКИ FX RACK (ДВА РЕЖИМА: С ТРЯСКОЙ ТОЧЬ-В-ТОЧЬ И БЕЗ)
// ============================================================================
const UberVizFXShader = {
    uniforms: {
        tDiffuse:         { value: null },
        u_time:           { value: 0.0 },
        u_bass:           { value: 0.0 },
        u_beat:           { value: 0.0 },
        u_shakeMode:      { value: 1.0 },
        u_mirrorMode:     { value: 3 },
        u_mirrorAdditive: { value: 1.0 },
        u_rgbShift:       { value: 0.004 },
        u_barrelBlur:     { value: 0.25 },
        u_wobbleStrength: { value: 0.008 },
        u_wobbleSize:     { value: 10.0 },
        u_shake:          { value: 0.012 },
        u_scanlines:      { value: 0.15 },
        u_halftone:       { value: 0.0 },
        u_vignette:       { value: 0.45 },
        u_saturation:     { value: 1.15 },
        u_contrast:       { value: 1.1 },
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
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float u_time, u_bass, u_beat, u_shakeMode;
        uniform int u_mirrorMode;
        uniform float u_mirrorAdditive, u_rgbShift, u_barrelBlur, u_wobbleStrength, u_wobbleSize;
        uniform float u_shake, u_scanlines, u_halftone, u_vignette, u_saturation, u_contrast, u_strobe;
        uniform vec2 u_resolution;

        #define PI 3.14159265359

        vec2 applyMirror(vec2 uv, int mode) {
            vec2 p = uv - 0.5;
            if (mode == 1) p.x = -abs(p.x);
            else if (mode == 2) p.y = -abs(p.y);
            else if (mode == 3) p = -abs(p);
            else if (mode == 4) {
                float r = length(p);
                float a = mod(atan(p.y, p.x), PI / 4.0);
                a = abs(a - PI / 8.0);
                p = vec2(cos(a), sin(a)) * r;
            }
            return clamp(p + 0.5, 0.001, 0.999);
        }

        vec3 sampleWithLensFX(vec2 uv) {
            vec2 center = uv - 0.5;
            float dist = length(center);

            float barrel = (u_shakeMode > 0.5)
                ? u_barrelBlur * (0.15 + u_bass * 0.2) * dist * dist
                : u_barrelBlur * 0.20 * dist * dist;
            vec2 dir = center * barrel;

            vec2 shiftDir;
            if (u_shakeMode > 0.5) {
                float shiftAmt = u_rgbShift + u_bass * 0.004 + u_beat * 0.004;
                shiftDir = vec2(cos(u_time * 1.5), sin(u_time * 1.5)) * shiftAmt;
            } else {
                shiftDir = center * (u_rgbShift + u_bass * 0.003);
            }

            vec3 col = vec3(0.0);
            for (int i = -1; i <= 1; i++) {
                float fi = float(i) * 0.5;
                vec2 u = clamp(uv + dir * fi, 0.001, 0.999);
                float r = texture2D(tDiffuse, clamp(u + shiftDir, 0.001, 0.999)).r;
                float g = texture2D(tDiffuse, u).g;
                float b = texture2D(tDiffuse, clamp(u - shiftDir, 0.001, 0.999)).b;
                col += vec3(r, g, b);
            }
            return col / 3.0;
        }

        void main() {
            vec2 uv = vUv;

            if (u_shakeMode > 0.5) {
                if (u_shake > 0.0001) {
                    vec2 shakeOffset = vec2(
                        sin(u_time * 45.0),
                        cos(u_time * 38.0)
                    ) * u_shake * (u_beat * 0.7 + u_bass * 0.3);
                    uv += shakeOffset;
                }
                if (u_wobbleStrength > 0.0001) {
                    float w = u_wobbleStrength * (0.4 + u_bass * 0.8);
                    uv.x += sin(uv.y * u_wobbleSize + u_time * 3.0) * w;
                    uv.y += cos(uv.x * u_wobbleSize - u_time * 2.5) * w;
                }
            }

            vec3 col;
            if (u_mirrorMode > 0) {
                vec2 mUv = applyMirror(uv, u_mirrorMode);
                vec3 mirroredCol = sampleWithLensFX(mUv);
                if (u_mirrorAdditive > 0.5) {
                    vec3 origCol = sampleWithLensFX(clamp(uv, 0.001, 0.999));
                    col = max(mirroredCol, origCol * 0.65) + mirroredCol * 0.35;
                } else {
                    col = mirroredCol;
                }
            } else {
                col = sampleWithLensFX(clamp(uv, 0.001, 0.999));
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

            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(luma), col, u_saturation);
            col = (col - 0.5) * u_contrast + 0.5;
            col = max(col, 0.0);
            col = col / (1.0 + col * 0.35);

            if (u_strobe > 0.5 && u_beat > 0.82) {
                col = mix(col, vec3(1.0) - col, 0.6);
            }

            float dCenter = length(vUv - 0.5);
            col *= smoothstep(0.95, 0.95 - u_vignette * 0.7, dCenter);

            gl_FragColor = vec4(col, 1.0);
        }
    `
};

// ============================================================================
// 6. АВТО-РЕЖИССЕР, ПРЕСЕТЫ И ПАНЕЛЬ УПРАВЛЕНИЯ DAT.GUI
// ============================================================================
function randomizeUberViz() {
    layerKeys.forEach(k => {
        vizConfig[k].on = false;
        vizConfig[k].targetOpacity = 0.0;
    });

    const primaryPool = ['ripples', 'crystal', 'tunnel', 'wheel', 'eclipse', 'strips', 'bars', 'cyberWaves'];
    primaryPool.sort(() => Math.random() - 0.5);

    const count = 2 + (Math.random() > 0.45 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        const key = primaryPool[i];
        vizConfig[key].on = true;
        vizConfig[key].targetOpacity = key === 'cyberWaves' ? 0.65 : (0.75 + Math.random() * 0.25);
    }

    if (Math.random() > 0.35) {
        vizConfig.stars.on = true;
        vizConfig.stars.targetOpacity = 0.75;
    }
    if (Math.random() > 0.4) {
        vizConfig.lightLeak.on = true;
        vizConfig.lightLeak.targetOpacity = 0.4;
    }

    const mirrorOptions = [0, 1, 2, 3, 3, 4];
    fxConfig.mirrorMode = mirrorOptions[Math.floor(Math.random() * mirrorOptions.length)];
    fxConfig.mirrorAdditive = Math.random() > 0.3;
    vizConfig.tunnel.twist = (Math.random() - 0.5) * 3.0;

    if (vizConfig.enableShakeAndWobble) {
        fxConfig.wobbleStrength = Math.random() > 0.4 ? (0.004 + Math.random() * 0.012) : 0.004;
        fxConfig.barrelBlur = 0.15 + Math.random() * 0.35;
        if (fxConfig.shakeAmount < 0.002) fxConfig.shakeAmount = 0.012;
    }

    if (gui) gui.updateDisplay();
}

function applyCuratedPreset(presetName) {
    layerKeys.forEach(k => {
        vizConfig[k].on = false;
        vizConfig[k].targetOpacity = 0.0;
    });

    if (presetName === 'Lantern (Auto Mix)') {
        vizConfig.automaticUberViz = true;
        vizConfig.ripples.on = true; vizConfig.ripples.targetOpacity = 0.95;
        vizConfig.crystal.on = true; vizConfig.crystal.targetOpacity = 0.85;
        vizConfig.stars.on = true;   vizConfig.stars.targetOpacity = 0.8;
        vizConfig.lightLeak.on = true; vizConfig.lightLeak.targetOpacity = 0.45;
        fxConfig.mirrorMode = 3;
        fxConfig.mirrorAdditive = true;
    } else if (presetName === 'Pareidolia (Kaleido Tunnel)') {
        vizConfig.automaticUberViz = false;
        vizConfig.tunnel.on = true;  vizConfig.tunnel.targetOpacity = 0.95;
        vizConfig.wheel.on = true;   vizConfig.wheel.targetOpacity = 0.75;
        vizConfig.crystal.on = true; vizConfig.crystal.targetOpacity = 0.85;
        fxConfig.mirrorMode = 4;
        fxConfig.mirrorAdditive = true;
    } else if (presetName === 'Word Problems (Sacred Geo)') {
        vizConfig.automaticUberViz = false;
        vizConfig.crystal.on = true; vizConfig.crystal.targetOpacity = 1.0;
        vizConfig.eclipse.on = true; vizConfig.eclipse.targetOpacity = 0.9;
        vizConfig.bars.on = true;    vizConfig.bars.targetOpacity = 0.7;
        vizConfig.stars.on = true;   vizConfig.stars.targetOpacity = 0.8;
        fxConfig.mirrorMode = 1;
    } else if (presetName === 'Splice (Audio Ribbons)') {
        vizConfig.automaticUberViz = false;
        vizConfig.ripples.on = true; vizConfig.ripples.targetOpacity = 1.0;
        vizConfig.strips.on = true;  vizConfig.strips.targetOpacity = 0.9;
        vizConfig.lightLeak.on = true; vizConfig.lightLeak.targetOpacity = 0.4;
        fxConfig.mirrorMode = 3;
    } else if (presetName === 'CyberWaves + Eclipse') {
        vizConfig.automaticUberViz = false;
        vizConfig.cyberWaves.on = true; vizConfig.cyberWaves.targetOpacity = 0.95;
        vizConfig.eclipse.on = true;    vizConfig.eclipse.targetOpacity = 0.85;
        vizConfig.stars.on = true;      vizConfig.stars.targetOpacity = 0.75;
        fxConfig.mirrorMode = 0;
    }

    if (gui) gui.updateDisplay();
}

function applyEngineMode(modeName) {
    if (modeName === 'Только 8 GLSL Шейдеров') {
        if (vizConfig.shaderMode == 8) vizConfig.shaderMode = 0;
        vizConfig.glslOpacity = 1.0;
        vizConfig.enable3DLayers = false;
        vizConfig.automaticUberViz = false;
        fxConfig.mirrorMode = 0;
    } else if (modeName === 'GLSL + 3D ÜberViz (Гибрид)') {
        if (vizConfig.shaderMode == 8) vizConfig.shaderMode = 0;
        vizConfig.glslOpacity = 0.95;
        vizConfig.enable3DLayers = true;
    } else if (modeName === 'Классический ÜberViz v0.9.7') {
        vizConfig.shaderMode = 8;
        vizConfig.enable3DLayers = true;
        vizConfig.automaticUberViz = true;
        applyCuratedPreset(vizConfig.preset);
    }
    bgUniforms.u_mode.value = Number(vizConfig.shaderMode);
    bgUniforms.u_opacity.value = vizConfig.glslOpacity;
    if (gui) gui.updateDisplay();
}

function initGUI() {
    gui = new dat.GUI({ autoPlace: true, width: 345 });

    const fMain = gui.addFolder('1. ГЛАВНЫЙ ПУЛЬТ & ТРЯСКА (F - Полный экран)');
    fMain.add({ fullscreen: toggleZenFullscreen }, 'fullscreen').name('⛶ ПОЛНЫЙ ЭКРАН (Скрыть UI)');

    fMain.add(vizConfig, 'enableShakeAndWobble').name('🔥 Тряска под бит (Точь-в-точь)').listen().onChange(v => {
        if (v && fxConfig.shakeAmount < 0.001) {
            fxConfig.shakeAmount = 0.012;
            fxConfig.wobbleStrength = 0.008;
        }
        if (gui) gui.updateDisplay();
    });

    fMain.add(vizConfig, 'engineMode', [
        'GLSL + 3D ÜberViz (Гибрид)',
        'Классический ÜberViz v0.9.7',
        'Только 8 GLSL Шейдеров'
    ]).name('Режим движка').onChange(applyEngineMode);

    guiShaderModeCtrl = fMain.add(vizConfig, 'shaderMode', GLSL_SHADER_LIST).name('Фон (8 GLSL)').onChange(v => {
        bgUniforms.u_mode.value = Number(v);
    });
    fMain.add(vizConfig, 'glslOpacity', 0.0, 1.0, 0.05).name('Яркость GLSL').onChange(v => {
        bgUniforms.u_opacity.value = v;
    });
    fMain.add(vizConfig, 'autoSwitchGLSL').name('Auto-DJ (8 GLSL шейдеров)');
    fMain.add(vizConfig, 'colorPalette', {
        'Cyberpunk Neon': 0,
        'Sunset Retrowave': 1,
        'Matrix Bio-Lab': 2,
        'Gold & Ice': 3
    }).name('Цветовая палитра').onChange(v => {
        bgUniforms.u_palette.value = Number(v);
    });
    fMain.open();

    const fViz = gui.addFolder('2. ÜBERVIZ 10 СЛОЕВ & ПРЕСЕТЫ');
    fViz.add(vizConfig, 'enable3DLayers').name('Включить 3D слои').listen();
    fViz.add(vizConfig, 'automaticUberViz').name('AUTOMATIC (Авто-микс)').listen();
    fViz.add(vizConfig, 'preset', [
        'Lantern (Auto Mix)',
        'Pareidolia (Kaleido Tunnel)',
        'Word Problems (Sacred Geo)',
        'Splice (Audio Ribbons)',
        'CyberWaves + Eclipse'
    ]).name('Пресет ÜberViz').onChange(applyCuratedPreset);
    fViz.add({ randomize: randomizeUberViz }, 'randomize').name('🎲 Randomize VIZ + FX (R)');

    const bindLayerToggle = (key, label) => {
        fViz.add(vizConfig[key], 'on').name(label).listen().onChange(v => {
            vizConfig.enable3DLayers = true;
            vizConfig.automaticUberViz = false;
            vizConfig[key].targetOpacity = v ? 0.9 : 0.0;
        });
    };
    bindLayerToggle('ripples',    '🌊 Ripples (Шум-волны)');
    bindLayerToggle('crystal',    '💎 Crystal (Гео-ядро)');
    bindLayerToggle('tunnel',     '🌀 Tunnel (Туннель)');
    bindLayerToggle('wheel',      '🎡 Wheel (Лучи спектра)');
    bindLayerToggle('eclipse',    '🌑 Eclipse (Затмение)');
    bindLayerToggle('strips',     '📊 Strips (3D-История)');
    bindLayerToggle('bars',       '⚡ Bars (Неон-колонны)');
    bindLayerToggle('stars',      '✨ Stars (Частицы)');
    bindLayerToggle('cyberWaves', '⛰️ CyberWaves (3D-слой)');
    bindLayerToggle('lightLeak',  '🌈 Light Leak (Засветы)');
    fViz.open();

    const fFX = gui.addFolder('3. FX RACK (Зеркала, Линза, Тряска)');
    fFX.add(fxConfig, 'mirrorMode', {
        'Off (Без зеркала)': 0,
        'Left / Right': 1,
        'Top / Bottom': 2,
        'Quad Mirror (4x)': 3,
        'Kaleidoscope (8x)': 4
    }).name('Mirror (Зеркало)').listen();
    fFX.add(fxConfig, 'mirrorAdditive').name('Mirror Additive').listen();
    fFX.add(fxConfig, 'bloomStrength', 0.0, 1.8, 0.05).name('Glow (Свечение)');
    fFX.add(fxConfig, 'barrelBlur', 0.0, 0.8, 0.02).name('Barrel Blur (Линза)').listen();
    fFX.add(fxConfig, 'wobbleStrength', 0.0, 0.03, 0.001).name('Wobble (Сила волны)').listen();
    fFX.add(fxConfig, 'shakeAmount', 0.0, 0.04, 0.001).name('Shake (Сила тряски)').listen();
    fFX.add(vizConfig, 'cameraTilt').name('3D Tilt Камеры').listen();
    fFX.add(fxConfig, 'rgbShift', 0.0, 0.02, 0.001).name('RGB Shift (Хром)');
    fFX.add(fxConfig, 'scanlines', 0.0, 0.6, 0.05).name('Lines (Сканлайны)');
    fFX.add(fxConfig, 'halftone', 0.0, 1.0, 0.05).name('Half Tone (Точки)');
    fFX.add(fxConfig, 'strobeOnBeat').name('Strobe на пиках');

    const fAudio = gui.addFolder('4. АУДИО И ДЕТЕКТОР БИТА');
    fAudio.add(audioState, 'gain', 0.4, 3.0, 0.05).name('Gain (Чувствительность)');
    fAudio.add(audioState, 'beatThreshold', 0.15, 0.7, 0.02).name('Beat Threshold');
    fAudio.add(vizConfig, 'barsPerSwitch', 4, 32, 4).name('Битов до смены');
}

// Горячие клавиши: F или Q — полный экран без интерфейса, R — рандом, S — тряска
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f' || k === 'а' || k === 'q' || k === 'й') {
        toggleZenFullscreen();
    } else if (k === 'r' || k === 'к') {
        randomizeUberViz();
    } else if (k === 's' || k === 'ы') {
        vizConfig.enableShakeAndWobble = !vizConfig.enableShakeAndWobble;
        if (gui) gui.updateDisplay();
    }
});

// ============================================================================
// 7. ИНИЦИАЛИЗАЦИЯ WEBGL И КОМПОЗЕРА
// ============================================================================
function initThree() {
    if (scene) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, 600);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        fxConfig.bloomStrength,
        fxConfig.bloomRadius,
        0.25
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
// 8. УПРАВЛЕНИЕ ПЛЕЕРОМ И ПЛЕЙЛИСТОМ
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
    initAudioContext();
    audio.play();
    isPlaying = true;
    btnPlay.textContent = '⏸';
}

function pauseTrack() {
    audio.pause();
    isPlaying = false;
    btnPlay.textContent = '▶';
}

function stopTrack() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    btnPlay.textContent = '▶';
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

function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = audioState.smoothing;

            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            freqData = new Uint8Array(BIN_COUNT);
            waveData = new Uint8Array(BIN_COUNT);
        } catch (err) {
            console.error("Ошибка инициализации аудио:", err);
        }
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// ============================================================================
// 9. ГЛАВНЫЙ ЦИКЛ ОБНОВЛЕНИЯ СЛОЕВ И ШЕЙДЕРОВ
// ============================================================================
const clock = new THREE.Clock();
initThree();
animate();

function updateAudioAnalysis(delta) {
    if (analyser && freqData && isPlaying) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(waveData);

        for (let i = 0; i < 256; i++) {
            audioTextureData[i] = freqData[i];
            audioTextureData[256 + i] = waveData[i];
        }
        audioTexture.needsUpdate = true;

        let subSum = 0, bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
        for (let i = 0; i < 4; i++) subSum += freqData[i];
        for (let i = 4; i < 14; i++) bassSum += freqData[i];
        for (let i = 14; i < 80; i++) midSum += freqData[i];
        for (let i = 80; i < 200; i++) highSum += freqData[i];
        for (let i = 0; i < BIN_COUNT; i++) totalSum += freqData[i];

        const g = audioState.gain;
        const targetSub  = (subSum / 4 / 255) * g;
        const targetBass = (bassSum / 10 / 255) * g;
        const targetMid  = (midSum / 66 / 255) * g;
        const targetHigh = (highSum / 120 / 255) * g;
        const targetVol  = (totalSum / BIN_COUNT / 255) * g;

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

            if (audioState.beatCounter % vizConfig.barsPerSwitch === 0) {
                if (vizConfig.autoSwitchGLSL && vizConfig.shaderMode < 8) {
                    const nextShader = (Number(vizConfig.shaderMode) + 1) % 8;
                    vizConfig.shaderMode = nextShader;
                    bgUniforms.u_mode.value = nextShader;
                    if (guiShaderModeCtrl) guiShaderModeCtrl.updateDisplay();
                }
                if (vizConfig.automaticUberViz && vizConfig.enable3DLayers) {
                    randomizeUberViz();
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

        for (let i = 0; i < 256; i++) {
            audioTextureData[i] = Math.floor(audioTextureData[i] * 0.9);
            audioTextureData[256 + i] = 128;
        }
        audioTexture.needsUpdate = true;
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
    layers.cyberWaves.visible = vizConfig.enable3DLayers && vizConfig.cyberWaves.opacity > 0.01;
    layers.lightLeak.visible = vizConfig.enable3DLayers && vizConfig.lightLeak.opacity > 0.01;

    if (vizConfig.enableShakeAndWobble && vizConfig.cameraTilt) {
        mainStage.rotation.x = Math.sin(elapsed * vizConfig.tiltSpeed * 0.7) * vizConfig.tiltAmount;
        mainStage.rotation.y = Math.cos(elapsed * vizConfig.tiltSpeed * 0.5) * vizConfig.tiltAmount;
        mainStage.rotation.z = Math.sin(elapsed * 0.25) * 0.15;
    } else {
        mainStage.rotation.set(0, 0, 0);
    }

    if (vizConfig.enable3DLayers) {
        layerKeys.forEach(k => {
            const cfg = vizConfig[k];
            cfg.opacity += (cfg.targetOpacity - cfg.opacity) * 0.08;
            layers[k].visible = cfg.opacity > 0.01;
        });

        // СЛОЙ 1: RIPPLES
        if (layers.ripples.visible) {
            const op = vizConfig.ripples.opacity;
            const lines = layers.ripples.lines;
            const count = lines.length;
            for (let j = 0; j < count; j++) {
                const line = lines[j];
                line.material.opacity = op * 0.85;
                const posAttr = line.geometry.attributes.position;
                const colAttr = line.geometry.attributes.color;
                const posArr = posAttr.array;
                const colArr = colAttr.array;
                const segs = posArr.length / 3;
                const yBase = (j - count / 2) * 16;
                const lineColor = getThemeColor(j / count + t * 0.08);

                for (let i = 0; i < segs; i++) {
                    const normX = i / (segs - 1) - 0.5;
                    const waveVal = (waveData && isPlaying) ? ((waveData[i * 2] - 128) / 128) : 0;
                    const n = noise3D(normX * 3.5, j * 0.22, t * 0.8);
                    posArr[i * 3]     = normX * 720;
                    posArr[i * 3 + 1] = yBase + n * 28 * (0.3 + mid);
                    posArr[i * 3 + 2] = n * (40 + bass * vizConfig.ripples.depth) + waveVal * 65 * bass;

                    const bright = 0.5 + 0.5 * Math.sin(normX * Math.PI);
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
                const fVal = (freqData && isPlaying) ? (freqData[bin] / 255) : 0;
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
                if (ring.position.z > 520) ring.position.z -= rings.length * 45;

                const depthNorm = (ring.position.z + 1400) / 1920;
                const fVal = (freqData && isPlaying) ? (freqData[(idx * 3) % 128] / 255) : 0;
                const scale = 0.8 + fVal * 0.9 + bass * 0.35;
                ring.scale.set(scale, scale, 1);
                ring.rotation.z = idx * 0.12 * vizConfig.tunnel.twist + t * 0.4;
                ring.material.opacity = op * Math.sin(Math.max(0, Math.min(1, depthNorm)) * Math.PI) * 0.85;
                ring.material.color.copy(getThemeColor(idx / rings.length + t * 0.1));
            });
        }

        // СЛОЙ 4: WHEEL
        if (layers.wheel.visible) {
            const op = vizConfig.wheel.opacity;
            layers.wheel.rotation.z += delta * 0.35;
            layers.wheel.spokes.forEach((spoke, i) => {
                const fVal = (freqData && isPlaying) ? (freqData[i * 2] / 255) : 0.1;
                spoke.scale.y = 0.25 + fVal * 2.4 + bass * 0.5;
                spoke.scale.x = 0.6 + fVal * 1.2;
                spoke.material.opacity = op * (0.25 + fVal * 0.75);
                spoke.material.color.copy(getThemeColor((i / 64) * vizConfig.wheel.hueRange + t * 0.15));
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
                const binVal = (freqData && isPlaying) ? (freqData[s * 4] / 255) : 0;
                arr[0] = binVal * vizConfig.strips.audioDepth * (0.6 + bass);

                const line = lines[s];
                line.material.opacity = op * 0.8;
                line.material.color.copy(getThemeColor(s / lines.length + t * 0.1));
                const posAttr = line.geometry.attributes.position;
                const pos = posAttr.array;
                const xBase = (s - lines.length / 2) * 28;
                for (let k = 0; k < arr.length; k++) {
                    pos[k * 3]     = xBase;
                    pos[k * 3 + 1] = arr[k] - 60;
                    pos[k * 3 + 2] = 220 - k * 22;
                }
                posAttr.needsUpdate = true;
            }
        }

        // СЛОЙ 7: BARS
        if (layers.bars.visible) {
            const op = vizConfig.bars.opacity;
            layers.bars.meshes.forEach((mesh, i) => {
                const fVal = (freqData && isPlaying) ? (freqData[(i * 2) % 128] / 255) : 0.1;
                const z = ((mesh.userData.zOffset + t * 240) % 1200) - 700;
                const radius = 240 + Math.sin(t + i) * 40;
                mesh.position.set(Math.cos(mesh.userData.angle) * radius, Math.sin(mesh.userData.angle) * radius, z);
                mesh.rotation.z = mesh.userData.angle;
                mesh.scale.y = 0.2 + fVal * 3.0 + bass;
                mesh.material.opacity = op * 0.75;
                mesh.material.color.copy(getThemeColor(i / 48 + t * 0.1));
            });
        }

        // СЛОЙ 8: STARS
        if (layers.stars.visible) {
            const posAttr = layers.stars.points.geometry.attributes.position;
            const arr = posAttr.array;
            const speed = (120 + bass * 380 + (vizConfig.enableShakeAndWobble ? beat * 220 : 0)) * delta;
            for (let i = 2; i < arr.length; i += 3) {
                arr[i] += speed;
                if (arr[i] > 600) arr[i] -= 1400;
            }
            posAttr.needsUpdate = true;
            layers.stars.points.material.opacity = vizConfig.stars.opacity * 0.9;
            layers.stars.points.material.size = 14 + bass * 10;
        }

        // СЛОЙ 9: CYBERWAVES
        if (layers.cyberWaves.visible) {
            const u = layers.cyberWaves.shaderMat.uniforms;
            u.u_time.value = t;
            u.u_bass.value = bass;
            u.u_mid.value = mid;
            u.u_opacity.value = vizConfig.cyberWaves.opacity;
            u.u_palette.value = Number(vizConfig.colorPalette);
        }

        // СЛОЙ 10: LIGHT LEAK
        if (layers.lightLeak.visible) {
            const u = layers.lightLeak.shaderMat.uniforms;
            u.u_time.value = elapsed;
            u.u_bass.value = bass + beat * 0.5;
            u.u_opacity.value = vizConfig.lightLeak.opacity;
            u.u_freak.value = vizConfig.lightLeak.freakOut;
        }
    }

    if (bloomPass) {
        bloomPass.strength = fxConfig.bloomStrength + beat * 0.2;
        bloomPass.radius = fxConfig.bloomRadius;
    }

    if (uberFXPass) {
        const u = uberFXPass.uniforms;
        u.u_time.value = elapsed;
        u.u_bass.value = bass;
        u.u_beat.value = beat;
        u.u_shakeMode.value = vizConfig.enableShakeAndWobble ? 1.0 : 0.0;
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
        u.u_strobe.value = fxConfig.strobeOnBeat ? 1.0 : 0.0;
    }

    composer.render();
}