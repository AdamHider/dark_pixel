/* Панель разделов игры: рисует SECTIONS для текущего GameState и обновляет строку ресурсов сверху. */

import { SECTIONS } from '../game/sections.js';

const NUMBER = new Intl.NumberFormat('ru-RU');

export function createSectionsPanel(state, options = {}) {
    const panel = document.getElementById('sections-panel');
    const title = document.getElementById('sections-title');
    const summary = document.getElementById('sections-summary');
    const actions = document.getElementById('sections-actions');
    const resources = document.getElementById('turn-resources');

    let openId = null;

    function sectionById(id) {
        return SECTIONS.find(section => section.id === id) || SECTIONS[0];
    }

    function renderSummary(section) {
        if (section.html === 'diplomacy' && options.renderDiplomacy) {
            summary.innerHTML = options.renderDiplomacy();
            return;
        }
        summary.textContent = section.summary(state).join('\n');
    }

    function renderActions(section) {
        actions.innerHTML = '';
        for (const action of section.actions || []) {
            const button = document.createElement('button');
            button.textContent = action.label;
            button.addEventListener('click', () => {
                action.run(state);
                refresh();
                if (options.onChange) options.onChange();
            });
            actions.appendChild(button);
        }
    }

    function renderResources() {
        if (!resources) return;
        const faction = state.factionInfo(state.currentFaction);
        const gold = state.treasury[state.currentFaction] ?? 0;
        const income = state.income[state.currentFaction] ?? 0;
        resources.textContent = faction
            ? `${faction.name} · 💰 ${NUMBER.format(gold)} (${income >= 0 ? '+' : ''}${income}) · 👥 ${NUMBER.format(faction.population)}`
            : 'Фракций нет';
    }

    // Перерисовать всё по текущему состоянию.
    function refresh() {
        renderResources();
        if (openId) {
            const section = sectionById(openId);
            renderSummary(section);
            renderActions(section);
        }
    }

    // Показать раздел (по умолчанию — первый).
    function show(id) {
        openId = id || SECTIONS[0].id;
        const section = sectionById(openId);
        title.textContent = `${section.icon} ${section.title}`;
        panel.hidden = false;
        renderSummary(section);
        renderActions(section);
    }

    // Открыть раздел или закрыть панель, если он уже открыт.
    function toggle(id) {
        if (openId === id && !panel.hidden) {
            panel.hidden = true;
            return;
        }
        show(id);
    }

    refresh();
    return { show, toggle, refresh };
}
