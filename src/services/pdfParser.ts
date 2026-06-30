import * as pdfjs from 'pdfjs-dist';

// Set up pdf.js worker using unpkg CDN with corresponding version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts plain text from a PDF file using pdf.js on the client-side.
 * 
 * @param file The PDF file uploaded by the user
 * @param onProgress Callback to notify progress percentage (0 - 100)
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPdf(file: File, onProgress?: (progress: number) => void): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  const totalPages = pdf.numPages;
  
  // Extract text page by page
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');
      
    fullText += `[ページ ${i}]\n${pageText}\n\n`;

    if (onProgress && totalPages > 0) {
      onProgress(Math.round((i / totalPages) * 100));
    }
  }
  
  return fullText.trim();
}
