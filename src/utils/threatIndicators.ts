import * as THREE from 'three';
import type { WildlifeThreat, WildlifeThreatLevel } from '../entities/wildlifeTypes';

interface IndicatorElements {
  root: HTMLElement;
  arrow: HTMLElement;
  label: HTMLElement;
  distance: HTMLElement;
}

const THREAT_PRIORITY: Record<WildlifeThreatLevel, number> = {
  aware: 1,
  pursuit: 2,
  windup: 3,
  strike: 4,
};

const THREAT_LABELS: Record<WildlifeThreatLevel, string> = {
  aware: 'Spotted',
  pursuit: 'Hunting',
  windup: 'Incoming',
  strike: 'Strike',
};

const ANNOUNCEMENTS: Record<WildlifeThreatLevel, string> = {
  aware: 'A wolf has spotted you.',
  pursuit: 'A wolf is hunting you.',
  windup: 'Wolf attack incoming.',
  strike: 'Wolf striking now.',
};

export class ThreatIndicatorController {
  private readonly indicators: IndicatorElements[];
  private readonly announcer: HTMLElement | null;
  private readonly guard: HTMLElement | null;
  private readonly guardTime: HTMLElement | null;
  private readonly impact: HTMLElement | null;
  private readonly impactArrow: HTMLElement | null;
  private readonly projected = new THREE.Vector3();
  private readonly cameraSpace = new THREE.Vector3();
  private lastAnnouncedLevel: WildlifeThreatLevel | null = null;
  private impactTimer = 0;

  constructor() {
    const container = document.getElementById('threat-indicators');
    this.indicators = Array.from(
      container?.querySelectorAll<HTMLElement>('.threat-indicator') ?? []
    ).map((root) => ({
      root,
      arrow: root.querySelector<HTMLElement>('.threat-indicator-arrow')!,
      label: root.querySelector<HTMLElement>('.threat-indicator-label')!,
      distance: root.querySelector<HTMLElement>('.threat-indicator-distance')!,
    }));
    this.announcer = document.getElementById('combat-announcer');
    this.guard = document.getElementById('combat-guard');
    this.guardTime = document.getElementById('combat-guard-time');
    this.impact = document.getElementById('impact-direction');
    this.impactArrow = this.impact?.querySelector<HTMLElement>('.impact-direction-arrow') ?? null;
  }

  update(threats: readonly WildlifeThreat[], camera: THREE.PerspectiveCamera) {
    const ranked = [...threats]
      .sort((left, right) => {
        const urgency = THREAT_PRIORITY[right.level] - THREAT_PRIORITY[left.level];
        return urgency !== 0 ? urgency : left.distance - right.distance;
      })
      .slice(0, this.indicators.length);

    for (let index = 0; index < this.indicators.length; index++) {
      const indicator = this.indicators[index];
      const threat = ranked[index];
      if (!threat) {
        indicator.root.classList.remove('is-visible', 'is-aware', 'is-pursuit', 'is-windup', 'is-strike');
        continue;
      }

      const direction = this.placeAtScreenEdge(threat.position, camera, indicator.root);
      indicator.root.classList.remove('is-aware', 'is-pursuit', 'is-windup', 'is-strike');
      indicator.root.classList.add('is-visible', `is-${threat.level}`);
      indicator.arrow.style.transform = `rotate(${direction.angle + 90}deg)`;
      indicator.label.textContent = THREAT_LABELS[threat.level];
      indicator.distance.textContent = `${Math.max(1, Math.round(threat.distance))}m`;
    }

    const highestLevel = ranked[0]?.level ?? null;
    if (highestLevel !== this.lastAnnouncedLevel) {
      if (this.announcer) {
        this.announcer.textContent = highestLevel
          ? ANNOUNCEMENTS[highestLevel]
          : this.lastAnnouncedLevel
            ? 'The immediate threat has passed.'
            : '';
      }
      this.lastAnnouncedLevel = highestLevel;
    }
  }

  updateGuard(secondsRemaining: number, totalSeconds: number) {
    if (!this.guard || !this.guardTime) return;
    const active = secondsRemaining > 0;
    this.guard.classList.toggle('is-visible', active);
    this.guard.setAttribute('aria-hidden', String(!active));
    if (!active) return;

    const progress = THREE.MathUtils.clamp(secondsRemaining / Math.max(0.01, totalSeconds), 0, 1);
    this.guard.style.setProperty('--guard-progress', String(progress));
    this.guardTime.textContent = `${secondsRemaining.toFixed(1)}s`;
  }

  flashImpact(position: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    if (!this.impact || !this.impactArrow) return;
    const direction = this.placeAtScreenEdge(position, camera, this.impact);
    this.impactArrow.style.transform = `rotate(${direction.angle + 90}deg)`;
    window.clearTimeout(this.impactTimer);
    this.impact.classList.remove('is-active');
    void this.impact.offsetWidth;
    this.impact.classList.add('is-active');
    this.impactTimer = window.setTimeout(() => this.impact?.classList.remove('is-active'), 620);
  }

  private placeAtScreenEdge(
    worldPosition: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    element: HTMLElement
  ): { angle: number } {
    camera.updateMatrixWorld();
    this.cameraSpace.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
    this.projected.copy(worldPosition).project(camera);

    let directionX = this.projected.x;
    let directionY = -this.projected.y;
    if (this.cameraSpace.z > 0) {
      directionX *= -1;
      directionY *= -1;
    }

    if (!Number.isFinite(directionX) || !Number.isFinite(directionY)) {
      directionX = this.cameraSpace.x;
      directionY = -this.cameraSpace.y;
    }
    if (Math.abs(directionX) + Math.abs(directionY) < 0.001) directionY = -1;

    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    const isCompact = window.innerWidth <= 640;
    const horizontalMargin = isCompact ? 58 : 76;
    const verticalMargin = directionY >= 0 ? 100 : isCompact ? 96 : 94;
    const maxX = Math.max(24, halfWidth - horizontalMargin);
    const maxY = Math.max(24, halfHeight - verticalMargin);
    const scaleX = Math.abs(directionX) > 0.0001 ? maxX / Math.abs(directionX) : Infinity;
    const scaleY = Math.abs(directionY) > 0.0001 ? maxY / Math.abs(directionY) : Infinity;
    const edgeScale = Math.min(scaleX, scaleY);
    const x = halfWidth + directionX * edgeScale;
    const y = halfHeight + directionY * edgeScale;
    const angle = Math.atan2(directionY, directionX) * THREE.MathUtils.RAD2DEG;

    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    return { angle };
  }

  reset() {
    window.clearTimeout(this.impactTimer);
    this.lastAnnouncedLevel = null;
    for (const indicator of this.indicators) {
      indicator.root.classList.remove('is-visible', 'is-aware', 'is-pursuit', 'is-windup', 'is-strike');
    }
    this.guard?.classList.remove('is-visible');
    this.guard?.setAttribute('aria-hidden', 'true');
    this.impact?.classList.remove('is-active');
    if (this.announcer) this.announcer.textContent = '';
  }
}
