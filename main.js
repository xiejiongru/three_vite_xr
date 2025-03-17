import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as TWEEN from '@tweenjs/tween.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],
  animal: ['cat', 'chicken', 'horse', 'sheep', 'wolf'],
  monster: ['hedgehog']
};

class Game {
  constructor() {
    this.score = 0;
    this.font = null;
    this.initScene();
    this.createLights();
    this.createGround();
    this.backpack = [];
    this.selectedAnimal = null;
    
    new FontLoader().load('fonts/helvetiker_bold.typeface.json', (font) => {
      this.font = font;
      this.loadAssets().then(() => {
        this.createFruits();
        this.createAnimals();
        this.setupEvents();
        this.animate();
      });
    });
  }
  
  initScene() {
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);
    
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }
  
  createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }
  
  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0x88aa55, shininess: 100
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }
  
  loadAssets() {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      const loadQueue = [];
      for (const [category, models] of Object.entries(MODEL_CONFIG)) {
        for (const modelName of models) {
          loadQueue.push({
            category,
            modelName,
            path: `/three_vite_xr/assets/models/${category}/${modelName}.glb`
          });
        }
      }
      this.models = { food: {}, animal: {}, monster: {} };
      let loadedCount = 0;
      loadQueue.forEach(({ category, modelName, path }) => {
        loader.load(
          path,
          (glb) => {
            console.log(`✅ Loaded: ${modelName}`, glb);
            if (!glb.scene) {
              console.warn(`Model ${modelName} missing scene, creating empty Group`);
              glb.scene = new THREE.Group();
            }
            this.models[category][modelName] = glb;
            loadedCount++;
            if (loadedCount === loadQueue.length) resolve();
          },
          undefined,
          (error) => {
            console.error(`❌ Failed to load: ${modelName}`, error);
            reject(error);
          }
        );
      });
    });
  }
  
  createFruits() {
    this.fruits = [];
    const radius = 8;
    const foodKeys = Object.keys(this.models.food);
    const fruitCount = Math.floor(Math.random() * 3) + 1;
    
    console.log('生成水果:', { count: fruitCount, availableTypes: foodKeys });
    for (let i = 0; i < fruitCount; i++) {
      const angle = (i / fruitCount) * Math.PI * 2;
      const randomFood = foodKeys[Math.floor(Math.random() * foodKeys.length)];
      const model = this.models.food[randomFood].scene.clone();
      
      // 输出模型结构用于调试
      model.traverse(child => {
        console.log(`- ${child.type}: ${child.name || 'unnamed'}`);
      });
  
      const fruit = new Fruit(
        model,
        new THREE.Vector3(
          Math.cos(angle) * radius,
          1,
          Math.sin(angle) * radius
        ),
        randomFood
      );
      this.fruits.push(fruit);
      this.scene.add(fruit.mesh);
    }
  }
  
  createAnimals() {
    const animalKeys = Object.keys(this.models.animal);
    const selectedAnimal = animalKeys[Math.floor(Math.random() * animalKeys.length)];
    this.animals = [
      new Animal(
        this.models.animal[selectedAnimal],
        new THREE.Vector3(
          Math.random() * 20 - 10,
          0,
          Math.random() * 20 - 10
        )
      )
    ];
    this.animals.forEach(animal => {
      animal.mesh.traverse(child => {
        if(child.isMesh) child.castShadow = true;
      });
      this.scene.add(animal.mesh);
    });
  }
  
  getAnimalFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.animal) return current.userData.animal;
      current = current.parent;
    }
    return null;
  }
  
  getFruitFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.fruit) return current.userData.fruit;
      current = current.parent;
    }
    return null;
  }
  
  setupEvents() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let isProcessing = false;
  
    const handleClick = async (e) => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        e.preventDefault();
        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
  
        // 检测水果（递归检测所有标记为 isCollectable 的子对象）
        const fruitMeshes = this.fruits.flatMap(fruit => {
          const meshes = [];
          fruit.mesh.traverse(child => {
            if (child.isMesh && child.userData?.isCollectable) {
              meshes.push(child);
            }
          });
          return meshes;
        });
        let intersects = this.raycaster.intersectObjects(fruitMeshes, true);
        if (intersects.length > 0) {
          const fruit = this.getFruitFromObject(intersects[0].object);
          console.log('点击到水果:', fruit?.type);
          if (fruit && !fruit.isCollected) {
            console.log('开始收集水果:', fruit.type);
            await this.collectFruit(fruit);
            // 收集完后隐藏动物 UI（防止干扰后续操作）
            this.hideAnimalPanel();
            return;
          }
        }
  
        // 检测动物
        intersects = this.raycaster.intersectObjects(this.animals.map(a => a.mesh), true);
        if (intersects.length > 0) {
          const animal = this.getAnimalFromObject(intersects[0].object);
          if (animal) {
            this.showAnimalUI(animal);
            return;
          }
        }
  
        // 如果点击空白区域，则隐藏所有 UI
        this.hideAnimalPanel();
        this.hideFeedPanel();
      } finally {
        isProcessing = false;
      }
    };
  
    window.addEventListener('click', handleClick);
  
    window.addEventListener('touchstart', async (e) => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        e.preventDefault();
        const touch = e.touches[0];
        this.pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
  
        const fruitMeshes = this.fruits.flatMap(fruit => {
          const meshes = [];
          fruit.mesh.traverse(child => {
            if (child.isMesh && child.userData?.isCollectable) {
              meshes.push(child);
            }
          });
          return meshes;
        });
        let intersects = this.raycaster.intersectObjects(fruitMeshes, true);
        if (intersects.length > 0) {
          const fruit = this.getFruitFromObject(intersects[0].object);
          if (fruit && !fruit.isCollected) {
            await this.collectFruit(fruit);
            this.hideAnimalPanel();
            return;
          }
        }
  
        intersects = this.raycaster.intersectObjects(this.animals.map(a => a.mesh), true);
        if (intersects.length > 0) {
          const animal = this.getAnimalFromObject(intersects[0].object);
          if (animal) {
            this.showAnimalUI(animal);
            return;
          }
        }
  
        this.hideAnimalPanel();
        this.hideFeedPanel();
      } finally {
        isProcessing = false;
      }
    });
  
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  
  showAnimalUI(animal) {
    this.selectedAnimal = animal;
    this.hideAnimalPanel();
    this.hideFeedPanel();
  
    const panel = document.createElement("div");
    panel.id = "animal-ui-panel";
    panel.style.position = "fixed";
    panel.style.bottom = "20px";
    panel.style.left = "50%";
    panel.style.transform = "translateX(-50%)";
    panel.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    panel.style.padding = "10px";
    panel.style.borderRadius = "5px";
    panel.style.display = "flex";
    panel.style.gap = "10px";
  
    const adoptButton = document.createElement("button");
    adoptButton.textContent = "Adopt";
    adoptButton.onclick = () => { this.adoptAnimal(); };
    panel.appendChild(adoptButton);
  
    const feedButton = document.createElement("button");
    feedButton.textContent = "Feed";
    if (this.backpack.length === 0) {
      feedButton.disabled = true;
    }
    feedButton.onclick = () => { this.showFeedPanel(); };
    panel.appendChild(feedButton);
  
    document.body.appendChild(panel);
    this.animalPanel = panel;
  }
  
  hideAnimalPanel() {
    if (this.animalPanel) {
      document.body.removeChild(this.animalPanel);
      this.animalPanel = null;
    }
  }
  
  showFeedPanel() {
    this.hideFeedPanel();
    const panel = document.createElement("div");
    panel.id = "feed-panel";
    panel.style.position = "fixed";
    panel.style.bottom = "80px";
    panel.style.left = "50%";
    panel.style.transform = "translateX(-50%)";
    panel.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    panel.style.padding = "10px";
    panel.style.borderRadius = "5px";
    panel.style.display = "flex";
    panel.style.gap = "10px";
  
    this.backpack.forEach((food, index) => {
      const foodButton = document.createElement("button");
      foodButton.textContent = food;
      foodButton.onclick = () => { this.feedAnimal(food, index); };
      panel.appendChild(foodButton);
    });
  
    document.body.appendChild(panel);
    this.feedPanel = panel;
  }
  
  hideFeedPanel() {
    if (this.feedPanel) {
      document.body.removeChild(this.feedPanel);
      this.feedPanel = null;
    }
  }
  
  adoptAnimal() {
    if (Math.random() < 0.5) {
      this.selectedAnimal.isFollowing = true;
      console.log('Adoption successful!');
    }
    this.hideAnimalPanel();
    this.hideFeedPanel();
  }
  
  collectFruit(fruit) {
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
  
      // 模拟动画时间300ms，直接在300ms后删除水果
      setTimeout(() => {
        fruit.mesh.scale.set(0, 0, 0);
        this.scene.remove(fruit.mesh);
        this.backpack.push(fruit.type);
        this.updateBackpackUI();
        this.fruits = this.fruits.filter(f => f !== fruit);
        console.log(`水果 ${fruit.type} 收集完成`);
        resolve(true);
      }, 300);
    });
  }
    
  feedAnimal(food, index) {
    this.backpack.splice(index, 1);
    this.updateBackpackUI();
    this.tryFeedAnimal(this.selectedAnimal, food);
    this.hideFeedPanel();
    this.hideAnimalPanel();
  }
  
  tryFeedAnimal(animal, food) {
    if (Math.random() > 0.3) {
      animal.isFollowing = true;
      console.log(`Feeding successful with ${food}!`);
    } else {
      console.log(`Feeding failed with ${food}.`);
    }
  }
  
  updateBackpackUI() {
    const backpackElement = document.getElementById('backpack');
    if (backpackElement) {
      backpackElement.textContent = `Backpack: ${this.backpack.length} fruit(s)`;
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    TWEEN.update();
    this.controls.update();
    const delta = this.clock.getDelta();
  
    this.animals.forEach(animal => {
      animal.update(delta, this.camera.position);
    });
  
    this.renderer.render(this.scene, this.camera);
  }
}
  
class Fruit {
  constructor(model, position, type) {
    this.mesh = model;
    this.mesh.position.copy(position);
    this.type = type;
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.isCollected = false;
    this.mesh.traverse(child => {
      if (child.isMesh) {
        child.userData = {
          fruit: this,
          isCollectable: true
        };
      }
    });
  
    new TWEEN.Tween(this.mesh.rotation)
      .to({ y: Math.PI * 2 }, 2000)
      .repeat(Infinity)
      .start();
  }
}
  
class Animal {
  constructor(model, position) {
    if (!model) throw new Error('Animal model is undefined');
    this.mesh = model.scene ? model.scene.clone() : model.clone();
    this.mesh.name = 'animalMesh';
    if (!(position instanceof THREE.Vector3)) {
      position = new THREE.Vector3(0, 0, 0);
    }
    this.mixer = model.animations && model.animations.length > 0 ? new THREE.AnimationMixer(this.mesh) : null;
    if (this.mixer) {
      const clips = model.animations;
      const randomIndex = Math.floor(Math.random() * clips.length);
      this.action = this.mixer.clipAction(clips[randomIndex]);
      this.action.play();
    }
    this.position = position.clone();
    this.mesh.position.copy(this.position);
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.isFollowing = false;
    this.followSpeed = 0.05;
    this.mesh.userData.animal = this;
    if (this.mesh.children.length > 0) {
      this.mesh.children[0].userData.animal = this;
    }
  }
  
  update(delta, cameraPosition) {
    if (this.mixer) this.mixer.update(delta);
    if (this.isFollowing && cameraPosition) {
      this.mesh.position.lerp(cameraPosition, this.followSpeed);
    }
  }
}
  
new Game();
