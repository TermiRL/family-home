# 🛒 Familien Einkauf

Eine private, moderne Einkaufsliste für Familie oder WG – gehostet auf Cloudflare
Pages, abgesichert mit Cloudflare Access, mit Cloudflare Worker + D1 als Backend.

- **Frontend:** HTML, CSS, Vanilla JavaScript (kein Framework)
- **Hosting:** Cloudflare Pages
- **Backend:** Cloudflare Worker (REST-API)
- **Datenbank:** Cloudflare D1 (SQLite)
- **Zugriffsschutz:** Cloudflare Access (keine eigene Registrierung/Login-Logik)

```
family-home/
│
├── index.html
├── style.css
├── app.js
│
├── worker/
│   ├── index.js
│   └── wrangler.toml
│
├── database/
│   └── schema.sql
│
└── README.md
```

---

## 0. Voraussetzungen

- Ein Cloudflare-Account (kostenlos ausreichend)
- Eine eigene Domain, die bei Cloudflare als DNS-Zone verwaltet wird
- Node.js (Version 18+) und npm lokal installiert
- Ein GitHub-Account

Wrangler (Cloudflares CLI) global oder projektbezogen installieren:

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` öffnet den Browser und verbindet die CLI mit deinem
Cloudflare-Account. Es werden dabei **keine** Zugangsdaten im Code
gespeichert.

---

## 1. GitHub-Setup

```bash
# Projektordner initialisieren (falls noch nicht geschehen)
cd family-home
git init
git add .
git commit -m "Initial commit: Familien Einkauf"

# Auf GitHub ein neues, privates Repository anlegen (z.B. über die
# Weboberfläche), dann verbinden:
git remote add origin https://github.com/DEIN-USERNAME/family-home.git
git branch -M main
git push -u origin main
```

**Empfehlung:** Repository auf **privat** stellen, da es sich um ein
persönliches Familienprojekt handelt – auch wenn im Code selbst keine
Geheimnisse liegen.

Lege außerdem eine `.gitignore` an, damit keine lokalen Wrangler-Dateien
versehentlich eingecheckt werden:

```
node_modules/
.wrangler/
.dev.vars
```

---

## 2. D1-Datenbank einrichten

```bash
cd worker

# Datenbank anlegen
wrangler d1 create family-shopping-db
```

Die Ausgabe enthält eine `database_id`. Diese in `worker/wrangler.toml`
unter `database_id = "..."` eintragen.

Anschließend das Schema anwenden:

```bash
# Lokal zum Testen
wrangler d1 execute family-shopping-db --file=../database/schema.sql

# In Produktion (auf der echten, in der Cloud laufenden Datenbank)
wrangler d1 execute family-shopping-db --file=../database/schema.sql --remote
```

Optional: die Beispieldaten am Ende von `schema.sql` vor dem produktiven
Einsatz entfernen.

---

## 3. Cloudflare Worker (Backend-API) deployen

In `worker/wrangler.toml`:

1. `database_id` eintragen (siehe Schritt 2)
2. `ALLOWED_ORIGIN` auf die spätere Frontend-Domain setzen, z.B.
   `https://einkauf.deine-domain.de`

Dann deployen:

```bash
cd worker
wrangler deploy
```

Wrangler gibt danach eine URL aus, z.B.
`https://family-shopping-api.DEIN-SUBDOMAIN.workers.dev`.

### Eigene Domain für den Worker (empfohlen)

Damit Cloudflare Access Frontend und Backend mit **derselben Session**
schützen kann, sollten beide unter derselben Domain liegen, z.B.:

- Frontend: `einkauf.deine-domain.de`
- Backend: `api.deine-domain.de`

Dazu in `worker/wrangler.toml` den auskommentierten `routes`-Block
aktivieren und die Subdomain eintragen, dann erneut `wrangler deploy`
ausführen. Cloudflare legt den passenden DNS-Eintrag für Worker-Routes
in der Regel automatisch an; falls nicht, im Dashboard unter
**DNS** einen `CNAME`/`AAAA`-Proxy-Eintrag für `api` ergänzen.

---

## 4. Cloudflare Pages (Frontend) deployen

### Über die Cloudflare-Dashboard-UI (empfohlen für den Start)

1. Cloudflare-Dashboard → **Workers & Pages** → **Create** → **Pages**
2. **Connect to Git** → das GitHub-Repository `family-home` auswählen
3. Build-Einstellungen:
   - **Framework preset:** `None`
   - **Build command:** (leer lassen)
   - **Build output directory:** `/` (Wurzelverzeichnis, da statisches
     HTML/CSS/JS ohne Build-Schritt)
4. **Save and Deploy**

Nach dem ersten Deployment ist die Seite unter einer
`*.pages.dev`-URL erreichbar.

### Alternativ per CLI

```bash
# im Projekt-Wurzelverzeichnis (nicht im worker/-Ordner)
wrangler pages deploy . --project-name=family-home
```

### Wichtig: API-URL im Frontend eintragen

In `app.js` ganz oben:

```js
const API_BASE_URL = "https://api.deine-domain.de";
```

Auf die tatsächliche Worker-Domain aus Schritt 3 anpassen, dann
committen und erneut deployen (bei Git-Integration passiert das
automatisch bei jedem `git push`).

---

## 5. Eigene Domain verbinden

1. Cloudflare-Dashboard → das Pages-Projekt öffnen → **Custom domains**
2. **Set up a custom domain** → z.B. `einkauf.deine-domain.de` eintragen
3. Cloudflare legt den DNS-Eintrag automatisch an, sofern die Domain
   bereits als Zone in diesem Account verwaltet wird

Genauso für den Worker (falls in Schritt 3 nicht bereits erledigt):
**Workers & Pages** → Worker öffnen → **Settings** → **Triggers** →
**Custom Domains** → `api.deine-domain.de` hinzufügen.

---

## 6. Cloudflare Access einrichten (Zugriffsschutz)

Ziel: **Nur namentlich autorisierte Familienmitglieder** kommen auf die
Seite – ganz ohne eigenes Login-System im Code.

1. Cloudflare-Dashboard → **Zero Trust** → **Access** → **Applications**
2. **Add an application** → **Self-hosted**
3. Anwendung 1 (Frontend):
   - **Application domain:** `einkauf.deine-domain.de`
   - **Session duration:** z.B. 30 Tage (angenehm für Familienmitglieder,
     die sich nicht ständig neu einloggen wollen)
4. Policy erstellen, z.B. **"Familie"**:
   - **Action:** Allow
   - **Include:** *Emails* → die E-Mail-Adressen aller Familienmitglieder
     eintragen (jede Zeile eine Adresse)
5. Speichern.
6. Denselben Schritt für die API-Domain wiederholen:
   - **Application domain:** `api.deine-domain.de`
   - **Gleiche Policy** ("Familie") verwenden, damit dieselben Personen
     Zugriff auf Frontend **und** Backend haben.

### Wie sich Familienmitglieder anmelden

Beim ersten Aufruf der Seite fragt Cloudflare Access nach der
E-Mail-Adresse und schickt einen **Einmal-Code (Magic Link)** per Mail
zu – kein Passwort nötig, keine Registrierung. Das ist bewusst so
gewählt, damit auch weniger technikaffine Familienmitglieder ohne
Account-Erstellung auskommen.

Alternativ lassen sich unter **Authentication** auch Login-Methoden wie
Google, GitHub oder ein bestehender Identity-Provider aktivieren, falls
gewünscht.

### Automatische Namenserkennung

Ist die API-Domain durch Access geschützt, sendet Cloudflare bei jedem
Request automatisch den Header `Cf-Access-Authenticated-User-Email`
mit. Der Worker nutzt diesen Header bereits automatisch als
`created_by`, falls kein Name im Formular eingetragen wurde
(siehe `worker/index.js`, Funktion `createItem`).

---

## 7. Lokale Entwicklung

**Worker lokal starten** (nutzt eine lokale D1-Kopie):

```bash
cd worker
wrangler dev
```

**Frontend lokal öffnen:**

Einfach `index.html` in einem lokalen Webserver ausliefern, z.B.:

```bash
npx serve .
```

Während der lokalen Entwicklung `API_BASE_URL` in `app.js` temporär auf
`http://localhost:8787` setzen (Standard-Port von `wrangler dev`).

---

## 8. Sicherheitshinweise

- Es befinden sich **keine Passwörter, API-Keys oder Secrets** im Code.
- `ALLOWED_ORIGIN` in `wrangler.toml` ist eine öffentliche
  Konfigurationsvariable, kein Geheimnis.
- Der eigentliche Zugriffsschutz erfolgt vollständig über **Cloudflare
  Access** auf Netzwerkebene – die App selbst enthält keine
  Login-/Registrierungslogik und muss das auch nicht, da nur
  autorisierter Traffic überhaupt bis zum Worker bzw. zu Pages
  durchgelassen wird.
- Für zukünftige Erweiterungen, die echte Secrets benötigen (z.B. ein
  externer API-Key), niemals in `wrangler.toml` eintragen, sondern:

  ```bash
  wrangler secret put NAME_DES_SECRETS
  ```

  Der Wert landet dann verschlüsselt bei Cloudflare und ist im Code nur
  über `env.NAME_DES_SECRETS` erreichbar.

---

## 9. Update-Workflow

Für zukünftige Änderungen genügt:

```bash
git add .
git commit -m "Beschreibung der Änderung"
git push
```

Bei aktivierter Git-Integration deployed Cloudflare Pages das Frontend
automatisch neu. Für Änderungen am Worker zusätzlich:

```bash
cd worker
wrangler deploy
```

Für Schema-Änderungen an der Datenbank eine neue `.sql`-Datei anlegen
und mit `wrangler d1 execute family-shopping-db --file=... --remote`
anwenden (bestehende Daten bleiben dabei erhalten, sofern nur `ALTER
TABLE`/`CREATE TABLE IF NOT EXISTS` verwendet wird).
