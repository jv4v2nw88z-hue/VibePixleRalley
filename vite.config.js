import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  // Relative base so the build works from a domain root, a project
  // subpath, or straight off the filesystem.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // The game is written in ES5-era vanilla JS; keep the output broad
    // so older iOS Safari versions can still run it.
    target: 'es2017',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5173
  }
});
