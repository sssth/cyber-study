export const audioTracks = [
  { id: 'rain', label: '雨声' },
  { id: 'hum', label: '设备低鸣' },
  { id: 'city', label: '远处城市' }
];

export const sceneAudioProfiles = {
  'neon-night': {
    rain: 0.18,
    hum: 0.34,
    city: 0.22
  },
  'rain-city': {
    rain: 0.62,
    hum: 0.2,
    city: 0.14
  },
  'low-light': {
    rain: 0.08,
    hum: 0.26,
    city: 0.05
  }
};

function clampVolume(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/**
 * 使用 Web Audio API 现场合成环境音。
 * Demo 阶段不依赖外部音频文件，之后可在同一个接口下替换为本地采样。
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings?.audio ?? { masterVolume: 0.55, muted: false };
    this.context = null;
    this.masterGain = null;
    this.trackGains = new Map();
    this.trackControls = new Map();
    this.activeScene = 'neon-night';
    this.loopSpec = null;
    this.loop = null;
    this.activeMix = sceneAudioProfiles[this.activeScene];
    this.enabled = false;
  }

  get initialized() {
    return Boolean(this.context);
  }

  get status() {
    if (!this.context) return 'reserved';
    if (this.settings.muted) return 'muted';
    return this.context.state === 'running' ? 'ready' : 'suspended';
  }

  async enable() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('当前环境不支持 Web Audio。');
      }

      this.context = new AudioContextClass({ latencyHint: 'playback' });
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.settings.muted ? 0 : clampVolume(this.settings.masterVolume);
      this.masterGain.connect(this.context.destination);

      this.#createRainTrack();
      this.#createHumTrack();
      this.#createCityTrack();
      this.setVolumeNow(this.masterGain.gain, this.settings.muted ? 0 : clampVolume(this.settings.masterVolume));
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.enabled = true;
    this.setScene(this.activeScene, { mix: this.activeMix, loop: this.loopSpec });
    return this;
  }

  async toggleMute() {
    if (!this.context) {
      this.settings.muted = !this.settings.muted;
      return this.settings.muted;
    }

    this.settings.muted = !this.settings.muted;
    const target = this.settings.muted ? 0 : clampVolume(this.settings.masterVolume);

    if (!this.settings.muted && this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.setVolumeNow(this.masterGain.gain, target);
    this.syncLoop();
    return this.settings.muted;
  }

  setMasterVolume(value) {
    this.settings.masterVolume = clampVolume(value);
    this.syncLoop();
    if (!this.masterGain) return;
    const target = this.settings.muted ? 0 : clampVolume(this.settings.masterVolume);
    this.setVolumeNow(this.masterGain.gain, target);
  }

  setTrackEnabled(trackId, enabled) {
    if (!this.trackGains.has(trackId)) return;
    const gain = this.trackGains.get(trackId);
    const profile = this.activeMix;
    const target = enabled ? clampVolume(profile[trackId] ?? 0) : 0;
    this.settings.tracks = {
      ...(this.settings.tracks ?? {}),
      [trackId]: enabled
    };
    this.setVolumeNow(gain.gain, target);
  }

  setScene(sceneId, { immediate = false, mix, loop } = {}) {
    this.activeScene = sceneId;
    this.loopSpec = loop;
    this.syncLoop();
    const profile = this.activeMix = mix ?? sceneAudioProfiles[sceneId] ?? sceneAudioProfiles['neon-night'];

    for (const [trackId, gainNode] of this.trackGains.entries()) {
      const enabled = this.settings.tracks?.[trackId] ?? true;
      this.setVolumeNow(gainNode.gain, enabled ? clampVolume(profile[trackId] ?? 0) : 0, immediate ? 0.01 : 1.4);
    }
  }

  syncLoop() {
    if (!this.enabled) return;
    if (this.loop?.getAttribute('src') !== this.loopSpec?.url) {
      this.loop?.pause();
      this.loop = this.loopSpec ? new Audio(this.loopSpec.url) : null;
      if (this.loop) this.loop.loop = true;
    }
    if (!this.loop) return;
    this.loop.volume = clampVolume(this.settings.masterVolume * this.loopSpec.gain);
    if (this.settings.muted) this.loop.pause();
    else if (this.loop.paused) this.loop.play().catch(error => console.warn('场景音频播放失败', error));
  }

  playSceneTransition() {
    if (!this.context || this.context.state !== 'running' || this.settings.muted) return;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(720, now + 0.24);
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    oscillator.connect(filter).connect(gain).connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.6);
  }

  playSwitchSound(kind = 'switch') {
    if (!this.context || this.context.state !== 'running' || this.settings.muted) return;

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(kind === 'open' ? 320 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'open' ? 720 : 90, now + 0.08);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    oscillator.connect(gain).connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  }

  async dispose() {
    this.enabled = false;
    this.loop?.pause();
    this.loop = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.masterGain = null;
      this.trackGains.clear();
      this.trackControls.clear();
    }
  }

  #createRainTrack() {
    const context = this.context;
    const buffer = context.createBuffer(2, context.sampleRate * 5, context.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      let lastValue = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        lastValue = (lastValue + 0.05 * white) / 1.05;
        data[i] = white * 0.58 + lastValue * 0.5;
      }
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1150;
    filter.Q.value = 0.42;

    const intensity = context.createGain();
    intensity.gain.value = 480;
    const slowLfo = context.createOscillator();
    slowLfo.frequency.value = 0.07;
    slowLfo.connect(intensity).connect(filter.frequency);
    slowLfo.start();

    const trackGain = context.createGain();
    trackGain.gain.value = 0;
    source.connect(filter).connect(trackGain).connect(this.masterGain);
    source.start();

    this.trackGains.set('rain', trackGain);
    this.trackControls.set('rain', { source, filter, slowLfo });
  }

  #createHumTrack() {
    const context = this.context;
    const trackGain = context.createGain();
    trackGain.gain.value = 0;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.8;

    const lowOsc = context.createOscillator();
    lowOsc.type = 'sine';
    lowOsc.frequency.value = 54;

    const midOsc = context.createOscillator();
    midOsc.type = 'triangle';
    midOsc.frequency.value = 108;
    const midGain = context.createGain();
    midGain.gain.value = 0.2;

    const airOsc = context.createOscillator();
    airOsc.type = 'sine';
    airOsc.frequency.value = 810;
    const airGain = context.createGain();
    airGain.gain.value = 0.025;

    lowOsc.connect(filter);
    midOsc.connect(midGain).connect(filter);
    airOsc.connect(airGain).connect(filter);
    filter.connect(trackGain).connect(this.masterGain);

    lowOsc.start();
    midOsc.start();
    airOsc.start();

    this.trackGains.set('hum', trackGain);
    this.trackControls.set('hum', { lowOsc, midOsc, airOsc, filter });
  }

  #createCityTrack() {
    const context = this.context;
    const bufferSize = Math.floor(context.sampleRate * 7);
    const buffer = context.createBuffer(2, bufferSize, context.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      let lastValue = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        lastValue = (lastValue + 0.02 * white) / 1.02;
        data[i] = lastValue * 3.2;
      }
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowFilter = context.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 250;
    lowFilter.Q.value = 0.6;

    const movement = context.createGain();
    movement.gain.value = 95;
    const cityLfo = context.createOscillator();
    cityLfo.frequency.value = 0.035;
    cityLfo.connect(movement).connect(lowFilter.frequency);
    cityLfo.start();

    const trackGain = context.createGain();
    trackGain.gain.value = 0;
    source.connect(lowFilter).connect(trackGain).connect(this.masterGain);
    source.start();

    this.trackGains.set('city', trackGain);
    this.trackControls.set('city', { source, lowFilter, cityLfo });
  }

  setVolumeNow(audioParam, target, duration = 0.4) {
    if (!audioParam) return;
    const safeTarget = clampVolume(target);
    const now = this.context?.currentTime ?? 0;

    if (duration <= 0.02) {
      audioParam.cancelScheduledValues(now);
      audioParam.setValueAtTime(safeTarget, now);
      return;
    }

    audioParam.cancelScheduledValues(now);
    audioParam.setValueAtTime(audioParam.value, now);
    audioParam.linearRampToValueAtTime(safeTarget, now + duration);
  }
}
