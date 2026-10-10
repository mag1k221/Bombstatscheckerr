const $ = (id) => document.getElementById(id);
const ICON = (t) => `https://render.albiononline.com/v1/item/${encodeURIComponent(t)}.png?size=64`;
const pretty = (t) => {
  const m = t.match(/^T(\d+)_(.+?)(?:@(\d+))?$/);
  if (!m) return t;
  const name = m[2].replace(/^(2H|MAIN)_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return `${name} (${m[1]}.${m[3] || 0})`;
};
const base = (t) => t.replace(/^T\d+_/, "").replace(/@\d+$/, "");
const kd = (k, d) => (d ? (k / d).toFixed(2) : k ? "∞" : "0.00");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function parseBattleId(s) {
  const m = String(s).match(/battles\/(\d+)/) || String(s).match(/(\d{6,12})/);
  return m ? m[1] : null;
}
function parseNames(text) {
  return [...new Set(text.split(/[\r\n,;\t]+/).map((n) => n.trim()).filter(Boolean))];
}

$("file").addEventListener("change", async (e) => {
  const texts = await Promise.all([...e.target.files].map((f) => f.text()));
  const all = parseNames([$("names").value, ...texts].join("\n"));
  $("names").value = all.join("\n");
});

let last = null, sortKey = "kills", sortDir = -1;

async function run() {
  const id = parseBattleId($("battle").value);
  const names = parseNames($("names").value);
  const st = $("status");
  st.className = "";
  if (!id) return (st.className = "err"), (st.textContent = "Paste a valid AlbionBB battle link.");
  if (!names.length) return (st.className = "err"), (st.textContent = "Attach a .txt or paste your squad names.");
  $("go").disabled = true;
  st.textContent = "Loading battle… (big fights can take ~10s)";
  try {
    const r = await fetch(`/api/battle?id=${id}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Request failed");
    last = { id, names, data };
    render();
    history.replaceState(null, "", shareUrl());
    $("share").hidden = false;
    st.textContent = `Battle ${id} · ${data.totalKills} total kills · ${new Date(data.startTime).toLocaleString()}`;
  } catch (e) {
    st.className = "err";
    st.textContent = e.message;
  } finally {
    $("go").disabled = false;
  }
}

function shareUrl() {
  const p = new URLSearchParams({ b: last.id, n: last.names.join("~") });
  return `${location.origin}${location.pathname}?${p}`;
}

function render() {
  const { names, data } = last;
  const byName = new Map(data.players.map((p) => [p.name.toLowerCase(), p]));
  const rows = [], missing = [];
  for (const n of names) {
    const p = byName.get(n.toLowerCase());
    p ? rows.push(p) : missing.push(n);
  }
  const K = rows.reduce((s, p) => s + p.kills, 0);
  const D = rows.reduce((s, p) => s + p.deaths, 0);
  const share = data.totalKills ? ((K / data.totalKills) * 100).toFixed(1) : "0";

  $("summary").innerHTML = [
    [K, "Squad kills", "good"],
    [D, "Squad deaths", "bad"],
    [kd(K, D), "K/D", ""],
    [`${share}%`, "Of all kills in battle", ""],
    [`${rows.length}/${names.length}`, "Members found", ""],
  ].map(([v, l, c]) => `<div class="stat"><b class="${c}">${v}</b><span>${l}</span></div>`).join("");

  // comp: main weapon of each member
  const comp = {};
  for (const p of rows) {
    const w = p.weapons[0];
    const k = w ? base(w) : "?";
    (comp[k] ||= { type: w, count: 0, who: [] }).count++;
    comp[k].who.push(p.name);
  }
  $("comp").innerHTML = Object.values(comp).sort((a, b) => b.count - a.count).map((c) =>
    `<div class="w" title="${esc(c.who.join(", "))}">${c.type ? `<img class="item" src="${ICON(c.type)}" alt="">` : "❔"}
     <span>${c.type ? esc(pretty(c.type).replace(/ \(.+\)$/, "")) : "Unknown (no kill events)"}</span><b>×${c.count}</b></div>`).join("");

  const val = (p, k) => (k === "kd" ? (p.deaths ? p.kills / p.deaths : p.kills * 1000) : k === "name" ? p.name.toLowerCase() : p[k]);
  rows.sort((a, b) => (val(a, sortKey) > val(b, sortKey) ? 1 : val(a, sortKey) < val(b, sortKey) ? -1 : 0) * sortDir);

  const head = [["name", "Player"], ["guild", "Guild"], [null, "Weapons"], ["kills", "Kills", "n"], ["deaths", "Deaths", "n"], ["kd", "K/D", "n"]];
  $("table").innerHTML =
    `<thead><tr>${head.map(([k, l, c]) => `<th class="${c || ""}" data-k="${k || ""}">${l}${k === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((p) => `<tr><td>${esc(p.name)}</td><td class="muted">${esc(p.guild)}</td>
      <td>${p.weapons.slice(0, 3).map((w) => `<img class="item" src="${ICON(w)}" title="${esc(pretty(w))}" alt="">`).join("") || '<span class="muted">—</span>'}</td>
      <td class="n good">${p.kills}</td><td class="n bad">${p.deaths}</td><td class="n">${kd(p.kills, p.deaths)}</td></tr>`).join("") +
    `<tr class="total"><td>Total</td><td></td><td></td><td class="n">${K}</td><td class="n">${D}</td><td class="n">${kd(K, D)}</td></tr></tbody>`;
  $("table").querySelectorAll("th[data-k]").forEach((th) => th.dataset.k && th.addEventListener("click", () => {
    sortDir = sortKey === th.dataset.k ? -sortDir : -1;
    sortKey = th.dataset.k;
    render();
  }));

  $("missing").textContent = missing.length ? `Not in this battle (${missing.length}): ${missing.join(", ")}` : "";
  $("results").hidden = false;
}

$("go").addEventListener("click", run);
$("share").addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareUrl());
  $("share").textContent = "✅ Copied!";
  setTimeout(() => ($("share").textContent = "🔗 Copy share link"), 1500);
});

// open shared link
const q = new URLSearchParams(location.search);
if (q.get("b") && q.get("n")) {
  $("battle").value = `https://europe.albionbb.com/battles/${q.get("b")}`;
  $("names").value = q.get("n").split("~").join("\n");
  run();
}
