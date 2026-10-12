import { clamp } from '../../../core/math.js';
import { mixPacked } from '../../color.js';
import { BAYER } from '../constants.js';
import { smoothstep } from '../noise.js';

/* Слой 1: фон — цвет клеток, пиксельно смешанный с соседями (дизеринг), скруглённые углы берегов */

export const base = {
    /* Сглаживание.
       Считаем, что цвет клетки «живёт» в её центре. Любой пиксель лежит внутри квадрата, углы которого — центры
       четырёх ближайших клеток (A B / C D). Вес каждой клетки — как при билинейной интерполяции, но вместо
       смешивания цветов мы выбираем один из четырёх с помощью дизеринга. Получается пиксельный градиент:
       у выпуклого угла («ступеньки») пиксели плавно уходят в цвет соседей, а внутри однотонных областей ничего не меняется. */
    paintBase() {
        const size = this.map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const { colors, water } = this.buildTileColors();
        this.tileColors = colors;      // нужны слою сглаживания берега
        this.tileWater = water;
        const smooth = this.view !== 'regions'; // в режиме регионов границы должны быть точными
        const quadOf = this.blendGrid().quadOf;

        const quadColors = new Int32Array(16);
        const quadWater = new Uint8Array(16);
        const waterMask = this.waterMask;
        const quadSharpness = new Uint8Array(4);
        const clampTile = v => (v < 0 ? 0 : v >= size ? size - 1 : v);

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                // Быстрый путь: клетка и все её соседи одного цвета — заливаем целиком.
                const color = colors[ty * size + tx];
                if (this.isUniform(colors, tx, ty, color)) {
                    for (let oy = 0; oy < T; oy++) {
                        const start = (ty * T + oy) * W + tx * T;
                        pixels.fill(color, start, start + T);
                        waterMask.fill(water[ty * size + tx], start, start + T);
                    }
                    continue;
                }

                // Клетка делится на 4 квадранта; у каждого свои четыре ближайшие клетки (A B / C D).
                for (let q = 0; q < 4; q++) {
                    const x0 = clampTile(tx + (q & 1) - 1), x1 = clampTile(tx + (q & 1));
                    const y0 = clampTile(ty + (q >> 1) - 1), y1 = clampTile(ty + (q >> 1));
                    const a = y0 * size + x0, b = y0 * size + x1, c = y1 * size + x0, d = y1 * size + x1;
                    quadColors[q * 4] = colors[a];
                    quadColors[q * 4 + 1] = colors[b];
                    quadColors[q * 4 + 2] = colors[c];
                    quadColors[q * 4 + 3] = colors[d];
                    quadWater[q * 4] = water[a];
                    quadWater[q * 4 + 1] = water[b];
                    quadWater[q * 4 + 2] = water[c];
                    quadWater[q * 4 + 3] = water[d];

                    // Берег (вода рядом с сушей) смешиваем резче, чем биомы между собой.
                    const waterCount = water[a] + water[b] + water[c] + water[d];
                    quadSharpness[q] = !smooth ? 2 : (waterCount > 0 && waterCount < 4 ? 1 : 0);
                }

                const choices = this.blendChoices(tx, ty);
                for (let oy = 0; oy < T; oy++) {
                    const row = (ty * T + oy) * W + tx * T;
                    for (let ox = 0; ox < T; ox++) {
                        const pos = oy * T + ox;
                        const q = quadOf[pos];
                        const choice = q * 4 + choices[quadSharpness[q]][pos];
                        pixels[row + ox] = quadColors[choice];
                        waterMask[row + ox] = quadWater[choice];
                    }
                }
            }
        }
    },

    /* Какой из четырёх цветов (A, B, C или D) получит пиксель, зависит только от его положения в клетке и
       от узора дизеринга, а не от самих цветов. Поэтому это считается заранее — по одной таблице на каждую
       «резкость» смешивания и каждый вариант сдвига узора (узор повторяется каждые 4 пикселя). */
    blendGrid() {
        if (this.grid) return this.grid;
        const T = this.tileSize;
        const quadOf = new Uint8Array(T * T);   // квадрант пикселя внутри клетки: 0..3
        const u = new Float32Array(T * T);
        const v = new Float32Array(T * T);
        for (let oy = 0; oy < T; oy++) {
            for (let ox = 0; ox < T; ox++) {
                const px = (ox + 0.5) / T - 0.5, py = (oy + 0.5) / T - 0.5;
                const pos = oy * T + ox;
                quadOf[pos] = (Math.floor(px) + 1) + 2 * (Math.floor(py) + 1);
                u[pos] = px - Math.floor(px);
                v[pos] = py - Math.floor(py);
            }
        }
        this.grid = { quadOf, u, v, cache: {} };
        return this.grid;
    },

    // Три таблицы выбора (мягкая, береговая, «ближайший сосед») для клетки с данным сдвигом узора дизеринга.
    blendChoices(tx, ty) {
        const T = this.tileSize;
        const grid = this.blendGrid();
        const offX = (tx * T) & 3, offY = (ty * T) & 3;
        const key = offX + 4 * offY;
        if (grid.cache[key]) return grid.cache[key];

        const sharpness = [this.options.blendSharpness, this.options.coastSharpness];
        const tables = [new Uint8Array(T * T), new Uint8Array(T * T), new Uint8Array(T * T)];
        for (let oy = 0; oy < T; oy++) {
            for (let ox = 0; ox < T; ox++) {
                const pos = oy * T + ox;
                const u = grid.u[pos], v = grid.v[pos];
                const threshold = BAYER[((oy + offY) & 3) * 4 + ((ox + offX) & 3)];

                for (let s = 0; s < 2; s++) {
                    const uu = clamp((u - 0.5) * sharpness[s] + 0.5);
                    const vv = clamp((v - 0.5) * sharpness[s] + 0.5);
                    const weightA = (1 - uu) * (1 - vv);
                    const weightB = uu * (1 - vv);
                    const weightC = (1 - uu) * vv;
                    tables[s][pos] = threshold < weightA ? 0 : threshold < weightA + weightB ? 1 : threshold < weightA + weightB + weightC ? 2 : 3;
                }
                tables[2][pos] = u < 0.5 ? (v < 0.5 ? 0 : 2) : (v < 0.5 ? 1 : 3);
            }
        }
        grid.cache[key] = tables;
        return tables;
    },

    // Для каждого пикселя по одной оси: между центрами каких клеток он лежит и на каком расстоянии от первого.
    buildAxisTables() {
        const size = this.map.size;
        const W = this.width;
        const first = new Int32Array(W);
        const second = new Int32Array(W);
        const fraction = new Float32Array(W);
        const smooth = new Float32Array(W);
        for (let p = 0; p < W; p++) {
            const position = (p + 0.5) / this.tileSize - 0.5; // в «клетках»; центр клетки — целое число
            const index = Math.floor(position);
            first[p] = clamp(index, 0, size - 1);
            second[p] = clamp(index + 1, 0, size - 1);
            fraction[p] = position - index;
            smooth[p] = smoothstep(position - index);
        }
        this.axis = { first, second, fraction, smooth };
    },

    // Клетка и все восемь соседей (или края карты) одного цвета?
    isUniform(colors, tx, ty, color) {
        const size = this.map.size;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = tx + dx, ny = ty + dy;
                if (nx >= 0 && ny >= 0 && nx < size && ny < size && colors[ny * size + nx] !== color) return false;
            }
        }
        return true;
    },

    /* Сглаживание берега.
       Маска «суша/вода» размывается на уровне клеток, поэтому линия берега перестаёт идти по границам клеток:
       выпуклые прямые углы скругляются, а между береговыми клетками появляются плавные заливы и мысы.
       Размытое поле интерполируется по пикселям, и берег проводится по его середине — с узкой дизеринг-каймой
       для мягкой кромки. */
    smoothCoast() {
        if (this.view !== 'terrain' || !this.map.landTiles || this.options.coastSmoothing === false) return;

        const map = this.map;
        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const water = this.waterMask;
        const axis = this.axis;
        const { first, second, fraction } = axis;
        const colors = this.tileColors, tileWater = this.tileWater;
        if (!colors) return;

        // Поле «воды» на уровне клеток: 1 — вода, 0 — суша; размываем, чтобы срезать прямые углы.
        let field = new Float32Array(size * size);
        for (let i = 0; i < field.length; i++) field[i] = tileWater[i] ? 1 : 0;
        const blur = source => {
            const out = new Float32Array(source.length);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let sum = 0, count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                            sum += source[ny * size + nx];
                            count++;
                        }
                    }
                    out[y * size + x] = sum / count;
                }
            }
            return out;
        };
        field = blur(blur(field));

        const waterColorOf = new Map(), landColorOf = new Map();
        const nearestColor = (tile, cache, wantLand) => {
            if (cache.has(tile)) return cache.get(tile);
            let color = colors[tile];
            const x = tile % size, y = Math.floor(tile / size);
            for (let radius = 1; radius <= 3; radius++) {
                let found = -1;
                for (let dy = -radius; dy <= radius && found < 0; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                        if ((tileWater[ny * size + nx] ? false : true) === wantLand) { found = ny * size + nx; break; }
                    }
                }
                if (found >= 0) { color = colors[found]; break; }
            }
            cache.set(tile, color);
            return color;
        };

        const shallow = this.packed.waterShades[0];
        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const baseWater = tileWater[ty * size + tx] ? 1 : 0;
                const tile = ty * size + tx;
                const x0 = tx * T, y0 = ty * T;
                for (let gy = y0; gy < y0 + T; gy++) {
                    const r0 = first[gy] * size, r1 = second[gy] * size, v = fraction[gy];
                    for (let gx = x0; gx < x0 + T; gx++) {
                        const u = fraction[gx];
                        const a = field[r0 + first[gx]], b = field[r0 + second[gx]];
                        const c = field[r1 + first[gx]], d = field[r1 + second[gx]];
                        const topRow = a + (b - a) * u;
                        const fv = topRow + (c + (d - c) * u - topRow) * v;
                        const newWater = fv > 0.5 ? 1 : 0;
                        if (newWater === baseWater) continue;               // пиксель уже на своей стороне

                        const k = gy * W + gx;
                        if (newWater) {
                            pixels[k] = mixPacked(nearestColor(tile, waterColorOf, false), shallow, 0.6);
                            water[k] = 1;
                        } else {
                            pixels[k] = nearestColor(tile, landColorOf, true);
                            water[k] = 0;
                        }
                    }
                }
            }
        }
    },
};
