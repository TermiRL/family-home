-- ============================================================
-- schema.sql
-- Datenbankschema für die Familien-Einkaufsliste (Cloudflare D1)
-- ============================================================
-- Anwenden mit:
--   npx wrangler d1 execute family-shopping-db --file=./database/schema.sql
--   (für die Produktions-DB zusätzlich --remote anhängen)
-- ============================================================

-- Alte Tabelle nur entfernen, wenn bewusst ein Reset gewünscht ist.
-- DROP TABLE IF EXISTS shopping_items;

CREATE TABLE IF NOT EXISTS shopping_items (
    -- Eindeutige, automatisch vergebene ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Name des Artikels, z.B. "Milch"
    name TEXT NOT NULL,

    -- Priorität: hoch (rot), mittel (gelb), niedrig (grün)
    priority TEXT NOT NULL DEFAULT 'mittel'
        CHECK (priority IN ('hoch', 'mittel', 'niedrig')),

    -- Kategorie des Artikels
    category TEXT NOT NULL DEFAULT 'sonstiges'
        CHECK (category IN ('lebensmittel', 'getraenke', 'haushalt', 'sonstiges')),

    -- Wer den Artikel angelegt hat (Name oder E-Mail aus Cloudflare Access)
    created_by TEXT NOT NULL,

    -- Status: 0 = offen, 1 = erledigt
    completed INTEGER NOT NULL DEFAULT 0
        CHECK (completed IN (0, 1)),

    -- Erstellungszeitpunkt (UTC, ISO 8601)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index beschleunigt das Filtern nach offenen/erledigten Artikeln,
-- was bei jedem Laden des Dashboards passiert.
CREATE INDEX IF NOT EXISTS idx_shopping_items_completed
    ON shopping_items (completed);

-- Index beschleunigt das Sortieren nach Priorität (dringende Artikel zuerst).
CREATE INDEX IF NOT EXISTS idx_shopping_items_priority
    ON shopping_items (priority);

-- Optional: ein paar Beispieleinträge zum Testen.
-- Vor dem produktiven Einsatz einfach entfernen oder auskommentieren.
INSERT INTO shopping_items (name, priority, category, created_by, completed)
VALUES
    ('Milch', 'hoch', 'lebensmittel', 'Mama', 0),
    ('Spülmittel', 'mittel', 'haushalt', 'Papa', 0),
    ('Orangensaft', 'niedrig', 'getraenke', 'Papa', 0);
