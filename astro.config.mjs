// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  vite: {
    optimizeDeps: {
      include: [
        'pdf-lib',
        'pdfjs-dist',
        'jszip'
      ]
    }
  }
});
