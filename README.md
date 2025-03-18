# AR Farm Adventure 🌱

![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)
![WebXR](https://img.shields.io/badge/WebXR-4A90E2?style=for-the-badge&logo=webgl&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

## Project Overview  
An interactive AR experience where you can collect fruits, adopt animals, and build your virtual farm. Built with Three.js and WebXR for immersive augmented reality interactions.

## Table of Contents  
- [AR Farm Adventure 🌱](#ar-farm-adventure-)
  - [Project Overview](#project-overview)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
    - [Online Demo](#online-demo)
    - [Local Setup](#local-setup)
  - [Technical Stack](#technical-stack)
  - [References](#references)
  - [License](#license)

## Features  
- 🌟 **AR Scene Placement**  
  Place fruits and animals in your real-world environment using hit-testing.
- 🍎 **Fruit Collection**  
  Collect randomly generated fruits (apple, banana, steak, etc.) into your backpack.
- 🐑 **Animal Interaction**  
  Adopt animals (cat, sheep, wolf, etc.) and feed them to gain their loyalty.
- 🎒 **Dynamic Inventory**  
  Real-time backpack UI showing collected items.
- 🕹️ **Controller Support**  
  Use XR controllers for object interaction and scene navigation.

## Installation  

### Online Demo  
Access directly via GitHub Pages:  
👉 [https://xiejiongru.github.io/three_vite_xr/](https://xiejiongru.github.io/three_vite_xr/)

### Local Setup  
1. Clone the repository:  
```bash
git clone https://github.com/xiejiongru/three_vite_xr.git
cd three_vite_xr
```

2. Install dependencies:  
```bash
npm install
```

3. Start development server:  
```bash
npm run dev
```

4. Open `http://localhost:5173` and click "Enter AR" to begin!

## Technical Stack  
- **Core Framework**: [Three.js](https://threejs.org/)  
- **XR Integration**: [WebXR API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)  
- **Build Tool**: [Vite](https://vitejs.dev/)  
- **Animation**: [Tween.js](https://github.com/tweenjs/tween.js/)  

## References  
- **Base Template**: Modified from [three_vite_xr](https://github.com/fdoganis/three_vite_xr)  
- **3D Models**:  
  - Food models by [Quaternius](https://quaternius.com/)  
  - Animal models from [Poly Pizza](https://poly.pizza/)  
- **Inspiration**: Three.js official [XR examples](https://threejs.org/examples/?q=ar)  

## License  
This project is licensed under **[MIT License](LICENSE)**. Model assets may have separate licenses.
