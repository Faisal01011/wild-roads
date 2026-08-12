import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

let gltfLoaderPromise: Promise<GLTFLoader> | null = null;
let fbxLoaderPromise: Promise<FBXLoader> | null = null;
const cache: Map<string, THREE.Group> = new Map();
const animationsCache: Map<string, THREE.AnimationClip[]> = new Map();

function getGltfLoader(): Promise<GLTFLoader> {
  gltfLoaderPromise ??= import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader());
  return gltfLoaderPromise;
}

function getFbxLoader(): Promise<FBXLoader> {
  fbxLoaderPromise ??= import('three/examples/jsm/loaders/FBXLoader.js')
    .then(({ FBXLoader }) => new FBXLoader());
  return fbxLoaderPromise;
}

async function cloneModel(scene: THREE.Group, keepAnimations: boolean): Promise<THREE.Group> {
  if (!keepAnimations) return scene.clone(true);
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  return clone(scene) as THREE.Group;
}

function isolateLargestChild(scene: THREE.Group): THREE.Group {
  if (scene.children.length <= 1) return scene;

  let largest: THREE.Object3D | null = null;
  let largestVolume = 0;

  for (const child of scene.children) {
    const box = new THREE.Box3().setFromObject(child);
    const size = new THREE.Vector3();
    box.getSize(size);
    const volume = size.x * size.y * size.z;

    if (volume > largestVolume) {
      largestVolume = volume;
      largest = child;
    }
  }

  if (!largest) return scene;

  const isolated = new THREE.Group();
  isolated.add(largest.clone(true));
  return isolated;
}

function processLoadedModel(
  rawScene: THREE.Group,
  scaleCorrection: number,
  recenter: boolean,
  isolateLargest: boolean
): THREE.Group {
  let baseScene = rawScene;

  if (isolateLargest) {
    baseScene = isolateLargestChild(baseScene);
  }

  baseScene.scale.setScalar(scaleCorrection);

  let result: THREE.Group = baseScene;

  if (recenter) {
    baseScene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(baseScene);
    const center = new THREE.Vector3();
    box.getCenter(center);

    baseScene.position.x -= center.x;
    baseScene.position.z -= center.z;
    baseScene.position.y -= box.min.y;

    const wrapper = new THREE.Group();
    wrapper.add(baseScene);
    result = wrapper;
  }

  return result;
}

export async function loadModel(
  path: string,
  scaleCorrection = 1,
  recenter = false,
  isolateLargest = false,
  keepAnimations = false
): Promise<THREE.Group> {
  if (cache.has(path)) {
    return cloneModel(cache.get(path)!, keepAnimations);
  }

  const isFbx = path.toLowerCase().endsWith('.fbx');

  return new Promise((resolve, reject) => {
    if (isFbx) {
      void getFbxLoader().then((fbxLoader) => fbxLoader.load(
        path,
        (fbxScene) => {
          const result = processLoadedModel(fbxScene, scaleCorrection, recenter, isolateLargest);
          cache.set(path, result);
          animationsCache.set(path, fbxScene.animations ?? []);
          void cloneModel(result, keepAnimations).then(resolve, reject);
        },
        undefined,
        (error) => {
          console.error(`Failed to load FBX model: ${path}`, error);
          reject(error);
        }
      ), reject);
    } else {
      void getGltfLoader().then((gltfLoader) => gltfLoader.load(
        path,
        (gltf) => {
          const result = processLoadedModel(gltf.scene, scaleCorrection, recenter, isolateLargest);
          cache.set(path, result);
          animationsCache.set(path, gltf.animations ?? []);
          void cloneModel(result, keepAnimations).then(resolve, reject);
        },
        undefined,
        (error) => {
          console.error(`Failed to load GLTF model: ${path}`, error);
          reject(error);
        }
      ), reject);
    }
  });
}

export function getModelAnimations(path: string): THREE.AnimationClip[] {
  return animationsCache.get(path) ?? [];
}

export interface GameAssets {
  trees: THREE.Group[];
  bushes: THREE.Group[];
  rocks: THREE.Group[];
}

export interface AssetLoadProgress {
  loaded: number;
  total: number;
  label: string;
}

interface PreloadDefinition {
  path: string;
  scale: number;
  label: string;
}

const PRELOAD_DEFINITIONS: PreloadDefinition[] = [
  { path: '/models/Tree1.fbx', scale: 0.0146, label: 'Finding old-growth trees' },
  { path: '/models/Tree2.fbx', scale: 0.0141, label: 'Raising the forest canopy' },
  { path: '/models/Tree3.fbx', scale: 0.0147, label: 'Planting the distant treeline' },
  { path: '/models/Tree4.fbx', scale: 0.0131, label: 'Finishing the forest edge' },
  { path: '/models/Bush1.fbx', scale: 0.0067, label: 'Shaping the undergrowth' },
  { path: '/models/Bush2.fbx', scale: 0.0105, label: 'Filling woodland clearings' },
  { path: '/models/Bush3.fbx', scale: 0.008, label: 'Scattering wild shrubs' },
  { path: '/models/Rock1.fbx', scale: 0.008, label: 'Laying weathered stone' },
  { path: '/models/Rock2.fbx', scale: 0.0112, label: 'Marking the old trail' },
  { path: '/models/Rock3.fbx', scale: 0.0057, label: 'Finishing rocky outcrops' },
];

function createProceduralConifer(): THREE.Group {
  const conifer = new THREE.Group();
  conifer.name = 'procedural-conifer';

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d4935,
    roughness: 0.94,
  });
  const needleMaterial = new THREE.MeshStandardMaterial({
    color: 0x355b3f,
    roughness: 0.9,
  });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.8, 7), trunkMaterial);
  trunk.name = 'conifer-trunk';
  trunk.position.y = 1.4;
  conifer.add(trunk);

  const crownLayers = [
    { radius: 1.28, height: 2.1, y: 2.15 },
    { radius: 1.04, height: 1.9, y: 2.95 },
    { radius: 0.78, height: 1.65, y: 3.66 },
  ];

  crownLayers.forEach(({ radius, height, y }, index) => {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8, 1), needleMaterial);
    crown.name = `conifer-crown-${index}`;
    crown.position.y = y;
    crown.rotation.y = index * 0.38;
    conifer.add(crown);
  });

  return conifer;
}

export async function preloadAssets(
  onProgress?: (progress: AssetLoadProgress) => void
): Promise<GameAssets> {
  let loaded = 0;
  const total = PRELOAD_DEFINITIONS.length;
  onProgress?.({ loaded, total, label: 'Preparing the wilderness' });

  const models = await Promise.all(
    PRELOAD_DEFINITIONS.map(async ({ path, scale, label }) => {
      const model = await loadModel(path, scale, true, false);
      loaded += 1;
      onProgress?.({ loaded, total, label });
      return model;
    })
  );

  const [tree1, tree2, tree3, tree4, bush1, bush2, bush3, rock1, rock2, rock3] = models;

  return {
    trees: [tree1, tree2, tree3, tree4, createProceduralConifer()],
    bushes: [bush1, bush2, bush3],
    rocks: [rock1, rock2, rock3],
  };
}
