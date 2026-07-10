import { audioManager } from './audio';

class InputManager {
  private keys: Set<string> = new Set();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      audioManager.startAmbient();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  isPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  getTurnInput(): number {
    let turn = 0;
    if (this.isPressed('a') || this.isPressed('arrowleft')) turn -= 1;
    if (this.isPressed('d') || this.isPressed('arrowright')) turn += 1;
    return turn;
  }
}

export const input = new InputManager();