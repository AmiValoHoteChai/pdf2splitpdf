/**
 * 100% Client-Side Pure High-Performance PDF Splitting Engine
 * Powered by pdf-lib and JSZip
 */

import { PDFDocument } from 'pdf-lib';

/**
 * Loads a PDF document and returns total page count and metadata
 */
export async function loadPdfMetadata(arrayBuffer) {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const numPages = pdfDoc.getPageCount();
  return { pdfDoc, numPages };
}

/**
 * Computes split plan partition arrays based on selected mode
 * @param {number} totalPages 
 * @param {string} mode - 'by-pages' | 'custom-ranges' | 'single-pages' | 'equal-parts'
 * @param {object} options - { chunkSize, customRanges, numParts }
 * @returns {Array<{ partIndex: number, pageIndices: number[], label: string, pageRangeText: string }>}
 */
export function computeSplitPlan(totalPages, mode = 'by-pages', options = {}) {
  if (totalPages <= 0) return [];

  const plan = [];

  if (mode === 'by-pages') {
    const chunkSize = Math.max(1, parseInt(options.chunkSize, 10) || 5);
    let startPage = 1;
    let partNum = 1;

    while (startPage <= totalPages) {
      const endPage = Math.min(startPage + chunkSize - 1, totalPages);
      const pageIndices = [];
      for (let p = startPage; p <= endPage; p++) {
        pageIndices.push(p - 1); // 0-based for pdf-lib
      }

      const rangeText = startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}–${endPage}`;
      plan.push({
        partIndex: partNum,
        pageIndices,
        label: `Part ${partNum}`,
        pageRangeText: rangeText,
        pageCount: pageIndices.length
      });

      startPage += chunkSize;
      partNum++;
    }
  } else if (mode === 'single-pages') {
    for (let p = 1; p <= totalPages; p++) {
      plan.push({
        partIndex: p,
        pageIndices: [p - 1],
        label: `Page ${p}`,
        pageRangeText: `Page ${p}`,
        pageCount: 1
      });
    }
  } else if (mode === 'equal-parts') {
    const desiredParts = Math.min(totalPages, Math.max(2, parseInt(options.numParts || options.partCount, 10) || 2));
    const baseSize = Math.floor(totalPages / desiredParts);
    const remainder = totalPages % desiredParts;
    let startPage = 1;

    for (let partNum = 1; partNum <= desiredParts && startPage <= totalPages; partNum++) {
      const currentPartSize = baseSize + (partNum <= remainder ? 1 : 0);
      const endPage = Math.min(startPage + currentPartSize - 1, totalPages);
      const pageIndices = [];
      for (let p = startPage; p <= endPage; p++) {
        pageIndices.push(p - 1);
      }

      const rangeText = startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}–${endPage}`;
      plan.push({
        partIndex: partNum,
        pageIndices,
        label: `Part ${partNum}`,
        pageRangeText: rangeText,
        pageCount: pageIndices.length
      });

      startPage = endPage + 1;
    }
  } else if (mode === 'page-range') {
    let pageIndices = [];
    if (Array.isArray(options.selectedPages) && options.selectedPages.length > 0) {
      const sortedUnique = [...new Set(options.selectedPages.map(p => parseInt(p, 10)))]
        .filter(p => !isNaN(p) && p >= 1 && p <= totalPages)
        .sort((a, b) => a - b);
      pageIndices = sortedUnique.map(p => p - 1);
    } else {
      let from = parseInt(options.rangeStart, 10);
      let to = parseInt(options.rangeEnd, 10);

      if (isNaN(from)) from = 1;
      if (isNaN(to)) to = totalPages;

      if (from > to) [from, to] = [to, from];
      from = Math.max(1, Math.min(from, totalPages));
      to = Math.max(1, Math.min(to, totalPages));

      for (let p = from; p <= to; p++) {
        pageIndices.push(p - 1);
      }
    }

    if (pageIndices.length > 0) {
      const firstPage = pageIndices[0] + 1;
      const lastPage = pageIndices[pageIndices.length - 1] + 1;
      const isContiguous = pageIndices.every((idx, i) => i === 0 || idx === pageIndices[i - 1] + 1);
      const rangeText = isContiguous
        ? (firstPage === lastPage ? `Page ${firstPage}` : `Pages ${firstPage}–${lastPage}`)
        : `${pageIndices.length} Selected Pages`;

      plan.push({
        partIndex: 1,
        pageIndices,
        label: `Selection`,
        pageRangeText: rangeText,
        pageCount: pageIndices.length,
        fromPage: firstPage,
        toPage: lastPage
      });
    }
  } else if (mode === 'custom-ranges') {
    const rawInput = (options.customRanges || '').trim();
    if (!rawInput) return [];

    const segments = rawInput.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    let partNum = 1;

    for (const seg of segments) {
      const rangeMatch = seg.match(/^(\d+)\s*-\s*(\d+)$/);
      const singleMatch = seg.match(/^(\d+)$/);

      if (rangeMatch) {
        let from = parseInt(rangeMatch[1], 10);
        let to = parseInt(rangeMatch[2], 10);
        if (from > to) [from, to] = [to, from];

        from = Math.max(1, Math.min(from, totalPages));
        to = Math.max(1, Math.min(to, totalPages));

        const pageIndices = [];
        for (let p = from; p <= to; p++) {
          pageIndices.push(p - 1);
        }

        if (pageIndices.length > 0) {
          plan.push({
            partIndex: partNum,
            pageIndices,
            label: `Part ${partNum}`,
            pageRangeText: from === to ? `Page ${from}` : `Pages ${from}–${to}`,
            pageCount: pageIndices.length,
            fromPage: from,
            toPage: to
          });
          partNum++;
        }
      } else if (singleMatch) {
        const page = parseInt(singleMatch[1], 10);
        if (page >= 1 && page <= totalPages) {
          plan.push({
            partIndex: partNum,
            pageIndices: [page - 1],
            label: `Part ${partNum}`,
            pageRangeText: `Page ${page}`,
            pageCount: 1,
            fromPage: page,
            toPage: page
          });
          partNum++;
        }
      }
    }
  }

  return plan;
}

/**
 * Executes PDF splitting into separate Blob files based on the plan
 */
export async function splitPdfDocument(arrayBuffer, splitPlan, originalFilename = 'document.pdf', onProgress = () => {}) {
  const baseName = originalFilename.replace(/\.pdf$/i, '');
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalParts = splitPlan.length;
  const results = [];

  for (let i = 0; i < totalParts; i++) {
    const item = splitPlan[i];
    const progressPercent = Math.round(((i + 1) / totalParts) * 100);

    onProgress({
      phase: `Extracting ${item.label} (${item.pageRangeText})...`,
      percent: progressPercent,
      currentPart: i + 1,
      totalParts
    });

    // Create a new sub-PDF
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(sourceDoc, item.pageIndices);

    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const partSuffix = item.pageRangeText.replace(/[\s–—]+/g, '_').toLowerCase();
    const filename = `${baseName}_${partSuffix}.pdf`;

    results.push({
      partIndex: item.partIndex,
      filename,
      blob,
      url,
      size: blob.size,
      pageCount: item.pageCount,
      pageRangeText: item.pageRangeText
    });
  }

  return results;
}

/**
 * Download a single PDF file
 */
export function downloadSinglePdf(filename, blobOrUrl) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Pack all split PDFs into a ZIP archive and trigger download
 */
export async function downloadAllAsZip(splitResults, zipFilename = 'split_documents.zip') {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const item of splitResults) {
    zip.file(item.filename, item.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
