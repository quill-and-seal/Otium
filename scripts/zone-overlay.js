/**
 * Affichage des postes de service pour le MJ.
 *
 * Sur la scène, chaque Région « Otium — Poste de service » est dessinée avec un contour coloré
 * selon ce qu'on y fait (cuisine, tireuse, cave…) et une étiquette : le nom de la zone, ses tâches
 * et, pendant un service, les personnages qui s'y trouvent. Seul le MJ le voit ; il l'affiche ou
 * le masque depuis l'onglet Otium (réglage client « showZones »).
 */

import { MODULE_ID, t, warn } from "./constants.js";
import { STATION_BEHAVIOR } from "./zones.js";
import { getService, onServiceChange, tableName } from "./service.js";

/** Couleur de chaque type de poste (la première tâche cochée donne la couleur). */
const COLORS = {
  stove: 0xe0743a,
  board: 0x6fae7c,
  tap: 0xe0a548,
  pass: 0xc9b79c,
  cash: 0x7fb2e5,
  table: 0xb58ad6
};

/** Ordre de priorité pour choisir la couleur d'un poste qui fait plusieurs choses. */
const PRIORITY = ["stove", "tap", "board", "cash", "pass"];

let layer = null;
let timer = null;

export function zonesVisible() {
  try {
    return !!game.user?.isGM && game.settings.get(MODULE_ID, "showZones") !== false;
  } catch {
    return false;
  }
}

/** Affiche ou masque les postes (bouton de l'onglet Otium). */
export async function toggleZones() {
  await game.settings.set(MODULE_ID, "showZones", !zonesVisible());
}

/** Redessine bientôt (plusieurs changements d'affilée ne coûtent qu'un dessin). */
export function refreshZoneOverlay() {
  clearTimeout(timer);
  timer = setTimeout(draw, 60);
}

export function clearZoneOverlay() {
  clearTimeout(timer);
  if (layer && !layer.destroyed) layer.destroy({ children: true });
  layer = null;
}

onServiceChange(() => {
  if (layer) refreshZoneOverlay();
});

function behaviorsOf(region) {
  const list = region.behaviors?.contents ?? [...(region.behaviors ?? [])];
  return list.filter((b) => b.type === STATION_BEHAVIOR && !b.disabled);
}

/** Polygones d'une Région (en points plats x0, y0, x1, y1…). */
function polygonsOf(region) {
  const polygons = region.polygons ?? region.object?.polygons ?? [];
  return polygons.filter((p) => p?.points?.length >= 6 && p.isPositive !== false).map((p) => p.points);
}

/** Personnages joueurs dont le jeton est dans la Région. */
function charactersIn(region, scene) {
  const tokens = scene.tokens?.contents ?? [...(scene.tokens ?? [])];
  return tokens
    .filter((tk) => tk.actor?.type === "character" && (tk.regions?.has?.(region) ?? false))
    .map((tk) => tk.actor.name);
}

function label(region, zone, scene) {
  const lines = [];
  if (zone.mode === "table") {
    const service = getService();
    const name = service ? tableName(zone.table) : region.name || t("Service.Table", { n: zone.table });
    lines.push(name);
    if (name !== t("Service.Table", { n: zone.table })) lines.push(t("Service.Table", { n: zone.table }));
  } else {
    lines.push(region.name || t("Card.Station"));
    const actions = [...(zone.actions ?? [])].map((a) => t(`Zone.${a}`));
    lines.push(actions.length ? actions.join(" · ") : t("Card.Nothing"));
  }
  if (getService()) {
    const who = charactersIn(region, scene);
    if (who.length) lines.push(`▸ ${who.join(", ")}`);
  }
  return lines.join("\n");
}

function colorOf(zone) {
  if (zone.mode === "table") return COLORS.table;
  const actions = new Set(zone.actions ?? []);
  const first = PRIORITY.find((a) => actions.has(a));
  return first ? COLORS[first] : COLORS.pass;
}

function draw() {
  clearZoneOverlay();
  const scene = canvas?.scene;
  if (!zonesVisible() || !scene || !canvas?.ready || !globalThis.PIXI) return;
  const parent = canvas.interface ?? canvas.controls ?? canvas.stage;
  if (!parent) return;

  try {
    layer = new PIXI.Container();
    layer.name = "otium-zones";
    layer.eventMode = "none";
    const grid = scene.grid?.size ?? canvas.dimensions?.size ?? 100;

    for (const region of scene.regions ?? []) {
      for (const behavior of behaviorsOf(region)) {
        const zone = behavior.system ?? {};
        const color = colorOf(zone);
        const polygons = polygonsOf(region);
        if (!polygons.length) continue;

        const g = new PIXI.Graphics();
        for (const points of polygons) {
          g.lineStyle({ width: Math.max(2, grid / 30), color, alpha: 0.9 });
          g.beginFill(color, 0.12);
          g.drawPolygon(points);
          g.endFill();
        }
        layer.addChild(g);

        // Étiquette au centre du plus grand polygone
        const pts = polygons.reduce((a, b) => (b.length > a.length ? b : a));
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < pts.length; i += 2) {
          cx += pts[i];
          cy += pts[i + 1];
        }
        cx /= pts.length / 2;
        cy /= pts.length / 2;

        const text = new PIXI.Text(label(region, zone, scene), {
          fontFamily: "Signika, sans-serif",
          fontSize: Math.max(14, grid / 4),
          fontWeight: "600",
          fill: 0xffffff,
          align: "center",
          stroke: 0x111111,
          strokeThickness: Math.max(3, grid / 25),
          lineJoin: "round"
        });
        text.anchor.set(0.5);
        text.position.set(cx, cy);
        layer.addChild(text);
      }
    }
    parent.addChild(layer);
  } catch (err) {
    warn("Affichage des postes impossible", err);
    clearZoneOverlay();
  }
}
