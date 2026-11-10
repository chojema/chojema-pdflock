use qpdf::{EncryptionParams, EncryptionParamsR6, PrintPermission, QPdf};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockOptions {
    open_password: String,
    permission_password: String,
    print: String,
    modify: bool,
    extract: bool,
    accessibility: bool,
    annotate: bool,
    fill_forms: bool,
    assemble: bool,
}

/// Encrypts PDF bytes with AES-256 (R6). Returns the protected PDF bytes.
pub fn lock_bytes(pdf: &[u8], o: &LockOptions) -> Result<Vec<u8>, String> {
    if o.open_password.is_empty() && o.permission_password.is_empty() {
        return Err("No password given".into());
    }
    if !o.open_password.is_empty() && o.open_password == o.permission_password {
        return Err("Open and permissions passwords must differ".into());
    }
    let doc = QPdf::read_from_memory(pdf).map_err(|e| {
        if e.to_string().to_lowercase().contains("password") {
            "Already password-protected".to_string()
        } else {
            format!("Cannot read PDF: {e}")
        }
    })?;
    if doc.is_encrypted() {
        return Err("Already password-protected".into());
    }

    // Without a permissions password, restrictions could be lifted by anyone, so allow everything.
    let restricted = !o.permission_password.is_empty();
    let allow = |flag: bool| !restricted || flag;
    let params = EncryptionParamsR6 {
        user_password: o.open_password.clone(),
        owner_password: o.permission_password.clone(),
        allow_print: match (restricted, o.print.as_str()) {
            (true, "none") => PrintPermission::None,
            (true, "low") => PrintPermission::Low,
            _ => PrintPermission::Full,
        },
        allow_modify_other: allow(o.modify),
        allow_extract: allow(o.extract),
        allow_accessibility: allow(o.accessibility),
        allow_annotate_and_form: allow(o.annotate),
        allow_form_filling: allow(o.fill_forms || o.annotate),
        allow_assemble: allow(o.assemble),
        encrypt_metadata: true,
    };
    doc.writer()
        .encryption_params(EncryptionParams::R6(params))
        .write_to_memory()
        .map_err(|e| format!("Cannot write PDF: {e}"))
}

/// `report.pdf` -> `report_locked.pdf`, then `report_locked (2).pdf`, ... never overwriting.
fn output_path(input: &Path, out_dir: Option<&Path>) -> PathBuf {
    let dir = out_dir.or(input.parent()).unwrap_or(Path::new("."));
    let stem = input.file_stem().unwrap_or_default().to_string_lossy();
    let mut path = dir.join(format!("{stem}_locked.pdf"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}_locked ({n}).pdf"));
        n += 1;
    }
    path
}

#[tauri::command]
async fn lock_pdf(input: String, out_dir: Option<String>, options: LockOptions) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = PathBuf::from(input);
        let pdf = std::fs::read(&input).map_err(|e| format!("Cannot open file: {e}"))?;
        let locked = lock_bytes(&pdf, &options)?;
        let out = output_path(&input, out_dir.as_deref().map(Path::new));
        // Write to a temp file first so a failure never leaves a half-written PDF.
        let tmp = out.with_extension("pdf.part");
        std::fs::write(&tmp, locked).map_err(|e| format!("Cannot save file: {e}"))?;
        std::fs::rename(&tmp, &out).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            format!("Cannot save file: {e}")
        })?;
        Ok(out.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![lock_pdf])
        .run(tauri::generate_context!())
        .expect("error while running Chojema PDFLock");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_pdf() -> Vec<u8> {
        let doc = QPdf::empty();
        doc.writer().write_to_memory().unwrap()
    }

    fn opts(open: &str, perm: &str) -> LockOptions {
        LockOptions {
            open_password: open.into(),
            permission_password: perm.into(),
            print: "none".into(),
            modify: false,
            extract: false,
            accessibility: true,
            annotate: false,
            fill_forms: true,
            assemble: false,
        }
    }

    #[test]
    fn open_password_required_to_read() {
        let out = lock_bytes(&sample_pdf(), &opts("open123", "owner456")).unwrap();
        assert!(QPdf::read_from_memory(&out).is_err());
        assert!(QPdf::read_from_memory_encrypted(&out, "wrong").is_err());
        assert!(QPdf::read_from_memory_encrypted(&out, "open123").unwrap().is_encrypted());
        assert!(QPdf::read_from_memory_encrypted(&out, "owner456").is_ok());
    }

    #[test]
    fn permission_only_opens_without_password_but_is_encrypted() {
        let out = lock_bytes(&sample_pdf(), &opts("", "owner456")).unwrap();
        assert!(QPdf::read_from_memory(&out).unwrap().is_encrypted());
        assert!(String::from_utf8_lossy(&out).contains("/V 5"), "expected AES-256 (V5/R6)");
    }

    /// Reads the /P permission integer from the (unencrypted) encryption dictionary.
    fn p_flags(pdf: &[u8]) -> i32 {
        let s = String::from_utf8_lossy(pdf);
        let at = s.find("/P ").expect("/P entry");
        let num: String = s[at + 3..].chars().take_while(|c| *c == '-' || c.is_ascii_digit()).collect();
        num.parse().unwrap()
    }

    #[test]
    fn permission_flags_match_options() {
        let bit = |p: i32, n: u32| p & (1 << (n - 1)) != 0;
        let p = p_flags(&lock_bytes(&sample_pdf(), &opts("", "owner")).unwrap());
        // print none, modify/extract/annotate/assemble off, accessibility + form filling on
        for off in [3, 4, 5, 6, 11, 12] { assert!(!bit(p, off), "bit {off} should be off: {p:b}"); }
        for on in [9, 10] { assert!(bit(p, on), "bit {on} should be on: {p:b}"); }

        let mut o = opts("", "owner");
        (o.print, o.modify, o.extract, o.annotate, o.assemble) = ("low".into(), true, true, true, true);
        let p = p_flags(&lock_bytes(&sample_pdf(), &o).unwrap());
        for on in [3, 4, 5, 6, 9, 10, 11] { assert!(bit(p, on), "bit {on} should be on: {p:b}"); }
        assert!(!bit(p, 12), "low-res print must not allow high quality");

        // No permissions password: everything allowed regardless of checkboxes.
        let p = p_flags(&lock_bytes(&sample_pdf(), &opts("open", "")).unwrap());
        for on in [3, 4, 5, 6, 9, 10, 11, 12] { assert!(bit(p, on), "bit {on} should be on: {p:b}"); }
    }

    #[test]
    fn rejects_invalid_input() {
        assert!(lock_bytes(&sample_pdf(), &opts("", "")).is_err());
        assert!(lock_bytes(&sample_pdf(), &opts("same", "same")).is_err());
        assert!(lock_bytes(b"not a pdf", &opts("a", "b")).is_err());
        let locked = lock_bytes(&sample_pdf(), &opts("", "owner")).unwrap();
        assert_eq!(lock_bytes(&locked, &opts("a", "b")).unwrap_err(), "Already password-protected");
    }

    #[test]
    fn output_name_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("pdflock-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("doc.pdf");
        assert_eq!(output_path(&input, None), dir.join("doc_locked.pdf"));
        std::fs::write(dir.join("doc_locked.pdf"), b"x").unwrap();
        assert_eq!(output_path(&input, None), dir.join("doc_locked (2).pdf"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
