import { percentile, rankNormalize } from '../../core/math.js';
import { Shore, Terrain } from '../constants.js';

/* Этап генерации: типы местности, чистка мелких гор и островов, глубина воды, берега */

export const terrain = {
    // Пороги считаем по долям, а не по абсолютным числам: так соотношение воды и гор не зависит от настроек шума.
    classifyTerrain() {
        const { waterShare, mountainShare } = this.options;

        this.seaLevel = percentile(this.elevation, waterShare);

        // Горы = «хребтовость» (тонкие линии) + «массивность» (крупные пятна) + чуть высоты.
        // Одни хребты дают тонкие змейки; массивы собирают их в кучи, а между грядами остаются ущелья.
        const landIndices = [];
        for (let i = 0; i < this.elevation.length; i++) {
            if (this.elevation[i] > this.seaLevel) landIndices.push(i);
        }
        const rankOnLand = values => rankNormalize(Float32Array.from(landIndices, i => values[i]));
        const ridgeRank = rankOnLand(this.ridge);
        const massifRank = rankOnLand(this.massif);
        const heightRank = rankOnLand(this.elevation);

        const clustering = this.options.mountainClustering;
        const scores = landIndices.map((_, k) =>
            0.85 * ((1 - clustering) * ridgeRank[k] + clustering * massifRank[k]) + 0.15 * heightRank[k]);
        this.mountainLevel = percentile(scores, 1 - mountainShare);

        let maxScore = this.mountainLevel;
        for (const score of scores) maxScore = Math.max(maxScore, score);

        this.terrain.fill(Terrain.DEEP_WATER);
        landIndices.forEach((i, k) => {
            const isMountain = scores[k] > this.mountainLevel;
            this.terrain[i] = isMountain ? Terrain.MOUNTAIN : Terrain.PLAIN;
            // Высота горы растёт к «хребтовым» и «массивным» клеткам: по ней рисуется рельеф (хребты выше, края ниже).
            if (isMountain) this.mountainHeight[i] = 0.3 + 0.7 * (scores[k] - this.mountainLevel) / (maxScore - this.mountainLevel);
        });
    },

    // Одиночная «гора» на равнине выглядит нелепо: горы должны занимать не меньше minMountainSize клеток.
    removeSmallMountains() {
        const visited = new Uint8Array(this.terrain.length);
        for (let start = 0; start < this.terrain.length; start++) {
            if (visited[start] || this.terrain[start] !== Terrain.MOUNTAIN) continue;

            const queue = [start];
            visited[start] = 1;
            for (let head = 0; head < queue.length; head++) {
                for (const neighbor of this.neighbors(queue[head])) {
                    if (visited[neighbor] || this.terrain[neighbor] !== Terrain.MOUNTAIN) continue;
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
            if (queue.length >= this.options.minMountainSize) continue;
            for (const i of queue) {
                this.terrain[i] = Terrain.PLAIN;
                this.mountainHeight[i] = 0;
            }
        }
    },

    // Шум порождает одиночные клетки и крошечные островки, особенно посреди озёр. Убираем всё, что меньше minIslandSize.
    removeSmallIslands() {
        const visited = new Uint8Array(this.terrain.length);
        for (let start = 0; start < this.terrain.length; start++) {
            if (visited[start] || !this.isLand(start)) continue;

            const island = this.collectLandComponent(start, visited);
            if (island.length >= this.options.minIslandSize) continue;
            for (const i of island) {
                this.terrain[i] = Terrain.DEEP_WATER;
                this.elevation[i] = Math.min(this.elevation[i], this.seaLevel);
                this.mountainHeight[i] = 0;
            }
        }
    },

    // Все клетки суши, связанные с start (соседи по сторонам).
    collectLandComponent(start, visited) {
        const queue = [start];
        visited[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (visited[neighbor] || !this.isLand(neighbor)) continue;
                visited[neighbor] = 1;
                queue.push(neighbor);
            }
        }
        return queue;
    },

    collectLandTiles() {
        this.landTiles = [];
        for (let i = 0; i < this.terrain.length; i++) {
            if (this.isLand(i)) this.landTiles.push(i);
        }
    },

    // Глубина воды = расстояние до ближайшей суши (в клетках). Работает и для океана, и для озёр:
    // у берега мелко, к середине водоёма всё глубже.
    computeWaterDepth() {
        const queue = this.landTiles.slice();
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            for (const neighbor of this.neighbors8(current)) {
                if (this.isLand(neighbor) || this.waterDepth[neighbor] !== 0) continue;
                this.waterDepth[neighbor] = Math.min(255, this.waterDepth[current] + 1);
                queue.push(neighbor);
            }
        }

        // Мелководье — узкая полоса у берега; всё остальное — глубокая вода.
        for (let i = 0; i < this.terrain.length; i++) {
            if (this.isLand(i)) continue;
            const depth = this.waterDepth[i];
            this.terrain[i] = depth > 0 && depth <= this.options.shallowWaterDistance
                ? Terrain.SHALLOW_WATER : Terrain.DEEP_WATER;
        }
    },

    // Тип берега для суши рядом с морем, озером или рекой: пляж, каменистый берег или утёс.
    // Горы у воды — всегда утёсы; низкие тёплые берега — пляжи (пятнами); остальное — камни.
    classifyShores() {
        const o = this.options;
        const coastal = this.landTiles.filter(i =>
            this.river[i] > 0
            || this.neighbors8(i).some(j => !this.isLand(j))
            || this.neighbors(i).some(j => this.river[j] > 0));
        if (coastal.length === 0) return;

        const heightRank = rankNormalize(Float32Array.from(coastal, i => this.elevation[i] - this.seaLevel));
        const clusters = this.createDensityLayer(this.noise.shore, o.shoreScale);
        const nearMountains = this.tilesNearMountains(2);

        coastal.forEach((i, k) => {
            const warmEnough = this.temperature[i] > 0.2;
            if (nearMountains[i] || heightRank[k] > 1 - o.cliffShare) this.shore[i] = Shore.CLIFF;
            else if (warmEnough && heightRank[k] < 0.65 && clusters[i] > 1 - o.beachShare) this.shore[i] = Shore.BEACH;
            else this.shore[i] = Shore.ROCKY;
        });
    },
};
