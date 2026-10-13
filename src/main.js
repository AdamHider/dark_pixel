/* ============================================================
   Точка входа: создаём генератор и рендерер, подключаем кнопки.
   Все параметры генерации можно переопределить здесь (полный список — src/map/defaults.js).
   ============================================================ */
import { MapGenerator } from './map/map-generator.js';
import { MapRenderer } from './render/renderer/map-renderer.js';
import { GameState } from './game/game-state.js';
import { RESOURCE_KINDS } from './game/economy.js';
import { bindChoiceGroup, bindPanelToggles, bindToggle } from './ui/controls.js';
import { demoObjects } from './ui/demo-objects.js';
import { describeRegion, describeStats, describeTile } from './ui/describe.js';
import { createSectionsPanel } from './ui/sections-panel.js';

const generator = new MapGenerator({
    size: 150,
    // shapeVariety: 1,       // 0..1: изрезанность континента (заливы, полуострова)
    // coastDetail: 0.2,      // 0..1: мелкая изрезанность береговой линии (0 — гладкие берега)
    // islandDensity: 0.8,    // 0..1: больше островов
    // inlandSeaStrength: 0.5,// внутренние моря
    // aridity: 0.1,          // меньше степей и пустынь
    // waterShare: 0.5,       // больше суши
    // mountainShare: 0.2,    // больше гор
    // riverCount: 30,
    // regionMinSize: 5,
    // regionMaxSize: 8,
    // --- зоны ---
    // steppeShare: 0.1,      // 0..1: доля карты под степями (0 — только обычные сухие места)
    // deadLandShare: 0.08,   // 0..1: доля карты под мёртвыми землями
    // etherLandShare: 0.06,  // 0..1: доля карты под землями эфира
    // etherLandDensity: 0.7, // 0..1: плотность эфира внутри эфирных земель
    // --- поселения и поля ---
    // settlementsPerRegionMax: 3,  // максимум групп поселений в одном регионе
    // wheatMinPerRegion: 2,        // минимум полей в каждом подходящем регионе
});

const renderer = new MapRenderer(document.getElementById('map'), generator, {
    // tileSize: 16,        // размер клетки в пикселях (в игре всегда 16)
});
const info = document.getElementById('info');
const selectionPanel = document.getElementById('selection');
const seedInput = document.getElementById('seed');

// Состояние партии (ходы, экономика, дипломатия, армия) и панель разделов.
const gameState = new GameState(generator);
const sectionsPanel = createSectionsPanel(gameState, {
    onChange: () => syncGame(),
    renderDiplomacy: () => renderDiplomacy(),
    renderEconomy: () => renderEconomy()
});
renderer.setArmyModel(gameState);

// Превью карты (синяя копия) и список фракций с культурой — содержимое раздела «Дипломатия».
function renderDiplomacy() {
    const preview = renderer.thumbnail(220);
    const rows = [];
    for (let f = 0; f < gameState.factionCount; f++) {
        const faction = gameState.factionInfo(f);
        const culture = gameState.cultureOf(f);
        const you = f === gameState.playerFaction ? ' (вы)' : '';
        const status = f === gameState.playerFaction ? '—' : relationName(gameState.relationLevel(gameState.playerFaction, f));
        rows.push(`
            <div class="diplo-row">
                <span class="diplo-swatch" style="background:${gameState.cultureColor(f)}"></span>
                <span class="diplo-name">${faction ? faction.name : `Фракция ${f + 1}`}${you}</span>
                <span class="diplo-culture">${culture ? culture.name : '—'}</span>
                <span class="diplo-status">${status}</span>
            </div>`);
    }
    return `
        <div class="diplo-preview">
            ${preview ? `<img src="${preview}" alt="Карта" width="220" height="220">` : '<em>нет превью</em>'}
        </div>
        <div class="diplo-list">${rows.join('')}</div>`;
}

function relationName(level) {
    return { war: 'война', ally: 'союз', neutral: 'нейтрально' }[level] || level;
}

// Карточки экономики: у каждой фракции — казна, население и приток/баланс всех четырёх ресурсов карты.
function renderEconomy() {
    const rows = [];
    for (let f = 0; f < gameState.factionCount; f++) {
        const faction = gameState.factionInfo(f);
        const flow = gameState.flowOf(f);
        const you = f === gameState.playerFaction ? ' (вы)' : '';
        const cells = RESOURCE_KINDS.map(kind => {
            const value = flow.income[kind.key];
            const balance = flow.balance[kind.key];
            const cls = balance >= 0 ? 'eco-plus' : 'eco-minus';
            return `<span class="eco-cell">${kind.icon} ${kind.name}: <b>${value}</b>
                <i class="${cls}">(${balance >= 0 ? '+' : ''}${balance})</i></span>`;
        }).join('');
        rows.push(`
            <div class="eco-card">
                <div class="eco-head">
                    <span class="diplo-swatch" style="background:${gameState.cultureColor(f)}"></span>
                    <span class="diplo-name">${faction ? faction.name : `Фракция ${f + 1}`}${you}</span>
                    <span class="eco-gold">💰 ${gameState.treasury[f]}</span>
                </div>
                <div class="eco-cells">${cells}</div>
            </div>`);
    }
    return `<div class="eco-list">${rows.join('')}</div>`;
}

// Единая синхронизация: после смены состояния обновляем слой армий и панели.
function syncGame() {
    renderer.setViewerFaction(gameState.playerFaction);
    renderer.setArmies(gameState.armies);
    renderer.setRelations(gameState.relationLevels());
    const thumb = document.getElementById('diplo-thumb');
    if (thumb) thumb.src = renderer.thumbnail(64);
    sectionsPanel.refresh();
}

function buildMap() {
    generator.generate(Number(seedInput.value) || 1);
    renderer.refresh();
    info.textContent = describeStats(generator);
    gameState.reset(generator);      // новая карта — новая партия
    syncGame();
}

/* ---------- События карты ---------- */

renderer.onHover = tile => {
    if (tile) info.textContent = describeTile(tile);
};

renderer.onSelect = (tile, region) => {
    // Если выбрана армия и клик в пределах достижимой зоны — армия идёт туда.
    const army = renderer.armySelection;
    if (army && tile && gameState.canReach(army, tile.index)) {
        gameState.moveArmy(army.id, tile.index);
        renderer.refreshArmyZone();   // отряд на новом месте — пересчитать зону и обновить карту
        syncGame();
        info.textContent = `Отряд перешёл в (${tile.x}, ${tile.y}) · осталось ходов: ${army.moves}`;
        return;
    }
    if (!tile) {
        selectionPanel.hidden = true;
        return;
    }
    selectionPanel.hidden = false;
    selectionPanel.textContent = region
        ? `Клетка ${describeTile(tile)}\n${describeRegion(region)}`
        : `Клетка ${describeTile(tile)}`;
};

// Клик по армии: своя — выбираем (показать достижимую зону), чужая — просто сведения.
renderer.onArmyClick = army => {
    const own = army.faction === gameState.playerFaction;
    if (!own) {
        info.textContent = `Отряд фракции ${army.faction + 1} · сила ${army.strength}`;
        return;
    }
    renderer.selectArmy(army);
    info.textContent = `Отряд выбран · сила ${army.strength} · ходов: ${army.moves}. Кликните клетку в подсвеченной зоне.`;
};

renderer.onObjectClick = object => {
    info.textContent = `Объект: ${object.id}`;
};

/* ---------- Кнопки ---------- */

document.getElementById('generate').addEventListener('click', () => {
    seedInput.value = Math.floor(Math.random() * 99999);
    buildMap();
});
seedInput.addEventListener('change', buildMap);
document.getElementById('borders').addEventListener('change', e => renderer.setShowBorders(e.target.checked));
document.getElementById('factions').addEventListener('change', e => renderer.setShowFactions(e.target.checked));
document.getElementById('fit').addEventListener('click', () => renderer.fitToView());

bindChoiceGroup('season', season => renderer.setSeason(season));
bindChoiceGroup('view', view => renderer.setView(view));
bindToggle('demo-objects', on => renderer.setObjects(on ? demoObjects(generator) : []));
bindToggle('mood', on => renderer.setMood(on ? 'dark' : 'light'));
bindToggle('settlements', on => renderer.setShowSettlements(on));
bindToggle('fortresses', on => renderer.setShowFortresses(on));
bindPanelToggles();

// Кнопки разделов игры (Ходы, Экономика, Дипломатия, Армия).
for (const button of document.querySelectorAll('[data-section]')) {
    button.addEventListener('click', () => sectionsPanel.toggle(button.dataset.section));
}

buildMap();
