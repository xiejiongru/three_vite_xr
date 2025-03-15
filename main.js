import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as TWEEN from '@tweenjs/tween.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const MODEL_CONFIG = {
  food: ['apple', 'avocado', 'banana', 'broccoli', 'carrot', 'chicken_leg', 'steak'],      // /models/food/ 下的所有模型
  animal: ['cat', 'chicken','horse','sheep','wolf'],      // /models/animal/ 下的所有模型
  monster: ['hedgehog']    // /models/monster/ 下的所有模型
};
class Game {
  constructor() {
    this.score = 0;
    this.initScene();
    this.createLights();
    this.createGround();
    this.loadAssets().then(() => {
      this.createFruits();
      this.createAnimals();
      this.setupEvents();
      this.animate();
    });
  }

  initScene() {
    // 初始化Three.js核心组件
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock(); 
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // 初始相机位置
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // 添加轨道控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }

  createLights() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // 方向光（产生阴影）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  createGround() {
    // 地面
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0x88aa55,
      shininess: 100
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
            this.models[category][modelName] = glb;
            if (++loadedCount === loadQueue.length) resolve();
          },
          undefined,
          (error) => reject(error)
        );
      });
    });
  }

  createFruits() {
    this.fruits = [];
    const radius = 8;
    const foodKeys = Object.keys(this.models.food);
    // 随机生成1-3个水果
    const fruitCount = Math.floor(Math.random() * 3) + 1;
    
    
    for(let i = 0; i < fruitCount; i++) {
      const angle = (i / fruitCount) * Math.PI * 2;
      const randomFood = foodKeys[Math.floor(Math.random() * foodKeys.length)];
      const model = this.models.food[randomFood].scene.clone();
      
      const fruit = new Fruit(
        model,
        new THREE.Vector3(
          Math.cos(angle) * radius,
          1,
          Math.sin(angle) * radius
        )
      );
      this.fruits.push(fruit);
      this.scene.add(fruit.mesh);
    }
  }

  createAnimals() {
    const animalKeys = Object.keys(this.models.animal);
    const selectedAnimal = animalKeys[Math.floor(Math.random() * animalKeys.length)];
    
    // 只生成一个随机动物
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
  createMonsters() {
    const hedgehogModel = this.models.monster.hedgehog.scene.clone();

    this.monsters.forEach(monster => {
      this.scene.add(monster.mesh);
      monster.mesh.traverse(child => {
        if(child.isMesh) child.castShadow = true;
      });
    });
  }
    setupEvents() {
    // 点击/触摸事件
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    
    const handleClick = (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      
      this.raycaster.setFromCamera(this.pointer, this.camera);
      
      // 检测水果点击
      const intersects = this.raycaster.intersectObjects(
        this.fruits.map(f => f.mesh)
      );
      
      if(intersects.length > 0) {
        this.collectFruit(intersects[0].object.parent);
      }
    };

    const handleAnimalClick = (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersects = this.raycaster.intersectObjects(
        this.animals.map(a => a.mesh)
      );
      
      if(intersects.length > 0) {
        const animal = this.animals.find(a => a.mesh === intersects[0].object.parent);
        this.tryFeedAnimal(animal);
      }
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('touchstart', handleClick);
    
    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  tryFeedAnimal(animal) {
    if (this.selectedFruit) {
      // 有选中水果时投喂
      animal.isFollowing = Math.random() > 0.3; // 70%概率跟随
      this.scene.remove(this.selectedFruit.mesh);
      this.selectedFruit = null;
    }
  }

  collectFruit(fruit) {
    // 收集动画
    new TWEEN.Tween(fruit.mesh.scale)
      .to({ x: 0, y: 0, z: 0 }, 300)
      .start()
      .onComplete(() => {
        this.scene.remove(fruit.mesh);
        this.score += 10;
        document.getElementById('score').textContent = `分数: ${this.score}`;
      });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    TWEEN.update();
    this.controls.update();

    const delta = this.clock.getDelta();
    
    // 动物简单移动（阶段2）
    this.animals.forEach(animal => {
      animal.update(delta, this.camera.position);
    });

    this.renderer.render(this.scene, this.camera);
  }
}

function checkFeeding(animal, fruits) {
  const raycaster = new THREE.Raycaster();
  raycaster.set(animal.mesh.position, new THREE.Vector3(0, -1, 0));
  
  const intersects = raycaster.intersectObjects(fruits.map(f => f.mesh));
  if(intersects.length > 0) {
    const fruit = intersects[0].object.parent; // 假设fruit是独立对象
    animal.eat(fruit);
  }
}

class Fruit {
  constructor(model, position) {
    this.mesh = model;
    this.mesh.position.copy(position);
    this.mesh.scale.set(0.5, 0.5, 0.5);
    
    // 旋转动画
    new TWEEN.Tween(this.mesh.rotation)
      .to({ y: Math.PI * 2 }, 2000)
      .repeat(Infinity)
      .start();
  }
}

// ==== Animal类 ====
class Animal {
  constructor(model, position) {
    this.mesh = model.scene ? model.scene.clone() : model.clone();
    this.mixer = model.animations ? new THREE.AnimationMixer(this.mesh) : null;
    this.position = position.clone();
    this.mesh.position.copy(this.position);
    this.mesh.scale.set(0.5, 0.5, 0.5);
    this.isFollowing = false;
    this.followSpeed = 0.05;

    // 随机播放动画
    if (this.mixer && model.animations?.length > 0) {
      const randomIndex = Math.floor(Math.random() * model.animations.length);
      this.clip = model.animations[randomIndex];
      this.action = this.mixer.clipAction(this.clip);
      this.action.play();
    }
  }

  update(delta, cameraPosition) {
    if (this.mixer) this.mixer.update(delta);
    
    if (this.isFollowing) {
      this.mesh.position.lerp(
        cameraPosition.clone().add(
          new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).multiplyScalar(3)
        ), 
        this.followSpeed
      );
    }
  }
}

// ==== Cat类 ====
class Cat extends Animal {
  eat(fruit) {
    // 粒子特效
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(30 * 3);
    for(let i=0; i<90; i++) positions[i] = (Math.random() - 0.5) * 2;
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleSystem = new THREE.Points(
      particles,
      new THREE.PointsMaterial({ 
        size: 0.1, 
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8
      })
    );
    this.mesh.add(particleSystem);

    // 淡出动画
    new TWEEN.Tween(particleSystem.material)
      .to({ opacity: 0 }, 1000)
      .onComplete(() => this.mesh.remove(particleSystem))
      .start();

    this.isFollowing = true;
  }
}

// 启动游戏
new Game();