import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import * as TWEEN from '@tweenjs/tween.js';

// ---------------------------
// Global variables
// ---------------------------
let scene, camera, renderer, clock;
let reticle;              // Display hit test position
let hitTestSource = null;
let hitTestSourceRequested = false;
let controller;

let models = { food: {}, animal: {}, monster: {} };
let fruits = [];
let animals = [];
let backpack = [];
let selectedAnimal = null;

const backpackElement = document.getElementById('backpack');

const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],
  animal: ['cat', 'chicken', 'horse', 'sheep', 'wolf'],
  monster: ['hedgehog']
};

// ---------------------------
// Initialize scene, camera, and renderer
// ---------------------------
function init() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  document.body.appendChild(
    XRButton.createButton(renderer, {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    })
  );
  
  const ringGeo = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
  
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  
  // Load assets, create fruits and animals
  loadAssets().then(() => {
    createFruits();
    createAnimals();
    // Initially hide fruits and animals, waiting for AR placement
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
// Resource loading
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
// Create fruits and animals (initially hidden)
// ---------------------------
function createFruits() {
  fruits = [];
  const foodTypes = Object.keys(models.food);
  const count = Math.floor(Math.random() * 3) + 1; // 1~3 fruits
  const radius = 0.1; // Offset radius when placing
  console.log('Generate fruits:', { count, availableTypes: foodTypes });
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const type = foodTypes[Math.floor(Math.random() * foodTypes.length)];
    const gltf = models.food[type];
    const mesh = gltf.scene.clone();
    mesh.scale.set(0.01, 0.01, 0.01);
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
  const gltf = models.animal[type];
  const mesh = gltf.scene.clone();

  mesh.scale.set(0.01, 0.01, 0.01);
  mesh.userData = { animal: { mesh, isFollowing: false, followSpeed: 0.05 } };
  animals.push({ type, mesh, isFollowing: false, followSpeed: 0.05 });
  scene.add(mesh);
}

// ---------------------------
// Helper functions: Find object data
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
// UI-related functions: Display Adopt/Feed panel
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
// Interaction logic: Adopt, Feed, Collect
// ---------------------------
function adoptAnimal() {
  // Simple random adopt logic
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
    // Simulate 300ms animation
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
// AR controller select event: Place and interact
// ---------------------------
function onSelect() {
  // If reticle is visible and objects are not placed, place fruits and animals
  if (reticle.visible && !fruits[0].mesh.visible && !animals[0].mesh.visible) {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(reticle.matrix);
    // Place fruits: slight offset
    fruits.forEach((fruit, i) => {
      const offset = new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).multiplyScalar(0.05);
      fruit.mesh.position.copy(pos.clone().add(offset));
      fruit.mesh.visible = true;
    });
    // Place animals
    animals.forEach(animal => {
      animal.mesh.position.copy(pos);
      animal.mesh.visible = true;
    });
  } else {
    // Otherwise detect interaction: Use controller raycasting
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
// Animation loop and Hit Test detection
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
  // If animal is in follow state, smoothly move towards camera
  animals.forEach(animal => {
    if (animal.isFollowing) {
      animal.mesh.position.lerp(camera.position, animal.followSpeed);
    }
  });
  renderer.render(scene, camera);
}

// ---------------------------
// Start application
// ---------------------------
init();
