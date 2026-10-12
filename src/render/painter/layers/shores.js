import { Shore } from '../../../map/constants.js';
import { BLACK, WHITE, mixPacked, shadePacked } from '../../color.js';
import { BAYER, ICE_TEMPERATURE } from '../constants.js';
import { hashUnit } from '../noise.js';

/* Берега: пляжи, галька, утёсы */

export const shores = {
    /* Тип берега задаёт генератор (map.shore). Расстояние от воды считаем в пикселях: волной от воды вглубь суши.
         пляж     — полоса мокрого, потом сухого песка; в воде у берега белая пена;
         каменистый — галька и камни, пена послабее;
         утёс     — суша приподнята над водой: под её краем видна каменная стенка (на юге) и тень на воде. */
    paintShores() {
        if (!this.options.shores) return;

        const map = this.map;
        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const waterMask = this.waterMask;
        const c = this.colors;
        const wet = Math.max(1, this.px(2));            // ширина полосы мокрого песка
        const reach = Math.max(3, Math.ceil(wet + this.tileSize / this.options.coastSharpness)); // на сколько пикселей берег уходит вглубь суши (мягче переход — шире полоса)
        const distance = new Uint8Array(W * W);         // суша: расстояние до воды (1..reach)
        const kind = new Uint8Array(W * W);             // суша: тип берега; вода: метка пены
        const queue = [];
        const around = new Int32Array(4);
        const neighborsOf = k => {
            const x = k % W;
            let n = 0;
            if (x > 0) around[n++] = k - 1;
            if (x < W - 1) around[n++] = k + 1;
            if (k >= W) around[n++] = k - W;
            if (k < W * W - W) around[n++] = k + W;
            return n;
        };
        const tileOf = k => Math.floor(k / W / T) * size + Math.floor((k % W) / T);

        // 1) семена: пиксели суши прямо у воды в клетках с берегом
        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const i = ty * size + tx;
                const type = map.shore[i];
                if (!type || map.river[i] || !map.isLand(i)) continue;

                for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
                    for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                        const k = gy * W + gx;
                        if (waterMask[k]) continue;
                        const touchesWater = (gx > 0 && waterMask[k - 1]) || (gx < W - 1 && waterMask[k + 1])
                            || (gy > 0 && waterMask[k - W]) || (gy < W - 1 && waterMask[k + W]);
                        if (touchesWater) {
                            distance[k] = 1;
                            kind[k] = type;
                            queue.push(k);
                        }
                    }
                }
            }
        }

        // 2) волна вглубь суши
        for (let head = 0; head < queue.length; head++) {
            const k = queue[head];
            if (distance[k] >= reach) continue;
            const count = neighborsOf(k);
            for (let a = 0; a < count; a++) {
                const next = around[a];
                if (waterMask[next] || distance[next]) continue;
                distance[next] = distance[k] + 1;
                kind[next] = kind[k];
                queue.push(next);
            }
        }

        // 3) покраска суши
        for (const k of queue) {
            const gx = k % W, gy = (k - gx) / W;
            const d = distance[k];
            const type = kind[k];
            const threshold = BAYER[(gy & 3) * 4 + (gx & 3)];
            const ground = pixels[k];
            let color = 0;

            if (type === Shore.BEACH) {
                if (d <= wet) color = c.wetSand;
                else if (threshold < 1 - (d - wet) / (reach - wet + 1)) color = hashUnit(gx, gy, 620) < 0.18 ? c.wetSand : c.sand;
                if (color !== 0) {
                    const snow = this.snowCoverage(tileOf(k));
                    if (snow > 0) color = mixPacked(color, this.packed.snow, 0.9 * snow);
                }
            } else if (type === Shore.ROCKY) {
                if (threshold < 1 - (d - 1) / (reach + 1)) {
                    const r = hashUnit(gx, gy, 621);
                    color = r < 0.3 ? c.pebbleLight : r < 0.55 ? c.pebbleDark : mixPacked(ground, c.stoneMid, 0.6);
                }
            } else if (type === Shore.CLIFF) {
                if (d <= 3 && threshold < 0.7) color = shadePacked(ground, -0.2);
            }
            if (color !== 0) pixels[k] = color;
        }

        // 4) пена на воде у пляжей и каменистых берегов (если вода не замёрзла)
        const foam = [];
        for (const k of queue) {
            if (distance[k] !== 1 || (kind[k] !== Shore.BEACH && kind[k] !== Shore.ROCKY)) continue;
            const count = neighborsOf(k);
            for (let a = 0; a < count; a++) {
                const next = around[a];
                if (waterMask[next] && kind[next] === 0) {
                    kind[next] = 10 + kind[k];
                    foam.push(next);
                }
            }
        }
        const firstRing = foam.length;
        for (let head = 0; head < firstRing; head++) {
            const count = neighborsOf(foam[head]);
            for (let a = 0; a < count; a++) {
                const next = around[a];
                if (waterMask[next] && kind[next] === 0) {
                    kind[next] = 20;
                    foam.push(next);
                }
            }
        }
        for (const k of foam) {
            if (this.seasonalTemperature(tileOf(k)) < ICE_TEMPERATURE) continue;
            const gx = k % W, gy = (k - gx) / W;
            const threshold = BAYER[(gy & 3) * 4 + (gx & 3)];
            const mark = kind[k];
            if (mark >= 20) { if (threshold < 0.4) pixels[k] = mixPacked(pixels[k], WHITE, 0.16); }
            else if (threshold < 0.85) pixels[k] = mixPacked(pixels[k], WHITE, mark === 10 + Shore.BEACH ? 0.45 : 0.3);
        }

        this.paintCliffs();
    },

    // Утёсы: суша «приподнята» — под её южным краем стенка из камня, под ней тень на воде.
    paintCliffs() {
        const map = this.map;
        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const waterMask = this.waterMask;
        const faceHeight = Math.max(3, this.px(5));
        const rock = this.packed.rock;
        const faceTones = [shadePacked(rock, 0.1), shadePacked(rock, -0.08), shadePacked(rock, -0.24)];

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const i = ty * size + tx;
                if (map.shore[i] !== Shore.CLIFF || map.river[i] || !map.isLand(i)) continue;

                for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
                    for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                        const k = gy * W + gx;
                        if (waterMask[k]) continue;

                        if (k + W < W * W && waterMask[k + W]) {                 // вода под краем: виден обрыв
                            pixels[k] = shadePacked(pixels[k], 0.12);             // светлая кромка
                            for (let f = 1; f <= faceHeight; f++) {
                                const below = k + f * W;
                                if (below >= W * W || !waterMask[below]) break;
                                let tone = faceTones[Math.min(2, Math.floor((f - 1) * 3 / faceHeight))];
                                if (hashUnit(gx, gy + f, 622) < 0.2) tone = shadePacked(tone, -0.1);
                                pixels[below] = tone;
                                if (f === faceHeight) {
                                    for (let s = 1; s <= 2; s++) {
                                        const shadow = below + s * W;
                                        if (shadow < W * W && waterMask[shadow]) pixels[shadow] = mixPacked(pixels[shadow], BLACK, s === 1 ? 0.35 : 0.18);
                                    }
                                }
                            }
                        } else if ((gx > 0 && waterMask[k - 1]) || (gx < W - 1 && waterMask[k + 1])) {
                            pixels[k] = shadePacked(pixels[k], -0.2);             // боковая стенка
                        }
                    }
                }
            }
        }
    },
};
