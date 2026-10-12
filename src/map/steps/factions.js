/* Этап генерации: фракции (политические объединения регионов)

   Фракция — это несколько соседних регионов, закрашенных одним цветом. Регионы присоединяются к фракциям
   «волной» от стартовых регионов-семян: у каждой фракции всегда растёт её собственная граница, поэтому
   владения остаются связными (фракция не «перепрыгивает» через чужую землю). Ход получает самая маленькая
   фракция — так фракции выходят примерно равными по размеру. Острова, не связанные с материком, после этого
   отходят ближайшей по расположению фракции. */

import { CULTURES } from '../../game/cultures.js';

export const factions = {
    buildFactions() {
        const o = this.options;
        const count = Math.max(0, Math.floor(o.factionCount) || 0);
        this.factionId = new Int16Array(this.terrain.length).fill(-1);
        this.regionFaction = new Int16Array(this.terrain.length).fill(-1); // id региона -> id фракции
        this.factions = [];

        const regionIds = Object.keys(this.regionSizes).map(Number);
        if (count <= 0 || regionIds.length === 0) return;

        const neighbors = this.buildRegionAdjacency();
        const mainland = this.largestRegionComponent(regionIds, neighbors);

        const seeds = this.pickFactionSeeds(mainland, neighbors, Math.min(count, mainland.length));
        this.growFactions(mainland, neighbors, seeds);
        this.factions = seeds.map((_, id) => ({
            id,
            name: this.factionName(id),
            culture: this.factionCulture(id),
            regions: [],
            tiles: 0,
            population: 0
        }));
        this.collectFactionRegions(regionIds);
        this.assignIslandsByProximity(regionIds);

        // Итоги по фракциям (для интерфейса): сколько клеток, регионов и населения.
        this.countFactionSizes();
    },

    // Культура фракции: сдвиг от id, чтобы раскладка культур была неочевидной, но воспроизводимой.
    factionCulture(id) {
        const count = CULTURES.length || 1;
        const shift = (this.options.cultureOffset | 0) || 0;
        return (id + shift) % count;
    },

    // Записывает, какие регионы уже принадлежат каждой фракции (по массиву regionFaction).
    collectFactionRegions(regionIds) {
        for (const faction of this.factions) faction.regions.length = 0;
        for (const id of regionIds) {
            const f = this.regionFaction[id];
            if (f >= 0) this.factions[f].regions.push(id);
        }
    },

    // Соседство регионов: множество id регионов, у которых есть общая граница клеток.
    buildRegionAdjacency() {
        const neighbors = new Map();
        for (const id of Object.keys(this.regionSizes).map(Number)) neighbors.set(id, new Set());
        for (let i = 0; i < this.terrain.length; i++) {
            const id = this.regionId[i];
            if (id === -1) continue;
            for (const j of this.neighbors(i)) {
                const other = this.regionId[j];
                if (other === -1 || other === id) continue;
                neighbors.get(id).add(other);
                neighbors.get(other).add(id);
            }
        }
        return neighbors;
    },

    // Самый крупный связный кусок графа регионов (материк): фракции делят именно его, острова — потом.
    largestRegionComponent(regionIds, neighbors) {
        const seen = new Set();
        let best = [];
        for (const start of regionIds) {
            if (seen.has(start)) continue;
            const queue = [start];
            seen.add(start);
            for (let head = 0; head < queue.length; head++) {
                for (const n of neighbors.get(queue[head])) {
                    if (seen.has(n)) continue;
                    seen.add(n);
                    queue.push(n);
                }
            }
            if (queue.length > best.length) best = queue;
        }
        return best;
    },

    // Регион -> клетки (кэш внутри шага).
    regionTilesLookup(id) {
        if (!this.factionRegionTiles) {
            const byRegion = {};
            for (const i of this.landTiles) (byRegion[this.regionId[i]] ||= []).push(i);
            this.factionRegionTiles = byRegion;
        }
        return this.factionRegionTiles[id] || [];
    },

    // Семена фракций на материке: расставляем их как можно дальше друг от друга по графу регионов.
    pickFactionSeeds(mainland, neighbors, count) {
        const seeds = [];
        if (count <= 0) return seeds;

        const sizeOrder = mainland.slice().sort((a, b) => this.regionSizes[b] - this.regionSizes[a]);
        seeds.push(sizeOrder[0]);

        while (seeds.length < count) {
            const distance = this.regionDistances(seeds, mainland, neighbors);
            let best = -1;
            for (const id of mainland) {
                if (seeds.includes(id)) continue;
                const spread = distance.get(id) ?? Infinity;              // дальше от всех семян — лучше
                if (best === -1) { best = id; continue; }
                const bestSpread = distance.get(best) ?? Infinity;
                if (spread > bestSpread || (spread === bestSpread && this.regionSizes[id] > this.regionSizes[best])) best = id;
            }
            if (best === -1) break;
            seeds.push(best);
        }
        return seeds;
    },

    // Многоисточниковый BFS: расстояние (в шагах по регионам) до ближайшего семени.
    regionDistances(sources, mainland, neighbors) {
        const distance = new Map();
        const queue = [];
        for (const s of sources) { distance.set(s, 0); queue.push(s); }
        const mainlandSet = new Set(mainland);
        for (let head = 0; head < queue.length; head++) {
            const id = queue[head];
            for (const n of neighbors.get(id)) {
                if (!mainlandSet.has(n) || distance.has(n)) continue;
                distance.set(n, distance.get(id) + 1);
                queue.push(n);
            }
        }
        return distance;
    },

    /* Рост фракций: каждый ход расширяется самая маленькая фракция — присоединяет соседний регион.
       Кандидат всегда соседний с уже присвоенным регионом этой фракции, поэтому владения не рвутся. */
    growFactions(regionIds, neighbors, seeds) {
        const sizes = seeds.map(() => 0);
        const byFaction = seeds.map(() => new Set());
        const assigned = new Set();
        seeds.forEach((region, id) => {
            this.setRegionFaction(region, id);
            byFaction[id].add(region);
            assigned.add(region);
            sizes[id] = this.regionSizes[region] || 0;
        });
        let remaining = regionIds.length - seeds.length;

        while (remaining > 0) {
            let leader = 0;
            for (let k = 1; k < seeds.length; k++) if (sizes[k] < sizes[leader]) leader = k;

            let moved = false;
            for (let k = 0; k < seeds.length && !moved; k++) {
                const faction = (leader + k) % seeds.length;
                const region = this.nextFactionRegion(byFaction[faction], assigned, neighbors);
                if (region === -1) continue;                             // эта фракция упёрлась в чужие земли
                this.setRegionFaction(region, faction);
                byFaction[faction].add(region);
                assigned.add(region);
                sizes[faction] += this.regionSizes[region] || 0;
                remaining--;
                moved = true;
            }
            if (!moved) break;                                          // остались только острова — их раздадим по близости
        }
    },

    // Соседний неприсвоенный регион с самой крупной площадью. Через чужие владения не проходим.
    nextFactionRegion(factionRegions, assigned, neighbors) {
        let best = -1;
        for (const id of factionRegions) {
            for (const n of neighbors.get(id)) {
                if (assigned.has(n)) continue;
                if (best === -1 || this.regionSizes[n] > this.regionSizes[best]) best = n;
            }
        }
        return best;
    },

    // Острова и прочие регионы без сухопутной связи: отдаём ближайшей по центроиду фракции.
    assignIslandsByProximity(regionIds) {
        const pending = regionIds.filter(id => this.regionFaction[id] < 0);
        if (pending.length === 0 || this.factions.length === 0) return;

        const centers = new Map();
        for (const id of regionIds) {
            const tiles = this.regionTilesLookup(id);
            if (tiles.length === 0) continue;
            let sx = 0, sy = 0;
            for (const i of tiles) { sx += i % this.size; sy += Math.floor(i / this.size); }
            centers.set(id, [sx / tiles.length, sy / tiles.length]);
        }

        // Центр каждой фракции — среднее по уже присвоенным регионам.
        const factionCenters = this.factions.map(faction => {
            let sx = 0, sy = 0, n = 0;
            for (const id of faction.regions) {
                const c = centers.get(id);
                if (!c) continue;
                sx += c[0]; sy += c[1]; n++;
            }
            return n > 0 ? [sx / n, sy / n] : null;
        });

        for (const id of pending) {
            const c = centers.get(id);
            let best = -1, bestDistance = Infinity;
            for (let f = 0; f < factionCenters.length; f++) {
                const fc = factionCenters[f];
                if (!fc || !c) continue;
                const distance = Math.hypot(fc[0] - c[0], fc[1] - c[1]);
                if (distance < bestDistance) { bestDistance = distance; best = f; }
            }
            if (best === -1) best = 0;
            this.setRegionFaction(id, best);
            this.factions[best].regions.push(id);
        }
    },

    setRegionFaction(regionId, factionId) {
        this.regionFaction[regionId] = factionId;
        for (const i of this.regionTilesLookup(regionId)) this.factionId[i] = factionId;
    },

    countFactionSizes() {
        this.factionTiles = this.factions.map(() => 0);
        this.factionPopulation = this.factions.map(() => 0);
        for (const i of this.landTiles) {
            const f = this.factionId[i];
            if (f < 0) continue;
            this.factionTiles[f]++;
            this.factionPopulation[f] += this.population[i] || 0;
        }
        for (const faction of this.factions) {
            faction.tiles = this.factionTiles[faction.id];
            faction.population = this.factionPopulation[faction.id];
        }
    },

    factionName(id) {
        const names = this.options.factionNames;
        return (names && names[id % names.length]) || `Фракция ${id + 1}`;
    },

    getFactionInfo(factionId) {
        return this.factions[factionId] || null;
    }
};
