const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export interface ParsedEvent {
  title: string;
  date?: string;         // YYYY-MM-DD
  time?: string;         // HH:MM (24h)
  endDate?: string;      // YYYY-MM-DD
  entryType?: 'termin' | 'aufgabe' | 'abwesenheit' | 'erinnerung';
  assigneeName?: string; // Name der Person, für die der Eintrag erstellt wird
}

async function groqChat(system: string, user: string, maxTokens = 400): Promise<string> {
  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content?.trim() ?? '';
}

export async function parseEventFromVoice(text: string): Promise<ParsedEvent> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const todayName = dayNames[now.getDay()];

  const system = `Du wandelst gesprochene deutsche Einträge in strukturiertes JSON um.
Heute ist ${todayName}, ${todayStr}.

Extrahiere diese Felder:
- title: Kurzer prägnanter Titel ohne Personen (Pflichtfeld). Bei "Erinnere Korana an Wäsche" → "Wäsche machen"
- date: Datum als YYYY-MM-DD – löse relative Angaben auf (morgen, übermorgen, nächsten Montag, in 3 Tagen usw.)
- time: Uhrzeit als HH:MM im 24h-Format (10 Uhr→10:00, halb 3→14:30, Viertel nach 8 abends→20:15)
- endDate: Enddatum YYYY-MM-DD – nur bei mehrtägigen Ereignissen (z.B. Urlaub von Mo bis Fr)
- entryType: "termin" | "aufgabe" | "abwesenheit" | "erinnerung"
  - aufgabe: kaufen, erledigen, todo, machen, abholen, besorgen
  - abwesenheit: urlaub, abwesend, nicht da, frei, krank, auszeit
  - erinnerung: erinnerung, erinnern, nicht vergessen, merken
  - termin: alles andere (Standard)
- assigneeName: Vorname der Person, FÜR DIE der Eintrag erstellt wird (z.B. "Erinnere Korana", "für Max", "sag Lisa"). Nur setzen wenn explizit eine andere Person genannt wird. NICHT den Sprecher selbst.

Antworte NUR mit validem JSON-Objekt – kein Markdown, keine Erklärung.
Beispiel: {"title":"Zahnarzt","date":"2026-07-01","time":"14:30","entryType":"termin"}
Beispiel mit Zuweisung: {"title":"Wäsche machen","date":"2026-07-03","entryType":"erinnerung","assigneeName":"Korana"}`;

  try {
    const raw = await groqChat(system, text, 300);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as ParsedEvent;
    if (!parsed.title) parsed.title = text;
    if (!['termin', 'aufgabe', 'abwesenheit', 'erinnerung'].includes(parsed.entryType ?? '')) {
      parsed.entryType = 'termin';
    }
    return parsed;
  } catch {
    return { title: text, entryType: 'termin' };
  }
}

export async function correctDiaryText(text: string): Promise<string> {
  const system = `Du korrigierst deutsche Tagesbuchtexte.
Korrigiere Rechtschreibung, Grammatik und Zeichensetzung.
Behalte Ton, Stil und Inhalt vollständig bei.
Antworte NUR mit dem korrigierten Text – keine Kommentare, keine Anführungszeichen drumherum.`;

  try {
    const result = await groqChat(system, text, 800);
    return result || text;
  } catch {
    return text;
  }
}

export async function correctNoteText(text: string): Promise<string> {
  const system = `Du korrigierst deutsche Notizen.
Korrigiere Rechtschreibung, Grammatik und Zeichensetzung.
Behalte Ton, Stil und Inhalt vollständig bei – auch bei kurzen Stichpunkten oder Einkaufslisten.
Antworte NUR mit dem korrigierten Text – keine Kommentare, keine Anführungszeichen drumherum.`;

  try {
    const result = await groqChat(system, text, 500);
    return result || text;
  } catch {
    return text;
  }
}

export async function generateDiarySummary(entries: string[]): Promise<string> {
  const combined = entries.join('\n\n');
  const system = `Du fasst deutsche Tagebucheinträge in 2–4 Stichpunkten zusammen.
Jeder Stichpunkt beginnt mit "•" und ist maximal 8 Wörter lang.
Erfasse die wichtigsten Ereignisse, Gedanken oder Gefühle des Tages.
Antworte NUR mit den Stichpunkten – keine Einleitung, kein Kommentar.`;

  try {
    const result = await groqChat(system, combined, 200);
    return result || entries.map((e) => `• ${e.slice(0, 60)}${e.length > 60 ? '…' : ''}`).join('\n');
  } catch {
    return entries.map((e) => `• ${e.slice(0, 60)}${e.length > 60 ? '…' : ''}`).join('\n');
  }
}
