import * as THREE from 'three';

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

export function createScene() {
  const scene = new THREE.Scene();
  const initialSkyColor = new THREE.Color(0x6f94a4);
  scene.background = initialSkyColor;
  scene.fog = new THREE.FogExp2(initialSkyColor, 0.0095);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, -10);
  camera.lookAt(0, 0, 0);

  const mobile = isMobileDevice();

  // Mobile tile-based GPUs can produce noisy edges where large transparent
  // atmospheric sprites overlap. Desktop keeps MSAA; mobile relies on the
  // capped pixel ratio and soft-edged source textures instead.
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    powerPreference: 'high-performance',
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Keep authored colours consistent across browsers and compress bright
  // sunlight into a filmic range without washing out the forest palette.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };
  window.addEventListener('resize', handleResize);

  const dispose = () => {
    window.removeEventListener('resize', handleResize);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { scene, camera, renderer, dispose };
}
