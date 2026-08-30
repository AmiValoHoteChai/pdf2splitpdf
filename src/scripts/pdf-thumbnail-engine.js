/**
 * High Performance PDF Canvas Rendering Engine
 * Powered by pdfjs-dist
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set worker source to CDN matching installed version, with fallback
try {
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  }
} catch (e) {
  console.warn('Failed to set PDF worker src:', e);
}

/**
 * Loads a PDFJS document from an ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<any>} pdfDoc
 */
export async function getPdfJsDocument(arrayBuffer) {
  // Clone buffer so workers don't neuter it
  const bufferCopy = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({
    data: bufferCopy,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
    cMapPacked: true,
  });
  return await loadingTask.promise;
}

/**
 * Renders a specific 1-based page into a HTMLCanvasElement
 * @param {any} pdfDoc 
 * @param {number} pageNumber (1-based)
 * @param {HTMLCanvasElement} canvas 
 * @param {number} targetWidth 
 * @returns {Promise<void>}
 */
export async function renderPageToCanvas(pdfDoc, pageNumber, canvas, targetWidth = 140) {
  if (!pdfDoc || !canvas) return;

  const page = await pdfDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };

  await page.render(renderContext).promise;
}
