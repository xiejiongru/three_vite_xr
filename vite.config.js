// vite.config.js
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  base: "/three_vite_xr/",
  clearScreen: false,
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1024,
    assetsDir: 'assets',
    rollupOptions: {
      input: './index.html'
    }
  },
  server: {
    open: true,
    hmr: {
      overlay: false
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'node_modules/three/examples/jsm/libs/ammo.wasm.js', dest: 'jsm/libs/' },
        { src: 'node_modules/three/examples/jsm/libs/ammo.wasm.wasm', dest: 'jsm/libs/' },
        { src: 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js', dest: 'jsm/libs/draco/gltf' },
        { src: 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm', dest: 'jsm/libs/draco/gltf/' }
      ]
    }),
    glsl()
  ]
});