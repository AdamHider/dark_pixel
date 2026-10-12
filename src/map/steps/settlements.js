import { clamp } from '../../core/math.js';
import { Biome, Resource, Shore, Terrain } from '../constants.js';

/* Этап генерации: население и поселения */

export const settlements = {
    /* Поселение — ресурс клетки (как пшеница или руда): в клетке либо оно, либо другой ресурс. Оно даёт население
       и золото. Поселения стоят ГРУППАМИ из 1–4 соседних клеток (деревня, городок), и у каждой клетки группы свой
       уровень 1–4 (он же число домиков в клетке, в painter). Вместе клетки образуют один населённый пункт.
       Население региона зависит от «обитаемости» его клеток: плодородные луга, поля, места у рек и побережья — много,
       пустыня, тундра и горы — мало. Чем больше население, тем больше клеток в группе, а населения самой клетки хватает
       на более высокий уровень. Большому региону достаётся ещё и вторая группа. */
    placeSettlements() {
        const o = this.options;
        const habitability = this.computeHabitability();

        const tilesByRegion = {};
        const sums = {};
        for (const i of this.landTiles) {
            const id = this.regionId[i];
            (tilesByRegion[id] ||= []).push(i);
            sums[id] = (sums[id] || 0) + habitability[i];
        }

        const candidates = [];
        for (const key of Object.keys(sums)) {
            const id = Number(key);
            const gauss = (this.random() + this.random() + this.random() - 1.5) / 0.5; // ≈ нормальное распределение
            const population = Math.round(sums[id] * o.populationPerHabitability * Math.exp(gauss * o.populationVariation));
            this.regionPopulation[id] = population;
            if (population >= o.settlementMinPopulation) candidates.push({ regionId: id, population });
        }

        // Крупные группы ставим первыми: они занимают лучшие места, мелкие устраиваются вокруг.
        candidates.sort((a, b) => b.population - a.population);
        const blocked = new Uint8Array(this.terrain.length);
        for (const candidate of candidates) {
            const shares = candidate.population >= o.secondSettlementPopulation ? [0.62, 0.38] : [1];
            for (const share of shares) {
                const population = Math.round(candidate.population * share);
                if (population < o.settlementMinPopulation) continue;
                const group = this.growSettlementGroup(candidate.regionId, tilesByRegion[candidate.regionId], habitability, blocked, population);
                if (group) this.commitSettlementGroup(group, population, blocked);
            }
        }
    },

    // Уровень клетки (1..settlementMaxLevel) по её населению: каждое увеличение в settlementTileGrowth раз добавляет уровень.
    settlementLevelFor(population) {
        const o = this.options;
        const level = 1 + Math.floor(Math.log(Math.max(1, population) / o.settlementTileMinPopulation) / Math.log(o.settlementTileGrowth));
        return clamp(level, 1, o.settlementMaxLevel);
    },

    // Подходит ли клетка под поселение.
    isSettlementSite(i, regionId, habitability, blocked) {
        return this.terrain[i] === Terrain.PLAIN && !this.river[i] && !blocked[i] && habitability[i] > 0
            && this.regionId[i] === regionId && this.shore[i] !== Shore.CLIFF
            && ![Resource.GOLD, Resource.IRON, Resource.ETHER, Resource.SETTLEMENT].includes(this.resource[i]);
    },

    // Выбирает лучшую клетку региона и наращивает вокруг неё группу из соседних клеток (до settlementMaxGroup).
    growSettlementGroup(regionId, regionTiles, habitability, blocked, population) {
        const o = this.options;
        let center = -1;
        let best = -Infinity;
        for (const i of regionTiles) {
            if (!this.isSettlementSite(i, regionId, habitability, blocked)) continue;
            const score = habitability[i] + this.random() * 0.3;
            if (score > best) { best = score; center = i; }
        }
        if (center === -1) return null;

        const wanted = clamp(1 + Math.floor(Math.log(population / o.settlementMinPopulation) / Math.log(o.settlementGroupGrowth)), 1, o.settlementMaxGroup);
        const tiles = [center];
        const parents = [-1];
        const inside = new Set(tiles);
        while (tiles.length < wanted) {
            let next = -1, parent = -1, nextScore = -Infinity;
            for (const tile of tiles) {
                for (const neighbor of this.neighbors(tile)) {
                    if (inside.has(neighbor) || !this.isSettlementSite(neighbor, regionId, habitability, blocked)) continue;
                    const score = habitability[neighbor] + this.random() * 0.3;
                    if (score > nextScore) { nextScore = score; next = neighbor; parent = tile; }
                }
            }
            if (next === -1) break;                                  // дальше расти некуда: вода, горы, соседний регион
            tiles.push(next);
            parents.push(parent);
            inside.add(next);
        }
        return { tiles, parents };
    },

    // Записывает группу: делит население между клетками (центр — больше всех), задаёт уровни и соединяет клетки дорожками.
    commitSettlementGroup(group, population, blocked) {
        const size = this.size;
        const groupId = this.settlementGroups.length;
        const weights = group.tiles.map((_, k) => (k === 0 ? 1.4 : 0.6 + this.random() * 0.8));
        const total = weights.reduce((a, b) => a + b, 0);

        group.tiles.forEach((tile, k) => {
            const tilePopulation = Math.max(1, Math.round(population * weights[k] / total));
            const level = this.settlementLevelFor(tilePopulation);
            this.settlements.push({ id: this.settlements.length, groupId, regionId: this.regionId[tile], tile, population: tilePopulation, level, center: k === 0 });
            this.resource[tile] = Resource.SETTLEMENT;
            this.population[tile] = Math.min(65535, tilePopulation);
            this.settlementLevel[tile] = level;
            this.settlementGroup[tile] = groupId;
            if (group.parents[k] !== -1) this.carveRoad([group.parents[k], tile]);   // дорожка между соседними клетками группы
        });
        this.settlementGroups.push({ id: groupId, regionId: this.regionId[group.tiles[0]], tiles: group.tiles, tile: group.tiles[0], population });

        const spacing = this.options.settlementSpacing;
        for (const tile of group.tiles) {
            const x = tile % size, y = Math.floor(tile / size);
            for (let dy = -spacing; dy <= spacing; dy++) {
                for (let dx = -spacing; dx <= spacing; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && ny >= 0 && nx < size && ny < size) blocked[ny * size + nx] = 1;
                }
            }
        }
    },

    // Насколько клетка подходит для жизни: 0 (горы, вода) .. ~1.6 (плодородный луг у реки).
    computeHabitability() {
        const byBiome = {
            [Biome.GRASSLAND]: 1, [Biome.SAVANNA]: 0.65, [Biome.STEPPE]: 0.6,
            [Biome.TAIGA]: 0.55, [Biome.TUNDRA]: 0.15, [Biome.DESERT]: 0.1
        };
        const habitability = new Float32Array(this.terrain.length);
        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN) continue;
            let value = byBiome[this.biome[i]] * (0.6 + 0.4 * this.moisture[i]);
            if (this.resource[i] === Resource.WHEAT) value += 0.35;
            else if (this.resource[i] === Resource.WOOD) value += 0.1;
            if (this.neighbors(i).some(j => this.river[j] > 0)) value += 0.35;                 // вода для питья и торговли
            if (this.neighbors8(i).some(j => !this.isLand(j))) value += 0.2;                   // берег
            if (this.shore[i] === Shore.CLIFF) value -= 0.2;
            habitability[i] = clamp(value, 0, 1.6);
        }
        return habitability;
    },
};
