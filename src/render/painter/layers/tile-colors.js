import { clamp } from '../../../core/math.js';
import { Biome, Terrain } from '../../../map/constants.js';
import { hslToPacked, mixPacked, shadeFast, shadePacked } from '../../color.js';
import { ICE_TEMPERATURE, SNOW_TEMPERATURE, STEP_AMOUNTS, waterShadeIndex } from '../constants.js';

/* Цвет клетки: вода, земля, снег, плодородие */

export const tileColors = {
    // Цвет каждой клетки и признак «вода».
    buildTileColors() {
        const count = this.map.size * this.map.size;
        const colors = new Int32Array(count);
        const water = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            colors[i] = this.tileColor(i);
            water[i] = this.map.isLand(i) ? 0 : 1;
        }
        return { colors, water };
    },

    tileColor(i) {
        const map = this.map;
        const terrain = map.terrain[i];
        const isWater = terrain < Terrain.PLAIN;

        if (this.view === 'temperature') {
            const hue = 215 - 215 * map.temperature[i]; // синий (холод) -> красный (жара)
            return hslToPacked(hue, 60, isWater ? 36 : 52);
        }
        if (isWater) return this.waterColor(i);
        if (this.view === 'regions') return hslToPacked((map.regionId[i] * 137.5) % 360, 45, 58); // «золотой угол»: соседи разного цвета
        if (terrain === Terrain.MOUNTAIN) return this.packed.rock; // под рельефом — камень
        return this.groundColor(i);
    },

    // Вода темнее по мере удаления от берега — и в океане, и в озёрах. В холод у берега появляется лёд.
    waterColor(i) {
        const depth = this.map.waterDepth[i];
        const temperature = this.seasonalTemperature(i);

        if (this.view === 'terrain' && temperature < ICE_TEMPERATURE) {
            const freezeDepth = Math.round((ICE_TEMPERATURE - temperature) / ICE_TEMPERATURE * 10); // чем холоднее, тем дальше от берега лёд
            if (depth > 0 && depth <= freezeDepth) return this.packed.ice[depth <= 3 ? 0 : depth <= 6 ? 1 : 2];
        }
        return this.packed.waterShades[waterShadeIndex(depth)];
    },

    // Цвет земли: цвет биома в этом сезоне, с поправкой на плодородие, а в холод — с примесью снега.
    groundColor(i) {
        const base = this.packed.biome[this.map.biome[i]];
        if (this.view !== 'terrain') return base;

        const tinted = this.fertilityTint(i, base);
        const coverage = this.snowCoverage(i);
        return coverage > 0 ? mixPacked(tinted, this.packed.snow, 0.9 * coverage) : tinted;
    },

    // Доля снега на земле: 0, 1/3, 2/3 или 1 («пиксельные» ступени).
    snowCoverage(i) {
        return Math.round(clamp((SNOW_TEMPERATURE - this.seasonalTemperature(i)) / 0.16) * 3) / 3;
    },

    // Клетка рядом с рекой (считается один раз на карту).
    nearRiver(i) {
        const map = this.map;
        if (!this.nearRiverCache || this.nearRiverCache.source !== map.river) {
            const near = new Uint8Array(map.river.length);
            for (let k = 0; k < near.length; k++) {
                if (map.river[k] > 0) for (const j of map.neighbors8(k)) near[j] = 1;
            }
            this.nearRiverCache = { source: map.river, near };
        }
        return this.nearRiverCache.near[i];
    },

    // Внутри одного биома цвет зависит от плодородия: влажные места гуще и темнее, сухие светлее и желтее.
    fertilityTint(i, color) {
        const biome = this.map.biome[i];
        if (biome === Biome.TUNDRA || biome === Biome.DESERT || biome === Biome.DEAD_LAND || biome === Biome.ETHER_LAND) return color;

        const wet = this.nearRiver(i) ? 0.3 : 0;                    // у воды земля влажнее и зеленее
        const moisture = Math.round(Math.min(1, this.map.moisture[i] + wet) * 5) / 5; // 6 ступеней: меньше «грязи» на стыках клеток
        return moisture > 0.5
            ? shadePacked(color, -0.16 * (moisture - 0.5) / 0.5)
            : mixPacked(color, this.colors.hay, 0.32 * (0.5 - moisture) / 0.5);
    },

    // Цвет, осветлённый или затемнённый на step ступеней (-2..2).
    shadeStep(color, step) {
        return shadeFast(color, STEP_AMOUNTS[step + 2]);
    },
};
