import { clamp, rankNormalize } from '../../core/math.js';
import { Biome, Terrain } from '../constants.js';

/* Этап генерации: влажность, температура, биомы */

export const climate = {
    generateMoisture() {
        const scale = this.options.moistureScale;
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                this.moisture[this.index(x, y)] =
                    this.noise.moisture.fractal((x / this.size) * scale, (y / this.size) * scale, 4);
            }
        }
        // Выравниваем до равномерных 0..1: порог 0.4 в биомах теперь честно значит «самые сухие 40%».
        this.moisture = rankNormalize(this.moisture);
    },

    // Север (y = 0) холодный, юг (y = size) жаркий; шум добавляет разнообразия, высота охлаждает.
    generateTemperature() {
        const o = this.options;
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const i = this.index(x, y);
                const latitude = y / this.size;
                const noise = this.noise.temperature.fractal((x / this.size) * o.temperatureScale, latitude * o.temperatureScale, 3);
                const altitude = Math.max(0, this.elevation[i] - this.seaLevel);

                const temperature = latitude * 0.9 + 0.05
                    + (noise - 0.5) * o.temperatureNoise
                    - altitude * o.altitudeCooling;
                this.temperature[i] = clamp(temperature);
            }
        }
    },

    assignBiomes() {
        for (const i of this.landTiles) {
            if (this.terrain[i] === Terrain.PLAIN) {
                this.biome[i] = this.pickBiome(this.temperature[i], this.moisture[i]);
            }
        }
        this.assignZones();
    },

    /* Особые зоны поверх обычных биомов (регулируются константами в defaults.js):
       степи (широкие сухие травяные пространства), мёртвые земли (выжженные бесплодные пустоши)
       и земли эфира (пятна, густо усыпанные кристаллами). Каждая зона — это отдельный шум-слой;
       внутри «пятна» биом подменяется, поэтому зоны получаются крупными и цельными, а не отдельными клетками. */
    assignZones() {
        const o = this.options;
        const steppe = o.steppeShare > 0 ? this.createDensityLayer(this.noise.steppe, o.zoneScale) : null;
        const dead = o.deadLandShare > 0 ? this.createDensityLayer(this.noise.deadLand, o.zoneScale) : null;
        const ether = o.etherLandShare > 0 ? this.createDensityLayer(this.noise.etherLand, o.etherLandScale) : null;

        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN) continue;
            if (ether && ether[i] > 1 - o.etherLandShare) {
                this.biome[i] = Biome.ETHER_LAND;           // земли эфира перекрывают всё: тут не растёт ничего живого
            } else if (dead && dead[i] > 1 - o.deadLandShare && this.moisture[i] < o.deadLandMoisture) {
                this.biome[i] = Biome.DEAD_LAND;            // мёртвые земли — в сухих краях
            } else if (steppe && this.biome[i] === Biome.GRASSLAND && steppe[i] > 1 - o.steppeShare) {
                this.biome[i] = Biome.STEPPE;               // дополнительные степи вместо обычного луга
            }
        }
    },

    pickBiome(temperature, moisture) {
        const dry = this.options.aridity; // клетки суше этого порога — степь или пустыня
        if (temperature < 0.1) return Biome.TUNDRA;

        if (temperature < 0.42) {                 // холодный пояс
            if (moisture > 0.55) return Biome.TAIGA;
            return moisture > dry * 0.8 ? Biome.GRASSLAND : Biome.STEPPE;
        }
        if (temperature < 0.7) {                  // умеренный пояс
            if (moisture < dry) return Biome.STEPPE;
            return moisture > 0.8 ? Biome.TAIGA : Biome.GRASSLAND;
        }
        // жаркий пояс
        if (moisture < dry) return Biome.DESERT;
        return moisture < 0.6 ? Biome.SAVANNA : Biome.GRASSLAND;
    },
};
