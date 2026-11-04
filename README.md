# Life Dashboard

Ein schlankes Dashboard für mehr Disziplin im Alltag. Läuft im Browser auf Handy und Laptop und kann als App installiert werden (PWA, offline-fähig).

## Funktionen

- **Heute**: Fortschrittsring, Top-3-Fokus-Aufgaben, Habits zum Abhaken mit 🔥-Serie, Abend-Check-in (Stimmung + Notiz). Mit ‹ › kannst du vergangene Tage nachtragen.
- **Woche**: Erfüllungsquote, perfekte Tage, Ø-Stimmung, Balken pro Tag sowie pro Habit Serie, Rekord und 30-Tage-Quote.
- **Habits**: Gewohnheiten anlegen, sortieren, löschen. Backup als JSON exportieren/importieren.

## Starten

Kein Build nötig, es sind reine HTML/CSS/JS-Dateien.

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

`index.html` per Doppelklick geht auch, dann aber ohne Offline-Modus/Installation.

### Aufs Handy bringen (GitHub Pages)

1. Im Repo auf GitHub: **Settings → Pages → Branch** wählen, Ordner `/ (root)`, speichern.
2. Die angezeigte URL am Handy öffnen.
3. iOS: Teilen → „Zum Home-Bildschirm“. Android: Menü → „App installieren“.

## Daten

Alles liegt lokal im Browser (`localStorage`, Schlüssel `lifedash.v1`). Es gibt keine Synchronisierung zwischen Geräten. Mach regelmäßig ein Backup über **Habits → Backup exportieren**.

## Mögliche nächste Schritte

- Sync zwischen Geräten (z. B. Supabase)
- Erinnerungen/Push-Benachrichtigungen
- Wochenrückblick mit Reflexionsfragen
- Fokus-Timer (Pomodoro)
- Gesundheits-Tracking (Schlaf, Gewicht, Training)
