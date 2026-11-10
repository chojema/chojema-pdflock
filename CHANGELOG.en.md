# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Simplified to process a single PDF file at a time. Batch processing and **Save all** were removed.
- The Save section shows the file name with **Save** / **Save as**; a different name is edited in a field on the next line.

## [0.2.0] - 2026-11-10

### Security
- Fixed: with only an open password set (permissions password empty), the file could be opened without any password. Please re-protect files made this way with v0.1.0.

### Added
- Per-file **Save** (replace the original after confirmation) and **Save as** (name field, default `name_lock.pdf`, optional folder choice)
- **Save all**: saves every file as `name_lock.pdf` next to its original
- Confirmation before overwriting an original or an existing file

### Changed
- Default output suffix changed from `_locked` to `_lock`
- The "Save to" setting and "Protect" button were replaced by per-file save buttons

## [0.1.0] - 2026-11-10

### Added
- AES-256 PDF encryption with an open password, a permissions password, or both
- Permission options: printing (high/low resolution/none), content editing, copying, accessibility extraction, comments and form editing, form filling, page assembly
- Drag and drop of multiple files with batch processing
- Choice of output folder; automatic naming that never overwrites existing files
- Korean/English UI chosen automatically; light and dark mode

[0.2.0]: https://github.com/chojema/chojema-pdflock/releases/tag/v0.2.0
[0.1.0]: https://github.com/chojema/chojema-pdflock/releases/tag/v0.1.0
