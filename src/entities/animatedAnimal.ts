import * as THREE from 'three';
import { getTerrainHeight } from '../world/chunk';
import { createContactShadow, disposeContactShadow } from '../world/contactShadow';
import type { QualityProfile } from '../utils/quality';
import type {
  WildlifeSpecies,
  WildlifeThreatLevel,
  WildlifeVariant,
} from './wildlifeTypes';

export interface AnimalConfig {
  species: WildlifeSpecies;
  wanderSpeed: number;
  fleeSpeed: number;
  fleeTriggerRadius: number;
  groundOffset: number;
  wanderAnimationPattern?: RegExp;
  fleeAnimationPattern?: RegExp;
  attackAnimationPattern?: RegExp;
  isPredator?: boolean;
  catchDistance?: number;
  attackCooldownSeconds?: number;
  circleEngageDistance?: number;
  attackWindupSeconds?: number;
  attackStrikeSeconds?: number;
  attackRecoverySeconds?: number;
  debugState?: AnimalState;
  debugLockState?: boolean;
}

export type AnimalState =
  | 'idle'
  | 'wander'
  | 'graze'
  | 'rest'
  | 'alert'
  | 'panic'
  | 'circle'
  | 'windup'
  | 'strike'
  | 'recover';

export interface AnimalUpdateResult {
  didAttack: boolean;
  threatLevel: WildlifeThreatLevel | null;
  speed: number;
}

interface TreatedMaterial {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
  isEye: boolean;
}

const WARNING_TEXTURE_SIZE = 48;

function createWarningTexture(): THREE.DataTexture {
  const data = new Uint8Array(WARNING_TEXTURE_SIZE * WARNING_TEXTURE_SIZE * 4);

  for (let y = 0; y < WARNING_TEXTURE_SIZE; y++) {
    for (let x = 0; x < WARNING_TEXTURE_SIZE; x++) {
      const normalizedX = (x + 0.5) / WARNING_TEXTURE_SIZE * 2 - 1;
      const normalizedY = (y + 0.5) / WARNING_TEXTURE_SIZE * 2 - 1;
      const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
      const index = (y * WARNING_TEXTURE_SIZE + x) * 4;
      const insideDisc = distance < 0.86;
      const insideStem = Math.abs(normalizedX) < 0.09 && normalizedY > -0.32 && normalizedY < 0.35;
      const insideDot = Math.sqrt(normalizedX * normalizedX + (normalizedY + 0.55) ** 2) < 0.11;

      if (!insideDisc) continue;
      const edge = THREE.MathUtils.smoothstep(0.86 - distance, 0, 0.12);
      const isGlyph = insideStem || insideDot;
      data[index] = isGlyph ? 26 : 255;
      data[index + 1] = isGlyph ? 35 : 255;
      data[index + 2] = isGlyph ? 27 : 255;
      data[index + 3] = Math.round((0.76 + edge * 0.24) * 255);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    WARNING_TEXTURE_SIZE,
    WARNING_TEXTURE_SIZE,
    THREE.RGBAFormat
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function isReactiveAnimalState(state: AnimalState): boolean {
  return state === 'alert' ||
    state === 'panic' ||
    state === 'circle' ||
    state === 'windup' ||
    state === 'strike' ||
    state === 'recover';
}

export class AnimatedAnimal {
  public readonly id: number;
  public readonly mesh: THREE.Group;
  public readonly contactShadow: THREE.Mesh;
  public readonly presentationRoot = new THREE.Group();
  public nearbyAnimals: AnimatedAnimal[] = [];

  private state: AnimalState = 'idle';
  private readonly config: AnimalConfig;
  private readonly variant: WildlifeVariant;
  private reducedMotion: boolean;

  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private readonly idleActions: THREE.AnimationAction[] = [];
  private walkAction: THREE.AnimationAction | null = null;
  private grazeAction: THREE.AnimationAction | null = null;
  private restAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private attackAction: THREE.AnimationAction | null = null;

  private stateTimer = 0;
  private reactionDelay = 0;
  private circleDirection = Math.random() < 0.5 ? -1 : 1;
  private circleRadius = 0;
  private circleTime = 0;
  private attackCooldown = 0;
  private windupRemaining = 0;
  private strikeRemaining = 0;
  private recoverRemaining = 0;
  private strikeImpactPending = false;
  private hasRaisedAlarm = false;
  private presentationTime = Math.random() * 10;
  private frameSpeed = 0;
  private dynamicShadowDistance = 18;
  private distantAnimationStride = 1;
  private animationFrame = 0;
  private animationDelta = 0;
  private readonly updateResult: AnimalUpdateResult = {
    didAttack: false,
    threatLevel: null,
    speed: 0,
  };

  private readonly shadowCasters: THREE.Mesh[] = [];
  private castsDynamicShadow = false;
  private readonly treatedMaterials: TreatedMaterial[] = [];
  private readonly baseScale = new THREE.Vector3();
  private readonly targetScale = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly scratchDirection = new THREE.Vector3();
  private readonly scratchSecondary = new THREE.Vector3();
  private readonly scratchCenter = new THREE.Vector3();
  private readonly scratchGlowColor = new THREE.Color();
  private readonly scratchTargetGlow = new THREE.Color();

  private readonly circleEngageDistance: number;
  private readonly circleDisengageDistance: number;
  private readonly destination = new THREE.Vector3();
  private hasDestination = false;

  private readonly warningTexture = createWarningTexture();
  private readonly warningMaterial: THREE.SpriteMaterial;
  private readonly warningSprite: THREE.Sprite;
  private readonly awarenessGeometry = new THREE.RingGeometry(0.72, 0.86, 32);
  private readonly awarenessMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2c66d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly awarenessRing = new THREE.Mesh(this.awarenessGeometry, this.awarenessMaterial);
  private markerHeight = 2;

  private readonly MIN_WANDER_DISTANCE = 4;
  private readonly MAX_WANDER_DISTANCE = 10;
  private readonly DESTINATION_RADIUS = 0.6;
  private readonly SEPARATION_RADIUS = 2.2;
  private readonly SEPARATION_STRENGTH = 1.1;

  constructor(
    id: number,
    position: THREE.Vector3,
    model: THREE.Group,
    animations: THREE.AnimationClip[],
    config: AnimalConfig,
    variant: WildlifeVariant,
    reducedMotion: boolean
  ) {
    this.id = id;
    this.mesh = model;
    this.config = config;
    this.variant = variant;
    this.reducedMotion = reducedMotion;
    this.mesh.position.copy(position);

    this.prepareMaterialsAndShadows();
    this.mesh.scale.multiplyScalar(variant.scale);
    this.baseScale.copy(this.mesh.scale);

    this.mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.mesh);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    this.markerHeight = THREE.MathUtils.clamp(size.y + 0.38, 1.25, 3.2);

    this.contactShadow = createContactShadow(config.isPredator ? 0.98 : 0.84);
    this.contactShadow.position.set(position.x, 0.025, position.z);

    this.warningMaterial = new THREE.SpriteMaterial({
      color: variant.accent,
      map: this.warningTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });
    this.warningSprite = new THREE.Sprite(this.warningMaterial);
    this.warningSprite.position.y = this.markerHeight;
    this.warningSprite.scale.setScalar(0.46);
    this.warningSprite.visible = false;

    this.awarenessRing.rotation.x = -Math.PI / 2;
    this.awarenessRing.position.y = 0.045;
    this.awarenessRing.visible = false;
    this.presentationRoot.add(this.awarenessRing, this.warningSprite);
    this.presentationRoot.position.set(position.x, 0, position.z);

    this.circleEngageDistance =
      config.circleEngageDistance ?? (config.catchDistance ?? 1.3) + 2.5;
    this.circleDisengageDistance = this.circleEngageDistance + 1.8;

    const minOrbit = (config.catchDistance ?? 1.3) + 0.8;
    const maxOrbit = Math.max(minOrbit + 0.5, this.circleEngageDistance - 0.8);
    this.circleRadius = THREE.MathUtils.randFloat(minOrbit, maxOrbit);

    this.prepareAnimations(animations);
    this.stateTimer = THREE.MathUtils.randFloat(2, 4.5);
    this.chooseNewDestination();

    if (config.debugState) {
      this.enterState(config.debugState);
    } else {
      this.playStateAnimation(this.state);
    }
  }

  get species(): WildlifeSpecies {
    return this.config.species;
  }

  get accent(): number {
    return this.variant.accent;
  }

  get currentState(): AnimalState {
    return this.state;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
  }

  setQuality(profile: QualityProfile) {
    this.dynamicShadowDistance = profile.wildlifeShadowDistance;
    this.distantAnimationStride = Math.max(1, profile.wildlifeAnimationStride);
    if (this.dynamicShadowDistance > 0) return;
    this.castsDynamicShadow = false;
    for (const mesh of this.shadowCasters) mesh.castShadow = false;
  }

  private prepareMaterialsAndShadows() {
    const tint = new THREE.Color(this.variant.tint);

    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = true;
      this.shadowCasters.push(child);

      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials = sourceMaterials.map((source) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.lerp(tint, this.variant.tintStrength);
          material.roughness = THREE.MathUtils.clamp(material.roughness + 0.06, 0, 1);
          this.treatedMaterials.push({
            material,
            baseEmissive: material.emissive.clone(),
            baseEmissiveIntensity: material.emissiveIntensity,
            isEye: /eye/i.test(material.name),
          });
        }
        return material;
      });

      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
    });
  }

  private prepareAnimations(animations: THREE.AnimationClip[]) {
    if (animations.length === 0) return;
    this.mixer = new THREE.AnimationMixer(this.mesh);

    const idleClips = animations.filter((clip) =>
      /^idle(?:$|_\d+$|_headlow$|_\d+_headlow$)/i.test(clip.name)
    );
    for (const clip of idleClips) {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.idleActions.push(action);
    }

    const walkClip = animations.find((clip) =>
      (this.config.wanderAnimationPattern ?? /^walk/i).test(clip.name)
    );
    const grazeClip = animations.find((clip) => /^eating/i.test(clip.name));
    const restClip = animations.find((clip) => /idle.*headlow/i.test(clip.name)) ?? idleClips[1];
    const runClip = animations.find((clip) =>
      (this.config.fleeAnimationPattern ?? /^gallop/i).test(clip.name)
    );
    const attackClip = animations.find((clip) =>
      (this.config.attackAnimationPattern ?? /^attack/i).test(clip.name)
    );

    if (walkClip) {
      this.walkAction = this.mixer.clipAction(walkClip);
      this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (grazeClip) {
      this.grazeAction = this.mixer.clipAction(grazeClip);
      this.grazeAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (restClip) {
      this.restAction = this.mixer.clipAction(restClip);
      this.restAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (runClip) {
      this.runAction = this.mixer.clipAction(runClip);
      this.runAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (attackClip) {
      this.attackAction = this.mixer.clipAction(attackClip);
      this.attackAction.setLoop(THREE.LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
  }

  private chooseNewDestination() {
    const angle = Math.random() * Math.PI * 2;
    const distance = THREE.MathUtils.randFloat(this.MIN_WANDER_DISTANCE, this.MAX_WANDER_DISTANCE);
    this.destination.set(
      this.mesh.position.x + Math.cos(angle) * distance,
      0,
      this.mesh.position.z + Math.sin(angle) * distance
    );
    this.hasDestination = true;
  }

  private chooseLeisureState(): AnimalState {
    const choice = Math.random();
    if (choice < 0.38) return 'wander';
    if (choice < 0.72) return 'graze';
    if (choice < 0.88) return 'rest';
    return 'idle';
  }

  private enterState(next: AnimalState) {
    if (this.state === next) return;
    this.state = next;

    switch (next) {
      case 'idle':
        this.stateTimer = THREE.MathUtils.randFloat(1.8, 4.2);
        break;
      case 'wander':
        this.chooseNewDestination();
        this.stateTimer = THREE.MathUtils.randFloat(4.5, 8);
        break;
      case 'graze':
        this.stateTimer = THREE.MathUtils.randFloat(3.2, 6.5);
        break;
      case 'rest':
        this.stateTimer = THREE.MathUtils.randFloat(3.5, 7);
        break;
      case 'alert':
        this.reactionDelay = THREE.MathUtils.randFloat(0.3, 0.65);
        this.hasRaisedAlarm = false;
        break;
      case 'circle':
        this.circleTime = 0;
        break;
      case 'windup':
        this.windupRemaining = this.config.attackWindupSeconds ?? 0.62;
        break;
      case 'strike':
        this.strikeRemaining = this.config.attackStrikeSeconds ?? 0.46;
        this.strikeImpactPending = true;
        break;
      case 'recover':
        this.recoverRemaining = this.config.attackRecoverySeconds ?? 0.58;
        this.attackCooldown = this.config.attackCooldownSeconds ?? 2.5;
        break;
    }

    this.playStateAnimation(next);
  }

  private raiseNearbyAlarm() {
    if (this.hasRaisedAlarm) return;
    this.hasRaisedAlarm = true;

    for (const other of this.nearbyAnimals) {
      if (other === this || other.state === 'panic' || other.state === 'alert') continue;
      if (other.mesh.position.distanceTo(this.mesh.position) >= 12) continue;
      other.enterState('alert');
      other.reactionDelay = THREE.MathUtils.randFloat(0.16, 0.42);
    }
  }

  private applyHerding(direction: THREE.Vector3): THREE.Vector3 {
    if (this.config.isPredator) return direction;

    this.scratchCenter.set(0, 0, 0);
    let count = 0;
    for (const other of this.nearbyAnimals) {
      if (other === this) continue;
      if (this.mesh.position.distanceToSquared(other.mesh.position) < 64) {
        this.scratchCenter.add(other.mesh.position);
        count++;
      }
    }
    if (count === 0) return direction;

    this.scratchCenter.divideScalar(count).sub(this.mesh.position).setY(0);
    if (this.scratchCenter.lengthSq() < 0.0001) return direction;
    this.scratchCenter.normalize();
    direction.lerp(this.scratchCenter, 0.32).normalize();
    return direction;
  }

  private applySeparation(direction: THREE.Vector3): THREE.Vector3 {
    this.scratchSecondary.set(0, 0, 0);
    let count = 0;

    for (const other of this.nearbyAnimals) {
      if (other === this) continue;
      const distance = this.mesh.position.distanceTo(other.mesh.position);
      if (distance >= this.SEPARATION_RADIUS || distance <= 0.0001) continue;

      this.scratchCenter.copy(this.mesh.position).sub(other.mesh.position).setY(0).normalize();
      this.scratchSecondary.addScaledVector(
        this.scratchCenter,
        1 - distance / this.SEPARATION_RADIUS
      );
      count++;
    }

    if (count === 0) return direction;
    this.scratchSecondary.divideScalar(count);
    direction.addScaledVector(this.scratchSecondary, this.SEPARATION_STRENGTH);
    if (direction.lengthSq() > 0.0001) direction.normalize();
    return direction;
  }

  update(
    delta: number,
    snakeHeadPosition: THREE.Vector3,
    combatEnabled = true
  ): AnimalUpdateResult {
    this.previousPosition.copy(this.mesh.position);
    const distanceToSnake = this.mesh.position.distanceTo(snakeHeadPosition);
    let didAttack = false;
    this.presentationTime += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const shouldCastDynamicShadow =
      this.dynamicShadowDistance > 0 && distanceToSnake < this.dynamicShadowDistance;
    if (shouldCastDynamicShadow !== this.castsDynamicShadow) {
      this.castsDynamicShadow = shouldCastDynamicShadow;
      for (const mesh of this.shadowCasters) mesh.castShadow = shouldCastDynamicShadow;
    }

    const debugLocked = Boolean(this.config.debugState && this.config.debugLockState);
    if (debugLocked && this.state !== this.config.debugState) {
      this.enterState(this.config.debugState!);
    }

    let isReactiveState = isReactiveAnimalState(this.state);
    if (
      !debugLocked &&
      distanceToSnake < this.config.fleeTriggerRadius &&
      !isReactiveState &&
      (!this.config.isPredator || combatEnabled)
    ) {
      this.enterState('alert');
      isReactiveState = true;
    }

    if (!debugLocked && !isReactiveState) {
      this.stateTimer -= delta;
      if (this.stateTimer <= 0) {
        const nextLeisureState = this.chooseLeisureState();
        if (nextLeisureState === this.state) {
          this.stateTimer = THREE.MathUtils.randFloat(1.5, 3.5);
        } else {
          this.enterState(nextLeisureState);
        }
      }
    }

    switch (this.state) {
      case 'idle':
      case 'rest':
        break;

      case 'graze':
        this.mesh.rotation.y += (Math.random() - 0.5) * delta * 0.22;
        break;

      case 'wander': {
        if (!this.hasDestination) this.chooseNewDestination();
        const direction = this.scratchDirection.copy(this.destination).sub(this.mesh.position).setY(0);
        const distance = direction.length();
        if (distance < this.DESTINATION_RADIUS) {
          this.hasDestination = false;
          this.enterState('idle');
          break;
        }

        direction.normalize();
        this.applyHerding(direction);
        this.applySeparation(direction);
        this.mesh.position.addScaledVector(direction, this.config.wanderSpeed * delta);
        this.faceDirection(direction, delta);
        break;
      }

      case 'alert': {
        const lookDirection = this.scratchDirection.copy(snakeHeadPosition).sub(this.mesh.position).setY(0);
        if (lookDirection.lengthSq() > 0.0001) {
          lookDirection.normalize();
          this.faceDirection(lookDirection, delta);
        }
        this.raiseNearbyAlarm();

        if (!debugLocked) {
          this.reactionDelay -= delta;
          if (this.reactionDelay <= 0) this.enterState('panic');
        }
        break;
      }

      case 'circle': {
        this.circleTime += delta;
        const toSnake = this.scratchDirection.copy(snakeHeadPosition).sub(this.mesh.position).setY(0);
        const distance = Math.max(0.001, toSnake.length());
        toSnake.normalize();
        const tangent = this.scratchSecondary.set(-toSnake.z, 0, toSnake.x)
          .multiplyScalar(this.circleDirection * 0.82);
        const move = tangent.addScaledVector(toSnake, distance - this.circleRadius).normalize();
        this.applySeparation(move);
        this.mesh.position.addScaledVector(move, this.config.wanderSpeed * 1.72 * delta);
        this.faceDirection(move, delta);

        const closeEnough = distance < (this.config.catchDistance ?? 1.3) * 1.45;
        if (!debugLocked && closeEnough && this.attackCooldown <= 0 && combatEnabled) {
          this.enterState('windup');
        } else if (!debugLocked && (distance > this.circleDisengageDistance || this.circleTime > 3.4)) {
          this.enterState('panic');
        }
        break;
      }

      case 'panic': {
        if (this.config.isPredator && !combatEnabled && !debugLocked) {
          this.enterState('wander');
          break;
        }

        const catchDistance = this.config.catchDistance ?? 1.3;
        if (
          this.config.isPredator &&
          !debugLocked &&
          distanceToSnake <= catchDistance * 1.45 &&
          this.attackCooldown <= 0 &&
          combatEnabled
        ) {
          this.enterState('windup');
          break;
        }

        if (
          this.config.isPredator &&
          !debugLocked &&
          distanceToSnake < this.circleEngageDistance &&
          distanceToSnake > catchDistance * 1.45
        ) {
          this.enterState('circle');
          break;
        }

        const moveDirection = this.config.isPredator
          ? this.scratchDirection.copy(snakeHeadPosition).sub(this.mesh.position).setY(0)
          : this.scratchDirection.copy(this.mesh.position).sub(snakeHeadPosition).setY(0);
        if (moveDirection.lengthSq() > 0.0001) moveDirection.normalize();
        this.applySeparation(moveDirection);
        this.mesh.position.addScaledVector(moveDirection, this.config.fleeSpeed * delta);
        this.faceDirection(moveDirection, delta);

        if (!debugLocked && distanceToSnake > this.config.fleeTriggerRadius * 2) {
          this.enterState('idle');
        }
        break;
      }

      case 'windup': {
        const direction = this.scratchDirection.copy(snakeHeadPosition).sub(this.mesh.position).setY(0);
        if (direction.lengthSq() > 0.0001) {
          direction.normalize();
          this.faceDirection(direction, delta * 1.45);
        }

        if (!debugLocked) {
          const catchDistance = this.config.catchDistance ?? 1.3;
          const cancelDistance = catchDistance * 3;
          if (distanceToSnake > cancelDistance) {
            this.attackCooldown = Math.max(this.attackCooldown, 0.35);
            this.enterState('panic');
          } else {
            if (distanceToSnake > catchDistance * 0.9) {
              this.mesh.position.addScaledVector(direction, this.config.fleeSpeed * 0.72 * delta);
            }
            this.windupRemaining -= delta;
            if (this.windupRemaining <= 0) this.enterState('strike');
          }
        }
        break;
      }

      case 'strike': {
        const strikeDuration = this.config.attackStrikeSeconds ?? 0.46;
        const direction = this.scratchDirection.copy(snakeHeadPosition).sub(this.mesh.position).setY(0);
        if (direction.lengthSq() > 0.0001) direction.normalize();
        this.faceDirection(direction, delta * 1.7);

        if (!debugLocked) {
          this.strikeRemaining -= delta;
          if (this.strikeRemaining > strikeDuration * 0.38) {
            this.mesh.position.addScaledVector(direction, this.config.fleeSpeed * 1.55 * delta);
          }

          if (this.strikeImpactPending && this.strikeRemaining <= strikeDuration * 0.58) {
            this.strikeImpactPending = false;
            if (distanceToSnake < (this.config.catchDistance ?? 1.3) * 1.85) didAttack = true;
          }

          if (this.strikeRemaining <= 0) this.enterState('recover');
        }
        break;
      }

      case 'recover': {
        const away = this.scratchDirection.copy(this.mesh.position).sub(snakeHeadPosition).setY(0);
        if (away.lengthSq() > 0.0001) away.normalize();
        const sidestep = this.scratchSecondary.set(-away.z, 0, away.x)
          .multiplyScalar(this.circleDirection * 0.55);
        away.add(sidestep).normalize();
        this.mesh.position.addScaledVector(away, this.config.wanderSpeed * 1.25 * delta);
        this.faceDirection(away, delta);

        if (!debugLocked) {
          this.recoverRemaining -= delta;
          if (this.recoverRemaining <= 0) this.enterState('circle');
        }
        break;
      }
    }

    const terrainHeight = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y = terrainHeight + this.config.groundOffset;
    this.contactShadow.position.set(this.mesh.position.x, terrainHeight + 0.025, this.mesh.position.z);

    this.frameSpeed = this.previousPosition.distanceTo(this.mesh.position) / Math.max(delta, 0.001);
    this.updateBodyPose(delta);
    this.updatePresentation(delta, terrainHeight);
    this.animationFrame++;
    this.animationDelta += delta;
    const reactive = isReactiveAnimalState(this.state);
    if (
      reactive ||
      distanceToSnake <= this.config.fleeTriggerRadius * 2 ||
      this.animationFrame % this.distantAnimationStride === this.id % this.distantAnimationStride
    ) {
      this.mixer?.update(this.animationDelta);
      this.animationDelta = 0;
    }

    this.updateResult.didAttack = didAttack;
    this.updateResult.threatLevel = this.getThreatLevel();
    this.updateResult.speed = this.frameSpeed;
    return this.updateResult;
  }

  private updateBodyPose(delta: number) {
    this.targetScale.copy(this.baseScale);
    if (this.state === 'windup') {
      this.targetScale.x *= 1.08;
      this.targetScale.y *= 0.86;
      this.targetScale.z *= 1.06;
    } else if (this.state === 'strike') {
      this.targetScale.x *= 0.96;
      this.targetScale.y *= 1.04;
      this.targetScale.z *= 1.1;
    }
    this.mesh.scale.lerp(this.targetScale, 1 - Math.exp(-delta * 11));
  }

  private getThreatLevel(): WildlifeThreatLevel | null {
    if (!this.config.isPredator) return null;
    switch (this.state) {
      case 'alert':
        return 'aware';
      case 'panic':
      case 'circle':
      case 'recover':
        return 'pursuit';
      case 'windup':
        return 'windup';
      case 'strike':
        return 'strike';
      default:
        return null;
    }
  }

  private updatePresentation(delta: number, terrainHeight: number) {
    const threatLevel = this.getThreatLevel();
    const isDeerAlert = !this.config.isPredator && (this.state === 'alert' || this.state === 'panic');
    const visible = Boolean(threatLevel) || isDeerAlert;
    this.presentationRoot.position.set(this.mesh.position.x, terrainHeight, this.mesh.position.z);

    if (!visible) {
      this.warningMaterial.opacity = THREE.MathUtils.lerp(
        this.warningMaterial.opacity,
        0,
        1 - Math.exp(-delta * 12)
      );
      this.awarenessMaterial.opacity = THREE.MathUtils.lerp(
        this.awarenessMaterial.opacity,
        0,
        1 - Math.exp(-delta * 12)
      );
      if (this.warningMaterial.opacity < 0.015) {
        this.warningSprite.visible = false;
        this.awarenessRing.visible = false;
      }
      this.applyAlertGlow(null, delta);
      return;
    }

    this.warningSprite.visible = true;
    this.awarenessRing.visible = true;
    const isCritical = threatLevel === 'windup' || threatLevel === 'strike';
    const color = isCritical ? 0xe85c48 : isDeerAlert ? 0xf2c66d : 0xe79051;
    this.warningMaterial.color.setHex(color);
    this.awarenessMaterial.color.setHex(color);

    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.presentationTime * (isCritical ? 12 : 7)) * 0.08;
    const targetMarkerOpacity = this.state === 'panic' || threatLevel === 'pursuit' ? 0.68 : 0.95;
    this.warningMaterial.opacity = THREE.MathUtils.lerp(
      this.warningMaterial.opacity,
      targetMarkerOpacity,
      1 - Math.exp(-delta * 15)
    );
    this.awarenessMaterial.opacity = THREE.MathUtils.lerp(
      this.awarenessMaterial.opacity,
      isCritical ? 0.82 : 0.5,
      1 - Math.exp(-delta * 12)
    );

    const baseMarkerScale = isCritical ? 0.56 : 0.46;
    this.warningSprite.scale.setScalar(baseMarkerScale * pulse);
    if (this.state === 'windup') {
      const duration = this.config.attackWindupSeconds ?? 0.62;
      const remaining = THREE.MathUtils.clamp(this.windupRemaining / duration, 0, 1);
      const contraction = 0.82 + remaining * 0.72;
      this.awarenessRing.scale.setScalar(contraction * pulse);
    } else {
      this.awarenessRing.scale.setScalar((isCritical ? 1.15 : 1) * pulse);
    }

    this.applyAlertGlow(isCritical ? 'critical' : 'alert', delta);
  }

  private applyAlertGlow(level: 'alert' | 'critical' | null, delta: number) {
    const targetColor = this.scratchGlowColor.setHex(
      level === 'critical' ? 0x8c1710 : 0x5c3614
    );
    const targetAmount = level === 'critical' ? 0.12 : level === 'alert' ? 0.04 : 0;
    const blend = 1 - Math.exp(-delta * 9);

    for (const treated of this.treatedMaterials) {
      const materialAmount = treated.isEye && this.config.isPredator
        ? level === 'critical'
          ? 0.86
          : level === 'alert'
            ? 0.42
            : 0
        : targetAmount;
      const desired = this.scratchTargetGlow
        .copy(treated.baseEmissive)
        .lerp(targetColor, materialAmount);
      treated.material.emissive.lerp(desired, blend);
      const targetIntensity = treated.baseEmissiveIntensity + materialAmount * (treated.isEye ? 2 : 1.1);
      treated.material.emissiveIntensity = THREE.MathUtils.lerp(
        treated.material.emissiveIntensity,
        targetIntensity,
        blend
      );
    }
  }

  private playStateAnimation(state: AnimalState) {
    if (!this.mixer) return;
    let next: THREE.AnimationAction | null = null;
    let timeScale = 1;

    switch (state) {
      case 'idle':
        next = this.idleActions[Math.floor(Math.random() * this.idleActions.length)] ?? null;
        timeScale = THREE.MathUtils.randFloat(0.82, 1.06);
        break;
      case 'rest':
        next = this.restAction ?? this.idleActions[1] ?? this.idleActions[0] ?? null;
        timeScale = 0.72;
        break;
      case 'wander':
        next = this.walkAction;
        timeScale = 0.9;
        break;
      case 'graze':
        next = this.grazeAction ?? this.restAction ?? this.idleActions[0] ?? null;
        timeScale = 0.78;
        break;
      case 'alert':
        next = this.idleActions[0] ?? this.walkAction;
        timeScale = 1.18;
        break;
      case 'panic':
        next = this.runAction ?? this.walkAction;
        timeScale = 1.18;
        break;
      case 'circle':
        next = this.runAction ?? this.walkAction;
        timeScale = 0.9;
        break;
      case 'windup':
        next = this.idleActions[0] ?? this.walkAction;
        timeScale = 0.48;
        break;
      case 'strike':
        next = this.attackAction ?? this.runAction;
        timeScale = 1;
        break;
      case 'recover':
        next = this.walkAction ?? this.idleActions[0] ?? null;
        timeScale = 0.72;
        break;
    }

    if (!next) return;
    if (state === 'strike' && next === this.attackAction) {
      next.reset();
      next.setDuration(this.config.attackStrikeSeconds ?? 0.46);
    } else {
      next.reset().setEffectiveTimeScale(timeScale);
    }
    next.setEffectiveWeight(1).play();

    if (this.currentAction && this.currentAction !== next) {
      next.crossFadeFrom(this.currentAction, state === 'strike' ? 0.08 : 0.24, true);
    }
    this.currentAction = next;
  }

  private faceDirection(direction: THREE.Vector3, delta: number) {
    if (direction.lengthSq() < 0.0001) return;
    const targetRotation = Math.atan2(direction.x, direction.z);
    let rotationDelta = targetRotation - this.mesh.rotation.y;
    rotationDelta = Math.atan2(Math.sin(rotationDelta), Math.cos(rotationDelta));
    this.mesh.rotation.y += rotationDelta * Math.min(1, delta * 8);
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mesh);
      this.mixer = null;
    }

    this.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    });

    this.warningTexture.dispose();
    this.warningMaterial.dispose();
    this.awarenessGeometry.dispose();
    this.awarenessMaterial.dispose();
    disposeContactShadow(this.contactShadow);
  }
}
