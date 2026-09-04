# Vault Zero

Zero-Trust Data & Password Vault: demo web statica, shell desktop Tauri v2 e pipeline GitHub Actions.

## Struttura

```text
web/
	index.html             SPA demo GitHub Pages
	app.js                 UI, limite gratuito, OAuth, OS detection, clipboard
	style.css              interfaccia responsive dark
	firebase-config.js     Firebase JS SDK v10+ e provider OAuth
src-tauri/
	src/main.rs            AES-256-GCM, Argon2id, binding e comandi Tauri
	Cargo.toml             dipendenze Rust
	tauri.conf.json        configurazione bundle v2
.github/workflows/
	deploy-web.yml         deploy Pages a ogni push su main
	build-desktop.yml      build Windows/macOS/Linux
```

## Avvio demo web

1. Copiare i valori Firebase Web App in `web/firebase-config.js`.
2. Abilitare Google, GitHub e Microsoft in Firebase Authentication e aggiungere il dominio GitHub Pages agli Authorized domains.
3. In Vercel impostare `web` come **Root Directory** del progetto, con framework **Other** e senza build command. In alternativa, servire la directory `web` con `python3 -m http.server 8080 --directory web`, poi aprire `http://localhost:8080`.

La demo salva solo dati fittizi nel browser. `usage_count` viene incrementato quando si crea un elemento o si genera una password; al quarto utilizzo non autenticato apre il paywall. I placeholder Firebase non sono segreti, ma non vanno committate service account key.

## Build desktop

Prerequisiti: Rust stable, Node.js, il prerequisito Tauri v2 per il sistema operativo e `cargo install tauri-cli --version '^2'`.

```bash
cargo tauri dev
cargo tauri build --bundles nsis,msi       # Windows
cargo tauri build --bundles app,dmg        # macOS
cargo tauri build --bundles appimage,deb   # Linux
```

Il file locale viene scritto nell’application data directory come `vault.enc`. Il formato contiene magic/versione, salt Argon2id, nonce GCM e digest del binding prima del ciphertext. Una password errata o un binding diverso impediscono la decifratura; il clipboard della demo viene pulito dopo 15 secondi.

### Nota di sicurezza importante

Il provider incluso usa l’identità stabile del sistema (`/etc/machine-id`, `IOPlatformUUID` o `MachineGuid`) per rendere il progetto compilabile su tutti i target. Questo è un binding software, non una prova di possesso di TPM 2.0/Secure Enclave. Prima di distribuire dati ad alto rischio bisogna sostituire `hardware_binding()` con adapter nativi attestati: NCrypt/TPM su Windows, Keychain/Secure Enclave su macOS e Secret Service/TPM2 su Linux. Le API Tauri sono già isolate dietro questa funzione, così l’integrazione non modifica il formato o i comandi UI.

## CI/CD

`deploy-web.yml` pubblica `web/` su GitHub Pages. `build-desktop.yml` crea bundle `.exe`/`.msi`, `.app`/`.dmg` e `.AppImage`/`.deb` su runner nativi. In repository Settings > Pages va selezionato **GitHub Actions**. Gli URL release nella demo usano `your-org/vault-zero`: sostituirli con il repository reale prima del deploy.
