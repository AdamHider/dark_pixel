import { Biome, Resource, Shore, Terrain } from '../../../map/constants.js';
import { WHITE, hexToPacked, shadeFast, speckColor } from '../../color.js';
import { tileHash } from '../noise.js';

/* Текстура: крапинки, волны, цветы, пучки травы */

export const texture = {
    paintTexture() {
        const map = this.map;
        const T = this.tileSize;
        const speckCount = Math.round(T * T / 16);
        const specks = this.speckLayout(speckCount);

        this.forEachTile((x, y) => {
            const i = map.index(x, y);
            const isLand = map.isLand(i);

            // Едва заметные светлые и тёмные точки — чтобы поверхность не выглядела плоской заливкой.
            if (map.terrain[i] !== Terrain.MOUNTAIN) {
                const base = i * speckCount;
                for (let k = 0; k < speckCount; k++) {
                    const code = specks[base + k];                 // пиксель в клетке и «светлее/темнее» — посчитаны заранее
                    const at = (y * T + (code >> 9)) * this.width + x * T + ((code >> 1) & 255);
                    this.pixels[at] = speckColor(this.pixels[at], code & 1);
                }
            }

            if (!isLand) {
                if (tileHash(x, y, 9) % 6 === 0) {
                    for (let dx = 0; dx < this.px(3); dx++) this.blend(x * T + this.px(3) + dx, y * T + this.px(5), WHITE, 0.25);
                }
            } else if (this.view === 'terrain') {
                this.paintGroundDetail(x, y, i);
                this.paintTufts(x, y, i);
            }
        });
    },

    // Расположение крапинок: одинаково при любом сезоне и виде, поэтому считается один раз на карту.
    speckLayout(speckCount) {
        const size = this.map.size;
        const T = this.tileSize;
        const cache = this.speckCache;
        if (cache && cache.size === size && cache.tileSize === T && cache.seed === this.seedSalt) return cache.layout;

        const layout = new Int32Array(size * size * speckCount);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let h = tileHash(x, y, 200) | 1;
                for (let k = 0; k < speckCount; k++) {
                    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;   // xorshift: дёшево получаем следующие «случайные» числа
                    const r = h >>> 0;
                    layout[(y * size + x) * speckCount + k] = ((((r >>> 8) % T) << 9) | ((r % T) << 1) | ((r >>> 20) & 1));
                }
            }
        }
        this.speckCache = { size, tileSize: T, seed: this.seedSalt, layout };
        return layout;
    },

    // Сезонные мелочи на лугах: весной цветы, осенью опавшая листва.
    paintGroundDetail(x, y, i) {
        const colors = this.pal.groundDetail;
        const map = this.map;
        if (!colors || map.terrain[i] !== Terrain.PLAIN || map.biome[i] !== Biome.GRASSLAND || map.river[i] || map.resource[i] === Resource.SETTLEMENT || map.roadLevel[i] > 0) return;
        if (tileHash(x, y, 100) % 3 !== 0) return;

        const T = this.tileSize;
        for (let k = 0; k < 3; k++) {
            const h = tileHash(x, y, 101 + k);
            this.put(x * T + (h % T), y * T + ((h >>> 8) % T), hexToPacked(colors[h % colors.length]));
        }
    },

    // Трава: пучки стебельков. Чем плодороднее и влажнее место, тем их больше; цвет — оттенки земли под ними.
    paintTufts(x, y, i) {
        const map = this.map;
        if (map.terrain[i] !== Terrain.PLAIN || map.river[i] || map.shore[i] === Shore.BEACH || map.resource[i] === Resource.SETTLEMENT || map.roadLevel[i] > 0) return;

        const moisture = map.moisture[i];
        let count;
        switch (map.biome[i]) {
            case Biome.GRASSLAND: count = 1 + 7 * Math.pow(moisture, 1.3); break;
            case Biome.TAIGA: count = 1 + 3 * moisture; break;
            case Biome.SAVANNA: count = 2 + 3 * moisture; break;
            case Biome.STEPPE: count = 1 + 2 * moisture; break;
            case Biome.TUNDRA: count = 0.4 + 1.2 * moisture; break;
            default: return;
        }
        count = Math.round(count * this.options.grassDensity * (map.resource[i] === Resource.WOOD ? 0.6 : 1));

        const T = this.tileSize;
        const W = this.width;
        for (let n = 0; n < count; n++) {
            const h = tileHash(x, y, 400 + n);
            const bx = x * T + (h % T);
            const by = y * T + ((h >>> 8) % T);
            const ground = this.pixels[Math.min(by, W - 1) * W + Math.min(bx, W - 1)];
            const dark = shadeFast(ground, -56);
            const light = shadeFast(ground, 46);
            const blades = 2 + ((h >>> 16) % 2);
            const lean = ((h >>> 18) % 3) - 1;

            for (let b = 0; b < blades; b++) {
                const bladeHeight = this.px(2) + 1 + ((h >>> (20 + b)) & 1);
                for (let step = 0; step < bladeHeight; step++) {
                    this.putGround(bx + b + (step >= 2 ? lean : 0), by - step, step === bladeHeight - 1 ? light : dark);
                }
            }
        }
    },

    // Пиксель земли: не рисуем поверх воды и реки.
    putGround(x, y, color) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.width) return;
        const k = y * this.width + x;
        if (this.waterMask[k] || (this.riverMask && this.riverMask[k])) return;
        this.pixels[k] = color;
    },
};
