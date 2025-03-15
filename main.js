import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as TWEEN from '@tweenjs/tween.js';

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
    
    for(let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      // ✅ 使用动态模型引用
      const model = this.models.food[Object.keys(this.models.food)[i % 7]].scene.clone();
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
    // ✅ 动态创建所有动物
    this.animals = Object.entries(this.models.animal).map(([name, model]) => {
      const position = new THREE.Vector3(
        Math.random() * 20 - 10,
        0,
        Math.random() * 20 - 10
      );
      return new Animal(model.scene.clone(), position);
    });

    this.animals.forEach(animal => {
      animal.mesh.traverse(child => {
        if(child.isMesh) child.castShadow = true;
      });
      this.scene.add(animal.mesh);
    });
  }
  createMonsters() {
    const hedgehogModel = this.models.monster.hedgehog.scene.clone();

    this.monster.forEach(monster => {
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

    window.addEventListener('click', handleClick);
    window.addEventListener('touchstart', handleClick);
    
    // 窗口大小变化
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
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
    
    // 动物简单移动（阶段2）
    this.animals.forEach(animal => {
      animal.mesh.rotation.y += 0.01;
      animal.mesh.position.y = Math.sin(Date.now() * 0.002) * 0.5 + 0.5;
    });

    this.renderer.render(this.scene, this.camera);
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

class Animal {
  constructor(model, position) {
    this.mesh = model;
    this.mesh.position.copy(position);
    this.mesh.scale.set(0.5, 0.5, 0.5);
  }
}

// 启动游戏
new Game();