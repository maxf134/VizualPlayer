// ============================================================================
// МОДУЛЬ 1: CONFIG.JS — НАСТРОЙКИ, 18 ПАЛИТР, 3 РЕЖИМА AUTO-DJ И ПРЕСЕТЫ
// ============================================================================
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

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
    '12. Rainbow Spectrum (Динамическая радуга)': 11,
    '13. 🫧 Lava 70s Classic (Оранж / Пурпурный воск)': 12,
    '14. 🫧 Lava Alien Slime (Кислотный лайм / Индиго)': 13,
    '15. 🫧 Lava Cherry & Amber (Вишня / Янтарь)': 14,
    '16. 🫧 Lava Cosmic Peach (Персик / Глубокий синий)': 15,
    '17. 🫧 Lava Electric Fuchsia (Фуксия / Лазурь)': 16,
    '18. 🫧 Lava Molten Gold & Ruby (Золото / Рубин)': 17
};

const TOTAL_PALETTES = 18;

const NOTE_DIVISION_LIST = {
    'Получетверть (1/8 ноты = 0.5 четверти)': 0.5,
    'Каждая четверть (1/4 ноты = 1 удар)': 1.0,
    '2 четверти (1/2 такта = 2 удара)': 2.0,
    '4 четверти (Целый такт = 4 удара)': 4.0,
    '8 четвертей (2 такта = 8 ударов)': 8.0,
    '16 четвертей (Квадрат = 16 ударов)': 16.0
};

// Все 21 3D-слой конструктора
const LAYER_KEYS = [
    'starOfDavid', 'lavaLamp', 'tesla', 'lasers', 'joyDivision',
    'spirograph', 'fireflies', 'waterRipples', 'dyson', 'hud',
    'neuralWeb', 'origami', 'ripples', 'crystal', 'tunnel',
    'wheel', 'eclipse', 'strips', 'bars', 'stars', 'lightLeak'
];

// 24 стартовых пресета для ручного режима
const PRESETS_CATALOG = {
    '🟢 LITE 1: Synthwave Retro Horizon': {
        tier: 'lite', shader: 13, palette: 1, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 1.0, tilt: false
    },
    '🟢 LITE 2: Silk Ribbons & Lasers': {
        tier: 'lite', shader: 2, palette: 0, layers: ['lasers', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.003, glslOp: 1.0, tilt: true
    },
    '🟢 LITE 3: Eclipse & Sci-Fi HUD': {
        tier: 'lite', shader: 6, palette: 4, layers: ['hud'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 1.0, tilt: false
    },
    '🟢 LITE 4: Aurora & Fireflies Swarm': {
        tier: 'lite', shader: 15, palette: 6, layers: ['fireflies'], mirror: 0, barrel: 0.0, wobble: 0.002, glslOp: 1.0, tilt: true
    },
    '🟢 LITE 5: Smooth Cyber Hills': {
        tier: 'lite', shader: 0, palette: 0, layers: ['stars'], mirror: 0, barrel: 0.0, wobble: 0.004, glslOp: 1.0, tilt: true
    },
    '🟢 LITE 6: Sacred Hexagram Labyrinth': {
        tier: 'lite', shader: 11, palette: 3, layers: ['starOfDavid'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 0.90, tilt: false
    },
    '🟢 LITE 7: Deep Ocean Water Ripples': {
        tier: 'lite', shader: 9, palette: 9, layers: ['waterRipples', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.003, glslOp: 0.95, tilt: false
    },
    '🟢 LITE 8: Giant Lava Lamp 70s': {
        tier: 'lite', shader: 15, palette: 12, layers: ['lavaLamp', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.002, glslOp: 0.85, tilt: false
    },
    '🟢 LITE 9: Joy Division Pulsar Waves': {
        tier: 'lite', shader: 2, palette: 10, layers: ['joyDivision'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 0.80, tilt: true
    },
    '🟢 LITE 10: Lissajous Laser Spirograph': {
        tier: 'lite', shader: 15, palette: 5, layers: ['spirograph', 'stars'], mirror: 0, barrel: 0.0, wobble: 0.0, glslOp: 0.85, tilt: false
    },
    '🟢 LITE 11: Synapse Neural Network': {
        tier: 'lite', shader: 9, palette: 2, layers: ['neuralWeb'], mirror: 0, barrel: 0.0, wobble: 0.002, glslOp: 0.85, tilt: true
    },
    '🟢 LITE 12: Origami Neon Wormhole': {
        tier: 'lite', shader: 4, palette: 8, layers: ['origami'], mirror: 3, barrel: 0.0, wobble: 0.003, glslOp: 0.88, tilt: false
    },

    '🔥 ULTRA 1: Cyber Waves & Crystal (Твой пресет)': {
        tier: 'ultra', shader: 0, palette: 0, layers: ['crystal', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.006, glslOp: 1.0, tilt: true
    },
    '🔥 ULTRA 2: Singularity & Dyson Sphere': {
        tier: 'ultra', shader: 8, palette: 3, layers: ['dyson', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.003, glslOp: 0.95, tilt: true
    },
    '🔥 ULTRA 3: Octagrams Fractal Kaleido': {
        tier: 'ultra', shader: 1, palette: 0, layers: ['origami', 'stars'], mirror: 3, barrel: 0.08, wobble: 0.004, glslOp: 0.72, tilt: false
    },
    '🔥 ULTRA 4: Alien Slime Lava & Ferrofluid': {
        tier: 'ultra', shader: 3, palette: 13, layers: ['lavaLamp', 'tesla'], mirror: 0, barrel: 0.08, wobble: 0.005, glslOp: 0.90, tilt: false
    },
    '🔥 ULTRA 5: Hyper-Portal & Club Lasers': {
        tier: 'ultra', shader: 4, palette: 5, layers: ['lasers', 'tunnel'], mirror: 4, barrel: 0.10, wobble: 0.005, glslOp: 0.90, tilt: false
    },
    '🔥 ULTRA 6: Bio-Gyroid + Star of David Maze': {
        tier: 'ultra', shader: 5, palette: 2, layers: ['starOfDavid', 'stars'], mirror: 0, barrel: 0.08, wobble: 0.004, glslOp: 0.88, tilt: false
    },
    '🔥 ULTRA 7: Quantum Reactor & Tesla': {
        tier: 'ultra', shader: 7, palette: 16, layers: ['tesla', 'hud'], mirror: 3, barrel: 0.08, wobble: 0.004, glslOp: 0.88, tilt: false
    },
    '🔥 ULTRA 8: Helix DNA & Neural Web': {
        tier: 'ultra', shader: 10, palette: 6, layers: ['neuralWeb', 'fireflies'], mirror: 0, barrel: 0.06, wobble: 0.004, glslOp: 0.74, tilt: true
    },
    '🔥 ULTRA 9: Molten Ruby Lava & Magma': {
        tier: 'ultra', shader: 12, palette: 17, layers: ['lavaLamp', 'eclipse'], mirror: 3, barrel: 0.10, wobble: 0.005, glslOp: 0.88, tilt: false
    },
    '🔥 ULTRA 10: Quantum Torus & Dyson Rings': {
        tier: 'ultra', shader: 14, palette: 11, layers: ['dyson', 'spirograph'], mirror: 1, barrel: 0.08, wobble: 0.004, glslOp: 0.88, tilt: true
    },
    '🔥 ULTRA 11: Cyber Rave Lasers & Pulsar': {
        tier: 'ultra', shader: 0, palette: 14, layers: ['lasers', 'joyDivision'], mirror: 0, barrel: 0.08, wobble: 0.005, glslOp: 0.92, tilt: true
    },
    '🔥 ULTRA 12: Star of David Maze & Water Rain': {
        tier: 'ultra', shader: 11, palette: 15, layers: ['starOfDavid', 'waterRipples'], mirror: 0, barrel: 0.08, wobble: 0.004, glslOp: 0.86, tilt: false
    }
};

const PRESET_KEYS = Object.keys(PRESETS_CATALOG);

// 4 режима управления: Ручной выбор пресетов + 3 уровня процедурного рандома Auto-DJ
const CONTROL_MODES = [
    '🎛️ Пресеты (Ручной выбор)',
    '🟢 Auto-DJ: LITE (1-2 слоя + любой фон)',
    '🟡 Auto-DJ: STANDART (2-3 слоя + любой фон)',
    '🔥 Auto-DJ: ULTRA (3-4 слоя + любой фон)'
];

const vizConfig = {
    controlMode: '🎛️ Пресеты (Ручной выбор)',
    preset: '🔥 ULTRA 1: Cyber Waves & Crystal (Твой пресет)',
    noteDivision: 4.0,
    performanceMode: 'Lite (Макс FPS)',
    autoDRS: true,
    currentFPS: 60,
    shaderMode: 0,
    glslOpacity: 1.0,
    enable3DLayers: true,

    enableShakeAndWobble: true,
    shakeLevel: 0.85,

    cameraTilt: true,
    tiltSpeed: 0.6,
    tiltAmount: 0.28,
    colorPalette: 0,
    speed: 1.0,
    raySteps: 20,

    starOfDavid:  { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    lavaLamp:     { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    tesla:        { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    lasers:       { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    joyDivision:  { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    spirograph:   { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    fireflies:    { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    waterRipples: { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    dyson:        { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    hud:          { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    neuralWeb:    { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    origami:      { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    ripples:      { on: false, opacity: 0.0,  targetOpacity: 0.0,  depth: 140 },
    crystal:      { on: true,  opacity: 0.85, targetOpacity: 0.85, freakout: 0.55 },
    tunnel:       { on: false, opacity: 0.0,  targetOpacity: 0.0,  twist: 1.2 },
    wheel:        { on: false, opacity: 0.0,  targetOpacity: 0.0,  hueRange: 0.6 },
    eclipse:      { on: false, opacity: 0.0,  targetOpacity: 0.0,  radius: 0.36, brightness: 1.2 },
    strips:       { on: false, opacity: 0.0,  targetOpacity: 0.0,  audioDepth: 120 },
    bars:         { on: false, opacity: 0.0,  targetOpacity: 0.0 },
    stars:        { on: true,  opacity: 0.80, targetOpacity: 0.80 },
    lightLeak:    { on: false, opacity: 0.0,  targetOpacity: 0.0,  freakOut: 0.45 }
};

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