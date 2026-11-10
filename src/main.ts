import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isKo, t, type Key } from "./i18n";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

document.documentElement.lang = isKo ? "ko" : "en";
document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t[el.dataset.i18n as Key]));
document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => (el.placeholder = t[el.dataset.i18nPh as Key]));
document.querySelectorAll<HTMLElement>("[data-i18n-label]").forEach((el) => el.setAttribute("aria-label", t[el.dataset.i18nLabel as Key]));
getVersion().then((v) => ($("version").textContent = `Chojema PDFLock v${v}`));

let file: string | null = null;
let pageCount = 0; // from the preview; 0 until known
let busy = false;

// --- paths -------------------------------------------------------------------
const sepIndex = (p: string) => Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
const baseName = (p: string) => p.slice(sepIndex(p) + 1);
const dirOf = (p: string) => p.slice(0, sepIndex(p));
const join = (dir: string, name: string) => dir + (dir.includes("\\") ? "\\" : "/") + name;
const lockName = (p: string) => baseName(p).replace(/\.pdf$/i, "") + "_lock.pdf";
const withPdf = (n: string) => (/\.pdf$/i.test(n) ? n : n + ".pdf");
const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase(); // shortcut: case-insensitive, fine for Windows/macOS defaults

/** Returns a usable file name, or null if the user typed something invalid. */
function cleanName(raw: string): string | null {
  const n = withPdf(raw.trim());
  return /[\\/:*?"<>|]/.test(n) || /^\.pdf$/i.test(n) ? null : n;
}

// --- confirm dialog ------------------------------------------------------------
function confirmBox(message: string, okLabel: string): Promise<boolean> {
  const dlg = $<HTMLDialogElement>("confirm");
  $("confirmMsg").textContent = message;
  $("confirmYes").textContent = okLabel;
  dlg.showModal();
  $("confirmNo").focus();
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      dlg.close();
      resolve(ok);
    };
    $("confirmYes").onclick = () => done(true);
    $("confirmNo").onclick = () => done(false);
    dlg.oncancel = () => done(false);
  });
}

// --- rendering -----------------------------------------------------------------
const showError = (msg: string) => ($("error").textContent = msg);
const showStatus = (msg: string, cls = "") => {
  $("status").textContent = msg;
  $("status").className = "status " + cls;
};

function render() {
  $("empty").hidden = file !== null;
  $("card").hidden = file === null;
  $("drop").classList.toggle("has-file", file !== null);
  $("pick").textContent = file ? t.pickOther : t.pickFile;
  $("cardName").textContent = file ? baseName(file) : "";
  $("cardDir").textContent = file ? (pageCount ? `${t.pages(pageCount)} · ` : "") + dirOf(file) : "";
  $("fileName").textContent = file ? baseName(file) : t.noFile;
  $("fileName").classList.toggle("muted", !file);
  $("fileName").title = file ?? "";
  for (const id of ["save", "saveAs", "saveNamed", "browse", "pick"]) $<HTMLButtonElement>(id).disabled = busy || (!file && id !== "pick");
  input("newName").disabled = busy || !file;
}

function setFile(paths: string[]) {
  const pdfs = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) return showError(t.errNotPdf);
  showError(pdfs.length < paths.length ? t.errNotPdf : pdfs.length > 1 ? t.oneFile : "");
  file = pdfs[0];
  pageCount = 0;
  input("newName").value = lockName(file);
  showStatus("");
  render();
  loadPreview(file);
}

// --- preview -------------------------------------------------------------------
let previewData: ArrayBuffer | null = null;

function pageMessage(msg: string) {
  $("pageMsg").textContent = msg;
  $("pageMsg").hidden = !msg;
  $("page").hidden = !!msg;
}

async function drawPreview() {
  if (!previewData) return;
  const { renderFirstPage } = await import("./preview"); // keeps pdf.js out of the startup bundle
  const res = await renderFirstPage(previewData, $<HTMLCanvasElement>("page"), $("pageBox"));
  if (!res) return; // superseded by a newer file or resize
  if ("error" in res) return pageMessage(res.error === "password" ? t.previewPassword : t.previewInvalid);
  pageMessage("");
  pageCount = res.pages;
  render();
}

async function loadPreview(path: string) {
  previewData = null;
  pageMessage(t.loading);
  try {
    const data = await invoke<ArrayBuffer>("read_pdf", { path });
    if (path !== file) return;
    previewData = data;
    await drawPreview();
  } catch (err) {
    if (path === file) pageMessage(String(err));
  }
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(drawPreview, 150);
});

function toggleSaveAs(open = $("saveAsRow").hidden === true) {
  $("saveAsRow").hidden = !open;
  $("saveAs").classList.toggle("active", open);
  $("saveAs").setAttribute("aria-expanded", String(open));
  if (open) input("newName").select();
}

// --- saving --------------------------------------------------------------------
/** Reads and validates password settings; shows an error and returns null if invalid. */
function readOptions() {
  const openPassword = input("openPw").value;
  const permissionPassword = input("permPw").value;
  if (!file) return showError(t.errNoFile), null;
  if (!openPassword && !permissionPassword) return showError(t.errNoPw), null;
  if (openPassword && openPassword === permissionPassword) return showError(t.errSamePw), null;
  showError("");
  return {
    openPassword,
    permissionPassword,
    print: $<HTMLSelectElement>("print").value,
    modify: input("modify").checked,
    extract: input("extract").checked,
    accessibility: input("accessibility").checked,
    annotate: input("annotate").checked,
    fillForms: input("fillForms").checked,
    assemble: input("assemble").checked,
  };
}

async function saveTo(output: string, askIfExists: boolean) {
  const options = readOptions();
  if (!options || !file) return;
  if (samePath(output, file)) {
    if (!(await confirmBox(t.confirmOriginal(baseName(file)), t.overwrite))) return;
  } else if (askIfExists && (await invoke<boolean>("path_exists", { path: output }))) {
    if (!(await confirmBox(t.confirmExists(baseName(output)), t.overwrite))) return;
  }
  busy = true;
  showStatus(t.working);
  render();
  try {
    const saved = await invoke<string>("lock_pdf", { input: file, output, options });
    showStatus(`${t.done}: ${saved}`, "done");
    toggleSaveAs(false);
  } catch (err) {
    showStatus(String(err), "failed");
  }
  busy = false;
  render();
}

$("save").onclick = () => file && saveTo(file, false);
$("saveAs").onclick = () => toggleSaveAs();
$("saveNamed").onclick = () => {
  const name = cleanName(input("newName").value);
  if (!name) return showError(t.errName);
  if (file) saveTo(join(dirOf(file), name), true);
};
input("newName").onkeydown = (e) => e.key === "Enter" && $("saveNamed").click();
$("browse").onclick = async () => {
  if (!file || !readOptions()) return;
  const picked = await save({
    defaultPath: join(dirOf(file), cleanName(input("newName").value) ?? lockName(file)),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  // The system dialog already asked about overwriting an existing file.
  if (picked) saveTo(withPdf(picked), false);
};

// --- wiring --------------------------------------------------------------------
// Permissions only mean something when a permissions password exists.
function syncPerms() {
  const on = input("permPw").value !== "";
  $("perms").classList.toggle("disabled", !on);
  $("perms").querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => (el.disabled = !on));
}

$("pick").onclick = async () => {
  const picked = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (typeof picked === "string") setFile([picked]);
};
input("permPw").oninput = syncPerms;
input("show").onchange = () => {
  const type = input("show").checked ? "text" : "password";
  input("openPw").type = type;
  input("permPw").type = type;
};

getCurrentWebview().onDragDropEvent((e) => {
  const type = e.payload.type;
  $("drop").classList.toggle("over", type === "enter" || type === "over");
  if (e.payload.type === "drop" && !busy) setFile(e.payload.paths);
});

syncPerms();
render();
