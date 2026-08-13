// Cliente minimo da Google Calendar API v3, via fetch puro (sem a lib
// "googleapis"). So server-side -- usa GOOGLE_REFRESH_TOKEN,
// GOOGLE_CALENDAR_ID etc; nunca importar num componente "use client".
import { refreshAccessToken } from "./oauth.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Cache do access token em memoria do processo (evita renovar a cada
// chamada dentro da mesma instancia "quente"). Nunca persiste em disco
// nem em log -- some quando a instancia serverless reciclar.
let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.accessToken;
  }
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("GOOGLE_REFRESH_TOKEN nao configurado.");
  }
  const { access_token, expires_in } = await refreshAccessToken(refreshToken);
  cachedToken = { accessToken: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}

async function calendarFetch(path, options = {}) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    // Nunca repassar o corpo do erro do Google pro cliente final (pode
    // conter detalhe interno). Logamos so o status e um trecho curto,
    // nunca token nem dado pessoal do paciente.
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 200);
    } catch {
      // ignora falha ao ler o corpo do erro
    }
    console.error(`[google-calendar] erro ${res.status} em ${path}: ${snippet}`);
    const err = new Error(`Google Calendar API respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Consulta ocupacao (freeBusy) do calendario configurado num intervalo.
// Retorna array de { start: Date, end: Date }.
export async function getBusyRanges({ timeMin, timeMax, timeZone }) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID nao configurado.");

  const json = await calendarFetch("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    }),
  });

  const busy = json?.calendars?.[calendarId]?.busy || [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

// Cria o evento no calendario. Se withMeet=true, gera conferencia Google
// Meet automaticamente (conferenceDataVersion=1). Se `location` for
// passado, so entra como texto do local (nao gera Meet).
export async function createCalendarEvent({
  summary,
  description,
  startUTC,
  endUTC,
  timeZone,
  attendeeEmail,
  withMeet,
  location,
}) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID nao configurado.");

  const body = {
    summary,
    description,
    start: { dateTime: startUTC.toISOString(), timeZone },
    end: { dateTime: endUTC.toISOString(), timeZone },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
  };
  if (location) body.location = location;
  if (withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const query = new URLSearchParams({
    sendUpdates: "all",
    ...(withMeet ? { conferenceDataVersion: "1" } : {}),
  });

  const json = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const meetLink =
    json?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri || null;

  return { eventId: json.id, htmlLink: json.htmlLink, meetLink };
}
