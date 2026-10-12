import { createRandom } from '../core/random.js';
import { ValueNoise } from '../core/value-noise.js';
import { Terrain, BIOME_COUNT } from './constants.js';
import { DEFAULTS } from './defaults.js';
import { climate } from './steps/climate.js';
import { elevation } from './steps/elevation.js';
import { factions } from './steps/factions.js';
import { regions } from './steps/regions.js';
import { resources } from './steps/resources.js';
import { rivers } from './steps/rivers.js';
import { roads } from './steps/roads.js';
import { settlements } from './steps/settlements.js';
import { terrain } from './steps/terrain.js';

/* ============================================================
   MapGenerator
   Хранит карту в плоских массивах: клетка (x, y) — это индекс y * size + x.
   ============================================================ */
export class MapGenerator {
    static DEFAULTS = DEFAULTS;

    constructor(options = {}) {
        this.options = { ...MapGenerator.DEFAULTS, ...options };
        this.size = this.options.size;
    }

    /* ---------- Главный метод ---------- */

    generate(seed = this.options.seed) {
        this.seed = seed;
        this.random = createRandom(seed);
        this.createNoiseLayers();
        this.allocateLayers();

        this.generateElevation();
        this.scatterIslands();
        this.generateMoisture();
        this.classifyTerrain();
        this.removeSmallMountains();
        this.removeSmallIslands();
        this.collectLandTiles();
        this.fillDepressions();
        this.computeWaterDepth();
        this.generateTemperature();
        this.assignBiomes();
        this.placeResources();
        this.generateRivers();
        this.classifyShores();
        this.placeRareResources();
        this.placeRiverCrossings();
        this.buildRegions();
        this.distributeWheat();
        this.placeSettlements();
        this.buildFactions();
        this.buildRoads();
        return this;
    }

    createNoiseLayers() {
        this.noise = {
            elevation: new ValueNoise(this.seed + 1),
            ridge: new ValueNoise(this.seed + 2),
            temperature: new ValueNoise(this.seed + 3),
            moisture: new ValueNoise(this.seed + 4),
            warpX: new ValueNoise(this.seed + 5),
            warpY: new ValueNoise(this.seed + 6),
            forest: new ValueNoise(this.seed + 7),
            fertility: new ValueNoise(this.seed + 8),
            shape: new ValueNoise(this.seed + 9),
            basin: new ValueNoise(this.seed + 10),
            regionShape: new ValueNoise(this.seed + 11),
            islands: new ValueNoise(this.seed + 12),
            massif: new ValueNoise(this.seed + 13),
            forestClumps: new ValueNoise(this.seed + 14),
            fertilityClumps: new ValueNoise(this.seed + 15),
            ore: new ValueNoise(this.seed + 16),
            fault: new ValueNoise(this.seed + 17),
            shore: new ValueNoise(this.seed + 18),
            iron: new ValueNoise(this.seed + 19),
            coastDetail: new ValueNoise(this.seed + 20),
            deadLand: new ValueNoise(this.seed + 21),
            etherLand: new ValueNoise(this.seed + 22),
            steppe: new ValueNoise(this.seed + 23)
        };
    }

    allocateLayers() {
        const count = this.size * this.size;
        this.elevation = new Float32Array(count);
        this.moisture = new Float32Array(count);
        this.ridge = new Float32Array(count);         // 0..1: насколько клетка похожа на горный хребет
        this.temperature = new Float32Array(count);
        this.terrain = new Uint8Array(count);
        this.population = new Uint16Array(count);     // население в клетке с поселением
        this.settlementLevel = new Uint8Array(count); // уровень клетки с поселением 1..4 (0 — нет поселения)
        this.settlements = [];                        // по записи на каждую клетку с поселением: { id, groupId, regionId, tile, population, level, center }
        this.settlementGroups = [];                   // группы соседних клеток: { id, regionId, tiles, tile (центр), population }
        this.settlementGroup = new Int16Array(count).fill(-1); // номер группы поселений в клетке, -1 — нет
        this.regionPopulation = {};                   // id региона -> население
        this.roadLevel = new Uint8Array(count);       // 0 — нет дороги, 1..3 — насколько она наезжена
        this.roadLinks = new Uint8Array(count);       // биты: в какие из 8 сторон (ROAD_DIRECTIONS) идёт дорога из клетки
        this.shore = new Uint8Array(count);           // тип берега (Shore) у суши рядом с водой и реками
        this.crossing = new Uint8Array(count);        // 0 — нет, 1 — брод, 2 — каменный мост
        this.mountainHeight = new Float32Array(count); // 0 вне гор; 0.3..1 в горах — по нему рисуется рельеф
        this.massif = new Float32Array(count);        // 0..1: крупные «пятна» для горных массивов
        this.riverTo = new Int32Array(count).fill(-1); // куда течёт река из этой клетки (-1 — не река или сток за краем карты)
        this.riverFlow = new Uint16Array(count);      // сколько воды проходит через клетку (определяет ширину реки)
        this.waterDepth = new Uint8Array(count);      // 0 на суше; в воде — расстояние до ближайшей суши
        this.biome = new Uint8Array(count);
        this.resource = new Uint8Array(count);
        this.river = new Uint8Array(count);           // 0 — реки нет, 1..3 — её глубина
        this.regionId = new Int16Array(count).fill(-1); // -1 — клетка вне региона (вода)
        this.regionSizes = {};                        // id региона -> число клеток
        this.factionId = new Int16Array(count).fill(-1); // -1 — клетка вне фракции (вода), иначе id фракции
        this.factions = [];                           // по записи на фракцию: { id, name, regions, tiles, population }
        this.landTiles = [];                          // индексы всех клеток суши
    }

    /* ---------- Вспомогательные методы для работы с клетками ---------- */

    index(x, y) {
        return y * this.size + x;
    }

    // Четыре соседние клетки (вверх, вниз, влево, вправо) внутри карты.
    neighbors(i) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        const result = [];
        if (x > 0) result.push(i - 1);
        if (x < this.size - 1) result.push(i + 1);
        if (y > 0) result.push(i - this.size);
        if (y < this.size - 1) result.push(i + this.size);
        return result;
    }

    isLand(i) {
        return this.terrain[i] >= Terrain.PLAIN;
    }

    // Восемь соседей, включая диагональных.
    neighbors8(i) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        const result = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) result.push(ny * this.size + nx);
            }
        }
        return result;
    }

    /* ---------- Сводка по региону (для интерфейса) ---------- */

    getRegionInfo(regionId) {
        if (regionId < 0) return null;
        const tiles = this.landTiles.filter(i => this.regionId[i] === regionId);
        const info = {
            id: regionId,
            tiles,
            size: tiles.length,
            mountains: 0,
            riverTiles: 0,
            population: this.regionPopulation[regionId] || 0,
            settlements: [],
            coastal: false,
            resources: [0, 0, 0, 0, 0, 0, 0],   // по кодам Resource (0 — клетки без ресурса)
            biomes: new Array(BIOME_COUNT).fill(0),    // по кодам Biome (без гор)
            factionId: -1,
            factionName: null
        };
        const factionId = this.factionId ? this.factionId[tiles[0]] : -1;
        if (factionId >= 0) {
            info.factionId = factionId;
            info.factionName = this.factionName(factionId);
        }
        info.settlements = this.settlements.filter(s => s.regionId === regionId);
        for (const i of tiles) {
            if (this.terrain[i] === Terrain.MOUNTAIN) info.mountains++;
            else info.biomes[this.biome[i]]++;
            if (this.river[i]) info.riverTiles++;
            info.resources[this.resource[i]]++;
            if (this.neighbors(i).some(j => !this.isLand(j))) info.coastal = true;
        }
        return info;
    }

    /* ---------- Сводка по клетке (для интерфейса) ---------- */

    getTileInfo(x, y) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
        const i = this.index(x, y);
        const regionId = this.regionId[i];
        return {
            x, y,
            terrain: this.terrain[i],
            biome: this.biome[i],
            temperature: this.temperature[i],
            resource: this.resource[i],
            hasRiver: this.river[i] > 0,
            riverLevel: this.river[i],
            population: this.population[i],
            settlementLevel: this.settlementLevel[i],
            settlementGroupSize: this.settlementGroup[i] >= 0 ? this.settlementGroups[this.settlementGroup[i]].tiles.length : 0,
            roadLevel: this.roadLevel[i],
            shore: this.shore[i],
            crossing: this.crossing[i],
            waterDepth: this.waterDepth[i],
            regionId,
            regionSize: regionId >= 0 ? this.regionSizes[regionId] : 0,
            factionId: this.factionId[i],
            factionName: this.factionId[i] >= 0 ? this.factionName(this.factionId[i]) : null
        };
    }

    get landShare() {
        return this.landTiles.length / (this.size * this.size);
    }

    get regionCount() {
        return Object.keys(this.regionSizes).length;
    }
}

Object.assign(MapGenerator.prototype, elevation, terrain, climate, resources, rivers, regions, factions, settlements, roads);
