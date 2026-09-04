import { signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, googleProvider, githubProvider, microsoftProvider } from "./firebase-config.js";

const MAX_FREE_USES = 3;
const usageKey = "usage_count";
const categories = { all: "all", cards: "cards", banks: "banks", passwords: "passwords", notes: "notes" };
const items = [
  { name: "Visa personale", category: "cards", type: "Carta", meta: "•••• 4421", secret: "1234" },
  { name: "American Express", category: "cards", type: "Carta", meta: "•••• 9012", secret: "9876" },
  { name: "Conto principale", category: "banks", type: "Banca", meta: "IT60 X054 2811", secret: "IBAN-DEMO-123" },
  { name: "AWS Production", category: "passwords", type: "Server", meta: "console.aws.amazon.com", secret: "VZ-demo-Secret-98!" },
  { name: "GitHub Enterprise", category: "passwords", type: "Accesso", meta: "github.com/vault-zero", secret: "VZ-GitHub-42!" },
  { name: "Passaporto", category: "notes", type: "Documento", meta: "Scade 09/2029", secret: "Documento protetto" },
];
let activeCategory = categories.all;
let toastTimer;
const $ = (selector) => document.querySelector(selector);
const usageCount = () => Number.parseInt(localStorage.getItem(usageKey) || "0", 10);
const isAuthenticated = () => Boolean(auth.currentUser);

function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2400); }
function renderItems(query = "") {
  const normalized = query.trim().toLowerCase();
  const visible = items.filter((item) => (activeCategory === "all" || item.category === activeCategory) && (!normalized || `${item.name} ${item.type} ${item.meta}`.toLowerCase().includes(normalized)));
  $("#items").innerHTML = visible.map((item, index) => `<article class="vault-item" style="animation-delay:${index * 35}ms"><div class="item-top"><span class="item-icon">${item.category === "cards" ? "▣" : item.category === "banks" ? "⌁" : item.category === "passwords" ? "⌘" : "□"}</span><span class="item-type">${item.type}</span></div><div><div class="item-name">${item.name}</div><div class="item-meta">${item.meta}</div></div><div class="item-bottom"><span class="item-meta">Aggiornato oggi</span><button class="copy-button" data-secret="${encodeURIComponent(item.secret)}" type="button">Copia</button></div></article>`).join("");
  $("#empty-state").hidden = visible.length > 0;
}
function openLimitModal() { $("#limit-modal").hidden = false; $("#auth-error").textContent = ""; }
function closeLimitModal() { $("#limit-modal").hidden = true; }
function registerUsage() { const next = usageCount() + 1; localStorage.setItem(usageKey, String(next)); if (next >= MAX_FREE_USES && !isAuthenticated()) openLimitModal(); return next; }
function detectPlatform() { const ua = navigator.userAgent.toLowerCase(); const platform = navigator.platform.toLowerCase(); if (ua.includes("windows") || platform.includes("win")) return { label: "Windows", ext: ".exe" }; if (ua.includes("mac") || platform.includes("mac")) return { label: "macOS", ext: ".dmg" }; return { label: "Linux", ext: ".AppImage" }; }
function setupDownload() { const os = detectPlatform(); $("#primary-download").textContent = `Scarica per ${os.label} (${os.ext})`; }
async function login(provider) { $("#auth-error").textContent = ""; try { await signInWithPopup(auth, provider); closeLimitModal(); showToast("Accesso completato. Vault sbloccato."); } catch (error) { $("#auth-error").textContent = error.code === "auth/popup-closed-by-user" ? "Accesso annullato." : "Configura Firebase e i domini autorizzati per abilitare questo provider."; } }
function randomPassword() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"; return Array.from(crypto.getRandomValues(new Uint32Array(22)), (value) => chars[value % chars.length]).join(""); }

$("#search").addEventListener("input", (event) => renderItems(event.target.value));
$("#category-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; document.querySelectorAll(".category").forEach((element) => element.classList.toggle("active", element === button)); activeCategory = button.dataset.category; renderItems($("#search").value); });
$("#items").addEventListener("click", async (event) => { const button = event.target.closest("[data-secret]"); if (!button) return; await navigator.clipboard.writeText(decodeURIComponent(button.dataset.secret)); showToast("Copiato. Appunti puliti tra 15 secondi."); setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 15000); });
$("#new-item").addEventListener("click", () => { if (!isAuthenticated() && usageCount() >= MAX_FREE_USES) return openLimitModal(); registerUsage(); showToast("Nuovo elemento pronto per essere salvato."); });
$("#generate-password").addEventListener("click", () => { if (!isAuthenticated() && usageCount() >= MAX_FREE_USES) return openLimitModal(); registerUsage(); navigator.clipboard.writeText(randomPassword()).then(() => showToast("Password generata e copiata. Scade tra 15 secondi.")); });
$("#open-lock").addEventListener("click", () => { closeLimitModal(); showToast("Vault bloccato."); });
$("#alternate-download").addEventListener("click", () => { const menu = $("#download-menu"); menu.hidden = !menu.hidden; });
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeLimitModal));
document.querySelectorAll("[data-provider]").forEach((button) => button.addEventListener("click", () => login({ google: googleProvider, github: githubProvider, microsoft: microsoftProvider }[button.dataset.provider])));
onAuthStateChanged(auth, (user) => { $("#auth-status").textContent = user ? `Connesso: ${user.displayName || user.email}` : "Modalita demo"; });
setupDownload(); renderItems();
