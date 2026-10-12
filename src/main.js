/* ============================================================
   Точка входа: создаём генератор и рендерер, подключаем кнопки.
   Все параметры генерации можно переопределить здесь (полный список — src/map/defaults.js).
   ============================================================ */
import { MapGenerator } from './map/map-generator.js';
import { MapRenderer } from './render/renderer/map-renderer.js';
import { bindChoiceGroup, bindPanelToggles, bindToggle } from './ui/controls.js';
import { demoObjects } from './ui/demo-objects.js';
import { describeRegion, describeStats, describeTile } from './ui/describe.js';

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

function buildMap() {
    generator.generate(Number(seedInput.value) || 1);
    renderer.refresh();
    info.textContent = describeStats(generator);
}

/* ---------- События карты ---------- */

renderer.onHover = tile => {
    if (tile) info.textContent = describeTile(tile);
};

renderer.onSelect = (tile, region) => {
    if (!tile) {
        selectionPanel.hidden = true;
        return;
    }
    selectionPanel.hidden = false;
    selectionPanel.textContent = region
        ? `Клетка ${describeTile(tile)}\n${describeRegion(region)}`
        : `Клетка ${describeTile(tile)}`;
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
bindPanelToggles();

buildMap();
