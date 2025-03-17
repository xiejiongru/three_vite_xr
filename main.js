import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import * as TWEEN from '@tweenjs/tween.js';

// ---------------------------
// 全局变量
// ---------------------------
let scene, camera, renderer, clock;
let reticle;              // 用于显示 hit test 位置的 reticle
let hitTestSource = null;
let hitTestSourceRequested = false;
let controller;

let models = { food: {}, animal: {}, monster: {} };
let fruits = [];
let animals = [];
let backpack = [];
let selectedAnimal = null;

// 如果你的 index.html 中有一个 id 为 "backpack" 的元素，用于显示背包数量
const backpackElement = document.getElementById('backpack');

const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],
  animal: ['cat', 'chicken', 'horse', 'sheep', 'wolf'],
  monster: ['hedgehog']
};

// ---------------------------
// 初始化场景、相机、渲染器等
// ---------------------------
function init() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  // AR 模式推荐使用较近的 near 值
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // 创建 AR 按钮
  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test', 'local-floor'],
      // optionalFeatures 可保留，如 dom-overlay（如果不需要可移除）
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    })
  );
  
  // 创建 reticle 用于显示 hit test 结果
  const ringGeo = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  
  // 设置 AR 控制器
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
  
  // 添加环境光
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  
  // 加载资源，创建水果与动物
  loadAssets().then(() => {
    createFruits();
    createAnimals();
    // 初始状态下隐藏水果和动物，等待 AR 放置
    fruits.forEach(fruit => fruit.mesh.visible = false);
    animals.forEach(animal => animal.mesh.visible = false);
    animate();
  });
  
  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------
// 资源加载
// ---------------------------
function loadAssets() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const queue = [];
    for (const [category, list] of Object.entries(MODEL_CONFIG)) {
      list.forEach(name => {
        queue.push({
          category,
          name,
          path: `/three_vite_xr/assets/models/${category}/${name}.glb`
        });
      });
    }
    let loaded = 0;
    queue.forEach(item => {
      loader.load(
        item.path,
        (gltf) => {
          if (!gltf.scene) gltf.scene = new THREE.Group();
          models[item.category][item.name] = gltf;
          loaded++;
          if (loaded === queue.length) resolve();
        },
        undefined,
        (err) => {
          console.error(`Failed to load ${item.name}:`, err);
          reject(err);
        }
      );
    });
  });
}

// ---------------------------
// 创建水果与动物（初始为隐藏，等待 AR 放置）
// ---------------------------
function createFruits() {
  fruits = [];
  const foodTypes = Object.keys(models.food);
  const count = Math.floor(Math.random() * 3) + 1; // 1~3 个水果
  const radius = 0.3; // 放置时的偏移半径
  console.log('生成水果:', { count, availableTypes: foodTypes });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const type = foodTypes[Math.floor(Math.random() * foodTypes.length)];
    const gltf = models.food[type];
    const mesh = gltf.scene.clone();
    mesh.scale.set(0.5, 0.5, 0.5);
    // 初始位置设为 reticle 附近的相对位置
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    // 添加 userData 用于后续识别
    mesh.traverse(child => {
      if (child.isMesh) {
        child.userData = { fruit: { type, mesh, isCollected: false }, isCollectable: true };
      }
    });
    fruits.push({ type, mesh, isCollected: false });
    scene.add(mesh);
  }
}

function createAnimals() {
  animals = [];
  const animalTypes = Object.keys(models.animal);
  const type = animalTypes[Math.floor(Math.random() * animalTypes.length)];
  const gltf = models.animal[type];
  const mesh = gltf.scene.clone();
  mesh.scale.set(0.5, 0.5, 0.5);
  // 添加 userData 用于识别
  mesh.userData = { animal: { mesh, isFollowing: false, followSpeed: 0.05 } };
  animals.push({ type, mesh, isFollowing: false, followSpeed: 0.05 });
  scene.add(mesh);
}

// ---------------------------
// AR 模式下点击事件：放置水果和动物到 reticle 位置
// ---------------------------
function onSelect() {
  if (!reticle.visible) return;
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);
  // 放置水果（微小偏移）
  fruits.forEach((fruit, i) => {
    const offset = new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).multiplyScalar(0.1);
    fruit.mesh.position.copy(pos.clone().add(offset));
    fruit.mesh.visible = true;
  });
  // 放置动物
  animals.forEach(animal => {
    animal.mesh.position.copy(pos);
    animal.mesh.visible = true;
  });
}

// ---------------------------
// 动画循环与 Hit Test 检测
// ---------------------------
function animate(timestamp, frame) {
  renderer.setAnimationLoop(animate);

  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }
    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }
  
  TWEEN.update();
  renderer.render(scene, camera);
}

// ---------------------------
// 启动应用
// ---------------------------
init();
