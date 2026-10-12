import { mixPacked } from '../../color.js';

/* Скругление береговой линии.

   Проблема: клетки — квадраты, поэтому берег «из воды в сушу» идёт ступеньками.

   Решение: маска «вода/суша» размывается на уровне клеток (число проходов — coastPasses()). После размытия
   у каждой точки есть доля воды (0..1), и берег проводится по её середине (0.5). Дизеринг по этой доле даёт
   мягкую, округлую линию берега, а не ломаную по границам клеток.

   Важно: пиксель может «перейти на чужую сторону» только в клетках, которые сами стоят на берегу (у них
   есть сосед другого типа). Клетка внутри воды окружена водой — она целиком остаётся водой, и внутри неё не
   появляется земля. Это и убирает «внутреннюю обводку» песком посреди мелководья. */
export const coast = {
    /* ============================ Общее ============================ */

    // Сглаживание берега включено, если задан coastScale > 0. Размер размытия в клетках не зависит от
    // размера клетки в пикселях, поэтому форма берега одинакова при tileSize 12, 16, ...
    coastPasses() {
        const scale = Number(this.options.coastScale ?? 1.15);
        if (!(scale > 0)) return 0;
        const cells = scale * this.tileSize / 12;
        return Math.max(1, Math.round(cells * cells));
    },

    // 1 — клетка на берегу (рядом есть клетка другого типа); 0 — «внутренняя». Кэшируется на карту.
    coastKinds() {
        const source = this.tileWater;
        const cache = this.coastKindCache;
        if (cache && cache.source === source) return cache.kinds;

        const size = this.map.size;
        const kinds = new Uint8Array(size * size);
        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const i = ty * size + tx;
                const want = source[i];
                for (let dy = -1; dy <= 1 && !kinds[i]; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = tx + dx, ny = ty + dy;
                        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                        if (source[ny * size + nx] !== want) { kinds[i] = 1; break; }
                    }
                }
            }
        }
        this.coastKindCache = { source, kinds };
        return kinds;
    },

    // Размытое поле «воды» на уровне клеток (0..1). Кэшируется.
    coastField() {
        const passes = this.coastPasses();
        if (passes <= 0 || !this.tileWater) return null;
        const cache = this.coastFieldCache;
        if (cache && cache.passes === passes && cache.source === this.tileWater) return cache.field;

        const size = this.map.size;
        let field = new Float32Array(size * size);
        for (let i = 0; i < field.length; i++) field[i] = this.tileWater[i] ? 1 : 0;
        for (let p = 0; p < passes; p++) field = this.coastBlur(field, size);
        this.coastFieldCache = { passes, source: this.tileWater, field };
        return field;
    },

    // Размытие 3×3, раздельно по осям (дешевле).
    coastBlur(src, size) {
        const tmp = new Float32Array(src.length);
        const out = new Float32Array(src.length);
        const blurAxis = (input, output, horizontal) => {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let sum = 0, count = 0;
                    for (let d = -1; d <= 1; d++) {
                        const nx = horizontal ? x + d : x, ny = horizontal ? y : y + d;
                        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                        sum += input[ny * size + nx];
                        count++;
                    }
                    output[y * size + x] = sum / count;
                }
            }
        };
        blurAxis(src, tmp, true);
        blurAxis(tmp, out, false);
        return out;
    },

    // Доля воды (0..1) в пикселе по размытому полю (билинейно).
    coastFieldAt(gx, gy) {
        const field = this.coastField();
        if (!field) return null;
        const size = this.map.size;
        const { first, second, fraction } = this.axis;
        const u = fraction[gx], v = fraction[gy];
        const a = field[first[gy] * size + first[gx]], b = field[first[gy] * size + second[gx]];
        const c = field[second[gy] * size + first[gx]], d = field[second[gy] * size + second[gx]];
        const top = a + (b - a) * u;
        return top + (c + (d - c) * u - top) * v;
    },

    // Цвет ближайшей клетки нужного типа (для пикселя, отошедшего на «чужую» сторону). Кэш per-kind.
    coastColor(tile, wantLand, cache) {
        if (cache.has(tile)) return cache.get(tile);
        const size = this.map.size;
        const source = this.tileWater;
        let color = this.tileColors[tile];
        const x = tile % size, y = Math.floor(tile / size);
        for (let radius = 1; radius <= 3; radius++) {
            let found = -1;
            for (let dy = -radius; dy <= radius && found < 0; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                    if ((source[ny * size + nx] === 0) === wantLand) { found = ny * size + nx; break; }
                }
            }
            if (found >= 0) { color = this.tileColors[found]; break; }
        }
        cache.set(tile, color);
        return color;
    },

    // Есть ли в клетке или рядом (8 соседей) суша.
    hasLandNeighbor(tile) {
        const size = this.map.size;
        const x = tile % size, y = Math.floor(tile / size);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                if (!this.tileWater[ny * size + nx]) return true;
            }
        }
        return false;
    },

    /* ============================ Слои ============================ */

    /* Скругление берега. Пиксель получает тип по размытому полю, но лишь в клетках на берегу (coastKinds).
       Внутренние клетки не трогаются — вода остаётся водой, суша сушей, «обводки» посреди массива нет. */
    smoothCoast() {
        if (this.view !== 'terrain' || !this.tileColors) return;
        const field = this.coastField();
        if (!field) return;

        const size = this.map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const water = this.waterMask;
        const kinds = this.coastKinds();
        const shallow = this.packed.waterShades[0];
        const waterCache = new Map(), landCache = new Map();

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const tile = ty * size + tx;
                if (!kinds[tile]) continue;                              // внутренние клетки не трогаем
                const wantWater = this.tileWater[tile] ? 1 : 0;
                if (wantWater && !this.hasLandNeighbor(tile)) continue;  // одинокая вода не «зарастает» землёй
                const x0 = tx * T, y0 = ty * T;
                for (let gy = y0; gy < y0 + T; gy++) {
                    for (let gx = x0; gx < x0 + T; gx++) {
                        const k = gy * W + gx;
                        const isWater = this.coastFieldAt(gx, gy) > 0.5 ? 1 : 0;
                        if (isWater === wantWater) continue;             // пиксель уже на своей стороне
                        if (isWater) {
                            pixels[k] = mixPacked(this.coastColor(tile, false, waterCache), shallow, 0.6);
                            water[k] = 1;
                        } else {
                            pixels[k] = this.coastColor(tile, true, landCache);
                            water[k] = 0;
                        }
                    }
                }
            }
        }
    },

    /* Досыпка/уборка пикселей на берегу, чтобы картинка совпадала с типом клетки: в клетке-суше вода
       становится землёй (цвет ближайшей суши), в клетке-воде суша становится мелководьем. Трогаются только
       клетки на берегу, поэтому «двуличных» клеток не остаётся. */
    decorateWaterMask() {
        if (this.view !== 'terrain' || !this.tileColors) return;
        const field = this.coastField();
        if (!field) return;

        const size = this.map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const water = this.waterMask;
        const kinds = this.coastKinds();
        const shallow = this.packed.waterShades[0];
        const waterCache = new Map(), landCache = new Map();
        const half = (T * T) >> 1;

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const tile = ty * size + tx;
                if (!kinds[tile]) continue;
                const wantWater = this.tileWater[tile] ? 1 : 0;
                if (wantWater && !this.hasLandNeighbor(tile)) continue;
                const x0 = tx * T, y0 = ty * T;

                let wet = 0;
                for (let gy = y0; gy < y0 + T; gy++) {
                    for (let gx = x0; gx < x0 + T; gx++) if (water[gy * W + gx]) wet++;
                }
                if (wantWater ? wet >= half : wet <= half) continue;     // клетка уже в основном своего типа

                // Возвращаем к «своему» типу самые дальние от центра пиксели — форма берега остаётся круглой.
                const cx = x0 + T / 2, cy = y0 + T / 2;
                const wrong = [];
                for (let gy = y0; gy < y0 + T; gy++) {
                    for (let gx = x0; gx < x0 + T; gx++) {
                        const k = gy * W + gx;
                        if ((water[k] ? 1 : 0) === wantWater) continue;
                        const dx = Math.abs(gx - cx) / (T / 2), dy = Math.abs(gy - cy) / (T / 2);
                        wrong.push([Math.max(dx, dy), k]);
                    }
                }
                wrong.sort((p, q) => q[0] - p[0]);
                for (const [, k] of wrong) {
                    if (wantWater ? wet >= half : wet <= half) break;
                    if (wantWater) {
                        pixels[k] = mixPacked(this.coastColor(tile, false, waterCache), shallow, 0.6);
                        water[k] = 1; wet++;
                    } else {
                        pixels[k] = this.coastColor(tile, true, landCache);
                        water[k] = 0; wet--;
                    }
                }
            }
        }
    },
};
