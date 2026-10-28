import { defineConfig } from 'vite';

// base './' keeps the built site working both on GitHub Pages
// (served from /minidb/) and from a plain static file server.
export default defineConfig({
  base: './',
});
