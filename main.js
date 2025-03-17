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

// ---------------------------
// 创建水果与动物（初始隐藏）
// ---------------------------
function createFruits() {
  fruits = [];
  const foodTypes = Object.keys(models.food);
  const count = Math.floor(Math.random() * 3) + 1; // 1~3 个水果
  const radius = 0.1; // 放置时的偏移半径
  console.log('生成水果:', { count, availableTypes: foodTypes });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const type = foodTypes[Math.floor(Math.random() * foodTypes.length)];
    const gltf = models.food[type];
    const mesh = gltf.scene.clone();
    // 调整尺寸为 0.1
    mesh.scale.set(0.01, 0.01, 0.01);
    // 初始位置设为 reticle 附近的相对位置
    mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    // 添加 userData 便于后续查找
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
  // 调整尺寸为 0.1
  mesh.scale.set(0.01, 0.01, 0.01);
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
  const panel = document.createElement('div');
  panel.id = 'animal-ui-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: '10px',
    borderRadius: '5px',
    display: 'flex',
    gap: '10px',
    zIndex: 1000
  });
  const adoptBtn = document.createElement('button');
  adoptBtn.textContent = 'Adopt';
  adoptBtn.onclick = adoptAnimal;
  panel.appendChild(adoptBtn);
  const feedBtn = document.createElement('button');
  feedBtn.textContent = 'Feed';
  feedBtn.disabled = (backpack.length === 0);
  feedBtn.onclick = showFeedUI;
  panel.appendChild(feedBtn);
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
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: '10px',
    borderRadius: '5px',
    display: 'flex',
    gap: '10px',
    zIndex: 1000
  });
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
  // 如果 reticle 可见且对象尚未放置，则放置水果和动物
  if (reticle.visible && !fruits[0].mesh.visible && !animals[0].mesh.visible) {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(reticle.matrix);
    // 放置水果：微小偏移
    fruits.forEach((fruit, i) => {
      const offset = new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).multiplyScalar(0.05);
      fruit.mesh.position.copy(pos.clone().add(offset));
      fruit.mesh.visible = true;
    });
    // 放置动物
    animals.forEach(animal => {
      animal.mesh.position.copy(pos);
      animal.mesh.visible = true;
    });
  } else {
    // 否则检测交互：使用控制器射线检测
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    let intersects = raycaster.intersectObjects(fruits.map(f => f.mesh), true);
    if (intersects.length > 0) {
      const fruit = getFruitFromObject(intersects[0].object);
      if (fruit && !fruit.isCollected) {
        collectFruit(fruit);
        return;
      }
    }
    intersects = raycaster.intersectObjects(animals.map(a => a.mesh), true);
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
