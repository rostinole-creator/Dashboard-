# Life Dashboard

Ein schlankes Dashboard für mehr Disziplin im Alltag. Läuft im Browser auf Handy und Laptop und kann als App installiert werden (PWA, offline-fähig).

## Funktionen

- **Heute**: Fortschrittsring, Top-3-Fokus-Aufgaben, Habits zum Abhaken mit 🔥-Serie, Gesundheit (💧 Wasser per Glas-Button, ⚖️ Gewicht, 🏋️ Training mit Art und Minuten), Abend-Check-in (Stimmung + Notiz). Mit ‹ › kannst du vergangene Tage nachtragen.
- **Woche**: Erfüllungsquote, perfekte Tage, Ø-Stimmung, Balken pro Tag sowie pro Habit Serie, Rekord und 30-Tage-Quote. Dazu Wasser pro Tag, Trainingstage und der Gewichtsverlauf der letzten 30 Tage.
- **Ziele**: Gewohnheiten anlegen, sortieren, löschen. Gesundheitsziele festlegen (Wasser pro Tag, Glasgröße, Zielgewicht, Trainings pro Woche). Backup als JSON exportieren/importieren.

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

Alles liegt lokal im Browser (`localStorage`, Schlüssel `lifedash.v1`). Es gibt keine Synchronisierung zwischen Geräten. Mach regelmäßig ein Backup über **Ziele → Backup exportieren**.

## Mögliche nächste Schritte

- Sync zwischen Geräten (z. B. Supabase)
- Erinnerungen/Push-Benachrichtigungen
- Wochenrückblick mit Reflexionsfragen
- Fokus-Timer (Pomodoro)
- Schlaf-Tracking
