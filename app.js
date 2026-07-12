/**
 * =================================================================
 * app.js
 * Familien Einkauf – Frontend-Logik (Vanilla JavaScript)
 * =================================================================
 * Kein Framework, keine Abhängigkeiten. Kommuniziert ausschließlich
 * mit dem Cloudflare Worker unter API_BASE_URL.
 * =================================================================
 */

/* -----------------------------------------------------------------
 * Konfiguration
 * -----------------------------------------------------------------
 * WICHTIG: Hier die eigene Worker-URL eintragen, z.B.
 *   "https://api.deine-domain.de"
 * oder während der Entwicklung die *.workers.dev-URL.
 * Kein Slash am Ende!
 * --------------------------------------------------------------- */
const API_BASE_URL = "https://family-shopping-api.DEIN-SUBDOMAIN.workers.dev";

// Wie oft die Liste automatisch neu geladen wird (Millisekunden).
const AUTO_REFRESH_INTERVAL_MS = 15000;

// Key für das Speichern des eigenen Namens im Browser.
const CREATOR_STORAGE_KEY = "familyshop_creator_name";

const CATEGORY_LABELS = {
  lebensmittel: "🥦 Lebensmittel",
  getraenke: "🥤 Getränke",
  haushalt: "🧽 Haushalt",
  sonstiges: "📦 Sonstiges",
};

const PRIORITY_LABELS = {
  hoch: "🔴 Hoch",
  mittel: "🟡 Mittel",
  niedrig: "🟢 Niedrig",
};

/* -----------------------------------------------------------------
 * Zustand
 * --------------------------------------------------------------- */
let allItems = [];
let activeCategory = "alle";
let selectedPriority = "mittel";
let selectedCategory = "lebensmittel";
let refreshTimer = null;

/* -----------------------------------------------------------------
 * DOM-Referenzen
 * --------------------------------------------------------------- */
const itemListEl = document.getElementById("item-list");
const emptyStateEl = document.getElementById("empty-state");
const loadingStateEl = document.getElementById("loading-state");

const statOpenEl = document.getElementById("stat-open");
const statUrgentEl = document.getElementById("stat-urgent");
const statLatestEl = document.getElementById("stat-latest");

const filterBarEl = document.getElementById("filter-bar");

const fabButton = document.getElementById("open-add-form");
const sheetEl = document.getElementById("add-sheet");
const sheetOverlayEl = document.getElementById("sheet-overlay");
const cancelAddBtn = document.getElementById("cancel-add");
const addFormEl = document.getElementById("add-form");
const inputNameEl = document.getElementById("input-name");
const inputCreatorEl = document.getElementById("input-name-creator");

const toastEl = document.getElementById("toast");

/* -----------------------------------------------------------------
 * Initialisierung
 * --------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", init);

function init() {
  restoreCreatorName();
  attachEventListeners();
  loadItems();
  startAutoRefresh();
}

function attachEventListeners() {
  // Filterleiste
  filterBarEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".filter-chip");
    if (!chip) return;
    activeCategory = chip.dataset.category;
    updateActiveChip();
    renderItems();
  });

  // Sheet öffnen/schließen
  fabButton.addEventListener("click", openSheet);
  cancelAddBtn.addEventListener("click", closeSheet);
  sheetOverlayEl.addEventListener("click", closeSheet);

  // Segmented Controls im Formular (Priorität & Kategorie)
  addFormEl.querySelectorAll(".segmented").forEach((group) => {
    group.addEventListener("click", (event) => {
      const option = event.target.closest(".segmented-option");
      if (!option) return;

      group.querySelectorAll(".segmented-option").forEach((el) =>
        el.classList.remove("is-active")
      );
      option.classList.add("is-active");

      if (option.dataset.priority) selectedPriority = option.dataset.priority;
      if (option.dataset.category) selectedCategory = option.dataset.category;
    });
  });

  // Formular absenden
  addFormEl.addEventListener("submit", handleAddItem);

  // Liste neu laden, sobald der Tab wieder aktiv ist
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadItems();
  });
}

/* -----------------------------------------------------------------
 * API-Kommunikation
 * --------------------------------------------------------------- */

async function loadItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Liste konnte nicht geladen werden.");

    const data = await response.json();
    allItems = data.items || [];
    renderDashboard();
    renderItems();
    loadingStateEl.hidden = true;
  } catch (error) {
    console.error(error);
    loadingStateEl.textContent =
      "Liste konnte nicht geladen werden. Bitte Verbindung prüfen.";
    showToast("Verbindung zum Server fehlgeschlagen.", true);
  }
}

async function addItem({ name, priority, category, createdBy }) {
  const response = await fetch(`${API_BASE_URL}/api/items`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      priority,
      category,
      created_by: createdBy,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Artikel konnte nicht hinzugefügt werden.");
  }

  return response.json();
}

async function setItemCompleted(id, completed) {
  const response = await fetch(`${API_BASE_URL}/api/items/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });

  if (!response.ok) throw new Error("Status konnte nicht geändert werden.");
  return response.json();
}

async function deleteItemApi(id) {
  const response = await fetch(`${API_BASE_URL}/api/items/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) throw new Error("Artikel konnte nicht gelöscht werden.");
  return response.json();
}

/* -----------------------------------------------------------------
 * Rendering: Dashboard
 * --------------------------------------------------------------- */

function renderDashboard() {
  const openItems = allItems.filter((item) => !item.completed);
  const urgentItems = openItems.filter((item) => item.priority === "hoch");

  statOpenEl.textContent = openItems.length;
  statUrgentEl.textContent = urgentItems.length;

  if (allItems.length === 0) {
    statLatestEl.textContent = "–";
  } else {
    const latest = [...allItems].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];
    statLatestEl.textContent = latest.name;
    statLatestEl.title = latest.name;
  }
}

/* -----------------------------------------------------------------
 * Rendering: Liste
 * --------------------------------------------------------------- */

function renderItems() {
  const filtered =
    activeCategory === "alle"
      ? allItems
      : allItems.filter((item) => item.category === activeCategory);

  itemListEl.innerHTML = "";

  if (filtered.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  filtered.forEach((item) => {
    itemListEl.appendChild(buildItemCard(item));
  });
}

function buildItemCard(item) {
  const li = document.createElement("li");
  li.className = `item-card${item.completed ? " is-completed" : ""}`;
  li.dataset.id = item.id;
  li.dataset.priority = item.priority;

  const checkBtn = document.createElement("button");
  checkBtn.className = "item-check";
  checkBtn.type = "button";
  checkBtn.innerHTML = "✓";
  checkBtn.setAttribute(
    "aria-label",
    item.completed ? "Als offen markieren" : "Als erledigt markieren"
  );
  checkBtn.addEventListener("click", () => toggleItem(item));

  const body = document.createElement("div");
  body.className = "item-body";

  const nameEl = document.createElement("span");
  nameEl.className = "item-name";
  nameEl.textContent = item.name;

  const metaEl = document.createElement("div");
  metaEl.className = "item-meta";
  metaEl.innerHTML = `
    <span>${PRIORITY_LABELS[item.priority] || item.priority}</span>
    <span class="dot">·</span>
    <span>${CATEGORY_LABELS[item.category] || item.category}</span>
    <span class="dot">·</span>
    <span>von ${escapeHtml(item.created_by)}</span>
  `;

  body.appendChild(nameEl);
  body.appendChild(metaEl);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "item-delete";
  deleteBtn.type = "button";
  deleteBtn.innerHTML = "🗑";
  deleteBtn.setAttribute("aria-label", `${item.name} löschen`);
  deleteBtn.addEventListener("click", () => removeItem(item, li));

  li.appendChild(checkBtn);
  li.appendChild(body);
  li.appendChild(deleteBtn);

  return li;
}

function updateActiveChip() {
  filterBarEl.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.category === activeCategory);
  });
}

/* -----------------------------------------------------------------
 * Aktionen: Hinzufügen, Abhaken, Löschen
 * --------------------------------------------------------------- */

async function handleAddItem(event) {
  event.preventDefault();

  const name = inputNameEl.value.trim();
  const creatorName = inputCreatorEl.value.trim();

  if (!name) return;

  // Namen für nächstes Mal merken.
  if (creatorName) {
    localStorage.setItem(CREATOR_STORAGE_KEY, creatorName);
  }

  const submitBtn = addFormEl.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const { item } = await addItem({
      name,
      priority: selectedPriority,
      category: selectedCategory,
      createdBy: creatorName,
    });

    // Optimistisch direkt in die lokale Liste einfügen, damit die
    // Animation sofort greift, statt auf den nächsten Poll zu warten.
    allItems.unshift(item);
    renderDashboard();
    renderItems();

    closeSheet();
    addFormEl.reset();
    inputCreatorEl.value = creatorName;
    showToast(`„${item.name}" wurde hinzugefügt.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Hinzufügen fehlgeschlagen.", true);
  } finally {
    submitBtn.disabled = false;
  }
}

async function toggleItem(item) {
  const newStatus = !item.completed;

  // Optimistisches UI-Update für sofortiges Feedback.
  item.completed = newStatus ? 1 : 0;
  renderDashboard();
  renderItems();

  try {
    await setItemCompleted(item.id, newStatus);
  } catch (error) {
    console.error(error);
    // Bei Fehler zurückrollen.
    item.completed = newStatus ? 0 : 1;
    renderDashboard();
    renderItems();
    showToast("Status konnte nicht gespeichert werden.", true);
  }
}

async function removeItem(item, cardEl) {
  // Erst die Entfernen-Animation abspielen, dann aus der API löschen.
  cardEl.classList.add("is-removing");

  try {
    await deleteItemApi(item.id);
    setTimeout(() => {
      allItems = allItems.filter((i) => i.id !== item.id);
      renderDashboard();
      renderItems();
    }, 260);
  } catch (error) {
    console.error(error);
    cardEl.classList.remove("is-removing");
    showToast("Löschen fehlgeschlagen.", true);
  }
}

/* -----------------------------------------------------------------
 * Bottom-Sheet Steuerung
 * --------------------------------------------------------------- */

function openSheet() {
  sheetOverlayEl.hidden = false;
  sheetEl.hidden = false;
  inputNameEl.focus();
}

function closeSheet() {
  sheetOverlayEl.hidden = true;
  sheetEl.hidden = true;
}

/* -----------------------------------------------------------------
 * Hilfsfunktionen
 * --------------------------------------------------------------- */

function restoreCreatorName() {
  const savedName = localStorage.getItem(CREATOR_STORAGE_KEY);
  if (savedName) {
    inputCreatorEl.value = savedName;
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadItems, AUTO_REFRESH_INTERVAL_MS);
}

let toastTimeout = null;
function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle("toast--error", isError);
  toastEl.hidden = false;

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
