import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as TWEEN from '@tweenjs/tween.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// ============================
// 全局变量
// ============================
let scene, camera, renderer, controls, clock;
let models = { food: {}, animal: {}, monster: {} };
let fruits = [];
let animals = [];
let backpack = [];
let selectedAnimal = null;

let animalUIPanel = null;
let feedUIPanel = null;

const backpackElement = document.getElementById('backpack');

// 配置资源
const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],
  animal: ['cat', 'chicken', 'horse', 'sheep', 'wolf'],
  monster: ['hedgehog']
};

// ============================
// WebXR AR 集成
// ============================
async function initXR() {
  // 检查WebXR支持
  if (!navigator.xr) {
    alert('您的浏览器不支持WebXR');
    return;
  }

  // 创建XR渲染器配置
  const sessionInit = {
    optionalFeatures: ['local-floor', 'hit-test', 'dom-overlay'],
    domOverlay: { root: document.body }
  };

  try {
    // 请求XR会话
    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    
    // 配置Three.js WebXR管理器
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);

    // 调整摄像机位置
    camera.position.set(0, 1.6, 0); // 默认高度为站立视角
    
    // 添加平面检测
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5
    });
    
    // 创建平面检测可视化
    const planes = new THREE.Group();
    scene.add(planes);

    // 点击事件处理（AR模式下）
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onXRSelect);
    scene.add(controller);

    // 平面检测逻辑
    const planeDetection = new XRPlaneDetection();
    planeDetection.onPlaneAdded = (plane) => {
      const planeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        planeMaterial
      );
      planeMesh.matrixAutoUpdate = false;
      planeMesh.visible = false; // 调试时可设为可见
      planes.add(planeMesh);
      plane.mesh = planeMesh;
    };

    // 更新平面位置
    const onXRFrame = (time, frame) => {
      const viewerPose = frame.getViewerPose(renderer.xr.getReferenceSpace());
      planeDetection.update(frame);
      
      planes.children.forEach(planeMesh => {
        const plane = planeDetection.planes.get(planeMesh.uuid);
        if (plane) {
          planeMesh.matrix.fromArray(plane.pose.transform.matrix);
          planeMesh.visible = true;
        }
      });
    };

    renderer.setAnimationLoop(onXRFrame);
  } catch (error) {
    console.error('无法启动AR会话:', error);
  }
}

// 添加陀螺仪检测
if (window.DeviceOrientationEvent) {
  const handleOrientation = (e) => {
    // 根据设备方向调整场景
  };
  // 仅在需要权限的设备（如iOS）上请求
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    // 点击页面后请求权限
    document.addEventListener('click', async () => {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      } catch (err) {
        console.error('无法获取方向权限:', err);
      }
    }, { once: true }); // 只请求一次
  } else {
    // 其他设备直接监听
    window.addEventListener('deviceorientation', handleOrientation);
  }
}

// ============================
// AR模式下的点击处理
// ============================
function onXRSelect(event) {
  const controller = event.target;
  const tempMatrix = new THREE.Matrix4();
  
  // 获取控制器位置
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  const raycaster = new THREE.Raycaster();
  raycaster.ray.set(controller.position, new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix));

  // 检测平面
  const intersects = raycaster.intersectObjects(scene.children.filter(obj => obj.isPlaneMesh));
  
  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;
    
    // 放置动物到点击位置
    if (selectedAnimal) {
      selectedAnimal.mesh.position.copy(hitPoint);
      selectedAnimal.mesh.visible = true;
    }
  }
}

// ============================
// 初始化流程
// ============================
async function init() {
  initScene();
  createLights();
  createGround();
  
  // 添加AR按钮
  const arButton = document.createElement('button');
  arButton.textContent = '进入AR模式';
  arButton.style.position = 'fixed';
  arButton.style.top = '20px';
  arButton.style.right = '20px';
  arButton.onclick = initXR;
  document.body.appendChild(arButton);

  await loadAssets();
  createFruits();
  createAnimals();
  setupEvents();
  animate();
}

// ============================
// 场景初始化
// ============================
function initScene() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
}

// ============================
// 添加光源与地面
// ============================
function createLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(10, 20, 10);
  directional.castShadow = true;
  scene.add(directional);
}

function createGround() {
  const geo = new THREE.PlaneGeometry(50, 50);
  const mat = new THREE.MeshPhongMaterial({ color: 0x88aa55, shininess: 100 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ============================
// 资源加载
// ============================
function loadAssets() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const queue = [];
    for (const [category, list] of Object.entries(MODEL_CONFIG)) {
      list.forEach(modelName => {
        queue.push({
          category,
          modelName,
          path: `/three_vite_xr/assets/models/${category}/${modelName}.glb`
        });
      });
    }
    let loaded = 0;
    queue.forEach(item => {
      loader.load(item.path, (glb) => {
        if (!glb.scene) {
          glb.scene = new THREE.Group();
        }
        models[item.category][item.modelName] = glb;
        loaded++;
        if (loaded === queue.length) resolve();
      }, undefined, (error) => {
        console.error(`❌ Failed to load ${item.modelName}`, error);
        reject(error);
      });
    });
  });
}

// ============================
// 创建水果与动物
// ============================
function createFruits() {
  fruits = [];
  const foodTypes = Object.keys(models.food);
  const count = Math.floor(Math.random() * 3) + 1;
  const radius = 8;
  console.log('生成水果:', { count, availableTypes: foodTypes });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const randomFood = foodTypes[Math.floor(Math.random() * foodTypes.length)];
    const gltf = models.food[randomFood];
    const fruitMesh = gltf.scene.clone();
    fruitMesh.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);
    fruitMesh.scale.set(0.5, 0.5, 0.5);
    fruitMesh.visible = false; // 初始隐藏，等待AR放置
    // 给每个子 Mesh 添加 userData，用于后续查找
    fruitMesh.traverse(child => {
      if (child.isMesh) {
        child.userData = { fruit: { type: randomFood, mesh: fruitMesh, isCollected: false }, isCollectable: true };
      }
    });
    fruits.push({ type: randomFood, mesh: fruitMesh, isCollected: false });
    scene.add(fruitMesh);
  }
}

function createAnimals() {
  animals = [];
  const animalTypes = Object.keys(models.animal);
  const randomType = animalTypes[Math.floor(Math.random() * animalTypes.length)];
  const gltf = models.animal[randomType];
  const animalMesh = gltf.scene.clone();
  animalMesh.position.set(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
  animalMesh.scale.set(0.5, 0.5, 0.5);
  // 存储动物数据到 userData
  animalMesh.userData = { animal: { mesh: animalMesh, isFollowing: false, followSpeed: 0.05 } };
  animalMesh.visible = false; // 初始隐藏，等待AR放置
  animals.push({ mesh: animalMesh, isFollowing: false, followSpeed: 0.05 });
  scene.add(animalMesh);
}

// ============================
// UI 相关
// ============================
function updateBackpackUI() {
  if (backpackElement) {
    backpackElement.textContent = `Backpack: ${backpack.length} fruit(s)`;
  }
}

function showAnimalUI(animal) {
  selectedAnimal = animal;
  hideAnimalUI();
  hideFeedUI();
  animalUIPanel = document.createElement('div');
  animalUIPanel.id = 'animal-ui-panel';
  Object.assign(animalUIPanel.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: '10px',
    borderRadius: '5px',
    display: 'flex',
    gap: '10px'
  });
  const adoptBtn = document.createElement('button');
  adoptBtn.textContent = 'Adopt';
  adoptBtn.onclick = adoptAnimal;
  animalUIPanel.appendChild(adoptBtn);
  const feedBtn = document.createElement('button');
  feedBtn.textContent = 'Feed';
  feedBtn.disabled = backpack.length === 0;
  feedBtn.onclick = showFeedUI;
  animalUIPanel.appendChild(feedBtn);
  document.body.appendChild(animalUIPanel);
}

function hideAnimalUI() {
  if (animalUIPanel) {
    document.body.removeChild(animalUIPanel);
    animalUIPanel = null;
  }
}

function showFeedUI() {
  hideFeedUI();
  feedUIPanel = document.createElement('div');
  feedUIPanel.id = 'feed-ui-panel';
  Object.assign(feedUIPanel.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: '10px',
    borderRadius: '5px',
    display: 'flex',
    gap: '10px'
  });
  backpack.forEach((food, index) => {
    const btn = document.createElement('button');
    btn.textContent = food;
    btn.onclick = () => { feedAnimal(food, index); };
    feedUIPanel.appendChild(btn);
  });
  document.body.appendChild(feedUIPanel);
}

function hideFeedUI() {
  if (feedUIPanel) {
    document.body.removeChild(feedUIPanel);
    feedUIPanel = null;
  }
}

// ============================
// 交互逻辑
// ============================
function collectFruit(fruit) {
  return new Promise((resolve) => {
    if (fruit && !fruit.isCollected) {
      collectFruit(fruit)
        .then(() => { hideAnimalUI(); })
        .catch((err) => console.error(err))
        .finally(() => { isProcessing = false; }); // 确保状态重置
      return;
    }
    fruit.isCollected = true;
    fruit.mesh.traverse(child => {
      if (child.userData) {
        child.userData.isCollectable = false;
      }
    });
    // 使用 setTimeout 模拟300ms动画
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

function adoptAnimal() {
  if (Math.random() < 0.5) {
    selectedAnimal.isFollowing = true;
    console.log("Adoption successful!");
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


// ============================
// 事件处理
// ============================
function setupEvents() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let isProcessing = false;

  function onPointer(e, clientX, clientY) {
    if (isProcessing) return;
    isProcessing = true;
    e.preventDefault();
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // 检查水果
    const fruitMeshes = fruits.flatMap(fruit => {
      const arr = [];
      fruit.mesh.traverse(child => {
        if (child.isMesh && child.userData?.isCollectable) arr.push(child);
      });
      return arr;
    });
    let intersects = raycaster.intersectObjects(fruitMeshes, true);
    if (intersects.length > 0) {
      const fruit = getFruitFromObject(intersects[0].object);
      if (fruit && !fruit.isCollected) {
        collectFruit(fruit).then(() => { hideAnimalUI(); });
        isProcessing = false;
        return;
      }
    }

    // 检查动物
    intersects = raycaster.intersectObjects(animals.map(a => a.mesh), true);
    if (intersects.length > 0) {
      const animal = getAnimalFromObject(intersects[0].object);
      if (animal) {
        showAnimalUI(animal);
        isProcessing = false;
        return;
      }
    }
    // 点击空白处则隐藏所有UI
    hideAnimalUI();
    hideFeedUI();
    isProcessing = false;
  }

  window.addEventListener('click', (e) => {
    onPointer(e, e.clientX, e.clientY);
  });
  window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    onPointer(e, touch.clientX, touch.clientY);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ============================
// 辅助函数：查找水果和动物数据
// ============================
function getFruitFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.fruit) {
      return {
        type: current.userData.fruit.type,
        mesh: current.userData.fruit.mesh,
        isCollected: current.userData.fruit.isCollected
      };
    }
    current = current.parent;
  }
  return null;
}

function getAnimalFromObject(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.animal) {
      return current.userData.animal;
    }
    current = current.parent;
  }
  return null;
}

// ============================
// 动画循环
// ============================
function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  controls.update();
  const delta = clock.getDelta();
  animals.forEach(animal => {
    if (animal.isFollowing) {
      animal.mesh.position.lerp(camera.position, animal.followSpeed);
    }
  });
  renderer.render(scene, camera);
}

init();
