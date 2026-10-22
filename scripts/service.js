/**
 * Mode Service : les joueurs tiennent la taverne.
 *
 * Le MJ actif fait autorité : il garde l'état du service, fait avancer le temps,
 * valide chaque action envoyée par les joueurs (socket) et renvoie l'état à tout le monde.
 * Les joueurs n'écrivent rien eux-mêmes ; entre deux envois, ils extrapolent l'horloge
 * pour animer les jauges.
 *
 * Les durées sont en secondes de service (le MJ peut mettre le service en pause ou l'accélérer).
 * Les prix sont en pièces de cuivre.
 */

import { MODULE_ID, SOCKET, t, warn, esc } from "./constants.js";
import { sceneTavern, getTavern, consumeStock } from "./store.js";
import { priceToCp, walletToCp, pay, receive, cashGiven, formatCp } from "./currency.js";
import { applyEffects } from "./effects.js";
import { missingZone, maxTableZone, tableZoneName } from "./zones.js";

/** Réglages du jeu (secondes, places…). */
export const SERVICE = Object.freeze({
  tick: 100,          // ms entre deux pas de la boucle du MJ
  heartbeat: 3,       // s entre deux renvois de l'état sans événement (recalage des horloges)
  stoves: 3,          // feux en cuisine
  boards: 2,          // places sur la planche
  tray: 3,            // places sur un plateau
  burn: 9,            // temps pour sortir un plat prêt avant qu'il brûle
  perfectTakeOut: 2,  // sorti en moins de 2 s : plat parfait
  walk: 1.6,          // aller servir une table
  tapSpeed: 55,       // remplissage de la chope (% par seconde)
  tapMin: 55,         // en dessous : trop peu, on recommence
  tapPerfect: [75, 90],
  logSize: 40
});

/**
 * Chronomètre des commandes : il part de 0 quand le client commande et s'arrête quand tout est servi.
 * Plus c'est rapide, plus le pourboire est gros. Les paliers se comptent en multiples du « temps visé »
 * de la commande (préparation des plats + un peu de marche), réglable par le MJ.
 */
export const TIERS = Object.freeze([
  { key: "lightning", max: 1, tip: 0.4 },
  { key: "fast", max: 1.5, tip: 0.25 },
  { key: "ok", max: 2.5, tip: 0.1 },
  { key: "slow", max: Infinity, tip: 0 }
]);

/** Palier atteint pour un temps donné. */
export function tierOf(elapsed, target) {
  const ratio = elapsed / Math.max(1, target);
  return TIERS.find((tier) => ratio <= tier.max) ?? TIERS[TIERS.length - 1];
}

/** Temps écoulé sur une commande (figé une fois tout servi). */
export function ticketElapsed(ticket, now = serviceNow()) {
  return ticket.serveTime ?? Math.max(0, now - ticket.created);
}

/** Nombre de tables d'un service : de 1 à 12. */
export const TABLES = Object.freeze({ min: 1, max: 12 });

/** Nombre de tables choisi par le MJ pour le prochain service (au moins les tables posées en zone). */
export function plannedTables(scene = canvas?.scene) {
  let n = 6;
  try {
    n = Number(game.settings.get(MODULE_ID, "tables")) || 6;
  } catch {
    /* réglage pas encore enregistré */
  }
  return Math.min(TABLES.max, Math.max(TABLES.min, n, maxTableZone(scene)));
}

/** Change le nombre de tables prévu (MJ, réglage du monde). */
export async function setPlannedTables(n) {
  const value = Math.min(TABLES.max, Math.max(TABLES.min, Math.floor(Number(n) || 6)));
  await game.settings.set(MODULE_ID, "tables", value);
  return value;
}

/** Délai moyen entre deux clients selon l'affluence. */
export const RUSH = Object.freeze({ calm: 38, normal: 22, rush: 11 });

/** Clients de passage. */
const NPC_NAMES = [
  "Gaspard le meunier", "Mère Agathe", "Deux gardes", "Un barde fauché", "Tilda la forgeronne", "Un marchand nain",
  "Trois fermiers", "Une elfe voyageuse", "Le fils du bourgmestre", "Un ménestrel", "Une patrouille", "Le vieux Bram",
  "Une prêtresse", "Des colporteurs", "Un chasseur de primes", "Deux apprentis mages"
];

const runtime = {
  state: null,
  summary: null,
  base: { t: 0, at: 0 },
  timer: null,
  lastBeat: 0,
  pending: false,
  listeners: new Set()
};

/* ============================================ */
/*  Lecture (tous les clients)                  */
/* ============================================ */

/** État courant du service (null s'il n'y en a pas). Ne pas le modifier directement. */
export function getService() {
  return runtime.state;
}

/** Bilan du dernier service terminé (null sinon). */
export function getSummary() {
  return runtime.summary;
}

/** Heure de service, extrapolée entre deux envois du MJ. */
export function serviceNow() {
  const s = runtime.state;
  if (!s) return 0;
  if (!s.running) return s.t;
  return s.t + ((performance.now() - runtime.base.at) / 1000) * s.speed;
}

/** Prévient quand l'état change. Retourne la fonction pour se désabonner. */
export function onServiceChange(fn) {
  runtime.listeners.add(fn);
  return () => runtime.listeners.delete(fn);
}

function notifyLocal() {
  for (const fn of runtime.listeners) {
    try {
      fn(runtime.state);
    } catch (err) {
      warn(err);
    }
  }
}

/** « 1:05 » */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Temps moyen de service d'une liste de stats. */
export function averageTime(stats) {
  return stats.served ? formatTime(stats.totalTime / stats.served) : "—";
}

/** Nom donné à une table : celui de la taverne, sinon celui de la Région « Table » de la scène. */
function resolveTableName(tavern, n, scene = canvas?.scene) {
  return tavern?.tables?.[n] || tableZoneName(scene, n) || "";
}

function newTable(n, tavern, scene) {
  return { n, name: resolveTableName(tavern, n, scene), ticket: null, reserved: null, paidNote: null };
}

/** Nom d'affichage d'une table du service en cours (« Coin du feu », ou « Table 3 »). */
export function tableName(n, s = runtime.state) {
  const table = s?.tables?.find((tb) => tb.n === Number(n));
  return table?.name || t("Service.Table", { n });
}

/** Ajoute le nom de la table aux données d'un texte qui en contient le numéro. */
function withTable(data = {}) {
  return data && data.n !== undefined && data.table === undefined ? { ...data, table: tableName(data.n) } : data;
}

export function menuItem(s, id) {
  return s?.menu.find((m) => m.id === id) ?? null;
}

export function ticketTotal(s, ticket) {
  return ticket.items.reduce((sum, it) => sum + (menuItem(s, it.m)?.price ?? 0), 0);
}

export function isBusy(staff, now = serviceNow()) {
  return !!staff?.busy && (staff.busy.end === null || staff.busy.end > now);
}

const isAuthority = () => !!game.users.activeGM?.isSelf;

/* ============================================ */
/*  Socket                                      */
/* ============================================ */

/** Envoie une action au MJ (ou l'applique directement si on est le MJ actif). */
export async function sendOp(op) {
  if (isAuthority()) return applyOp(game.user, op);
  if (!game.users.activeGM) return ui.notifications.warn(t("Service.Notice.NoGM"));
  game.socket.emit(SOCKET, { action: "service", userId: game.user.id, op });
}

/** Messages du socket qui concernent le service. Retourne true s'il a été traité. */
export async function handleServiceSocket(message) {
  switch (message?.action) {
    case "service":
      if (isAuthority()) await applyOp(game.users.get(message.userId), message.op);
      return true;
    case "serviceSync":
      if (isAuthority()) emitState();
      return true;
    case "serviceState":
      if (!isAuthority()) receiveState(message.state, message.summary);
      return true;
    case "serviceNotice":
      if (message.userId === game.user.id) ui.notifications[message.kind ?? "warn"](t(message.key, message.data));
      return true;
  }
  return false;
}

/**
 * Au chargement : un joueur demande l'état au MJ ; le MJ actif annonce le sien
 * (aucun service après un rechargement), pour que personne ne garde un service fantôme.
 */
export function requestSync() {
  if (isAuthority()) emitState();
  else game.socket.emit(SOCKET, { action: "serviceSync" });
}

function receiveState(state, summary) {
  runtime.state = state;
  runtime.summary = summary ?? null;
  runtime.base = { t: state?.t ?? 0, at: performance.now() };
  notifyLocal();
}

function emitState() {
  game.socket.emit(SOCKET, { action: "serviceState", state: runtime.state, summary: runtime.summary });
}

/** Renvoie l'état à tout le monde (regroupé : un seul envoi par tour de boucle). */
function broadcast() {
  if (runtime.pending) return;
  runtime.pending = true;
  queueMicrotask(() => {
    runtime.pending = false;
    runtime.lastBeat = runtime.state?.t ?? 0;
    emitState();
    notifyLocal();
  });
}

function notice(user, key, data = {}, kind = "warn") {
  data = withTable(data);
  if (!user || user.id === game.user.id) ui.notifications[kind](t(key, data));
  else game.socket.emit(SOCKET, { action: "serviceNotice", userId: user.id, key, data, kind });
}

/* ============================================ */
/*  Ouvrir et fermer (MJ)                       */
/* ============================================ */

/** Ouvre un service dans la taverne de la scène (MJ). */
export async function openService({ tavern = sceneTavern(), tables = plannedTables() } = {}) {
  if (!game.user.isGM) return;
  if (!isAuthority()) return ui.notifications.warn(t("Service.Notice.NotActiveGM"));
  if (!tavern) return ui.notifications.warn(t("Menu.NoTavern"));
  const menu = tavern.menu
    .filter((i) => i.station !== "none")
    .map((i) => ({
      id: i.id,
      name: i.name || t("Item.Unnamed"),
      category: i.category,
      price: priceToCp(i.price),
      station: i.station,
      time: i.prepTime,
      stock: i.stock,
      alcohol: i.alcohol,
      tempHp: i.tempHp
    }));
  if (!menu.length) return ui.notifications.warn(t("Service.Notice.NoMenu"));

  const count = Math.min(TABLES.max, Math.max(TABLES.min, Math.floor(Number(tables) || 6)));
  runtime.summary = null;
  runtime.state = {
    id: foundry.utils.randomID(),
    tavernId: tavern.id,
    sceneId: canvas?.scene?.id ?? null,
    tavernName: tavern.name || t("Tavern.Unnamed"),
    effects: tavern.effects,
    running: false,
    t: 0,
    speed: 1,
    rush: "normal",
    patienceMul: 1,
    nextArrival: 4,
    seq: 1,
    menu,
    consumed: {},
    tables: Array.from({ length: count }, (_, i) => newTable(i + 1, tavern, canvas?.scene)),
    tickets: {},
    stove: Array(SERVICE.stoves).fill(null),
    board: Array(SERVICE.boards).fill(null),
    pass: [],
    staff: {},
    stats: { served: 0, revenue: 0, tips: 0, happy: 0, finished: 0, perfect: 0, burnt: 0, spilled: 0, totalTime: 0, lightning: 0 },
    log: []
  };
  runtime.base = { t: 0, at: performance.now() };
  log("Opened", { tavern: runtime.state.tavernName });
  startLoop();
  broadcast();

  await ChatMessage.create({
    content: `<div class="otium-chat"><p class="otium-chat-head"><i class="fa-solid fa-bell-concierge"></i> ${t("Service.Chat.Opened", { tavern: esc(runtime.state.tavernName) })}</p><p class="hint">${t("Service.Chat.OpenedHint")}</p></div>`,
    flags: { [MODULE_ID]: { service: true } }
  });
}

function startLoop() {
  clearInterval(runtime.timer);
  runtime.timer = setInterval(tick, SERVICE.tick);
}

function stopLoop() {
  clearInterval(runtime.timer);
  runtime.timer = null;
}

/** Termine le service : bilan, stocks reportés sur la taverne, message dans le chat. */
async function endService() {
  const s = runtime.state;
  if (!s) return;
  stopLoop();
  const staff = Object.values(s.staff).map((st) => ({ id: st.id, name: st.name }));
  const share = staff.length ? Math.floor(s.stats.tips / staff.length) : 0;
  runtime.summary = {
    tavernId: s.tavernId,
    tavernName: s.tavernName,
    t: s.t,
    stats: { ...s.stats },
    staff,
    share,
    paid: false
  };
  runtime.state = null;
  broadcast();

  // Les articles consommés pendant le service sortent du stock de la taverne
  const lines = Object.entries(s.consumed).map(([id, qty]) => ({ id, qty }));
  if (lines.length) await consumeStock(s.tavernId, lines);

  const st = runtime.summary.stats;
  await ChatMessage.create({
    content: `<div class="otium-chat"><p class="otium-chat-head"><i class="fa-solid fa-door-closed"></i> ${t("Service.Chat.Closed", { tavern: esc(s.tavernName) })}</p>
      <p>${t("Service.Summary.Line", { served: st.served, avg: averageTime(st) })}</p>
      <p>${t("Service.Summary.Money", { revenue: formatCp(st.revenue), tips: formatCp(st.tips) })}</p></div>`,
    flags: { [MODULE_ID]: { service: true } }
  });
}

/** Verse les pourboires du dernier service sur les fiches des serveurs (MJ). */
export async function payTips() {
  const summary = runtime.summary;
  if (!game.user.isGM || !summary || summary.paid || !summary.share) return;
  for (const { id } of summary.staff) {
    const actor = game.actors.get(id);
    if (actor) await actor.update({ "system.currency": receive(actor.system?.currency, summary.share) });
  }
  summary.paid = true;
  broadcast();
  ui.notifications.info(t("Service.Summary.Paid", { share: formatCp(summary.share) }));
}

/** Efface le bilan (MJ). */
export function dismissSummary() {
  if (!game.user.isGM) return;
  runtime.summary = null;
  broadcast();
}

/* ============================================ */
/*  Boucle (MJ actif)                           */
/* ============================================ */

function tick() {
  const s = runtime.state;
  if (!s || !s.running) return;
  if (!isAuthority()) return;
  const dt = (SERVICE.tick / 1000) * s.speed;
  s.t += dt;
  runtime.base = { t: s.t, at: performance.now() };
  if (step(dt)) broadcast();
  else if (s.t - runtime.lastBeat >= SERVICE.heartbeat * s.speed) {
    runtime.lastBeat = s.t;
    emitState();
  }
}

function step() {
  const s = runtime.state;
  let dirty = false;

  for (const st of Object.values(s.staff)) {
    if (st.busy && st.busy.end !== null && s.t >= st.busy.end) {
      const then = st.busy.then;
      st.busy = null;
      resolveBusy(st, then);
      dirty = true;
    }
  }

  s.stove.forEach((slot, i) => {
    if (!slot) return;
    if (slot.state === "cooking" && s.t >= slot.readyAt) {
      slot.state = "ready";
      dirty = true;
    } else if (slot.state === "ready" && s.t >= slot.readyAt + SERVICE.burn) {
      slot.state = "burnt";
      s.stats.burnt++;
      log("Burnt", { dish: menuItem(s, slot.m)?.name, n: i + 1 }, "bad");
      dirty = true;
    }
  });

  if (s.t >= s.nextArrival) {
    if (spawn()) dirty = true;
    s.nextArrival = s.t + (0.6 + Math.random() * 0.8) * RUSH[s.rush];
  }
  return dirty;
}

function log(key, data = {}, kind = "") {
  const s = runtime.state;
  if (!s) return;
  s.log.unshift({ t: s.t, key, data: key === "TablesChanged" || key === "Burnt" ? data : withTable(data), kind });
  if (s.log.length > SERVICE.logSize) s.log.length = SERVICE.logSize;
}

/* ============================================ */
/*  Clients                                     */
/* ============================================ */

function available(s) {
  return s.menu.filter((m) => m.stock === null || m.stock - (s.consumed[m.id] ?? 0) > 0);
}

/** Réserve les articles d'une commande (stock limité du service). */
function consume(s, items) {
  for (const m of items) {
    const item = menuItem(s, m);
    if (item?.stock !== null) s.consumed[m] = (s.consumed[m] ?? 0) + 1;
  }
}

function newTicket(table, { name, kind = "npc", actorId = null, items, hurry = false }) {
  const s = runtime.state;
  const id = `T${s.seq++}`;
  // Temps visé : préparation de chaque article, un peu de marche, puis la marge réglée par le MJ
  const prep = items.reduce((sum, m) => {
    const item = menuItem(s, m);
    return sum + (item?.station === "tap" ? 5 : (item?.time ?? 4) + 3);
  }, 0);
  const target = Math.round((12 + prep) * s.patienceMul * (hurry ? 0.6 : 1));
  s.tickets[id] = {
    id,
    table: table.n,
    name,
    kind,
    actorId,
    hurry,
    items: items.map((m) => ({ m, served: false, perfect: false })),
    phase: "order",
    target,
    created: s.t,
    serveTime: null,
    tier: null,
    calling: false,
    cashier: null
  };
  table.ticket = id;
  table.reserved = kind === "player" ? actorId : null;
  table.paidNote = null;
  consume(s, items);
  log("Ordered", { n: table.n, name, items: items.map((m) => menuItem(s, m)?.name).join(", ") });
  return s.tickets[id];
}

function spawn({ hurry = false, big = false, user = null } = {}) {
  const s = runtime.state;
  const free = s.tables.filter((tb) => !tb.ticket && !tb.reserved);
  if (!free.length) {
    if (user) notice(user, "Service.Notice.Full");
    return null;
  }
  const choices = available(s);
  if (!choices.length) {
    if (user) notice(user, "Service.Notice.SoldOut");
    return null;
  }
  const table = free[Math.floor(Math.random() * free.length)];
  const count = big ? 5 : Math.random() < 0.45 ? 1 : Math.random() < 0.7 ? 2 : 3;
  const items = [];
  for (let i = 0; i < count; i++) {
    const pool = available(s).filter((m) => m.stock === null || m.stock - (s.consumed[m.id] ?? 0) - items.filter((x) => x === m.id).length > 0);
    if (!pool.length) break;
    items.push(pool[Math.floor(Math.random() * pool.length)].id);
  }
  const base = big ? t("Service.BigTable") : NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
  return newTicket(table, { name: hurry ? t("Service.Hurried", { name: base }) : base, items, hurry });
}

function closeTicket(ticket) {
  const s = runtime.state;
  const table = s.tables.find((tb) => tb.n === ticket.table);
  if (table && table.ticket === ticket.id) table.ticket = null;
  delete s.tickets[ticket.id];
}

/* ============================================ */
/*  Serveurs                                    */
/* ============================================ */

function setBusy(st, key, data, duration, then = null) {
  const s = runtime.state;
  data = withTable(data);
  st.busy = { key, data, start: s.t, end: duration === null ? null : s.t + duration, then };
}

function resolveBusy(st, then) {
  const s = runtime.state;
  if (!then) return;
  if (then.type === "board") {
    const slot = s.board[then.slot];
    if (slot) {
      s.pass.push({ uid: s.seq++, m: slot.m, perfect: false });
      s.board[then.slot] = null;
    }
  }
  if (then.type === "serve") serveTable(st, then.table);
}

function serveTable(st, n) {
  const s = runtime.state;
  const table = s.tables.find((tb) => tb.n === n);
  const ticket = table?.ticket && s.tickets[table.ticket];
  if (!ticket || ticket.phase !== "order") return;
  let count = 0;
  st.tray = st.tray.filter((dish) => {
    const need = ticket.items.find((it) => !it.served && it.m === dish.m);
    if (!need) return true;
    need.served = true;
    need.perfect = dish.perfect;
    count++;
    return false;
  });
  if (!count) return;
  ticket.calling = false;
  if (ticket.items.every((it) => it.served)) {
    ticket.serveTime = s.t - ticket.created;
    ticket.tier = tierOf(ticket.serveTime, ticket.target).key;
    ticket.phase = "bill";
    s.stats.served++;
    s.stats.totalTime += ticket.serveTime;
    if (ticket.tier === "lightning") s.stats.lightning++;
    log("ServedAll", { staff: st.name, n, time: formatTime(ticket.serveTime), tier: t(`Service.Tier.${ticket.tier}`) }, "good");
  } else {
    log("ServedSome", { staff: st.name, n, count });
  }
}

/** Encaissement : vérifie la monnaie rendue, paie la taverne, débite un joueur client. */
async function settle(st, ticket, change) {
  const s = runtime.state;
  const due = ticketTotal(s, ticket);
  const expected = cashGiven(due) - due;
  // Pourboire selon la rapidité du service (un client pressé donne plus s'il est servi vite)
  const tier = TIERS.find((x) => x.key === ticket.tier) ?? TIERS[TIERS.length - 1];
  let tip = Math.round(due * tier.tip * (ticket.hurry ? 1.5 : 1)) + ticket.items.filter((it) => it.perfect).length;
  let happy = tier.key !== "slow";
  let revenue = due;
  let result = "Exact";

  if (change < expected) {
    tip = 0;
    happy = false;
    result = "Short";
    log("ChangeShort", { staff: st.name, n: ticket.table }, "bad");
  } else if (change > expected) {
    revenue -= change - expected;
    result = "Over";
    log("ChangeOver", { staff: st.name, n: ticket.table, amount: formatCp(change - expected) }, "bad");
  }

  let paidNote = null;
  if (ticket.kind === "player") {
    tip = 0;
    const actor = game.actors.get(ticket.actorId);
    const wallet = actor ? pay(actor.system?.currency, due) : null;
    if (!wallet) {
      revenue = 0;
      happy = false;
      log("CannotPay", { n: ticket.table, name: ticket.name }, "bad");
    } else {
      await actor.update({ "system.currency": wallet });
      paidNote = { key: "Service.Client.PaidNote", data: { total: formatCp(due) } };
      if (s.effects) await applyPlayerEffects(actor, ticket);
    }
  }

  s.stats.revenue += Math.max(0, revenue);
  s.stats.tips += tip;
  s.stats.finished++;
  if (happy) s.stats.happy++;
  if (tip) log("PaidTip", { n: ticket.table, total: formatCp(due), tip: formatCp(tip) }, "good");
  else log("Paid", { n: ticket.table, total: formatCp(due) }, "good");

  const table = s.tables.find((tb) => tb.n === ticket.table);
  closeTicket(ticket);
  if (ticket.kind === "player" && table) {
    table.reserved = ticket.actorId;
    table.paidNote = paidNote;
  }
  return { result, tip, expected, change };
}

/** Effets en jeu (ivresse, PV temporaires) d'une commande de joueur, au moment de payer. */
async function applyPlayerEffects(actor, ticket) {
  const s = runtime.state;
  const counts = new Map();
  for (const it of ticket.items) counts.set(it.m, (counts.get(it.m) ?? 0) + 1);
  const lines = [...counts].map(([m, qty]) => ({ item: menuItem(s, m), qty })).filter((l) => l.item);
  try {
    const notes = await applyEffects(actor, lines);
    if (notes.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="otium-chat">${notes.map((n) => `<p class="otium-chat-note">${esc(n)}</p>`).join("")}</div>`,
        flags: { [MODULE_ID]: { service: true } }
      });
    }
  } catch (err) {
    warn("Effets impossibles", err);
  }
}

/* ============================================ */
/*  Actions (validées par le MJ actif)          */
/* ============================================ */

const GM_ONLY = new Set(["start", "pause", "speed", "rush", "patience", "spawn", "end", "tables"]);
const STAFF_OPS = new Set(["launch", "takeOut", "trash", "prep", "take", "drop", "serve", "tap", "cashStart", "cashEnd", "cashCancel"]);
const FREE_WHEN_BUSY = new Set(["take", "drop", "trash", "cashEnd", "cashCancel"]);

function owns(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
  return actor.isOwner;
}

/**
 * Applique une action. Exécuté seulement chez le MJ actif.
 * @param {User} user  qui la demande
 * @param {object} op  { type, actorId?, … }
 */
export async function applyOp(user, op) {
  const s = runtime.state;
  if (!op?.type || !user) return;
  if (!s) return notice(user, "Service.Notice.NoService");
  if (GM_ONLY.has(op.type) && !user.isGM) return;

  const actor = op.actorId ? game.actors.get(op.actorId) : null;
  if (op.actorId && !owns(user, actor)) return notice(user, "Service.Notice.NotYours");

  const st = op.actorId ? s.staff[op.actorId] : null;
  if (STAFF_OPS.has(op.type)) {
    if (!st) return notice(user, "Service.Notice.NotStaff");
    if (!FREE_WHEN_BUSY.has(op.type) && isBusy(st, s.t)) return notice(user, "Service.Notice.Busy", { name: st.name });
    if (!s.running && op.type !== "drop" && op.type !== "take") return notice(user, "Service.Notice.Paused");
    // Postes de service (Régions) : l'action doit être faite depuis un poste qui l'autorise
    const zoneOp = op.type === "serve" && op.uid !== undefined ? "take" : op.type;
    const missing = missingZone(s.sceneId, st.id, zoneOp);
    if (missing === "any") return notice(user, "Service.Notice.NotInStation", { name: st.name });
    if (missing) return notice(user, "Service.Notice.NotHere", { name: st.name, zone: t(`Zone.${missing}`) });
  }

  const changed = await OPS[op.type]?.({ s, user, op, actor, st });
  if (changed !== false) broadcast();
}

const OPS = {
  /* ---- MJ ---- */
  start: ({ s }) => {
    s.running = true;
    log("Started");
  },
  pause: ({ s }) => {
    s.running = false;
    log("PausedLog");
  },
  speed: ({ s, op }) => {
    s.speed = op.value === 2 ? 2 : 1;
  },
  rush: ({ s, op }) => {
    if (!RUSH[op.value]) return false;
    s.rush = op.value;
    s.nextArrival = Math.min(s.nextArrival, s.t + RUSH[s.rush]);
  },
  patience: ({ s, op }) => {
    s.patienceMul = Math.min(2, Math.max(0.5, Number(op.value) || 1));
  },
  /* Ajouter ou retirer des tables en cours de service (on ne retire que des tables libres, en fin de salle) */
  tables: ({ s, op, user }) => {
    const want = Math.min(TABLES.max, Math.max(TABLES.min, Math.floor(Number(op.value) || s.tables.length)));
    if (want === s.tables.length) return false;
    if (want > s.tables.length) {
      const tavern = getTavern(s.tavernId);
      const scene = game.scenes.get?.(s.sceneId) ?? canvas?.scene;
      for (let n = s.tables.length + 1; n <= want; n++) s.tables.push(newTable(n, tavern, scene));
    } else {
      while (s.tables.length > want) {
        const last = s.tables[s.tables.length - 1];
        if (last.ticket || last.reserved) {
          notice(user, "Service.Notice.TableBusy", { n: last.n });
          break;
        }
        s.tables.pop();
      }
    }
    log("TablesChanged", { n: s.tables.length });
  },
  spawn: ({ op, user }) => {
    if (!spawn({ hurry: op.variant === "hurry", big: op.variant === "big", user })) return false;
  },
  end: () => endService(),

  /* ---- Prendre ou quitter son poste ---- */
  join: ({ s, actor }) => {
    if (s.staff[actor.id]) return false;
    s.staff[actor.id] = { id: actor.id, name: actor.name, tray: [], busy: null, lastTap: null };
    log("Joined", { staff: actor.name });
  },
  leave: ({ s, actor }) => {
    const st = s.staff[actor.id];
    if (!st) return false;
    s.pass.push(...st.tray);
    for (const ticket of Object.values(s.tickets)) if (ticket.cashier === st.id) ticket.cashier = null;
    delete s.staff[actor.id];
    log("Left", { staff: st.name });
  },

  /* ---- Cuisine ---- */
  launch: ({ s, op, st, user }) => {
    const i = Number(op.slot);
    const item = menuItem(s, op.m);
    if (!item || item.station !== "stove" || i < 0 || i >= s.stove.length || s.stove[i]) return notice(user, "Service.Notice.Unavailable");
    s.stove[i] = { m: item.id, start: s.t, readyAt: s.t + item.time, state: "cooking" };
    setBusy(st, "Launch", { dish: item.name }, 0.8);
  },
  takeOut: ({ s, op, st, user }) => {
    const i = Number(op.slot);
    const slot = s.stove[i];
    if (!slot || slot.state !== "ready") return notice(user, "Service.Notice.Unavailable");
    // Envoyé directement à une table : la table doit attendre ce plat, et il faut une place sur le plateau
    let target = null;
    if (op.table !== undefined) {
      const table = s.tables.find((tb) => tb.n === Number(op.table));
      const ticket = table?.ticket && s.tickets[table.ticket];
      if (!ticket || ticket.phase !== "order" || !ticket.items.some((it) => !it.served && it.m === slot.m)) {
        return notice(user, "Service.Notice.NotWaiting", { n: Number(op.table) });
      }
      if (st.tray.length >= SERVICE.tray) return notice(user, "Service.Notice.TrayFull");
      target = table.n;
    }
    const dish = { uid: s.seq++, m: slot.m, perfect: s.t - slot.readyAt < SERVICE.perfectTakeOut };
    s.stove[i] = null;
    if ((op.toTray || target !== null) && st.tray.length < SERVICE.tray) st.tray.push(dish);
    else s.pass.push(dish);
    if (target !== null) setBusy(st, "Walk", { n: target }, 0.5 + SERVICE.walk, { type: "serve", table: target });
    else setBusy(st, "TakeOut", {}, 0.5);
  },
  trash: ({ s, op }) => {
    const i = Number(op.slot);
    if (s.stove[i]?.state !== "burnt") return false;
    s.stove[i] = null;
  },

  /* ---- Planche et cave ---- */
  prep: ({ s, op, st, user }) => {
    const item = menuItem(s, op.m);
    const i = s.board.findIndex((b) => !b);
    if (!item || item.station !== "board" || i < 0) return notice(user, "Service.Notice.Unavailable");
    s.board[i] = { m: item.id, staff: st.id, start: s.t, end: s.t + item.time };
    setBusy(st, "Prep", { dish: item.name }, item.time, { type: "board", slot: i });
  },

  /* ---- Tireuse : le joueur a relâché, on juge le niveau ---- */
  tap: ({ s, op, st, user }) => {
    const item = menuItem(s, op.m);
    if (!item || item.station !== "tap") return notice(user, "Service.Notice.Unavailable");
    const level = Number(op.level) || 0;
    let key;
    if (level >= 100) {
      key = "Spilled";
      s.stats.spilled++;
    } else if (level < SERVICE.tapMin) {
      key = "TooLittle";
    } else {
      const perfect = level >= SERVICE.tapPerfect[0] && level <= SERVICE.tapPerfect[1];
      s.pass.push({ uid: s.seq++, m: item.id, perfect });
      if (perfect) s.stats.perfect++;
      key = perfect ? "Perfect" : "Fine";
    }
    st.lastTap = { key, at: s.t };
  },

  /* ---- Comptoir et plateau ---- */
  take: ({ s, op, st, user }) => {
    if (st.tray.length >= SERVICE.tray) return notice(user, "Service.Notice.TrayFull");
    const i = s.pass.findIndex((d) => d.uid === Number(op.uid));
    if (i < 0) return false;
    st.tray.push(s.pass.splice(i, 1)[0]);
  },
  drop: ({ s, op, st }) => {
    const i = st.tray.findIndex((d) => d.uid === Number(op.uid));
    if (i < 0) return false;
    s.pass.push(st.tray.splice(i, 1)[0]);
  },
  serve: ({ s, op, st, user }) => {
    const n = Number(op.table);
    const table = s.tables.find((tb) => tb.n === n);
    const ticket = table?.ticket && s.tickets[table.ticket];
    if (!ticket || ticket.phase !== "order") return notice(user, "Service.Notice.Unavailable");
    // Glissé directement du comptoir : le plat passe d'abord sur le plateau
    if (op.uid !== undefined) {
      if (st.tray.length >= SERVICE.tray) return notice(user, "Service.Notice.TrayFull");
      const i = s.pass.findIndex((d) => d.uid === Number(op.uid));
      if (i >= 0) st.tray.push(s.pass.splice(i, 1)[0]);
    }
    if (!st.tray.some((d) => ticket.items.some((it) => !it.served && it.m === d.m))) return notice(user, "Service.Notice.NothingFor", { n });
    setBusy(st, "Walk", { n }, SERVICE.walk, { type: "serve", table: n });
  },

  /* ---- Caisse ---- */
  cashStart: ({ s, op, st, user }) => {
    const table = s.tables.find((tb) => tb.n === Number(op.table));
    const ticket = table?.ticket && s.tickets[table.ticket];
    if (!ticket || ticket.phase !== "bill") return notice(user, "Service.Notice.Unavailable");
    if (ticket.cashier && ticket.cashier !== st.id) return notice(user, "Service.Notice.Cashing", { name: s.staff[ticket.cashier]?.name });
    ticket.cashier = st.id;
    setBusy(st, "Cash", { n: table.n }, null);
  },
  cashCancel: ({ s, st }) => {
    for (const ticket of Object.values(s.tickets)) if (ticket.cashier === st.id) ticket.cashier = null;
    st.busy = null;
  },
  cashEnd: async ({ s, op, st, user }) => {
    const ticket = Object.values(s.tickets).find((tk) => tk.cashier === st.id);
    st.busy = null;
    if (!ticket) return notice(user, "Service.Notice.ClientGone");
    const r = await settle(st, ticket, Math.max(0, Math.floor(Number(op.change) || 0)));
    if (r.result === "Exact") notice(user, r.tip ? "Service.Notice.Exact" : "Service.Notice.ExactNoTip", { tip: formatCp(r.tip) }, "info");
    else if (r.result === "Short") notice(user, "Service.Notice.Short", { amount: formatCp(r.expected - r.change) });
    else notice(user, "Service.Notice.Over", { amount: formatCp(r.change - r.expected) });
  },

  /* ---- Clients joueurs ---- */
  sit: ({ s, op, actor, user }) => {
    const table = s.tables.find((tb) => tb.n === Number(op.table));
    if (!table) return notice(user, "Service.Notice.NoSuchTable", { n: op.table });
    if (table.reserved === actor.id) return false;
    if (table.ticket || table.reserved) return notice(user, "Service.Notice.TableTaken");
    const current = s.tables.find((tb) => tb.reserved === actor.id);
    // Déjà attablé sans commande en cours : il change de table
    if (current?.ticket) return notice(user, "Service.Notice.AlreadySeated");
    if (current) {
      current.reserved = null;
      current.paidNote = null;
    }
    table.reserved = actor.id;
    table.paidNote = null;
    log("Sat", { name: actor.name, n: table.n });
  },
  standUp: ({ s, actor }) => {
    const table = s.tables.find((tb) => tb.reserved === actor.id && !tb.ticket);
    if (!table) return false;
    table.reserved = null;
    table.paidNote = null;
  },
  order: ({ s, op, actor, user }) => {
    const table = s.tables.find((tb) => tb.reserved === actor.id && !tb.ticket);
    if (!table) return notice(user, "Service.Notice.NotSeated");
    const items = (Array.isArray(op.items) ? op.items : []).filter((m) => menuItem(s, m));
    if (!items.length) return notice(user, "Order.Empty");
    for (const m of new Set(items)) {
      const item = menuItem(s, m);
      const left = item.stock === null ? Infinity : item.stock - (s.consumed[m] ?? 0);
      if (items.filter((x) => x === m).length > left) return notice(user, "Order.OutOfStock", { name: item.name });
    }
    const due = items.reduce((sum, m) => sum + menuItem(s, m).price, 0);
    if (walletToCp(actor.system?.currency) < due) return notice(user, "Order.NotEnough", { name: actor.name });
    newTicket(table, { name: actor.name, kind: "player", actorId: actor.id, items });
  },
  call: ({ s, actor }) => {
    const ticket = Object.values(s.tickets).find((tk) => tk.actorId === actor.id);
    if (!ticket || ticket.calling) return false;
    ticket.calling = true;
    log("Called", { n: ticket.table, name: ticket.name });
  }
};
