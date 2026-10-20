# ÖGS Vokabeltrainer

Persönlicher Vokabeltrainer für Österreichische Gebärdensprache. Reines HTML/CSS/JavaScript, kein Backend. Oberfläche auf Deutsch.

Dateien: `index.html`, `styles.css`, `app.js`, `vocabulary.json`.

## Lokal auf dem Mac starten

`vocabulary.json` wird per `fetch` geladen, das Öffnen per Doppelklick (`file://`) funktioniert deshalb nicht. Im Projektordner im Terminal:

    cd pfad/zum/oegs-trainer
    python3 -m http.server 8000

Dann `http://localhost:8000` im Browser öffnen. Beenden mit Ctrl+C.

## Mit GitHub Pages veröffentlichen

1. Auf github.com ein neues Repository anlegen (z. B. `oegs-trainer`).
2. Die vier Dateien in das Repository hochladen (oder per `git add . && git commit -m "Start" && git push`).
3. Im Repository: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, Branch `main`, Ordner `/ (root)`, speichern.
4. Nach ca. einer Minute ist die App unter `https://DEINNAME.github.io/oegs-trainer/` erreichbar.

## Vokabeln hinzufügen

Einträge in `vocabulary.json` ergänzen, am Code ist nichts zu ändern:

    { "id": "hallo", "meaning": "Hallo", "videoUrl": "https://…/hallo.mp4", "category": "Begrüßung", "notes": "" }

- `id`: eindeutig und dauerhaft. Der Lernfortschritt hängt an der ID, nicht umbenennen.
- `meaning`, `videoUrl`: Pflicht. `category`, `notes`: optional.
- Zwischen Einträgen Komma setzen, nach dem letzten keines. Sortierung erfolgt automatisch.
- Die Beispiel-URLs (`example.com`) funktionieren nicht, bitte durch echte ersetzen.

## Videoformate

- Direkte Dateien (`.mp4`, `.webm`, `.m4v`, `.ogv`): HTML5-Video, stumm, Schleife, Autoplay.
- YouTube (`watch?v=`, `youtu.be`, `/embed/`, `/shorts/`) und Vimeo (`vimeo.com/ZAHL`) werden automatisch in Einbettungs-Adressen umgewandelt.
- Andere Adressen werden als Iframe versucht. Ob ein Anbieter das erlaubt, kann die App vorab nicht prüfen, deshalb steht bei eingebetteten Videos immer ein Link zum Öffnen in neuem Tab darunter.

## Probleme mit Videos

- **Leere Fläche oder „Verbindung abgelehnt“ im Iframe:** Der Anbieter blockiert Einbettung (`X-Frame-Options`/CSP). Link „Original-Video in neuem Tab öffnen“ nutzen oder, falls möglich, eine direkte MP4-Adresse verwenden.
- **„Video konnte nicht geladen werden“:** URL im Browser direkt öffnen. Prüfen, ob sie auf die Datei selbst zeigt, `https://` nutzt und ohne Login erreichbar ist. Auf GitHub Pages (https) werden `http://`-Videos als Mixed Content blockiert.
- **Video lädt, aber kein Autoplay:** Browser-Regeln. „Video abspielen“ drücken.
- **Video wird nicht abgespielt trotz gültiger URL:** Manche Server erlauben fremden Seiten kein Einbinden (Hotlink-Schutz). Details zeigt die Browser-Konsole (Cmd+Option+J in Chrome).
- Die App umgeht keine Zugriffsbeschränkungen von Anbietern.

## Lernstatus

Neu → In Übung → Gelernt → Gefestigt. „Gelernt“ ergibt höchstens „Gelernt“. „Gefestigt“ gibt es erst, wenn das Wort mehr als 24 Stunden später erneut als gelernt markiert wird. „Noch üben“ setzt auf „In Übung“ zurück. Der Fortschritt liegt im `localStorage` dieses Browsers und lässt sich über „Fortschritt zurücksetzen“ löschen.
