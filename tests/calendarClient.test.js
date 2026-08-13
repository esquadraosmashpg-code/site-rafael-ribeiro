import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getBusyRanges, createCalendarEvent } from "../lib/google/calendarClient.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function mockFetch(handlers) {
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    for (const [pattern, handler] of handlers) {
      if (urlStr.includes(pattern)) return handler(url, options);
    }
    throw new Error(`URL não mockada no teste: ${urlStr}`);
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

before(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
  process.env.GOOGLE_CALENDAR_ID = "test-calendar@group.calendar.google.com";
});

after(() => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
});

beforeEach(() => {
  mockFetch([
    ["oauth2.googleapis.com/token", async () => jsonResponse({ access_token: "fake-access-token", expires_in: 3600 })],
  ]);
});

describe("getBusyRanges", () => {
  test("converte a resposta do freeBusy em array de {start, end}", async () => {
    mockFetch([
      ["oauth2.googleapis.com/token", async () => jsonResponse({ access_token: "fake-access-token", expires_in: 3600 })],
      [
        "/freeBusy",
        async () =>
          jsonResponse({
            calendars: {
              "test-calendar@group.calendar.google.com": {
                busy: [{ start: "2026-08-20T12:00:00Z", end: "2026-08-20T13:00:00Z" }],
              },
            },
          }),
      ],
    ]);

    const ranges = await getBusyRanges({
      timeMin: new Date("2026-08-20T00:00:00Z"),
      timeMax: new Date("2026-08-21T00:00:00Z"),
      timeZone: "America/Sao_Paulo",
    });

    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start.toISOString(), "2026-08-20T12:00:00.000Z");
    assert.equal(ranges[0].end.toISOString(), "2026-08-20T13:00:00.000Z");
  });

  test("propaga erro quando a API do Google falha (ex.: 500)", async () => {
    mockFetch([
      ["oauth2.googleapis.com/token", async () => jsonResponse({ access_token: "fake-access-token", expires_in: 3600 })],
      ["/freeBusy", async () => jsonResponse({ error: "boom" }, 500)],
    ]);

    await assert.rejects(
      () =>
        getBusyRanges({
          timeMin: new Date("2026-08-20T00:00:00Z"),
          timeMax: new Date("2026-08-21T00:00:00Z"),
          timeZone: "America/Sao_Paulo",
        }),
      /respondeu 500/
    );
  });
});

describe("createCalendarEvent", () => {
  test("modalidade online: envia conferenceDataVersion=1 e conferenceData no corpo", async () => {
    let capturedUrl, capturedBody;
    mockFetch([
      ["oauth2.googleapis.com/token", async () => jsonResponse({ access_token: "fake-access-token", expires_in: 3600 })],
      [
        "/events",
        async (url, options) => {
          capturedUrl = String(url);
          capturedBody = JSON.parse(options.body);
          return jsonResponse({
            id: "evt123",
            htmlLink: "https://calendar.google.com/evt123",
            conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] },
          });
        },
      ],
    ]);

    const result = await createCalendarEvent({
      summary: "Consulta — Maria S.",
      description: "Modalidade: Online",
      startUTC: new Date("2026-08-20T12:00:00Z"),
      endUTC: new Date("2026-08-20T13:00:00Z"),
      timeZone: "America/Sao_Paulo",
      attendeeEmail: "maria@example.com",
      withMeet: true,
    });

    assert.ok(capturedUrl.includes("conferenceDataVersion=1"));
    assert.equal(capturedBody.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
    assert.equal(result.meetLink, "https://meet.google.com/abc-defg-hij");
  });

  test("modalidade presencial: NÃO envia conferenceData nem conferenceDataVersion, envia location", async () => {
    let capturedUrl, capturedBody;
    mockFetch([
      ["oauth2.googleapis.com/token", async () => jsonResponse({ access_token: "fake-access-token", expires_in: 3600 })],
      [
        "/events",
        async (url, options) => {
          capturedUrl = String(url);
          capturedBody = JSON.parse(options.body);
          return jsonResponse({ id: "evt456", htmlLink: "https://calendar.google.com/evt456" });
        },
      ],
    ]);

    const result = await createCalendarEvent({
      summary: "Consulta — João P.",
      description: "Modalidade: Presencial",
      startUTC: new Date("2026-08-20T12:00:00Z"),
      endUTC: new Date("2026-08-20T13:00:00Z"),
      timeZone: "America/Sao_Paulo",
      attendeeEmail: "joao@example.com",
      withMeet: false,
      location: "Rua Exemplo, 123",
    });

    assert.ok(!capturedUrl.includes("conferenceDataVersion"));
    assert.equal(capturedBody.conferenceData, undefined);
    assert.equal(capturedBody.location, "Rua Exemplo, 123");
    assert.equal(result.meetLink, null);
  });
});
