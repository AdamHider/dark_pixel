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
