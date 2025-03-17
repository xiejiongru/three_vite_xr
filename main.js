import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import * as TWEEN from '@tweenjs/tween.js';

// ---------------------------
// 全局变量
// ---------------------------
let scene, camera, renderer, clock;
let reticle;              // 显示 hit test 位置的 reticle
let hitTestSource = null;
let hitTestSourceRequested = false;
let controller;

let models = { food: {}, animal: {}, monster: {} };
let fruits = [];
let animals = [];
let backpack = [];
let selectedAnimal = null;

// 如果 index.html 中存在 id 为 backpack 的元素，则用于显示背包数量
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
  // AR 模式建议使用较近的 near 值
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // 添加 XRButton，注意 optionalFeatures 的警告可忽略
  document.body.appendChild(
    XRButton.createButton(renderer, {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    })
  );

  // 创建 reticle 显示 hit test 结果
  const ringGeometry = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  reticle = new THREE.Mesh(ringGeometry, ringMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // 设置控制器，用于 AR 交互
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // 添加简单的环境光
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  // 加载资源，创建水果与动物
  loadAssets().then(() => {
    createFruits();
    createAnimals();
    // 初始状态下隐藏水果和动物，等待放置
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
// 创建水果与动物（初始位置不显示，等待 AR 放置）
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
    // 初始位置设为 reticle 处的相对位置
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
// AR 交互：点击放置游戏物体
// ---------------------------
function onSelect() {
  if (!reticle.visible) return;
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(reticle.matrix);
  // 放置水果（稍微分散）
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
// 窗口 resize 处理
// ---------------------------
window.addEventListener('resize', onWindowResize, false);

// ---------------------------
// 启动应用
// ---------------------------
init();
