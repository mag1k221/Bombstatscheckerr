// Vercel serverless function: GET /api/battle?ids=123,456,789
// Uses AlbionBB's API (same numbers as the AlbionBB site, incl. multi-battles).
// Falls back to the official Albion API if AlbionBB is down.

const BB = "https://api.albionbb.com/eu";
const OFFICIAL = "https://gameinfo-ams.albiononline.com/api/gameinfo";

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "boomsquad-stats", Accept: "application/json" } });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

const mapPlayer = (p) => ({
  name: p.name,
  guild: p.guildName || "",
  alliance: p.allianceName || "",
  kills: p.kills || 0,
  deaths: p.deaths || 0,
  killFame: p.killFame || 0,
  deathFame: p.deathFame || 0,
  ip: p.ip || 0,
  damage: p.damage || 0,
  heal: p.heal || 0,
  role: p.role || "",
  weapon: p.weapon?.type || null,
});

async function fromAlbionBB(ids) {
  const url = ids.length === 1 ? `${BB}/battles/${ids[0]}` : `${BB}/battles/multi?ids=${ids.join(",")}`;
  const b = await getJson(url);
  if (!b) return null;
  return {
    source: "AlbionBB",
    ids,
    startTime: b.startedAt,
    endTime: b.finishedAt,
    totalKills: b.totalKills,
    totalFame: b.totalFame,
    players: (b.players || []).map(mapPlayer),
  };
}

// Fallback: sum official battle summaries (no IP / weapons available there)
async function fromOfficial(ids) {
  const battles = (await Promise.all(ids.map((id) => getJson(`${OFFICIAL}/battles/${id}`)))).filter(Boolean);
  if (!battles.length) return null;
  const players = {};
  for (const b of battles)
    for (const p of Object.values(b.players || {})) {
      const x = (players[p.id] ||= mapPlayer({ name: p.name, guildName: p.guildName, allianceName: p.allianceName }));
      x.kills += p.kills || 0;
      x.deaths += p.deaths || 0;
      x.killFame += p.killFame || 0;
    }
  return {
    source: "Official Albion API (AlbionBB unavailable – no IP/weapons)",
    ids,
    startTime: battles.map((b) => b.startTime).sort()[0],
    endTime: battles.map((b) => b.endTime).sort().at(-1),
    totalKills: battles.reduce((s, b) => s + (b.totalKills || 0), 0),
    totalFame: battles.reduce((s, b) => s + (b.totalFame || 0), 0),
    players: Object.values(players),
  };
}

export default async function handler(req, res) {
  const raw = String(req.query?.ids ?? req.query?.id ?? "");
  const ids = [...new Set(raw.split(/[^\d]+/).filter((s) => /^\d{5,12}$/.test(s)))].slice(0, 30);
  if (!ids.length) return res.status(400).json({ error: "Invalid battle link" });

  let data = null;
  try {
    data = await fromAlbionBB(ids);
  } catch {}
  if (!data) {
    try {
      data = await fromOfficial(ids);
    } catch {}
  }
  if (!data) return res.status(404).json({ error: "Battle not found on the Europe server (or APIs are down – try again in a minute)" });

  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
  res.status(200).json(data);
}
