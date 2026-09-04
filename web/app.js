import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, googleProvider, githubProvider, microsoftProvider } from "./firebase-config.js";

const MAX_FREE_USES = 3;
const usageKey = "usage_count";
const itemsKey = "vault_zero_items";
const categories = { all: "all", cards: "cards", banks: "banks", passwords: "passwords", notes: "notes" };
let items = JSON.parse(localStorage.getItem(itemsKey) || "[]");
let activeCategory = categories.all;
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const usageCount = () => Number.parseInt(localStorage.getItem(usageKey) || "0", 10);
const isAuthenticated = () => Boolean(auth.currentUser);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));

function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2400); }
function renderItems(query = "") {
  const normalized = query.trim().toLowerCase();
  const visible = items.filter((item) => (activeCategory === "all" || item.category === activeCategory) && (!normalized || `${item.name} ${item.type} ${item.meta}`.toLowerCase().includes(normalized)));
  $("#items").innerHTML = visible.map((item, index) => `<article class="vault-item" style="animation-delay:${index * 35}ms"><div class="item-top"><span class="item-icon">${item.category === "cards" ? "▣" : item.category === "banks" ? "⌁" : item.category === "passwords" ? "⌘" : "□"}</span><span class="item-type">${escapeHtml(item.type)}</span></div><div><div class="item-name">${escapeHtml(item.name)}</div><div class="item-meta">${escapeHtml(item.meta)}</div></div><div class="item-bottom"><span class="item-meta">Aggiornato oggi</span><button class="copy-button" data-secret="${encodeURIComponent(item.secret)}" type="button">Copia</button></div></article>`).join("");
  $("#empty-state").hidden = visible.length > 0;
  document.querySelectorAll(".category").forEach((button) => { button.querySelector("b").textContent = button.dataset.category === "all" ? items.length : items.filter((item) => item.category === button.dataset.category).length; });
}
function openLimitModal() { $("#limit-modal").hidden = false; $("#auth-error").textContent = ""; }
function closeLimitModal() { $("#limit-modal").hidden = true; }
function registerUsage() { const next = usageCount() + 1; localStorage.setItem(usageKey, String(next)); if (next >= MAX_FREE_USES && !isAuthenticated()) openLimitModal(); return next; }
function detectPlatform() { const ua = navigator.userAgent.toLowerCase(); const platform = navigator.platform.toLowerCase(); if (ua.includes("windows") || platform.includes("win")) return { label: "Windows", ext: ".exe", href: "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_x64-setup.exe" }; if (ua.includes("mac") || platform.includes("mac")) return { label: "macOS", ext: ".dmg", href: "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_x64.dmg" }; return { label: "Linux", ext: ".AppImage", href: "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_amd64.AppImage" }; }
function setupDownload() { const os = detectPlatform(); const primary = $("#primary-download"); primary.textContent = `Scarica per ${os.label} (${os.ext})`; primary.href = os.href; $("#download-menu a:nth-child(1)").href = "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_x64-setup.exe"; $("#download-menu a:nth-child(2)").href = "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_x64.dmg"; $("#download-menu a:nth-child(3)").href = "https://github.com/berteyx/vault-zero/releases/latest/download/Vault.Zero_0.1.0_amd64.AppImage"; }
async function login(provider) { $("#auth-error").textContent = ""; try { await signInWithPopup(auth, provider); closeLimitModal(); showToast("Accesso completato. Vault sbloccato."); } catch (error) { $("#auth-error").textContent = error.code === "auth/popup-closed-by-user" ? "Accesso annullato." : "Configura Firebase e i domini autorizzati per abilitare questo provider."; } }
function randomPassword() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"; return Array.from(crypto.getRandomValues(new Uint32Array(22)), (value) => chars[value % chars.length]).join(""); }
function openCreateModal() { $("#create-modal").hidden = false; $("#create-error").textContent = ""; updateDynamicFields(); $("#item-category").focus(); }
function closeCreateModal() { $("#create-modal").hidden = true; }
function updateDynamicFields() { const fields = { cards: [["number", "Numero carta", "text"], ["expiry", "Scadenza", "text"], ["cvv", "CVV", "password"], ["pin", "PIN", "password"]], banks: [["iban", "IBAN", "text"], ["swift", "SWIFT", "text"], ["password", "Password dispositiva", "password"]], passwords: [["url", "URL", "url"], ["username", "Username", "text"], ["password", "Password", "password"]], notes: [["content", "Nota cifrata", "textarea"]] }; const selected = $("#item-category").value; $("#dynamic-fields").innerHTML = fields[selected].map(([name, label, type]) => type === "textarea" ? `<label>${label}<textarea name="${name}" rows="4" required></textarea></label>` : `<label>${label}<input name="${name}" type="${type}" required /></label>`).join(""); }
function saveItem(event) { event.preventDefault(); if (!isAuthenticated() && usageCount() >= MAX_FREE_USES) return openLimitModal(); const formData = new FormData(event.currentTarget); const category = formData.get("category"); const fields = Object.fromEntries(formData.entries()); const name = fields.name.trim(); const values = Object.entries(fields).filter(([key]) => !["category", "name"].includes(key)).map(([, value]) => value).filter(Boolean); const item = { name, category, type: { cards: "Carta", banks: "Banca", passwords: "Accesso", notes: "Nota" }[category], meta: values[0] || "Elemento protetto", secret: values[values.length - 1] || name, fields }; items = [...items, item]; localStorage.setItem(itemsKey, JSON.stringify(items)); registerUsage(); closeCreateModal(); event.currentTarget.reset(); renderItems($("#search").value); showToast("Elemento salvato nella cassaforte."); }

$("#search").addEventListener("input", (event) => renderItems(event.target.value));
$("#category-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; document.querySelectorAll(".category").forEach((element) => element.classList.toggle("active", element === button)); activeCategory = button.dataset.category; renderItems($("#search").value); });
$("#items").addEventListener("click", async (event) => { const button = event.target.closest("[data-secret]"); if (!button) return; await navigator.clipboard.writeText(decodeURIComponent(button.dataset.secret)); showToast("Copiato. Appunti puliti tra 15 secondi."); setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 15000); });
$("#new-item").addEventListener("click", openCreateModal);
$("#empty-new-item").addEventListener("click", openCreateModal);
$("#create-form").addEventListener("submit", saveItem);
$("#item-category").addEventListener("change", updateDynamicFields);
$("#generate-password").addEventListener("click", () => { if (!isAuthenticated() && usageCount() >= MAX_FREE_USES) return openLimitModal(); registerUsage(); navigator.clipboard.writeText(randomPassword()).then(() => showToast("Password generata e copiata. Scade tra 15 secondi.")); });
$("#open-lock").addEventListener("click", () => { closeLimitModal(); showToast("Vault bloccato."); });
$("#alternate-download").addEventListener("click", () => { const menu = $("#download-menu"); menu.hidden = !menu.hidden; });
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeLimitModal));
document.querySelectorAll("[data-close-create]").forEach((button) => button.addEventListener("click", closeCreateModal));
document.addEventListener("keydown", (event) => { if (event.key !== "Escape") return; if (!$("#limit-modal").hidden) closeLimitModal(); if (!$("#create-modal").hidden) closeCreateModal(); });
document.querySelectorAll("[data-provider]").forEach((button) => button.addEventListener("click", () => login({ google: googleProvider, github: githubProvider, microsoft: microsoftProvider }[button.dataset.provider])));
onAuthStateChanged(auth, (user) => { $("#auth-status").textContent = user ? `Connesso: ${user.displayName || user.email}` : "Modalita demo"; });
setupDownload(); renderItems();
