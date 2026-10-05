/* ============================================================
   MapPainter — рисует карту целиком в один большой холст, пиксель за пикселем.

   Слои (снизу вверх):
     1. фон — цвет каждой клетки, пиксельно смешанный с соседями (дизеринг);
     2. рельеф гор — тени по карте высот; горы плавно переходят в окружающую землю;
     3. реки — с мягкой кромкой, мостами и бродами;
     4. текстура — крапинки, волны, цветы и листва на лугах;
     5. границы регионов;
     6. декорации (деревья, поля, руда, разломы) — строго снизу вверх, как в перспективе.

   Все рисунки заданы в долях клетки, поэтому размер клетки (tileSize) можно менять.
   Спрайты рассчитаны на 12 пикселей: функция px(n) переводит «пиксели для клетки 12×12» в текущий размер.
   ============================================================ */

/* ---------- Цвета, не зависящие от сезона (в виде hex) ---------- */
const COLORS = {
    bridgeDeck: '#a39e92',
    bridgeEdge: '#6e6a62',
    stone: '#b9b5ab',
    stoneShadow: '#7d7a72',
    gold: '#f2d15b',
    goldShadow: '#8a6a14',
    goldLight: '#fff2b0',
    riftDark: '#2a1250',
    riftGlow: '#a45cff',
    riftCore: '#e9ccff',
    regionBorder: '#19110a',
    sand: '#dccb96',
    wetSand: '#b5a67c',
    pebbleLight: '#a9a59a',
    pebbleDark: '#6f6c66',
    stoneMid: '#8a877e',
    hay: '#c9b774',
    dirt: '#8a7650',
    dirtLight: '#a89168',
    mud: '#5d4f38',
    plank: '#4a3524',
    wallA: '#dccca4',
    wallB: '#c8b48c',
    thatch: '#b09a5a',
    roofA: '#a24d34',
    roofB: '#7e3a2c',
    roofC: '#8d6238',
    roofD: '#5e5a66',
    outline: '#140e0a',
    window: '#f0b24a',
    fire: '#ffb347',
    fireCore: '#fff0b0',
    chapelStone: '#8d8a85',
    bone: '#cfc8b4',
    crow: '#16161a'
};

/* ---------- Цвета в виде одного числа (так пиксели быстро записываются в ImageData) ---------- */
const packRgb = (r, g, b) => 0xFF000000 | (b << 16) | (g << 8) | r; // знаковое 32-битное число, как в Int32Array
const hexToPacked = hex => packRgb(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
const WHITE = packRgb(255, 255, 255);
const BLACK = packRgb(0, 0, 0);

function hslToPacked(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const k = n => (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const channel = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return packRgb(channel(0), channel(8), channel(4));
}

// Смесь двух цветов: t = 0 — цвет a, t = 1 — цвет b. Целочисленная арифметика: функция вызывается миллионы раз.
function mixPacked(a, b, t) {
    const w = Math.round(t * 256);
    const inv = 256 - w;
    const r = ((a & 255) * inv + (b & 255) * w) >> 8;
    const g = (((a >>> 8) & 255) * inv + ((b >>> 8) & 255) * w) >> 8;
    const bl = (((a >>> 16) & 255) * inv + ((b >>> 16) & 255) * w) >> 8;
    return 0xFF000000 | (bl << 16) | (g << 8) | r;
}

// Крапинка: чуть светлее или чуть темнее (на ~13%), целочисленно.
function speckColor(color, lighter) {
    const target = lighter ? 255 : 0;
    const r = (color & 255) + (((target - (color & 255)) * 33) >> 8);
    const g = ((color >>> 8) & 255) + (((target - ((color >>> 8) & 255)) * 33) >> 8);
    const b = ((color >>> 16) & 255) + (((target - ((color >>> 16) & 255)) * 33) >> 8);
    return 0xFF000000 | (b << 16) | (g << 8) | r;
}

// Светлее (amount > 0) или темнее (amount < 0) на amount/256 — целочисленно, без выделения памяти.
function shadeFast(color, amount) {
    const r = color & 255, g = (color >>> 8) & 255, b = (color >>> 16) & 255;
    if (amount < 0) {
        const keep = 256 + amount;
        return 0xFF000000 | (((b * keep) >> 8) << 16) | (((g * keep) >> 8) << 8) | ((r * keep) >> 8);
    }
    return 0xFF000000 | ((b + (((255 - b) * amount) >> 8)) << 16) | ((g + (((255 - g) * amount) >> 8)) << 8) | (r + (((255 - r) * amount) >> 8));
}

// Светлее (amount > 0) или темнее (amount < 0).
const shadePacked = (color, amount) => mixPacked(color, amount > 0 ? WHITE : BLACK, Math.abs(amount));

// Палитра выбранного сезона в виде чисел.
const packPalette = palette => ({
    biome: palette.biome.map(hexToPacked),
    waterShades: palette.water.map(hexToPacked),
    riverShades: palette.river.map(hexToPacked),
    ice: palette.ice.map(hexToPacked),
    rock: hexToPacked(palette.rock),
    snow: hexToPacked(palette.snow),
    snowShade: hexToPacked(palette.snowShade),
    trunk: hexToPacked(palette.trunk)
});

/* ---------- Константы ---------- */

// Температуры (с учётом сезона), при которых выпадает снег и замерзает вода.
const SNOW_TEMPERATURE = 0.30;       // холоднее — на земле лежит снег
const ICE_TEMPERATURE = 0.16;        // холоднее — у берега замерзает вода
const RIVER_ICE_TEMPERATURE = 0.12;  // холоднее — замерзают реки

// С какой глубины (в клетках от берега) начинается следующий оттенок воды.
const WATER_DEPTH_STEPS = [1, 2, 3, 5, 8];
function waterShadeIndex(depth) {
    let index = 0;
    for (let k = 0; k < WATER_DEPTH_STEPS.length; k++) {
        if (depth >= WATER_DEPTH_STEPS[k]) index = k;
    }
    return index;
}

// Матрица упорядоченного дизеринга 4×4: даёт «пиксельный» градиент вместо плавного размытия.
const STEP_AMOUNTS = Int32Array.from([-30, -15, 0, 15, 28]); // ступени светотени холмов, в долях от 256
const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);

/* ---------- Детерминированные «случайности»: не меняются при перерисовке ---------- */
// Хеш с хорошим перемешиванием битов: простые формулы вида x*a ^ y*b дают заметные узоры (полосы, кирпичи).
function tileHash(x, y, k) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return h >>> 0;
}
const hashUnit = (x, y, k) => tileHash(x, y, k) / 4294967296;
const smoothstep = t => t * t * (3 - 2 * t);

// Плавный шум с ячейкой cell пикселей. Решётка и сглаженные позиции считаются один раз, потом шум берётся быстро.
class LatticeNoise {
    constructor(width, cell, salt) {
        const count = Math.ceil(width / cell) + 2;
        this.count = count;
        this.lattice = new Float32Array(count * count);
        for (let y = 0; y < count; y++) {
            for (let x = 0; x < count; x++) this.lattice[y * count + x] = hashUnit(x, y, salt);
        }
        this.index = new Int32Array(width);
        this.fraction = new Float32Array(width);
        for (let p = 0; p < width; p++) {
            const f = p / cell;
            const i = Math.floor(f);
            this.index[p] = i;
            this.fraction[p] = smoothstep(f - i);
        }
    }

    // Значение 0..1 в пикселе (gx, gy).
    at(gx, gy) {
        const { lattice, count } = this;
        const k = this.index[gy] * count + this.index[gx];
        const u = this.fraction[gx], v = this.fraction[gy];
        const top = lattice[k] + (lattice[k + 1] - lattice[k]) * u;
        const bottom = lattice[k + count] + (lattice[k + count + 1] - lattice[k + count]) * u;
        return top + (bottom - top) * v;
    }
}

/* Светотень холмов не зависит от сезона, поэтому считается один раз: для каждого пикселя, который надо изменить,
   запоминаем индекс и «код» (ступень светотени + признак оврага). При каждой перерисовке остаётся только применить список.
   Горячий цикл вынесен в отдельную функцию с простыми аргументами: так движок JavaScript оптимизирует его
   лучше, чем кусок большого метода. Идём строка за строкой — память читается последовательно. */
function computeHillShading({ hills, waterMask, flags, tileOfColumn, width, tile, strength, ravineWidth, valleyNoise, capacity }) {
    const size = width / tile;
    const last = width * width - 1;
    const scale = strength * 1.6;
    const index = new Int32Array(capacity);
    const code = new Uint8Array(capacity);
    let count = 0;

    for (let gy = 0; gy < width; gy++) {
        const rowTiles = Math.floor(gy / tile) * size;
        const bayerRow = (gy & 3) * 4;

        for (let gx = 0; gx < width; gx++) {
            const flag = flags[rowTiles + tileOfColumn[gx]];
            if (flag === 0) continue;

            const k = gy * width + gx;
            if (waterMask[k] === 1) continue;

            const here = hills[k];
            const northWest = k > width + 1 ? hills[k - width - 1] : here;
            const southEast = k < last - width - 1 ? hills[k + width + 1] : here;     // > 0 — склон повёрнут к свету
            const threshold = BAYER[bayerRow + (gx & 3)];
            let step = Math.round(((southEast - northWest) * 0.06 + (here - 128) * 0.01) * scale + (threshold - 0.5) * 0.6);
            step = step < -2 ? -2 : step > 2 ? 2 : step;
            const ravine = flag === 3 && Math.abs(2 * valleyNoise.at(gx, gy) - 1) < ravineWidth;

            if (step !== 0 || ravine) {
                index[count] = k;
                code[count] = (step + 2) | (ravine ? 8 : 0);
                count++;
            }
        }
    }
    return { index, code, count };
}

function applyHillShading(pixels, { index, code, count }) {
    for (let n = 0; n < count; n++) {
        const k = index[n];
        const c = code[n];
        let color = pixels[k];
        const step = (c & 7) - 2;
        if (step !== 0) color = shadeFast(color, STEP_AMOUNTS[step + 2]);
        if (c & 8) color = shadeFast(color, -78);
        pixels[k] = color;
    }
}

/* Маленький пиксельный буфер для рисунков (дома, руды, эфир): прозрачный фон, рисование фигур, контур.
   Рисунок готовится один раз, а потом копируется на карту. */
class PixelBuffer {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Int32Array(width * height); // 0 — прозрачно
    }

    put(x, y, color) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.data[y * this.width + x] = color;
    }

    rect(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, color);
    }

    // Эллипс с объёмом: слева сверху светлее, справа снизу темнее.
    ellipse(cx, cy, rx, ry, base, light, dark) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
                if (nx * nx + ny * ny > 1) continue;
                const lean = nx + ny;
                this.put(x, y, lean < -0.45 ? light : lean > 0.5 ? dark : base);
            }
        }
    }

    // Контур вокруг силуэта: прозрачные пиксели, у которых есть закрашенный сосед.
    outline(color) {
        const { width, height, data } = this;
        const edge = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (data[y * width + x] !== 0) continue;
                const touches = (x > 0 && data[y * width + x - 1] !== 0) || (x < width - 1 && data[y * width + x + 1] !== 0)
                    || (y > 0 && data[(y - 1) * width + x] !== 0) || (y < height - 1 && data[(y + 1) * width + x] !== 0);
                if (touches) edge.push(y * width + x);
            }
        }
        for (const index of edge) data[index] = color;
    }
}

/* ============================================================
   MapPainter
   ============================================================ */
class MapPainter {
    constructor(map, options = {}) {
        this.map = map;
        this.options = {
            tileSize: 12,
            blendSharpness: 1.5,   // насколько резко смешиваются соседние биомы (больше — резче, 1 — очень мягко)
            coastSharpness: 1.5,   // то же для границы воды и суши — а также для берегов (песок, галька) и краёв рек
            peakSharpness: 0.75,   // 0..1: острота гор (0 — округлые холмы-«губка», 1 — острые пики и гребни)
            mountainLift: 14,      // на сколько пикселей (для клетки 12×12) самые высокие горы поднимаются вверх, к северу
            hillStrength: 0.6,     // 0..1: заметность холмов и впадин на равнинах (0 — выключить)
            ravineDensity: 0.5,    // 0..1: сколько оврагов в сухих местах (0 — нет)
            grassDensity: 1,       // густота пучков травы (множитель)
            shores: true,          // пляжи, каменистые берега и утёсы
            settlements: true,     // поселения (домики)
            roads: true,           // дороги между поселениями
            grade: true,           // в тёмном стиле: цветокоррекция, туман, виньетка
            vignette: 0.35,        // затемнение к краям карты в тёмном стиле (0 — нет)
            props: true,           // в тёмном стиле: кости, вороны, развалины, виселицы
            ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) // undefined не должен затирать значения по умолчанию
        };
        this.tileSize = this.options.tileSize;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.colors = {};
        for (const [name, hex] of Object.entries(COLORS)) this.colors[name] = hexToPacked(hex);
    }

    /* ---------- Главный метод ---------- */

    // view: 'terrain' | 'temperature' | 'regions'. Возвращает холст с готовой картой.
    paint({ view, seasonName, showBorders, mood }) {
        this.view = view;
        this.mood = mood === 'dark' ? 'dark' : 'light';
        this.season = (this.mood === 'dark' ? DARK_SEASONS : SEASONS)[seasonName];
        this.pal = this.season.palette;
        this.packed = packPalette(this.pal);
        this.seedSalt = ((this.map.seed | 0) * 13) % 100000; // у каждой карты свои узоры шума

        this.width = this.map.size * this.tileSize;
        this.canvas.width = this.width;
        this.canvas.height = this.width;
        const image = this.ctx.createImageData(this.width, this.width);
        this.pixels = new Int32Array(image.data.buffer); // Int32: значения помещаются в «маленькие целые», это заметно быстрее, чем Uint32
        this.waterMask = new Uint8Array(this.width * this.width); // 1 — пиксель воды (заполняется при рисовании фона)
        this.riverMask = null;
        this.relief = null;
        this.reliefHeight = null;
        this.shadeCache = new Map();
        this.tuftCache = new Map();
        this.emissive = [];   // источники света (окна, костры, эфирные разломы): рисуются после цветокоррекции, чтобы оставаться яркими
        this.buildAxisTables();

        const terrain = view === 'terrain';
        this.paintBase();
        if (terrain) {
            this.relief = this.buildReliefHeights();
            this.reliefHeight = this.relief.height;
            this.paintHills();
            this.paintShores();
            this.paintRivers();
            this.paintRoads();
        }
        this.paintTexture();
        if (showBorders) this.paintRegionBorders();
        if (terrain) this.paintScene();

        if (terrain && this.mood === 'dark' && this.options.grade) this.applyGrading();
        for (const draw of this.emissive) draw();

        this.ctx.putImageData(image, 0, 0);
        return this.canvas;
    }

    /* ---------- Вспомогательные ---------- */

    // «Пиксели для клетки 12×12» -> пиксели текущей клетки.
    px(n) {
        return Math.round(n * this.tileSize / 12);
    }

    forEachTile(callback) {
        const size = this.map.size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) callback(x, y);
        }
    }

    // Температура клетки с учётом сезона: зимой холоднее, летом теплее.
    seasonalTemperature(i) {
        return this.map.temperature[i] + this.season.tempShift;
    }

    put(x, y, color) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.width) this.pixels[y * this.width + x] = color;
    }

    blend(x, y, color, alpha) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.width) return;
        const k = y * this.width + x;
        this.pixels[k] = mixPacked(this.pixels[k], color, alpha);
    }

    rect(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) this.put(xx, yy, color);
        }
    }

    // Пиксели отрезка (алгоритм Брезенхэма).
    linePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let error = dx + dy;
        for (;;) {
            points.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const doubled = 2 * error;
            if (doubled >= dy) { error += dy; x0 += sx; }
            if (doubled <= dx) { error += dx; y0 += sy; }
        }
        return points;
    }

    /* ---------- 1. Фон ---------- */

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    // Вода темнее по мере удаления от берега — и в океане, и в озёрах. В холод у берега появляется лёд.
    waterColor(i) {
        const depth = this.map.waterDepth[i];
        const temperature = this.seasonalTemperature(i);

        if (this.view === 'terrain' && temperature < ICE_TEMPERATURE) {
            const freezeDepth = Math.round((ICE_TEMPERATURE - temperature) / ICE_TEMPERATURE * 10); // чем холоднее, тем дальше от берега лёд
            if (depth > 0 && depth <= freezeDepth) return this.packed.ice[depth <= 3 ? 0 : depth <= 6 ? 1 : 2];
        }
        return this.packed.waterShades[waterShadeIndex(depth)];
    }

    // Цвет земли: цвет биома в этом сезоне, с поправкой на плодородие, а в холод — с примесью снега.
    groundColor(i) {
        const base = this.packed.biome[this.map.biome[i]];
        if (this.view !== 'terrain') return base;

        const tinted = this.fertilityTint(i, base);
        const coverage = this.snowCoverage(i);
        return coverage > 0 ? mixPacked(tinted, this.packed.snow, 0.9 * coverage) : tinted;
    }

    // Доля снега на земле: 0, 1/3, 2/3 или 1 («пиксельные» ступени).
    snowCoverage(i) {
        return Math.round(clamp((SNOW_TEMPERATURE - this.seasonalTemperature(i)) / 0.16) * 3) / 3;
    }

    // Внутри одного биома цвет зависит от плодородия: влажные места гуще и темнее, сухие светлее и желтее.
    fertilityTint(i, color) {
        const biome = this.map.biome[i];
        if (biome === Biome.TUNDRA || biome === Biome.DESERT) return color;

        const moisture = Math.round(this.map.moisture[i] * 5) / 5; // 6 ступеней: меньше «грязи» на стыках клеток
        return moisture > 0.5
            ? shadePacked(color, -0.16 * (moisture - 0.5) / 0.5)
            : mixPacked(color, this.colors.hay, 0.32 * (0.5 - moisture) / 0.5);
    }

    // Цвет, осветлённый или затемнённый на step ступеней (-2..2).
    shadeStep(color, step) {
        return shadeFast(color, STEP_AMOUNTS[step + 2]);
    }

    /* ---------- 2. Холмы и овраги ---------- */

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
    }

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
    }

    /* ---------- 3. Берега ---------- */

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
    }

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
    }

    /* ---------- 4. Рельеф гор ---------- */

    /* Горы — «карта высот», раскрашенная светотенью (свет слева сверху), а не спрайты. Высота клетки берётся из
       генератора, размывается по соседям и интерполируется до пикселя; к ней добавляются острые гребни (шум) и
       вершины-«конусы». Затем карта проецируется наклонно: чем выше точка, тем выше (севернее) она рисуется на
       экране — как у деревьев, которые показаны почти в профиль. Южные склоны при этом растягиваются и
       становятся видны «лицом» зрителю.
       Острота гор настраивается параметром peakSharpness (0 — округлые, 1 — острые). */

    // Карта высот гор по пикселям. От сезона не зависит, поэтому кэшируется.
    buildReliefHeights() {
        const map = this.map;
        const sharp = clamp(this.options.peakSharpness);
        const cache = this.reliefCache;
        if (cache && cache.source === map.mountainHeight && cache.tileSize === this.tileSize && cache.sharpness === sharp) return cache;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const blurred = this.blurMountainHeights();
        const zone = this.tilesNearRelief(blurred);
        const height = new Uint8Array(W * W);
        const { first, second, fraction } = this.axis;
        const broad = new LatticeNoise(W, Math.max(6, this.px(34)), 501 + this.seedSalt);
        const fine = new LatticeNoise(W, Math.max(4, this.px(16)), 502 + this.seedSalt);
        const warp = new LatticeNoise(W, Math.max(6, this.px(26)), 503 + this.seedSalt);
        const crestWeight = 0.2 + 0.4 * sharp;   // насколько рельеф определяется гребнями
        const crestPower = 1 + 2.5 * sharp;        // чем больше, тем тоньше и острее гребни
        const powerTable = (power) => Float32Array.from({ length: 256 }, (_, n) => Math.pow(n / 255, power)); // x^power без Math.pow в цикле
        const coarseTable = powerTable(crestPower);
        const fineTable = powerTable(1 + 2 * sharp);
        const wrap = this.px(18);

        for (const tile of zone) {
            const tx = tile % size, ty = Math.floor(tile / size);
            for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
                const rowTop = first[gy] * size, rowBottom = second[gy] * size, v = fraction[gy];
                for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                    const u = fraction[gx]; // линейная интерполяция: smoothstep делал из массива «кирпичную кладку»
                    const a = blurred[rowTop + first[gx]], b = blurred[rowTop + second[gx]];
                    const c = blurred[rowBottom + first[gx]], d = blurred[rowBottom + second[gx]];
                    const top = a + (b - a) * u;
                    const base = top + (c + (d - c) * u - top) * v;
                    if (base < 0.01) continue;

                    // Гребни — линии, где шум пересекает 0.5; шум «скручен» другим шумом, поэтому гребни извиваются, а не замыкаются в ячейки.
                    const shift = Math.round((warp.at(gx, gy) - 0.5) * wrap);
                    const wx = Math.min(W - 1, Math.max(0, gx + shift));
                    const wy = Math.min(W - 1, Math.max(0, gy - shift));
                    const crestA = coarseTable[Math.round((1 - Math.abs(2 * broad.at(wx, wy) - 1)) * 255)];
                    const crestB = fineTable[Math.round((1 - Math.abs(2 * fine.at(wx, wy) - 1)) * 255)];
                    const crest = 0.7 * crestA + 0.3 * crestB;
                    const h = base * ((1 - crestWeight) + crestWeight * 1.7 * crest);
                    height[gy * W + gx] = Math.round(clamp(h) * 255);
                }
            }
        }

        this.addPeaks(height, sharp);
        this.reliefCache = { source: map.mountainHeight, tileSize: T, sharpness: sharp, zone, height };
        return this.reliefCache;
    }

    // Острые вершины: у каждой от макушки расходятся 3–4 гребня; склоны по обе стороны гребня — плоские грани
    // (одна на свету, другая в тени). Круглые «конусы» давали кратеры, а гребни дают настоящие пики.
    addPeaks(height, sharp) {
        if (sharp <= 0.05) return;
        const { size, mountainHeight } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const armWidth = Math.max(3, this.px(7));

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const tileHeight = mountainHeight[y * size + x];
                if (tileHeight < 0.6) continue;
                if (hashUnit(x, y, 700 + this.seedSalt) > 0.3 + 0.4 * sharp) continue;

                const cx = x * T + T / 2 + (hashUnit(x, y, 701) - 0.5) * 0.5 * T;
                const cy = y * T + T / 2 + (hashUnit(x, y, 702) - 0.5) * 0.5 * T;
                const radius = this.px(12) + hashUnit(x, y, 703) * this.px(6);
                const radiusSq = radius * radius;
                const tip = Math.min(1, tileHeight * 1.2 + 0.12);

                const armCount = 3 + (tileHash(x, y, 704) % 2);
                const turn = hashUnit(x, y, 705) * Math.PI * 2;
                const armX = new Float32Array(armCount), armY = new Float32Array(armCount);
                for (let a = 0; a < armCount; a++) {
                    const angle = turn + a * 2 * Math.PI / armCount + (hashUnit(x, y, 710 + a) - 0.5) * 0.7;
                    armX[a] = Math.cos(angle);
                    armY[a] = Math.sin(angle);
                }

                const top = Math.max(0, Math.floor(cy - radius)), bottom = Math.min(W - 1, Math.ceil(cy + radius));
                const left = Math.max(0, Math.floor(cx - radius)), right = Math.min(W - 1, Math.ceil(cx + radius));
                for (let py = top; py <= bottom; py++) {
                    const dy = py - cy;
                    for (let px = left; px <= right; px++) {
                        const dx = px - cx;
                        if (dx * dx + dy * dy > radiusSq) continue;

                        let best = 0;
                        for (let a = 0; a < armCount; a++) {
                            const along = dx * armX[a] + dy * armY[a];
                            if (along < -armWidth * 0.5) continue;
                            const t = along <= 0 ? 0 : along / radius;
                            const across = Math.abs(dy * armX[a] - dx * armY[a]);
                            const value = (1 - t) * (1 - across / (armWidth * (1 - 0.55 * t)));
                            if (value > best) best = value;
                        }
                        if (best <= 0) continue;
                        const value = Math.round(Math.min(1, tip * 1.15) * (0.15 + 0.85 * best) * 255);
                        const k = py * W + px;
                        if (value > height[k]) height[k] = value;
                    }
                }
            }
        }
    }

    // Всё, что нужно для рисования рельефа в этом сезоне: тоны камня и снега, уровни снега, состояние проекции.
    prepareReliefRows() {
        const { zone, height } = this.relief;
        if (zone.length === 0) return null;

        const size = this.map.size;
        const W = this.width;
        const rows = Array.from({ length: size }, () => []);
        for (const tile of zone) rows[Math.floor(tile / size)].push(tile % size);

        const rock = this.packed.rock;
        const snow = this.packed.snow;
        const snowShade = this.packed.snowShade;
        const snowLevels = new Float32Array(size * size);
        for (const tile of zone) snowLevels[tile] = this.snowLevel(tile);

        return {
            rows,
            height,
            snowLevels,
            ramp: Int32Array.from([-0.3, -0.14, 0.05, 0.2, 0.34], amount => shadePacked(rock, amount)), // от тени к свету
            snowRamp: Int32Array.from([mixPacked(snowShade, rock, 0.3), snowShade, mixPacked(snow, snowShade, 0.5), snow, snow]),
            foothill: new Map(),                         // цвет земли -> цвет земли с проступающим камнем
            lift: this.px(this.options.mountainLift),
            proj: new Int32Array(W),                     // для каждого столбца: куда на экране попал предыдущий пиксель
            face: new Int32Array(W),                     // и каким цветом закрасить «склон» под ним
            valid: new Uint8Array(W)
        };
    }

    // Одна строка карты высот -> экран. Горы поднимаются вверх на lift * высота; пустоты между строками
    // (южные склоны) закрашиваются цветом склона.
    paintReliefRow(relief, gy) {
        const T = this.tileSize;
        const W = this.width;
        const size = this.map.size;
        const ty = Math.floor(gy / T);
        const { height, ramp, snowRamp, snowLevels, foothill, lift, proj, face, valid } = relief;
        const pixels = this.pixels;
        const last = W * W - 1;

        for (const tx of relief.rows[ty]) {
            const snowLevel = snowLevels[ty * size + tx];

            for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                const k = gy * W + gx;
                const raw = height[k];
                const h = raw / 255;
                const threshold = BAYER[(gy & 3) * 4 + (gx & 3)];
                let color = 0;
                let faceColor = 0;

                if (raw >= 41) {
                    // Свет падает слева сверху: склон, повёрнутый к северо-западу (юго-восток выше), светлый.
                    const northWest = k > W + 1 ? height[k - W - 1] : raw;
                    const southEast = k < last - W - 1 ? height[k + W + 1] : raw;
                    let tone = Math.round(2 + (southEast - northWest) * (20 / 255) + (h - 0.45) * 2.6 + (threshold - 0.5) * 0.35);
                    tone = tone < 0 ? 0 : tone > 4 ? 4 : tone;

                    const palette = h + (threshold - 0.5) * 0.08 > snowLevel ? snowRamp : ramp;
                    color = palette[tone];
                    faceColor = palette[tone > 0 ? tone - 1 : 0]; // южные склоны на свету бывают реже: делаем темнее
                } else if (raw >= 13 && threshold < (h - 0.05) / 0.11) {   // предгорья: камень «прорастает» сквозь землю
                    const ground = pixels[k];
                    let mixed = foothill.get(ground);
                    if (mixed === undefined) foothill.set(ground, mixed = mixPacked(ground, ramp[1], 0.65));
                    color = faceColor = mixed;
                }

                if (color === 0) {                  // здесь земля: закрываем склон, оставшийся над ней
                    if (valid[gx]) {
                        this.fillColumn(gx, proj[gx] + 1, gy - 1, face[gx]);
                        valid[gx] = 0;
                    }
                    continue;
                }

                const lifted = gy - Math.round(h * lift);
                if (valid[gx] && lifted - proj[gx] > 1) this.fillColumn(gx, proj[gx] + 1, lifted - 1, faceColor);
                if (lifted >= 0) pixels[lifted * W + gx] = color;
                proj[gx] = lifted;
                face[gx] = faceColor;
                valid[gx] = 1;
            }
        }
    }

    fillColumn(gx, fromY, toY, color) {
        const W = this.width;
        for (let y = Math.max(0, fromY); y <= toY; y++) this.pixels[y * W + gx] = color;
    }

    // Высоты клеток, дважды размытые по соседям: горы «набухают» за пределы своих клеток, а разброс высот
    // от клетки к клетке сглаживается (иначе на массиве проступает сетка).
    blurMountainHeights() {
        const size = this.map.size;
        const pass = source => {
            const out = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let sum = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && ny >= 0 && nx < size && ny < size) sum += source[ny * size + nx];
                        }
                    }
                    out[y * size + x] = sum / 9;
                }
            }
            return out;
        };
        const blurred = pass(pass(this.map.mountainHeight));
        for (let i = 0; i < blurred.length; i++) blurred[i] = Math.min(1, blurred[i] * 1.8);
        return blurred;
    }

    // Клетки, на которых может быть рельеф: сами горы и всё, что рядом.
    tilesNearRelief(blurred) {
        const size = this.map.size;
        const zone = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let near = false;
                for (let dy = -1; dy <= 1 && !near; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < size && ny < size && blurred[ny * size + nx] > 0) { near = true; break; }
                    }
                }
                if (near) zone.push(y * size + x);
            }
        }
        return zone;
    }

    // С какой относительной высоты лежит снег: чем холоднее (с учётом сезона), тем он ниже.
    snowLevel(tile) {
        const fraction = clamp((0.36 - this.seasonalTemperature(tile)) / 0.3);
        return 0.95 - fraction * 0.6;
    }

    /* ---------- 3. Реки ---------- */

    // Ширина реки в пикселях по её уровню (глубине).
    riverWidth(level) {
        return Math.max(level + 1, this.px([4, 6, 8][level - 1]));
    }

    // Смещение полосы толщиной thickness, чтобы она лежала по центру клетки.
    band(thickness) {
        return Math.round((this.tileSize - thickness) / 2);
    }

    /* Реки рисуем прямо в пиксели фона (а не поверх готовой картинки), чтобы у них была такая же мягкая
       «пиксельная» кромка, как у биомов и берега.
       Сначала строим маску: в каждом пикселе — уровень реки (1..3) или 0. Потом красим её и растушёвываем края дизерингом. */
    paintRivers() {
        const map = this.map;
        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const mask = new Uint8Array(W * W);
        this.riverMask = mask;

        const riverTiles = [];
        for (let i = 0; i < map.river.length; i++) {
            if (map.river[i] > 0) riverTiles.push(i);
        }

        const fill = (px, py, w, h, level) => {
            for (let yy = py; yy < py + h; yy++) {
                for (let xx = px; xx < px + w; xx++) {
                    const k = yy * W + xx;
                    if (level > mask[k]) mask[k] = level;
                }
            }
        };
        const inMap = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
        const riverAt = (x, y) => (inMap(x, y) ? map.river[y * size + x] : 0);
        const waterAt = (x, y) => inMap(x, y) && !map.isLand(y * size + x);
        const armLength = Math.ceil(T / 2) + 1; // рукав от края клетки чуть заходит за центр

        // 1) форма: центр-«плюс» со срезанными углами + рукава к соседним рекам и воде
        for (const i of riverTiles) {
            const x = i % size;
            const y = Math.floor(i / size);
            const level = map.river[i];
            const width = this.riverWidth(level);
            const px = x * T;
            const py = y * T;

            fill(px + this.band(width - 2), py + this.band(width), width - 2, width, level);
            fill(px + this.band(width), py + this.band(width - 2), width, width - 2, level);

            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const neighborLevel = riverAt(x + dx, y + dy);
                if (!neighborLevel && !waterAt(x + dx, y + dy)) continue;

                const thickness = neighborLevel ? Math.min(width, this.riverWidth(neighborLevel)) : width;
                const offset = this.band(thickness);
                if (dx === -1) fill(px, py + offset, armLength, thickness, level);
                if (dx === 1) fill(px + T - armLength, py + offset, armLength, thickness, level);
                if (dy === -1) fill(px + offset, py, thickness, armLength, level);
                if (dy === 1) fill(px + offset, py + T - armLength, thickness, armLength, level);
            }

            // Затока (река расширилась на 2×2 клетки и больше): закрываем «дырку» в общем углу четырёх клеток.
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                if (riverAt(x + dx, y) && riverAt(x, y + dy) && riverAt(x + dx, y + dy)) {
                    fill(px + (dx < 0 ? 0 : Math.floor(T / 2)), py + (dy < 0 ? 0 : Math.floor(T / 2)), Math.ceil(T / 2), Math.ceil(T / 2), level);
                }
            }
        }

        // 2) мягкая кромка. Для пикселя у края считаем расстояние до края реки (внутри — положительное, снаружи — отрицательное)
        //    и по нему вероятность речного цвета (дизеринг). Ширина перехода — T / coastSharpness, как у берега моря:
        //    чем меньше coastSharpness, тем мягче и шире кромка реки и её берега.
        const pixels = this.pixels;
        const edgeWidth = Math.max(2, T / this.options.coastSharpness);
        const reachPx = Math.ceil(edgeWidth / 2) + 1;
        const distance = new Int8Array(W * W);
        const levelNear = new Uint8Array(W * W);
        const queue = [];
        const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= W ? 0 : mask[yy * W + xx]);

        for (const i of riverTiles) {
            const x0 = (i % size) * T - 1;
            const y0 = Math.floor(i / size) * T - 1;
            for (let yy = y0; yy < y0 + T + 2; yy++) {
                for (let xx = x0; xx < x0 + T + 2; xx++) {
                    if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
                    const k = yy * W + xx;
                    if (distance[k] !== 0) continue;
                    const around = Math.max(at(xx - 1, yy), at(xx + 1, yy), at(xx, yy - 1), at(xx, yy + 1));
                    if (mask[k] > 0 && (at(xx - 1, yy) === 0 || at(xx + 1, yy) === 0 || at(xx, yy - 1) === 0 || at(xx, yy + 1) === 0)) {
                        distance[k] = 1;                       // последний пиксель реки у края
                        levelNear[k] = mask[k];
                        queue.push(k);
                    } else if (mask[k] === 0 && around > 0) {
                        distance[k] = -1;                      // первый пиксель суши у воды
                        levelNear[k] = around;
                        queue.push(k);
                    }
                }
            }
        }
        for (let head = 0; head < queue.length; head++) {          // волна от края внутрь реки и наружу на сушу
            const k = queue[head];
            const d = distance[k];
            const sign = d > 0 ? 1 : -1;
            if (Math.abs(d) >= reachPx) continue;
            const x = k % W, y = (k - x) / W;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
                const next = ny * W + nx;
                if (distance[next] !== 0 || (mask[next] > 0) !== (sign > 0)) continue;
                distance[next] = d + sign;
                levelNear[next] = levelNear[k];
                queue.push(next);
            }
        }

        const iceRiver = i => this.seasonalTemperature(i) < RIVER_ICE_TEMPERATURE;
        for (const i of riverTiles) {                              // сердцевина реки — сплошной цвет
            const x0 = (i % size) * T, y0 = Math.floor(i / size) * T;
            const shades = iceRiver(i) ? this.packed.ice : this.packed.riverShades;
            for (let yy = y0; yy < y0 + T; yy++) {
                for (let xx = x0; xx < x0 + T; xx++) {
                    const k = yy * W + xx;
                    if (mask[k] > 0 && distance[k] === 0) pixels[k] = shades[mask[k] - 1];
                }
            }
        }
        for (const k of queue) {                                   // кромка: дизеринг по расстоянию до края
            const d = distance[k];
            const xx = k % W, yy = (k - xx) / W;
            const tile = Math.floor(yy / T) * size + Math.floor(xx / T);
            const shades = iceRiver(tile) ? this.packed.ice : this.packed.riverShades;
            const level = levelNear[k];
            const threshold = BAYER[(yy & 3) * 4 + (xx & 3)];

            if (d > 0) {
                const soft = Math.min(edgeWidth, this.riverWidth(level));
                if (threshold < clamp(0.5 + (d - 0.5) / soft)) pixels[k] = shades[level - 1];
            } else {
                const outside = -d;
                if (threshold < clamp(0.5 - (outside - 0.5) / edgeWidth)) pixels[k] = shades[level - 1];
                else if (this.options.shores) this.paintBankPixel(xx, yy, k, outside, reachPx);
            }
        }
    }

    // Берег реки: у пляжных клеток песок, у каменистых галька, иначе — тёмная мокрая земля. Чем дальше от воды, тем реже.
    paintBankPixel(xx, yy, k, outside, reachPx) {
        if (this.waterMask[k]) return;
        const chance = 0.9 * (1 - (outside - 1) / reachPx);
        if (hashUnit(xx, yy, 631) >= chance) return;

        const T = this.tileSize;
        const tile = Math.floor(yy / T) * this.map.size + Math.floor(xx / T);
        const type = this.map.shore[tile];
        const c = this.colors;
        const close = outside <= 1;

        if (type === Shore.BEACH) {
            this.pixels[k] = close ? c.wetSand : c.sand;
        } else if (type === Shore.ROCKY || type === Shore.CLIFF) {
            const r = hashUnit(xx, yy, 630);
            this.pixels[k] = r < 0.35 ? c.pebbleLight : r < 0.7 ? c.pebbleDark : mixPacked(this.pixels[k], c.stoneMid, 0.4);
        } else {
            this.pixels[k] = shadePacked(this.pixels[k], close ? -0.22 : -0.1);
        }
    }

    /* ---------- 4. Текстура ---------- */

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
    }

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
    }

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
    }

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
    }

    // Пиксель земли: не рисуем поверх воды и реки.
    putGround(x, y, color) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.width) return;
        const k = y * this.width + x;
        if (this.waterMask[k] || (this.riverMask && this.riverMask[k])) return;
        this.pixels[k] = color;
    }

    /* ---------- Тёмный стиль: цветокоррекция, туман ---------- */

    // Приглушает цвет построек в тёмном стиле.
    moodize(color) {
        return this.mood === 'dark' ? shadePacked(mixPacked(color, packRgb(110, 110, 110), 0.25), -0.12) : color;
    }

    /* Финальная обработка всей картинки: тёмные средние тона, холодные тени, туман над водой и низинами, виньетка.
       Яркими остаются только «источники света» (эфирные разломы, окна, костры) — они рисуются уже после. */
    applyGrading() {
        const W = this.width;
        const pixels = this.pixels;
        const fog = this.buildFog();
        const fogScale = Math.min(255, Math.round((this.pal.fogStrength === undefined ? 1 : this.pal.fogStrength) * 255));
        const [lutR, lutG, lutB] = [0.95, 0.98, 1.04].map(gain =>
            Uint8Array.from({ length: 256 }, (_, v) => Math.min(255, Math.round(255 * Math.pow(v / 255, 1.14) * gain))));
        const [fogR, fogG, fogB] = [150, 162, 170];

        const vignette = this.options.vignette;
        const falloff = length => Float32Array.from({ length }, (_, p) => {
            const edge = Math.min(1, Math.min(p, length - 1 - p) / (length * 0.3));
            return Math.round(256 * (1 - vignette * (1 - smoothstep(edge))));
        });
        const vx = falloff(W), vy = falloff(W);

        for (let y = 0; y < W; y++) {
            const rowShade = vy[y];
            for (let x = 0; x < W; x++) {
                const k = y * W + x;
                const color = pixels[k];
                let r = lutR[color & 255], g = lutG[(color >>> 8) & 255], b = lutB[(color >>> 16) & 255];

                const a = (fog[k] * fogScale) >> 8;
                if (a > 0) {
                    r += ((fogR - r) * a) >> 8;
                    g += ((fogG - g) * a) >> 8;
                    b += ((fogB - b) * a) >> 8;
                }
                const shade = (vx[x] * rowShade) >> 8;
                pixels[k] = 0xFF000000 | (((b * shade) >> 8) << 16) | (((g * shade) >> 8) << 8) | ((r * shade) >> 8);
            }
        }
    }

    // Густота тумана по пикселям (0..255): клочья шума, над водой плотнее. Считается один раз на карту.
    buildFog() {
        const map = this.map;
        const cache = this.fogCache;
        if (cache && cache.source === map.elevation && cache.tileSize === this.tileSize && cache.salt === this.seedSalt) return cache.fog;

        const W = this.width;
        const step = 4;                                   // туман плавный: шум считаем в четверть разрешения и растягиваем
        const lowWidth = Math.ceil(W / step) + 2;
        const low = new Uint8Array(lowWidth * lowWidth);
        const broad = new LatticeNoise(W, Math.max(8, this.px(80)), 901 + this.seedSalt);
        const fine = new LatticeNoise(W, Math.max(4, this.px(34)), 902 + this.seedSalt);
        const curve = Uint8Array.from({ length: 256 }, (_, n) => Math.round(Math.pow(n / 255, 1.3) * 0.3 * 255));

        for (let ly = 0; ly < lowWidth; ly++) {
            const y = Math.min(W - 1, ly * step);
            for (let lx = 0; lx < lowWidth; lx++) {
                const x = Math.min(W - 1, lx * step);
                const noise = 0.65 * broad.at(x, y) + 0.35 * fine.at(x, y);
                const base = noise <= 0.5 ? 0 : Math.min(1, (noise - 0.5) / 0.3);
                low[ly * lowWidth + lx] = Math.min(255, Math.round(curve[Math.round(base * 255)] * (this.waterMask[y * W + x] ? 1.15 : 1)));
            }
        }

        const fog = new Uint8Array(W * W);
        const weight = 256 / step;
        for (let y = 0; y < W; y++) {
            const rowA = ((y / step) | 0) * lowWidth, rowB = rowA + lowWidth, wy = (y % step) * weight;
            for (let x = 0; x < W; x++) {
                const lx = (x / step) | 0, wx = (x % step) * weight;
                const top = low[rowA + lx] * (256 - wx) + low[rowA + lx + 1] * wx;
                const bottom = low[rowB + lx] * (256 - wx) + low[rowB + lx + 1] * wx;
                fog[y * W + x] = (top * (256 - wy) + bottom * wy) >> 16;
            }
        }
        this.fogCache = { source: map.elevation, tileSize: this.tileSize, salt: this.seedSalt, fog };
        return fog;
    }

    // Источник света: яркий цвет и мягкое свечение вокруг. Рисуется после цветокоррекции.
    drawLight(x, y, color, glowColor, glowRadius) {
        for (let dy = -glowRadius; dy <= glowRadius; dy++) {
            for (let dx = -glowRadius; dx <= glowRadius; dx++) {
                const distance = Math.hypot(dx, dy);
                if (distance <= glowRadius) this.blend(x + dx, y + dy, glowColor, 0.2 * (1 - distance / (glowRadius + 1)));
            }
        }
        this.put(x, y, color);
    }

    /* ---------- Мрачные детали (только в тёмном стиле) ---------- */

    // Кости в сухих местах, вороны, развалины, виселицы — редко и поодиночке.
    collectProps(items) {
        const map = this.map;
        const T = this.tileSize;

        this.forEachTile((x, y) => {
            const i = map.index(x, y);
            if (map.terrain[i] !== Terrain.PLAIN || map.river[i] || map.resource[i] !== Resource.NONE || map.roadLevel[i] > 0) return;
            if (map.shore[i] === Shore.BEACH) return;

            const roll = hashUnit(x, y, 950 + this.seedSalt);
            const cx = x * T + Math.round(hashUnit(x, y, 951) * (T - 2)) + 1;
            const base = y * T + Math.round(hashUnit(x, y, 952) * (T - 4)) + 3;
            const dry = [Biome.STEPPE, Biome.DESERT, Biome.TUNDRA, Biome.SAVANNA].includes(map.biome[i]);

            if (dry && roll < 0.014) items.push({ y: base, x: cx, draw: () => this.drawBones(cx, base) });
            else if (!dry && roll < 0.006) items.push({ y: base, x: cx, draw: () => this.drawCrow(cx, base) });
            else if (roll > 0.994 && roll <= 0.9985) items.push({ y: base, x: cx, draw: () => this.drawRuin(cx, base, x, y) });
            else if (roll > 0.9985) items.push({ y: base, x: cx, draw: () => this.drawGibbet(cx, base) });
        });
    }

    drawBones(cx, base) {
        const bone = this.colors.bone;
        this.rect(cx - 2, base - 1, 5, 1, bone);
        this.put(cx - 1, base - 2, bone);
        this.put(cx + 1, base - 2, bone);
        this.rect(cx + 3, base - 2, 2, 2, bone);          // череп
        this.put(cx + 4, base - 2, this.colors.crow);      // глазница
    }

    drawCrow(cx, base) {
        const dark = this.colors.crow;
        this.rect(cx, base - 2, 3, 2, dark);
        this.put(cx - 1, base - 2, dark);
        this.put(cx + 1, base - 3, dark);
        this.put(cx - 2, base - 2, this.colors.stoneMid);  // клюв
    }

    // Обломки каменной стены и колонна.
    drawRuin(cx, base, tileX, tileY) {
        const stone = this.moodize(this.colors.chapelStone);
        const dark = shadePacked(stone, -0.25);
        const width = this.px(8);
        for (let dx = 0; dx < width; dx++) {
            const height = 1 + Math.floor(hashUnit(tileX * 7 + dx, tileY, 953) * this.px(4));   // рваный верх стены
            this.rect(cx - (width >> 1) + dx, base - height, 1, height, dx % 3 === 0 ? dark : stone);
        }
        this.rect(cx + (width >> 1), base - this.px(6), 2, this.px(6), stone);                   // колонна
        this.rect(cx + (width >> 1), base - this.px(6), 1, this.px(6), shadePacked(stone, 0.15));
        this.drawShadow(cx, base, width);
    }

    drawGibbet(cx, base) {
        const wood = this.packed.trunk;
        const height = this.px(10);
        this.drawShadow(cx, base, this.px(4));
        this.rect(cx, base - height, 1, height, wood);
        this.rect(cx, base - height, this.px(5), 1, wood);
        this.put(cx + this.px(4), base - height + 1, this.colors.stoneMid);                       // верёвка
        this.rect(cx + this.px(4) - 1, base - height + 2, 2, this.px(3), this.colors.crow);       // силуэт
    }

    /* ---------- Дороги между поселениями ---------- */

    roadWidth(level) {
        return Math.max(1, this.px([2, 3, 4][Math.min(3, Math.max(1, level)) - 1]));
    }

    /* Дороги строит генератор (map.roadLinks: из каждой клетки — в какие из 8 сторон идёт дорога, map.roadLevel — насколько
       она наезжена). Здесь каждый отрезок между центрами соседних клеток рисуется слегка извилистой полосой:
       центр клетки смещён случайно, середина отрезка тоже. Сначала мягкая полоса утоптанной земли, потом сама дорога. */
    paintRoads() {
        const map = this.map;
        if (!this.options.roads || !map.roadLinks) return;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const c = this.colors;
        const dirt = this.moodize(c.dirt), light = this.moodize(c.dirtLight), mud = this.moodize(c.mud);
        const relief = this.reliefHeight;
        const wobble = this.px(2);

        const centerOf = (x, y) => [
            x * T + T / 2 + (hashUnit(x, y, 980) - 0.5) * wobble,
            y * T + T / 2 + (hashUnit(x, y, 981) - 0.5) * wobble
        ];
        const stamp = (cx, cy, width, tile, halo) => {
            for (let oy = 0; oy < width; oy++) {
                for (let ox = 0; ox < width; ox++) {
                    const x = cx + ox - (width >> 1), y = cy + oy - (width >> 1);
                    if (x < 0 || y < 0 || x >= W || y >= W) continue;
                    const k = y * W + x;
                    if (this.waterMask[k] || (this.riverMask && this.riverMask[k]) || (relief && relief[k] > 40)) continue;

                    if (halo) {
                        this.pixels[k] = mixPacked(this.pixels[k], dirt, 0.28);
                        continue;
                    }
                    const r = hashUnit(x, y, 975);
                    let color = r < 0.2 ? light : r < 0.45 ? mud : dirt;
                    const snow = this.snowCoverage(tile);
                    if (snow > 0) color = mixPacked(color, this.packed.snow, 0.75 * snow);
                    this.pixels[k] = color;
                }
            }
        };

        for (let i = 0; i < size * size; i++) {
            const links = map.roadLinks[i];
            if (!links) continue;
            const x = i % size, y = Math.floor(i / size);
            const [ax, ay] = centerOf(x, y);
            let count = 0;

            for (let d = 0; d < 8; d++) {
                if (!(links & (1 << d))) continue;
                count++;
                const [dx, dy] = ROAD_DIRECTIONS[d];
                const j = (y + dy) * size + x + dx;
                if (j < i) continue;                                          // каждый отрезок рисуем один раз

                const [bx, by] = centerOf(x + dx, y + dy);
                const bend = (hashUnit(i, j, 982) - 0.5) * wobble * 1.6;       // середина отрезка уходит в сторону
                const length = Math.hypot(bx - ax, by - ay) || 1;
                const mx = (ax + bx) / 2 - ((by - ay) / length) * bend;
                const my = (ay + by) / 2 + ((bx - ax) / length) * bend;
                const width = this.roadWidth(Math.min(map.roadLevel[i], map.roadLevel[j]));
                const points = [
                    ...this.linePoints(Math.round(ax), Math.round(ay), Math.round(mx), Math.round(my)),
                    ...this.linePoints(Math.round(mx), Math.round(my), Math.round(bx), Math.round(by))
                ];
                for (const [px, py] of points) stamp(px, py, width + 2, i, true);
                for (const [px, py] of points) stamp(px, py, width, i, false);
            }
            if (count !== 2) stamp(Math.round(ax), Math.round(ay), this.roadWidth(map.roadLevel[i]) + 1, i, false);   // перекрёсток или конец дороги
        }
    }

    /* ---------- Поселения ---------- */

    /* Поселение — ресурс клетки; рисуется домиком, и чем больше в клетке населения (уровень 1–6), тем он больше:
         1–2: небольшой дом (с сарайчиком); 3: дом повыше; 4–5: ещё и второй дом; 6: и каменная башня.
       Здания имеют тёмный контур и тень, светлые стены и тёмные крыши, чтобы не сливаться с фоном; окна светятся. */
    collectSettlement(items, x, y, i) {
        const map = this.map;
        const T = this.tileSize;
        const level = map.settlementLevel[i] || 1;
        const snow = this.snowCoverage(i);
        const n = value => Math.max(1, this.px(value));
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 990) - 0.5) * this.px(2));
        const base = y * T + Math.round(T * 0.8);

        const mainWidth = n(5 + level);
        const parts = [{
            dx: 0, dy: 0, kind: 'house', w: mainWidth,
            bodyH: n(3 + (level >= 4 ? 1 : 0) + (level >= 6 ? 1 : 0)),
            roofH: n(3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0))
        }];
        if (level >= 2) parts.push({ dx: -Math.round(mainWidth / 2 + n(3)), dy: 1, kind: 'hut', w: n(4), bodyH: n(2), roofH: n(2) });
        if (level >= 4) parts.push({ dx: Math.round(mainWidth / 2 + n(4)), dy: -1, kind: 'house', w: n(6), bodyH: n(3), roofH: n(3) });
        if (level >= 6) parts.push({ dx: -Math.round(mainWidth / 2 + n(8)), dy: -2, kind: 'tower', w: n(4), bodyH: n(7), roofH: n(4) });

        parts.forEach((part, k) => {
            const partX = cx + part.dx;
            const partBase = base + part.dy;
            const sprite = this.houseSprite(part, hashUnit(x, y, 991 + k), snow);
            items.push({ y: partBase, x: partX, draw: () => this.drawHouse(sprite, partX, partBase, part, level) });
        });
    }

    // Лёгкое приглушение цвета построек в тёмном стиле: они должны оставаться светлее фона.
    houseColor(color) {
        return this.mood === 'dark' ? shadePacked(mixPacked(color, packRgb(128, 128, 128), 0.1), -0.06) : color;
    }

    // Рисунок здания (кэшируется): стены, крыша, дверь, контур.
    houseSprite(part, roll, snow) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = [part.kind, part.w, part.bodyH, part.roofH, Math.floor(roll * 4), Math.round(snow * 3), this.mood, this.season.name].join('|');
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const c = this.colors;
        const tower = part.kind === 'tower';
        const wall = this.houseColor(tower ? c.chapelStone : [c.wallA, c.wallB][Math.floor(roll * 2) % 2]);
        let roof = this.houseColor(part.kind === 'hut' ? c.thatch : tower ? c.roofD : [c.roofA, c.roofB, c.roofC, c.roofD][Math.floor(roll * 4) % 4]);
        if (snow > 0) roof = mixPacked(roof, this.packed.snow, 0.85 * snow);

        const pad = 1;
        const overhang = tower ? 0 : 1;
        const width = part.w + 2 * overhang + 2 * pad;
        const height = part.roofH + part.bodyH + 2 * pad;
        const buffer = new PixelBuffer(width, height);
        const left = pad + overhang;
        const top = pad + part.roofH;
        const centerX = (width - 1) / 2;

        buffer.rect(left, top, part.w, part.bodyH, wall);
        buffer.rect(left, top, 1, part.bodyH, shadePacked(wall, 0.14));                     // освещённая левая стена
        buffer.rect(left + part.w - 1, top, 1, part.bodyH, shadePacked(wall, -0.22));       // правая — в тени
        buffer.rect(left, top + part.bodyH - 1, part.w, 1, shadePacked(wall, -0.18));
        if (tower) {
            for (let y = top + 1; y < top + part.bodyH - 1; y += 2) buffer.rect(left + 1, y, part.w - 2, 1, shadePacked(wall, -0.1));   // кладка
        }

        for (let row = 0; row < part.roofH; row++) {                                        // крыша: ряды всё шире книзу
            const half = ((part.w + 2 * overhang) / 2) * (row + 1) / part.roofH;
            const y = pad + row;
            for (let x = Math.round(centerX - half + 0.5); x <= Math.round(centerX + half - 0.5); x++) {
                buffer.put(x, y, x < centerX ? shadePacked(roof, 0.14) : shadePacked(roof, -0.2));
            }
        }
        buffer.rect(left + (part.w >> 1), top + part.bodyH - Math.min(2, part.bodyH - 1), 1, Math.min(2, part.bodyH - 1), c.plank);   // дверь
        //buffer.outline(c.outline);

        const sprite = {
            buffer, width, height,
            anchorX: Math.round(centerX),
            anchorY: height - pad - 1,
            windows: part.bodyH >= 3 ? [[left + (tower ? 1 : 1), top + 1]] : [],
            chimney: !tower && part.kind === 'house' && roll > 0.4 ? [Math.round(centerX) + 1, pad - 1] : null
        };
        this.spriteCache.set(key, sprite);
        return sprite;
    }

    drawHouse(sprite, x, base, part, level) {
        const c = this.colors;
        const left = x - sprite.anchorX;
        const top = base - sprite.anchorY;

        this.drawBuildingShadow(x, base, part.w, part.bodyH + part.roofH);
        this.blitSprite(sprite.buffer, left, top);

        for (const [wx, wy] of sprite.windows) {
            const lightX = left + wx, lightY = top + wy;
            this.emissive.push(() => this.drawLight(lightX, lightY, c.window, c.fire, this.mood === 'dark' ? 2 : 1));
        }
        if (sprite.chimney && level >= 3) {
            const smokeX = left + sprite.chimney[0], smokeY = top + sprite.chimney[1];
            for (let s = 1; s <= 3; s++) this.blend(smokeX + (s % 2), smokeY - s * 2, packRgb(175, 175, 180), 0.45 - 0.1 * s);
        }
    }

    // Тень здания: пятно под ним и тень, падающая вправо-вниз (свет слева сверху, как у деревьев и гор).
    drawBuildingShadow(x, base, width, height) {
        const half = Math.ceil(width / 2) + 1;
        const length = Math.max(2, Math.round(height * 0.55));
        for (let dx = -half; dx <= half + length; dx++) {
            const edge = dx > half ? 1 - (dx - half) / (length + 1) : 1;
            this.blend(x + dx, base + 1, BLACK, 0.5 * edge);
            this.blend(x + dx, base + 2, BLACK, 0.3 * edge);
            if (dx > -half + 1 && dx < half + length - 1) this.blend(x + dx, base, BLACK, 0.2 * edge);
        }
    }

    // Рисунок из буфера на карту: прозрачные пиксели пропускаем.
    blitSprite(buffer, left, top) {
        for (let y = 0; y < buffer.height; y++) {
            for (let x = 0; x < buffer.width; x++) {
                const color = buffer.data[y * buffer.width + x];
                if (color !== 0) this.put(left + x, top + y, color);
            }
        }
    }

    /* ---------- Руды ---------- */

    // Каменный выступ с вкраплениями руды. kind: 'gold' (золото — яркое, с блёстками) или 'iron' (железо — тёмное, ржавое).
    oreSprite(kind, variant) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = 'ore|' + kind + '|' + variant;
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const n = value => Math.max(1, this.px(value));
        const gold = kind === 'gold';
        const stone = gold ? [packRgb(150, 146, 150), packRgb(114, 110, 116), packRgb(78, 74, 82)] : [packRgb(120, 132, 146), packRgb(86, 96, 108), packRgb(54, 62, 74)];
        const oreLight = gold ? packRgb(255, 243, 168) : packRgb(207, 218, 228);
        const ore = gold ? packRgb(247, 212, 74) : packRgb(176, 92, 54);
        const oreDark = gold ? packRgb(168, 122, 20) : packRgb(98, 48, 30);

        const width = n(14), height = n(11);
        const buffer = new PixelBuffer(width, height);
        const mid = width >> 1, floor = height - 2;

        // два-три камня разного размера
        const rocks = [[mid - n(3), floor - n(2), n(4), n(3)], [mid + n(2), floor - n(2) - (variant % 2), n(4), n(4)], [mid - 1, floor - n(4), n(3), n(3)]];
        for (const [cx, cy, rx, ry] of rocks) buffer.ellipse(cx, cy, rx, ry, stone[1], stone[0], stone[2]);

        // вкрапления руды: самородки на камнях (золото — крупные и яркие, железо — ржавые жилы с блеском стали)
        const spots = gold
            ? [[mid - n(3), floor - n(3)], [mid + n(3), floor - n(3)], [mid, floor - n(5)], [mid + 1, floor - 1]]
            : [[mid - n(3), floor - n(2)], [mid + n(2), floor - n(3)], [mid, floor - n(4)], [mid - 1, floor - 1], [mid + n(4), floor - 1]];
        spots.forEach(([sx, sy], k) => {
            const size = gold ? (k === 2 ? n(3) : n(2)) : n(2);
            buffer.rect(sx, sy, size, size, ore);
            buffer.rect(sx + 1, sy + size, size, 1, oreDark);
            buffer.rect(sx + size, sy + 1, 1, size, oreDark);
            buffer.put(sx, sy, oreLight);
            if (!gold && k % 2 === 0) buffer.put(sx + size - 1, sy, oreLight);
        });
        //buffer.outline(this.colors.outline);

        const sprite = { buffer, width, height, anchorX: mid, anchorY: floor + 1, sparkles: gold ? [[mid - n(3), floor - n(4)], [mid + n(3), floor - n(4)], [mid, floor - n(6)]] : [] };
        this.spriteCache.set(key, sprite);
        return sprite;
    }

    drawOreTile(x, y, kind) {
        const T = this.tileSize;
        const sprite = this.oreSprite(kind, tileHash(x, y, 80) % 3);
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 80) - 0.5) * 0.2 * T);
        const base = y * T + Math.round(T * 0.8) + Math.round((hashUnit(x, y, 81) - 0.5) * 0.2 * T) - this.liftAtTile(x, y);

        this.drawBuildingShadow(cx, base, this.px(7), this.px(5));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);

        // блёстки золота — в тёмном стиле светятся (рисуются после цветокоррекции)
        for (const [sx, sy] of sprite.sparkles) {
            const px = cx - sprite.anchorX + sx, py = base - sprite.anchorY + sy;
            this.emissive.push(() => {
                this.put(px, py, packRgb(255, 255, 230));
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.blend(px + dx, py + dy, packRgb(255, 240, 160), 0.7);
            });
        }
    }

    /* ---------- Эфир: гигантские фиолетовые кристаллы и грибы ---------- */

    etherSprite(variant) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = 'ether|' + variant;
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const n = value => Math.max(1, this.px(value));
        const light = packRgb(214, 170, 255), mid = packRgb(160, 90, 240), dark = packRgb(91, 42, 158), tip = packRgb(248, 232, 255);
        const width = n(16), height = n(16);
        const buffer = new PixelBuffer(width, height);
        const floor = height - 2;
        const middle = width >> 1;

        if (variant === 2) {
            // гигантские грибы: светлая ножка, купол с тёмной «изнанкой» и светящимися пятнами
            const mushroom = (cx, stem, capW, capH) => {
                buffer.rect(cx - 1, floor - stem, 2, stem, packRgb(222, 206, 244));
                buffer.rect(cx, floor - stem, 1, stem, packRgb(176, 156, 214));
                const capY = floor - stem - capH + 1;
                buffer.ellipse(cx, capY + capH - 1, capW, capH, mid, light, dark);
                buffer.rect(cx - capW + 1, capY + capH - 1, capW * 2 - 1, 1, dark);   // изнанка шляпки
                buffer.put(cx - 1, capY + 1, tip);
                buffer.put(cx + 2, capY + 2, tip);
                buffer.put(cx - capW + 2, capY + capH - 2, tip);
            };
            mushroom(middle - n(3), n(5), n(4), n(3));
            mushroom(middle + n(3), n(7), n(5), n(4));
            mushroom(middle, n(3), n(3), n(2));
        } else {
            // кристаллы: три остроконечные призмы разной высоты (левая грань светлая, правая тёмная)
            const crystal = (cx, crystalWidth, crystalHeight) => {
                for (let row = 0; row < crystalHeight; row++) {
                    const half = Math.max(0, Math.round((crystalWidth / 2) * Math.min(1, (row + 1) / (crystalHeight * 0.7))));
                    const y = floor - crystalHeight + 1 + row;
                    buffer.rect(cx - half, y, half + 1, 1, light);
                    buffer.rect(cx + 1, y, half, 1, dark);
                    buffer.put(cx, y, mid);
                }
                buffer.put(cx, floor - crystalHeight + 1, tip);
            };
            crystal(middle - n(3), n(3), n(8));
            crystal(middle + n(2), n(4), n(12));
            crystal(middle + n(5), n(2), n(6));
            buffer.ellipse(middle, floor, n(6), 1, dark, mid, dark);
        }
        //buffer.outline(packRgb(34, 14, 66));

        const sprite = { buffer, width, height, anchorX: middle, anchorY: floor + 1 };
        this.spriteCache.set(key, sprite);
        return sprite;
    }

    drawEther(x, y) {
        const T = this.tileSize;
        const c = this.colors;
        const variant = tileHash(x, y, 90) % 3 === 2 ? 2 : tileHash(x, y, 90) % 2;
        const sprite = this.etherSprite(variant);
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 91) - 0.5) * 0.2 * T);
        const base = y * T + Math.round(T * 0.82) - this.liftAtTile(x, y);

        // сначала свечение (синхронно с землёй), потом сам рисунок
        this.drawLight(cx, base - this.px(5), c.riftCore, c.riftGlow, this.px(6));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);
        this.drawLight(cx, base - this.px(8), c.riftCore, c.riftGlow, this.px(3));
    }

    /* ---------- 5. Границы регионов ---------- */

    // Тонкая линия на правом/нижнем краю клетки, если за ней другой регион.
    // Над рекой границы не рисуем (иначе посреди воды появлялись бы чёрточки), а над горами делаем бледнее.
    paintRegionBorders() {
        const { size, regionId } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const mask = this.riverMask;
        const relief = this.reliefHeight;
        const color = this.colors.regionBorder;

        const draw = (px, py) => {
            const k = py * W + px;
            if (mask && mask[k]) return;
            const alpha = relief ? 0.6 - 0.5 * Math.min(1, relief[k] / 110) : 0.6; // в горах границы почти растворяются
            this.pixels[k] = mixPacked(this.pixels[k], color, alpha);
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = y * size + x;
                if (regionId[i] === -1) continue;

                const right = x < size - 1 ? regionId[i + 1] : -1;
                const below = y < size - 1 ? regionId[i + size] : -1;
                if (right !== -1 && right !== regionId[i]) {
                    for (let d = 0; d < T; d++) draw(x * T + T - 1, y * T + d);
                }
                if (below !== -1 && below !== regionId[i]) {
                    for (let d = 0; d < T; d++) draw(x * T + d, y * T + T - 1);
                }
            }
        }
    }

    /* ---------- 6. Декорации ---------- */

    /* Все декорации собираем в один список и рисуем по возрастанию «основания» (нижней точки):
       то, что стоит ниже на карте, перекрывает то, что выше, — как в перспективе. Деревья могут свободно
       выходить за границы своей клетки: порядок всё равно будет правильным. */
    // Рисует горы и декорации вместе, строка за строкой сверху вниз: так то, что южнее (ближе к зрителю),
    // перекрывает то, что севернее, — деревья и горы перекрывают друг друга правильно.
    paintScene() {
        const items = this.collectDecorations();
        const relief = this.prepareReliefRows();
        let next = 0;
        for (let gy = 0; gy < this.width; gy++) {
            if (relief) this.paintReliefRow(relief, gy);
            while (next < items.length && items[next].y <= gy) items[next++].draw();
        }
    }

    // Список декораций, отсортированный по «основанию» (нижней точке).
    collectDecorations() {
        const map = this.map;
        const T = this.tileSize;
        const items = [];

        this.forEachTile((x, y) => {
            const i = map.index(x, y);
            if (map.crossing[i]) this.paintCrossing(x, y, i);

            switch (map.resource[i]) {
                case Resource.WOOD: this.collectTrees(items, x, y, i); break;
                case Resource.WHEAT: items.push({ y: y * T + Math.round(T * 0.6), x: x * T, draw: () => this.drawWheat(x, y) }); break;
                case Resource.GOLD: items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, 'gold') }); break;
                case Resource.IRON: items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, 'iron') }); break;
                case Resource.ETHER:
                    if (this.mood === 'dark') this.emissive.push(() => this.drawEther(x, y));   // самый яркий элемент мира: после цветокоррекции
                    else items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawEther(x, y) });
                    break;
                case Resource.SETTLEMENT: this.collectSettlement(items, x, y, i); break;
            }
        });

        if (this.mood === 'dark' && this.options.props) this.collectProps(items);

        items.sort((a, b) => a.y - b.y || a.x - b.x);
        return items;
    }

    // Два-три дерева на клетку, в случайных местах. Вид зависит от климата: в холодных краях ели, в тёплых лиственные.
    collectTrees(items, x, y, i) {
        const map = this.map;
        const T = this.tileSize;
        const conifer = map.biome[i] === Biome.TAIGA || map.biome[i] === Biome.TUNDRA || map.temperature[i] < 0.45;
        const withSnow = conifer && this.pal.snowOnConifers && this.seasonalTemperature(i) < SNOW_TEMPERATURE;

        const slots = [[0.26, 0.52], [0.74, 0.46], [0.5, 0.96]];
        const start = tileHash(x, y, 30) % slots.length;
        const count = 2 + (tileHash(x, y, 31) % 3 === 0 ? 1 : 0);

        for (let k = 0; k < count; k++) {
            const [fx, fy] = slots[(start + k) % slots.length];
            const cx = Math.round(x * T + fx * T + (hashUnit(x, y, 40 + k) - 0.5) * 0.25 * T);
            const base = Math.round(y * T + fy * T + (hashUnit(x, y, 50 + k) - 0.5) * 0.25 * T);
            const pick = tileHash(x, y, 60 + k);

            items.push({
                y: base,
                x: cx,
                draw: () => (conifer ? this.drawConifer(cx, base, pick, withSnow) : this.drawBroadleaf(cx, base, pick))
            });
        }
    }

    // Овальная тень под деревом.
    drawShadow(cx, base, width) {
        const half = Math.floor(width / 2);
        for (let dx = -half; dx <= half; dx++) this.blend(cx + dx, base, BLACK, 0.22);
        for (let dx = -half + 1; dx <= half - 1; dx++) this.blend(cx + dx, base + 1, BLACK, 0.12);
    }

    // Лиственное дерево: округлая крона со светом сверху-слева, летом зелёное, весной в цвету, осенью рыже-золотое.
    drawBroadleaf(cx, base, pick) {
        const pal = this.pal;
        if (pal.bareTrees || hashUnit(cx, base, 79) < (pal.deadTreeChance || 0)) {   // зимой все голые; в тёмном стиле часть мертва и летом
            this.drawBareTree(cx, base, pick);
            return;
        }

        const width = this.px(7) + (pick % 2);
        const height = width;
        const trunkHeight = this.px(2) + 1;
        const trunkWidth = width >= 7 ? 2 : 1;
        const color = hexToPacked(pal.broadleaf[pick % pal.broadleaf.length]);
        const light = shadePacked(color, 0.22);
        const dark = shadePacked(color, -0.28);
        const top = base - trunkHeight - height + 2;

        this.drawShadow(cx, base, width);
        this.rect(cx - (trunkWidth >> 1), base - trunkHeight, trunkWidth, trunkHeight, this.packed.trunk);

        for (let row = 0; row < height; row++) {
            const t = ((row + 0.5) / height) * 2 - 1;
            const half = (width / 2) * Math.sqrt(1 - t * t);
            const x0 = Math.round(cx - half);
            const x1 = Math.round(cx + half) - 1;
            for (let x = x0; x <= x1; x++) {
                const lean = (x - cx) + (row - height / 2);  // < 0 — верх-лево (освещено), > 0 — низ-право (тень)
                let shade = lean < -width * 0.2 ? light : lean > width * 0.28 ? dark : color;
                if (hashUnit(x, top + row, 77) < 0.12) shade = shade === dark ? color : dark; // листва «шуршит»
                this.put(x, top + row, shade);
            }
        }

        if (pal.blossom && pick % 3 === 0) {
            const blossom = hexToPacked(pal.blossom);
            this.put(cx - 2, top + 2, blossom);
            this.put(cx + 1, top + 3, blossom);
            this.put(cx - 1, top + 5, blossom);
        }
    }

    // Голое дерево (зима): ствол и несколько веток.
    drawBareTree(cx, base, pick) {
        const trunk = this.packed.trunk;
        const height = this.px(8);
        this.drawShadow(cx, base, this.px(5));
        this.rect(cx, base - height, 1, height, trunk);

        const side = pick % 2 ? 1 : -1;
        for (let k = 1; k <= this.px(3); k++) {
            this.put(cx - k, base - height + k + 1, trunk);
            this.put(cx + k, base - height + k + 1 + (side > 0 ? 1 : 0), trunk);
        }
        this.put(cx + side, base - height - 1, trunk);
        if (this.mood === 'dark') {                                // кривые, корявые ветки
            this.put(cx + side * 2, base - height + 2, trunk);
            this.put(cx - side * 2, base - height + 4, trunk);
            this.put(cx + side, base - height + 5, trunk);
        }
    }

    // Ель: ярусы всё шире книзу; круглый год зелёная, зимой со снегом на лапах.
    drawConifer(cx, base, pick, withSnow) {
        const pal = this.pal;
        const color = hexToPacked(pal.conifer[pick % pal.conifer.length]);
        const light = shadePacked(color, 0.2);
        const dark = shadePacked(color, -0.3);
        const height = this.px(10) + (pick % 2);
        const maxHalf = Math.max(2, Math.round(this.px(6) / 2));
        const trunkHeight = this.px(2);
        const top = base - trunkHeight - height + 1;

        this.drawShadow(cx, base, this.px(6));
        this.rect(cx, base - trunkHeight, 1, trunkHeight, this.packed.trunk);

        for (let row = 0; row < height; row++) {
            const tierRow = row % 3;
            const half = Math.min(maxHalf, Math.floor(row * 0.34 + tierRow * 0.3 + 0.4));
            for (let dx = -half; dx <= half; dx++) {
                let shade = dx < 0 ? light : dx > 0 ? dark : color;
                if (withSnow && tierRow === 0) shade = dx > 0 ? this.packed.snowShade : this.packed.snow; // снежная кромка яруса
                this.put(cx + dx, top + row, shade);
            }
        }
    }

    // Поле: весной ростки, летом растёт, осенью спелые колосья, зимой стерня.
    drawWheat(x, y) {
        const pal = this.pal;
        const T = this.tileSize;
        const stalk = hexToPacked(pal.wheatStalk);
        const head = hexToPacked(pal.wheatTop);

        for (let k = 0; k < 8; k++) {
            const h = tileHash(x, y, 300 + k);
            const sx = x * T + (h % T);
            const sy = y * T + this.px(4) + ((h >>> 8) % (T - this.px(4)));  // основание стебля
            const variation = (h >>> 16) % 2;

            if (pal.wheatStage === 'bare') {
                this.rect(sx, sy - 2, 1, 2, stalk);
                continue;
            }
            const stalkHeight = (pal.wheatStage === 'sprout' ? this.px(2) : pal.wheatStage === 'growing' ? this.px(4) : this.px(5)) + variation;
            this.rect(sx, sy - stalkHeight, 1, stalkHeight, stalk);
            this.put(sx, sy - stalkHeight, head);
            if (pal.wheatStage === 'ripe') this.put(sx, sy - stalkHeight - 1, head);
        }
    }

    // На сколько пикселей поднята поверхность гор в центре клетки (руда и разломы лежат на ней, а не под ней).
    liftAtTile(x, y) {
        if (!this.reliefHeight || this.map.terrain[this.map.index(x, y)] !== Terrain.MOUNTAIN) return 0;
        const T = this.tileSize;
        const k = (y * T + (T >> 1)) * this.width + x * T + (T >> 1);
        return Math.round(this.reliefHeight[k] / 255 * this.px(this.options.mountainLift));
    }

    // Переправа: каменный мост (река глубже 1) или брод из камней (ручей). Рисуется поперёк течения.
    paintCrossing(x, y, i) {
        const map = this.map;
        const T = this.tileSize;
        const c = this.colors;
        const level = map.river[i];
        const horizontalFlow = x > 0 && x < map.size - 1 && map.river[i - 1] > 0 && map.river[i + 1] > 0;

        // Работаем в координатах «вдоль течения» (a) и «поперёк течения» (b), затем переводим в x, y.
        const put = (a, b, w, h, color) => (horizontalFlow
            ? this.rect(x * T + a, y * T + b, w, h, color)
            : this.rect(x * T + b, y * T + a, h, w, color));
        const middle = Math.floor(T / 2);
        const river = this.riverWidth(level);

        if (map.crossing[i] === 2) {
            const length = Math.min(T, river + this.px(4));   // мост выступает за оба берега
            const thickness = this.px(5);
            const a0 = middle - (thickness >> 1);
            const b0 = middle - (length >> 1);
            put(a0, b0, thickness, length, c.bridgeDeck);
            put(a0, b0, 1, length, c.bridgeEdge);
            put(a0 + thickness - 1, b0, 1, length, c.bridgeEdge);
        } else {
            const stones = 3;
            for (let k = 0; k < stones; k++) {
                const b = middle - (river >> 1) + Math.round(k * (river - 2) / (stones - 1)) - 1;
                put(middle - 1, b, 2, 2, c.stone);
                put(middle, b + 1, 1, 1, c.stoneShadow);
            }
        }
    }
}
