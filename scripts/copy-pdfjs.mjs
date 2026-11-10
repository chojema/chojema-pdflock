// Copies pdf.js runtime assets (CJK cmaps, standard fonts, wasm decoders, ICC profile) into public/pdfjs.
import { cpSync } from "node:fs";

for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"])
  cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
