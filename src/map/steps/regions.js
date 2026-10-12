import { MinHeap } from '../../core/min-heap.js';
import { Terrain } from '../constants.js';

/* Этап генерации: регионы (провинции) */

export const regions = {
    // Регионы растут одновременно от «семян», как кристаллы. Каждый шаг стоит «денег»: горы и реки дороги,
    // поэтому границы охотно ложатся по хребтам и рекам, а плавный шум стоимости делает формы неправильными.
    buildRegions() {
        const o = this.options;
        const averageSize = (o.regionMinSize + o.regionMaxSize) / 2;
        const seedCount = Math.max(1, Math.round(this.landTiles.length / averageSize));

        this.nextRegionId = 0;
        this.growRegionsFromSeeds(this.pickRegionSeeds(seedCount));
        this.countRegionSizes();
        this.attachLeftoverTiles();
        this.fillSeedlessLand();
        this.countRegionSizes();
        this.mergeSmallRegions();
        this.balanceRegionSizes();
    },

    shuffled(list) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    },

    // Семена берём случайно, но не вплотную друг к другу: сначала с большим зазором, потом с меньшим, пока не наберём нужное число.
    pickRegionSeeds(count) {
        const order = this.shuffled(this.landTiles);
        const blocked = new Uint8Array(this.terrain.length);
        const seeds = [];
        const averageSize = (this.options.regionMinSize + this.options.regionMaxSize) / 2;
        const spacing = Math.max(1, Math.round(Math.sqrt(averageSize) * 0.6)); // чем крупнее регион, тем дальше друг от друга семена

        for (let radius = spacing; radius >= 0; radius--) {
            blocked.fill(0);
            for (const seed of seeds) this.markBlocked(blocked, seed, radius);

            for (const i of order) {
                if (seeds.length >= count) return seeds;
                if (blocked[i] || this.regionId[i] !== -1) continue;
                seeds.push(i);
                this.markBlocked(blocked, i, radius);
            }
        }
        return seeds;
    },

    markBlocked(blocked, i, radius) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) blocked[ny * this.size + nx] = 1;
            }
        }
    },

    growRegionsFromSeeds(seeds) {
        const maxSize = this.options.regionMaxSize;
        const noiseLayer = this.createDensityLayer(this.noise.regionShape, 10); // гладкий шум: где-то «пробираться» дороже
        const heap = new MinHeap();
        const sizes = [];
        const speed = [];

        seeds.forEach((tile, id) => {
            sizes[id] = 0;
            speed[id] = 0.85 + this.random() * 0.3; // у каждого региона свой темп роста
            heap.push(0, tile, id);
        });
        this.nextRegionId = seeds.length;

        while (heap.size > 0) {
            const [cost, tile, id] = heap.pop();
            if (this.regionId[tile] !== -1 || sizes[id] >= maxSize) continue;

            this.regionId[tile] = id;
            sizes[id]++;

            for (const neighbor of this.neighbors(tile)) {
                if (!this.isLand(neighbor) || this.regionId[neighbor] !== -1) continue;
                heap.push(cost + this.regionStepCost(neighbor, noiseLayer) * speed[id], neighbor, id);
            }
        }
    },

    regionStepCost(tile, noiseLayer) {
        const o = this.options;
        let cost = 1 + noiseLayer[tile] * 3 * o.regionIrregularity;
        if (this.terrain[tile] === Terrain.MOUNTAIN) cost += o.regionBarrierCost;
        if (this.river[tile] > 0) cost += o.regionBarrierCost * 0.6;
        return cost;
    },

    // Клетки, которые никто не успел занять (соседние регионы уже набрали максимум), отдаём самому маленькому соседу.
    attachLeftoverTiles() {
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of this.landTiles) {
                if (this.regionId[i] !== -1) continue;
                const target = this.smallestNeighborRegion(i);
                if (target === -1) continue;
                this.regionId[i] = target;
                this.regionSizes[target]++;
                changed = true;
            }
        }
    },

    smallestNeighborRegion(i) {
        let best = -1;
        for (const neighbor of this.neighbors(i)) {
            const id = this.regionId[neighbor];
            if (id === -1) continue;
            if (best === -1 || this.regionSizes[id] < this.regionSizes[best]) best = id;
        }
        return best;
    },

    // Острова, куда не попало ни одного семени, делим на регионы обычной «волной».
    fillSeedlessLand() {
        const { regionMinSize, regionMaxSize } = this.options;
        for (const start of this.landTiles) {
            if (this.regionId[start] !== -1) continue;
            const targetSize = regionMinSize + Math.floor(this.random() * (regionMaxSize - regionMinSize + 1));
            this.growRegion(start, this.nextRegionId++, targetSize);
        }
    },

    growRegion(start, id, targetSize) {
        const queue = [start];
        this.regionId[start] = id;
        let size = 1;

        for (let head = 0; head < queue.length && size < targetSize; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (size >= targetSize) break;
                if (!this.isLand(neighbor) || this.regionId[neighbor] !== -1) continue;
                this.regionId[neighbor] = id;
                queue.push(neighbor);
                size++;
            }
        }
    },

    countRegionSizes() {
        this.regionSizes = {};
        for (const i of this.landTiles) {
            const id = this.regionId[i];
            this.regionSizes[id] = (this.regionSizes[id] || 0) + 1;
        }
    },

    // Обрывки вливаем в самого маленького соседа, чтобы размеры оставались ровными.
    mergeSmallRegions() {
        const tilesByRegion = {};
        for (const i of this.landTiles) {
            (tilesByRegion[this.regionId[i]] ||= []).push(i);
        }

        for (const key of Object.keys(this.regionSizes)) {
            const id = Number(key);
            const tiles = tilesByRegion[id];
            if (!tiles || tiles.length >= this.options.regionMergeBelow) continue;

            const target = this.findSmallestNeighborRegion(tiles, id);
            if (target === -1) continue; // остров без соседей — оставляем как есть

            for (const i of tiles) this.regionId[i] = target;
            tilesByRegion[target].push(...tiles);
            this.regionSizes[target] += tiles.length;
            delete this.regionSizes[id];
            delete tilesByRegion[id];
        }
    },

    // Выравниваем размеры: клетки на границе переходят от слишком больших регионов к слишком маленьким.
    // Клетку отдаём, только если донор от этого не развалится на части.
    balanceRegionSizes() {
        const { regionMinSize, regionMaxSize, regionBalancePasses } = this.options;

        for (let pass = 0; pass < regionBalancePasses; pass++) {
            let moved = 0;
            for (const tile of this.landTiles) {
                const donor = this.regionId[tile];
                for (const neighbor of this.neighbors(tile)) {
                    const receiver = this.regionId[neighbor];
                    if (receiver === -1 || receiver === donor) continue;

                    const donorSize = this.regionSizes[donor];
                    const receiverSize = this.regionSizes[receiver];
                    const receiverTooSmall = receiverSize < regionMinSize && donorSize > regionMinSize;
                    const donorTooBig = donorSize > regionMaxSize && receiverSize < regionMaxSize;
                    if (!receiverTooSmall && !donorTooBig) continue;
                    if (!this.staysConnectedWithout(tile, donor)) continue;

                    this.regionId[tile] = receiver;
                    this.regionSizes[donor]--;
                    this.regionSizes[receiver]++;
                    moved++;
                    break;
                }
            }
            if (moved === 0) break;
        }
    },

    // Останется ли регион цельным, если убрать из него клетку removed.
    staysConnectedWithout(removed, id) {
        const start = this.neighbors(removed).find(n => this.regionId[n] === id);
        if (start === undefined) return true; // в регионе была только эта клетка

        const seen = new Set([removed, start]);
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (this.regionId[neighbor] !== id || seen.has(neighbor)) continue;
                seen.add(neighbor);
                queue.push(neighbor);
            }
        }
        return queue.length === this.regionSizes[id] - 1;
    },

    findSmallestNeighborRegion(tiles, ownId) {
        let best = -1;
        for (const i of tiles) {
            for (const j of this.neighbors(i)) {
                const other = this.regionId[j];
                if (other === -1 || other === ownId) continue;
                if (best === -1 || this.regionSizes[other] < this.regionSizes[best]) best = other;
            }
        }
        return best;
    },
};
