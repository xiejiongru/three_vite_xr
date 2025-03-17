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

// 如果存在 id 为 "backpack" 的 DOM 元素，用于显示背包数字
const backpackElement = document.getElementById('backpack');

const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],
  animal: ['cat', 'chicken', 'horse', 'sheep', 'wolf'],
  monster: ['hedgehog']
};

// ---------------------------
// 初始化场景、相机、渲染器
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
    XRButton.createButton(renderer, {
      requiredFeatures: ['hit-test', 'local-floor'],
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
  
  // 加载资源、创建水果与动物
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

function autoScaleModel(mesh, targetSize = 0.1) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = targetSize / maxDim;
  mesh.scale.set(scale, scale, scale);
}

// 使用方式：
const mesh = gltf.scene.clone();
autoScaleModel(mesh, 0.05); // 统一缩放到5cm大小

// ---------------------------
// 创建水果与动物（初始隐藏）
// ---------------------------
function createFruits() {
  fruits = [];
  const foodTypes = Object.keys(models.food);
  const count = Math.floor(Math.random() * 3) + 1; // 1~3 个水果
  const radius = 0.1;

  console.log('生成水果:', { count, availableTypes: foodTypes });

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const type = foodTypes[Math.floor(Math.random() * foodTypes.length)];
    if (!models.food[type]) {
      console.error(`模型未找到: ${type}`);
      continue;
    }
    const gltf = models.food[type]; // ✅ 修复未定义的 `gltf`
    const mesh = gltf.scene.clone();
    autoScaleModel(mesh, 0.05);
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
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
  if (!models.animal[type]) {
    console.error(`模型未找到: ${type}`);
    return;
  }
  const gltf = models.animal[type]; // ✅ 修复未定义的 `gltf`
  const mesh = gltf.scene.clone();
  autoScaleModel(mesh, 0.1);
  mesh.userData = { animal: { mesh, isFollowing: false, followSpeed: 0.05 } };
  animals.push({ type, mesh, isFollowing: false, followSpeed: 0.05 });
  scene.add(mesh);
}

// ---------------------------
// 辅助函数：查找对象数据
// ---------------------------
function getFruitFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.fruit) return current.userData.fruit;
    current = current.parent;
  }
  return null;
}

function getAnimalFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.animal) return current.userData.animal;
    current = current.parent;
  }
  return null;
}

// ---------------------------
// UI 相关：显示 Adopt/Feed 面板
// ---------------------------
function showAnimalUI(animal) {
  selectedAnimal = animal;
  hideAnimalUI();
  hideFeedUI();

  // 创建半透明背景层
  const overlay = document.createElement('div');
  overlay.style = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    z-index: 999;
  `;
  overlay.onclick = hideAnimalUI;

  // 弹窗容器
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 15px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      min-width: 200px;
      text-align: center;
    ">
      <h3 style="margin:0 0 10px">${animal.type}</h3>
      <div style="display: flex; gap: 10px; justify-content: center">
        <button class="action-btn adopt">领养</button>
        <button class="action-btn feed" ${backpack.length === 0 ? 'disabled' : ''}>喂食</button>
      </div>
    </div>
  `;

  // 事件绑定
  panel.querySelector('.adopt').onclick = adoptAnimal;
  panel.querySelector('.feed').onclick = showFeedUI;

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}
function hideAnimalUI() {
  const panel = document.getElementById('animal-ui-panel');
  if (panel) panel.remove();
}

function showFeedUI() {
  hideFeedUI();
  const panel = document.createElement('div');
  panel.id = 'feed-ui-panel';
  panel.style.position = 'fixed';
  panel.style.bottom = '80px';
  panel.style.left = '50%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.backgroundColor = 'rgba(255,255,255,0.8)';
  panel.style.padding = '10px';
  panel.style.borderRadius = '5px';
  panel.style.display = 'flex';
  panel.style.gap = '10px';
  panel.style.zIndex = '1000';
  backpack.forEach((food, index) => {
    const btn = document.createElement('button');
    btn.textContent = food;
    btn.onclick = () => { feedAnimal(food, index); };
    panel.appendChild(btn);
  });
  document.body.appendChild(panel);
}

function hideFeedUI() {
  const panel = document.getElementById('feed-ui-panel');
  if (panel) panel.remove();
}

function updateBackpackUI() {
  if (backpackElement) {
    backpackElement.textContent = `Backpack: ${backpack.length} fruit(s)`;
  }
}

// ---------------------------
// 交互逻辑：Adopt、Feed、Collect
// ---------------------------
function adoptAnimal() {
  // 简单随机 adopt 逻辑
  if (Math.random() < 0.5) {
    if (animals.length > 0) {
      animals[0].isFollowing = true;
      console.log("Adoption successful!");
    }
  } else {
    console.log("Adoption failed!");
  }
  hideAnimalUI();
  hideFeedUI();
}

function feedAnimal(food, index) {
  backpack.splice(index, 1);
  updateBackpackUI();
  if (Math.random() > 0.3) {
    selectedAnimal.isFollowing = true;
    console.log(`Feeding successful with ${food}!`);
  } else {
    console.log(`Feeding failed with ${food}.`);
  }
  hideFeedUI();
  hideAnimalUI();
}

function collectFruit(fruit) {
  return new Promise((resolve) => {
    if (!fruit || fruit.isCollected) {
      resolve(false);
      return;
    }
    fruit.isCollected = true;
    fruit.mesh.traverse(child => {
      if (child.userData) {
        child.userData.isCollectable = false;
      }
    });
    // 模拟 300ms 动画
    setTimeout(() => {
      fruit.mesh.scale.set(0, 0, 0);
      scene.remove(fruit.mesh);
      backpack.push(fruit.type);
      updateBackpackUI();
      fruits = fruits.filter(f => f !== fruit);
      console.log(`Fruit ${fruit.type} collected.`);
      resolve(true);
    }, 300);
  });
}

// ---------------------------
// AR 控制器 select 事件：放置与交互
// ---------------------------
function onSelect() {
  if (reticle.visible && !fruits[0].mesh.visible && !animals[0].mesh.visible) {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(reticle.matrix);
    fruits.forEach((fruit, i) => {
      const offset = new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).multiplyScalar(0.05);
      fruit.mesh.position.copy(pos.clone().add(offset));
      fruit.mesh.visible = true;
    });
    animals.forEach(animal => {
      animal.mesh.position.copy(pos);
      animal.mesh.visible = true;
    });
  } else {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    let intersects = raycaster.intersectObjects(animals.map(a => a.mesh), true);
    if (intersects.length > 0) {
      const animal = getAnimalFromObject(intersects[0].object);
      if (animal) {
        console.log("Animal selected, showing UI.");
        showAnimalUI(animal);
        return;
      }
    }
  }
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
  // 如果动物处于 follow 状态，则平滑向相机移动
  animals.forEach(animal => {
    if (animal.isFollowing) {
      animal.mesh.position.lerp(camera.position, animal.followSpeed);
    }
  });
  renderer.render(scene, camera);
}

// ---------------------------
// 启动应用
// ---------------------------
init();
