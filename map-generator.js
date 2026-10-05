/* ============================================================
Справочники: что может лежать в клетке карты
============================================================ */
const Terrain = Object.freeze({ DEEP_WATER: 0, SHALLOW_WATER: 1, PLAIN: 2, MOUNTAIN: 3 });
const Biome = Object.freeze({ TUNDRA: 0, TAIGA: 1, GRASSLAND: 2, STEPPE: 3, DESERT: 4, SAVANNA: 5 });
const Shore = Object.freeze({ NONE: 0, BEACH: 1, ROCKY: 2, CLIFF: 3 });
const Resource = Object.freeze({ NONE: 0, WOOD: 1, WHEAT: 2, GOLD: 3, ETHER: 4, IRON: 5, SETTLEMENT: 6 });

// Что даёт каждый ресурс (числа условные — настройте под экономику игры). В клетке бывает только один ресурс.
const ResourceInfo = Object.freeze({
    [Resource.WHEAT]: { name: 'пшеница', produces: { food: 1 } },
    [Resource.WOOD]: { name: 'дерево', produces: { production: 1 } },
    [Resource.IRON]: { name: 'железная руда', produces: { production: 2 } },
    [Resource.GOLD]: { name: 'золотая руда', produces: { gold: 2 } },
    [Resource.ETHER]: { name: 'эфир', produces: { ether: 1 } },
    [Resource.SETTLEMENT]: { name: 'поселение', produces: { population: 1, gold: 1 } } // население — из map.population[клетка]
});

// 8 направлений дороги; индекс направления d и 7 - d — противоположные.
const ROAD_DIRECTIONS = Object.freeze([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);

/* ============================================================
    Вспомогательные функции
    ============================================================ */
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// Хорошо перемешанный хеш числа (0..2^32): соседние номера клеток дают несвязанные значения. Простое умножение давало
// «решётчатые» узоры — реки бежали параллельными диагональными полосами.
function hash32(n) {
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return (n ^ (n >>> 16)) >>> 0;
}
const lerp = (a, b, t) => a + (b - a) * t;

// Генератор псевдослучайных чисел (mulberry32): один и тот же seed даёт одну и ту же последовательность.
function createRandom(seed) {
    let state = seed | 0;
    return function random() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Выравнивает значения до равномерных 0..1 по рангу: самое малое станет 0, самое большое 1.
// Тогда порог 0.4 честно означает «нижние 40%», независимо от того, как шум «слипается» вокруг 0.5.
function rankNormalize(values) {
    const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
    const result = new Float32Array(values.length);
    order.forEach((index, rank) => { result[index] = rank / (values.length - 1); });
    return result;
}

// Значение на заданной доле отсортированного списка (0.5 — медиана).
function percentile(values, share) {
    const sorted = Float32Array.from(values).sort();
    return sorted[Math.floor(sorted.length * share)];
}

/* ============================================================
    Плавный шум: даёт значения 0..1, соседние точки похожи друг на друга
    ============================================================ */
class ValueNoise {
    constructor(seed) {
        const random = createRandom(seed);
        this.lattice = [];
        for (let i = 0; i < 65 * 65; i++) this.lattice.push(random());
    }

    latticeValue(ix, iy) {
        return this.lattice[(iy & 63) * 65 + (ix & 63)];
    }

    // Одна «октава»: интерполяция между четырьмя ближайшими узлами решётки.
    sample(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const smooth = t => t * t * (3 - 2 * t);
        const u = smooth(x - ix);
        const v = smooth(y - iy);
        const top = lerp(this.latticeValue(ix, iy), this.latticeValue(ix + 1, iy), u);
        const bottom = lerp(this.latticeValue(ix, iy + 1), this.latticeValue(ix + 1, iy + 1), u);
        return lerp(top, bottom, v);
    }

    // Несколько октав: крупные формы + всё более мелкие детали.
    fractal(x, y, octaves) {
        let sum = 0, amplitude = 1, total = 0, frequency = 1;
        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.sample(x * frequency, y * frequency);
            total += amplitude;
            amplitude /= 2;
            frequency *= 2;
        }
        return sum / total;
    }
}

/* ============================================================
    MapGenerator
    Хранит карту в плоских массивах: клетка (x, y) — это индекс y * size + x.
    ============================================================ */
class MapGenerator {
    static get DEFAULTS() {
        return {
            size: 300,                // сторона карты в клетках
            seed: 1,

            // --- суша и вода ---
            waterShare: 0.58,         // какая доля клеток станет водой
            mountainShare: 0.12,      // какая доля суши станет горами
            shallowWaterDistance: 2,  // вода не дальше N клеток от суши считается мелководьем
            elevationScale: 4,        // масштаб шума высоты (больше — мельче материки)
            elevationOctaves: 5,
            baseElevation: 0.25,      // общий «подъём» рельефа
            islandFalloff: 0.5,       // насколько сильно рельеф падает к краям (мир окружён водой)
            falloffPower: 2.5,        // форма спада к краям (2 — плавно, 4 — «плато» с обрывом у краёв)
            shapeVariety: 0.6,        // 0..1: насколько изрезана форма континента (заливы, полуострова, острова)
            shapeScale: 6,            // размер деталей формы (больше — мельче)
            inlandSeaStrength: 0.35,  // 0 — внутренних морей нет; больше — крупнее и чаще
            inlandSeaScale: 2.5,      // размер внутренних морей (больше — мельче и чаще)
            islandDensity: 0.5,       // 0..1: сколько островков разбросано вокруг материка (0 — только материк)
            islandScale: 14,          // размер островков (больше — мельче)
            ridgeScale: 5,            // масштаб горных хребтов
            ridgeStrength: 0.3,       // насколько хребты поднимают рельеф
            mountainClustering: 0.6,  // 0..1: 0 — тонкие цепи хребтов, 1 — сплошные массивы; посередине — массивы с ущельями
            massifScale: 3,           // размер горных массивов (больше — мельче и чаще)
            ridgeSharpness: 4,        // больше — тоньше и резче хребты
            warpScale: 2.5,           // масштаб «скручивания» координат (делает берега и хребты извилистыми)
            warpStrength: 0.25,       // сила скручивания; 0 — выключить
            minMountainSize: 4,       // горные массивы меньше этого размера (в клетках) превращаются в равнину
            minIslandSize: 12,        // клочки суши меньше этого размера (в клетках) превращаются в воду

            // --- климат ---
            temperatureScale: 4,
            temperatureNoise: 0.35,   // разброс температуры вокруг «север холодно, юг жарко»
            altitudeCooling: 0.6,     // насколько высота охлаждает
            moistureScale: 5,
            aridity: 0.15,            // 0..1: доля сухих клеток, где вместо луга степь/пустыня (меньше — меньше степей)

            // --- ресурсы ---
            forestScale: 7,           // масштаб крупных лесных массивов (больше — мельче)
            forestShare: 0.34,        // доля карты под крупными лесными массивами
            forestClumpShare: 0.14,    // ...и ещё столько же мелких разрозненных рощ
            woodChance: 0.9,          // шанс дерева в клетке внутри леса
            wheatScale: 9,
            wheatShare: 0.5,          // то же для полей
            wheatClumpShare: 0.14,
            wheatChance: 0.85,
            clumpScale: 16,           // размер мелких рощ и полей (больше — мельче)

            // --- редкие ресурсы ---
            foothillDistance: 2,      // руда встречается в горах и на равнине не дальше N клеток от них
            goldScale: 6,
            goldShare: 0.45,          // доля карты, где вообще возможно золото (скопления)
            goldChance: 0.05,         // шанс золота в такой клетке (в предгорьях вдвое меньше)
            ironScale: 5,
            ironShare: 0.5,           // то же для железной руды
            ironChance: 0.16,         // железо встречается заметно чаще золота
            faultScale: 5,            // масштаб «линий разлома», вдоль которых растёт эфир
            etherShare: 0.06,         // доля карты вдоль линий разлома
            etherChance: 0.35,        // шанс эфира на такой клетке

            // --- берега ---
            shoreScale: 12,           // размер участков одного типа берега (больше — мельче)
            beachShare: 0.55,         // доля подходящих (низких, тёплых) берегов, которые станут пляжами
            cliffShare: 0.25,         // доля самых высоких берегов, которые станут утёсами (горы у воды — всегда утёсы)

            // --- поселения ---
            populationPerHabitability: 10,  // население региона = сумма «обитаемости» его клеток × это число × случайный множитель
            populationVariation: 0.9,       // разброс населения между регионами (больше — больше и крупных городов, и пустых земель)
            settlementMinPopulation: 60,    // меньше — поселения нет; от этого числа поселение имеет уровень 1
            settlementMaxLevel: 2,          // самый большой уровень поселения (размер рисунка)
            settlementGrowth: 1.8,          // во сколько раз надо увеличить население, чтобы уровень вырос на 1
            secondSettlementPopulation: 900, // у региона с таким населением и больше будет второе поселение
            settlementSpacing: 1,           // минимум клеток между поселениями

            // --- дороги между поселениями ---
            roads: true,
            roadNeighbors: 3,               // с сколькими ближайшими соседями пробуем соединить каждое поселение
            roadMaxDistance: 28,            // дальше этого (в клетках) дорог не строим
            roadLoopChance: 0.4,            // шанс добавить «петлю» — вторую по близости дорогу, когда связь уже есть

            // --- реки и озёра ---
            rainfall: 1,              // сколько воды даёт клетка (во влажных местах больше); больше — больше и шире реки
            riverThresholds: [60, 180, 480], // сколько воды надо, чтобы появился ручей / река / большая река
            riverMeander: 0.012,      // насколько русла отклоняются от «кратчайшего» пути (больше — извилистее)
            lakeDepth: 0.02,          // впадина глубже этого становится озером
            lakeMinSize: 4,           // озёра меньше этого (в клетках) не создаём
            riverCrossingChance: 0.1,  // доля подходящих прямых участков рек, где ставится мост или брод

            // --- регионы ---
            regionMinSize: 18,
            regionMaxSize: 22,
            regionMergeBelow: 10,     // регионы меньше этого размера вливаются в самого маленького соседа
            regionIrregularity: 0.6,  // 0 — почти круглые регионы, больше — причудливее границы
            regionBarrierCost: 3,     // насколько горы и реки «мешают» росту региона (границы ложатся по ним)
            regionBalancePasses: 12   // сколько раз выравнивать размеры регионов (0 — не выравнивать)
        };
    }

    constructor(options = {}) {
        this.options = { ...MapGenerator.DEFAULTS, ...options };
        this.size = this.options.size;
    }

    /* ---------- Главный метод ---------- */

    generate(seed = this.options.seed) {
        this.seed = seed;
        this.random = createRandom(seed);
        this.createNoiseLayers();
        this.allocateLayers();

        this.generateElevation();
        this.scatterIslands();
        this.generateMoisture();
        this.classifyTerrain();
        this.removeSmallMountains();
        this.removeSmallIslands();
        this.collectLandTiles();
        this.fillDepressions();
        this.computeWaterDepth();
        this.generateTemperature();
        this.assignBiomes();
        this.placeResources();
        this.generateRivers();
        this.classifyShores();
        this.placeRareResources();
        this.placeRiverCrossings();
        this.buildRegions();
        this.placeSettlements();
        this.buildRoads();
        return this;
    }

    createNoiseLayers() {
        this.noise = {
            elevation: new ValueNoise(this.seed + 1),
            ridge: new ValueNoise(this.seed + 2),
            temperature: new ValueNoise(this.seed + 3),
            moisture: new ValueNoise(this.seed + 4),
            warpX: new ValueNoise(this.seed + 5),
            warpY: new ValueNoise(this.seed + 6),
            forest: new ValueNoise(this.seed + 7),
            fertility: new ValueNoise(this.seed + 8),
            shape: new ValueNoise(this.seed + 9),
            basin: new ValueNoise(this.seed + 10),
            regionShape: new ValueNoise(this.seed + 11),
            islands: new ValueNoise(this.seed + 12),
            massif: new ValueNoise(this.seed + 13),
            forestClumps: new ValueNoise(this.seed + 14),
            fertilityClumps: new ValueNoise(this.seed + 15),
            ore: new ValueNoise(this.seed + 16),
            fault: new ValueNoise(this.seed + 17),
            shore: new ValueNoise(this.seed + 18),
            iron: new ValueNoise(this.seed + 19)
        };
    }

    allocateLayers() {
        const count = this.size * this.size;
        this.elevation = new Float32Array(count);
        this.moisture = new Float32Array(count);
        this.ridge = new Float32Array(count);         // 0..1: насколько клетка похожа на горный хребет
        this.temperature = new Float32Array(count);
        this.terrain = new Uint8Array(count);
        this.population = new Uint16Array(count);     // население в клетке с поселением
        this.settlementLevel = new Uint8Array(count); // уровень поселения 1..6 (0 — нет поселения)
        this.settlements = [];                        // { id, regionId, tile, population, level }
        this.regionPopulation = {};                   // id региона -> население
        this.roadLevel = new Uint8Array(count);       // 0 — нет дороги, 1..3 — насколько она наезжена
        this.roadLinks = new Uint8Array(count);       // биты: в какие из 8 сторон (ROAD_DIRECTIONS) идёт дорога из клетки
        this.shore = new Uint8Array(count);           // тип берега (Shore) у суши рядом с водой и реками
        this.crossing = new Uint8Array(count);        // 0 — нет, 1 — брод, 2 — каменный мост
        this.mountainHeight = new Float32Array(count); // 0 вне гор; 0.3..1 в горах — по нему рисуется рельеф
        this.massif = new Float32Array(count);        // 0..1: крупные «пятна» для горных массивов
        this.riverTo = new Int32Array(count).fill(-1); // куда течёт река из этой клетки (-1 — не река или сток за краем карты)
        this.riverFlow = new Uint16Array(count);      // сколько воды проходит через клетку (определяет ширину реки)
        this.waterDepth = new Uint8Array(count);      // 0 на суше; в воде — расстояние до ближайшей суши
        this.biome = new Uint8Array(count);
        this.resource = new Uint8Array(count);
        this.river = new Uint8Array(count);           // 0 — реки нет, 1..3 — её глубина
        this.regionId = new Int16Array(count).fill(-1); // -1 — клетка вне региона (вода)
        this.regionSizes = {};                        // id региона -> число клеток
        this.landTiles = [];                          // индексы всех клеток суши
    }

    /* ---------- Вспомогательные методы для работы с клетками ---------- */

    index(x, y) {
        return y * this.size + x;
    }

    // Четыре соседние клетки (вверх, вниз, влево, вправо) внутри карты.
    neighbors(i) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        const result = [];
        if (x > 0) result.push(i - 1);
        if (x < this.size - 1) result.push(i + 1);
        if (y > 0) result.push(i - this.size);
        if (y < this.size - 1) result.push(i + this.size);
        return result;
    }

    isLand(i) {
        return this.terrain[i] >= Terrain.PLAIN;
    }

    /* ---------- 1. Высота ---------- */

    // Шум + падение к краям (вода вокруг) + хребты.
    generateElevation() {
        const o = this.options;
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const nx = x / this.size;
                const ny = y / this.size;

                // Квадрат расстояния от центра карты: 0 в центре, 1 на середине края.
                const dx = (nx - 0.5) * 2;
                const dy = (ny - 0.5) * 2;
                const distanceSq = dx * dx + dy * dy;

                // «Скручиваем» координаты: берега и хребты становятся извилистыми, а не расплывчатыми пятнами.
                const wx = nx + (this.noise.warpX.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;
                const wy = ny + (this.noise.warpY.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;

                const baseNoise = this.noise.elevation.fractal(wx * o.elevationScale, wy * o.elevationScale, o.elevationOctaves);
                // Спад к краям: чем больше falloffPower, тем ровнее «плато» внутри и тем резче обрыв у краёв.
                const falloff = Math.pow(Math.sqrt(distanceSq), o.falloffPower) * o.islandFalloff;
                let height = baseNoise * 0.9 + o.baseElevation - falloff;

                // Регулятор формы: среднемасштабный шум ломает береговую линию —
                // появляются заливы, полуострова и острова вдали от материка.
                const shapeNoise = this.noise.shape.fractal(wx * o.shapeScale, wy * o.shapeScale, 3);
                height += (shapeNoise - 0.5) * o.shapeVariety * 2.4;

                // Внутренние моря: крупные впадины, вырезанные во внутренних областях.
                const basinNoise = this.noise.basin.fractal(wx * o.inlandSeaScale, wy * o.inlandSeaScale, 2);
                height -= Math.max(0, basinNoise - 0.5) * 4 * o.inlandSeaStrength * clamp(1.3 - distanceSq);

                // Хребты: линии, где шум близок к 0.5, поднимаем вверх. Возле краёв карты хребты слабее.
                const ridgeNoise = this.noise.ridge.fractal(wx * o.ridgeScale, wy * o.ridgeScale, 4);
                const ridge = Math.pow(1 - Math.abs(2 * ridgeNoise - 1), o.ridgeSharpness);
                height += ridge * o.ridgeStrength * clamp(1.2 - distanceSq);

                const i = this.index(x, y);
                this.elevation[i] = height;
                this.ridge[i] = ridge;
                this.massif[i] = this.noise.massif.fractal(wx * o.massifScale, wy * o.massifScale, 3);
            }
        }
    }

    // Острова: в полосе мелководья вокруг материка отдельные «горбы» шума поднимаем над уровнем моря.
    scatterIslands() {
        const o = this.options;
        if (o.islandDensity <= 0) return;

        const estimatedSea = percentile(this.elevation, o.waterShare);
        const threshold = 0.72 - 0.16 * o.islandDensity; // выше плотность — ниже порог — больше островов
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const i = this.index(x, y);
                const belowSea = estimatedSea - this.elevation[i];
                if (belowSea <= 0 || belowSea > 0.15) continue; // только полоса моря недалеко от «почти суши»

                const bump = this.noise.islands.fractal((x / this.size) * o.islandScale, (y / this.size) * o.islandScale, 2);
                if (bump > threshold) this.elevation[i] = estimatedSea + 0.01 + (bump - threshold) * 0.5;
            }
        }
    }

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
    }

    /* ---------- 2. Вода / равнина / гора ---------- */

    // Пороги считаем по долям, а не по абсолютным числам: так соотношение воды и гор не зависит от настроек шума.
    classifyTerrain() {
        const { waterShare, mountainShare } = this.options;

        this.seaLevel = percentile(this.elevation, waterShare);

        // Горы = «хребтовость» (тонкие линии) + «массивность» (крупные пятна) + чуть высоты.
        // Одни хребты дают тонкие змейки; массивы собирают их в кучи, а между грядами остаются ущелья.
        const landIndices = [];
        for (let i = 0; i < this.elevation.length; i++) {
            if (this.elevation[i] > this.seaLevel) landIndices.push(i);
        }
        const rankOnLand = values => rankNormalize(Float32Array.from(landIndices, i => values[i]));
        const ridgeRank = rankOnLand(this.ridge);
        const massifRank = rankOnLand(this.massif);
        const heightRank = rankOnLand(this.elevation);

        const clustering = this.options.mountainClustering;
        const scores = landIndices.map((_, k) =>
            0.85 * ((1 - clustering) * ridgeRank[k] + clustering * massifRank[k]) + 0.15 * heightRank[k]);
        this.mountainLevel = percentile(scores, 1 - mountainShare);

        let maxScore = this.mountainLevel;
        for (const score of scores) maxScore = Math.max(maxScore, score);

        this.terrain.fill(Terrain.DEEP_WATER);
        landIndices.forEach((i, k) => {
            const isMountain = scores[k] > this.mountainLevel;
            this.terrain[i] = isMountain ? Terrain.MOUNTAIN : Terrain.PLAIN;
            // Высота горы растёт к «хребтовым» и «массивным» клеткам: по ней рисуется рельеф (хребты выше, края ниже).
            if (isMountain) this.mountainHeight[i] = 0.3 + 0.7 * (scores[k] - this.mountainLevel) / (maxScore - this.mountainLevel);
        });
    }

    // Одиночная «гора» на равнине выглядит нелепо: горы должны занимать не меньше minMountainSize клеток.
    removeSmallMountains() {
        const visited = new Uint8Array(this.terrain.length);
        for (let start = 0; start < this.terrain.length; start++) {
            if (visited[start] || this.terrain[start] !== Terrain.MOUNTAIN) continue;

            const queue = [start];
            visited[start] = 1;
            for (let head = 0; head < queue.length; head++) {
                for (const neighbor of this.neighbors(queue[head])) {
                    if (visited[neighbor] || this.terrain[neighbor] !== Terrain.MOUNTAIN) continue;
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
            if (queue.length >= this.options.minMountainSize) continue;
            for (const i of queue) {
                this.terrain[i] = Terrain.PLAIN;
                this.mountainHeight[i] = 0;
            }
        }
    }

    // Шум порождает одиночные клетки и крошечные островки, особенно посреди озёр. Убираем всё, что меньше minIslandSize.
    removeSmallIslands() {
        const visited = new Uint8Array(this.terrain.length);
        for (let start = 0; start < this.terrain.length; start++) {
            if (visited[start] || !this.isLand(start)) continue;

            const island = this.collectLandComponent(start, visited);
            if (island.length >= this.options.minIslandSize) continue;
            for (const i of island) {
                this.terrain[i] = Terrain.DEEP_WATER;
                this.elevation[i] = Math.min(this.elevation[i], this.seaLevel);
                this.mountainHeight[i] = 0;
            }
        }
    }

    // Все клетки суши, связанные с start (соседи по сторонам).
    collectLandComponent(start, visited) {
        const queue = [start];
        visited[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (visited[neighbor] || !this.isLand(neighbor)) continue;
                visited[neighbor] = 1;
                queue.push(neighbor);
            }
        }
        return queue;
    }

    collectLandTiles() {
        this.landTiles = [];
        for (let i = 0; i < this.terrain.length; i++) {
            if (this.isLand(i)) this.landTiles.push(i);
        }
    }

    // Глубина воды = расстояние до ближайшей суши (в клетках). Работает и для океана, и для озёр:
    // у берега мелко, к середине водоёма всё глубже.
    computeWaterDepth() {
        const queue = this.landTiles.slice();
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            for (const neighbor of this.neighbors8(current)) {
                if (this.isLand(neighbor) || this.waterDepth[neighbor] !== 0) continue;
                this.waterDepth[neighbor] = Math.min(255, this.waterDepth[current] + 1);
                queue.push(neighbor);
            }
        }

        // Мелководье — узкая полоса у берега; всё остальное — глубокая вода.
        for (let i = 0; i < this.terrain.length; i++) {
            if (this.isLand(i)) continue;
            const depth = this.waterDepth[i];
            this.terrain[i] = depth > 0 && depth <= this.options.shallowWaterDistance
                ? Terrain.SHALLOW_WATER : Terrain.DEEP_WATER;
        }
    }

    // Восемь соседей, включая диагональных.
    neighbors8(i) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        const result = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) result.push(ny * this.size + nx);
            }
        }
        return result;
    }

    /* ---------- 3. Температура ---------- */

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
    }

    /* ---------- 4. Биомы равнин ---------- */

    assignBiomes() {
        for (const i of this.landTiles) {
            if (this.terrain[i] === Terrain.PLAIN) {
                this.biome[i] = this.pickBiome(this.temperature[i], this.moisture[i]);
            }
        }
    }

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
    }

    /* ---------- 5. Ресурсы ---------- */

    placeResources() {
        const o = this.options;
        const forest = this.createPatchLayer(this.noise.forest, o.forestScale, o.forestShare, this.noise.forestClumps, o.clumpScale, o.forestClumpShare);
        const fields = this.createPatchLayer(this.noise.fertility, o.wheatScale, o.wheatShare, this.noise.fertilityClumps, o.clumpScale, o.wheatClumpShare);

        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN) continue;

            const t = this.temperature[i];
            const m = this.moisture[i];
            const roll = this.random();

            const goodForWood = forest[i] && m > 0.3 && t > 0.12 && t < 0.8;
            const goodForWheat = fields[i] && m > 0.1 && m < 0.9 && t > 0.18 && t < 0.85;

            if (goodForWood && roll < o.woodChance) this.resource[i] = Resource.WOOD;
            else if (goodForWheat && roll < o.wheatChance) this.resource[i] = Resource.WHEAT;
        }
    }

    // «Пятна» ресурса: крупные скопления плюс мелкие разрозненные кучки. Вместе дают хаотичное, но не пустое распределение.
    createPatchLayer(bigNoise, bigScale, bigShare, smallNoise, smallScale, smallShare) {
        const big = this.createDensityLayer(bigNoise, bigScale);
        const small = this.createDensityLayer(smallNoise, smallScale);
        const patches = new Uint8Array(big.length);
        for (let i = 0; i < patches.length; i++) {
            patches[i] = big[i] > 1 - bigShare || small[i] > 1 - smallShare ? 1 : 0;
        }
        return patches;
    }

    // Слой «плотности»: плавный шум, выровненный до равномерных значений 0..1.
    createDensityLayer(noise, scale) {
        const layer = new Float32Array(this.size * this.size);
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                layer[this.index(x, y)] = noise.fractal((x / this.size) * scale, (y / this.size) * scale, 3);
            }
        }
        return rankNormalize(layer);
    }

    /* ---------- 5б. Редкие ресурсы ---------- */

    placeRareResources() {
        this.placeGold();
        this.placeIron();
        this.placeEther();
    }

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
    }

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
    }

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
    }

    // Эфир (гигантские фиолетовые кристаллы и грибы) растёт вдоль «линий разлома» — тонких извилистых полос шума, с разрывами.
    placeEther() {
        const o = this.options;
        const faults = this.createFaultLayer();

        for (const i of this.landTiles) {
            if (this.river[i] || this.resource[i] !== Resource.NONE) continue;
            if (faults[i] > 1 - o.etherShare && this.random() < o.etherChance) this.resource[i] = Resource.ETHER;
        }
    }

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
    }

    /* ---------- 5в. Берега ---------- */

    // Тип берега для суши рядом с морем, озером или рекой: пляж, каменистый берег или утёс.
    // Горы у воды — всегда утёсы; низкие тёплые берега — пляжи (пятнами); остальное — камни.
    classifyShores() {
        const o = this.options;
        const coastal = this.landTiles.filter(i =>
            this.river[i] > 0
            || this.neighbors8(i).some(j => !this.isLand(j))
            || this.neighbors(i).some(j => this.river[j] > 0));
        if (coastal.length === 0) return;

        const heightRank = rankNormalize(Float32Array.from(coastal, i => this.elevation[i] - this.seaLevel));
        const clusters = this.createDensityLayer(this.noise.shore, o.shoreScale);
        const nearMountains = this.tilesNearMountains(2);

        coastal.forEach((i, k) => {
            const warmEnough = this.temperature[i] > 0.2;
            if (nearMountains[i] || heightRank[k] > 1 - o.cliffShare) this.shore[i] = Shore.CLIFF;
            else if (warmEnough && heightRank[k] < 0.65 && clusters[i] > 1 - o.beachShare) this.shore[i] = Shore.BEACH;
            else this.shore[i] = Shore.ROCKY;
        });
    }

    /* ---------- 6. Реки и озёра ---------- */

    /* Реки — часть рельефа, а не линии, нарисованные поверх: вода стекает по высотам.
        1) «Заливка впадин» (priority-flood): из моря и краёв карты затопляем сушу от низких мест к высоким; так у каждой
            клетки появляется сток (flowTo) к морю, а впадины, которые не имеют стока, становятся озёрами.
        2) Подсчёт стока: дождь выпадает на каждую клетку (во влажных местах больше) и стекает вниз по flowTo; в каждой
            клетке накапливается вода всех клеток выше по течению. Где её много — там река; чем больше воды, тем река шире.
        Получаются притоки, слияния, бассейны — как в природе, а не 16 одиноких ручьёв. */

    fillDepressions() {
        const o = this.options;
        const size = this.size;
        const count = size * size;
        const filled = new Float32Array(count);
        const flowTo = new Int32Array(count).fill(-1);
        const done = new Uint8Array(count);
        const heap = new MinHeap();
        const jitter = i => (hash32(i) / 4294967296) * o.riverMeander;  // чтобы русла петляли, а не шли по линейке

        for (let i = 0; i < count; i++) {
            const x = i % size, y = Math.floor(i / size);
            const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
            if (!this.isLand(i)) {
                done[i] = 1;
                filled[i] = this.seaLevel;
                if (this.neighbors8(i).some(j => this.isLand(j))) heap.push(this.seaLevel, i, 0);
            } else if (onEdge) {
                done[i] = 1;
                filled[i] = this.elevation[i] + jitter(i);
                heap.push(filled[i], i, 0);
            }
        }
        while (heap.size > 0) {
            const [level, current] = heap.pop();
            for (const next of this.neighbors8(current)) {
                if (done[next]) continue;
                done[next] = 1;
                flowTo[next] = current;
                // Шаг заливки случайный (и длиннее по диагонали): на плоских местах русла петляют, а не бегут параллельными прямыми.
                const step = 2e-4 * (0.3 + 2 * (hash32(next + 7919) / 4294967296)) * (this.isDiagonal(current, next) ? 1.4 : 1);
                filled[next] = Math.max(this.elevation[next] + jitter(next), level + step);
                heap.push(filled[next], next, 0);
            }
        }
        this.filled = filled;
        this.flowTo = flowTo;

        // Озёра: впадины достаточной глубины и размера.
        const deep = new Uint8Array(count);
        for (const i of this.landTiles) {
            if (this.terrain[i] === Terrain.PLAIN && filled[i] - this.elevation[i] > o.lakeDepth) deep[i] = 1;
        }
        const seen = new Uint8Array(count);
        for (const start of this.landTiles) {
            if (!deep[start] || seen[start]) continue;
            const queue = [start];
            seen[start] = 1;
            for (let head = 0; head < queue.length; head++) {
                for (const next of this.neighbors(queue[head])) {
                    if (deep[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
                }
            }
            if (queue.length < o.lakeMinSize) continue;
            for (const i of queue) {
                this.terrain[i] = Terrain.DEEP_WATER;
                this.mountainHeight[i] = 0;
            }
        }
        this.collectLandTiles();
    }

    isDiagonal(a, b) {
        return (a % this.size !== b % this.size) && (Math.floor(a / this.size) !== Math.floor(b / this.size));
    }

    generateRivers() {
        const o = this.options;
        const count = this.size * this.size;

        // Дождь на каждую клетку суши; воду собираем сверху вниз (от высоких клеток к низким), в том числе через озёра.
        const flow = new Float32Array(count);
        const order = [];
        for (let i = 0; i < count; i++) {
            if (this.flowTo[i] !== -1) order.push(i);
            if (this.isLand(i)) flow[i] = o.rainfall * (0.4 + 1.6 * this.moisture[i]) * (this.terrain[i] === Terrain.MOUNTAIN ? 1.3 : 1);
        }
        order.sort((a, b) => this.filled[b] - this.filled[a]);
        for (const i of order) flow[this.flowTo[i]] += flow[i];

        const [first, second, third] = o.riverThresholds;
        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN || flow[i] < first) continue;
            this.river[i] = flow[i] >= third ? 3 : flow[i] >= second ? 2 : 1;
            this.riverFlow[i] = Math.min(65535, Math.round(flow[i]));
            this.riverTo[i] = this.flowTo[i];
            this.resource[i] = Resource.NONE;                        // на реке ресурсов нет
        }
    }

    // Переправы: на прямых участках рек (вода входит и выходит в одном направлении) изредка ставим мост (река глубже 1) или брод.
    placeRiverCrossings() {
        const size = this.size;
        const upstream = new Map();                                  // клетка -> реки, впадающие в неё
        for (const i of this.landTiles) {
            if (this.river[i] > 0 && this.riverTo[i] !== -1 && this.river[this.riverTo[i]] > 0) {
                if (!upstream.has(this.riverTo[i])) upstream.set(this.riverTo[i], []);
                upstream.get(this.riverTo[i]).push(i);
            }
        }
        const direction = (from, to) => [(to % size) - (from % size), Math.floor(to / size) - Math.floor(from / size)];

        for (const i of this.landTiles) {
            if (this.river[i] === 0 || this.riverTo[i] === -1 || this.crossing[i]) continue;
            const sources = upstream.get(i) || [];
            if (sources.length !== 1) continue;                       // начало реки или слияние — не место для моста
            const [ax, ay] = direction(sources[0], i), [bx, by] = direction(i, this.riverTo[i]);
            if (ax !== bx || ay !== by) continue;                    // поворот
            if (this.random() > this.options.riverCrossingChance) continue;
            if (this.neighbors8(i).some(j => this.crossing[j])) continue;
            this.crossing[i] = this.river[i] >= 2 ? 2 : 1;
        }
    }

    /* ---------- 7. Регионы ---------- */

    // Регионы растут одновременно от «семян», как кристаллы. Каждый шаг стоит «денег»: горы и реки дороги,
    // поэтому границы охотно ложатся по хребтам и рекам, а плавный шум стоимости делает формы неправильными.
    buildRegions() {
        const o = this.options;
        const averageSize = (o.regionMinSize + o.regionMaxSize) / 2;
        const seedCount = Math.max(1, Math.round(this.landTiles.length / averageSize));

        this.nextRegionId = 0;
        this.growRegionsFromSeeds(this.pickRegionSeeds(seedCount));
        this.countRegionSizes();
        this.attachLeftoverTiles();
        this.fillSeedlessLand();
        this.countRegionSizes();
        this.mergeSmallRegions();
        this.balanceRegionSizes();
    }

    shuffled(list) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    // Семена берём случайно, но не вплотную друг к другу: сначала с большим зазором, потом с меньшим, пока не наберём нужное число.
    pickRegionSeeds(count) {
        const order = this.shuffled(this.landTiles);
        const blocked = new Uint8Array(this.terrain.length);
        const seeds = [];
        const averageSize = (this.options.regionMinSize + this.options.regionMaxSize) / 2;
        const spacing = Math.max(1, Math.round(Math.sqrt(averageSize) * 0.6)); // чем крупнее регион, тем дальше друг от друга семена

        for (let radius = spacing; radius >= 0; radius--) {
            blocked.fill(0);
            for (const seed of seeds) this.markBlocked(blocked, seed, radius);

            for (const i of order) {
                if (seeds.length >= count) return seeds;
                if (blocked[i] || this.regionId[i] !== -1) continue;
                seeds.push(i);
                this.markBlocked(blocked, i, radius);
            }
        }
        return seeds;
    }

    markBlocked(blocked, i, radius) {
        const x = i % this.size;
        const y = Math.floor(i / this.size);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) blocked[ny * this.size + nx] = 1;
            }
        }
    }

    growRegionsFromSeeds(seeds) {
        const maxSize = this.options.regionMaxSize;
        const noiseLayer = this.createDensityLayer(this.noise.regionShape, 10); // гладкий шум: где-то «пробираться» дороже
        const heap = new MinHeap();
        const sizes = [];
        const speed = [];

        seeds.forEach((tile, id) => {
            sizes[id] = 0;
            speed[id] = 0.85 + this.random() * 0.3; // у каждого региона свой темп роста
            heap.push(0, tile, id);
        });
        this.nextRegionId = seeds.length;

        while (heap.size > 0) {
            const [cost, tile, id] = heap.pop();
            if (this.regionId[tile] !== -1 || sizes[id] >= maxSize) continue;

            this.regionId[tile] = id;
            sizes[id]++;

            for (const neighbor of this.neighbors(tile)) {
                if (!this.isLand(neighbor) || this.regionId[neighbor] !== -1) continue;
                heap.push(cost + this.regionStepCost(neighbor, noiseLayer) * speed[id], neighbor, id);
            }
        }
    }

    regionStepCost(tile, noiseLayer) {
        const o = this.options;
        let cost = 1 + noiseLayer[tile] * 3 * o.regionIrregularity;
        if (this.terrain[tile] === Terrain.MOUNTAIN) cost += o.regionBarrierCost;
        if (this.river[tile] > 0) cost += o.regionBarrierCost * 0.6;
        return cost;
    }

    // Клетки, которые никто не успел занять (соседние регионы уже набрали максимум), отдаём самому маленькому соседу.
    attachLeftoverTiles() {
        let changed = true;
        while (changed) {
            changed = false;
            for (const i of this.landTiles) {
                if (this.regionId[i] !== -1) continue;
                const target = this.smallestNeighborRegion(i);
                if (target === -1) continue;
                this.regionId[i] = target;
                this.regionSizes[target]++;
                changed = true;
            }
        }
    }

    smallestNeighborRegion(i) {
        let best = -1;
        for (const neighbor of this.neighbors(i)) {
            const id = this.regionId[neighbor];
            if (id === -1) continue;
            if (best === -1 || this.regionSizes[id] < this.regionSizes[best]) best = id;
        }
        return best;
    }

    // Острова, куда не попало ни одного семени, делим на регионы обычной «волной».
    fillSeedlessLand() {
        const { regionMinSize, regionMaxSize } = this.options;
        for (const start of this.landTiles) {
            if (this.regionId[start] !== -1) continue;
            const targetSize = regionMinSize + Math.floor(this.random() * (regionMaxSize - regionMinSize + 1));
            this.growRegion(start, this.nextRegionId++, targetSize);
        }
    }

    growRegion(start, id, targetSize) {
        const queue = [start];
        this.regionId[start] = id;
        let size = 1;

        for (let head = 0; head < queue.length && size < targetSize; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (size >= targetSize) break;
                if (!this.isLand(neighbor) || this.regionId[neighbor] !== -1) continue;
                this.regionId[neighbor] = id;
                queue.push(neighbor);
                size++;
            }
        }
    }

    countRegionSizes() {
        this.regionSizes = {};
        for (const i of this.landTiles) {
            const id = this.regionId[i];
            this.regionSizes[id] = (this.regionSizes[id] || 0) + 1;
        }
    }

    // Обрывки вливаем в самого маленького соседа, чтобы размеры оставались ровными.
    mergeSmallRegions() {
        const tilesByRegion = {};
        for (const i of this.landTiles) {
            (tilesByRegion[this.regionId[i]] ||= []).push(i);
        }

        for (const key of Object.keys(this.regionSizes)) {
            const id = Number(key);
            const tiles = tilesByRegion[id];
            if (!tiles || tiles.length >= this.options.regionMergeBelow) continue;

            const target = this.findSmallestNeighborRegion(tiles, id);
            if (target === -1) continue; // остров без соседей — оставляем как есть

            for (const i of tiles) this.regionId[i] = target;
            tilesByRegion[target].push(...tiles);
            this.regionSizes[target] += tiles.length;
            delete this.regionSizes[id];
            delete tilesByRegion[id];
        }
    }

    // Выравниваем размеры: клетки на границе переходят от слишком больших регионов к слишком маленьким.
    // Клетку отдаём, только если донор от этого не развалится на части.
    balanceRegionSizes() {
        const { regionMinSize, regionMaxSize, regionBalancePasses } = this.options;

        for (let pass = 0; pass < regionBalancePasses; pass++) {
            let moved = 0;
            for (const tile of this.landTiles) {
                const donor = this.regionId[tile];
                for (const neighbor of this.neighbors(tile)) {
                    const receiver = this.regionId[neighbor];
                    if (receiver === -1 || receiver === donor) continue;

                    const donorSize = this.regionSizes[donor];
                    const receiverSize = this.regionSizes[receiver];
                    const receiverTooSmall = receiverSize < regionMinSize && donorSize > regionMinSize;
                    const donorTooBig = donorSize > regionMaxSize && receiverSize < regionMaxSize;
                    if (!receiverTooSmall && !donorTooBig) continue;
                    if (!this.staysConnectedWithout(tile, donor)) continue;

                    this.regionId[tile] = receiver;
                    this.regionSizes[donor]--;
                    this.regionSizes[receiver]++;
                    moved++;
                    break;
                }
            }
            if (moved === 0) break;
        }
    }

    // Останется ли регион цельным, если убрать из него клетку removed.
    staysConnectedWithout(removed, id) {
        const start = this.neighbors(removed).find(n => this.regionId[n] === id);
        if (start === undefined) return true; // в регионе была только эта клетка

        const seen = new Set([removed, start]);
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            for (const neighbor of this.neighbors(queue[head])) {
                if (this.regionId[neighbor] !== id || seen.has(neighbor)) continue;
                seen.add(neighbor);
                queue.push(neighbor);
            }
        }
        return queue.length === this.regionSizes[id] - 1;
    }

    findSmallestNeighborRegion(tiles, ownId) {
        let best = -1;
        for (const i of tiles) {
            for (const j of this.neighbors(i)) {
                const other = this.regionId[j];
                if (other === -1 || other === ownId) continue;
                if (best === -1 || this.regionSizes[other] < this.regionSizes[best]) best = other;
            }
        }
        return best;
    }

    /* ---------- 8. Поселения и дороги ---------- */

    /* Поселение — ресурс клетки (как пшеница или руда): в клетке либо оно, либо другой ресурс. Оно даёт население
        и золото; населения в клетке хранится столько, сколько нужно рисунку, чтобы быть тем больше, чем больше жителей.
        Население региона зависит от «обитаемости» его клеток: плодородные луга, поля, места у рек и побережья — много,
        пустыня, тундра и горы — мало. Большому региону достаётся ещё и второе поселение. */
    placeSettlements() {
        const o = this.options;
        const habitability = this.computeHabitability();

        const tilesByRegion = {};
        const sums = {};
        for (const i of this.landTiles) {
            const id = this.regionId[i];
            (tilesByRegion[id] ||= []).push(i);
            sums[id] = (sums[id] || 0) + habitability[i];
        }

        const candidates = [];
        for (const key of Object.keys(sums)) {
            const id = Number(key);
            const gauss = (this.random() + this.random() + this.random() - 1.5) / 0.5; // ≈ нормальное распределение
            const population = Math.round(sums[id] * o.populationPerHabitability * Math.exp(gauss * o.populationVariation));
            this.regionPopulation[id] = population;
            if (population >= o.settlementMinPopulation) candidates.push({ regionId: id, population });
        }

        // Крупные ставим первыми: они занимают лучшие места, мелкие устраиваются вокруг.
        candidates.sort((a, b) => b.population - a.population);
        const blocked = new Uint8Array(this.terrain.length);
        for (const candidate of candidates) {
            const shares = candidate.population >= o.secondSettlementPopulation ? [0.62, 0.38] : [1];
            for (const share of shares) {
                const population = Math.round(candidate.population * share);
                if (population < o.settlementMinPopulation) continue;
                const tile = this.findSettlementTile(candidate.regionId, tilesByRegion[candidate.regionId], habitability, blocked);
                if (tile !== -1) this.addSettlement(tile, candidate.regionId, population, blocked);
            }
        }
    }

    // Размер поселения (1..settlementMaxLevel): каждое увеличение населения в settlementGrowth раз добавляет уровень.
    settlementLevelFor(population) {
        const o = this.options;
        const level = 1 + Math.floor(Math.log(Math.max(1, population) / o.settlementMinPopulation) / Math.log(o.settlementGrowth));
        return clamp(level, 1, o.settlementMaxLevel);
    }

    findSettlementTile(regionId, regionTiles, habitability, blocked) {
        let best = -Infinity;
        let found = -1;
        for (const i of regionTiles) {
            if (this.terrain[i] !== Terrain.PLAIN || this.river[i] || blocked[i] || habitability[i] <= 0) continue;
            if (this.shore[i] === Shore.CLIFF) continue;
            if ([Resource.GOLD, Resource.IRON, Resource.ETHER].includes(this.resource[i])) continue;
            const score = habitability[i] + this.random() * 0.3;
            if (score > best) { best = score; found = i; }
        }
        return found;
    }

    addSettlement(tile, regionId, population, blocked) {
        const level = this.settlementLevelFor(population);
        this.settlements.push({ id: this.settlements.length, regionId, tile, population, level });
        this.resource[tile] = Resource.SETTLEMENT;
        this.population[tile] = Math.min(65535, population);
        this.settlementLevel[tile] = level;

        const x = tile % this.size, y = Math.floor(tile / this.size);
        const spacing = this.options.settlementSpacing;
        for (let dy = -spacing; dy <= spacing; dy++) {
            for (let dx = -spacing; dx <= spacing; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) blocked[ny * this.size + nx] = 1;
            }
        }
    }

    // Насколько клетка подходит для жизни: 0 (горы, вода) .. ~1.6 (плодородный луг у реки).
    computeHabitability() {
        const byBiome = {
            [Biome.GRASSLAND]: 1, [Biome.SAVANNA]: 0.65, [Biome.STEPPE]: 0.6,
            [Biome.TAIGA]: 0.55, [Biome.TUNDRA]: 0.15, [Biome.DESERT]: 0.1
        };
        const habitability = new Float32Array(this.terrain.length);
        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN) continue;
            let value = byBiome[this.biome[i]] * (0.6 + 0.4 * this.moisture[i]);
            if (this.resource[i] === Resource.WHEAT) value += 0.35;
            else if (this.resource[i] === Resource.WOOD) value += 0.1;
            if (this.neighbors(i).some(j => this.river[j] > 0)) value += 0.35;                 // вода для питья и торговли
            if (this.neighbors8(i).some(j => !this.isLand(j))) value += 0.2;                   // берег
            if (this.shore[i] === Shore.CLIFF) value -= 0.2;
            habitability[i] = clamp(value, 0, 1.6);
        }
        return habitability;
    }

    /* Дороги между поселениями по всей карте. Каждое поселение соединяется с ближайшими соседями; рёбра берутся по
        возрастанию длины, и в «каркас» попадают те, что связывают ещё не связанные группы (как остовное дерево), плюс
        несколько ближайших пар для петель. Путь ищет A*: горы и вода непроходимы, лес и подъёмы замедляют, а чужие
        дороги дёшевы — поэтому дороги сливаются в магистрали. Где дорога пересекает реку, ставится мост или брод. */
    buildRoads() {
        const o = this.options;
        const list = this.settlements;
        if (!o.roads || list.length < 2) return;

        // 1) кандидаты в рёбра: K ближайших соседей каждого поселения
        const coords = list.map(s => [s.tile % this.size, Math.floor(s.tile / this.size)]);
        const edges = [];
        const seen = new Set();
        const bucketSize = 16;
        const buckets = new Map();
        coords.forEach(([x, y], id) => {
            const key = Math.floor(x / bucketSize) + ',' + Math.floor(y / bucketSize);
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(id);
        });
        const reach = Math.ceil(o.roadMaxDistance / bucketSize);

        coords.forEach(([x, y], id) => {
            const near = [];
            for (let by = Math.floor(y / bucketSize) - reach; by <= Math.floor(y / bucketSize) + reach; by++) {
                for (let bx = Math.floor(x / bucketSize) - reach; bx <= Math.floor(x / bucketSize) + reach; bx++) {
                    for (const other of buckets.get(bx + ',' + by) || []) {
                        if (other === id) continue;
                        const distance = Math.hypot(coords[other][0] - x, coords[other][1] - y);
                        if (distance <= o.roadMaxDistance) near.push({ other, distance });
                    }
                }
            }
            near.sort((a, b) => a.distance - b.distance);
            near.slice(0, o.roadNeighbors).forEach(({ other, distance }, rank) => {
                const key = Math.min(id, other) * 100000 + Math.max(id, other);
                if (seen.has(key)) return;
                seen.add(key);
                edges.push({ a: id, b: other, distance, rank });
            });
        });
        edges.sort((p, q) => p.distance - q.distance);

        // 2) каркас (связываем несвязанное) + петли (ближайшие пары)
        const parent = list.map((_, i) => i);
        const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        for (const edge of edges) {
            const joins = find(edge.a) !== find(edge.b);
            const loop = !joins && (edge.rank === 0 || (edge.rank === 1 && this.random() < o.roadLoopChance));
            if (!joins && !loop) continue;

            const path = this.findRoadPath(list[edge.a].tile, list[edge.b].tile);
            if (!path) continue;                                  // например, через море
            if (joins) parent[find(edge.a)] = find(edge.b);
            this.carveRoad(path);
        }
    }

    // Поиск пути A* от клетки к клетке; null, если пути нет.
    findRoadPath(start, goal) {
        const size = this.size;
        const count = size * size;
        if (!this.searchCost) {
            this.searchCost = new Float32Array(count);
            this.searchStamp = new Int32Array(count);
            this.searchFrom = new Int32Array(count);
            this.searchRun = 0;
        }
        const cost = this.searchCost, stamp = this.searchStamp, from = this.searchFrom;
        const run = ++this.searchRun;
        const goalX = goal % size, goalY = Math.floor(goal / size);
        const heuristic = i => Math.hypot((i % size) - goalX, Math.floor(i / size) - goalY) * 0.4;

        const heap = new MinHeap();
        cost[start] = 0;
        stamp[start] = run;
        from[start] = -1;
        heap.push(heuristic(start), start, 0);

        while (heap.size > 0) {
            const [, current, spent] = heap.pop();
            if (spent > cost[current] + 1e-6) continue;           // устаревшая запись
            if (current === goal) {
                const path = [];
                for (let i = goal; i !== -1; i = from[i]) path.push(i);
                return path.reverse();
            }

            const x = current % size, y = Math.floor(current / size);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                    const next = ny * size + nx;

                    const step = this.roadStepCost(current, next, dx !== 0 && dy !== 0, x, y, dx, dy);
                    if (step === Infinity) continue;
                    const total = cost[current] + step;
                    if (stamp[next] !== run || total < cost[next]) {
                        stamp[next] = run;
                        cost[next] = total;
                        from[next] = current;
                        heap.push(total + heuristic(next), next, total);
                    }
                }
            }
        }
        return null;
    }

    // Цена шага по дороге в клетку next (Infinity — нельзя).
    roadStepCost(current, next, diagonal, x, y, dx, dy) {
        if (this.terrain[next] !== Terrain.PLAIN) return Infinity;           // вода и горы
        if (diagonal) {                                                      // по диагонали нельзя «срезать угол» воды, гор и рек
            for (const j of [y * this.size + x + dx, (y + dy) * this.size + x]) {
                if (this.terrain[j] !== Terrain.PLAIN || this.river[j]) return Infinity;
            }
        }

        let cost = diagonal ? 1.414 : 1;
        if (this.river[next]) cost += 3;                                     // мост — дорого
        if (this.resource[next] === Resource.WOOD) cost *= 1.5;
        else if (this.resource[next] === Resource.WHEAT) cost *= 1.15;
        if (this.biome[next] === Biome.TUNDRA || this.biome[next] === Biome.DESERT) cost *= 1.4;
        cost += Math.abs(this.elevation[next] - this.elevation[current]) * 12; // подъёмы
        if (this.roadLevel[next] > 0) cost *= 0.4;                           // готовые дороги дёшевы
        return cost;
    }

    // Сохраняет путь: уровень дороги в клетках (где дорогу используют несколько путей — выше), связи с соседями и мосты через реки.
    carveRoad(path) {
        const size = this.size;
        const direction = (from, to) => {
            const dx = (to % size) - (from % size), dy = Math.floor(to / size) - Math.floor(from / size);
            return ROAD_DIRECTIONS.findIndex(([ax, ay]) => ax === dx && ay === dy);
        };

        path.forEach((tile, k) => {
            this.roadLevel[tile] = Math.min(3, this.roadLevel[tile] + 1);
            if (this.river[tile] > 0 && this.crossing[tile] === 0) this.crossing[tile] = this.river[tile] >= 2 ? 2 : 1;
            if (k === 0) return;
            const previous = path[k - 1];
            const forward = direction(previous, tile);
            this.roadLinks[previous] |= 1 << forward;
            this.roadLinks[tile] |= 1 << (7 - forward);                      // противоположное направление в списке — зеркальный индекс
        });
    }

    /* ---------- Сводка по региону (для интерфейса) ---------- */

    getRegionInfo(regionId) {
        if (regionId < 0) return null;
        const tiles = this.landTiles.filter(i => this.regionId[i] === regionId);
        const info = {
            id: regionId,
            tiles,
            size: tiles.length,
            mountains: 0,
            riverTiles: 0,
            population: this.regionPopulation[regionId] || 0,
            settlements: [],
            coastal: false,
            resources: [0, 0, 0, 0, 0, 0, 0],   // по кодам Resource (0 — клетки без ресурса)
            biomes: [0, 0, 0, 0, 0, 0]    // по кодам Biome (без гор)
        };
        info.settlements = this.settlements.filter(s => s.regionId === regionId);
        for (const i of tiles) {
            if (this.terrain[i] === Terrain.MOUNTAIN) info.mountains++;
            else info.biomes[this.biome[i]]++;
            if (this.river[i]) info.riverTiles++;
            info.resources[this.resource[i]]++;
            if (this.neighbors(i).some(j => !this.isLand(j))) info.coastal = true;
        }
        return info;
    }

    /* ---------- Сводка по клетке (для интерфейса) ---------- */

    getTileInfo(x, y) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
        const i = this.index(x, y);
        const regionId = this.regionId[i];
        return {
            x, y,
            terrain: this.terrain[i],
            biome: this.biome[i],
            temperature: this.temperature[i],
            resource: this.resource[i],
            hasRiver: this.river[i] > 0,
            riverLevel: this.river[i],
            population: this.population[i],
            settlementLevel: this.settlementLevel[i],
            roadLevel: this.roadLevel[i],
            shore: this.shore[i],
            crossing: this.crossing[i],
            waterDepth: this.waterDepth[i],
            regionId,
            regionSize: regionId >= 0 ? this.regionSizes[regionId] : 0
        };
    }

    get landShare() {
        return this.landTiles.length / (this.size * this.size);
    }

    get regionCount() {
        return Object.keys(this.regionSizes).length;
    }
}

/* ============================================================
    Очередь с приоритетом (двоичная куча): достаёт самый «дешёвый» элемент. Нужна для роста регионов.
    ============================================================ */
class MinHeap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(cost, tile, region) {
        const items = this.items;
        items.push([cost, tile, region]);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent][0] <= items[i][0]) break;
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const left = 2 * i + 1, right = left + 1;
                let smallest = i;
                if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
                if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
                if (smallest === i) break;
                [items[smallest], items[i]] = [items[i], items[smallest]];
                i = smallest;
            }
        }
        return top;
    }
   }