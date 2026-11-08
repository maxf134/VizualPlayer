// ============================================================================
// МОДУЛЬ 2: SHADERS.JS — GLSL ШЕЙДЕРЫ ФОНА (18 ПАЛИТР) И ПОСТ-ПРОЦЕССИНГА
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
    uniform float u_snare;
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

    // 18 цветовых палитр (включая 6 специальных палитр под Лава-лампу)
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
        } else if (u_palette == 12) {
            // 13. Lava 70s Classic (Оранжевый воск и глубокий фиолет)
            a = vec3(0.65, 0.32, 0.48); b = vec3(0.45, 0.35, 0.42); c = vec3(1.0, 0.8, 0.9); d = vec3(0.02, 0.28, 0.62);
        } else if (u_palette == 13) {
            // 14. Lava Alien Slime (Ядовитый лайм и темно-фиолетовый)
            a = vec3(0.38, 0.62, 0.35); b = vec3(0.42, 0.45, 0.45); c = vec3(1.0, 1.0, 1.0); d = vec3(0.32, 0.08, 0.68);
        } else if (u_palette == 14) {
            // 15. Lava Cherry & Amber (Густая вишня и теплый янтарь)
            a = vec3(0.68, 0.25, 0.22); b = vec3(0.45, 0.32, 0.20); c = vec3(1.0, 0.9, 0.6); d = vec3(0.00, 0.12, 0.38);
        } else if (u_palette == 15) {
            // 16. Lava Cosmic Peach & Indigo (Неоновый персик и индиго)
            a = vec3(0.55, 0.42, 0.58); b = vec3(0.45, 0.38, 0.42); c = vec3(1.0, 0.85, 1.0); d = vec3(0.08, 0.22, 0.58);
        } else if (u_palette == 16) {
            // 17. Lava Electric Fuchsia & Cyan (Фуксия и электрическая лазурь)
            a = vec3(0.55, 0.35, 0.65); b = vec3(0.45, 0.45, 0.38); c = vec3(1.0, 1.0, 1.0); d = vec3(0.82, 0.38, 0.52);
        } else if (u_palette == 17) {
            // 18. Lava Molten Gold & Ruby (Жидкое золото и рубин)
            a = vec3(0.68, 0.38, 0.15); b = vec3(0.42, 0.35, 0.18); c = vec3(1.0, 0.85, 0.5); d = vec3(0.03, 0.14, 0.45);
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
        float amp = 0.62 + u_bass * 0.52 + u_sub * 0.2;
        float h = sin(p.x * 0.45 + u_audioTime * 1.1) * cos(p.y * 0.38 + u_audioTime * 0.9) * amp;
        h += sin(p.x * 0.95 - p.y * 0.65 + u_time * 1.8) * (0.20 + u_mid * 0.32);
        return h;
    }

    vec3 renderCyberWaves(vec2 uv) {
        vec3 ro = vec3(0.0, 2.3, u_audioTime * 3.2);
        vec3 rd = normalize(vec3(uv.x, uv.y - 0.12, 1.35));

        float fftX = sampleFFT(abs(uv.x) * 0.7);
        vec3 skyCol = getPalette(uv.y * 0.5 + 0.2) * (0.08 + 0.15 * exp(-abs(uv.y) * 4.0));
        float aurora = smoothstep(0.08, 0.0, abs(uv.y - 0.22 - fftX * 0.18 + sin(uv.x * 4.0 + u_time) * 0.04));
        skyCol += getPalette(abs(uv.x) + u_time * 0.1) * aurora * (0.4 + u_mid * 0.85);

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

        vec3 col = waveCol * (0.28 + diff * 0.75) + rimCol * fresnel * (0.75 + u_bass * 0.85 + u_high * 0.4);
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
        for (int i = 0; i < 4; i++) {
            p = abs(p) - vec3(0.68 + u_bass * 0.16, 0.68 + u_snare * 0.16, 0.85);
            p.xy *= rot(0.48 + u_time * 0.05 + u_snare * 0.08);
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
                          + cos(uv.x * (4.2 - fi * 0.3) - u_time * 1.3) * (0.09 + u_mid * 0.16)
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
        q.xz *= rot(u_time * 0.35 + u_snare * 0.2);
        q.xy *= rot(u_time * 0.25);

        float r = length(q);
        vec3 n = q / max(r, 0.001);
        float spikes = sin(n.x * 6.0 + u_audioTime * 2.0) 
                     * sin(n.y * 6.0 - u_audioTime * 1.8) 
                     * sin(n.z * 6.0 + u_audioTime * 2.2);
        float disp = spikes * (0.22 + u_bass * 0.50 + u_snare * 0.2);
        float sphere = r - (1.42 + u_sub * 0.35 + disp);

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
                + vec3(0.9, 0.95, 1.0) * spec * (0.65 + u_high * 1.1);
        }
        return col;
    }

    // --- 4. UBERVIZ HYPER-PORTAL ---
    vec3 renderHyperPortal(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, u_audioTime * 4.5);
        vec3 rd = normalize(vec3(uv, 1.1));
        rd.xy *= rot(u_audioTime * 0.12 + u_snare * 0.15);

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
        p.xy *= rot(p.z * 0.08 + u_snare * 0.08);
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
            col += surfCol * 0.65 * exp(-t * 0.08) + getPalette(u_time) * veins * (1.0 + u_high * 1.8);
        }
        return col;
    }

    // --- 6. SOUNDECLIPSE SPECTRUM ---
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

    // --- 7. QUANTUM PLASMA VORTEX ---
    float mapPlasmaVortex(vec3 p) {
        p.xz *= rot(u_time * 0.3);
        p.xy *= rot(p.z * 0.35 - u_audioTime * 0.8);

        float r = length(p.xy);
        float a = safeAtan(p.y, p.x);

        float spiral = sin(a * 3.0 + p.z * 2.2 - u_audioTime * 3.5) * (0.28 + u_bass * 0.25);
        float tube = abs(r - (1.25 + spiral)) - (0.08 + u_mid * 0.06);

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

    // --- 8. SINGULARITY BLACK HOLE ---
    vec3 renderBlackHole(vec2 uv) {
        vec3 ro = vec3(0.0, 0.0, -4.6);
        vec3 rd = normalize(vec3(uv, 1.3));

        vec3 p = ro;
        vec3 col = vec3(0.0);
        float holeRadius = 0.62 + u_sub * 0.18;
        mat2 diskTilt = rot(0.32 + sin(u_time * 0.3) * 0.08);
        mat2 diskRoll = rot(sin(u_time * 0.2) * 0.12);

        for (int i = 0; i < MAX_LOOP; i++) {
            if (i >= u_maxSteps) break;
            float r = length(p);
            if (r < holeRadius) break;

            vec3 gravity = -normalize(p) * (0.075 + u_bass * 0.045) / max(r * r, 0.14);
            rd = normalize(rd + gravity);
            p += rd * 0.18;

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
        float ring = 0.013 / (abs(length(uv) - 0.22 - u_bass * 0.035) + 0.008);
        col += getPalette(u_time * 0.2 + 0.5) * ring * (0.55 + u_high * 0.9);
        return col;
    }

    // --- 9. SUPERNOVA PLASMA NEBULA ---
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

    // --- 10. CYBER DNA DOUBLE HELIX ---
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

    // --- 13. SYNTHWAVE RETRO SUN & GRID ---
    vec3 renderRetroSunGrid(vec2 uv) {
        vec3 col = vec3(0.02, 0.0, 0.06);

        float sunR = length(uv);
        float sunRadius = 0.34 + u_bass * 0.045;

        if (sunR < sunRadius) {
            float stripes = sin((uv.y + 0.15) * 60.0 - u_time * 3.0);
            float mask = step(0.0, stripes + (uv.y + 0.05) * 3.0);
            vec3 sunCol = mix(vec3(1.0, 0.1, 0.55), vec3(1.0, 0.85, 0.1), clamp((uv.y + sunRadius) / (2.0 * sunRadius), 0.0, 1.0));
            col += sunCol * mask * (1.05 + u_bass * 0.45);
        }
        col += getPalette(length(uv) + u_time * 0.08) * exp(-sunR * 3.8) * (0.55 + u_bass * 0.55);

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

    // --- 15. AURORA BOREALIS FLOW ---
    vec3 renderAuroraFlow(vec2 uv) {
        vec3 col = vec3(0.01, 0.02, 0.05);
        float r = length(uv);

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

// Шейдер каскада пост-обработки FX Rack
const UberVizFXShader = {
    uniforms: {
        tDiffuse:         { value: null },
        u_time:           { value: 0.0 },
        u_bass:           { value: 0.0 },
        u_snare:          { value: 0.0 },
        u_high:           { value: 0.0 },
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
        uniform float u_time, u_bass, u_snare, u_high, u_beat, u_shakeMode, u_shakeLevel;
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

            float shiftAmt = u_rgbShift + (u_bass * 0.0025 + u_high * 0.003 + u_beat * 0.0025) * u_shakeLevel * u_shakeMode;
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
                    uv += vec2(sin(u_time * 45.0), cos(u_time * 38.0)) * effShake * (u_beat * 0.75 + u_bass * 0.25);
                }
                float effWobble = u_wobbleStrength * u_shakeLevel;
                if (effWobble > 0.0001) {
                    float w = effWobble * (0.35 + u_snare * 0.85);
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