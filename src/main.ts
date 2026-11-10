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
getVersion().then((v) => ($("version").textContent = `Chojema PDFLock v${v}`));

type Item = { path: string; state: "" | "working" | "done" | "error"; note: string; open: boolean; name: string };
let items: Item[] = [];
let busy = false;

// --- paths -------------------------------------------------------------------
const sepOf = (p: string) => (p.includes("\\") ? "\\" : "/");
const baseName = (p: string) => p.slice(Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")) + 1);
const dirOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")));
const join = (dir: string, name: string) => dir + sepOf(dir) + name;
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
function button(label: string, cls: string, onclick: () => void, disabled = busy) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = onclick;
  return b;
}

function render() {
  $("list").replaceChildren(...items.map(row));
  $("count").textContent = items.length ? t.files(items.length) : "";
  $("clear").hidden = items.length === 0;
  $("drop").classList.toggle("compact", items.length > 0);
  $<HTMLButtonElement>("saveAll").disabled = busy;
}

function row(it: Item, i: number) {
  const li = document.createElement("li");
  li.className = it.state;

  const head = document.createElement("div");
  head.className = "row-head";
  const label = document.createElement("span");
  label.className = "name";
  label.textContent = baseName(it.path);
  label.title = it.path;
  const rm = button("×", "link remove", () => {
    items.splice(i, 1);
    render();
  });
  rm.title = t.remove;
  rm.setAttribute("aria-label", t.remove);
  head.append(label, rm);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  const status = document.createElement("span");
  status.className = "status";
  status.textContent = { "": "", working: t.working, done: `${t.done}: ${baseName(it.note)}`, error: it.note }[it.state];
  status.title = it.note;
  actions.append(status);
  if (it.state !== "done") {
    const saveAs = button(t.saveAs, "secondary small" + (it.open ? " active" : ""), () => {
      it.open = !it.open;
      render();
      if (it.open) document.querySelector<HTMLInputElement>(`#name-${i}`)?.select();
    });
    saveAs.setAttribute("aria-expanded", String(it.open));
    actions.append(button(t.save, "secondary small", () => saveOriginal(it)), saveAs);
  }
  li.append(head, actions);

  if (it.open && it.state !== "done") {
    const line = document.createElement("div");
    line.className = "row-saveas";
    const field = document.createElement("input");
    field.type = "text";
    field.id = `name-${i}`;
    field.value = it.name;
    field.disabled = busy;
    field.setAttribute("aria-label", t.saveAs);
    field.oninput = () => (it.name = field.value);
    field.onkeydown = (e) => e.key === "Enter" && saveWithName(it);
    line.append(field, button(t.save, "primary small", () => saveWithName(it)), button(t.browse, "link", () => saveWithDialog(it)));
    li.append(line);
  }
  return li;
}

// --- actions -------------------------------------------------------------------
const showError = (msg: string) => ($("error").textContent = msg);

function add(paths: string[]) {
  const pdfs = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
  showError(pdfs.length < paths.length ? t.errNotPdf : "");
  for (const p of pdfs)
    if (!items.some((it) => it.path === p)) items.push({ path: p, state: "", note: "", open: false, name: lockName(p) });
  render();
}

/** Reads and validates password settings; shows an error and returns null if invalid. */
function readOptions() {
  const openPassword = input("openPw").value;
  const permissionPassword = input("permPw").value;
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
type Options = NonNullable<ReturnType<typeof readOptions>>;

async function run(jobs: { it: Item; output: string }[], options: Options) {
  busy = true;
  for (const { it, output } of jobs) {
    it.state = "working";
    render();
    try {
      it.note = await invoke<string>("lock_pdf", { input: it.path, output, options });
      it.state = "done";
      it.open = false;
    } catch (err) {
      it.state = "error";
      it.note = String(err);
    }
  }
  busy = false;
  render();
}

async function saveTo(it: Item, output: string, askIfExists: boolean) {
  const options = readOptions();
  if (!options) return;
  if (samePath(output, it.path)) {
    if (!(await confirmBox(t.confirmOriginal(baseName(it.path)), t.overwrite))) return;
  } else if (askIfExists && (await invoke<boolean>("path_exists", { path: output }))) {
    if (!(await confirmBox(t.confirmExists(baseName(output)), t.overwrite))) return;
  }
  await run([{ it, output }], options);
}

const saveOriginal = (it: Item) => saveTo(it, it.path, false);

function saveWithName(it: Item) {
  const name = cleanName(it.name);
  if (!name) return showError(t.errName);
  saveTo(it, join(dirOf(it.path), name), true);
}

async function saveWithDialog(it: Item) {
  if (!readOptions()) return;
  const picked = await save({
    defaultPath: join(dirOf(it.path), cleanName(it.name) ?? lockName(it.path)),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  // The system dialog already asked about overwriting an existing file.
  if (picked) saveTo(it, withPdf(picked), false);
}

$("saveAll").onclick = async () => {
  const pending = items.filter((it) => it.state !== "done");
  if (!pending.length) return showError(t.errNoFiles);
  const options = readOptions();
  if (!options) return;
  const jobs = pending.map((it) => ({ it, output: join(dirOf(it.path), lockName(it.path)) }));
  const existing = [];
  for (const j of jobs) if (await invoke<boolean>("path_exists", { path: j.output })) existing.push(j);
  if (existing.length) {
    const msg = existing.length === 1 ? t.confirmExists(baseName(existing[0].output)) : t.confirmExistsMany(existing.length);
    if (!(await confirmBox(msg, t.overwrite))) return;
  }
  await run(jobs, options);
};

// --- wiring --------------------------------------------------------------------
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

syncPerms();
render();
