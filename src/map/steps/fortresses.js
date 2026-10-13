/* Этап генерации: крепости.

   Крепость — оборонительное сооружение фракции на границе её владений: у моря (порт), в горах
   (горная твердыня) или просто на важной дороге/рубеже (сторожевой пост). Ставится по одной на регион,
   у самой «граничной» клетки: там, где рядом земля чужой фракции, вода или горы.

   Хранится в map.fortresses: [{ id, tile, regionId, factionId, kind }]. kind: 'keep' | 'coast' | 'mountain'.
   Это данные для отрисовки (слой layers/fortresses.js) и для интерфейса; в экономику крепости не входят. */

import { Resource, Terrain } from '../constants.js';

export const fortresses = {
    // Одна крепость на регион — у самой «опасной» (пограничной) клетки. Вызывается после buildFactions.
    placeFortresses() {
        this.fortresses = [];
        this.fortressByTile = new Int16Array(this.terrain.length).fill(-1);   // клетка -> номер крепости
        if (!this.factions || this.factions.length === 0 || this.options.fortresses === false) return;

        let nextId = 0;
        for (const regionId of Object.keys(this.regionSizes).map(Number)) {
            const tiles = this.regionTilesLookup(regionId);
            if (tiles.length === 0) continue;

            const factionId = this.factionId[tiles[0]];
            if (factionId < 0) continue;                     // регион без фракции (например, пустая земля)

            let best = -1, bestScore = -Infinity;
            for (const i of tiles) {
                if (!this.isFrontier(i, factionId)) continue;    // крепости нужны на рубеже, а не в глубине владений
                const score = this.fortressScore(i, factionId);
                if (score > bestScore) { bestScore = score; best = i; }
            }
            if (best < 0) continue;

            this.fortressByTile[best] = nextId;
            this.fortresses.push({
                id: nextId++,
                tile: best,
                regionId,
                factionId,
                kind: this.fortressKind(best)
            });
        }
    },

    // Рубеж ли это: рядом чужая земля (граница владений) или вода (побережье).
    isFrontier(i, factionId) {
        for (const j of this.neighbors(i)) {
            if (!this.isLand(j) || this.factionId[j] !== factionId) return true;
        }
        return false;
    },

    // Насколько клетка годится под крепость: граница владений, вода и горы рядом — большой плюс, ресурс — минус.
    fortressScore(i, factionId) {
        let score = 0;
        for (const j of this.neighbors(i)) {
            if (!this.isLand(j)) { score += 1.5; continue; }             // берег/порт
            if (this.terrain[j] === Terrain.MOUNTAIN) score += 1.0;      // рядом горы
            if (this.factionId[j] !== factionId) score += 3.0;           // самая граница владений
        }
        if (this.terrain[i] === Terrain.MOUNTAIN) score += 0.6;          // сама в горах — горная твердыня
        if (this.resource[i] !== Resource.NONE) score -= 2.0;            // не занимать ценный ресурс
        return score;
    },

    // Тип крепости по окружению: у воды — порт, в горах — твердыня, иначе — сторожевой пост.
    fortressKind(i) {
        for (const j of this.neighbors(i)) {
            if (!this.isLand(j)) return 'coast';
        }
        return this.terrain[i] === Terrain.MOUNTAIN ? 'mountain' : 'keep';
    }
};
