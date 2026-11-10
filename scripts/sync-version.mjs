// Copies the version from package.json (single source of truth) into src-tauri/Cargo.toml.
// tauri.conf.json reads package.json directly. Runs automatically on `npm version <x>`.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const path = "src-tauri/Cargo.toml";
const cargo = readFileSync(path, "utf8");
const next = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
if (next === cargo && !cargo.includes(`version = "${version}"`)) throw new Error("Cargo.toml version line not found");
writeFileSync(path, next);
execSync("cargo update --workspace --offline", { cwd: "src-tauri", stdio: "inherit" }); // refresh Cargo.lock
console.log(`Cargo.toml -> ${version}`);
