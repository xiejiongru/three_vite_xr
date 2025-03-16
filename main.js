// main.js
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
    // 不再使用 3D 内嵌 UI，所以移除 uiTexts 数组
    
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
    for (let i = 0; i < fruitCount; i++) {
      const angle = (i / fruitCount) * Math.PI * 2;
      const randomFood = foodKeys[Math.floor(Math.random() * foodKeys.length)];
      const model = this.models.food[randomFood].scene.clone();
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
  
  // 辅助函数：沿父级链查找 animal 实例
  getAnimalFromObject(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.animal) return current.userData.animal;
      current = current.parent;
    }
    return null;
  }
  
  // 辅助函数：沿父级链查找 fruit 实例
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
    
    window.addEventListener('click', (e) => {
      e.preventDefault();
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      
      // 先检测食物点击（只检测每个 fruit 的主 mesh）
      let intersects = this.raycaster.intersectObjects(
        this.fruits.map(f => f.mesh)
      );
      if (intersects.length > 0) {
        const fruit = this.getFruitFromObject(intersects[0].object);
        if (fruit) {
          this.collectFruit(fruit);
          return;
        }
      }
      
      // 检测动物点击
      intersects = this.raycaster.intersectObjects(
        this.animals.map(a => a.mesh)
      );
      if (intersects.length > 0) {
        const animal = this.getAnimalFromObject(intersects[0].object);
        if (animal) {
          this.showAnimalUI(animal);
          return;
        }
      }
    });
    
    window.addEventListener('touchstart', (e) => {
      this.pointer.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      
      let intersects = this.raycaster.intersectObjects(
        this.fruits.map(f => f.mesh)
      );
      if (intersects.length > 0) {
        const fruit = this.getFruitFromObject(intersects[0].object);
        if (fruit) {
          this.collectFruit(fruit);
          return;
        }
      }
      
      intersects = this.raycaster.intersectObjects(
        this.animals.map(a => a.mesh)
      );
      if (intersects.length > 0) {
        const animal = this.getAnimalFromObject(intersects[0].object);
        if (animal) {
          this.showAnimalUI(animal);
          return;
        }
      }
    });
    
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  
  // 使用 DOM 创建动物交互 UI 面板
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
  
  // 显示背包食物选择面板
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
    
    // 为背包中每个食物创建一个按钮
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
    if (!fruit) return;
    new TWEEN.Tween(fruit.mesh.scale)
      .to({ x: 0, y: 0, z: 0 }, 300)
      .start()
      .onComplete(() => {
        this.scene.remove(fruit.mesh);
        this.backpack.push(fruit.type);
        this.updateBackpackUI();
      });
  }
  
  // food 为选中的食物，index 为背包中对应的索引
  feedAnimal(food, index) {
    // 从背包中移除所选食物
    this.backpack.splice(index, 1);
    this.updateBackpackUI();
    this.tryFeedAnimal(this.selectedAnimal, food);
    this.hideFeedPanel();
    this.hideAnimalPanel();
  }
  
  tryFeedAnimal(animal, food) {
    // 此处可添加更复杂的逻辑；简单示例中，随机判断投喂成功与否
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
    this.mesh.userData.fruit = this;
    
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
    
    this.mixer = model.animations && model.animations.length > 0 
      ? new THREE.AnimationMixer(this.mesh)
      : null;
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
      // 让动物平滑向相机移动
      this.mesh.position.lerp(cameraPosition, this.followSpeed);
    }
  }
}

// 启动游戏
new Game();
