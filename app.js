const $ = (id) => document.getElementById(id);
const ICON = (t) => `https://render.albiononline.com/v1/item/${encodeURIComponent(t)}.png?size=64`;
const pretty = (t) => {
  const m = t.match(/^T(\d+)_(.+?)(?:@(\d+))?$/);
  if (!m) return t;
  const name = m[2].replace(/^(2H|MAIN)_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return `${name} (${m[1]}.${m[3] || 0})`;
};
const base = (t) => t.replace(/^T\d+_/, "").replace(/@\d+$/, "");
const fame = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
const kd = (k, d) => (d ? (k / d).toFixed(2) : k ? "∞" : "0.00");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// supports /battles/123 and multi links like /battles/multi?ids=1,2,3
const parseBattleIds = (s) => {
  const ids = [...new Set(String(s).match(/\d{6,12}/g) || [])];
  return ids.length ? ids.join(",") : null;
};
const parseNames = (t) => [...new Set(t.split(/[\r\n,;\t]+/).map((n) => n.trim()).filter(Boolean))];

/* ---------- typing effect ---------- */
const words = ["Kills. Deaths. K/D.", "Your comp, summed up.", "No more counting by hand.", "Built for boomsquads."];
(async function type() {
  const el = $("typed");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; ; i = (i + 1) % words.length) {
    const w = words[i];
    for (let j = 0; j <= w.length; j++) { el.textContent = w.slice(0, j); await sleep(55); }
    await sleep(1600);
    for (let j = w.length; j >= 0; j--) { el.textContent = w.slice(0, j); await sleep(25); }
    await sleep(250);
  }
})();

/* ---------- nav highlight ---------- */
const links = [...document.querySelectorAll(".nav a")];
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
}), { rootMargin: "-45% 0px -50% 0px" });
["home", "calc", "how"].forEach((id) => io.observe($(id)));

/* ---------- file input / drag & drop ---------- */
const updateCount = () => { const n = parseNames($("names").value).length; $("count").textContent = n ? `· ${n} names` : ""; };
$("names").addEventListener("input", updateCount);
async function addFiles(files) {
  const texts = await Promise.all([...files].map((f) => f.text()));
  $("names").value = parseNames([$("names").value, ...texts].join("\n")).join("\n");
  $("fileinfo").textContent = [...files].map((f) => f.name).join(", ");
  updateCount();
}
$("file").addEventListener("change", (e) => addFiles(e.target.files));
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.add("over")));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));

/* ---------- main ---------- */
let last = null, sortKey = "kills", sortDir = -1;

async function run() {
  const ids = parseBattleIds($("battle").value);
  const names = parseNames($("names").value);
  const st = $("status");
  st.className = "";
  if (!ids) return (st.className = "err"), (st.textContent = "Paste a valid AlbionBB battle link.");
  if (!names.length) return (st.className = "err"), (st.textContent = "Drop a .txt or paste your squad names.");
  $("go").disabled = true;
  st.textContent = "Loading battle…";
  try {
    const r = await fetch(`/api/stats?ids=${ids}`);
    let data;
    try { data = await r.json(); } catch { throw new Error(r.status === 404 ? "Server function missing: make sure api/stats.js is in your GitHub repo." : "Server error, try again."); }
    if (!r.ok) throw new Error(data.error || "Request failed");
    last = { ids, names, data };
    render();
    history.replaceState(null, "", shareUrl());
    $("share").hidden = false;
    const n = ids.split(",").length;
    st.textContent = "";
    $("battleinfo").textContent = `${n > 1 ? n + " battles" : "Battle " + ids} · ${data.totalKills} kills total · ${new Date(data.startTime).toLocaleString()} · ${data.source}`;
    $("results").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    st.className = "err";
    st.textContent = e.message;
  } finally {
    $("go").disabled = false;
  }
}

const shareUrl = () => `${location.origin}${location.pathname}?${new URLSearchParams({ b: last.ids, n: last.names.join("~") })}`;

function countUp(el, to, fmt) {
  const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function render() {
  const { names, data } = last;
  const byName = new Map();
  for (const p of data.players) {
    const k = p.name.toLowerCase(), o = byName.get(k);
    if (!o) byName.set(k, { ...p });
    else { o.kills += p.kills; o.deaths += p.deaths; o.killFame += p.killFame; o.weapon ||= p.weapon; }
  }
  const rows = [], missing = [];
  for (const n of names) { const p = byName.get(n.toLowerCase()); p ? rows.push(p) : missing.push(n); }

  const K = rows.reduce((s, p) => s + p.kills, 0);
  const D = rows.reduce((s, p) => s + p.deaths, 0);
  const KF = rows.reduce((s, p) => s + p.killFame, 0);
  const withIp = rows.filter((p) => p.ip);
  const avgIp = withIp.length ? Math.round(withIp.reduce((s, p) => s + p.ip, 0) / withIp.length) : 0;
  const share = data.totalKills ? (K / data.totalKills) * 100 : 0;

  const cards = [
    ["Squad kills", K, (v) => Math.round(v), "good", "dark"],
    ["Squad deaths", D, (v) => Math.round(v), "bad", ""],
    ["K/D", D ? K / D : K, (v) => (D ? v.toFixed(2) : K ? "∞" : "0.00"), "", ""],
    ["Of all kills in battle", share, (v) => v.toFixed(1) + "%", "", ""],
    ["Kill fame", KF, (v) => fame(Math.round(v)), "fame", ""],
    ["Avg IP", avgIp, (v) => (avgIp ? Math.round(v) : "—"), "", ""],
    ["Members found", rows.length, (v) => `${Math.round(v)}/${names.length}`, "", ""],
    ["Deaths per member", rows.length ? D / rows.length : 0, (v) => v.toFixed(2), "", ""],
  ];
  $("summary").innerHTML = cards.map(([l, , , c, cls], i) => `<div class="stat ${cls}"><b class="${c}" id="s${i}">0</b><span>${l}</span></div>`).join("");
  cards.forEach(([, v, f], i) => countUp($("s" + i), v, f));

  const comp = {};
  for (const p of rows) {
    const k = p.weapon ? base(p.weapon) : "?";
    (comp[k] ||= { type: p.weapon, count: 0, who: [] }).count++;
    comp[k].who.push(p.name);
  }
  $("comp").innerHTML = Object.values(comp).sort((a, b) => b.count - a.count).map((c) =>
    `<div class="chip" title="${esc(c.who.join(", "))}">${c.type ? `<img class="item" src="${ICON(c.type)}" alt="">` : "<span style='width:42px;text-align:center'>?</span>"}
     <span>${c.type ? esc(pretty(c.type).replace(/ \(.+\)$/, "")) : "Unknown"}</span><b>×${c.count}</b></div>`).join("");

  const val = (p, k) => (k === "kd" ? (p.deaths ? p.kills / p.deaths : p.kills * 1000) : k === "name" ? p.name.toLowerCase() : p[k]);
  rows.sort((a, b) => (val(a, sortKey) > val(b, sortKey) ? 1 : val(a, sortKey) < val(b, sortKey) ? -1 : 0) * sortDir);

  const head = [["name", "Player"], ["guild", "Guild"], [null, "Weapon"], ["ip", "IP", "n"], ["kills", "Kills", "n"], ["deaths", "Deaths", "n"], ["kd", "K/D", "n"], ["killFame", "Kill fame", "n"]];
  $("table").innerHTML =
    `<thead><tr>${head.map(([k, l, c]) => `<th class="${c || ""}" data-k="${k || ""}">${l}${k === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((p, i) => `<tr><td class="name">${sortKey === "kills" && sortDir < 0 && i < 3 && p.kills ? `<span class="rank">${i + 1}</span>` : ""}${esc(p.name)}</td><td class="muted">${esc(p.guild)}</td>
      <td>${p.weapon ? `<img class="item" src="${ICON(p.weapon)}" title="${esc(pretty(p.weapon))}" alt="">` : '<span class="muted">—</span>'}</td>
      <td class="n muted">${p.ip || "—"}</td><td class="n good">${p.kills}</td><td class="n bad">${p.deaths}</td>
      <td class="n">${kd(p.kills, p.deaths)}</td><td class="n fame">${fame(p.killFame)}</td></tr>`).join("") +
    `<tr class="total"><td>Total</td><td></td><td></td><td class="n">${avgIp || "—"}</td><td class="n">${K}</td><td class="n">${D}</td><td class="n">${kd(K, D)}</td><td class="n">${fame(KF)}</td></tr></tbody>`;
  $("table").querySelectorAll("th[data-k]").forEach((th) => th.dataset.k && th.addEventListener("click", () => {
    sortDir = sortKey === th.dataset.k ? -sortDir : -1;
    sortKey = th.dataset.k;
    render();
  }));

  $("missing").textContent = missing.length ? `Not in this battle (${missing.length}): ${missing.join(", ")}` : "";
  $("results").hidden = false;
}

$("go").addEventListener("click", run);
$("battle").addEventListener("keydown", (e) => e.key === "Enter" && run());
$("share").addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareUrl());
  $("share").textContent = "✅ Copied!";
  setTimeout(() => ($("share").textContent = "🔗 Copy share link"), 1500);
});

// open a shared link
const q = new URLSearchParams(location.search);
if (q.get("b") && q.get("n")) {
  const b = q.get("b").split(",");
  $("battle").value = b.length > 1 ? `https://europe.albionbb.com/battles/multi?ids=${b.join(",")}` : `https://europe.albionbb.com/battles/${b[0]}`;
  $("names").value = q.get("n").split("~").join("\n");
  updateCount();
  run();
}
