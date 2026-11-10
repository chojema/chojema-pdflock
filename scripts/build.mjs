// Release build: `npm run release-build [-- tauri build args]`.
// Remaps local absolute paths (cargo home, project folder) so they are not embedded in the binary.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
const flags = [`--remap-path-prefix=${cargoHome}=/cargo`, `--remap-path-prefix=${resolve(".")}=/src`];
const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: flags.join("\x1f") };
const r = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
