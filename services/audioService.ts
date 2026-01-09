
class AudioService {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Play the sound of the cue stick hitting the ball.
   * @param intensity 0 to 1 based on shot power.
   * @param spinFactor 0 to 1 based on how far from center the hit is.
   */
  playCueStrike(intensity: number, spinFactor: number = 0) {
    this.init();
    if (!this.ctx) return;

    const volume = Math.min(intensity * 0.6, 0.8);
    const time = this.ctx.currentTime;

    // The "Thump" of the stick
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.05);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(time + 0.1);

    // The "Chalk/Friction" sound
    const noise = this.createNoiseBuffer(0.05);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    // Higher spin = higher frequency friction sound
    noiseFilter.frequency.setValueAtTime(2000 + spinFactor * 3000, time);
    noiseFilter.Q.setValueAtTime(1, time);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * (0.2 + spinFactor * 0.5), time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSource.start();
  }

  /**
   * Generates a "clack" sound for ball-to-ball collisions.
   * @param intensity Normalized intensity (usually speed / 8).
   * @param isCueInvolved Whether a cue ball is part of the collision (shorter, sharper sound).
   */
  playCollision(intensity: number, isCueInvolved: boolean = false) {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const volume = Math.min(intensity, 1.0) * 0.7;
    
    // Physical "Clack" - higher intensity = brighter sound
    const baseFreq = isCueInvolved ? 1200 : 900;
    const decay = isCueInvolved ? 0.03 : 0.05;

    // Tone component
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * (0.9 + intensity * 0.2), time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, time + decay);
    
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + decay);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(time + decay);

    // Impact Noise component
    const noise = this.createNoiseBuffer(0.02);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const noiseGain = this.ctx.createGain();
    const noiseFilter = this.ctx.createBiquadFilter();
    
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(2000, time);
    
    noiseGain.gain.setValueAtTime(volume * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.015);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSource.start();
  }

  /**
   * Generates a "thump" sound for wall collisions.
   */
  playCushion(intensity: number) {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const volume = Math.min(intensity, 1.0) * 0.5;
    
    // Low-end "Thud"
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
    
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(time + 0.2);

    // Friction component for the rail cloth
    const noise = this.createNoiseBuffer(0.1);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noise;
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(400, time);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    
    noiseSource.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSource.start();
  }

  /**
   * Generates a successful scoring chime.
   */
  playScore() {
    this.init();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time + i * 0.1);
      
      gain.gain.setValueAtTime(0, time + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.2, time + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.1 + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(time + i * 0.1);
      osc.stop(time + i * 0.1 + 0.5);
    });
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) throw new Error("AudioContext not initialized");
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export const audioService = new AudioService();
