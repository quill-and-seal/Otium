/**
 * Onglet « Otium » de la barre latérale, réservé au MJ.
 *
 * Tout ce dont le MJ a besoin pendant une séance, au même endroit :
 * la taverne de la scène (l'ouvrir, la changer, la modifier), puis le pilotage du service.
 * Les fenêtres détaillées restent accessibles depuis l'onglet.
 *
 * Enregistré au hook « setup » (on sait alors si l'utilisateur est MJ, et l'interface n'est pas encore créée).
 * Sans l'API des onglets de Foundry, rien n'est ajouté : les outils MJ restent dans le groupe Jetons.
 */

import { MODULE_ID, FLAG_TAVERN, t, esc, warn } from "./constants.js";
import { getTaverns, sceneTavern, setSceneTavern } from "./store.js";
import { openApps, openMenu, openTavernList, TavernConfig, languageButton, toggleLanguage } from "./apps.js";
import { getService } from "./service.js";
import { zonesVisible, toggleZones } from "./zone-overlay.js";
import { GM_SERVICE_ACTIONS, gmServiceHtml, bindGMInputs, updateLiveIn, ensureLive, openServiceGM } from "./service-apps.js";

export const TAB_NAME = "otium";

let registered = false;

/** L'onglet est-il en place ? (sinon les outils MJ restent dans le groupe Jetons) */
export function hasSidebarTab() {
  return registered;
}

export function registerSidebarTab() {
  const Base = foundry.applications?.sidebar?.AbstractSidebarTab;
  const Sidebar = foundry.applications?.sidebar?.Sidebar;
  if (!game.user?.isGM || !Base || !Sidebar?.TABS || !CONFIG.ui) return false;

  try {
    class OtiumSidebarTab extends Base {
      static tabName = TAB_NAME;

      static DEFAULT_OPTIONS = {
        classes: ["otium", "otium-service", "otium-sidebar"],
        actions: {
          ...GM_SERVICE_ACTIONS,
          openTaverns: () => openTavernList(),
          editTavern: () => {
            const tavern = sceneTavern();
            if (tavern) new TavernConfig(tavern.id).render({ force: true });
          },
          previewTavern: () => {
            const tavern = sceneTavern();
            if (tavern) openMenu(tavern.id);
          },
          popout: () => openServiceGM(),
          toggleLanguage: () => toggleLanguage(),
          toggleZones: () => toggleZones()
        }
      };

      /** Redessin en attente pendant que l'onglet n'est pas affiché. */
      #dirty = false;

      async _renderHTML() {
        const div = document.createElement("div");
        div.className = "otium-body";
        div.innerHTML = this.#html();
        return div;
      }

      _replaceHTML(result, content) {
        content.replaceChildren(result);
      }

      _onFirstRender(context, options) {
        super._onFirstRender?.(context, options);
        openApps.add(this);
        ensureLive();
      }

      _onRender(context, options) {
        super._onRender?.(context, options);
        this.#dirty = false;
        bindGMInputs(this.element);
        this.element.querySelector("select[name=sceneTavern]")?.addEventListener("change", async (event) => {
          await setSceneTavern(canvas?.scene, event.target.value || null);
        });
      }

      _onClose(options) {
        super._onClose?.(options);
        openApps.delete(this);
      }

      _onActivate() {
        super._onActivate?.();
        if (this.#dirty) this.render();
      }

      /** Ne redessine que si l'onglet est visible ; sinon, au prochain affichage. */
      #refresh() {
        if (!this.rendered) return;
        if (this.active === false && !this.isPopout) {
          this.#dirty = true;
          return;
        }
        this.render();
      }

      onDataChanged() {
        this.#refresh();
      }

      onServiceChanged() {
        this.#refresh();
      }

      updateLive() {
        if (getService() && this.active !== false) updateLiveIn(this.element);
      }

      #html() {
        const scene = canvas?.scene;
        const current = scene?.getFlag(MODULE_ID, FLAG_TAVERN) ?? "";
        const taverns = Object.values(getTaverns()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        const options = [
          `<option value="">${t("Sidebar.NoTavern")}</option>`,
          ...taverns.map((tv) => `<option value="${tv.id}" ${tv.id === current ? "selected" : ""}>${esc(tv.name || t("Tavern.Unnamed"))}</option>`)
        ].join("");
        const tavern = sceneTavern();
        const running = !!getService();

        return `
          <header class="otium-sidebar-head">
            <h2><i class="fa-solid fa-beer-mug-empty"></i> Otium</h2>
            <span class="hint">${esc(scene?.name ?? t("Sidebar.NoScene"))}</span>
            ${languageButton()}
          </header>

          <section class="otium-sidebar-section">
            <h3 class="otium-section">${t("Sidebar.Tavern")}</h3>
            ${scene
              ? `<select name="sceneTavern" ${running ? "disabled" : ""} data-tooltip="${esc(running ? t("Sidebar.LockedDuringService") : t("Sidebar.TavernHint"))}">${options}</select>`
              : `<p class="hint">${t("Sidebar.NoScene")}</p>`}
            ${tavern && tavern.keeper ? `<p class="hint"><i class="fa-solid fa-user"></i> ${esc(tavern.keeper)}</p>` : ""}
            <div class="otium-row">
              <button type="button" data-action="previewTavern" ${tavern ? "" : "disabled"}><i class="fa-solid fa-eye"></i> ${t("List.Preview")}</button>
              <button type="button" data-action="editTavern" ${tavern ? "" : "disabled"}><i class="fa-solid fa-pen"></i> ${t("List.Edit")}</button>
              <button type="button" data-action="openTaverns"><i class="fa-solid fa-store"></i> ${t("Sidebar.AllTaverns")}</button>
            </div>
            <button type="button" class="otium-zones-toggle ${zonesVisible() ? "active" : ""}" data-action="toggleZones" aria-pressed="${zonesVisible()}">
              <i class="fa-solid ${zonesVisible() ? "fa-eye" : "fa-eye-slash"}"></i> ${t(zonesVisible() ? "Sidebar.HideZones" : "Sidebar.ShowZones")}
            </button>
          </section>

          <section class="otium-sidebar-section">
            <h3 class="otium-section">${t("Sidebar.Service")}</h3>
            ${gmServiceHtml()}
            <div class="otium-row">
              <button type="button" data-action="popout"><i class="fa-solid fa-up-right-from-square"></i> ${t("Sidebar.Popout")}</button>
            </div>
          </section>`;
      }
    }

    CONFIG.ui[TAB_NAME] = OtiumSidebarTab;

    // Avant l'onglet des réglages, qui reste le dernier
    const descriptor = { tooltip: "OTIUM.Sidebar.Tab", icon: "fa-solid fa-beer-mug-empty", gmOnly: true };
    const tabs = {};
    for (const [name, config] of Object.entries(Sidebar.TABS)) {
      if (name === "settings") tabs[TAB_NAME] = descriptor;
      tabs[name] = config;
    }
    tabs[TAB_NAME] ??= descriptor;
    Sidebar.TABS = tabs;
    registered = true;
    return true;
  } catch (err) {
    warn("Onglet de la barre latérale indisponible", err);
    return false;
  }
}
