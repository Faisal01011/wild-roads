class AudioManager {
  private ambient: HTMLAudioElement;
  private eatSound: HTMLAudioElement;
  private started = false;

  constructor() {
    this.ambient = new Audio('/sounds/ambient.mp3');
    this.ambient.loop = true;
    this.ambient.volume = 0.3;

    this.eatSound = new Audio('/sounds/eat.mp3');
    this.eatSound.volume = 0.6;
  }

  // Browsers block autoplay until the user interacts with the page —
  // call this on the first keydown/click to start ambient audio
  startAmbient() {
    if (this.started) return;
    this.started = true;
    this.ambient.play().catch((err) => {
      console.warn('Ambient audio failed to start:', err);
    });
  }

  playEat() {
    // Clone the node so overlapping eats don't cut each other off
    const clone = this.eatSound.cloneNode() as HTMLAudioElement;
    clone.volume = this.eatSound.volume;
    clone.play().catch(() => {});
  }
}

export const audioManager = new AudioManager();