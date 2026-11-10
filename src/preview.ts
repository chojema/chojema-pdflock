import { getDocument, GlobalWorkerOptions, PasswordException } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type PreviewResult = { pages: number } | { error: "password" | "invalid" };

let generation = 0;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Renders page 1 of `data` into `canvas`, sized to fit `box`. Renders run one at a time
 * (pdf.js forbids concurrent renders on one canvas); superseded calls resolve to null.
 */
export function renderFirstPage(data: ArrayBuffer, canvas: HTMLCanvasElement, box: HTMLElement): Promise<PreviewResult | null> {
  const mine = ++generation;
  const run = queue.then(() => (mine === generation ? render(mine, data, canvas, box) : null));
  queue = run.catch(() => {});
  return run;
}

async function render(mine: number, data: ArrayBuffer, canvas: HTMLCanvasElement, box: HTMLElement): Promise<PreviewResult | null> {
  const task = getDocument({
    data: new Uint8Array(data.slice(0)), // pdf.js transfers the buffer to its worker; keep ours for re-renders
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    if (mine !== generation) return null;
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(box.clientWidth / base.width, box.clientHeight / base.height);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: fit * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    await page.render({ canvas, viewport }).promise;
    const pages = pdf.numPages;
    await task.destroy();
    return mine === generation ? { pages } : null;
  } catch (err) {
    await task.destroy();
    if (mine !== generation) return null;
    return { error: err instanceof PasswordException ? "password" : "invalid" };
  }
}
