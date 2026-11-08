// ============================================================================
// МОДУЛЬ 4: AUDIO.JS — ПЛЕЕР, МИКРОФОН, ЗВУК ПК, 5 ИНСТРУМЕНТОВ И АВТО-BPM
// ============================================================================
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

const btnMic = document.getElementById('btn-mic');
const btnSysAudio = document.getElementById('btn-sys-audio');
const micSelect = document.getElementById('mic-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;

let liveMode = 'none'; // 'none' | 'mic' | 'system'
let liveStream = null;
let liveStreamSource = null;
let baseStatusLabel = 'Источник: Плейлист (Ожидание)';

let audioCtx, analyser, fileSource;
let freqData, waveData, audioTextureData, audioTexture;
const FFT_SIZE = 1024;
const BIN_COUNT = 512;

const audioState = {
    autoGainEnabled: true,
    targetLevel: 0.42,
    manualGain: 1.35,
    currentGain: 1.35,
    agcEnvelope: 0.25,

    sub: 0,
    bass: 0,
    snare: 0,
    mid: 0,
    high: 0,
    volume: 0,

    beatHoldTime: 14,
    beatThreshold: 0.30,
    beatDecayRate: 0.965,
    smoothing: 0.76,
    beatPulse: 0,
    beatCutoff: 0.34,
    beatFrames: 0,

    detectedBPM: 120,
    beatTimestamps: [],
    bpmClockBeats: 0,
    lastSwitchBeatStep: 0,
    audioTime: 0
};

function createAudioDataTexture() {
    audioTextureData = new Uint8Array(256 * 2);
    audioTexture = new THREE.DataTexture(
        audioTextureData, 256, 2, THREE.LuminanceFormat, THREE.UnsignedByteType
    );
    audioTexture.magFilter = THREE.LinearFilter;
    audioTexture.minFilter = THREE.LinearFilter;
    audioTexture.wrapS = THREE.ClampToEdgeWrapping;
    audioTexture.wrapT = THREE.ClampToEdgeWrapping;
    audioTexture.generateMipmaps = false;
    audioTexture.needsUpdate = true;
    return audioTexture;
}

function updateStatusUI(modeLabel, isActive) {
    if (modeLabel) baseStatusLabel = modeLabel;
    const bpmText = isActive ? ` • 🥁 ${audioState.detectedBPM} BPM` : '';
    if (statusText) statusText.textContent = baseStatusLabel + bpmText;
    if (statusDot) statusDot.classList.toggle('live', isActive);
    if (btnMic) btnMic.classList.toggle('active', liveMode === 'mic');
    if (btnSysAudio) btnSysAudio.classList.toggle('active', liveMode === 'system');
    if (micSelect) micSelect.style.display = (liveMode === 'mic' && micSelect.options.length > 0) ? 'block' : 'none';
}

function registerBeatForBPM(nowMs) {
    const times = audioState.beatTimestamps;
    if (times.length > 0 && (nowMs - times[times.length - 1]) < 210) return;
    times.push(nowMs);
    if (times.length > 14) times.shift();

    if (times.length >= 4) {
        const intervals = [];
        for (let i = 1; i < times.length; i++) {
            let dt = times[i] - times[i - 1];
            while (dt < 340) dt *= 2.0;
            while (dt > 920) dt *= 0.5;
            if (dt >= 340 && dt <= 920) intervals.push(dt);
        }
        if (intervals.length >= 3) {
            intervals.sort((a, b) => a - b);
            const medianDt = intervals[Math.floor(intervals.length / 2)];
            const rawBPM = 60000 / medianDt;
            audioState.detectedBPM = Math.round(audioState.detectedBPM * 0.7 + rawBPM * 0.3);
            audioState.detectedBPM = Math.min(Math.max(audioState.detectedBPM, 65), 180);
            updateStatusUI(null, true);
        }
    }
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
        if (liveMode === 'mic' && audioInputs.length > 0) micSelect.style.display = 'block';
    } catch (e) {}
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

        const audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        if (deviceId) audioConstraints.deviceId = { exact: deviceId };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        liveStream = stream;
        liveMode = 'mic';
        audioState.beatTimestamps = [];

        liveStreamSource = audioCtx.createMediaStreamSource(stream);
        liveStreamSource.connect(analyser);

        const activeTrack = stream.getAudioTracks()[0];
        const currentSettings = activeTrack && activeTrack.getSettings ? activeTrack.getSettings() : {};
        await populateAudioDevices(currentSettings.deviceId || deviceId);

        updateStatusUI(`🎤 LIVE: ${(activeTrack && activeTrack.label) ? activeTrack.label : 'Микрофон'}`, true);
        activeTrack.addEventListener('ended', () => { if (liveMode === 'mic') stopLiveStream(); });
    } catch (err) {
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
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false }
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            stream.getTracks().forEach(t => t.stop());
            alert("Отметьте галочку «Предоставить доступ к аудио» внизу окна выбора!");
            return;
        }
        stream.getVideoTracks().forEach(vTrack => { vTrack.enabled = false; });

        liveStream = stream;
        liveMode = 'system';
        audioState.beatTimestamps = [];

        liveStreamSource = audioCtx.createMediaStreamSource(stream);
        liveStreamSource.connect(analyser);

        updateStatusUI('🖥️ LIVE: Системный звук ПК', true);
        audioTracks[0].addEventListener('ended', () => { if (liveMode === 'system') stopLiveStream(); });
    } catch (err) {
        stopLiveStream();
    }
}

if (btnMic) btnMic.addEventListener('click', () => { if (liveMode === 'mic') stopLiveStream(); else startMicrophoneCapture(); });
if (btnSysAudio) btnSysAudio.addEventListener('click', () => { if (liveMode === 'system') stopLiveStream(); else startSystemAudioCapture(); });
if (micSelect) micSelect.addEventListener('change', (e) => { if (e.target.value) startMicrophoneCapture(e.target.value); });

// Плейлист и управление треками
fileInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const wasEmpty = playlist.length === 0;
    files.forEach(file => {
        playlist.push({ name: file.name.replace(/\.[^/.]+$/, ""), url: URL.createObjectURL(file) });
    });
    updatePlaylistUI();
    if (!isPlaying && wasEmpty) { loadTrack(0); playTrack(); }
});

function updatePlaylistUI() {
    playlistEl.innerHTML = '';
    trackCountEl.textContent = playlist.length;
    playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${track.name}`;
        if (index === currentTrackIndex) li.classList.add('active');
        li.addEventListener('dblclick', () => { loadTrack(index); playTrack(); });
        li.addEventListener('touchend', () => { loadTrack(index); playTrack(); });
        playlistEl.appendChild(li);
    });
}

function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    audio.src = playlist[currentTrackIndex].url;
    audioState.beatTimestamps = [];
    updatePlaylistUI();
    initAudioContext();
}

function playTrack() {
    if (!audio.src && playlist.length > 0) loadTrack(0);
    if (!audio.src) return;
    if (liveMode !== 'none') stopLiveStream();
    initAudioContext();
    audio.play().catch(() => {});
    isPlaying = true;
    btnPlay.textContent = '⏸';
    updateStatusUI(`🎵 ${playlist[currentTrackIndex]?.name || 'Трек'}`, true);
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

btnPlay.addEventListener('click', () => { if (isPlaying) pauseTrack(); else playTrack(); });
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

volumeBar.addEventListener('input', (e) => { audio.volume = e.target.value; });
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

function updateAudioAnalysis(delta, onBeatStepCallback) {
    const isAudioSourceActive = isPlaying || (liveMode !== 'none');

    if (analyser && freqData && isAudioSourceActive) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(waveData);

        let subSum = 0, kickSum = 0, snareSum = 0, midSum = 0, highSum = 0, totalSum = 0;
        for (let i = 1; i <= 2; i++) subSum += freqData[i];
        for (let i = 3; i <= 5; i++) kickSum += freqData[i];
        for (let i = 6; i <= 21; i++) snareSum += freqData[i];
        for (let i = 22; i <= 93; i++) midSum += freqData[i];
        for (let i = 94; i < 256; i++) highSum += freqData[i];
        for (let i = 0; i < 256; i++) totalSum += freqData[i];

        const rawAvg = totalSum / 256 / 255;
        const rawKickNorm = kickSum / 3 / 255;
        const energySignal = Math.max(rawAvg * 0.6 + rawKickNorm * 0.4, 0.001);

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

            audioTextureData.set(freqData.subarray(0, 256), 0);
            audioTextureData.set(waveData.subarray(0, 256), 256);
            audioTexture.needsUpdate = true;

            const targetSub   = Math.min((subSum / 2 / 255) * g, 2.2);
            const targetBass  = Math.min(rawKickNorm * g, 2.2);
            const targetSnare = Math.min((snareSum / 16 / 255) * g, 2.0);
            const targetMid   = Math.min((midSum / 72 / 255) * g, 2.0);
            const targetHigh  = Math.min((highSum / 162 / 255) * g * 1.25, 2.2);
            const targetVol   = Math.min(rawAvg * g, 2.0);

            audioState.sub    += (targetSub   - audioState.sub)   * 0.25;
            audioState.bass   += (targetBass  - audioState.bass)  * 0.45;
            audioState.snare  += (targetSnare - audioState.snare) * 0.38;
            audioState.mid    += (targetMid   - audioState.mid)   * 0.25;
            audioState.high   += (targetHigh  - audioState.high)  * 0.50;
            audioState.volume += (targetVol   - audioState.volume) * 0.25;

            const kickTrigger = audioState.bass * 0.75 + audioState.sub * 0.25;
            if (kickTrigger > audioState.beatCutoff && kickTrigger > audioState.beatThreshold) {
                audioState.beatPulse = 1.0;
                audioState.beatCutoff = kickTrigger * 1.14;
                audioState.beatFrames = 0;
                registerBeatForBPM(performance.now());
            } else {
                if (audioState.beatFrames <= audioState.beatHoldTime) {
                    audioState.beatFrames++;
                } else {
                    audioState.beatCutoff *= audioState.beatDecayRate;
                    audioState.beatCutoff = Math.max(audioState.beatCutoff, audioState.beatThreshold);
                }
            }
            audioState.beatPulse *= 0.85;

            const beatsPerSecond = audioState.detectedBPM / 60.0;
            audioState.bpmClockBeats += delta * beatsPerSecond;

            const division = Number(vizConfig.noteDivision) || 1.0;
            const currentStep = Math.floor(audioState.bpmClockBeats / division);

            if (currentStep > audioState.lastSwitchBeatStep) {
                audioState.lastSwitchBeatStep = currentStep;
                if (onBeatStepCallback) onBeatStepCallback();
            }
        } else {
            decaySilentAudio();
        }
    } else {
        decaySilentAudio();
    }

    audioState.audioTime += delta * vizConfig.speed * (0.35 + audioState.bass * 1.25 + audioState.beatPulse * 0.4);
}

function decaySilentAudio() {
    audioState.sub    *= 0.90;
    audioState.bass   *= 0.90;
    audioState.snare  *= 0.90;
    audioState.mid    *= 0.90;
    audioState.high   *= 0.90;
    audioState.volume *= 0.90;
    audioState.beatPulse *= 0.82;
}