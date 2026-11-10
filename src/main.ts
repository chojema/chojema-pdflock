import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { isKo, t, type Key } from "./i18n";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

document.documentElement.lang = isKo ? "ko" : "en";
document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t[el.dataset.i18n as Key]));
document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => (el.placeholder = t[el.dataset.i18nPh as Key]));
getVersion().then((v) => ($("version").textContent = `Chojema PDFLock v${v}`));

type Item = { path: string; state: "" | "working" | "done" | "error"; note: string };
let items: Item[] = [];
let outDir: string | null = null;
let busy = false;

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function render() {
  $("list").replaceChildren(
    ...items.map((it, i) => {
      const li = document.createElement("li");
      li.className = it.state;
      li.title = it.note || it.path;
      const label = document.createElement("span");
      label.className = "name";
      label.textContent = baseName(it.path);
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = { "": "", working: t.working, done: t.done, error: it.note }[it.state];
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "link remove";
      rm.textContent = "×";
      rm.title = t.remove;
      rm.setAttribute("aria-label", t.remove);
      rm.disabled = busy;
      rm.onclick = () => {
        items.splice(i, 1);
        render();
      };
      li.append(label, status, rm);
      return li;
    }),
  );
  $("count").textContent = items.length ? t.files(items.length) : "";
  $("clear").hidden = items.length === 0;
  $("drop").classList.toggle("compact", items.length > 0);
  $("outDir").textContent = outDir ?? t.sameFolder;
  $("resetOut").hidden = outDir === null;
  $<HTMLButtonElement>("lock").disabled = busy;
}

const showError = (msg: string) => ($("error").textContent = msg);

function add(paths: string[]) {
  const pdfs = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
  showError(pdfs.length < paths.length ? t.errNotPdf : "");
  for (const p of pdfs) if (!items.some((it) => it.path === p)) items.push({ path: p, state: "", note: "" });
  render();
}

// Permissions only mean something when a permissions password exists.
function syncPerms() {
  const on = input("permPw").value !== "";
  $("perms").classList.toggle("disabled", !on);
  $("perms").querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => (el.disabled = !on));
}

$("pick").onclick = async () => {
  const picked = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (picked) add(picked);
};
$("clear").onclick = () => {
  if (busy) return;
  items = [];
  render();
};
$("pickOut").onclick = async () => {
  const dir = await open({ directory: true });
  if (typeof dir === "string") {
    outDir = dir;
    render();
  }
};
$("resetOut").onclick = () => {
  outDir = null;
  render();
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
  if (e.payload.type === "drop" && !busy) add(e.payload.paths);
});

$("lock").onclick = async () => {
  const openPassword = input("openPw").value;
  const permissionPassword = input("permPw").value;
  const pending = items.filter((it) => it.state !== "done");
  if (!pending.length) return showError(t.errNoFiles);
  if (!openPassword && !permissionPassword) return showError(t.errNoPw);
  if (openPassword && openPassword === permissionPassword) return showError(t.errSamePw);
  showError("");

  const options = {
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

  busy = true;
  for (const it of pending) {
    it.state = "working";
    render();
    try {
      it.note = await invoke<string>("lock_pdf", { input: it.path, outDir, options });
      it.state = "done";
    } catch (err) {
      it.state = "error";
      it.note = String(err);
    }
  }
  busy = false;
  render();
};

syncPerms();
render();
