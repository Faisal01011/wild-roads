import type { Vector3 } from 'three';

export type WildlifeSpecies = 'deer' | 'wolf';

export type WildlifeThreatLevel = 'aware' | 'pursuit' | 'windup' | 'strike';

export interface WildlifeVariant {
  name: string;
  tint: number;
  tintStrength: number;
  scale: number;
  accent: number;
}

export interface WildlifeThreat {
  id: number;
  position: Vector3;
  distance: number;
  level: WildlifeThreatLevel;
}

export interface WildlifeAttackEvent {
  animalId: number;
  position: Vector3;
}

export interface WildlifeEatEvent {
  animalId: number;
  position: Vector3;
  points: number;
  accent: number;
}
