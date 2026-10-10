// Vercel serverless function: GET /api/battle?id=<battleId>
// Pulls battle + kill events from the official Albion Online API (Europe server)
// and returns per-player kills, deaths and weapons used.

const API = "https://gameinfo-ams.albiononline.com/api/gameinfo";
const PAGE = 51;          // max page size the API allows
const MAX_PAGES = 60;     // ~3000 kill events, enough for big ZvZs

async function getJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "boomsquad-stats" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

const baseItem = (type) => (type || "").replace(/^T\d+_/, "").replace(/@\d+$/, "");

export default async function handler(req, res) {
  const id = String(req.query?.id ?? new URL(req.url, "http://x").searchParams.get("id") ?? "").trim();
  if (!/^\d{5,12}$/.test(id)) {
    res.status(400).json({ error: "Invalid battle id" });
    return;
  }

  try {
    const battle = await getJson(`${API}/battles/${id}`);
    if (!battle) {
      res.status(404).json({ error: "Battle not found on the Europe server" });
      return;
    }

    // Fetch all kill events of the battle in parallel pages
    const pages = Math.min(MAX_PAGES, Math.ceil((battle.totalKills || 0) / PAGE) + 1);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, p) =>
        getJson(`${API}/events/battle/${id}?offset=${p * PAGE}&limit=${PAGE}`).catch(() => [])
      )
    );
    const seen = new Set();
    const events = results.flat().filter((e) => e && !seen.has(e.EventId) && seen.add(e.EventId));

    // players from the battle summary (official kills / deaths)
    const players = {};
    for (const p of Object.values(battle.players || {})) {
      players[p.id] = {
        id: p.id,
        name: p.name,
        guild: p.guildName || "",
        alliance: p.allianceName || "",
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        killFame: p.killFame || 0,
        weapons: {}, // base weapon -> { type, count }
      };
    }

    // collect weapons each player was seen with in kill events
    const addGear = (who) => {
      if (!who || !who.Id || !players[who.Id]) return;
      const type = who.Equipment?.MainHand?.Type;
      if (!type) return;
      const key = baseItem(type);
      const w = (players[who.Id].weapons[key] ||= { type, count: 0 });
      w.count++;
      w.type = type;
    };
    for (const e of events) {
      addGear(e.Killer);
      addGear(e.Victim);
      for (const p of e.Participants || []) if (p.Id !== e.Killer?.Id) addGear(p);
    }

    const out = Object.values(players).map((p) => ({
      ...p,
      weapons: Object.values(p.weapons).sort((a, b) => b.count - a.count).map((w) => w.type),
    }));

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({
      id: battle.id,
      startTime: battle.startTime,
      endTime: battle.endTime,
      totalKills: battle.totalKills,
      totalFame: battle.totalFame,
      eventsLoaded: events.length,
      players: out,
    });
  } catch (e) {
    res.status(502).json({ error: "Albion API is not responding, try again in a minute" });
  }
}
