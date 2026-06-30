import * as pdfjs from 'pdfjs-dist';

// Set up pdf.js worker using unpkg CDN with corresponding version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts plain text from a PDF file using pdf.js on the client-side.
 * 
 * @param file The PDF file uploaded by the user
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  
  // Extract text page by page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');
      
    fullText += `[ページ ${i}]\n${pageText}\n\n`;
  }
  
  return fullText.trim();
}
