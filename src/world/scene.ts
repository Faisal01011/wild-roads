import * as THREE from 'three';

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // sky blue
  scene.fog = new THREE.Fog(0x87ceeb, 40, 150);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, -10);
  camera.lookAt(0, 0, 0);

  const mobile = isMobileDevice();

  // MSAA (antialias: true) resolves partially-transparent, overlapping
  // fragments inconsistently on mobile's tile-based GPUs — this is what
  // produces the colored speckling on soft-edged transparent sprites
  // (clouds, sun/moon glow). Disabling it on mobile removes the artifact
  // at the source; desktop keeps antialiasing since it doesn't exhibit this.
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    powerPreference: 'high-performance',
  });

  renderer.setSize(window.innerWidth, window.innerHeight);

  // Uncapped devicePixelRatio on high-DPI phones (often 3+) massively
  // increases overdraw cost for the transparent sprite-heavy sky, which
  // can push mobile GPUs into lower-precision fallback buffers — another
  // contributor to visible dithering/speckling. Capping at 2 is standard
  // practice and visually indistinguishable on phone screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  document.body.appendChild(renderer.domElement);

  // Handle window resizing
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}