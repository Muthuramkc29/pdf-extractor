// Wire pdfjs's worker so react-pdf can render. Must be imported once on app startup.
import { pdfjs } from 'react-pdf';
// Vite's ?url import resolves to a hashed asset URL.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
