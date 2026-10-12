import { clamp } from '../../../core/math.js';
import { Biome, Terrain } from '../../../map/constants.js';
import { applyHillShading, computeHillShading } from '../hill-shading.js';
import { LatticeNoise } from '../noise.js';

/* Холмы и овраги на равнинах */

export const hills = {
    /* На равнинах — лёгкая светотень «карты холмов» (свет слева сверху, как у гор и деревьев) плюс тёмные овраги
       в сухих местах. Карта холмов — шум плюс крупный рельеф суши из генератора; считается один раз на карту. */
    paintHills() {
        const o = this.options;
        if (o.hillStrength <= 0 && o.ravineDensity <= 0) return;

        const key = `${this.tileSize}|${o.hillStrength}|${o.ravineDensity}`;
        const cache = this.hillShading;
        if (cache && cache.source === this.map.elevation && cache.key === key) {
            applyHillShading(this.pixels, cache.shading);
            return;
        }

        const map = this.map;
        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const dryBiomes = [Biome.STEPPE, Biome.DESERT, Biome.SAVANNA, Biome.TUNDRA];

        // Какие клетки подходят (1) и в каких ещё и овраги (3) — один раз, а не для каждого пикселя.
        const flags = new Uint8Array(size * size);
        let eligible = 0;
        for (let i = 0; i < flags.length; i++) {
            if (!map.isLand(i) || map.terrain[i] === Terrain.MOUNTAIN || map.river[i]) continue;
            flags[i] = o.ravineDensity > 0 && dryBiomes.includes(map.biome[i]) ? 3 : 1;
            eligible++;
        }
        const tileOfColumn = new Int32Array(W);
        for (let x = 0; x < W; x++) tileOfColumn[x] = Math.floor(x / T);

        const shading = computeHillShading({
            hills: this.buildHillHeights(), waterMask: this.waterMask, flags, tileOfColumn,
            width: W, tile: T, strength: o.hillStrength,
            ravineWidth: 0.012 + 0.03 * o.ravineDensity,
            valleyNoise: new LatticeNoise(W, Math.max(6, this.px(22)), 611 + this.seedSalt),
            capacity: eligible * T * T
        });
        this.hillShading = { source: map.elevation, key, shading };
        applyHillShading(this.pixels, shading);
    },

    // Карта холмов по пикселям (0..255). От сезона не зависит, поэтому кэшируется.
    buildHillHeights() {
        const map = this.map;
        const cache = this.hillCache;
        if (cache && cache.source === map.elevation && cache.tileSize === this.tileSize) return cache.height;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const height = new Uint8Array(W * W);
        const { first, second, fraction } = this.axis;
        const broad = new LatticeNoise(W, Math.max(6, this.px(20)), 601 + this.seedSalt);
        const landHeight = new Float32Array(size * size);
        for (let i = 0; i < landHeight.length; i++) landHeight[i] = clamp((map.elevation[i] - map.seaLevel) / 0.5);

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                if (!map.isLand(ty * size + tx)) continue;
                for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
                    const rowTop = first[gy] * size, rowBottom = second[gy] * size, v = fraction[gy];
                    for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                        const u = fraction[gx];
                        const a = landHeight[rowTop + first[gx]], b = landHeight[rowTop + second[gx]];
                        const c = landHeight[rowBottom + first[gx]], d = landHeight[rowBottom + second[gx]];
                        const top = a + (b - a) * u;
                        const coarse = top + (c + (d - c) * u - top) * v; // крупный рельеф суши из генератора
                        const value = 0.3 * coarse + 0.7 * broad.at(gx, gy);
                        height[gy * W + gx] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
                    }
                }
            }
        }

        this.hillCache = { source: map.elevation, tileSize: T, height };
        return height;
    },
};
