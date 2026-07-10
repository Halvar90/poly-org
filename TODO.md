# PolyOrg Kalender Todo-Liste

## Ziel
Ein gemeinsamer Kalender, der alle Einträge in einem einzigen Feed zeigt. Personen werden durch eine feste Farbe und ein Profil-Icon unterschieden. Einträge werden zusätzlich nach Typ (Termin / Aufgabe / Abwesenheit) visuell gekennzeichnet.

## Aufgaben

1. Datenmodell
   - [x] Profil um `profile_icon` erweitern
   - [x] `events_with_creator` View so anpassen, dass sie das Profil-Icon des Erstellers liefert

2. Auth & Profil-Lade/Save
   - [x] `Profile` Typ und `loadProfile` um `profile_icon` erweitern
   - [x] Profilspeicher-Funktion aktualisieren

3. Profil-Einstellungen
   - [x] Icon-Auswahl in `app/(tabs)/einstellungen.tsx` hinzufügen
   - [x] Profilseite zeigt gewähltes Icon in Profil-Card

4. Kalender-Darstellung
   - [x] Event-Karten zeigen vorne das Nutzer-Icon in der Farbwelt der Person
   - [x] Einträge anderer Personen erhalten deren feste Farbe
   - [x] Typ-Akzent für Termin/Aufgabe/Abwesenheit hinzufügen
   - [x] Visualisierung der eigenen vs. fremden Beiträge klarer machen

5. Aufgaben-Ansicht
   - [x] Aufgaben-Karten zeigen auch Ersteller-Icon/-Farbe

6. Usability
   - [x] Legende: Farben und Icons erklären, ggf. im Header oder als Tooltip
   - [x] Personenfarbe/Icon-Legende ergänzen
   - [x] Testen, ob die Farb- und Icon-Logik sofort verständlich ist

## Optional/Später
- [x] Filteroptionen: nur eigene, nur andere, nur geteilte Einträge
- [ ] Mehrere Gruppen- oder Kalenderansichten
- [ ] Drag & Drop / Terminverschiebung
