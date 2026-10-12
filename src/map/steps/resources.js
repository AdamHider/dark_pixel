import { rankNormalize } from '../../core/math.js';
import { Biome, Resource, Terrain } from '../constants.js';

/* Этап генерации: ресурсы (лес, поля, руда, эфир) */

export const resources = {
    placeResources() {
        const o = this.options;
        const forest = this.createPatchLayer(this.noise.forest, o.forestScale, o.forestShare, this.noise.forestClumps, o.clumpScale, o.forestClumpShare);
        const fields = this.createPatchLayer(this.noise.fertility, o.wheatScale, o.wheatShare, this.noise.fertilityClumps, o.clumpScale, o.wheatClumpShare);

        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN) continue;
            if (this.biome[i] === Biome.DEAD_LAND || this.biome[i] === Biome.ETHER_LAND) continue; // на мёртвых и эфирных землях не растёт

            const t = this.temperature[i];
            const m = this.moisture[i];
            const roll = this.random();

            const goodForWood = forest[i] && m > 0.3 && t > 0.12 && t < 0.8;
            const goodForWheat = fields[i] && m > 0.1 && m < 0.9 && t > 0.18 && t < 0.85;

            if (goodForWood && roll < o.woodChance) this.resource[i] = Resource.WOOD;
            else if (goodForWheat && roll < o.wheatChance) this.resource[i] = Resource.WHEAT;
        }
    },

    /* Поля раскладываем ещё и «по одному на регион» (после того как регионы построены): регионам, где пшеницы мало,
       добавляем поля в самых подходящих клетках. Так пшеница есть по всей карте, а не только там, где удачно лёг шум. */
    distributeWheat() {
        const o = this.options;
        if (o.wheatMinPerRegion <= 0) return;

        const fields = this.createPatchLayer(this.noise.fertility, o.wheatScale, o.wheatShare, this.noise.fertilityClumps, o.clumpScale, o.wheatClumpShare);
        const byRegion = new Map();
        for (const i of this.landTiles) {
            const id = this.regionId[i];
            if (id < 0) continue;
            if (!byRegion.has(id)) byRegion.set(id, { have: 0, sites: [] });
            const entry = byRegion.get(id);
            if (this.resource[i] === Resource.WHEAT) { entry.have++; continue; }
            if (this.isWheatSite(i)) entry.sites.push(i);
        }

        // Регионы по возрастанию числа полей: сперва наделяем обделённые, потом уже богатые.
        const ordered = [...byRegion.values()].filter(entry => entry.have < o.wheatMinPerRegion);
        ordered.sort((a, b) => a.have - b.have);
        for (const entry of ordered) {
            // Лучшие места — где плодороднее (шум полей, влага, близость реки); при равенстве добавляем случайность.
            entry.sites.sort((a, b) => (this.wheatScore(b, fields) - this.wheatScore(a, fields)) || (this.random() - 0.5));
            for (const i of entry.sites) {
                if (entry.have >= o.wheatMinPerRegion) break;
                this.resource[i] = Resource.WHEAT;
                entry.have++;
            }
        }
    },

    // Насколько клетка хороша под поле: плодородие, умеренная влага, близость реки.
    wheatScore(i, fields) {
        const wet = this.neighbors(i).some(j => this.river[j] > 0);
        return (fields ? fields[i] : 0) * 0.8
            + (1 - Math.abs(this.moisture[i] - 0.55)) * 0.6
            + (1 - Math.abs(this.temperature[i] - 0.55)) * 0.4
            + (wet ? 0.3 : 0);
    },

    // Подходит ли клетка под поле: равнина, не река, свободна, тёплый умеренный климат и не мёртвая/эфирная земля.
    isWheatSite(i) {
        return this.terrain[i] === Terrain.PLAIN && this.river[i] === 0 && this.resource[i] === Resource.NONE
            && this.biome[i] !== Biome.DEAD_LAND && this.biome[i] !== Biome.ETHER_LAND
            && this.biome[i] !== Biome.TUNDRA && this.biome[i] !== Biome.DESERT
            && this.temperature[i] > 0.18 && this.temperature[i] < 0.85
            && this.moisture[i] > 0.1 && this.moisture[i] < 0.9;
    },

    // «Пятна» ресурса: крупные скопления плюс мелкие разрозненные кучки. Вместе дают хаотичное, но не пустое распределение.
    createPatchLayer(bigNoise, bigScale, bigShare, smallNoise, smallScale, smallShare) {
        const big = this.createDensityLayer(bigNoise, bigScale);
        const small = this.createDensityLayer(smallNoise, smallScale);
        const patches = new Uint8Array(big.length);
        for (let i = 0; i < patches.length; i++) {
            patches[i] = big[i] > 1 - bigShare || small[i] > 1 - smallShare ? 1 : 0;
        }
        return patches;
    },

    // Слой «плотности»: плавный шум, выровненный до равномерных значений 0..1.
    createDensityLayer(noise, scale) {
        const layer = new Float32Array(this.size * this.size);
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                layer[this.index(x, y)] = noise.fractal((x / this.size) * scale, (y / this.size) * scale, 3);
            }
        }
        return rankNormalize(layer);
    },

    placeRareResources() {
        this.placeGold();
        this.placeIron();
        this.placeEther();
    },

    // Золото — редкое: в горах и предгорьях, скоплениями. Перекрывает лес и поля.
    placeGold() {
        const o = this.options;
        const nearMountains = this.tilesNearMountains(o.foothillDistance);
        const density = this.createDensityLayer(this.noise.ore, o.goldScale);

        for (const i of this.landTiles) {
            if (!nearMountains[i] || this.river[i]) continue;
            const chance = this.terrain[i] === Terrain.MOUNTAIN ? o.goldChance : o.goldChance * 0.5;
            if (density[i] > 1 - o.goldShare && this.random() < chance) this.resource[i] = Resource.GOLD;
        }
    },

    // Железо — там же, но другие скопления и заметно чаще; золото не вытесняет.
    placeIron() {
        const o = this.options;
        const nearMountains = this.tilesNearMountains(o.foothillDistance);
        const density = this.createDensityLayer(this.noise.iron, o.ironScale);

        for (const i of this.landTiles) {
            if (!nearMountains[i] || this.river[i] || this.resource[i] === Resource.GOLD) continue;
            const chance = this.terrain[i] === Terrain.MOUNTAIN ? o.ironChance : o.ironChance * 0.5;
            if (density[i] > 1 - o.ironShare && this.random() < chance) this.resource[i] = Resource.IRON;
        }
    },

    // 1 для гор и для суши не дальше distance клеток от гор (предгорья).
    tilesNearMountains(distance) {
        const near = new Uint8Array(this.terrain.length);
        const reach = new Uint8Array(this.terrain.length);
        const queue = [];
        for (const i of this.landTiles) {
            if (this.terrain[i] === Terrain.MOUNTAIN) {
                near[i] = 1;
                queue.push(i);
            }
        }
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            if (reach[current] >= distance) continue;
            for (const neighbor of this.neighbors(current)) {
                if (near[neighbor] || !this.isLand(neighbor)) continue;
                near[neighbor] = 1;
                reach[neighbor] = reach[current] + 1;
                queue.push(neighbor);
            }
        }
        return near;
    },

    // Эфир (гигантские фиолетовые кристаллы и грибы) растёт вдоль «линий разлома» — тонких извилистых полос шума, с разрывами.
    placeEther() {
        const o = this.options;
        const faults = this.createFaultLayer();

        for (const i of this.landTiles) {
            if (this.river[i] || this.resource[i] !== Resource.NONE) continue;
            if (faults[i] > 1 - o.etherShare && this.random() < o.etherChance) this.resource[i] = Resource.ETHER;
        }

        // В землях эфира кристаллы — обычное дело, там их густо (плотность регулируется etherLandDensity).
        if (o.etherLandShare > 0 && o.etherLandDensity > 0) {
            for (const i of this.landTiles) {
                if (this.biome[i] !== Biome.ETHER_LAND || this.river[i] || this.resource[i] !== Resource.NONE) continue;
                if (this.random() < o.etherLandDensity) this.resource[i] = Resource.ETHER;
            }
        }
    },

    createFaultLayer() {
        const { faultScale } = this.options;
        const layer = new Float32Array(this.size * this.size);
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const n = this.noise.fault.fractal((x / this.size) * faultScale, (y / this.size) * faultScale, 3);
                layer[this.index(x, y)] = 1 - Math.abs(2 * n - 1); // максимум там, где шум пересекает 0.5, — получаются линии
            }
        }
        return rankNormalize(layer);
    },
};
