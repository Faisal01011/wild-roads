class AudioManager {
  private ambient: HTMLAudioElement;
  private eatSound: HTMLAudioElement;
  private started = false;
  private muted = false;

  constructor() {
    this.ambient = new Audio('/sounds/ambient.mp3');
    this.ambient.loop = true;
    this.ambient.volume = 0.3;

    this.eatSound = new Audio('/sounds/eat.mp3');
    this.eatSound.volume = 0.6;
  }

  startAmbient() {
    if (this.started) return;
    this.started = true;
    this.ambient.play().catch((err) => {
      console.warn('Ambient audio failed to start:', err);
    });
  }

  playEat() {
    if (this.muted) return;
    const clone = this.eatSound.cloneNode() as HTMLAudioElement;
    clone.volume = this.eatSound.volume;
    clone.play().catch(() => {});
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.ambient.muted = this.muted;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export const audioManager = new AudioManager();