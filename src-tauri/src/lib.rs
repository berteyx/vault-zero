#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use argon2::{Argon2, Params, Version};
use hkdf::Hkdf;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use zeroize::Zeroizing;

const MAGIC: &[u8; 8] = b"VZERO\x01\x00\x00";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const BINDING_DIGEST_LEN: usize = 32;

#[derive(Debug, Error)]
enum VaultError {
    #[error("password or hardware binding is invalid")]
    Authentication,
    #[error("vault format is invalid")]
    InvalidFormat,
    #[error("hardware binding unavailable on this machine")]
    HardwareUnavailable,
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("cryptographic operation failed")]
    Crypto,
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultPayload { pub version: u8, pub entries: Vec<VaultEntry> }

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultEntry { pub category: String, pub name: String, pub fields: serde_json::Value }

fn hardware_binding() -> Result<Vec<u8>, VaultError> {
    #[cfg(target_os = "linux")]
    { return fs::read_to_string("/etc/machine-id").map(|id| id.trim().as_bytes().to_vec()).map_err(|_| VaultError::HardwareUnavailable); }
    #[cfg(target_os = "macos")]
    { return command_output("ioreg", &["-rd1", "-c", "IOPlatformExpertDevice"]).and_then(|output| output.split("IOPlatformUUID").nth(1).map(|part| part.as_bytes().to_vec()).ok_or(VaultError::HardwareUnavailable)); }
    #[cfg(target_os = "windows")]
    { return command_output("powershell", &["-NoProfile", "-Command", "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid"]).map(|id| id.trim().as_bytes().to_vec()).map_err(|_| VaultError::HardwareUnavailable); }
    #[allow(unreachable_code)] Err(VaultError::HardwareUnavailable)
}

fn command_output(program: &str, args: &[&str]) -> Result<String, VaultError> {
    let output = Command::new(program).args(args).output().map_err(|_| VaultError::HardwareUnavailable)?;
    if !output.status.success() { return Err(VaultError::HardwareUnavailable); }
    String::from_utf8(output.stdout).map_err(|_| VaultError::HardwareUnavailable)
}

fn derive_key(password: &str, salt: &[u8], binding: &[u8]) -> Result<Zeroizing<[u8; 32]>, VaultError> {
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| VaultError::Crypto)?;
    let mut password_key = Zeroizing::new([0u8; 32]);
    Argon2::new(Argon2::default().algorithm(), Version::V0x13, params).hash_password_into(password.as_bytes(), salt, password_key.as_mut()).map_err(|_| VaultError::Crypto)?;
    let mut key = Zeroizing::new([0u8; 32]);
    Hkdf::<Sha256>::new(Some(binding), &*password_key).expand(b"vault-zero/aes-256-gcm/v1", key.as_mut()).map_err(|_| VaultError::Crypto)?;
    Ok(key)
}

fn encrypt(password: &str, payload: &VaultPayload) -> Result<Vec<u8>, VaultError> {
    let binding = hardware_binding()?;
    let mut salt = [0u8; SALT_LEN]; let mut nonce = [0u8; NONCE_LEN]; OsRng.fill_bytes(&mut salt); OsRng.fill_bytes(&mut nonce);
    let key = derive_key(password, &salt, &binding)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| VaultError::Crypto)?;
    let plaintext = serde_json::to_vec(payload)?;
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), plaintext.as_ref()).map_err(|_| VaultError::Crypto)?;
    let binding_digest = Sha256::digest(&binding);
    let mut output = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + BINDING_DIGEST_LEN + ciphertext.len());
    output.extend_from_slice(MAGIC); output.extend_from_slice(&salt); output.extend_from_slice(&nonce); output.extend_from_slice(&binding_digest); output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt(password: &str, data: &[u8]) -> Result<VaultPayload, VaultError> {
    if data.len() < MAGIC.len() + SALT_LEN + NONCE_LEN + BINDING_DIGEST_LEN || &data[..MAGIC.len()] != MAGIC { return Err(VaultError::InvalidFormat); }
    let binding = hardware_binding()?; let offset = MAGIC.len();
    let salt = &data[offset..offset + SALT_LEN]; let nonce_start = offset + SALT_LEN; let nonce = &data[nonce_start..nonce_start + NONCE_LEN];
    let digest_start = nonce_start + NONCE_LEN; let expected = Sha256::digest(&binding);
    if data[digest_start..digest_start + BINDING_DIGEST_LEN] != expected[..] { return Err(VaultError::Authentication); }
    let ciphertext = &data[digest_start + BINDING_DIGEST_LEN..]; let key = derive_key(password, salt, &binding)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| VaultError::Crypto)?;
    let plaintext = cipher.decrypt(Nonce::from_slice(nonce), ciphertext).map_err(|_| VaultError::Authentication)?;
    serde_json::from_slice(&plaintext).map_err(VaultError::Json)
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, VaultError> { let directory = app.path().app_data_dir().map_err(|_| VaultError::HardwareUnavailable)?; fs::create_dir_all(&directory)?; Ok(directory.join("vault.enc")) }

#[tauri::command]
fn save_vault(app: AppHandle, password: String, payload: VaultPayload) -> Result<(), String> { encrypt(&password, &payload).and_then(|data| fs::write(vault_path(&app)?, data).map_err(VaultError::Io)).map_err(|error| error.to_string()) }

#[tauri::command]
fn load_vault(app: AppHandle, password: String) -> Result<VaultPayload, String> { fs::read(vault_path(&app)?).map_err(VaultError::Io).and_then(|data| decrypt(&password, &data)).map_err(|error| error.to_string()) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { tauri::Builder::default().invoke_handler(tauri::generate_handler![save_vault, load_vault]).run(tauri::generate_context!()).expect("error while running Vault Zero"); }