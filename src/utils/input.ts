import { audioManager } from './audio';

class InputManager {
  private keys: Set<string> = new Set();
  private virtualLeft = false;
  private virtualRight = false;
  private virtualBoost = false;

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

  setVirtualLeft(pressed: boolean) {
    this.virtualLeft = pressed;
    if (pressed) audioManager.startAmbient();
  }

  setVirtualRight(pressed: boolean) {
    this.virtualRight = pressed;
    if (pressed) audioManager.startAmbient();
  }

  setVirtualBoost(pressed: boolean) {
    this.virtualBoost = pressed;
    if (pressed) audioManager.startAmbient();
  }

  getTurnInput(): number {
    let turn = 0;
    if (this.isPressed('a') || this.isPressed('arrowleft') || this.virtualLeft) turn -= 1;
    if (this.isPressed('d') || this.isPressed('arrowright') || this.virtualRight) turn += 1;
    return turn;
  }

  wantsBoost(): boolean {
    return this.isPressed('shift') || this.isPressed(' ') || this.virtualBoost;
  }
}

export const input = new InputManager();