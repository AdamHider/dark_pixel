/* Состояние партии: ходы, экономика, дипломатия, армия.

   Это «модель» игры — чистые данные без DOM и рисования. Карта даёт страты (фракции и их население),
   а GameState добавляет то, что меняется по ходу партии: номер хода, казну каждой фракции, отношения
   между фракциями и отряды. Интерфейс (панель разделов) только читает это состояние и вызывает действия. */

import { clamp } from '../core/math.js';
import { pairKey } from '../core/pairs.js';
import { AIController } from './ai.js';
import { CULTURE_COLORS, cultureById } from './cultures.js';

// Настроек пока мало, поэтому держим их константами — легко вынести в defaults.js, когда понадобится.
const START_TREASURY = 100;     // с какой казной начинает фракция
const POPULATION_PER_GOLD = 40; // сколько населения даёт одну монету дохода за ход
const ARMY_UPKEEP = 2;          // сколько золота в ход стоит один отряд
const RELATION_MIN = -100;      // «война»
const RELATION_MAX = 100;       // «союз»
const ALLY_FROM = 40;           // отношение ≥ этого — союз
const WAR_BELOW = -40;          // отношение ≤ этого — война
const ARMY_RANGE = 3;           // на сколько клеток (по суше) отряд может пройти за один ход
const ARMY_ZOC = 1;             // зона охвата/перехвата: соседние клетки вокруг отряда

export class GameState {
    constructor(generator) {
        this.generator = generator;
        this.reset(generator);
    }

    // Новая партия по текущей карте (вызывать после каждой генерации).
    reset(generator = this.generator) {
        this.generator = generator;
        this.turn = 1;
        this.currentFaction = 0;
        this.playerFaction = 0;      // за кого играет игрок (его армии двигаются, его карта в «Политике»)
        this.factionCount = generator.factions ? generator.factions.length : 0;

        // Дипломатия: отношение для каждой пары фракций (-100..100).
        this.relations = new Map();

        // Армия: по одному стартовому отряду в центре самого крупного региона фракции.
        this.armies = [];
        for (let f = 0; f < this.factionCount; f++) this.spawnArmy(f);

        // Экономика: казна и доход каждой фракции (доход считает и содержание отрядов — потому после армий).
        this.treasury = [];
        this.income = [];
        for (let f = 0; f < this.factionCount; f++) {
            this.treasury[f] = START_TREASURY;
            this.income[f] = this.monthlyIncome(f);
        }

        // ИИ неигровых фракций.
        this.ai = new AIController(this);
    }

    /* ---------- Ходы ---------- */

    // Полный ход: каждая фракция получает доход и действует. За игрока действует интерфейс, за остальных — ИИ.
    endTurn() {
        const turn = this.advanceTurn();
        this.ai.takeTurn();
        this.resetArmyMoves();
        return { turn, income: this.income.slice() };
    }

    // Доход всех фракций и переход «хождения» к следующей фракции (без действий ИИ).
    advanceTurn() {
        for (let f = 0; f < this.factionCount; f++) {
            this.treasury[f] += this.income[f];
            this.income[f] = this.monthlyIncome(f);
        }
        this.currentFaction = this.factionCount > 0 ? (this.currentFaction + 1) % this.factionCount : 0;
        if (this.currentFaction === 0) this.turn++;
        return this.turn;
    }

    /* ---------- Экономика ---------- */

    // Доход фракции за ход: население её регионов минус содержание отрядов.
    monthlyIncome(factionId) {
        const faction = this.factionInfo(factionId);
        const population = faction ? faction.population : 0;
        const upkeep = this.armies.filter(a => a.faction === factionId).length * ARMY_UPKEEP;
        return Math.max(1, Math.round(population / POPULATION_PER_GOLD) - upkeep);
    }

    factionInfo(factionId) {
        return this.generator.factions ? this.generator.factions[factionId] || null : null;
    }

    /* ---------- Дипломатия ---------- */

    // Текущее отношение между двумя фракциями (0 — нейтралитет).
    relation(a, b) {
        if (a === b) return RELATION_MAX;
        return this.relations.get(this.relationKey(a, b)) || 0;
    }

    // Изменить отношение (шаг дипломатии). Значение всегда в пределах -100..100.
    changeRelation(a, b, delta) {
        if (a === b) return;
        const key = this.relationKey(a, b);
        this.relations.set(key, clamp((this.relations.get(key) || 0) + delta, RELATION_MIN, RELATION_MAX));
    }

    relationKey(a, b) {
        return pairKey(a, b);
    }

    // Культура фракции и её цвет — для панели дипломатии (синяя/чёрная/... с квадратиком цвета).
    cultureOf(factionId) {
        const faction = this.factionInfo(factionId);
        return cultureById(faction && faction.culture !== undefined ? faction.culture : factionId);
    }

    cultureColor(factionId) {
        const culture = this.cultureOf(factionId);
        return culture ? culture.color : CULTURE_COLORS[0];
    }

    // Уровень отношений пары: 'war' | 'neutral' | 'ally' (по порогам WAR_BELOW / ALLY_FROM).
    relationLevel(a, b) {
        if (a === b) return 'ally';
        const value = this.relation(a, b);
        if (value <= WAR_BELOW) return 'war';
        if (value >= ALLY_FROM) return 'ally';
        return 'neutral';
    }

    // Все пары фракций с их уровнями отношений — ключ «a|b» -> 'war' | 'neutral' | 'ally' (для отрисовки границ).
    relationLevels() {
        const levels = new Map();
        for (let a = 0; a < this.factionCount; a++) {
            for (let b = a + 1; b < this.factionCount; b++) levels.set(this.relationKey(a, b), this.relationLevel(a, b));
        }
        return levels;
    }

    /* ---------- Армия ---------- */

    // Новый отряд фракции; встаёт в центр самого крупного её региона (или в первую клетку суши).
    spawnArmy(factionId) {
        const faction = this.factionInfo(factionId);
        const tile = (faction && faction.regions.length > 0)
            ? this.regionCenter(this.biggestRegion(faction))
            : (this.generator.landTiles[0] || 0);
        const army = {
            id: `army-${factionId}-${this.armies.length}`,
            faction: factionId,
            tile,
            strength: 100,
            moves: ARMY_RANGE            // сколько клеток ещё можно пройти в этом ходу
        };
        this.armies.push(army);
        return army;
    }

    // Самый крупный регион фракции (по числу клеток) — там и ставим стартовый отряд.
    biggestRegion(faction) {
        let best = faction.regions[0];
        for (const id of faction.regions) {
            if ((this.generator.regionSizes[id] || 0) > (this.generator.regionSizes[best] || 0)) best = id;
        }
        return best;
    }

    regionCenter(regionId) {
        const region = this.generator.getRegionInfo(regionId);
        if (!region || region.tiles.length === 0) return 0;
        return region.tiles[Math.floor(region.tiles.length / 2)];
    }

    armyById(id) {
        return this.armies.find(a => a.id === id) || null;
    }

    // Все клетки, до которых отряд может дойти за свои очки движения (по суше, не через воду).
    reachableTiles(army) {
        const distance = this.landDistances(army.tile, army.moves);
        distance.delete(army.tile);   // стартовая клетка не считается «достижимой»
        return distance;
    }

    canReach(army, tile) {
        return this.reachableTiles(army).has(tile);
    }

    // Клетки, куда доходит зона охвата/перехвата отряда (соседи в радиусе ARMY_ZOC).
    zoneOfControl(army) {
        const zone = new Set();
        for (const tile of this.neighborsWithin(army.tile, ARMY_ZOC)) {
            if (tile !== army.tile) zone.add(tile);
        }
        return zone;
    }

    // Все клетки в радиусе radius (по суше) вокруг стартовой.
    neighborsWithin(start, radius) {
        return this.landDistances(start, radius).keys();
    }

    // Обход суши в ширину: клетка -> число шагов от start (не дальше radius). Общий для двух методов выше.
    landDistances(start, radius) {
        const distance = new Map([[start, 0]]);
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            const tile = queue[head];
            const step = distance.get(tile);
            if (step >= radius) continue;
            for (const next of this.generator.neighbors(tile)) {
                if (!this.generator.isLand(next) || distance.has(next)) continue;
                distance.set(next, step + 1);
                queue.push(next);
            }
        }
        return distance;
    }

    // Переместить отряд, потратив очки движения на пройденный путь (заготовка без учёта перехвата).
    moveArmy(id, tile) {
        const army = this.armyById(id);
        if (!army) return null;
        const step = this.reachableTiles(army).get(tile);
        if (step === undefined) return army;
        army.tile = tile;
        army.moves = Math.max(0, army.moves - step);
        return army;
    }

    // Восстановить очки движения всем отрядам (начало хода).
    resetArmyMoves() {
        for (const army of this.armies) army.moves = ARMY_RANGE;
    }
}
