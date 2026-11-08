// ============================================================================
// МОДУЛЬ 3: LAYERS3D.JS — ЛАБИРИНТ ЗВЕЗДЫ ДАВИДА, БОЛЬШАЯ ЛАВА-ЛАМПА И 21 СЛОЙ
// ============================================================================
const layers = {};
let mainStage;
let bgQuad, bgShaderMaterial, bgUniforms;

const _tmpColor1 = new THREE.Color();
const _tmpColor2 = new THREE.Color();

function setThemeColor(targetColor, t, paletteIdx = vizConfig.colorPalette) {
    const frac = ((t % 1.0) + 1.0) % 1.0;
    const s = Math.sin(frac * Math.PI * 2);
    const p = Number(paletteIdx);

    if (p === 0) targetColor.setHSL(0.52 + s * 0.18, 0.95, 0.58);
    else if (p === 1) targetColor.setHSL(0.92 + s * 0.12, 0.95, 0.58);
    else if (p === 2) targetColor.setHSL(0.38 + s * 0.08, 0.95, 0.54);
    else if (p === 3) targetColor.setHSL(frac > 0.5 ? 0.11 : 0.56, 0.9, 0.60);
    else if (p === 4) targetColor.setHSL(frac > 0.4 ? 0.98 : 0.62, 0.95, 0.56);
    else if (p === 5) targetColor.setHSL(0.26 + s * 0.16, 0.98, 0.56);
    else if (p === 6) targetColor.setHSL(0.46 + s * 0.10, 0.90, 0.60);
    else if (p === 7) targetColor.setHSL(0.04 + Math.abs(s) * 0.08, 0.98, 0.55);
    else if (p === 8) targetColor.setHSL(0.78 + s * 0.15, 0.85, 0.68);
    else if (p === 9) targetColor.setHSL(0.55 + s * 0.08, 0.95, 0.60);
    else if (p === 10) targetColor.setHSL(0.60, 0.12, 0.62 + s * 0.22);
    else if (p === 11) targetColor.setHSL(frac, 0.95, 0.58);
    // 6 новых сочных палитр для Лава-лампы:
    else if (p === 12) targetColor.setHSL(frac > 0.48 ? 0.06 : 0.80, 0.98, 0.58); // 70s Orange & Purple Wax
    else if (p === 13) targetColor.setHSL(frac > 0.45 ? 0.29 : 0.74, 0.98, 0.55); // Alien Slime Lime & Indigo
    else if (p === 14) targetColor.setHSL(frac > 0.50 ? 0.97 : 0.10, 0.96, 0.56); // Cherry & Amber Wax
    else if (p === 15) targetColor.setHSL(frac > 0.48 ? 0.05 : 0.64, 0.94, 0.62); // Cosmic Peach & Indigo
    else if (p === 16) targetColor.setHSL(frac > 0.50 ? 0.86 : 0.51, 0.98, 0.58); // Electric Fuchsia & Cyan
    else targetColor.setHSL(frac > 0.48 ? 0.12 : 0.98, 0.96, 0.56);               // Molten Gold & Ruby

    return targetColor;
}

function noise3D(x, y, z) {
    return (
        Math.sin(x * 1.2 + Math.cos(y * 1.3 + z * 0.9)) * 0.55 +
        Math.cos(y * 1.7 - Math.sin(z * 1.4 + x * 1.1)) * 0.45
    );
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

// ============================================================================
// ГЕНЕРАТОР ЛАБИРИНТА ЗВЕЗДЫ ДАВИДА (БЕЗ ВРАЩЕНИЯ — КОНЦЕНТРИЧЕСКИЙ ЛАБИРИНТ)
// ============================================================================
function getTriangleOutlineVertices(radius, angleOffset) {
    const v = [];
    for (let i = 0; i < 3; i++) {
        const a = i * (Math.PI * 2 / 3) + angleOffset;
        v.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return v;
}

// Создает один концентрический уровень лабиринта в форме Звезды Давида с проходами (воротами)
function createHexagramMazeRing(radius, zDepth, levelIndex) {
    const segPoints = [];

    // 2 треугольника Звезды Давида (прямой и перевернутый)
    for (let t = 0; t < 2; t++) {
        const angleOffset = (t === 0) ? (Math.PI / 2) : (-Math.PI / 2);
        const verts = getTriangleOutlineVertices(radius, angleOffset);

        for (let edge = 0; edge < 3; edge++) {
            const pA = verts[edge];
            const pB = verts[(edge + 1) % 3];

            // Каждая грань разбивается на участки с «воротами» лабиринта (проходами)
            const gateSlot = (levelIndex + edge + t * 2) % 3;
            const intervals = (gateSlot === 0)
                ? [[0.0, 0.22], [0.34, 1.0]]
                : (gateSlot === 1)
                    ? [[0.0, 0.44], [0.56, 1.0]]
                    : [[0.0, 0.66], [0.78, 1.0]];

            intervals.forEach(([s0, s1]) => {
                segPoints.push(
                    new THREE.Vector3(pA.x + (pB.x - pA.x) * s0, pA.y + (pB.y - pA.y) * s0, zDepth),
                    new THREE.Vector3(pA.x + (pB.x - pA.x) * s1, pA.y + (pB.y - pA.y) * s1, zDepth)
                );
            });
        }
    }

    // Радиальные перегородки-тупики лабиринта между соседними кольцами Звезды Давида
    if (levelIndex > 0) {
        const prevRadius = radius - 30;
        for (let b = 0; b < 6; b++) {
            if ((b + levelIndex) % 2 === 0) {
                const a = b * (Math.PI / 3) + (levelIndex % 2) * (Math.PI / 6);
                segPoints.push(
                    new THREE.Vector3(Math.cos(a) * prevRadius * 0.72, Math.sin(a) * prevRadius * 0.72, zDepth),
                    new THREE.Vector3(Math.cos(a) * radius * 0.72, Math.sin(a) * radius * 0.72, zDepth)
                );
            }
        }
    }

    const geo = new THREE.BufferGeometry().setFromPoints(segPoints);
    const mat = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    return new THREE.LineSegments(geo, mat);
}

function buildSceneAndLayers(scene, audioTexture) {
    bgUniforms = {
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_time:       { value: 0.0 },
        u_audioTime:  { value: 0.0 },
        u_sub:        { value: 0.0 },
        u_bass:       { value: 0.0 },
        u_snare:      { value: 0.0 },
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

    bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgShaderMaterial);
    bgQuad.frustumCulled = false;
    bgQuad.renderOrder = -100;
    scene.add(bgQuad);

    const dotTex = createGlowDotTexture();
    mainStage = new THREE.Group();
    scene.add(mainStage);

    // 1. RIPPLES
    layers.ripples = new THREE.Group();
    layers.ripples.lines = [];
    for (let j = 0; j < 14; j++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        layers.ripples.add(line);
        layers.ripples.lines.push(line);
    }
    mainStage.add(layers.ripples);

    // 2. CRYSTAL
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

    // 3. STAR OF DAVID LABYRINTH (✡️ Лабиринт Звезды Давида — 8 вложенных уровней без вращения!)
    layers.starOfDavid = new THREE.Group();
    layers.starOfDavid.mazeLevels = [];
    for (let lvl = 0; lvl < 8; lvl++) {
        const radius = 50 + lvl * 30;
        const zDepth = (4 - lvl) * 14;
        const mazeRing = createHexagramMazeRing(radius, zDepth, lvl);
        layers.starOfDavid.add(mazeRing);
        layers.starOfDavid.mazeLevels.push(mazeRing);
    }
    mainStage.add(layers.starOfDavid);

    // 4. GIANT LAVA LAMP METABALLS (🫧 Увеличенная Лава-лампа)
    layers.lavaLamp = new THREE.Group();
    const lavaShaderMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
            u_time: { value: 0 }, u_sub: { value: 0 }, u_bass: { value: 0 },
            u_snare: { value: 0 }, u_high: { value: 0 }, u_opacity: { value: 0.0 },
            u_color1: { value: new THREE.Color(0xff5500) }, u_color2: { value: new THREE.Color(0xaa00ff) }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv;
            uniform float u_time, u_sub, u_bass, u_snare, u_high, u_opacity;
            uniform vec3 u_color1, u_color2;
            void main() {
                if (u_opacity <= 0.01) discard;
                // Уменьшен множитель координат (1.02 вместо 1.35) и увеличен радиус капель в 1.5 раза!
                vec2 p = vUv * 1.02;
                float field = 0.0; vec2 grad = vec2(0.0);
                float spread = 0.34 + u_bass * 0.45 + u_snare * 0.35;
                for (int i = 0; i < 8; i++) {
                    float fi = float(i);
                    float a = fi * 0.785398 + u_time * (i - (i / 2) * 2 == 0 ? 0.38 : -0.32);
                    float orbitR = spread * (0.42 + 0.58 * sin(u_time * (0.55 + fi * 0.11) + fi * 1.7));
                    vec2 center = vec2(
                        cos(a) * orbitR + sin(u_time * 0.7 + fi) * 0.18,
                        sin(a * 1.25) * orbitR + cos(u_time * 0.55 + fi * 2.1) * 0.26
                    );
                    // Крупные сочные капли лавы
                    float radius = 0.155 + 0.035 * sin(fi * 2.3 + u_time) + u_sub * 0.04;
                    vec2 diff = p - center;
                    float d2 = max(dot(diff, diff), 0.002);
                    float contrib = (radius * radius) / d2;
                    field += contrib;
                    grad -= 2.0 * contrib * (diff / d2);
                }
                float blobMask = smoothstep(0.85, 1.15, field);
                float auraGlow = clamp(field * 0.36, 0.0, 0.90);
                if (blobMask + auraGlow < 0.02) discard;

                vec3 n = normalize(vec3(grad * 0.16, 1.0));
                vec3 lightDir = normalize(vec3(0.4, 0.75, 0.9));
                float diffLight = max(dot(n, lightDir), 0.0);
                float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
                float rim = smoothstep(1.40, 0.90, field) * blobMask;

                vec3 lavaCol = mix(u_color1, u_color2, clamp(p.y * 0.5 + 0.5 + sin(field * 1.4 - u_time) * 0.28, 0.0, 1.0));
                vec3 finalCol = lavaCol * (auraGlow * 0.48 + blobMask * (0.38 + diffLight * 0.68))
                              + mix(u_color2, vec3(1.0, 0.95, 0.85), 0.55) * rim * 0.9
                              + vec3(1.0) * spec * blobMask * (0.6 + u_high * 0.9);
                gl_FragColor = vec4(clamp(finalCol * u_opacity, 0.0, 1.6), clamp((blobMask * 0.92 + auraGlow * 0.48) * u_opacity, 0.0, 1.0));
            }
        `
    });
    // Увеличен размер холста лава-лампы до 1400x1400, чтобы она занимала весь экран
    const lavaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lavaShaderMat);
    lavaMesh.position.z = 30;
    layers.lavaLamp.shaderMat = lavaShaderMat;
    layers.lavaLamp.add(lavaMesh);
    mainStage.add(layers.lavaLamp);

    // 5. TESLA LIGHTNING ARCS
    layers.tesla = new THREE.Group();
    layers.tesla.bolts = [];
    for (let b = 0; b < 10; b++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0x88ffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        layers.tesla.add(line);
        layers.tesla.bolts.push(line);
    }
    mainStage.add(layers.tesla);

    // 6. CLUB LASER BEAMS
    layers.lasers = new THREE.Group();
    layers.lasers.beams = [];
    const beamGeo = new THREE.ConeGeometry(28, 720, 6, 1, true);
    beamGeo.translate(0, -360, 0);
    beamGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 14; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, mat);
        beam.position.z = -180;
        layers.lasers.add(beam);
        layers.lasers.beams.push(beam);
    }
    mainStage.add(layers.lasers);

    // 7. JOY DIVISION PULSAR WAVES
    layers.joyDivision = new THREE.Group();
    layers.joyDivision.lines = [];
    for (let r = 0; r < 18; r++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(56 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        layers.joyDivision.add(line);
        layers.joyDivision.lines.push(line);
    }
    mainStage.add(layers.joyDivision);

    // 8. SACRED LISSAJOUS SPIROGRAPH
    layers.spirograph = new THREE.Group();
    const spiroGeo = new THREE.BufferGeometry();
    spiroGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(260 * 3), 3));
    layers.spirograph.line = new THREE.Line(spiroGeo, new THREE.LineBasicMaterial({
        color: 0x00ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    layers.spirograph.add(layers.spirograph.line);
    mainStage.add(layers.spirograph);

    // 9. SWARM BOIDS / CYBER FIREFLIES
    layers.fireflies = new THREE.Group();
    const ffCount = 180;
    const ffGeo = new THREE.BufferGeometry();
    const ffPos = new Float32Array(ffCount * 3);
    const ffSeeds = new Float32Array(ffCount * 2);
    for (let i = 0; i < ffCount; i++) {
        ffSeeds[i * 2] = Math.random() * Math.PI * 2;
        ffSeeds[i * 2 + 1] = 60 + Math.random() * 260;
    }
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    layers.fireflies.seeds = ffSeeds;
    layers.fireflies.points = new THREE.Points(ffGeo, new THREE.PointsMaterial({
        size: 28, map: dotTex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffee88
    }));
    layers.fireflies.add(layers.fireflies.points);
    mainStage.add(layers.fireflies);

    // 10. LIQUID WATER RIPPLES
    layers.waterRipples = new THREE.Group();
    const waterMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
            u_time: { value: 0 }, u_bass: { value: 0 }, u_snare: { value: 0 },
            u_high: { value: 0 }, u_opacity: { value: 0 },
            u_color1: { value: new THREE.Color(0x00ffff) }, u_color2: { value: new THREE.Color(0xff00aa) }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv;
            uniform float u_time, u_bass, u_snare, u_high, u_opacity;
            uniform vec3 u_color1, u_color2;
            void main() {
                if (u_opacity <= 0.01) discard;
                vec2 p = vUv * 1.4;
                float waves = 0.0;
                for (int i = 0; i < 6; i++) {
                    float fi = float(i);
                    float tDrop = fract(u_time * 0.45 + fi * 0.166);
                    vec2 dropPos = vec2(sin(fi * 4.1 + floor(u_time * 0.45 + fi * 0.166) * 2.3), cos(fi * 2.7 + floor(u_time * 0.45) * 1.9)) * 0.55;
                    float d = length(p - dropPos);
                    float ring = sin((d - tDrop * (0.85 + u_bass * 0.35)) * 38.0);
                    float env = exp(-d * 3.5) * (1.0 - tDrop) * smoothstep(0.0, 0.1, tDrop);
                    waves += ring * env;
                }
                float intensity = smoothstep(0.15, 0.85, abs(waves) * (1.2 + u_snare * 0.8 + u_high * 0.6));
                vec3 col = mix(u_color1, u_color2, 0.5 + 0.5 * waves) * intensity;
                gl_FragColor = vec4(clamp(col * u_opacity, 0.0, 1.5), clamp(intensity * u_opacity, 0.0, 1.0));
            }
        `
    });
    layers.waterRipples.shaderMat = waterMat;
    layers.waterRipples.add(new THREE.Mesh(new THREE.PlaneGeometry(850, 850), waterMat));
    mainStage.add(layers.waterRipples);

    // 11. DYSON GYROSCOPE RINGS
    layers.dyson = new THREE.Group();
    layers.dyson.rings = [];
    for (let i = 0; i < 6; i++) {
        const r = 90 + i * 26;
        const geo = new THREE.TorusGeometry(r, 3.2, 8, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, wireframe: i % 2 === 0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        layers.dyson.add(ring);
        layers.dyson.rings.push(ring);
    }
    mainStage.add(layers.dyson);

    // 12. SCI-FI HUD EQUALIZER
    layers.hud = new THREE.Group();
    layers.hud.rings = [];
    const hudRadii = [110, 155, 205, 245];
    hudRadii.forEach((rad, i) => {
        const arcGeo = new THREE.RingGeometry(rad, rad + (i % 2 === 0 ? 5 : 3), 32, 1, 0, Math.PI * (1.35 + (i % 2) * 0.3));
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(arcGeo, mat);
        layers.hud.add(mesh);
        layers.hud.rings.push(mesh);
    });
    const crossPts = [
        new THREE.Vector3(-280, 0, 0), new THREE.Vector3(-80, 0, 0),
        new THREE.Vector3(80, 0, 0),   new THREE.Vector3(280, 0, 0),
        new THREE.Vector3(0, -280, 0), new THREE.Vector3(0, -80, 0),
        new THREE.Vector3(0, 80, 0),   new THREE.Vector3(0, 280, 0)
    ];
    layers.hud.crosshair = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(crossPts),
        new THREE.LineBasicMaterial({ color: 0xff0088, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
    );
    layers.hud.add(layers.hud.crosshair);
    mainStage.add(layers.hud);

    // 13. SYNAPSE NEURAL WEB
    layers.neuralWeb = new THREE.Group();
    const nodeCount = 32;
    layers.neuralWeb.nodes = [];
    for (let i = 0; i < nodeCount; i++) {
        layers.neuralWeb.nodes.push({
            ax: (Math.random() - 0.5) * 2.5,
            ay: (Math.random() - 0.5) * 2.5,
            az: (Math.random() - 0.5) * 2.5,
            phase: Math.random() * Math.PI * 2,
            x: 0, y: 0, z: 0
        });
    }
    const maxSynapses = 120;
    const synGeo = new THREE.BufferGeometry();
    synGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSynapses * 6), 3));
    layers.neuralWeb.synapseLines = new THREE.LineSegments(synGeo, new THREE.LineBasicMaterial({
        color: 0x00ffff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nodeCount * 3), 3));
    layers.neuralWeb.nodePoints = new THREE.Points(nodeGeo, new THREE.PointsMaterial({
        size: 24, map: dotTex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff
    }));
    layers.neuralWeb.add(layers.neuralWeb.synapseLines);
    layers.neuralWeb.add(layers.neuralWeb.nodePoints);
    mainStage.add(layers.neuralWeb);

    // 14. LOW-POLY ORIGAMI WORMHOLE
    layers.origami = new THREE.Group();
    layers.origami.shells = [];
    for (let i = 0; i < 10; i++) {
        const geo = new THREE.ConeGeometry(90 + i * 18, 120, i % 2 === 0 ? 3 : 4, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.z = (i - 5) * 55;
        layers.origami.add(mesh);
        layers.origami.shells.push(mesh);
    }
    mainStage.add(layers.origami);

    // 15. TUNNEL
    layers.tunnel = new THREE.Group();
    layers.tunnel.rings = [];
    const ringGeo = new THREE.RingGeometry(150, 158, 6);
    for (let i = 0; i < 18; i++) {
        const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
            color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        mesh.position.z = -i * 75 + 200;
        layers.tunnel.add(mesh);
        layers.tunnel.rings.push(mesh);
    }
    mainStage.add(layers.tunnel);

    // 16. WHEEL
    layers.wheel = new THREE.Group();
    layers.wheel.spokes = [];
    const spokeGeo = new THREE.PlaneGeometry(10, 120);
    spokeGeo.translate(0, 60, 0);
    for (let i = 0; i < 32; i++) {
        const spoke = new THREE.Mesh(spokeGeo, new THREE.MeshBasicMaterial({
            color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        spoke.rotation.z = (i / 32) * Math.PI * 2;
        layers.wheel.add(spoke);
        layers.wheel.spokes.push(spoke);
    }
    mainStage.add(layers.wheel);

    // 17. ECLIPSE
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

    // 18. STRIPS
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

    // 19. BARS
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

    // 20. STARS
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

    // 21. LIGHT LEAK
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

let frameCounter = 0;

function updateAllLayers(delta, elapsed, hasActiveSignal) {
    frameCounter++;
    const isEvenFrame = (frameCounter % 2 === 0);

    const t = audioState.audioTime;
    const sub = audioState.sub;
    const bass = audioState.bass;
    const snare = audioState.snare;
    const mid = audioState.mid;
    const high = audioState.high;
    const beat = audioState.beatPulse;
    const effShakeLvl = vizConfig.enableShakeAndWobble ? vizConfig.shakeLevel : 0.0;

    if (bgQuad) {
        bgQuad.visible = vizConfig.glslOpacity > 0.01;
    }

    if (bgUniforms && bgQuad.visible) {
        bgUniforms.u_time.value = elapsed * vizConfig.speed;
        bgUniforms.u_audioTime.value = t;
        bgUniforms.u_sub.value = sub;
        bgUniforms.u_bass.value = bass;
        bgUniforms.u_snare.value = snare;
        bgUniforms.u_mid.value = mid;
        bgUniforms.u_high.value = high;
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

    if (!vizConfig.enable3DLayers) return;

    LAYER_KEYS.forEach(k => {
        const cfg = vizConfig[k];
        cfg.opacity += (cfg.targetOpacity - cfg.opacity) * 0.14;
        layers[k].visible = cfg.opacity > 0.01;
    });

    // 1. RIPPLES
    if (layers.ripples.visible && isEvenFrame) {
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
            setThemeColor(_tmpColor1, j / count + t * 0.08);

            for (let i = 0; i < segs; i++) {
                const normX = i / (segs - 1) - 0.5;
                const waveVal = (waveData && hasActiveSignal) ? ((waveData[i * 4] - 128) / 128) : 0;
                const n = noise3D(normX * 3.5, j * 0.28, t * 0.8);
                posArr[i * 3]     = normX * 720;
                posArr[i * 3 + 1] = yBase + n * 35 * (0.35 + mid);
                posArr[i * 3 + 2] = n * (45 + bass * vizConfig.ripples.depth) + waveVal * 70 * snare;

                const bright = 0.65 + 0.35 * Math.sin(normX * Math.PI);
                colArr[i * 3]     = _tmpColor1.r * bright;
                colArr[i * 3 + 1] = _tmpColor1.g * bright;
                colArr[i * 3 + 2] = _tmpColor1.b * bright;
            }
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        }
    }

    // 2. CRYSTAL
    if (layers.crystal.visible) {
        const op = vizConfig.crystal.opacity;
        const geo = layers.crystal.wireMesh.geometry;
        const pos = geo.attributes.position.array;
        const base = geo.userData.basePositions;

        if (isEvenFrame) {
            for (let i = 0; i < pos.length; i += 3) {
                const bin = (i / 3) % 64;
                const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[bin] / 255) * audioState.currentGain * 0.75, 1.5) : 0;
                const spike = 1.0 + fVal * vizConfig.crystal.freakout * 0.85 + beat * 0.25;
                pos[i]     = base[i] * spike;
                pos[i + 1] = base[i + 1] * spike;
                pos[i + 2] = base[i + 2] * spike;
            }
            geo.attributes.position.needsUpdate = true;
        }

        layers.crystal.rotation.x += delta * (0.35 + bass * 0.8);
        layers.crystal.rotation.y += delta * (0.5 + snare * 1.1);
        layers.crystal.wireMesh.material.opacity = op * 0.9;
        layers.crystal.coreMesh.material.opacity = op * (0.15 + beat * 0.25);
        setThemeColor(layers.crystal.wireMesh.material.color, t * 0.1);
        setThemeColor(layers.crystal.coreMesh.material.color, t * 0.1 + 0.4);
    }

    // 3. STAR OF DAVID LABYRINTH (Не крутится! Волны света и глубины бегут по коридорам лабиринта)
    if (layers.starOfDavid.visible) {
        const op = vizConfig.starOfDavid.opacity;
        const mazeLevels = layers.starOfDavid.mazeLevels;

        for (let lvl = 0; lvl < mazeLevels.length; lvl++) {
            const ring = mazeLevels[lvl];
            const wavePhase = t * 2.5 - lvl * 0.55;
            const pulse = 0.5 + 0.5 * Math.sin(wavePhase);

            // Дыхание коридоров лабиринта по глубине Z под бас и снейр (без вращения!)
            ring.position.z = (4 - lvl) * (16 + bass * 18) + Math.sin(wavePhase) * 14 * snare;
            const breathScale = 1.0 + Math.sin(wavePhase) * 0.04 * (1.0 + bass) + beat * 0.06;
            ring.scale.set(breathScale, breathScale, 1.0);

            setThemeColor(ring.material.color, lvl * 0.11 + t * 0.08);
            ring.material.opacity = op * (0.45 + pulse * 0.50 + high * 0.25);
        }
    }

    // 4. GIANT LAVA LAMP
    if (layers.lavaLamp.visible) {
        const u = layers.lavaLamp.shaderMat.uniforms;
        u.u_time.value = elapsed * vizConfig.speed;
        u.u_sub.value = sub;
        u.u_bass.value = bass;
        u.u_snare.value = snare;
        u.u_high.value = high;
        u.u_opacity.value = vizConfig.lavaLamp.opacity;
        setThemeColor(u.u_color1.value, t * 0.05);
        setThemeColor(u.u_color2.value, t * 0.05 + 0.48);
    }

    // 5. TESLA LIGHTNING ARCS
    if (layers.tesla.visible) {
        const op = vizConfig.tesla.opacity;
        const bolts = layers.tesla.bolts;
        const maxR = 230 + bass * 70;
        const jitterAmp = 14 + snare * 38 + high * 28;

        for (let b = 0; b < bolts.length; b++) {
            const line = bolts[b];
            const posAttr = line.geometry.attributes.position;
            const arr = posAttr.array;
            const segs = arr.length / 3;
            const baseAngle = (b / bolts.length) * Math.PI * 2 + t * 0.35;

            for (let i = 0; i < segs; i++) {
                const frac = i / (segs - 1);
                const r = frac * maxR;
                const jitter = (i === 0) ? 0 : (Math.sin(i * 7.3 + elapsed * 45.0 + b * 3.1) * jitterAmp * Math.sin(frac * Math.PI));
                const perpA = baseAngle + Math.PI / 2;
                arr[i * 3]     = Math.cos(baseAngle) * r + Math.cos(perpA) * jitter;
                arr[i * 3 + 1] = Math.sin(baseAngle) * r + Math.sin(perpA) * jitter;
                arr[i * 3 + 2] = Math.cos(i * 4.2 - elapsed * 35.0) * jitter * 0.6;
            }
            posAttr.needsUpdate = true;
            setThemeColor(line.material.color, b / bolts.length + t * 0.2);
            line.material.opacity = op * (0.45 + high * 0.5 + beat * 0.35);
        }
    }

    // 6. CLUB LASER BEAMS
    if (layers.lasers.visible) {
        const op = vizConfig.lasers.opacity;
        const beams = layers.lasers.beams;
        for (let i = 0; i < beams.length; i++) {
            const beam = beams[i];
            const a = (i / beams.length) * Math.PI * 2 + t * 0.25;
            const spread = 0.55 + Math.sin(elapsed * 1.4 + i * 0.7) * (0.25 + mid * 0.35);
            beam.rotation.z = a;
            beam.rotation.x = Math.cos(a) * spread;
            beam.rotation.y = Math.sin(a) * spread;
            const sc = 0.6 + bass * 0.9 + (i % 2 === 0 ? beat * 0.5 : snare * 0.5);
            beam.scale.set(sc, sc, 1.0);
            setThemeColor(beam.material.color, i / beams.length + t * 0.15);
            beam.material.opacity = op * (0.22 + high * 0.35 + beat * 0.25);
        }
    }

    // 7. JOY DIVISION PULSAR WAVES
    if (layers.joyDivision.visible && isEvenFrame) {
        const op = vizConfig.joyDivision.opacity;
        const lines = layers.joyDivision.lines;
        for (let r = 0; r < lines.length; r++) {
            const line = lines[r];
            const posAttr = line.geometry.attributes.position;
            const arr = posAttr.array;
            const segs = arr.length / 3;
            const yBase = (r - lines.length / 2) * 18;

            for (let i = 0; i < segs; i++) {
                const normX = i / (segs - 1) - 0.5;
                const bell = Math.exp(-normX * normX * 10.0);
                const binIdx = Math.min(255, Math.floor(Math.abs(normX) * 80 + r * 6));
                const fVal = (freqData && hasActiveSignal) ? (freqData[binIdx] / 255) * audioState.currentGain * 0.7 : 0;
                const ridge = (fVal * 95 + Math.abs(noise3D(normX * 6.0, r * 0.5, t * 1.2)) * (18 + mid * 45)) * bell;

                arr[i * 3]     = normX * 460;
                arr[i * 3 + 1] = yBase + ridge;
                arr[i * 3 + 2] = (r - lines.length / 2) * 10;
            }
            posAttr.needsUpdate = true;
            setThemeColor(line.material.color, r / lines.length + t * 0.08);
            line.material.opacity = op * 0.9;
        }
    }

    // 8. SACRED LISSAJOUS SPIROGRAPH
    if (layers.spirograph.visible) {
        const op = vizConfig.spirograph.opacity;
        const line = layers.spirograph.line;
        const posAttr = line.geometry.attributes.position;
        const arr = posAttr.array;
        const pts = arr.length / 3;

        const freqA = 3.0 + Math.floor(mid * 3.0);
        const freqB = 4.0 + Math.floor(snare * 3.0);
        const radius = 210 + bass * 55;

        for (let i = 0; i < pts; i++) {
            const u = (i / (pts - 1)) * Math.PI * 2;
            arr[i * 3]     = Math.sin(freqA * u + t * 1.2) * Math.cos(u) * radius;
            arr[i * 3 + 1] = Math.sin(freqB * u - t * 0.9) * Math.sin(u) * radius;
            arr[i * 3 + 2] = Math.cos((freqA + freqB) * u) * 70 * snare;
        }
        posAttr.needsUpdate = true;
        line.rotation.z += delta * 0.35;
        setThemeColor(line.material.color, t * 0.15);
        line.material.opacity = op * 0.95;
    }

    // 9. SWARM BOIDS / CYBER FIREFLIES
    if (layers.fireflies.visible) {
        const op = vizConfig.fireflies.opacity;
        const posAttr = layers.fireflies.points.geometry.attributes.position;
        const arr = posAttr.array;
        const seeds = layers.fireflies.seeds;
        const count = seeds.length / 2;

        for (let i = 0; i < count; i++) {
            const phase = seeds[i * 2];
            const baseR = seeds[i * 2 + 1];
            const angle = phase + t * (0.9 + (i % 5) * 0.15);
            const r = baseR * (0.65 + bass * 0.55 + beat * 0.3) + Math.sin(elapsed * 2.5 + phase) * 35;
            arr[i * 3]     = Math.cos(angle) * r;
            arr[i * 3 + 1] = Math.sin(angle * 1.2) * r * 0.75 + Math.cos(t + phase) * 45 * mid;
            arr[i * 3 + 2] = Math.sin(angle) * 160;
        }
        posAttr.needsUpdate = true;
        setThemeColor(layers.fireflies.points.material.color, t * 0.1 + 0.2);
        layers.fireflies.points.material.opacity = op * 0.95;
        layers.fireflies.points.material.size = 22 + high * 18 + beat * 8;
    }

    // 10. WATER RIPPLES
    if (layers.waterRipples.visible) {
        const u = layers.waterRipples.shaderMat.uniforms;
        u.u_time.value = elapsed * vizConfig.speed;
        u.u_bass.value = bass;
        u.u_snare.value = snare;
        u.u_high.value = high;
        u.u_opacity.value = vizConfig.waterRipples.opacity;
        setThemeColor(u.u_color1.value, t * 0.08);
        setThemeColor(u.u_color2.value, t * 0.08 + 0.4);
    }

    // 11. DYSON GYROSCOPE RINGS
    if (layers.dyson.visible) {
        const op = vizConfig.dyson.opacity;
        const rings = layers.dyson.rings;
        for (let i = 0; i < rings.length; i++) {
            const ring = rings[i];
            const dir = (i % 2 === 0) ? 1 : -1;
            ring.rotation.x += delta * dir * (0.4 + snare * 1.2 + i * 0.08);
            ring.rotation.y += delta * -dir * (0.5 + mid * 1.1);
            ring.rotation.z += delta * 0.25;
            const sc = 1.0 + (i % 2 === 0 ? bass * 0.22 : sub * 0.25);
            ring.scale.setScalar(sc);
            setThemeColor(ring.material.color, i / rings.length + t * 0.12);
            ring.material.opacity = op * 0.85;
        }
    }

    // 12. SCI-FI HUD EQUALIZER
    if (layers.hud.visible) {
        const op = vizConfig.hud.opacity;
        const rings = layers.hud.rings;
        for (let i = 0; i < rings.length; i++) {
            const r = rings[i];
            r.rotation.z += delta * (i % 2 === 0 ? 0.55 : -0.75) * (1.0 + snare * 1.5);
            const sc = 1.0 + (i % 2 === 0 ? bass * 0.18 : high * 0.22);
            r.scale.set(sc, sc, 1.0);
            setThemeColor(r.material.color, i * 0.25 + t * 0.1);
            r.material.opacity = op * (0.65 + high * 0.35);
        }
        layers.hud.crosshair.rotation.z = Math.sin(elapsed * 0.8) * 0.15;
        layers.hud.crosshair.material.opacity = op * (0.5 + beat * 0.5);
    }

    // 13. SYNAPSE NEURAL WEB
    if (layers.neuralWeb.visible && isEvenFrame) {
        const op = vizConfig.neuralWeb.opacity;
        const nodes = layers.neuralWeb.nodes;
        const nodeArr = layers.neuralWeb.nodePoints.geometry.attributes.position.array;
        const synArr = layers.neuralWeb.synapseLines.geometry.attributes.position.array;
        const spread = 220 + bass * 60;

        for (let i = 0; i < nodes.length; i++) {
            const nd = nodes[i];
            nd.x = Math.sin(t * 0.7 * nd.ax + nd.phase) * spread;
            nd.y = Math.cos(t * 0.6 * nd.ay + nd.phase) * spread * 0.75;
            nd.z = Math.sin(t * 0.5 * nd.az - nd.phase) * 140;
            nodeArr[i * 3]     = nd.x;
            nodeArr[i * 3 + 1] = nd.y;
            nodeArr[i * 3 + 2] = nd.z;
        }
        layers.neuralWeb.nodePoints.geometry.attributes.position.needsUpdate = true;

        let segIdx = 0;
        const maxSegs = synArr.length / 6;
        const thresholdSq = (135 + mid * 65) * (135 + mid * 65);

        for (let i = 0; i < nodes.length && segIdx < maxSegs; i++) {
            for (let j = i + 1; j < nodes.length && segIdx < maxSegs; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dz = nodes[i].z - nodes[j].z;
                if (dx * dx + dy * dy + dz * dz < thresholdSq) {
                    const base = segIdx * 6;
                    synArr[base]     = nodes[i].x; synArr[base + 1] = nodes[i].y; synArr[base + 2] = nodes[i].z;
                    synArr[base + 3] = nodes[j].x; synArr[base + 4] = nodes[j].y; synArr[base + 5] = nodes[j].z;
                    segIdx++;
                }
            }
        }
        for (let k = segIdx * 6; k < synArr.length; k++) synArr[k] = 0;
        layers.neuralWeb.synapseLines.geometry.attributes.position.needsUpdate = true;

        setThemeColor(layers.neuralWeb.synapseLines.material.color, t * 0.12);
        layers.neuralWeb.synapseLines.material.opacity = op * (0.55 + high * 0.45);
        layers.neuralWeb.nodePoints.material.opacity = op * 0.95;
    }

    // 14. ORIGAMI WORMHOLE
    if (layers.origami.visible) {
        const op = vizConfig.origami.opacity;
        const shells = layers.origami.shells;
        for (let i = 0; i < shells.length; i++) {
            const s = shells[i];
            s.rotation.y += delta * (i % 2 === 0 ? 0.45 : -0.45) * (1.0 + snare * 1.2);
            const sc = 0.85 + Math.sin(t * 2.0 + i * 0.5) * 0.2 + bass * 0.35;
            s.scale.set(sc, sc, 1.0 + mid * 0.4);
            setThemeColor(s.material.color, i / shells.length + t * 0.1);
            s.material.opacity = op * 0.8;
        }
    }

    // 15. TUNNEL
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
            ring.rotation.z = idx * 0.16 * vizConfig.tunnel.twist + t * 0.4 + snare * 0.2;
            ring.material.opacity = op * Math.sin(Math.max(0, Math.min(1, depthNorm)) * Math.PI) * 0.85;
            setThemeColor(ring.material.color, idx / rings.length + t * 0.1);
        });
    }

    // 16. WHEEL
    if (layers.wheel.visible) {
        const op = vizConfig.wheel.opacity;
        layers.wheel.rotation.z += delta * (0.35 + snare * 0.4);
        layers.wheel.spokes.forEach((spoke, i) => {
            const fVal = (freqData && hasActiveSignal) ? Math.min((freqData[i * 4] / 255) * audioState.currentGain * 0.75, 1.4) : 0.1;
            spoke.scale.y = 0.25 + fVal * 2.4 + bass * 0.5;
            spoke.scale.x = 0.6 + fVal * 1.2;
            spoke.material.opacity = op * (0.3 + fVal * 0.7);
            setThemeColor(spoke.material.color, (i / 32) * vizConfig.wheel.hueRange + t * 0.15);
        });
    }

    // 17. ECLIPSE
    if (layers.eclipse.visible) {
        const u = layers.eclipse.shaderMat.uniforms;
        u.u_time.value = t;
        u.u_bass.value = bass;
        u.u_mid.value = mid;
        u.u_opacity.value = vizConfig.eclipse.opacity;
        setThemeColor(u.u_color1.value, t * 0.08);
        setThemeColor(u.u_color2.value, t * 0.08 + 0.45);
    }

    // 18. STRIPS
    if (layers.strips.visible && isEvenFrame) {
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
            setThemeColor(line.material.color, s / lines.length + t * 0.1);
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

    // 19. BARS
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
            setThemeColor(mesh.material.color, i / 24 + t * 0.1);
        });
    }

    // 20. STARS
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
        layers.stars.points.material.size = 16 + high * 14 + bass * 6;
    }

    // 21. LIGHT LEAK
    if (layers.lightLeak.visible) {
        const u = layers.lightLeak.shaderMat.uniforms;
        u.u_time.value = elapsed;
        u.u_bass.value = bass + beat * 0.5;
        u.u_opacity.value = vizConfig.lightLeak.opacity;
        u.u_freak.value = vizConfig.lightLeak.freakOut;
    }
}