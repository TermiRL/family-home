/**
 * =============================================================
 * worker/index.js
 * Cloudflare Worker – API für die Familien-Einkaufsliste
 * =============================================================
 *
 * Endpunkte:
 *   GET    /api/items       -> alle Einkaufseinträge abrufen
 *   POST   /api/items       -> neuen Eintrag erstellen
 *   PATCH  /api/items/:id   -> Status (offen/erledigt) ändern
 *   DELETE /api/items/:id   -> Eintrag löschen
 *
 * Sicherheit:
 *   - Der eigentliche Zugriffsschutz erfolgt über Cloudflare Access
 *     (siehe README). Dieser Worker geht davon aus, dass Access
 *     bereits davor geschaltet ist und nur autorisierte Personen
 *     überhaupt bis hierhin kommen.
 *   - Ist die Route von Access geschützt, sendet Cloudflare bei
 *     jedem Request automatisch den Header
 *     "Cf-Access-Authenticated-User-Email" mit. Diesen nutzen wir,
 *     um "created_by" automatisch zu befüllen, falls das Frontend
 *     keinen Namen mitschickt.
 *   - Es werden keinerlei Zugangsdaten oder Secrets im Code
 *     gespeichert. ALLOWED_ORIGIN kommt aus einer Umgebungsvariable
 *     (siehe wrangler.toml).
 * =============================================================
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS-Header für jede Antwort vorbereiten. ALLOWED_ORIGIN wird
    // in wrangler.toml (Variable) bzw. im Cloudflare Dashboard gesetzt,
    // z.B. "https://einkauf.meine-domain.de".
    const corsHeaders = buildCorsHeaders(env.ALLOWED_ORIGIN);

    // Preflight-Request des Browsers (CORS) direkt beantworten.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Nur Pfade unterhalb von /api/items werden bedient.
      if (url.pathname === "/api/items" && request.method === "GET") {
        return await getItems(env, corsHeaders);
      }

      if (url.pathname === "/api/items" && request.method === "POST") {
        return await createItem(request, env, corsHeaders);
      }

      // /api/items/123 -> id = "123"
      const itemMatch = url.pathname.match(/^\/api\/items\/(\d+)$/);
      if (itemMatch && request.method === "PATCH") {
        return await updateItem(itemMatch[1], request, env, corsHeaders);
      }

      if (itemMatch && request.method === "DELETE") {
        return await deleteItem(itemMatch[1], env, corsHeaders);
      }

      return jsonResponse({ error: "Route nicht gefunden." }, 404, corsHeaders);
    } catch (error) {
      // Nie interne Details/Stacktraces nach außen geben.
      console.error("Unerwarteter Fehler:", error);
      return jsonResponse(
        { error: "Interner Serverfehler." },
        500,
        corsHeaders
      );
    }
  },
};

/* ---------------------------------------------------------------
 * Handler-Funktionen
 * --------------------------------------------------------------- */

/** Alle Artikel abrufen, offene zuerst, danach nach Priorität und Datum sortiert. */
async function getItems(env, corsHeaders) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, priority, category, created_by, completed, created_at
     FROM shopping_items
     ORDER BY
       completed ASC,
       CASE priority
         WHEN 'hoch' THEN 0
         WHEN 'mittel' THEN 1
         WHEN 'niedrig' THEN 2
       END ASC,
       created_at DESC`
  ).all();

  return jsonResponse({ items: results }, 200, corsHeaders);
}

/** Neuen Artikel anlegen. */
async function createItem(request, env, corsHeaders) {
  const body = await safeParseJson(request);
  if (!body) {
    return jsonResponse({ error: "Ungültiges JSON im Request-Body." }, 400, corsHeaders);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const priority = ["hoch", "mittel", "niedrig"].includes(body.priority)
    ? body.priority
    : "mittel";
  const category = ["lebensmittel", "getraenke", "haushalt", "sonstiges"].includes(
    body.category
  )
    ? body.category
    : "sonstiges";

  // created_by bevorzugt aus Cloudflare Access, sonst aus dem Request-Body.
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  const createdBy =
    accessEmail || (typeof body.created_by === "string" ? body.created_by.trim() : "");

  if (!name) {
    return jsonResponse({ error: "Der Artikelname darf nicht leer sein." }, 400, corsHeaders);
  }
  if (!createdBy) {
    return jsonResponse({ error: "Es konnte kein Ersteller ermittelt werden." }, 400, corsHeaders);
  }

  const result = await env.DB.prepare(
    `INSERT INTO shopping_items (name, priority, category, created_by, completed)
     VALUES (?, ?, ?, ?, 0)
     RETURNING id, name, priority, category, created_by, completed, created_at`
  )
    .bind(name, priority, category, createdBy)
    .first();

  return jsonResponse({ item: result }, 201, corsHeaders);
}

/** Status (offen/erledigt) eines Artikels ändern. */
async function updateItem(id, request, env, corsHeaders) {
  const body = await safeParseJson(request);
  if (!body || typeof body.completed === "undefined") {
    return jsonResponse(
      { error: "Feld 'completed' (true/false) wird benötigt." },
      400,
      corsHeaders
    );
  }

  const completed = body.completed ? 1 : 0;

  const result = await env.DB.prepare(
    `UPDATE shopping_items SET completed = ? WHERE id = ?
     RETURNING id, name, priority, category, created_by, completed, created_at`
  )
    .bind(completed, id)
    .first();

  if (!result) {
    return jsonResponse({ error: "Artikel nicht gefunden." }, 404, corsHeaders);
  }

  return jsonResponse({ item: result }, 200, corsHeaders);
}

/** Artikel löschen. */
async function deleteItem(id, env, corsHeaders) {
  const result = await env.DB.prepare(
    `DELETE FROM shopping_items WHERE id = ? RETURNING id`
  )
    .bind(id)
    .first();

  if (!result) {
    return jsonResponse({ error: "Artikel nicht gefunden." }, 404, corsHeaders);
  }

  return jsonResponse({ success: true, id: result.id }, 200, corsHeaders);
}

/* ---------------------------------------------------------------
 * Hilfsfunktionen
 * --------------------------------------------------------------- */

/** Baut die CORS-Header. Fällt auf "*" zurück, falls keine Origin konfiguriert ist. */
function buildCorsHeaders(allowedOrigin) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Einheitliche JSON-Antwort mit CORS-Headern. */
function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

/** Request-Body sicher als JSON parsen, ohne bei Fehlern zu crashen. */
async function safeParseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

