<p align="center"><img src="src-tauri/icons/128x128@2x.png" width="128" alt="Chojema PDFLock"></p>

<h1 align="center">Chojema PDFLock</h1>

<p align="center">Protect PDF files with an open password and a permissions password · Windows / macOS</p>

<p align="center"><a href="README.md">한국어</a></p>

## Features

- **Open password**: only people who know it can open the file.
- **Permissions password**: restricts printing, editing, copying and more. Only this password lifts the restrictions.
- Set either password on its own, or both together.
- **AES-256** encryption (PDF 1.7 extension level 8 / PDF 2.0 standard).
- Drop or choose a single PDF file to protect.
- Choose **Save** (replace the original with the protected file) or **Save as** (default name `name_lock.pdf`, editable).
- You are always asked before an original or an existing file is overwritten.
- Everything happens on your computer. No file ever leaves it.
- Korean and English UI, chosen automatically from your system language.

## Permission options

| Option | Description |
|---|---|
| Printing | High resolution / Low resolution only / Not allowed |
| Content editing | Change page content |
| Copying text and images | Select and copy content |
| Accessibility extraction | Let screen readers read the content |
| Comments and form editing | Add comments and change form fields |
| Form filling | Fill in existing form fields |
| Page assembly | Insert, delete and rotate pages |

If the permissions password is empty, the options are not applied and everything is allowed.

## Install

Download the latest version from the [Releases](../../releases) page.

- **Windows**: `Chojema.PDFLock_x.y.z_x64-setup.exe`
- **macOS**: `Chojema.PDFLock_x.y.z_universal.dmg` (Apple Silicon and Intel, macOS 11 or later)

The app is not code-signed, so you may see a warning the first time you run it.

- **Windows**: in the "Windows protected your PC" dialog, click **More info → Run anyway**.
- **macOS**: **Control-click (or right-click) the app → Open**. If it still won't open, go to **System Settings → Privacy & Security** and click **Open Anyway**.

## How to use

1. Drop a PDF file onto the window, or click **Choose file**.
2. Enter an open password, a permissions password, or both.
3. If you set a permissions password, choose which actions to allow.
4. In the **Save** section, click **Save** or **Save as**.
   - **Save as** opens a name field on the next line. Edit the name and click **Save**, or use **Choose folder…** to save elsewhere.

## Good to know

- **A forgotten password cannot be recovered.** Keep your passwords somewhere safe.
- Permission restrictions are honored by PDF viewers, but some programs ignore them. To truly protect content, use an **open password**.
- PDFs that are already password-protected are skipped.
- The open and permissions passwords must be different.

## License

[MIT](LICENSE) © 2026 Chulwoo Park

Uses [qpdf](https://github.com/qpdf/qpdf) (Apache-2.0) as the encryption engine.
