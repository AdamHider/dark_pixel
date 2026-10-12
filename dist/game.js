(() => {
  // src/core/random.js
  function hash32(n) {
    n = Math.imul(n ^ n >>> 16, 2246822507);
    n = Math.imul(n ^ n >>> 13, 3266489909);
    return (n ^ n >>> 16) >>> 0;
  }
  function createRandom(seed) {
    let state = seed | 0;
    return function random() {
      state = state + 1831565813 | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/core/math.js
  var clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  var lerp = (a, b, t) => a + (b - a) * t;
  function rankNormalize(values) {
    const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
    const result = new Float32Array(values.length);
    order.forEach((index, rank) => {
      result[index] = rank / (values.length - 1);
    });
    return result;
  }
  function percentile(values, share) {
    const sorted = Float32Array.from(values).sort();
    return sorted[Math.floor(sorted.length * share)];
  }

  // src/core/value-noise.js
  var ValueNoise = class {
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
      const smooth = (t) => t * t * (3 - 2 * t);
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
  };

  // src/map/constants.js
  var Terrain = Object.freeze({ DEEP_WATER: 0, SHALLOW_WATER: 1, PLAIN: 2, MOUNTAIN: 3 });
  var Biome = Object.freeze({ TUNDRA: 0, TAIGA: 1, GRASSLAND: 2, STEPPE: 3, DESERT: 4, SAVANNA: 5, DEAD_LAND: 6, ETHER_LAND: 7 });
  var BIOME_COUNT = Object.keys(Biome).length;
  var Shore = Object.freeze({ NONE: 0, BEACH: 1, ROCKY: 2, CLIFF: 3 });
  var Resource = Object.freeze({ NONE: 0, WOOD: 1, WHEAT: 2, GOLD: 3, ETHER: 4, IRON: 5, SETTLEMENT: 6 });
  var ResourceInfo = Object.freeze({
    [Resource.WHEAT]: { name: "\u043F\u0448\u0435\u043D\u0438\u0446\u0430", produces: { food: 1 } },
    [Resource.WOOD]: { name: "\u0434\u0435\u0440\u0435\u0432\u043E", produces: { production: 1 } },
    [Resource.IRON]: { name: "\u0436\u0435\u043B\u0435\u0437\u043D\u0430\u044F \u0440\u0443\u0434\u0430", produces: { production: 2 } },
    [Resource.GOLD]: { name: "\u0437\u043E\u043B\u043E\u0442\u0430\u044F \u0440\u0443\u0434\u0430", produces: { gold: 2 } },
    [Resource.ETHER]: { name: "\u044D\u0444\u0438\u0440", produces: { ether: 1 } },
    [Resource.SETTLEMENT]: { name: "\u043F\u043E\u0441\u0435\u043B\u0435\u043D\u0438\u0435", produces: { population: 1, gold: 1 } }
    // население — из map.population[клетка]
  });
  var ROAD_DIRECTIONS = Object.freeze([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);

  // src/map/defaults.js
  var DEFAULTS = Object.freeze({
    size: 200,
    // сторона карты в клетках
    seed: 1,
    // --- суша и вода ---
    waterShare: 0.58,
    // какая доля клеток станет водой
    mountainShare: 0.12,
    // какая доля суши станет горами
    shallowWaterDistance: 2,
    // вода не дальше N клеток от суши считается мелководьем
    elevationScale: 4,
    // масштаб шума высоты (больше — мельче материки)
    elevationOctaves: 5,
    baseElevation: 0.25,
    // общий «подъём» рельефа
    islandFalloff: 0.5,
    // насколько сильно рельеф падает к краям (мир окружён водой)
    falloffPower: 2.5,
    // форма спада к краям (2 — плавно, 4 — «плато» с обрывом у краёв)
    shapeVariety: 0.6,
    // 0..1: насколько изрезана форма континента (заливы, полуострова, острова)
    shapeScale: 6,
    // размер деталей формы (больше — мельче)
    inlandSeaStrength: 0.35,
    // 0 — внутренних морей нет; больше — крупнее и чаще
    inlandSeaScale: 2.5,
    // размер внутренних морей (больше — мельче и чаще)
    islandDensity: 0.5,
    // 0..1: сколько островков разбросано вокруг материка (0 — только материк)
    islandScale: 14,
    // размер островков (больше — мельче)
    ridgeScale: 5,
    // масштаб горных хребтов
    ridgeStrength: 0.3,
    // насколько хребты поднимают рельеф
    mountainClustering: 0.6,
    // 0..1: 0 — тонкие цепи хребтов, 1 — сплошные массивы; посередине — массивы с ущельями
    massifScale: 3,
    // размер горных массивов (больше — мельче и чаще)
    ridgeSharpness: 4,
    // больше — тоньше и резче хребты
    warpScale: 2.5,
    // масштаб «скручивания» координат (делает берега и хребты извилистыми)
    warpStrength: 0.25,
    // сила скручивания; 0 — выключить
    coastDetailScale: 9,
    // масштаб мелкой изрезанности берега (больше — мельче заливы и мысы)
    coastDetail: 0.12,
    // 0..1: насколько мелкий шум изрезает береговую линию (0 — гладкие берега)
    minMountainSize: 4,
    // горные массивы меньше этого размера (в клетках) превращаются в равнину
    minIslandSize: 12,
    // клочки суши меньше этого размера (в клетках) превращаются в воду
    // --- зоны (степи, мёртвые земли, земли эфира) ---
    zoneScale: 4,
    // масштаб крупных «пятен» зон (больше — мельче и чаще пятна)
    steppeShare: 0.07,
    // доля карты под дополнительными степями (0 — степи только в обычных сухих местах)
    deadLandShare: 0.05,
    // доля карты под мёртвыми землями
    deadLandMoisture: 0.35,
    // влажность, ниже которой мёртвые земли не появляются (растут в сухих краях)
    etherLandScale: 3,
    // масштаб пятен эфирных земель
    etherLandShare: 0.04,
    // доля карты под эфирными землями
    etherLandDensity: 0.55,
    // плотность эфира внутри эфирных земель (0..1)
    // --- климат ---
    temperatureScale: 4,
    temperatureNoise: 0.35,
    // разброс температуры вокруг «север холодно, юг жарко»
    altitudeCooling: 0.6,
    // насколько высота охлаждает
    moistureScale: 5,
    aridity: 0.15,
    // 0..1: доля сухих клеток, где вместо луга степь/пустыня (меньше — меньше степей)
    // --- ресурсы ---
    forestScale: 7,
    // масштаб крупных лесных массивов (больше — мельче)
    forestShare: 0.34,
    // доля карты под крупными лесными массивами
    forestClumpShare: 0.14,
    // ...и ещё столько же мелких разрозненных рощ
    woodChance: 0.9,
    // шанс дерева в клетке внутри леса
    wheatScale: 9,
    wheatShare: 0.5,
    // то же для полей
    wheatClumpShare: 0.14,
    wheatChance: 0.85,
    clumpScale: 16,
    // размер мелких рощ и полей (больше — мельче)
    // --- редкие ресурсы ---
    foothillDistance: 2,
    // руда встречается в горах и на равнине не дальше N клеток от них
    goldScale: 6,
    goldShare: 0.45,
    // доля карты, где вообще возможно золото (скопления)
    goldChance: 0.05,
    // шанс золота в такой клетке (в предгорьях вдвое меньше)
    ironScale: 5,
    ironShare: 0.5,
    // то же для железной руды
    ironChance: 0.16,
    // железо встречается заметно чаще золота
    faultScale: 5,
    // масштаб «линий разлома», вдоль которых растёт эфир
    etherShare: 0.06,
    // доля карты вдоль линий разлома
    etherChance: 0.35,
    // шанс эфира на такой клетке
    // --- берега ---
    shoreScale: 12,
    // размер участков одного типа берега (больше — мельче)
    beachShare: 0.55,
    // доля подходящих (низких, тёплых) берегов, которые станут пляжами
    cliffShare: 0.25,
    // доля самых высоких берегов, которые станут утёсами (горы у воды — всегда утёсы)
    // --- поселения ---
    populationPerHabitability: 10,
    // население региона = сумма «обитаемости» его клеток × это число × случайный множитель
    populationVariation: 0.9,
    // разброс населения между регионами (больше — больше и крупных городов, и пустых земель)
    settlementMinPopulation: 60,
    // население группы меньше этого — поселения нет
    settlementMaxGroup: 4,
    // в группе (деревня, город) не больше стольких соседних клеток
    settlementGroupGrowth: 2.2,
    // во сколько раз надо увеличить население, чтобы в группе стало на клетку больше
    settlementMaxLevel: 4,
    // самый большой уровень клетки (он же число домиков в клетке)
    settlementTileMinPopulation: 58,
    // население клетки, с которого начинается уровень 1
    settlementTileGrowth: 1.5,
    // во сколько раз надо увеличить население клетки, чтобы уровень вырос на 1
    settlementsPerRegionMax: 3,
    // не больше стольких групп поселений в одном регионе
    secondSettlementPopulation: 900,
    // у региона с таким населением и больше будет вторая группа
    settlementSpacing: 2,
    // минимум клеток между группами поселений
    wheatMinPerRegion: 2,
    // в каждом подходящем регионе — не меньше стольких полей (равномерность)
    // --- дороги между поселениями ---
    roads: true,
    roadNeighbors: 3,
    // с сколькими ближайшими соседями пробуем соединить каждое поселение
    roadMaxDistance: 28,
    // дальше этого (в клетках) дорог не строим
    roadLoopChance: 0.4,
    // шанс добавить «петлю» — вторую по близости дорогу, когда связь уже есть
    // --- реки и озёра ---
    rainfall: 1,
    // сколько воды даёт клетка (во влажных местах больше); больше — больше и шире реки
    riverThresholds: [60, 180, 480],
    // сколько воды надо, чтобы появился ручей / река / большая река
    riverMeander: 0.012,
    // насколько русла отклоняются от «кратчайшего» пути (больше — извилистее)
    lakeDepth: 0.02,
    // впадина глубже этого становится озером
    lakeMinSize: 4,
    // озёра меньше этого (в клетках) не создаём
    riverCrossingChance: 0.1,
    // доля подходящих прямых участков рек, где ставится мост или брод
    // --- регионы ---
    regionMinSize: 18,
    regionMaxSize: 22,
    regionMergeBelow: 10,
    // регионы меньше этого размера вливаются в самого маленького соседа
    regionIrregularity: 0.6,
    // 0 — почти круглые регионы, больше — причудливее границы
    regionBarrierCost: 3,
    // насколько горы и реки «мешают» росту региона (границы ложатся по ним)
    regionBalancePasses: 12
    // сколько раз выравнивать размеры регионов (0 — не выравнивать)
  });

  // src/map/steps/climate.js
  var climate = {
    generateMoisture() {
      const scale = this.options.moistureScale;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          this.moisture[this.index(x, y)] = this.noise.moisture.fractal(x / this.size * scale, y / this.size * scale, 4);
        }
      }
      this.moisture = rankNormalize(this.moisture);
    },
    // Север (y = 0) холодный, юг (y = size) жаркий; шум добавляет разнообразия, высота охлаждает.
    generateTemperature() {
      const o = this.options;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const i = this.index(x, y);
          const latitude = y / this.size;
          const noise = this.noise.temperature.fractal(x / this.size * o.temperatureScale, latitude * o.temperatureScale, 3);
          const altitude = Math.max(0, this.elevation[i] - this.seaLevel);
          const temperature = latitude * 0.9 + 0.05 + (noise - 0.5) * o.temperatureNoise - altitude * o.altitudeCooling;
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
          this.biome[i] = Biome.ETHER_LAND;
        } else if (dead && dead[i] > 1 - o.deadLandShare && this.moisture[i] < o.deadLandMoisture) {
          this.biome[i] = Biome.DEAD_LAND;
        } else if (steppe && this.biome[i] === Biome.GRASSLAND && steppe[i] > 1 - o.steppeShare) {
          this.biome[i] = Biome.STEPPE;
        }
      }
    },
    pickBiome(temperature, moisture) {
      const dry = this.options.aridity;
      if (temperature < 0.1) return Biome.TUNDRA;
      if (temperature < 0.42) {
        if (moisture > 0.55) return Biome.TAIGA;
        return moisture > dry * 0.8 ? Biome.GRASSLAND : Biome.STEPPE;
      }
      if (temperature < 0.7) {
        if (moisture < dry) return Biome.STEPPE;
        return moisture > 0.8 ? Biome.TAIGA : Biome.GRASSLAND;
      }
      if (moisture < dry) return Biome.DESERT;
      return moisture < 0.6 ? Biome.SAVANNA : Biome.GRASSLAND;
    }
  };

  // src/map/steps/elevation.js
  var elevation = {
    // Шум + падение к краям (вода вокруг) + хребты.
    generateElevation() {
      const o = this.options;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const nx = x / this.size;
          const ny = y / this.size;
          const dx = (nx - 0.5) * 2;
          const dy = (ny - 0.5) * 2;
          const distanceSq = dx * dx + dy * dy;
          const wx = nx + (this.noise.warpX.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;
          const wy = ny + (this.noise.warpY.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;
          const baseNoise = this.noise.elevation.fractal(wx * o.elevationScale, wy * o.elevationScale, o.elevationOctaves);
          const falloff = Math.pow(Math.sqrt(distanceSq), o.falloffPower) * o.islandFalloff;
          let height = baseNoise * 0.9 + o.baseElevation - falloff;
          const shapeNoise = this.noise.shape.fractal(wx * o.shapeScale, wy * o.shapeScale, 3);
          height += (shapeNoise - 0.5) * o.shapeVariety * 2.4;
          const coastNoise = this.noise.coastDetail.fractal(wx * o.coastDetailScale, wy * o.coastDetailScale, 3);
          height += (coastNoise - 0.5) * o.coastDetail * 2.4;
          const basinNoise = this.noise.basin.fractal(wx * o.inlandSeaScale, wy * o.inlandSeaScale, 2);
          height -= Math.max(0, basinNoise - 0.5) * 4 * o.inlandSeaStrength * clamp(1.3 - distanceSq);
          const ridgeNoise = this.noise.ridge.fractal(wx * o.ridgeScale, wy * o.ridgeScale, 4);
          const ridge = Math.pow(1 - Math.abs(2 * ridgeNoise - 1), o.ridgeSharpness);
          height += ridge * o.ridgeStrength * clamp(1.2 - distanceSq);
          const i = this.index(x, y);
          this.elevation[i] = height;
          this.ridge[i] = ridge;
          this.massif[i] = this.noise.massif.fractal(wx * o.massifScale, wy * o.massifScale, 3);
        }
      }
    },
    // Острова: в полосе мелководья вокруг материка отдельные «горбы» шума поднимаем над уровнем моря.
    scatterIslands() {
      const o = this.options;
      if (o.islandDensity <= 0) return;
      const estimatedSea = percentile(this.elevation, o.waterShare);
      const threshold = 0.72 - 0.16 * o.islandDensity;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const i = this.index(x, y);
          const belowSea = estimatedSea - this.elevation[i];
          if (belowSea <= 0 || belowSea > 0.15) continue;
          const bump = this.noise.islands.fractal(x / this.size * o.islandScale, y / this.size * o.islandScale, 2);
          if (bump > threshold) this.elevation[i] = estimatedSea + 0.01 + (bump - threshold) * 0.5;
        }
      }
    }
  };

  // src/core/min-heap.js
  var MinHeap = class {
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
        const parent = i - 1 >> 1;
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
        for (; ; ) {
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
  };

  // src/map/steps/regions.js
  var regions = {
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
    },
    shuffled(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    // Семена берём случайно, но не вплотную друг к другу: сначала с большим зазором, потом с меньшим, пока не наберём нужное число.
    pickRegionSeeds(count) {
      const order = this.shuffled(this.landTiles);
      const blocked = new Uint8Array(this.terrain.length);
      const seeds = [];
      const averageSize = (this.options.regionMinSize + this.options.regionMaxSize) / 2;
      const spacing = Math.max(1, Math.round(Math.sqrt(averageSize) * 0.6));
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
    },
    markBlocked(blocked, i, radius) {
      const x = i % this.size;
      const y = Math.floor(i / this.size);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size) blocked[ny * this.size + nx] = 1;
        }
      }
    },
    growRegionsFromSeeds(seeds) {
      const maxSize = this.options.regionMaxSize;
      const noiseLayer = this.createDensityLayer(this.noise.regionShape, 10);
      const heap = new MinHeap();
      const sizes = [];
      const speed = [];
      seeds.forEach((tile, id) => {
        sizes[id] = 0;
        speed[id] = 0.85 + this.random() * 0.3;
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
    },
    regionStepCost(tile, noiseLayer) {
      const o = this.options;
      let cost = 1 + noiseLayer[tile] * 3 * o.regionIrregularity;
      if (this.terrain[tile] === Terrain.MOUNTAIN) cost += o.regionBarrierCost;
      if (this.river[tile] > 0) cost += o.regionBarrierCost * 0.6;
      return cost;
    },
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
    },
    smallestNeighborRegion(i) {
      let best = -1;
      for (const neighbor of this.neighbors(i)) {
        const id = this.regionId[neighbor];
        if (id === -1) continue;
        if (best === -1 || this.regionSizes[id] < this.regionSizes[best]) best = id;
      }
      return best;
    },
    // Острова, куда не попало ни одного семени, делим на регионы обычной «волной».
    fillSeedlessLand() {
      const { regionMinSize, regionMaxSize } = this.options;
      for (const start of this.landTiles) {
        if (this.regionId[start] !== -1) continue;
        const targetSize = regionMinSize + Math.floor(this.random() * (regionMaxSize - regionMinSize + 1));
        this.growRegion(start, this.nextRegionId++, targetSize);
      }
    },
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
    },
    countRegionSizes() {
      this.regionSizes = {};
      for (const i of this.landTiles) {
        const id = this.regionId[i];
        this.regionSizes[id] = (this.regionSizes[id] || 0) + 1;
      }
    },
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
        if (target === -1) continue;
        for (const i of tiles) this.regionId[i] = target;
        tilesByRegion[target].push(...tiles);
        this.regionSizes[target] += tiles.length;
        delete this.regionSizes[id];
        delete tilesByRegion[id];
      }
    },
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
    },
    // Останется ли регион цельным, если убрать из него клетку removed.
    staysConnectedWithout(removed, id) {
      const start = this.neighbors(removed).find((n) => this.regionId[n] === id);
      if (start === void 0) return true;
      const seen = /* @__PURE__ */ new Set([removed, start]);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        for (const neighbor of this.neighbors(queue[head])) {
          if (this.regionId[neighbor] !== id || seen.has(neighbor)) continue;
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
      return queue.length === this.regionSizes[id] - 1;
    },
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
  };

  // src/map/steps/resources.js
  var resources = {
    placeResources() {
      const o = this.options;
      const forest = this.createPatchLayer(this.noise.forest, o.forestScale, o.forestShare, this.noise.forestClumps, o.clumpScale, o.forestClumpShare);
      const fields = this.createPatchLayer(this.noise.fertility, o.wheatScale, o.wheatShare, this.noise.fertilityClumps, o.clumpScale, o.wheatClumpShare);
      for (const i of this.landTiles) {
        if (this.terrain[i] !== Terrain.PLAIN) continue;
        if (this.biome[i] === Biome.DEAD_LAND || this.biome[i] === Biome.ETHER_LAND) continue;
        const t = this.temperature[i];
        const m = this.moisture[i];
        const roll = this.random();
        const goodForWood = forest[i] && m > 0.3 && t > 0.12 && t < 0.8;
        const goodForWheat = fields[i] && m > 0.1 && m < 0.9 && t > 0.18 && t < 0.85;
        if (goodForWood && roll < o.woodChance) this.resource[i] = Resource.WOOD;
        else if (goodForWheat && roll < o.wheatChance) this.resource[i] = Resource.WHEAT;
      }
    },
    /* Поля раскладываем ещё и «по одному на регион» (после того как регионы построены): регионам, где пшеницы мало,
       добавляем поля в самых подходящих клетках. Так пшеница есть по всей карте, а не только там, где удачно лёг шум. */
    distributeWheat() {
      const o = this.options;
      if (o.wheatMinPerRegion <= 0) return;
      const fields = this.createPatchLayer(this.noise.fertility, o.wheatScale, o.wheatShare, this.noise.fertilityClumps, o.clumpScale, o.wheatClumpShare);
      const byRegion = /* @__PURE__ */ new Map();
      for (const i of this.landTiles) {
        const id = this.regionId[i];
        if (id < 0) continue;
        if (!byRegion.has(id)) byRegion.set(id, { have: 0, sites: [] });
        const entry = byRegion.get(id);
        if (this.resource[i] === Resource.WHEAT) {
          entry.have++;
          continue;
        }
        if (this.isWheatSite(i)) entry.sites.push(i);
      }
      const ordered = [...byRegion.values()].filter((entry) => entry.have < o.wheatMinPerRegion);
      ordered.sort((a, b) => a.have - b.have);
      for (const entry of ordered) {
        entry.sites.sort((a, b) => this.wheatScore(b, fields) - this.wheatScore(a, fields) || this.random() - 0.5);
        for (const i of entry.sites) {
          if (entry.have >= o.wheatMinPerRegion) break;
          this.resource[i] = Resource.WHEAT;
          entry.have++;
        }
      }
    },
    // Насколько клетка хороша под поле: плодородие, умеренная влага, близость реки.
    wheatScore(i, fields) {
      const wet = this.neighbors(i).some((j) => this.river[j] > 0);
      return (fields ? fields[i] : 0) * 0.8 + (1 - Math.abs(this.moisture[i] - 0.55)) * 0.6 + (1 - Math.abs(this.temperature[i] - 0.55)) * 0.4 + (wet ? 0.3 : 0);
    },
    // Подходит ли клетка под поле: равнина, не река, свободна, тёплый умеренный климат и не мёртвая/эфирная земля.
    isWheatSite(i) {
      return this.terrain[i] === Terrain.PLAIN && this.river[i] === 0 && this.resource[i] === Resource.NONE && this.biome[i] !== Biome.DEAD_LAND && this.biome[i] !== Biome.ETHER_LAND && this.biome[i] !== Biome.TUNDRA && this.biome[i] !== Biome.DESERT && this.temperature[i] > 0.18 && this.temperature[i] < 0.85 && this.moisture[i] > 0.1 && this.moisture[i] < 0.9;
    },
    // «Пятна» ресурса: крупные скопления плюс мелкие разрозненные кучки. Вместе дают хаотичное, но не пустое распределение.
    createPatchLayer(bigNoise, bigScale, bigShare, smallNoise, smallScale, smallShare) {
      const big = this.createDensityLayer(bigNoise, bigScale);
      const small = this.createDensityLayer(smallNoise, smallScale);
      const patches = new Uint8Array(big.length);
      for (let i = 0; i < patches.length; i++) {
        patches[i] = big[i] > 1 - bigShare || small[i] > 1 - smallShare ? 1 : 0;
      }
      return patches;
    },
    // Слой «плотности»: плавный шум, выровненный до равномерных значений 0..1.
    createDensityLayer(noise, scale) {
      const layer = new Float32Array(this.size * this.size);
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          layer[this.index(x, y)] = noise.fractal(x / this.size * scale, y / this.size * scale, 3);
        }
      }
      return rankNormalize(layer);
    },
    placeRareResources() {
      this.placeGold();
      this.placeIron();
      this.placeEther();
    },
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
    },
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
    },
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
    },
    // Эфир (гигантские фиолетовые кристаллы и грибы) растёт вдоль «линий разлома» — тонких извилистых полос шума, с разрывами.
    placeEther() {
      const o = this.options;
      const faults = this.createFaultLayer();
      for (const i of this.landTiles) {
        if (this.river[i] || this.resource[i] !== Resource.NONE) continue;
        if (faults[i] > 1 - o.etherShare && this.random() < o.etherChance) this.resource[i] = Resource.ETHER;
      }
      if (o.etherLandShare > 0 && o.etherLandDensity > 0) {
        for (const i of this.landTiles) {
          if (this.biome[i] !== Biome.ETHER_LAND || this.river[i] || this.resource[i] !== Resource.NONE) continue;
          if (this.random() < o.etherLandDensity) this.resource[i] = Resource.ETHER;
        }
      }
    },
    createFaultLayer() {
      const { faultScale } = this.options;
      const layer = new Float32Array(this.size * this.size);
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const n = this.noise.fault.fractal(x / this.size * faultScale, y / this.size * faultScale, 3);
          layer[this.index(x, y)] = 1 - Math.abs(2 * n - 1);
        }
      }
      return rankNormalize(layer);
    }
  };

  // src/map/steps/rivers.js
  var rivers = {
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
      const jitter = (i) => hash32(i) / 4294967296 * o.riverMeander;
      for (let i = 0; i < count; i++) {
        const x = i % size, y = Math.floor(i / size);
        const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
        if (!this.isLand(i)) {
          done[i] = 1;
          filled[i] = this.seaLevel;
          if (this.neighbors8(i).some((j) => this.isLand(j))) heap.push(this.seaLevel, i, 0);
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
          const step = 2e-4 * (0.3 + 2 * (hash32(next + 7919) / 4294967296)) * (this.isDiagonal(current, next) ? 1.4 : 1);
          filled[next] = Math.max(this.elevation[next] + jitter(next), level + step);
          heap.push(filled[next], next, 0);
        }
      }
      this.filled = filled;
      this.flowTo = flowTo;
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
            if (deep[next] && !seen[next]) {
              seen[next] = 1;
              queue.push(next);
            }
          }
        }
        if (queue.length < o.lakeMinSize) continue;
        for (const i of queue) {
          this.terrain[i] = Terrain.DEEP_WATER;
          this.mountainHeight[i] = 0;
        }
      }
      this.collectLandTiles();
    },
    isDiagonal(a, b) {
      return a % this.size !== b % this.size && Math.floor(a / this.size) !== Math.floor(b / this.size);
    },
    generateRivers() {
      const o = this.options;
      const count = this.size * this.size;
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
        this.resource[i] = Resource.NONE;
      }
    },
    // Переправы: на прямых участках рек (вода входит и выходит в одном направлении) изредка ставим мост (река глубже 1) или брод.
    placeRiverCrossings() {
      const size = this.size;
      const upstream = /* @__PURE__ */ new Map();
      for (const i of this.landTiles) {
        if (this.river[i] > 0 && this.riverTo[i] !== -1 && this.river[this.riverTo[i]] > 0) {
          if (!upstream.has(this.riverTo[i])) upstream.set(this.riverTo[i], []);
          upstream.get(this.riverTo[i]).push(i);
        }
      }
      const direction = (from, to) => [to % size - from % size, Math.floor(to / size) - Math.floor(from / size)];
      for (const i of this.landTiles) {
        if (this.river[i] === 0 || this.riverTo[i] === -1 || this.crossing[i]) continue;
        const sources = upstream.get(i) || [];
        if (sources.length !== 1) continue;
        const [ax, ay] = direction(sources[0], i), [bx, by] = direction(i, this.riverTo[i]);
        if (ax !== bx || ay !== by) continue;
        if (this.random() > this.options.riverCrossingChance) continue;
        if (this.neighbors8(i).some((j) => this.crossing[j])) continue;
        this.crossing[i] = this.river[i] >= 2 ? 2 : 1;
      }
    }
  };

  // src/map/steps/roads.js
  var roads = {
    /* Дороги между поселениями по всей карте. Каждое поселение соединяется с ближайшими соседями; рёбра берутся по
       возрастанию длины, и в «каркас» попадают те, что связывают ещё не связанные группы (как остовное дерево), плюс
       несколько ближайших пар для петель. Путь ищет A*: горы и вода непроходимы, лес и подъёмы замедляют, а чужие
       дороги дёшевы — поэтому дороги сливаются в магистрали. Где дорога пересекает реку, ставится мост или брод. */
    buildRoads() {
      const o = this.options;
      const list = this.settlementGroups;
      if (!o.roads || list.length < 2) return;
      const coords = list.map((s) => [s.tile % this.size, Math.floor(s.tile / this.size)]);
      const edges = [];
      const seen = /* @__PURE__ */ new Set();
      const bucketSize = 16;
      const buckets = /* @__PURE__ */ new Map();
      coords.forEach(([x, y], id) => {
        const key = Math.floor(x / bucketSize) + "," + Math.floor(y / bucketSize);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(id);
      });
      const reach = Math.ceil(o.roadMaxDistance / bucketSize);
      coords.forEach(([x, y], id) => {
        const near = [];
        for (let by = Math.floor(y / bucketSize) - reach; by <= Math.floor(y / bucketSize) + reach; by++) {
          for (let bx = Math.floor(x / bucketSize) - reach; bx <= Math.floor(x / bucketSize) + reach; bx++) {
            for (const other of buckets.get(bx + "," + by) || []) {
              if (other === id) continue;
              const distance = Math.hypot(coords[other][0] - x, coords[other][1] - y);
              if (distance <= o.roadMaxDistance) near.push({ other, distance });
            }
          }
        }
        near.sort((a, b) => a.distance - b.distance);
        near.slice(0, o.roadNeighbors).forEach(({ other, distance }, rank) => {
          const key = Math.min(id, other) * 1e5 + Math.max(id, other);
          if (seen.has(key)) return;
          seen.add(key);
          edges.push({ a: id, b: other, distance, rank });
        });
      });
      edges.sort((p, q) => p.distance - q.distance);
      const parent = list.map((_, i) => i);
      const find = (i) => parent[i] === i ? i : parent[i] = find(parent[i]);
      for (const edge of edges) {
        const joins = find(edge.a) !== find(edge.b);
        const loop = !joins && (edge.rank === 0 || edge.rank === 1 && this.random() < o.roadLoopChance);
        if (!joins && !loop) continue;
        const path = this.findRoadPath(list[edge.a].tile, list[edge.b].tile);
        if (!path) continue;
        if (joins) parent[find(edge.a)] = find(edge.b);
        this.carveRoad(path);
      }
    },
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
      const heuristic = (i) => Math.hypot(i % size - goalX, Math.floor(i / size) - goalY) * 0.4;
      const heap = new MinHeap();
      cost[start] = 0;
      stamp[start] = run;
      from[start] = -1;
      heap.push(heuristic(start), start, 0);
      while (heap.size > 0) {
        const [, current, spent] = heap.pop();
        if (spent > cost[current] + 1e-6) continue;
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
    },
    // Цена шага по дороге в клетку next (Infinity — нельзя).
    roadStepCost(current, next, diagonal, x, y, dx, dy) {
      if (this.terrain[next] !== Terrain.PLAIN) return Infinity;
      if (diagonal) {
        for (const j of [y * this.size + x + dx, (y + dy) * this.size + x]) {
          if (this.terrain[j] !== Terrain.PLAIN || this.river[j]) return Infinity;
        }
      }
      let cost = diagonal ? 1.414 : 1;
      if (this.river[next]) cost += 3;
      if (this.resource[next] === Resource.WOOD) cost *= 1.5;
      else if (this.resource[next] === Resource.WHEAT) cost *= 1.15;
      if (this.biome[next] === Biome.TUNDRA || this.biome[next] === Biome.DESERT) cost *= 1.4;
      cost += Math.abs(this.elevation[next] - this.elevation[current]) * 12;
      if (this.roadLevel[next] > 0) cost *= 0.4;
      return cost;
    },
    // Сохраняет путь: уровень дороги в клетках (где дорогу используют несколько путей — выше), связи с соседями и мосты через реки.
    carveRoad(path) {
      const size = this.size;
      const direction = (from, to) => {
        const dx = to % size - from % size, dy = Math.floor(to / size) - Math.floor(from / size);
        return ROAD_DIRECTIONS.findIndex(([ax, ay]) => ax === dx && ay === dy);
      };
      path.forEach((tile, k) => {
        this.roadLevel[tile] = Math.min(3, this.roadLevel[tile] + 1);
        if (this.river[tile] > 0 && this.crossing[tile] === 0) this.crossing[tile] = this.river[tile] >= 2 ? 2 : 1;
        if (k === 0) return;
        const previous = path[k - 1];
        const forward = direction(previous, tile);
        this.roadLinks[previous] |= 1 << forward;
        this.roadLinks[tile] |= 1 << 7 - forward;
      });
    }
  };

  // src/map/steps/settlements.js
  var settlements = {
    /* Поселение — ресурс клетки (как пшеница или руда): в клетке либо оно, либо другой ресурс. Оно даёт население
       и золото. Поселения стоят ГРУППАМИ из 1–4 соседних клеток (деревня, городок), и у каждой клетки группы свой
       уровень 1–4 (он же число домиков в клетке, в painter). Вместе клетки образуют один населённый пункт.
       Население региона зависит от «обитаемости» его клеток: плодородные луга, поля, места у рек и побережья — много,
       пустыня, тундра и горы — мало. Чем больше население, тем больше клеток в группе, а населения самой клетки хватает
       на более высокий уровень. Большому региону достаётся ещё и вторая группа. */
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
      const regions2 = [];
      for (const key of Object.keys(sums)) {
        const id = Number(key);
        const gauss = (this.random() + this.random() + this.random() - 1.5) / 0.5;
        const population = Math.round(sums[id] * o.populationPerHabitability * Math.exp(gauss * o.populationVariation));
        this.regionPopulation[id] = population;
        if (population < o.settlementMinPopulation) continue;
        let groups = clamp(
          1 + Math.floor(Math.log(population / o.settlementMinPopulation) / Math.log(o.settlementGroupGrowth)),
          1,
          o.settlementsPerRegionMax
        );
        if (population >= o.secondSettlementPopulation) groups = Math.max(2, groups);
        regions2.push({ regionId: id, population, groups, placed: 0, perGroup: Math.max(1, Math.round(population / groups)) });
      }
      regions2.sort((a, b) => b.population - a.population);
      const blocked = new Uint8Array(this.terrain.length);
      for (let round = 0; round < o.settlementsPerRegionMax; round++) {
        let placedAny = false;
        for (const region of regions2) {
          if (region.placed >= region.groups) continue;
          const group = this.growSettlementGroup(region.regionId, tilesByRegion[region.regionId], habitability, blocked, region.perGroup);
          if (!group) {
            region.groups = region.placed;
            continue;
          }
          this.commitSettlementGroup(group, region.perGroup, blocked);
          region.placed++;
          placedAny = true;
        }
        if (!placedAny) break;
      }
    },
    // Уровень клетки (1..settlementMaxLevel) по её населению: каждое увеличение в settlementTileGrowth раз добавляет уровень.
    settlementLevelFor(population) {
      const o = this.options;
      const level = 1 + Math.floor(Math.log(Math.max(1, population) / o.settlementTileMinPopulation) / Math.log(o.settlementTileGrowth));
      return clamp(level, 1, o.settlementMaxLevel);
    },
    // Подходит ли клетка под поселение.
    isSettlementSite(i, regionId, habitability, blocked) {
      return this.terrain[i] === Terrain.PLAIN && !this.river[i] && !blocked[i] && habitability[i] > 0 && this.biome[i] !== Biome.DEAD_LAND && this.biome[i] !== Biome.ETHER_LAND && this.regionId[i] === regionId && this.shore[i] !== Shore.CLIFF && ![Resource.GOLD, Resource.IRON, Resource.ETHER, Resource.SETTLEMENT, Resource.WHEAT].includes(this.resource[i]);
    },
    // Выбирает лучшую клетку региона и наращивает вокруг неё группу из соседних клеток (до settlementMaxGroup).
    growSettlementGroup(regionId, regionTiles, habitability, blocked, population) {
      const o = this.options;
      let center = -1;
      let best = -Infinity;
      for (const i of regionTiles) {
        if (!this.isSettlementSite(i, regionId, habitability, blocked)) continue;
        const score = habitability[i] + this.random() * 0.3;
        if (score > best) {
          best = score;
          center = i;
        }
      }
      if (center === -1) return null;
      const wanted = clamp(1 + Math.floor(Math.log(population / o.settlementMinPopulation) / Math.log(o.settlementGroupGrowth)), 1, o.settlementMaxGroup);
      const tiles = [center];
      const parents = [-1];
      const inside = new Set(tiles);
      while (tiles.length < wanted) {
        let next = -1, parent = -1, nextScore = -Infinity;
        for (const tile of tiles) {
          for (const neighbor of this.neighbors(tile)) {
            if (inside.has(neighbor) || !this.isSettlementSite(neighbor, regionId, habitability, blocked)) continue;
            const score = habitability[neighbor] + this.random() * 0.3;
            if (score > nextScore) {
              nextScore = score;
              next = neighbor;
              parent = tile;
            }
          }
        }
        if (next === -1) break;
        tiles.push(next);
        parents.push(parent);
        inside.add(next);
      }
      return { tiles, parents };
    },
    // Записывает группу: делит население между клетками (центр — больше всех), задаёт уровни и соединяет клетки дорожками.
    commitSettlementGroup(group, population, blocked) {
      const size = this.size;
      const groupId = this.settlementGroups.length;
      const weights = group.tiles.map((_, k) => k === 0 ? 1.4 : 0.6 + this.random() * 0.8);
      const total = weights.reduce((a, b) => a + b, 0);
      group.tiles.forEach((tile, k) => {
        const tilePopulation = Math.max(1, Math.round(population * weights[k] / total));
        const level = this.settlementLevelFor(tilePopulation);
        this.settlements.push({ id: this.settlements.length, groupId, regionId: this.regionId[tile], tile, population: tilePopulation, level, center: k === 0 });
        this.resource[tile] = Resource.SETTLEMENT;
        this.population[tile] = Math.min(65535, tilePopulation);
        this.settlementLevel[tile] = level;
        this.settlementGroup[tile] = groupId;
        if (group.parents[k] !== -1) this.carveRoad([group.parents[k], tile]);
      });
      this.settlementGroups.push({ id: groupId, regionId: this.regionId[group.tiles[0]], tiles: group.tiles, tile: group.tiles[0], population });
      const spacing = this.options.settlementSpacing;
      for (const tile of group.tiles) {
        const x = tile % size, y = Math.floor(tile / size);
        for (let dy = -spacing; dy <= spacing; dy++) {
          for (let dx = -spacing; dx <= spacing; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < size && ny < size) blocked[ny * size + nx] = 1;
          }
        }
      }
    },
    // Насколько клетка подходит для жизни: 0 (горы, вода) .. ~1.6 (плодородный луг у реки).
    computeHabitability() {
      const byBiome = {
        [Biome.GRASSLAND]: 1,
        [Biome.SAVANNA]: 0.65,
        [Biome.STEPPE]: 0.6,
        [Biome.TAIGA]: 0.55,
        [Biome.TUNDRA]: 0.15,
        [Biome.DESERT]: 0.1,
        [Biome.DEAD_LAND]: 0.03,
        [Biome.ETHER_LAND]: 0.05
      };
      const habitability = new Float32Array(this.terrain.length);
      for (const i of this.landTiles) {
        if (this.terrain[i] !== Terrain.PLAIN) continue;
        let value = byBiome[this.biome[i]] * (0.6 + 0.4 * this.moisture[i]);
        if (this.resource[i] === Resource.WHEAT) value += 0.35;
        else if (this.resource[i] === Resource.WOOD) value += 0.1;
        if (this.neighbors(i).some((j) => this.river[j] > 0)) value += 0.35;
        if (this.neighbors8(i).some((j) => !this.isLand(j))) value += 0.2;
        if (this.shore[i] === Shore.CLIFF) value -= 0.2;
        habitability[i] = clamp(value, 0, 1.6);
      }
      return habitability;
    }
  };

  // src/map/steps/terrain.js
  var terrain = {
    // Пороги считаем по долям, а не по абсолютным числам: так соотношение воды и гор не зависит от настроек шума.
    classifyTerrain() {
      const { waterShare, mountainShare } = this.options;
      this.seaLevel = percentile(this.elevation, waterShare);
      const landIndices = [];
      for (let i = 0; i < this.elevation.length; i++) {
        if (this.elevation[i] > this.seaLevel) landIndices.push(i);
      }
      const rankOnLand = (values) => rankNormalize(Float32Array.from(landIndices, (i) => values[i]));
      const ridgeRank = rankOnLand(this.ridge);
      const massifRank = rankOnLand(this.massif);
      const heightRank = rankOnLand(this.elevation);
      const clustering = this.options.mountainClustering;
      const scores = landIndices.map((_, k) => 0.85 * ((1 - clustering) * ridgeRank[k] + clustering * massifRank[k]) + 0.15 * heightRank[k]);
      this.mountainLevel = percentile(scores, 1 - mountainShare);
      let maxScore = this.mountainLevel;
      for (const score of scores) maxScore = Math.max(maxScore, score);
      this.terrain.fill(Terrain.DEEP_WATER);
      landIndices.forEach((i, k) => {
        const isMountain = scores[k] > this.mountainLevel;
        this.terrain[i] = isMountain ? Terrain.MOUNTAIN : Terrain.PLAIN;
        if (isMountain) this.mountainHeight[i] = 0.3 + 0.7 * (scores[k] - this.mountainLevel) / (maxScore - this.mountainLevel);
      });
    },
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
    },
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
    },
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
    },
    collectLandTiles() {
      this.landTiles = [];
      for (let i = 0; i < this.terrain.length; i++) {
        if (this.isLand(i)) this.landTiles.push(i);
      }
    },
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
      for (let i = 0; i < this.terrain.length; i++) {
        if (this.isLand(i)) continue;
        const depth = this.waterDepth[i];
        this.terrain[i] = depth > 0 && depth <= this.options.shallowWaterDistance ? Terrain.SHALLOW_WATER : Terrain.DEEP_WATER;
      }
    },
    // Тип берега для суши рядом с морем, озером или рекой: пляж, каменистый берег или утёс.
    // Горы у воды — всегда утёсы; низкие тёплые берега — пляжи (пятнами); остальное — камни.
    classifyShores() {
      const o = this.options;
      const coastal = this.landTiles.filter((i) => this.river[i] > 0 || this.neighbors8(i).some((j) => !this.isLand(j)) || this.neighbors(i).some((j) => this.river[j] > 0));
      if (coastal.length === 0) return;
      const heightRank = rankNormalize(Float32Array.from(coastal, (i) => this.elevation[i] - this.seaLevel));
      const clusters = this.createDensityLayer(this.noise.shore, o.shoreScale);
      const nearMountains = this.tilesNearMountains(2);
      coastal.forEach((i, k) => {
        const warmEnough = this.temperature[i] > 0.2;
        if (nearMountains[i] || heightRank[k] > 1 - o.cliffShare) this.shore[i] = Shore.CLIFF;
        else if (warmEnough && heightRank[k] < 0.65 && clusters[i] > 1 - o.beachShare) this.shore[i] = Shore.BEACH;
        else this.shore[i] = Shore.ROCKY;
      });
    }
  };

  // src/map/map-generator.js
  var MapGenerator = class _MapGenerator {
    static DEFAULTS = DEFAULTS;
    constructor(options = {}) {
      this.options = { ..._MapGenerator.DEFAULTS, ...options };
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
      this.distributeWheat();
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
        iron: new ValueNoise(this.seed + 19),
        coastDetail: new ValueNoise(this.seed + 20),
        deadLand: new ValueNoise(this.seed + 21),
        etherLand: new ValueNoise(this.seed + 22),
        steppe: new ValueNoise(this.seed + 23)
      };
    }
    allocateLayers() {
      const count = this.size * this.size;
      this.elevation = new Float32Array(count);
      this.moisture = new Float32Array(count);
      this.ridge = new Float32Array(count);
      this.temperature = new Float32Array(count);
      this.terrain = new Uint8Array(count);
      this.population = new Uint16Array(count);
      this.settlementLevel = new Uint8Array(count);
      this.settlements = [];
      this.settlementGroups = [];
      this.settlementGroup = new Int16Array(count).fill(-1);
      this.regionPopulation = {};
      this.roadLevel = new Uint8Array(count);
      this.roadLinks = new Uint8Array(count);
      this.shore = new Uint8Array(count);
      this.crossing = new Uint8Array(count);
      this.mountainHeight = new Float32Array(count);
      this.massif = new Float32Array(count);
      this.riverTo = new Int32Array(count).fill(-1);
      this.riverFlow = new Uint16Array(count);
      this.waterDepth = new Uint8Array(count);
      this.biome = new Uint8Array(count);
      this.resource = new Uint8Array(count);
      this.river = new Uint8Array(count);
      this.regionId = new Int16Array(count).fill(-1);
      this.regionSizes = {};
      this.landTiles = [];
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
    /* ---------- Сводка по региону (для интерфейса) ---------- */
    getRegionInfo(regionId) {
      if (regionId < 0) return null;
      const tiles = this.landTiles.filter((i) => this.regionId[i] === regionId);
      const info2 = {
        id: regionId,
        tiles,
        size: tiles.length,
        mountains: 0,
        riverTiles: 0,
        population: this.regionPopulation[regionId] || 0,
        settlements: [],
        coastal: false,
        resources: [0, 0, 0, 0, 0, 0, 0],
        // по кодам Resource (0 — клетки без ресурса)
        biomes: new Array(BIOME_COUNT).fill(0)
        // по кодам Biome (без гор)
      };
      info2.settlements = this.settlements.filter((s) => s.regionId === regionId);
      for (const i of tiles) {
        if (this.terrain[i] === Terrain.MOUNTAIN) info2.mountains++;
        else info2.biomes[this.biome[i]]++;
        if (this.river[i]) info2.riverTiles++;
        info2.resources[this.resource[i]]++;
        if (this.neighbors(i).some((j) => !this.isLand(j))) info2.coastal = true;
      }
      return info2;
    }
    /* ---------- Сводка по клетке (для интерфейса) ---------- */
    getTileInfo(x, y) {
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
      const i = this.index(x, y);
      const regionId = this.regionId[i];
      return {
        x,
        y,
        terrain: this.terrain[i],
        biome: this.biome[i],
        temperature: this.temperature[i],
        resource: this.resource[i],
        hasRiver: this.river[i] > 0,
        riverLevel: this.river[i],
        population: this.population[i],
        settlementLevel: this.settlementLevel[i],
        settlementGroupSize: this.settlementGroup[i] >= 0 ? this.settlementGroups[this.settlementGroup[i]].tiles.length : 0,
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
  };
  Object.assign(MapGenerator.prototype, elevation, terrain, climate, resources, rivers, regions, settlements, roads);

  // src/render/color.js
  var packRgb = (r, g, b) => 4278190080 | b << 16 | g << 8 | r;
  var hexToPacked = (hex) => packRgb(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  var WHITE = packRgb(255, 255, 255);
  var BLACK = packRgb(0, 0, 0);
  function hslToPacked(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const k = (n) => (n + hue / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return packRgb(channel(0), channel(8), channel(4));
  }
  function mixPacked(a, b, t) {
    const w = Math.round(t * 256);
    const inv = 256 - w;
    const r = (a & 255) * inv + (b & 255) * w >> 8;
    const g = (a >>> 8 & 255) * inv + (b >>> 8 & 255) * w >> 8;
    const bl = (a >>> 16 & 255) * inv + (b >>> 16 & 255) * w >> 8;
    return 4278190080 | bl << 16 | g << 8 | r;
  }
  function speckColor(color, lighter) {
    const target = lighter ? 255 : 0;
    const r = (color & 255) + ((target - (color & 255)) * 33 >> 8);
    const g = (color >>> 8 & 255) + ((target - (color >>> 8 & 255)) * 33 >> 8);
    const b = (color >>> 16 & 255) + ((target - (color >>> 16 & 255)) * 33 >> 8);
    return 4278190080 | b << 16 | g << 8 | r;
  }
  function shadeFast(color, amount) {
    const r = color & 255, g = color >>> 8 & 255, b = color >>> 16 & 255;
    if (amount < 0) {
      const keep = 256 + amount;
      return 4278190080 | b * keep >> 8 << 16 | g * keep >> 8 << 8 | r * keep >> 8;
    }
    return 4278190080 | b + ((255 - b) * amount >> 8) << 16 | g + ((255 - g) * amount >> 8) << 8 | r + ((255 - r) * amount >> 8);
  }
  var shadePacked = (color, amount) => mixPacked(color, amount > 0 ? WHITE : BLACK, Math.abs(amount));
  var packPalette = (palette) => ({
    biome: palette.biome.map(hexToPacked),
    waterShades: palette.water.map(hexToPacked),
    riverShades: palette.river.map(hexToPacked),
    ice: palette.ice.map(hexToPacked),
    rock: hexToPacked(palette.rock),
    snow: hexToPacked(palette.snow),
    snowShade: hexToPacked(palette.snowShade),
    trunk: hexToPacked(palette.trunk)
  });

  // src/render/painter/noise.js
  function tileHash(x, y, k) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1274126177) | 0;
    h = Math.imul(h ^ h >>> 13, 1103515245);
    h ^= h >>> 16;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return h >>> 0;
  }
  var hashUnit = (x, y, k) => tileHash(x, y, k) / 4294967296;
  var smoothstep = (t) => t * t * (3 - 2 * t);
  var LatticeNoise = class {
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
  };

  // src/sprites/sprite-renderer.js
  var SpriteRenderer = class {
    constructor() {
      this.cache = /* @__PURE__ */ new Map();
    }
    render(config, options = {}) {
      const key = JSON.stringify([config, options]);
      const cached = this.cache.get(key);
      if (cached) return cached;
      const resolved = this.resolveConfig(config, options);
      const [width, height] = resolved.size;
      const context = {
        options,
        palette: resolved.palette || {},
        light: resolved.light || "nw",
        width,
        height,
        pixels: new Int32Array(width * height),
        // 0 — прозрачно; старший байт — непрозрачность
        frame: options.frame || 0
      };
      if (resolved.shadow) this.drawShadow(context, resolved.shadow, resolved.anchor);
      for (const layer of resolved.layers || []) {
        if (!this.isActive(layer, options, context.frame)) continue;
        for (const offset of this.repeatOffsets(layer.repeat)) this.drawLayer(context, layer, offset[0], offset[1]);
      }
      if (resolved.outline) this.drawOutline(context, resolved.outline === true ? "#241810" : resolved.outline);
      const sprite = this.toCanvas(context, options, resolved.anchor);
      this.cache.set(key, sprite);
      return sprite;
    }
    /* ---------- Конфиг и варианты ---------- */
    // Применяет сезонный вариант: его палитра дополняет общую, layers заменяют, addLayers дополняют слои.
    resolveConfig(config, options) {
      const variant = config.variants && options.season ? config.variants[options.season] : null;
      if (!variant) return config;
      return {
        ...config,
        ...variant,
        palette: { ...config.palette, ...variant.palette },
        layers: variant.layers || [...config.layers || [], ...variant.addLayers || []]
      };
    }
    isActive(layer, options, frame) {
      const when = { ...layer.when };
      if (layer.frames) when.frame = layer.frames;
      const matches = (wanted, actual) => wanted === void 0 || [].concat(wanted).includes(actual);
      if (!matches(when.season, options.season) || !matches(when.frame, frame)) return false;
      if (when.flag !== void 0) return [].concat(when.flag).some((flag) => (options.flags || []).includes(flag));
      return true;
    }
    repeatOffsets(repeat) {
      if (!repeat) return [[0, 0]];
      const offsets = [];
      if (repeat.cols || repeat.rows) {
        for (let r = 0; r < (repeat.rows || 1); r++) {
          for (let c = 0; c < (repeat.cols || 1); c++) offsets.push([c * (repeat.dx || 0), r * (repeat.dy || 0)]);
        }
      } else {
        for (let i = 0; i < (repeat.count || 1); i++) offsets.push([i * (repeat.dx || 0), i * (repeat.dy || 0)]);
      }
      return offsets;
    }
    /* ---------- Цвета ---------- */
    // Цвет из описания: '#hex', '$имя' (из options.colors), имя из палитры, { shade, amount }, { mix: [a, b, t] }.
    color(spec, context, depth = 0) {
      if (depth > 8) throw new Error("\u0426\u0438\u043A\u043B \u0432 \u043F\u0430\u043B\u0438\u0442\u0440\u0435 \u0441\u043F\u0440\u0430\u0439\u0442\u0430: " + JSON.stringify(spec));
      if (typeof spec === "string") {
        if (spec[0] === "#") return hexToPacked(spec.length === 4 ? "#" + [...spec.slice(1)].map((ch) => ch + ch).join("") : spec);
        if (spec[0] === "$") {
          const given = context.options.colors && context.options.colors[spec.slice(1)];
          return this.color(given || "#ff00ff", context, depth + 1);
        }
        if (context.palette[spec] === void 0) throw new Error("\u041D\u0435\u0442 \u0446\u0432\u0435\u0442\u0430 \u0432 \u043F\u0430\u043B\u0438\u0442\u0440\u0435: " + spec);
        return this.color(context.palette[spec], context, depth + 1);
      }
      if (spec.shade !== void 0) return shadePacked(this.color(spec.shade, context, depth + 1), spec.amount || 0);
      if (spec.mix) return mixPacked(this.color(spec.mix[0], context, depth + 1), this.color(spec.mix[1], context, depth + 1), spec.mix[2]);
      throw new Error("\u041D\u0435\u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0446\u0432\u0435\u0442\u0430: " + JSON.stringify(spec));
    }
    /* ---------- Рисование слоёв ---------- */
    drawLayer(context, layer, dx, dy) {
      if (layer.shape === "pixels") return this.drawPixels(context, layer, dx, dy);
      if (layer.shape === "scatter") return this.drawScatter(context, layer, dx, dy);
      if (layer.shape === "gradient") return this.drawGradient(context, layer, dx, dy);
      const mask = this.rasterize(context, layer, dx, dy);
      if (!mask) return;
      const color = this.color(layer.fill, context);
      const { width, height } = context;
      const bevel = layer.bevel || 0;
      const lit = shadePacked(color, bevel * 0.35);
      const shaded = shadePacked(color, -bevel * 0.35);
      const mirrored = context.light === "ne";
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!mask[y * width + x]) continue;
          let result = color;
          if (bevel > 0) {
            const open = (ox, oy) => {
              const nx = x + ox, ny = y + oy;
              return nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx];
            };
            const side = mirrored ? 1 : -1;
            const litEdge = open(0, -1) || open(side, 0);
            const shadeEdge = open(0, 1) || open(-side, 0);
            if (litEdge && !shadeEdge) result = lit;
            else if (shadeEdge && !litEdge) result = shaded;
          }
          this.setPixel(context, x, y, result, layer.alpha === void 0 ? 1 : layer.alpha);
        }
      }
    }
    // Фигура -> маска (1 — пиксель принадлежит фигуре).
    rasterize(context, layer, dx, dy) {
      const { width, height } = context;
      const mask = new Uint8Array(width * height);
      const mark = (x, y) => {
        if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
      };
      switch (layer.shape) {
        case "rect":
          for (let y = 0; y < layer.h; y++) for (let x = 0; x < layer.w; x++) mark(layer.x + x + dx, layer.y + y + dy);
          break;
        case "ellipse":
          for (let y = Math.floor(layer.cy - layer.ry); y <= Math.ceil(layer.cy + layer.ry); y++) {
            for (let x = Math.floor(layer.cx - layer.rx); x <= Math.ceil(layer.cx + layer.rx); x++) {
              const nx = (x + 0.5 - layer.cx) / layer.rx, ny = (y + 0.5 - layer.cy) / layer.ry;
              if (nx * nx + ny * ny <= 1) mark(x + dx, y + dy);
            }
          }
          break;
        case "polygon": {
          const points = layer.points;
          const ys = points.map((p) => p[1]), xs = points.map((p) => p[0]);
          for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
            for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
              if (this.insidePolygon(x + 0.5, y + 0.5, points)) mark(x + dx, y + dy);
            }
          }
          break;
        }
        case "line": {
          const thickness = layer.width || 1;
          for (let k = 1; k < layer.points.length; k++) {
            const [x0, y0] = layer.points[k - 1], [x1, y1] = layer.points[k];
            for (const [px, py] of this.linePoints(x0, y0, x1, y1)) {
              for (let oy = 0; oy < thickness; oy++) for (let ox = 0; ox < thickness; ox++) mark(px + ox + dx, py + oy + dy);
            }
          }
          break;
        }
        default:
          throw new Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u0444\u0438\u0433\u0443\u0440\u0430: " + layer.shape);
      }
      return mask;
    }
    // Чётно-нечётный тест: лежит ли точка внутри многоугольника.
    insidePolygon(x, y, points) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    linePoints(x0, y0, x1, y1) {
      const points = [];
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      for (; ; ) {
        points.push([x0, y0]);
        if (x0 === x1 && y0 === y1) break;
        const doubled = 2 * error;
        if (doubled >= dy) {
          error += dy;
          x0 += sx;
        }
        if (doubled <= dx) {
          error += dx;
          y0 += sy;
        }
      }
      return points;
    }
    // Точечная графика: строки из букв, значения букв — в legend; '.' и ' ' — пусто.
    drawPixels(context, layer, dx, dy) {
      layer.rows.forEach((row, ry) => {
        [...row].forEach((ch, rx) => {
          if (ch === "." || ch === " ") return;
          const spec = layer.legend && layer.legend[ch];
          if (spec === void 0) throw new Error("\u041D\u0435\u0442 \u0431\u0443\u043A\u0432\u044B \u0432 legend: " + ch);
          this.setPixel(context, layer.x + rx + dx, layer.y + ry + dy, this.color(spec, context), layer.alpha === void 0 ? 1 : layer.alpha);
        });
      });
    }
    // «Россыпь»: случайные точки в области (одинаковые при каждом вызове благодаря seed).
    drawScatter(context, layer, dx, dy) {
      const seed = layer.seed || 1;
      const area = layer.area;
      const colors = layer.colors.map((spec) => this.color(spec, context));
      for (let n = 0; n < layer.count; n++) {
        const r1 = hashUnit(n, seed, 901), r2 = hashUnit(n, seed, 902), r3 = hashUnit(n, seed, 903);
        let x, y;
        if (area.rect) {
          x = area.rect[0] + Math.floor(r1 * area.rect[2]);
          y = area.rect[1] + Math.floor(r2 * area.rect[3]);
        } else {
          const angle = r1 * Math.PI * 2, radius = Math.sqrt(r2);
          x = Math.round(area.ellipse[0] + Math.cos(angle) * radius * area.ellipse[2]);
          y = Math.round(area.ellipse[1] + Math.sin(angle) * radius * area.ellipse[3]);
        }
        this.setPixel(context, x + dx, y + dy, colors[Math.floor(r3 * colors.length)], layer.alpha === void 0 ? 1 : layer.alpha);
      }
    }
    // Ступенчатый градиент между двумя цветами.
    drawGradient(context, layer, dx, dy) {
      const from = this.color(layer.from, context), to = this.color(layer.to, context);
      const steps = layer.steps || 4;
      const horizontal = layer.direction === "h";
      const length = horizontal ? layer.w : layer.h;
      for (let y = 0; y < layer.h; y++) {
        for (let x = 0; x < layer.w; x++) {
          const t = (horizontal ? x : y) / Math.max(1, length - 1);
          const quantized = Math.round(t * (steps - 1)) / Math.max(1, steps - 1);
          this.setPixel(context, layer.x + x + dx, layer.y + y + dy, mixPacked(from, to, quantized), layer.alpha === void 0 ? 1 : layer.alpha);
        }
      }
    }
    drawShadow(context, shadow, anchor) {
      const color = packRgb(0, 0, 0);
      const cx = anchor[0] + (shadow.dx || 0), cy = anchor[1] + (shadow.dy || 0);
      for (let y = Math.floor(cy - shadow.ry); y <= Math.ceil(cy + shadow.ry); y++) {
        for (let x = Math.floor(cx - shadow.rx); x <= Math.ceil(cx + shadow.rx); x++) {
          const nx = (x + 0.5 - cx) / shadow.rx, ny = (y + 0.5 - cy) / shadow.ry;
          if (nx * nx + ny * ny <= 1) this.setPixel(context, x, y, color, shadow.alpha === void 0 ? 0.28 : shadow.alpha);
        }
      }
    }
    // Контур: прозрачные пиксели, у которых есть непрозрачный сосед (тень контур не создаёт).
    drawOutline(context, spec) {
      const { width, height, pixels } = context;
      const color = this.color(spec, context);
      const opaque = (index) => pixels[index] >>> 24 === 255;
      const edge = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (opaque(y * width + x)) continue;
          const touches = x > 0 && opaque(y * width + x - 1) || x < width - 1 && opaque(y * width + x + 1) || y > 0 && opaque((y - 1) * width + x) || y < height - 1 && opaque((y + 1) * width + x);
          if (touches) edge.push(y * width + x);
        }
      }
      for (const index of edge) pixels[index] = color;
    }
    // Запись пикселя; alpha < 1 смешивает с тем, что уже нарисовано.
    setPixel(context, x, y, color, alpha) {
      if (x < 0 || y < 0 || x >= context.width || y >= context.height) return;
      const index = y * context.width + x;
      const existing = context.pixels[index];
      if (alpha >= 1) {
        context.pixels[index] = color;
      } else if (existing >>> 24 === 0) {
        context.pixels[index] = Math.round(alpha * 255) << 24 | color & 16777215;
      } else {
        context.pixels[index] = mixPacked(existing, color, alpha);
      }
    }
    /* ---------- Вывод ---------- */
    toCanvas(context, options, anchor) {
      const scale = Math.max(1, Math.round(options.scale || 1));
      const width = context.width * scale, height = context.height * scale;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(width, height);
      const out = new Int32Array(image.data.buffer);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sourceX = options.flipX ? context.width - 1 - Math.floor(x / scale) : Math.floor(x / scale);
          out[y * width + x] = context.pixels[Math.floor(y / scale) * context.width + sourceX];
        }
      }
      ctx.putImageData(image, 0, 0);
      const anchorX = options.flipX ? context.width - anchor[0] - 1 : anchor[0];
      return { canvas, width, height, anchorX: anchorX * scale, anchorY: anchor[1] * scale, scale };
    }
  };

  // src/render/seasons.js
  var SEASONS = {
    spring: {
      name: "\u0412\u0435\u0441\u043D\u0430",
      tempShift: 0.02,
      palette: {
        biome: ["#b2bfa8", "#557650", "#7fab5c", "#a9ac68", "#d1bd86", "#a5a55c", "#8f897b", "#6f5a86"],
        rock: "#787780",
        water: ["#58a0bd", "#4a8ba8", "#3d7592", "#325f79", "#284d63"],
        ice: ["#d9e8ee", "#c5d9e3", "#adc6d3"],
        snow: "#eef3f5",
        snowShade: "#cdd8de",
        broadleaf: ["#5f9a47", "#7ab654"],
        conifer: ["#2c5236", "#3b6844"],
        trunk: "#5a3a1e",
        blossom: "#f0c2d0",
        bareTrees: false,
        snowOnConifers: false,
        wheatStage: "sprout",
        wheatStalk: "#7cae4a",
        wheatTop: "#a9d46e",
        groundDetail: ["#f2e58f", "#ffffff", "#e6a3c0"]
      }
    },
    summer: {
      name: "\u041B\u0435\u0442\u043E",
      tempShift: 0.08,
      palette: {
        biome: ["#a9b5a4", "#4b6a47", "#6e9350", "#b3a76a", "#d0bb82", "#a99b58", "#8d8779", "#6a5580"],
        rock: "#77757d",
        water: ["#4f95b3", "#41809e", "#346a87", "#2a566f", "#21445a"],
        ice: ["#d9e8ee", "#c5d9e3", "#adc6d3"],
        snow: "#eef3f5",
        snowShade: "#cdd8de",
        broadleaf: ["#2f5a2c", "#42733a"],
        conifer: ["#25452f", "#33593c"],
        trunk: "#5a3a1e",
        blossom: null,
        bareTrees: false,
        snowOnConifers: false,
        wheatStage: "growing",
        wheatStalk: "#c2b73c",
        wheatTop: "#e0d478",
        groundDetail: null
      }
    },
    autumn: {
      name: "\u041E\u0441\u0435\u043D\u044C",
      tempShift: -0.08,
      palette: {
        biome: ["#aaa38a", "#4a6046", "#88904c", "#b8975a", "#caa877", "#a68b4e", "#8a8274", "#665079"],
        rock: "#76737a",
        water: ["#4a8199", "#3d6d85", "#315971", "#28485d", "#1f394b"],
        ice: ["#d9e8ee", "#c5d9e3", "#adc6d3"],
        snow: "#eef3f5",
        snowShade: "#cdd8de",
        broadleaf: ["#b5562b", "#d29a3a", "#9a3b26", "#6f8a3a"],
        conifer: ["#27432f", "#35563c"],
        trunk: "#54361c",
        blossom: null,
        bareTrees: false,
        snowOnConifers: false,
        wheatStage: "ripe",
        wheatStalk: "#dcb03a",
        wheatTop: "#f0d071",
        groundDetail: ["#b5562b", "#d29a3a", "#8a3d22"]
      }
    },
    winter: {
      name: "\u0417\u0438\u043C\u0430",
      tempShift: -0.2,
      palette: {
        biome: ["#c9d1d4", "#3f5847", "#7a8262", "#a3987a", "#c7b38b", "#978760", "#9a978f", "#7a6d8e"],
        rock: "#6f6e78",
        water: ["#4a7a94", "#3d6780", "#31546b", "#274456", "#1e3646"],
        ice: ["#d7e6ed", "#c2d6e0", "#a9c3d1"],
        snow: "#f2f6f8",
        snowShade: "#d3dde3",
        broadleaf: ["#5b4a3c"],
        conifer: ["#24402d", "#2f4f38"],
        trunk: "#5b4a3c",
        blossom: null,
        bareTrees: true,
        snowOnConifers: true,
        wheatStage: "bare",
        wheatStalk: "#7d6a48",
        wheatTop: "#9a8760",
        groundDetail: null
      }
    }
  };
  for (const season of Object.values(SEASONS)) {
    season.palette.river = season.palette.water.slice(0, 3);
  }
  function toneHex(hex, { saturation = 1, light = 1, tint = [1, 1, 1] }) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    r = luma + (r - luma) * saturation;
    g = luma + (g - luma) * saturation;
    b = luma + (b - luma) * saturation;
    const out = [r * light * tint[0], g * light * tint[1], b * light * tint[2]].map((v) => Math.max(0, Math.min(255, Math.round(v))));
    return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  var DARK_TONES = {
    land: { saturation: 0.55, light: 0.78, tint: [0.96, 1, 0.98] },
    rock: { saturation: 0.65, light: 0.82, tint: [0.97, 0.99, 1.02] },
    water: { saturation: 0.55, light: 0.68, tint: [0.88, 0.98, 1.03] },
    ice: { saturation: 0.55, light: 0.86, tint: [0.95, 1, 1.04] },
    snow: { saturation: 0.45, light: 0.92, tint: [0.96, 0.99, 1.03] },
    leaves: { saturation: 0.55, light: 0.72, tint: [0.97, 1, 0.97] },
    wood: { saturation: 0.7, light: 0.78 },
    crops: { saturation: 0.5, light: 0.8, tint: [0.98, 1, 0.94] },
    litter: { saturation: 0.4, light: 0.78 }
  };
  var DARK_EXTRA = {
    spring: { deadTreeChance: 0.3, fogStrength: 0.9 },
    summer: { deadTreeChance: 0.2, fogStrength: 0.6 },
    autumn: { deadTreeChance: 0.4, fogStrength: 1 },
    winter: { deadTreeChance: 0, fogStrength: 0.8 }
  };
  var DARK_SEASONS = {};
  for (const [name, season] of Object.entries(SEASONS)) {
    const p = season.palette;
    const tone = (list, preset) => list.map((color) => toneHex(color, preset));
    const water = tone(p.water, DARK_TONES.water);
    DARK_SEASONS[name] = {
      name: season.name,
      tempShift: season.tempShift - 0.03,
      // мир холоднее: снег ложится раньше
      palette: {
        ...p,
        biome: tone(p.biome, DARK_TONES.land),
        rock: toneHex(p.rock, DARK_TONES.rock),
        water,
        river: water.slice(0, 3),
        ice: tone(p.ice, DARK_TONES.ice),
        snow: toneHex(p.snow, DARK_TONES.snow),
        snowShade: toneHex(p.snowShade, DARK_TONES.snow),
        broadleaf: tone(p.broadleaf, DARK_TONES.leaves),
        conifer: tone(p.conifer, DARK_TONES.leaves),
        trunk: toneHex(p.trunk, DARK_TONES.wood),
        blossom: null,
        // цветущие деревья — не для этого мира
        wheatStalk: toneHex(p.wheatStalk, DARK_TONES.crops),
        wheatTop: toneHex(p.wheatTop, DARK_TONES.crops),
        groundDetail: p.groundDetail ? tone(p.groundDetail, DARK_TONES.litter) : null,
        ...DARK_EXTRA[name]
      }
    };
  }

  // src/render/painter/constants.js
  var COLORS = {
    bridgeDeck: "#a39e92",
    bridgeEdge: "#6e6a62",
    stone: "#b9b5ab",
    stoneShadow: "#7d7a72",
    gold: "#f2d15b",
    goldShadow: "#8a6a14",
    goldLight: "#fff2b0",
    riftDark: "#2a1250",
    riftGlow: "#a45cff",
    riftCore: "#e9ccff",
    regionBorder: "#19110a",
    sand: "#dccb96",
    wetSand: "#b5a67c",
    pebbleLight: "#a9a59a",
    pebbleDark: "#6f6c66",
    stoneMid: "#8a877e",
    hay: "#c9b774",
    dirt: "#8a7650",
    dirtLight: "#a89168",
    mud: "#5d4f38",
    plank: "#4a3524",
    wallA: "#dccca4",
    wallB: "#c8b48c",
    thatch: "#b09a5a",
    roofA: "#a24d34",
    roofB: "#7e3a2c",
    roofC: "#8d6238",
    roofD: "#5e5a66",
    outline: "#140e0a",
    window: "#f0b24a",
    fire: "#ffb347",
    fireCore: "#fff0b0",
    chapelStone: "#8d8a85",
    bone: "#cfc8b4",
    crow: "#16161a"
  };
  var SNOW_TEMPERATURE = 0.3;
  var ICE_TEMPERATURE = 0.16;
  var RIVER_ICE_TEMPERATURE = 0.12;
  var WATER_DEPTH_STEPS = [1, 2, 3, 5, 8];
  function waterShadeIndex(depth) {
    let index = 0;
    for (let k = 0; k < WATER_DEPTH_STEPS.length; k++) {
      if (depth >= WATER_DEPTH_STEPS[k]) index = k;
    }
    return index;
  }
  var STEP_AMOUNTS = Int32Array.from([-30, -15, 0, 15, 28]);
  var BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

  // src/render/painter/layers/base.js
  var base = {
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
      this.tileColors = colors;
      this.tileWater = water;
      const smooth = this.view !== "regions";
      const quadOf = this.blendGrid().quadOf;
      const quadColors = new Int32Array(16);
      const quadWater = new Uint8Array(16);
      const waterMask = this.waterMask;
      const quadSharpness = new Uint8Array(4);
      const clampTile = (v) => v < 0 ? 0 : v >= size ? size - 1 : v;
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const color = colors[ty * size + tx];
          if (this.isUniform(colors, tx, ty, color)) {
            for (let oy = 0; oy < T; oy++) {
              const start = (ty * T + oy) * W + tx * T;
              pixels.fill(color, start, start + T);
              waterMask.fill(water[ty * size + tx], start, start + T);
            }
            continue;
          }
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
            const waterCount = water[a] + water[b] + water[c] + water[d];
            quadSharpness[q] = !smooth ? 2 : waterCount > 0 && waterCount < 4 ? 1 : 0;
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
      const quadOf = new Uint8Array(T * T);
      const u = new Float32Array(T * T);
      const v = new Float32Array(T * T);
      for (let oy = 0; oy < T; oy++) {
        for (let ox = 0; ox < T; ox++) {
          const px = (ox + 0.5) / T - 0.5, py = (oy + 0.5) / T - 0.5;
          const pos = oy * T + ox;
          quadOf[pos] = Math.floor(px) + 1 + 2 * (Math.floor(py) + 1);
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
      const offX = tx * T & 3, offY = ty * T & 3;
      const key = offX + 4 * offY;
      if (grid.cache[key]) return grid.cache[key];
      const sharpness = [this.options.blendSharpness, this.options.coastSharpness];
      const tables = [new Uint8Array(T * T), new Uint8Array(T * T), new Uint8Array(T * T)];
      for (let oy = 0; oy < T; oy++) {
        for (let ox = 0; ox < T; ox++) {
          const pos = oy * T + ox;
          const u = grid.u[pos], v = grid.v[pos];
          const threshold = BAYER[(oy + offY & 3) * 4 + (ox + offX & 3)];
          for (let s = 0; s < 2; s++) {
            const uu = clamp((u - 0.5) * sharpness[s] + 0.5);
            const vv = clamp((v - 0.5) * sharpness[s] + 0.5);
            const weightA = (1 - uu) * (1 - vv);
            const weightB = uu * (1 - vv);
            const weightC = (1 - uu) * vv;
            tables[s][pos] = threshold < weightA ? 0 : threshold < weightA + weightB ? 1 : threshold < weightA + weightB + weightC ? 2 : 3;
          }
          tables[2][pos] = u < 0.5 ? v < 0.5 ? 0 : 2 : v < 0.5 ? 1 : 3;
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
        const position = (p + 0.5) / this.tileSize - 0.5;
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
       Маска «суша/вода» размывается на уровне клеток (число проходов размытия задаёт options.roundCoast),
       поэтому линия берега перестаёт идти по границам клеток: выпуклые прямые углы скругляются, а между
       береговыми клетками появляются плавные заливы и мысы. Размытое поле интерполируется по пикселям, и берег
       проводится по его середине.
       Центр каждой клетки всегда сохраняет свой тип (ядро), поэтому клетка-суша не может целиком «уйти в воду»,
       и при наведении на неё по-прежнему определяется равнина. */
    smoothCoast() {
      if (this.view !== "terrain" || !this.map.landTiles) return;
      const field = this.coastField();
      if (!field) return;
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
      const waterColorOf = /* @__PURE__ */ new Map(), landColorOf = /* @__PURE__ */ new Map();
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
              if ((tileWater[ny * size + nx] ? false : true) === wantLand) {
                found = ny * size + nx;
                break;
              }
            }
          }
          if (found >= 0) {
            color = colors[found];
            break;
          }
        }
        cache.set(tile, color);
        return color;
      };
      const shallow = this.packed.waterShades[0];
      const halfT = T / 2;
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const baseWater = tileWater[ty * size + tx] ? 1 : 0;
          const tile = ty * size + tx;
          const x0 = tx * T, y0 = ty * T;
          const coreX = x0 + (T >> 1), coreY = y0 + (T >> 1);
          for (let gy = y0; gy < y0 + T; gy++) {
            const r0 = first[gy] * size, r1 = second[gy] * size, v = fraction[gy];
            for (let gx = x0; gx < x0 + T; gx++) {
              const u = fraction[gx];
              const a = field[r0 + first[gx]], b = field[r0 + second[gx]];
              const c = field[r1 + first[gx]], d = field[r1 + second[gx]];
              const topRow = a + (b - a) * u;
              const fv = topRow + (c + (d - c) * u - topRow) * v;
              const bias = (baseWater - 0.5) * this.coastCore(Math.abs(gx - coreX) / halfT, Math.abs(gy - coreY) / halfT);
              const newWater = fv + bias > 0.5 ? 1 : 0;
              if (newWater === baseWater) continue;
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
    // Насколько пиксель «принадлежит ядру» своей клетки: 1 в центре, 0 у края. Держит центр клетки её типа.
    coastCore(dx, dy) {
      const r = Math.min(1, Math.max(dx, dy));
      return 1 - smoothstep(clamp((r - 0.35) / 0.65));
    },
    /* После скругления берега появились «лишние» пиксели воды на клетках-суше (и наоборот). Достраиваем их:
       вода на суше становится землёй (цвет ближайшей суши), суша в воде — мелководьем. Так маска воды везде
       совпадает с картинкой, а клетка на берегу больше не «двулична». */
    decorateWaterMask() {
      if (this.view !== "terrain" || !this.tileColors) return;
      const map = this.map;
      const size = map.size;
      const T = this.tileSize;
      const W = this.width;
      const pixels = this.pixels;
      const water = this.waterMask;
      const colors = this.tileColors, tileWater = this.tileWater;
      const field = this.coastField();
      if (!field) return;
      const axis = this.axis;
      const { first, second, fraction } = axis;
      const halfT = T / 2;
      const waterColorOf = /* @__PURE__ */ new Map(), landColorOf = /* @__PURE__ */ new Map();
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
              if ((tileWater[ny * size + nx] ? false : true) === wantLand) {
                found = ny * size + nx;
                break;
              }
            }
          }
          if (found >= 0) {
            color = colors[found];
            break;
          }
        }
        cache.set(tile, color);
        return color;
      };
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const tile = ty * size + tx;
          if (!tileWater[tile]) continue;
          const x0 = tx * T, y0 = ty * T;
          const coreX = x0 + (T >> 1), coreY = y0 + (T >> 1);
          for (let gy = y0; gy < y0 + T; gy++) {
            const r0 = first[gy] * size, r1 = second[gy] * size, v = fraction[gy];
            for (let gx = x0; gx < x0 + T; gx++) {
              const k = gy * W + gx;
              if (!water[k]) continue;
              const u = fraction[gx];
              const a = field[r0 + first[gx]], b = field[r0 + second[gx]];
              const c = field[r1 + first[gx]], d = field[r1 + second[gx]];
              const topRow = a + (b - a) * u;
              const fv = topRow + (c + (d - c) * u - topRow) * v;
              const bias = 0.5 * this.coastCore(Math.abs(gx - coreX) / halfT, Math.abs(gy - coreY) / halfT);
              if (fv + bias >= 0.5) continue;
              pixels[k] = nearestColor(tile, landColorOf, true);
              water[k] = 0;
            }
          }
        }
      }
      const shallowColor = this.packed.waterShades[0];
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const tile = ty * size + tx;
          const wantWater = tileWater[tile] ? 1 : 0;
          const x0 = tx * T, y0 = ty * T;
          const coreX = x0 + (T >> 1), coreY = y0 + (T >> 1);
          let wet = 0;
          for (let gy = y0; gy < y0 + T; gy++) {
            for (let gx = x0; gx < x0 + T; gx++) if (water[gy * W + gx]) wet++;
          }
          const half = T * T >> 1;
          if (wantWater ? wet >= half : wet <= half) continue;
          const far = [];
          for (let gy = y0; gy < y0 + T; gy++) {
            for (let gx = x0; gx < x0 + T; gx++) {
              const k = gy * W + gx;
              if (wantWater ? !water[k] : water[k]) {
                const dx = Math.abs(gx - coreX) / halfT, dy = Math.abs(gy - coreY) / halfT;
                far.push([Math.max(dx, dy), k]);
              }
            }
          }
          far.sort((p, q) => q[0] - p[0]);
          for (const [, k] of far) {
            if (wantWater ? wet >= half : wet <= half) break;
            if (wantWater) {
              pixels[k] = mixPacked(nearestColor(tile, waterColorOf, false), shallowColor, 0.6);
              water[k] = 1;
              wet++;
            } else {
              pixels[k] = nearestColor(tile, landColorOf, true);
              water[k] = 0;
              wet--;
            }
          }
        }
      }
    },
    // Размытое поле «воды» на уровне клеток (1 — вода, 0 — суша). Число проходов размытия — это и есть уровень скругления.
    coastField() {
      const passes = this.options.coastSmoothing === false ? 0 : Math.max(0, Math.round(this.options.roundCoast ?? 1));
      if (passes <= 0 || !this.tileWater) return null;
      if (this.coastFieldCache && this.coastFieldCache.passes === passes && this.coastFieldCache.source === this.tileWater) {
        return this.coastFieldCache.field;
      }
      const size = this.map.size;
      let field = new Float32Array(size * size);
      for (let i = 0; i < field.length; i++) field[i] = this.tileWater[i] ? 1 : 0;
      for (let p = 0; p < passes; p++) field = this.blurField(field, size);
      this.coastFieldCache = { passes, source: this.tileWater, field };
      return field;
    },
    // Размытие 3×3 (раздельное по осям, чтобы было дешевле).
    blurField(src, size) {
      const tmp = new Float32Array(src.length);
      const out = new Float32Array(src.length);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let sum = 0, count = 0;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= size) continue;
            sum += src[y * size + nx];
            count++;
          }
          tmp[y * size + x] = sum / count;
        }
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let sum = 0, count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= size) continue;
            sum += tmp[ny * size + x];
            count++;
          }
          out[y * size + x] = sum / count;
        }
      }
      return out;
    }
  };

  // src/render/painter/layers/borders.js
  var borders = {
    // Тонкая линия на правом/нижнем краю клетки, если за ней другой регион.
    // Над рекой границы не рисуем (иначе посреди воды появлялись бы чёрточки), а над горами делаем бледнее.
    paintRegionBorders() {
      const { size, regionId } = this.map;
      const T = this.tileSize;
      const W = this.width;
      const mask = this.riverMask;
      const relief2 = this.reliefHeight;
      const color = this.colors.regionBorder;
      const draw = (px, py) => {
        const k = py * W + px;
        if (mask && mask[k]) return;
        const alpha = relief2 ? 0.6 - 0.5 * Math.min(1, relief2[k] / 110) : 0.6;
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
  };

  // src/render/painter/layers/grading.js
  var grading = {
    // Приглушает цвет построек в тёмном стиле.
    moodize(color) {
      return this.mood === "dark" ? shadePacked(mixPacked(color, packRgb(110, 110, 110), 0.25), -0.12) : color;
    },
    /* Финальная обработка всей картинки: тёмные средние тона, холодные тени, туман над водой и низинами, виньетка.
       Яркими остаются только «источники света» (эфирные разломы, окна, костры) — они рисуются уже после. */
    applyGrading() {
      const W = this.width;
      const pixels = this.pixels;
      const fog = this.buildFog();
      const fogScale = Math.min(255, Math.round((this.pal.fogStrength === void 0 ? 1 : this.pal.fogStrength) * 255));
      const [lutR, lutG, lutB] = [0.95, 0.98, 1.04].map((gain) => Uint8Array.from({ length: 256 }, (_, v) => Math.min(255, Math.round(255 * Math.pow(v / 255, 1.14) * gain))));
      const [fogR, fogG, fogB] = [150, 162, 170];
      const vignette = this.options.vignette;
      const falloff = (length) => Float32Array.from({ length }, (_, p) => {
        const edge = Math.min(1, Math.min(p, length - 1 - p) / (length * 0.3));
        return Math.round(256 * (1 - vignette * (1 - smoothstep(edge))));
      });
      const vx = falloff(W), vy = falloff(W);
      for (let y = 0; y < W; y++) {
        const rowShade = vy[y];
        for (let x = 0; x < W; x++) {
          const k = y * W + x;
          const color = pixels[k];
          let r = lutR[color & 255], g = lutG[color >>> 8 & 255], b = lutB[color >>> 16 & 255];
          const a = fog[k] * fogScale >> 8;
          if (a > 0) {
            r += (fogR - r) * a >> 8;
            g += (fogG - g) * a >> 8;
            b += (fogB - b) * a >> 8;
          }
          const shade = vx[x] * rowShade >> 8;
          pixels[k] = 4278190080 | b * shade >> 8 << 16 | g * shade >> 8 << 8 | r * shade >> 8;
        }
      }
    },
    // Густота тумана по пикселям (0..255): клочья шума, над водой плотнее. Считается один раз на карту.
    buildFog() {
      const map = this.map;
      const cache = this.fogCache;
      if (cache && cache.source === map.elevation && cache.tileSize === this.tileSize && cache.salt === this.seedSalt) return cache.fog;
      const W = this.width;
      const step = 4;
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
          const base2 = noise <= 0.5 ? 0 : Math.min(1, (noise - 0.5) / 0.3);
          low[ly * lowWidth + lx] = Math.min(255, Math.round(curve[Math.round(base2 * 255)] * (this.waterMask[y * W + x] ? 1.15 : 1)));
        }
      }
      const fog = new Uint8Array(W * W);
      const weight = 256 / step;
      for (let y = 0; y < W; y++) {
        const rowA = (y / step | 0) * lowWidth, rowB = rowA + lowWidth, wy = y % step * weight;
        for (let x = 0; x < W; x++) {
          const lx = x / step | 0, wx = x % step * weight;
          const top = low[rowA + lx] * (256 - wx) + low[rowA + lx + 1] * wx;
          const bottom = low[rowB + lx] * (256 - wx) + low[rowB + lx + 1] * wx;
          fog[y * W + x] = top * (256 - wy) + bottom * wy >> 16;
        }
      }
      this.fogCache = { source: map.elevation, tileSize: this.tileSize, salt: this.seedSalt, fog };
      return fog;
    },
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
  };

  // src/render/painter/hill-shading.js
  function computeHillShading({ hills: hills2, waterMask, flags, tileOfColumn, width, tile, strength, ravineWidth, valleyNoise, capacity }) {
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
        const here = hills2[k];
        const northWest = k > width + 1 ? hills2[k - width - 1] : here;
        const southEast = k < last - width - 1 ? hills2[k + width + 1] : here;
        const threshold = BAYER[bayerRow + (gx & 3)];
        let step = Math.round(((southEast - northWest) * 0.06 + (here - 128) * 0.01) * scale + (threshold - 0.5) * 0.6);
        step = step < -2 ? -2 : step > 2 ? 2 : step;
        const ravine = flag === 3 && Math.abs(2 * valleyNoise.at(gx, gy) - 1) < ravineWidth;
        if (step !== 0 || ravine) {
          index[count] = k;
          code[count] = step + 2 | (ravine ? 8 : 0);
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

  // src/render/painter/layers/hills.js
  var hills = {
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
      const dryBiomes = [Biome.STEPPE, Biome.DESERT, Biome.SAVANNA, Biome.TUNDRA, Biome.DEAD_LAND, Biome.ETHER_LAND];
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
        hills: this.buildHillHeights(),
        waterMask: this.waterMask,
        flags,
        tileOfColumn,
        width: W,
        tile: T,
        strength: o.hillStrength,
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
              const coarse = top + (c + (d - c) * u - top) * v;
              const value = 0.3 * coarse + 0.7 * broad.at(gx, gy);
              height[gy * W + gx] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
            }
          }
        }
      }
      this.hillCache = { source: map.elevation, tileSize: T, height };
      return height;
    }
  };

  // src/render/painter/pixel-buffer.js
  var PixelBuffer = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Int32Array(width * height);
    }
    put(x, y, color) {
      if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.data[y * this.width + x] = color;
    }
    rect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, color);
    }
    // Эллипс с объёмом: слева сверху светлее, справа снизу темнее.
    ellipse(cx, cy, rx, ry, base2, light, dark) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const lean = nx + ny;
          this.put(x, y, lean < -0.45 ? light : lean > 0.5 ? dark : base2);
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
          const touches = x > 0 && data[y * width + x - 1] !== 0 || x < width - 1 && data[y * width + x + 1] !== 0 || y > 0 && data[(y - 1) * width + x] !== 0 || y < height - 1 && data[(y + 1) * width + x] !== 0;
          if (touches) edge.push(y * width + x);
        }
      }
      for (const index of edge) data[index] = color;
    }
  };

  // src/render/painter/layers/minerals.js
  var minerals = {
    // Рисунок из буфера на карту: прозрачные пиксели пропускаем.
    blitSprite(buffer, left, top) {
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
          const color = buffer.data[y * buffer.width + x];
          if (color !== 0) this.put(left + x, top + y, color);
        }
      }
    },
    // Каменный выступ с вкраплениями руды. kind: 'gold' (золото — яркое, с блёстками) или 'iron' (железо — тёмное, ржавое).
    oreSprite(kind, variant) {
      if (!this.spriteCache) this.spriteCache = /* @__PURE__ */ new Map();
      const key = "ore|" + kind + "|" + variant;
      const cached = this.spriteCache.get(key);
      if (cached) return cached;
      const n = (value) => Math.max(1, this.px(value));
      const gold = kind === "gold";
      const stone = gold ? [packRgb(150, 146, 150), packRgb(114, 110, 116), packRgb(78, 74, 82)] : [packRgb(120, 132, 146), packRgb(86, 96, 108), packRgb(54, 62, 74)];
      const oreLight = gold ? packRgb(255, 243, 168) : packRgb(207, 218, 228);
      const ore = gold ? packRgb(247, 212, 74) : packRgb(176, 92, 54);
      const oreDark = gold ? packRgb(168, 122, 20) : packRgb(98, 48, 30);
      const width = n(14), height = n(11);
      const buffer = new PixelBuffer(width, height);
      const mid = width >> 1, floor = height - 2;
      const rocks = [[mid - n(3), floor - n(2), n(4), n(3)], [mid + n(2), floor - n(2) - variant % 2, n(4), n(4)], [mid - 1, floor - n(4), n(3), n(3)]];
      for (const [cx, cy, rx, ry] of rocks) buffer.ellipse(cx, cy, rx, ry, stone[1], stone[0], stone[2]);
      const spots = gold ? [[mid - n(3), floor - n(3)], [mid + n(3), floor - n(3)], [mid, floor - n(5)], [mid + 1, floor - 1]] : [[mid - n(3), floor - n(2)], [mid + n(2), floor - n(3)], [mid, floor - n(4)], [mid - 1, floor - 1], [mid + n(4), floor - 1]];
      spots.forEach(([sx, sy], k) => {
        const size = gold ? k === 2 ? n(3) : n(2) : n(2);
        buffer.rect(sx, sy, size, size, ore);
        buffer.rect(sx + 1, sy + size, size, 1, oreDark);
        buffer.rect(sx + size, sy + 1, 1, size, oreDark);
        buffer.put(sx, sy, oreLight);
        if (!gold && k % 2 === 0) buffer.put(sx + size - 1, sy, oreLight);
      });
      if (this.options.spriteOutline) buffer.outline(this.colors.outline);
      const sprite = { buffer, width, height, anchorX: mid, anchorY: floor + 1, sparkles: gold ? [[mid - n(3), floor - n(4)], [mid + n(3), floor - n(4)], [mid, floor - n(6)]] : [] };
      this.spriteCache.set(key, sprite);
      return sprite;
    },
    drawOreTile(x, y, kind) {
      const T = this.tileSize;
      const sprite = this.oreSprite(kind, tileHash(x, y, 80) % 3);
      const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 80) - 0.5) * 0.2 * T);
      const base2 = y * T + Math.round(T * 0.8) + Math.round((hashUnit(x, y, 81) - 0.5) * 0.2 * T) - this.liftAtTile(x, y);
      this.drawBuildingShadow(cx, base2, this.px(7), this.px(5));
      this.blitSprite(sprite.buffer, cx - sprite.anchorX, base2 - sprite.anchorY);
      for (const [sx, sy] of sprite.sparkles) {
        const px = cx - sprite.anchorX + sx, py = base2 - sprite.anchorY + sy;
        this.emissive.push(() => {
          this.put(px, py, packRgb(255, 255, 230));
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.blend(px + dx, py + dy, packRgb(255, 240, 160), 0.7);
        });
      }
    },
    etherSprite(variant) {
      if (!this.spriteCache) this.spriteCache = /* @__PURE__ */ new Map();
      const key = "ether|" + variant;
      const cached = this.spriteCache.get(key);
      if (cached) return cached;
      const n = (value) => Math.max(1, this.px(value));
      const light = packRgb(214, 170, 255), mid = packRgb(160, 90, 240), dark = packRgb(91, 42, 158), tip = packRgb(248, 232, 255);
      const width = n(16), height = n(16);
      const buffer = new PixelBuffer(width, height);
      const floor = height - 2;
      const middle = width >> 1;
      if (variant === 2) {
        const mushroom = (cx, stem, capW, capH) => {
          buffer.rect(cx - 1, floor - stem, 2, stem, packRgb(222, 206, 244));
          buffer.rect(cx, floor - stem, 1, stem, packRgb(176, 156, 214));
          const capY = floor - stem - capH + 1;
          buffer.ellipse(cx, capY + capH - 1, capW, capH, mid, light, dark);
          buffer.rect(cx - capW + 1, capY + capH - 1, capW * 2 - 1, 1, dark);
          buffer.put(cx - 1, capY + 1, tip);
          buffer.put(cx + 2, capY + 2, tip);
          buffer.put(cx - capW + 2, capY + capH - 2, tip);
        };
        mushroom(middle - n(3), n(5), n(4), n(3));
        mushroom(middle + n(3), n(7), n(5), n(4));
        mushroom(middle, n(3), n(3), n(2));
      } else {
        const crystal = (cx, crystalWidth, crystalHeight) => {
          for (let row = 0; row < crystalHeight; row++) {
            const half = Math.max(0, Math.round(crystalWidth / 2 * Math.min(1, (row + 1) / (crystalHeight * 0.7))));
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
      if (this.options.spriteOutline) buffer.outline(packRgb(34, 14, 66));
      const sprite = { buffer, width, height, anchorX: middle, anchorY: floor + 1 };
      this.spriteCache.set(key, sprite);
      return sprite;
    },
    drawEther(x, y) {
      const T = this.tileSize;
      const c = this.colors;
      const variant = tileHash(x, y, 90) % 3 === 2 ? 2 : tileHash(x, y, 90) % 2;
      const sprite = this.etherSprite(variant);
      const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 91) - 0.5) * 0.2 * T);
      const base2 = y * T + Math.round(T * 0.82) - this.liftAtTile(x, y);
      this.drawLight(cx, base2 - this.px(5), c.riftCore, c.riftGlow, this.px(6));
      this.blitSprite(sprite.buffer, cx - sprite.anchorX, base2 - sprite.anchorY);
      this.drawLight(cx, base2 - this.px(8), c.riftCore, c.riftGlow, this.px(3));
    }
  };

  // src/render/painter/layers/props.js
  var props = {
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
        const base2 = y * T + Math.round(hashUnit(x, y, 952) * (T - 4)) + 3;
        const dry = [Biome.STEPPE, Biome.DESERT, Biome.TUNDRA, Biome.SAVANNA].includes(map.biome[i]);
        if (map.biome[i] === Biome.ETHER_LAND) {
          if (roll < 0.06) items.push({ y: base2, x: cx, draw: () => this.drawShard(cx, base2) });
        } else if (map.biome[i] === Biome.DEAD_LAND) {
          if (roll < 0.05) items.push({ y: base2, x: cx, draw: () => this.drawBones(cx, base2) });
          else if (roll < 0.09) items.push({ y: base2, x: cx, draw: () => this.drawCharredStump(cx, base2) });
        } else if (dry && roll < 0.014) items.push({ y: base2, x: cx, draw: () => this.drawBones(cx, base2) });
        else if (!dry && roll < 6e-3) items.push({ y: base2, x: cx, draw: () => this.drawCrow(cx, base2) });
        else if (roll > 0.994 && roll <= 0.9985) items.push({ y: base2, x: cx, draw: () => this.drawRuin(cx, base2, x, y) });
        else if (roll > 0.9985) items.push({ y: base2, x: cx, draw: () => this.drawGibbet(cx, base2) });
      });
    },
    // Обугленный пень — мёртвое дерево, оставшееся после пожара или скверны.
    drawCharredStump(cx, base2) {
      const dark = packRgb(38, 32, 30), ash = packRgb(78, 70, 66);
      this.drawShadow(cx, base2, this.px(5));
      this.rect(cx - 1, base2 - this.px(3), this.px(3), this.px(3), dark);
      this.put(cx - 1, base2 - this.px(3), ash);
      this.put(cx + this.px(2), base2 - this.px(4), dark);
      this.put(cx - this.px(2), base2 - this.px(2), dark);
      this.put(cx + 1, base2 - this.px(5), dark);
    },
    // Осколок эфирного кристалла, торчащий из земли (без свечения — оно рисуется у ресурса эфира).
    drawShard(cx, base2) {
      const light = packRgb(196, 150, 244), mid = packRgb(140, 78, 214), dark = packRgb(78, 36, 132);
      const height = this.px(3) + (hashUnit(cx, base2, 954) < 0.5 ? 1 : 2);
      this.drawShadow(cx, base2, this.px(3));
      for (let row = 0; row < height; row++) {
        const half = row === 0 ? 0 : 1;
        this.rect(cx - half, base2 - row, half + 1, 1, light);
        this.put(cx + half, base2 - row, dark);
        this.put(cx, base2 - row, mid);
      }
      this.put(cx, base2 - height, light);
    },
    drawBones(cx, base2) {
      const bone = this.colors.bone;
      this.rect(cx - 2, base2 - 1, 5, 1, bone);
      this.put(cx - 1, base2 - 2, bone);
      this.put(cx + 1, base2 - 2, bone);
      this.rect(cx + 3, base2 - 2, 2, 2, bone);
      this.put(cx + 4, base2 - 2, this.colors.crow);
    },
    drawCrow(cx, base2) {
      const dark = this.colors.crow;
      this.rect(cx, base2 - 2, 3, 2, dark);
      this.put(cx - 1, base2 - 2, dark);
      this.put(cx + 1, base2 - 3, dark);
      this.put(cx - 2, base2 - 2, this.colors.stoneMid);
    },
    // Обломки каменной стены и колонна.
    drawRuin(cx, base2, tileX, tileY) {
      const stone = this.moodize(this.colors.chapelStone);
      const dark = shadePacked(stone, -0.25);
      const width = this.px(8);
      for (let dx = 0; dx < width; dx++) {
        const height = 1 + Math.floor(hashUnit(tileX * 7 + dx, tileY, 953) * this.px(4));
        this.rect(cx - (width >> 1) + dx, base2 - height, 1, height, dx % 3 === 0 ? dark : stone);
      }
      this.rect(cx + (width >> 1), base2 - this.px(6), 2, this.px(6), stone);
      this.rect(cx + (width >> 1), base2 - this.px(6), 1, this.px(6), shadePacked(stone, 0.15));
      this.drawShadow(cx, base2, width);
    },
    drawGibbet(cx, base2) {
      const wood = this.packed.trunk;
      const height = this.px(10);
      this.drawShadow(cx, base2, this.px(4));
      this.rect(cx, base2 - height, 1, height, wood);
      this.rect(cx, base2 - height, this.px(5), 1, wood);
      this.put(cx + this.px(4), base2 - height + 1, this.colors.stoneMid);
      this.rect(cx + this.px(4) - 1, base2 - height + 2, 2, this.px(3), this.colors.crow);
    }
  };

  // src/render/painter/layers/relief.js
  var relief = {
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
      const fine2 = new LatticeNoise(W, Math.max(3, this.px(9)), 504 + this.seedSalt);
      const warp = new LatticeNoise(W, Math.max(6, this.px(26)), 503 + this.seedSalt);
      const grain = new LatticeNoise(W, Math.max(3, this.px(6)), 505 + this.seedSalt);
      const crestWeight = 0.2 + 0.4 * sharp;
      const crestPower = 1 + 2.5 * sharp;
      const powerTable = (power) => Float32Array.from({ length: 256 }, (_, n) => Math.pow(n / 255, power));
      const coarseTable = powerTable(crestPower);
      const fineTable = powerTable(1 + 2 * sharp);
      const fineTable2 = powerTable(0.7 + 1.6 * sharp);
      const wrap = this.px(18);
      for (const tile of zone) {
        const tx = tile % size, ty = Math.floor(tile / size);
        for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
          const rowTop = first[gy] * size, rowBottom = second[gy] * size, v = fraction[gy];
          for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
            const u = fraction[gx];
            const a = blurred[rowTop + first[gx]], b = blurred[rowTop + second[gx]];
            const c = blurred[rowBottom + first[gx]], d = blurred[rowBottom + second[gx]];
            const top = a + (b - a) * u;
            const base2 = top + (c + (d - c) * u - top) * v;
            if (base2 < 0.01) continue;
            const shift = Math.round((warp.at(gx, gy) - 0.5) * wrap);
            const wx = Math.min(W - 1, Math.max(0, gx + shift));
            const wy = Math.min(W - 1, Math.max(0, gy - shift));
            const crestA = coarseTable[Math.round((1 - Math.abs(2 * broad.at(wx, wy) - 1)) * 255)];
            const crestB = fineTable[Math.round((1 - Math.abs(2 * fine.at(wx, wy) - 1)) * 255)];
            const crestC = fineTable2[Math.round((1 - Math.abs(2 * fine2.at(wx, wy) - 1)) * 255)];
            const crest = 0.58 * crestA + 0.26 * crestB + 0.16 * crestC;
            const rugged = 1 + (grain.at(gx, gy) - 0.5) * 0.28;
            const h = base2 * (1 - crestWeight + crestWeight * 1.7 * crest) * rugged;
            height[gy * W + gx] = Math.round(clamp(h) * 255);
          }
        }
      }
      this.addPeaks(height, sharp);
      this.reliefCache = { source: map.mountainHeight, tileSize: T, sharpness: sharp, zone, height };
      return this.reliefCache;
    },
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
          const armCount = 3 + tileHash(x, y, 704) % 2;
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
                const value2 = (1 - t) * (1 - across / (armWidth * (1 - 0.55 * t)));
                if (value2 > best) best = value2;
              }
              if (best <= 0) continue;
              const value = Math.round(Math.min(1, tip * 1.15) * (0.15 + 0.85 * best) * 255);
              const k = py * W + px;
              if (value > height[k]) height[k] = value;
            }
          }
        }
      }
    },
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
        ramp: Int32Array.from([-0.3, -0.14, 0.05, 0.2, 0.34], (amount) => shadePacked(rock, amount)),
        // от тени к свету
        snowRamp: Int32Array.from([mixPacked(snowShade, rock, 0.3), snowShade, mixPacked(snow, snowShade, 0.5), snow, snow]),
        foothill: /* @__PURE__ */ new Map(),
        // цвет земли -> цвет земли с проступающим камнем
        lift: this.px(this.options.mountainLift),
        proj: new Int32Array(W),
        // для каждого столбца: куда на экране попал предыдущий пиксель
        face: new Int32Array(W),
        // и каким цветом закрасить «склон» под ним
        valid: new Uint8Array(W)
      };
    },
    // Одна строка карты высот -> экран. Горы поднимаются вверх на lift * высота; пустоты между строками
    // (южные склоны) закрашиваются цветом склона.
    paintReliefRow(relief2, gy) {
      const T = this.tileSize;
      const W = this.width;
      const size = this.map.size;
      const ty = Math.floor(gy / T);
      const { height, ramp, snowRamp, snowLevels, foothill, lift, proj, face, valid } = relief2;
      const pixels = this.pixels;
      const last = W * W - 1;
      for (const tx of relief2.rows[ty]) {
        const snowLevel = snowLevels[ty * size + tx];
        for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
          const k = gy * W + gx;
          const raw = height[k];
          const h = raw / 255;
          const threshold = BAYER[(gy & 3) * 4 + (gx & 3)];
          let color = 0;
          let faceColor = 0;
          if (raw >= 41) {
            const northWest = k > W + 1 ? height[k - W - 1] : raw;
            const southEast = k < last - W - 1 ? height[k + W + 1] : raw;
            const west = k > 0 ? height[k - 1] : raw;
            const east = k < last ? height[k + 1] : raw;
            const crease = ((west + east) * 0.5 - raw) * (3 / 255);
            let tone = Math.round(2 + (southEast - northWest) * (20 / 255) + (h - 0.45) * 2.6 + (threshold - 0.5) * 0.35 - Math.min(1.3, Math.max(0, crease)));
            tone = tone < 0 ? 0 : tone > 4 ? 4 : tone;
            const palette = h + (threshold - 0.5) * 0.08 > snowLevel ? snowRamp : ramp;
            color = palette[tone];
            faceColor = palette[tone > 0 ? tone - 1 : 0];
          } else if (raw >= 13 && threshold < (h - 0.05) / 0.11) {
            const ground = pixels[k];
            let mixed = foothill.get(ground);
            if (mixed === void 0) foothill.set(ground, mixed = mixPacked(ground, ramp[1], 0.65));
            color = faceColor = mixed;
          }
          if (color === 0) {
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
    },
    fillColumn(gx, fromY, toY, color) {
      const W = this.width;
      for (let y = Math.max(0, fromY); y <= toY; y++) this.pixels[y * W + gx] = color;
    },
    // Высоты клеток, дважды размытые по соседям: горы «набухают» за пределы своих клеток, а разброс высот
    // от клетки к клетке сглаживается (иначе на массиве проступает сетка).
    blurMountainHeights() {
      const size = this.map.size;
      const pass = (source) => {
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
    },
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
              if (nx >= 0 && ny >= 0 && nx < size && ny < size && blurred[ny * size + nx] > 0) {
                near = true;
                break;
              }
            }
          }
          if (near) zone.push(y * size + x);
        }
      }
      return zone;
    },
    // С какой относительной высоты лежит снег: чем холоднее (с учётом сезона), тем он ниже.
    snowLevel(tile) {
      const fraction = clamp((0.36 - this.seasonalTemperature(tile)) / 0.3);
      return 0.95 - fraction * 0.6;
    },
    // На сколько пикселей поднята поверхность гор в центре клетки (руда и разломы лежат на ней, а не под ней).
    liftAtTile(x, y) {
      if (!this.reliefHeight || this.map.terrain[this.map.index(x, y)] !== Terrain.MOUNTAIN) return 0;
      const T = this.tileSize;
      const k = (y * T + (T >> 1)) * this.width + x * T + (T >> 1);
      return Math.round(this.reliefHeight[k] / 255 * this.px(this.options.mountainLift));
    }
  };

  // src/render/painter/layers/rivers.js
  var rivers2 = {
    // Ширина реки в пикселях по её уровню (глубине).
    // Ширина реки в клетке по количеству воды: ручей — 2–3 пикселя, большая река у устья — до 14.
    riverWidthAt(i) {
      const flow = this.map.riverFlow[i];
      return Math.max(2, Math.min(this.px(14), Math.round(this.tileSize / 12 * (1 + 0.4 * Math.sqrt(flow)))));
    },
    riverWidth(level) {
      return Math.max(level + 1, this.px([4, 6, 8][level - 1]));
    },
    // Смещение полосы толщиной thickness, чтобы она лежала по центру клетки.
    band(thickness) {
      return Math.round((this.tileSize - thickness) / 2);
    },
    /* Реки рисуем прямо в пиксели фона (а не поверх готовой картинки), чтобы у них была такая же мягкая
       «пиксельная» кромка, как у биомов и берега.
       Сначала строим маску: в каждом пикселе — уровень реки (1..3) или 0. Потом красим её и растушёвываем края дизерингом. */
    paintRivers() {
      const geometry = this.buildRiverGeometry();
      this.riverMask = geometry.mask;
      if (geometry.riverTiles.length === 0) return;
      const { mask, queue, distance, levelNear, solid } = geometry;
      const T = this.tileSize;
      const W = this.width;
      const size = this.map.size;
      const pixels = this.pixels;
      const edgeWidth = Math.max(2, T / this.options.coastSharpness);
      const tileOf = (k) => Math.floor(Math.floor(k / W) / T) * size + Math.floor(k % W / T);
      const iceRiver = (tile) => this.seasonalTemperature(tile) < RIVER_ICE_TEMPERATURE;
      const reachPx = Math.ceil(edgeWidth / 2) + 1;
      for (const k of solid) {
        const shades = iceRiver(tileOf(k)) ? this.packed.ice : this.packed.riverShades;
        pixels[k] = shades[mask[k] - 1];
      }
      for (const k of queue) {
        const d = distance[k];
        const xx = k % W, yy = (k - xx) / W;
        const shades = iceRiver(tileOf(k)) ? this.packed.ice : this.packed.riverShades;
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
    },
    /* Форма рек не зависит от сезона, поэтому считается один раз: маска (уровень реки в каждом пикселе), список
       пикселей кромки с расстоянием до края и список «сердцевины». Кэш сбрасывается при смене карты или параметров резкости. */
    buildRiverGeometry() {
      const map = this.map;
      const key = [this.tileSize, this.options.coastSharpness, this.options.blendSharpness, this.options.roundCoast, this.seedSalt].join("|");
      const cache = this.riverCache;
      if (cache && cache.source === map.river && cache.key === key) return cache;
      const size = map.size;
      const T = this.tileSize;
      const W = this.width;
      const mask = new Uint8Array(W * W);
      const riverTiles = [];
      for (let i = 0; i < map.river.length; i++) {
        if (map.river[i] > 0) riverTiles.push(i);
      }
      const empty = { source: map.river, key, riverTiles, mask, queue: new Int32Array(0), distance: null, levelNear: null, solid: new Int32Array(0) };
      if (riverTiles.length === 0) {
        this.riverCache = empty;
        return empty;
      }
      const wobble = this.px(2);
      const centerOf = (tile) => {
        const x = tile % size, y = Math.floor(tile / size);
        return [x * T + T / 2 + (hashUnit(x, y, 983) - 0.5) * wobble, y * T + T / 2 + (hashUnit(x, y, 984) - 0.5) * wobble];
      };
      const stamp = (cx, cy, width, level) => {
        const radius = width / 2;
        for (let oy = -Math.ceil(radius); oy <= Math.ceil(radius); oy++) {
          for (let ox = -Math.ceil(radius); ox <= Math.ceil(radius); ox++) {
            if (ox * ox + oy * oy > radius * radius + 0.25) continue;
            const x = cx + ox, y = cy + oy;
            if (x < 0 || y < 0 || x >= W || y >= W) continue;
            const k = y * W + x;
            if (!this.waterMask[k] && level > mask[k]) mask[k] = level;
          }
        }
      };
      for (const i of riverTiles) {
        const to = map.riverTo[i];
        if (to === -1) continue;
        const [ax, ay] = centerOf(i);
        let [bx, by] = centerOf(to);
        const toWater = !map.isLand(to);
        if (toWater) {
          bx = (ax + bx) / 2;
          by = (ay + by) / 2;
        }
        const widthFrom = this.riverWidthAt(i);
        const widthTo = toWater ? Math.round(widthFrom * 1.4) : map.river[to] > 0 ? this.riverWidthAt(to) : widthFrom;
        const length = Math.hypot(bx - ax, by - ay) || 1;
        const bend = (hashUnit(i, to, 985) - 0.5) * Math.min(this.px(5), length * 0.8);
        const mx = (ax + bx) / 2 - (by - ay) / length * bend;
        const my = (ay + by) / 2 + (bx - ax) / length * bend;
        const points = [
          ...this.linePoints(Math.round(ax), Math.round(ay), Math.round(mx), Math.round(my)),
          ...this.linePoints(Math.round(mx), Math.round(my), Math.round(bx), Math.round(by))
        ];
        const level = map.river[i];
        points.forEach(([px, py], k) => stamp(px, py, widthFrom + (widthTo - widthFrom) * (k / Math.max(1, points.length - 1)), level));
      }
      const edgeWidth = Math.max(2, T / this.options.coastSharpness);
      const reachPx = Math.ceil(edgeWidth / 2) + 1;
      const distance = new Int8Array(W * W);
      const levelNear = new Uint8Array(W * W);
      const queue = [];
      const at = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= W ? 0 : mask[yy * W + xx];
      const zone = /* @__PURE__ */ new Set();
      for (const i of riverTiles) {
        zone.add(i);
        for (const near of map.neighbors8(i)) zone.add(near);
      }
      const zoneTiles = [...zone];
      for (const i of zoneTiles) {
        const x0 = i % size * T;
        const y0 = Math.floor(i / size) * T;
        for (let yy = y0; yy < y0 + T; yy++) {
          for (let xx = x0; xx < x0 + T; xx++) {
            const k = yy * W + xx;
            const around = Math.max(at(xx - 1, yy), at(xx + 1, yy), at(xx, yy - 1), at(xx, yy + 1));
            if (mask[k] > 0 && (at(xx - 1, yy) === 0 || at(xx + 1, yy) === 0 || at(xx, yy - 1) === 0 || at(xx, yy + 1) === 0)) {
              distance[k] = 1;
              levelNear[k] = mask[k];
              queue.push(k);
            } else if (mask[k] === 0 && around > 0) {
              distance[k] = -1;
              levelNear[k] = around;
              queue.push(k);
            }
          }
        }
      }
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        const d = distance[k];
        const sign = d > 0 ? 1 : -1;
        if (Math.abs(d) >= reachPx) continue;
        const x = k % W, y = (k - x) / W;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const next = ny * W + nx;
          if (distance[next] !== 0 || mask[next] > 0 !== sign > 0) continue;
          distance[next] = d + sign;
          levelNear[next] = levelNear[k];
          queue.push(next);
        }
      }
      const solid = [];
      for (const i of zoneTiles) {
        const x0 = i % size * T, y0 = Math.floor(i / size) * T;
        for (let yy = y0; yy < y0 + T; yy++) {
          for (let xx = x0; xx < x0 + T; xx++) {
            const k = yy * W + xx;
            if (mask[k] > 0 && distance[k] === 0) solid.push(k);
          }
        }
      }
      this.riverCache = { source: map.river, key, riverTiles, mask, queue: Int32Array.from(queue), distance, levelNear, solid: Int32Array.from(solid) };
      return this.riverCache;
    },
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
    },
    /* Переправа: каменный мост (река глубже 1) или брод из камней (ручей).
       Мост всегда перпендикулярен реке, в том числе на диагональных участках и на изгибах:
       1) берём локальное направление течения (из riverTo и, если есть, верхней по течению клетки);
       2) перпендикуляр к нему — это ось моста;
       3) от центра клетки шагаем вдоль оси в обе стороны до настоящего берега (по маске воды);
       4) рисуем настил толстой линией между берегами (Брезенхэм), края — тонкими линиями, брод — камнями. */
    paintCrossing(x, y, i) {
      const map = this.map;
      const size = map.size;
      const T = this.tileSize;
      const W = this.width;
      const c = this.colors;
      const mask = this.riverMask;
      const cx = x * T + T / 2, cy = y * T + T / 2;
      let fx = 0, fy = 0;
      const to = map.riverTo[i];
      if (to !== -1) {
        fx += to % size - x;
        fy += Math.floor(to / size) - y;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const j = ny * size + nx;
          if (map.river[j] > 0 && map.riverTo[j] === i) {
            fx -= dx;
            fy -= dy;
          }
        }
      }
      const flen = Math.hypot(fx, fy);
      let ux = 0, uy = 1;
      if (flen > 0) {
        ux = -fy / flen;
        uy = fx / flen;
      }
      const water = (px, py) => px >= 0 && py >= 0 && px < W && py < W && !!(mask && mask[py * W + px] > 0);
      const bank = Math.max(1, this.px(2));
      const maxReach = Math.max(T * 2, this.px(48));
      const march = (sign) => {
        let waterIn = -1;
        for (let t = 1; t <= maxReach; t++) {
          const px = Math.round(cx + sign * ux * t), py = Math.round(cy + sign * uy * t);
          if (px < 0 || py < 0 || px >= W || py >= W) break;
          if (water(px, py)) {
            if (waterIn < 0) waterIn = t;
          } else if (waterIn >= 0) return t;
        }
        return waterIn >= 0 ? maxReach : -1;
      };
      let ax, ay, bx, by;
      const ra = mask ? march(-1) : -1;
      const rb = mask ? march(1) : -1;
      if (ra >= 0 && rb >= 0) {
        ax = cx - ux * (ra + bank);
        ay = cy - uy * (ra + bank);
        bx = cx + ux * (rb + bank);
        by = cy + uy * (rb + bank);
      } else {
        const half = Math.round(this.riverWidthAt(i) / 2) + bank;
        ax = cx - ux * half;
        ay = cy - uy * half;
        bx = cx + ux * half;
        by = cy + uy * half;
      }
      const band = (x0, y0, x1, y1, thickness, color) => {
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        const half = (thickness - 1) / 2;
        for (let k = 0; k < thickness; k++) {
          const o = k - half;
          const ox = Math.round(nx * o), oy = Math.round(ny * o);
          for (const [px, py] of this.linePoints(Math.round(x0 + ox), Math.round(y0 + oy), Math.round(x1 + ox), Math.round(y1 + oy))) {
            this.put(px, py, color);
          }
        }
      };
      if (map.crossing[i] === 2) {
        const thickness = this.px(5);
        band(ax, ay, bx, by, thickness, c.bridgeDeck);
        band(ax, ay, bx, by, 1, c.bridgeEdge);
      } else {
        const stones = Math.max(2, Math.min(6, Math.round(Math.hypot(bx - ax, by - ay) / this.px(3))));
        for (let k = 0; k < stones; k++) {
          const t = stones === 1 ? 0.5 : k / (stones - 1);
          const px = Math.round(ax + (bx - ax) * t), py = Math.round(ay + (by - ay) * t);
          this.put(px, py, c.stone);
          this.put(px + Math.round(ux), py + Math.round(uy), c.stoneShadow);
        }
      }
    }
  };

  // src/render/painter/layers/roads.js
  var roads2 = {
    roadWidth(level) {
      return Math.max(1, this.px([2, 3, 4][Math.min(3, Math.max(1, level)) - 1]));
    },
    /* Дороги строит генератор (map.roadLinks: из каждой клетки — в какие из 8 сторон идёт дорога, map.roadLevel — насколько
       она наезжена). Здесь каждый отрезок между центрами соседних клеток рисуется слегка извилистой полосой:
       центр клетки смещён случайно, середина отрезка тоже. Сначала мягкая полоса утоптанной земли, потом сама дорога. */
    paintRoads() {
      const map = this.map;
      if (!this.options.roads || !map.roadLinks) return;
      const geometry = this.buildRoadGeometry();
      const c = this.colors;
      const dirt = this.moodize(c.dirt), light = this.moodize(c.dirtLight), mud = this.moodize(c.mud);
      const kinds = [dirt, light, mud];
      const W = this.width;
      const size = map.size;
      const T = this.tileSize;
      const pixels = this.pixels;
      const tileOf = (k) => Math.floor(Math.floor(k / W) / T) * size + Math.floor(k % W / T);
      for (const k of geometry.halo) pixels[k] = mixPacked(pixels[k], dirt, 0.28);
      for (let n = 0; n < geometry.core.length; n++) {
        const k = geometry.core[n];
        let color = kinds[geometry.kind[n]];
        const snow = this.snowCoverage(tileOf(k));
        if (snow > 0) color = mixPacked(color, this.packed.snow, 0.75 * snow);
        pixels[k] = color;
      }
    },
    // Пиксели дорог (не зависят от сезона): мягкая полоса утоптанной земли и сама дорога с тремя оттенками.
    buildRoadGeometry() {
      const map = this.map;
      const key = [this.tileSize, this.seedSalt].join("|");
      const cache = this.roadCache;
      if (cache && cache.source === map.roadLinks && cache.key === key && cache.riverMask === this.riverMask) return cache;
      const size = map.size;
      const T = this.tileSize;
      const W = this.width;
      const relief2 = this.reliefHeight;
      const wobble = this.px(2);
      const halo = /* @__PURE__ */ new Set();
      const core = /* @__PURE__ */ new Map();
      const centerOf = (x, y) => [
        x * T + T / 2 + (hashUnit(x, y, 980) - 0.5) * wobble,
        y * T + T / 2 + (hashUnit(x, y, 981) - 0.5) * wobble
      ];
      const stamp = (cx, cy, width, isHalo) => {
        for (let oy = 0; oy < width; oy++) {
          for (let ox = 0; ox < width; ox++) {
            const x = cx + ox - (width >> 1), y = cy + oy - (width >> 1);
            if (x < 0 || y < 0 || x >= W || y >= W) continue;
            const k = y * W + x;
            if (this.waterMask[k] || this.riverMask && this.riverMask[k] || relief2 && relief2[k] > 40) continue;
            if (isHalo) {
              halo.add(k);
              continue;
            }
            const r = hashUnit(x, y, 975);
            core.set(k, r < 0.2 ? 1 : r < 0.45 ? 2 : 0);
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
          if (!(links & 1 << d)) continue;
          count++;
          const [dx, dy] = ROAD_DIRECTIONS[d];
          const j = (y + dy) * size + x + dx;
          if (j < i) continue;
          const [bx, by] = centerOf(x + dx, y + dy);
          const bend = (hashUnit(i, j, 982) - 0.5) * wobble * 1.6;
          const length = Math.hypot(bx - ax, by - ay) || 1;
          const mx = (ax + bx) / 2 - (by - ay) / length * bend;
          const my = (ay + by) / 2 + (bx - ax) / length * bend;
          const width = this.roadWidth(Math.min(map.roadLevel[i], map.roadLevel[j]));
          const points = [
            ...this.linePoints(Math.round(ax), Math.round(ay), Math.round(mx), Math.round(my)),
            ...this.linePoints(Math.round(mx), Math.round(my), Math.round(bx), Math.round(by))
          ];
          for (const [px, py] of points) stamp(px, py, width + 2, true);
          for (const [px, py] of points) stamp(px, py, width, false);
        }
        if (count !== 2) stamp(Math.round(ax), Math.round(ay), this.roadWidth(map.roadLevel[i]) + 1, false);
      }
      for (const k of core.keys()) halo.delete(k);
      this.roadCache = { source: map.roadLinks, key, riverMask: this.riverMask, halo: Int32Array.from(halo), core: Int32Array.from(core.keys()), kind: Uint8Array.from(core.values()) };
      return this.roadCache;
    }
  };

  // src/render/painter/layers/scene.js
  var scene = {
    /* Все декорации собираем в один список и рисуем по возрастанию «основания» (нижней точки):
       то, что стоит ниже на карте, перекрывает то, что выше, — как в перспективе. Деревья могут свободно
       выходить за границы своей клетки: порядок всё равно будет правильным. */
    // Рисует горы и декорации вместе, строка за строкой сверху вниз: так то, что южнее (ближе к зрителю),
    // перекрывает то, что севернее, — деревья и горы перекрывают друг друга правильно.
    paintScene() {
      const items = this.collectDecorations();
      const relief2 = this.prepareReliefRows();
      let next = 0;
      for (let gy = 0; gy < this.width; gy++) {
        if (relief2) this.paintReliefRow(relief2, gy);
        while (next < items.length && items[next].y <= gy) items[next++].draw();
      }
    },
    // Список декораций, отсортированный по «основанию» (нижней точке).
    collectDecorations() {
      const map = this.map;
      const T = this.tileSize;
      const items = [];
      this.forEachTile((x, y) => {
        const i = map.index(x, y);
        if (map.crossing[i]) this.paintCrossing(x, y, i);
        switch (map.resource[i]) {
          case Resource.WOOD:
            this.collectTrees(items, x, y, i);
            break;
          case Resource.WHEAT:
            items.push({ y: y * T + Math.round(T * 0.6), x: x * T, draw: () => this.drawWheat(x, y) });
            break;
          case Resource.GOLD:
            items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, "gold") });
            break;
          case Resource.IRON:
            items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, "iron") });
            break;
          case Resource.ETHER:
            if (this.mood === "dark") this.emissive.push(() => this.drawEther(x, y));
            else items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawEther(x, y) });
            break;
          case Resource.SETTLEMENT:
            this.collectSettlement(items, x, y, i);
            break;
        }
      });
      if (this.mood === "dark" && this.options.props) this.collectProps(items);
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      return items;
    }
  };

  // src/render/painter/layers/settlements.js
  var settlements2 = {
    /* Поселение — ресурс клетки. Каждая клетка с поселением рисуется 1–4 домиками (число зависит от её уровня) и
       не выходит за свои границы (допуск settlementOverflow, по умолчанию 25%): так по рисунку всегда понятно, в какой
       клетке поселение. Крупные населённые пункты получаются из групп соседних клеток (их ставит генератор): у каждой
       свой уровень, между ними идут дорожки, а в центре самого большого города стоит каменная часовня.
       Раскладка не зависит от сезона и считается один раз. */
    settlementLayout(x, y, i) {
      const map = this.map;
      const cache = this.settlementLayoutCache;
      if (!cache || cache.source !== map.population || cache.tileSize !== this.tileSize || cache.salt !== this.seedSalt) {
        this.settlementLayoutCache = { source: map.population, tileSize: this.tileSize, salt: this.seedSalt, layouts: /* @__PURE__ */ new Map() };
      }
      const layouts = this.settlementLayoutCache.layouts;
      if (!layouts.has(i)) layouts.set(i, this.layoutSettlement(x, y, i));
      return layouts.get(i);
    },
    layoutSettlement(x, y, i) {
      const map = this.map;
      const o = this.options;
      const T = this.tileSize;
      const W = this.width;
      const level = map.settlementLevel[i] || 1;
      const maxLevel = map.options && map.options.settlementMaxLevel || 4;
      const rnd = (n2) => hashUnit(x, y, 1e3 + n2);
      const n = (value) => Math.max(1, this.px(value));
      const share = (level - 1) / Math.max(1, maxLevel - 1);
      const count = clamp(
        Math.round(o.settlementMinHouses + share * (o.settlementMaxHouses - o.settlementMinHouses)),
        o.settlementMinHouses,
        o.settlementMaxHouses
      );
      const left = x * T, top = y * T;
      const slack = Math.round(T * o.settlementOverflow);
      const usable = (px, py) => {
        if (px < 0 || py < 0 || px >= W || py >= W) return false;
        const k = py * W + px;
        return !this.waterMask[k] && !(this.riverMask && this.riverMask[k]) && !(this.reliefHeight && this.reliefHeight[k] > 40);
      };
      const occupied = /* @__PURE__ */ new Set();
      const houses = [];
      const tryPlace = (centerX, baseY, w2, bodyH2, roofH2, kind) => {
        const houseLeft = Math.round(centerX - w2 / 2);
        const base2 = Math.round(baseY);
        const bodyTop = base2 - bodyH2;
        if (houseLeft < left - slack || houseLeft + w2 > left + T + slack || base2 > top + T + slack || bodyTop < top - slack) return false;
        for (let yy = bodyTop - roofH2; yy <= base2; yy++) {
          for (let xx = houseLeft; xx < houseLeft + w2; xx++) {
            if (!usable(xx, yy) || occupied.has(yy * W + xx)) return false;
          }
        }
        for (let yy = bodyTop - roofH2; yy <= base2; yy++) {
          for (let xx = houseLeft; xx < houseLeft + w2; xx++) occupied.add(yy * W + xx);
        }
        houses.push({ x: houseLeft + (w2 >> 1), base: base2, w: w2, bodyH: bodyH2, roofH: roofH2, kind, roll: rnd(10 + houses.length) });
        return true;
      };
      const columns = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const rows = Math.ceil(count / columns);
      const slots = [];
      for (let k = 0; k < count; k++) {
        const column = k % columns, row = Math.floor(k / columns);
        const inRow = Math.min(columns, count - row * columns);
        slots.push([
          (column + 0.5 + (columns - inRow) / 2) / columns,
          rows === 1 ? 0.8 : 0.5 + row * 0.46 / (rows - 1)
        ]);
      }
      const w = count === 1 ? n(6) : n(5);
      const bodyH = count === 1 ? n(4) : n(3);
      const roofH = count >= 3 ? n(2) : n(3);
      const group = map.settlementGroups[map.settlementGroup[i]];
      const isCenter = group && group.tile === i;
      const nudges = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [0, 1], [-1, -1], [1, -1]];
      slots.forEach(([fx, fy], k) => {
        const chapel = k === 0 && level === maxLevel && isCenter && count >= 3;
        const kind = chapel ? "tower" : level === 1 && rnd(30 + k) < 0.4 ? "hut" : "house";
        const size = chapel ? [n(4), n(5), n(5)] : kind === "hut" ? [Math.max(2, w - 1), Math.max(2, bodyH - 1), Math.max(2, roofH - 1)] : [w, bodyH, roofH];
        const stagger = (k & 1 ? 1 : -1) * n(1);
        const jitterX = Math.round((rnd(40 + k) - 0.5) * n(5)) + stagger;
        const jitterY = Math.round((rnd(50 + k) - 0.5) * n(4)) + stagger;
        for (const [nx, ny] of nudges) {
          if (tryPlace(left + fx * T + jitterX + nx * n(1), top + fy * T + jitterY + ny * n(1), ...size, kind)) return;
        }
      });
      for (let attempt = 0; houses.length === 0 && attempt < 16; attempt++) {
        tryPlace(left + T / 2 + (rnd(70 + attempt) - 0.5) * n(6), top + T * 0.8 + (rnd(90 + attempt) - 0.5) * n(4), n(5), n(3), n(3), "house");
      }
      const cx = left + T / 2;
      const cy = top + T * 0.65;
      let street = [[cx, cy], [cx, cy]];
      const links = map.roadLinks[i];
      for (let d = 0; d < 8 && links; d++) {
        if (links & 1 << d) {
          const [dx, dy] = ROAD_DIRECTIONS[d];
          street = [[cx, cy], [cx + dx * T / 2, cy + dy * T / 2]];
          break;
        }
      }
      const blobs = [[cx, cy, n(7)]];
      for (const house of houses) blobs.push([house.x, house.base - house.bodyH / 2, n(4)]);
      return { level, houses, blobs, street };
    },
    // Утоптанная земля вокруг домов и улица между ними (на земле, до деревьев и границ).
    paintSettlementGround() {
      const map = this.map;
      if (!this.options.settlements || map.settlements.length === 0) return;
      const size = map.size;
      const c = this.colors;
      const dirt = this.moodize(c.dirt), light = this.moodize(c.dirtLight), mud = this.moodize(c.mud);
      const streetColors = [dirt, light, mud];
      const pixels = this.pixels;
      for (const settlement of map.settlements) {
        const tile = settlement.tile;
        const ground = this.settlementGround(this.settlementLayout(tile % size, Math.floor(tile / size), tile));
        const snow = this.snowCoverage(tile);
        const snowMix = (color) => snow > 0 ? mixPacked(color, this.packed.snow, 0.7 * snow) : color;
        for (let n = 0; n < ground.blobIndex.length; n++) {
          const k = ground.blobIndex[n];
          pixels[k] = mixPacked(pixels[k], snowMix(ground.blobMud[n] ? mud : dirt), ground.blobStrength[n] / 255);
        }
        for (let n = 0; n < ground.streetIndex.length; n++) {
          pixels[ground.streetIndex[n]] = snowMix(streetColors[ground.streetKind[n]]);
        }
      }
    },
    // Пиксели земли поселения (не зависят от сезона): пятна вокруг домов и улица. Считаются один раз для поселения.
    settlementGround(layout) {
      if (layout.ground) return layout.ground;
      const W = this.width;
      const relief2 = this.reliefHeight;
      const usable = (k) => !this.waterMask[k] && !(this.riverMask && this.riverMask[k]) && !(relief2 && relief2[k] > 40);
      const strengths = /* @__PURE__ */ new Map();
      const mudPixels = /* @__PURE__ */ new Set();
      for (const [bx2, by2, radius] of layout.blobs) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const distance = Math.hypot(dx, dy);
            const px = Math.round(bx2 + dx), py = Math.round(by2 + dy);
            if (distance > radius || px < 0 || py < 0 || px >= W || py >= W) continue;
            const k = py * W + px;
            if (!usable(k) || hashUnit(px, py, 977) < 0.12) continue;
            const strength = Math.round(255 * 0.55 * Math.pow(1 - distance / radius, 0.7));
            if (strength > (strengths.get(k) || 0)) strengths.set(k, strength);
            if (hashUnit(px, py, 978) < 0.3) mudPixels.add(k);
          }
        }
      }
      const street = /* @__PURE__ */ new Map();
      const [[ax, ay], [bx, by]] = layout.street;
      const width = Math.max(1, this.px(2));
      for (const [px, py] of this.linePoints(Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by))) {
        for (let oy = 0; oy < width; oy++) {
          for (let ox = 0; ox < width; ox++) {
            const x = px + ox - (width >> 1), y = py + oy - (width >> 1);
            if (x < 0 || y < 0 || x >= W || y >= W || !usable(y * W + x)) continue;
            const r = hashUnit(x, y, 975);
            street.set(y * W + x, r < 0.2 ? 1 : r < 0.45 ? 2 : 0);
          }
        }
      }
      const blobKeys = [...strengths.keys()];
      layout.ground = {
        blobIndex: Int32Array.from(blobKeys),
        blobStrength: Uint8Array.from(blobKeys, (k) => strengths.get(k)),
        blobMud: Uint8Array.from(blobKeys, (k) => mudPixels.has(k) ? 1 : 0),
        streetIndex: Int32Array.from(street.keys()),
        streetKind: Uint8Array.from(street.values())
      };
      return layout.ground;
    },
    collectSettlement(items, x, y, i) {
      const layout = this.settlementLayout(x, y, i);
      const snow = this.snowCoverage(i);
      for (const part of layout.houses) {
        const sprite = this.houseSprite(part, part.roll, snow);
        items.push({ y: part.base, x: part.x, draw: () => this.drawHouse(sprite, part.x, part.base, part, layout.level) });
      }
    },
    // Лёгкое приглушение цвета построек в тёмном стиле: они должны оставаться светлее фона.
    houseColor(color) {
      return this.mood === "dark" ? shadePacked(mixPacked(color, packRgb(128, 128, 128), 0.1), -0.06) : color;
    },
    // Рисунок здания (кэшируется): стены, крыша, дверь, контур.
    houseSprite(part, roll, snow) {
      if (!this.spriteCache) this.spriteCache = /* @__PURE__ */ new Map();
      const key = [part.kind, part.w, part.bodyH, part.roofH, Math.floor(roll * 4), Math.round(snow * 3), this.mood, this.season.name].join("|");
      const cached = this.spriteCache.get(key);
      if (cached) return cached;
      const c = this.colors;
      const tower = part.kind === "tower";
      const wall = this.houseColor(tower ? c.chapelStone : [c.wallA, c.wallB][Math.floor(roll * 2) % 2]);
      let roof = this.houseColor(part.kind === "hut" ? c.thatch : tower ? c.roofD : [c.roofA, c.roofB, c.roofC, c.roofD][Math.floor(roll * 4) % 4]);
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
      buffer.rect(left, top, 1, part.bodyH, shadePacked(wall, 0.14));
      buffer.rect(left + part.w - 1, top, 1, part.bodyH, shadePacked(wall, -0.22));
      buffer.rect(left, top + part.bodyH - 1, part.w, 1, shadePacked(wall, -0.18));
      if (tower) {
        for (let y = top + 1; y < top + part.bodyH - 1; y += 2) buffer.rect(left + 1, y, part.w - 2, 1, shadePacked(wall, -0.1));
      }
      for (let row = 0; row < part.roofH; row++) {
        const half = (part.w + 2 * overhang) / 2 * (row + 1) / part.roofH;
        const y = pad + row;
        for (let x = Math.round(centerX - half + 0.5); x <= Math.round(centerX + half - 0.5); x++) {
          buffer.put(x, y, x < centerX ? shadePacked(roof, 0.14) : shadePacked(roof, -0.2));
        }
      }
      buffer.rect(left + (part.w >> 1), top + part.bodyH - Math.min(2, part.bodyH - 1), 1, Math.min(2, part.bodyH - 1), c.plank);
      if (this.options.spriteOutline) buffer.outline(c.outline);
      const sprite = {
        buffer,
        width,
        height,
        anchorX: Math.round(centerX),
        anchorY: height - pad - 1,
        windows: part.bodyH >= 3 ? [[left + (tower ? 1 : 1), top + 1]] : [],
        chimney: !tower && part.kind === "house" && roll > 0.4 ? [Math.round(centerX) + 1, pad - 1] : null
      };
      this.spriteCache.set(key, sprite);
      return sprite;
    },
    drawHouse(sprite, x, base2, part, level) {
      const c = this.colors;
      const left = x - sprite.anchorX;
      const top = base2 - sprite.anchorY;
      this.drawBuildingShadow(x, base2, part.w, part.bodyH + part.roofH);
      this.blitSprite(sprite.buffer, left, top);
      for (const [wx, wy] of sprite.windows) {
        const lightX = left + wx, lightY = top + wy;
        this.emissive.push(() => this.drawLight(lightX, lightY, c.window, c.fire, this.mood === "dark" ? 2 : 1));
      }
      if (sprite.chimney && level >= 3) {
        const smokeX = left + sprite.chimney[0], smokeY = top + sprite.chimney[1];
        for (let s = 1; s <= 3; s++) this.blend(smokeX + s % 2, smokeY - s * 2, packRgb(175, 175, 180), 0.45 - 0.1 * s);
      }
    },
    // Тень здания: пятно под ним и тень, падающая вправо-вниз (свет слева сверху, как у деревьев и гор).
    drawBuildingShadow(x, base2, width, height) {
      const half = Math.ceil(width / 2) + 1;
      const length = Math.max(2, Math.round(height * 0.55));
      for (let dx = -half; dx <= half + length; dx++) {
        const edge = dx > half ? 1 - (dx - half) / (length + 1) : 1;
        this.blend(x + dx, base2 + 1, BLACK, 0.5 * edge);
        this.blend(x + dx, base2 + 2, BLACK, 0.3 * edge);
        if (dx > -half + 1 && dx < half + length - 1) this.blend(x + dx, base2, BLACK, 0.2 * edge);
      }
    }
  };

  // src/render/painter/layers/shores.js
  var shores = {
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
      const wet = Math.max(1, this.px(2));
      const reach = Math.max(3, Math.ceil(wet + this.tileSize / this.options.coastSharpness));
      const distance = new Uint8Array(W * W);
      const kind = new Uint8Array(W * W);
      const queue = [];
      const around = new Int32Array(4);
      const neighborsOf = (k) => {
        const x = k % W;
        let n = 0;
        if (x > 0) around[n++] = k - 1;
        if (x < W - 1) around[n++] = k + 1;
        if (k >= W) around[n++] = k - W;
        if (k < W * W - W) around[n++] = k + W;
        return n;
      };
      const tileOf = (k) => Math.floor(k / W / T) * size + Math.floor(k % W / T);
      const typeAt = (gx, gy) => this.shoreTypeAt(gx, gy);
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const i = ty * size + tx;
          const type = map.shore[i];
          if (!type || map.river[i] || !map.isLand(i)) continue;
          for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
            for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
              const k = gy * W + gx;
              if (waterMask[k]) continue;
              const touchesWater = gx > 0 && waterMask[k - 1] || gx < W - 1 && waterMask[k + 1] || gy > 0 && waterMask[k - W] || gy < W - 1 && waterMask[k + W];
              if (touchesWater) {
                distance[k] = 1;
                kind[k] = typeAt(gx, gy);
                queue.push(k);
              }
            }
          }
        }
      }
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        if (distance[k] >= reach) continue;
        const count = neighborsOf(k);
        for (let a = 0; a < count; a++) {
          const next = around[a];
          if (waterMask[next] || distance[next]) continue;
          distance[next] = distance[k] + 1;
          kind[next] = typeAt(next % W, (next - next % W) / W);
          queue.push(next);
        }
      }
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
      const foam = [];
      for (const k of queue) {
        if (distance[k] !== 1 || kind[k] !== Shore.BEACH && kind[k] !== Shore.ROCKY) continue;
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
        if (mark >= 20) {
          if (threshold < 0.4) pixels[k] = mixPacked(pixels[k], WHITE, 0.16);
        } else if (threshold < 0.85) pixels[k] = mixPacked(pixels[k], WHITE, mark === 10 + Shore.BEACH ? 0.45 : 0.3);
      }
      this.paintCliffs();
    },
    /* Тип берега в пикселе: поле «воды», размытое на уровне клеток (как при скруглении берега), даёт долю воды
       в округе; где воды больше — ближе к берегу. Так границы пляж/галька/утёс идут вдоль скруглённой линии
       берега, а не по границам клеток. */
    shoreTypeAt(gx, gy) {
      const map = this.map;
      const size = map.size;
      const T = this.tileSize;
      const field = this.coastField();
      if (!field) return map.shore[Math.floor(gy / T) * size + Math.floor(gx / T)];
      const axis = this.axis;
      const { first, second, fraction } = axis;
      const u = fraction[gx], v = fraction[gy];
      const a = field[first[gy] * size + first[gx]], b = field[first[gy] * size + second[gx]];
      const c = field[second[gy] * size + first[gx]], d = field[second[gy] * size + second[gx]];
      const topRow = a + (b - a) * u;
      const fv = topRow + (c + (d - c) * u - topRow) * v;
      const cx = Math.floor(gx / T), cy = Math.floor(gy / T);
      let beach = 0, rocky = 0, cliff = 0, sum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const tx = cx + dx, ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
          const type = map.shore[ty * size + tx];
          if (!type) continue;
          const weight = Math.exp(-(dx * dx + dy * dy) / 3) * fv;
          if (type === Shore.CLIFF) cliff += weight;
          else if (type === Shore.ROCKY) rocky += weight;
          else beach += weight;
          sum += weight;
        }
      }
      if (sum <= 0) return Shore.ROCKY;
      if (cliff > sum * 0.5) return Shore.CLIFF;
      if (rocky > sum * 0.5) return Shore.ROCKY;
      if (beach > sum * 0.4) return Shore.BEACH;
      return cliff >= rocky && cliff >= beach ? Shore.CLIFF : rocky >= beach ? Shore.ROCKY : Shore.BEACH;
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
              if (this.shoreTypeAt(gx, gy) !== Shore.CLIFF) continue;
              if (k + W < W * W && waterMask[k + W]) {
                pixels[k] = shadePacked(pixels[k], 0.12);
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
              } else if (gx > 0 && waterMask[k - 1] || gx < W - 1 && waterMask[k + 1]) {
                pixels[k] = shadePacked(pixels[k], -0.2);
              }
            }
          }
        }
      }
    }
  };

  // src/render/painter/layers/texture.js
  var texture = {
    paintTexture() {
      const map = this.map;
      const T = this.tileSize;
      const speckCount = Math.round(T * T / 16);
      const specks = this.speckLayout(speckCount);
      this.forEachTile((x, y) => {
        const i = map.index(x, y);
        const isLand = map.isLand(i);
        if (map.terrain[i] !== Terrain.MOUNTAIN) {
          const base2 = i * speckCount;
          for (let k = 0; k < speckCount; k++) {
            const code = specks[base2 + k];
            const at = (y * T + (code >> 9)) * this.width + x * T + (code >> 1 & 255);
            this.pixels[at] = speckColor(this.pixels[at], code & 1);
          }
        }
        if (!isLand) {
          if (tileHash(x, y, 9) % 6 === 0) {
            for (let dx = 0; dx < this.px(3); dx++) this.blend(x * T + this.px(3) + dx, y * T + this.px(5), WHITE, 0.25);
          }
        } else if (this.view === "terrain") {
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
            h ^= h << 13;
            h ^= h >>> 17;
            h ^= h << 5;
            const r = h >>> 0;
            layout[(y * size + x) * speckCount + k] = (r >>> 8) % T << 9 | r % T << 1 | r >>> 20 & 1;
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
        this.put(x * T + h % T, y * T + (h >>> 8) % T, hexToPacked(colors[h % colors.length]));
      }
    },
    // Трава: пучки стебельков. Чем плодороднее и влажнее место, тем их больше; цвет — оттенки земли под ними.
    paintTufts(x, y, i) {
      const map = this.map;
      if (map.terrain[i] !== Terrain.PLAIN || map.river[i] || map.shore[i] === Shore.BEACH || map.resource[i] === Resource.SETTLEMENT || map.roadLevel[i] > 0) return;
      const moisture = map.moisture[i];
      let count;
      switch (map.biome[i]) {
        case Biome.GRASSLAND:
          count = 1 + 7 * Math.pow(moisture, 1.3);
          break;
        case Biome.TAIGA:
          count = 1 + 3 * moisture;
          break;
        case Biome.SAVANNA:
          count = 2 + 3 * moisture;
          break;
        case Biome.STEPPE:
          count = 1 + 2 * moisture;
          break;
        case Biome.TUNDRA:
          count = 0.4 + 1.2 * moisture;
          break;
        default:
          return;
      }
      count = Math.round(count * this.options.grassDensity * (map.resource[i] === Resource.WOOD ? 0.6 : 1));
      const T = this.tileSize;
      const W = this.width;
      for (let n = 0; n < count; n++) {
        const h = tileHash(x, y, 400 + n);
        const bx = x * T + h % T;
        const by = y * T + (h >>> 8) % T;
        const ground = this.pixels[Math.min(by, W - 1) * W + Math.min(bx, W - 1)];
        const dark = shadeFast(ground, -56);
        const light = shadeFast(ground, 46);
        const blades = 2 + (h >>> 16) % 2;
        const lean = (h >>> 18) % 3 - 1;
        for (let b = 0; b < blades; b++) {
          const bladeHeight = this.px(2) + 1 + (h >>> 20 + b & 1);
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
      if (this.waterMask[k] || this.riverMask && this.riverMask[k]) return;
      this.pixels[k] = color;
    }
  };

  // src/render/painter/layers/tile-colors.js
  var tileColors = {
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
      const terrain2 = map.terrain[i];
      const isWater = terrain2 < Terrain.PLAIN;
      if (this.view === "temperature") {
        const hue = 215 - 215 * map.temperature[i];
        return hslToPacked(hue, 60, isWater ? 36 : 52);
      }
      if (isWater) return this.waterColor(i);
      if (this.view === "regions") return hslToPacked(map.regionId[i] * 137.5 % 360, 45, 58);
      if (terrain2 === Terrain.MOUNTAIN) return this.packed.rock;
      return this.groundColor(i);
    },
    // Вода темнее по мере удаления от берега — и в океане, и в озёрах. В холод у берега появляется лёд.
    waterColor(i) {
      const depth = this.map.waterDepth[i];
      const temperature = this.seasonalTemperature(i);
      if (this.view === "terrain" && temperature < ICE_TEMPERATURE) {
        const freezeDepth = Math.round((ICE_TEMPERATURE - temperature) / ICE_TEMPERATURE * 10);
        if (depth > 0 && depth <= freezeDepth) return this.packed.ice[depth <= 3 ? 0 : depth <= 6 ? 1 : 2];
      }
      return this.packed.waterShades[waterShadeIndex(depth)];
    },
    // Цвет земли: цвет биома в этом сезоне, с поправкой на плодородие, а в холод — с примесью снега.
    groundColor(i) {
      const base2 = this.packed.biome[this.map.biome[i]];
      if (this.view !== "terrain") return base2;
      const tinted = this.fertilityTint(i, base2);
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
      const wet = this.nearRiver(i) ? 0.3 : 0;
      const moisture = Math.round(Math.min(1, this.map.moisture[i] + wet) * 5) / 5;
      return moisture > 0.5 ? shadePacked(color, -0.16 * (moisture - 0.5) / 0.5) : mixPacked(color, this.colors.hay, 0.32 * (0.5 - moisture) / 0.5);
    },
    // Цвет, осветлённый или затемнённый на step ступеней (-2..2).
    shadeStep(color, step) {
      return shadeFast(color, STEP_AMOUNTS[step + 2]);
    }
  };

  // src/render/painter/layers/vegetation.js
  var vegetation = {
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
        const base2 = Math.round(y * T + fy * T + (hashUnit(x, y, 50 + k) - 0.5) * 0.25 * T);
        const pick = tileHash(x, y, 60 + k);
        items.push({
          y: base2,
          x: cx,
          draw: () => conifer ? this.drawConifer(cx, base2, pick, withSnow) : this.drawBroadleaf(cx, base2, pick)
        });
      }
    },
    // Овальная тень под деревом.
    drawShadow(cx, base2, width) {
      const half = Math.floor(width / 2);
      for (let dx = -half; dx <= half; dx++) this.blend(cx + dx, base2, BLACK, 0.22);
      for (let dx = -half + 1; dx <= half - 1; dx++) this.blend(cx + dx, base2 + 1, BLACK, 0.12);
    },
    // Лиственное дерево: округлая крона со светом сверху-слева, летом зелёное, весной в цвету, осенью рыже-золотое.
    drawBroadleaf(cx, base2, pick) {
      const pal = this.pal;
      if (pal.bareTrees || hashUnit(cx, base2, 79) < (pal.deadTreeChance || 0)) {
        this.drawBareTree(cx, base2, pick);
        return;
      }
      const width = this.px(7) + pick % 2;
      const height = width;
      const trunkHeight = this.px(2) + 1;
      const trunkWidth = width >= 7 ? 2 : 1;
      const color = hexToPacked(pal.broadleaf[pick % pal.broadleaf.length]);
      const light = shadePacked(color, 0.26);
      const highlight = shadePacked(color, 0.44);
      const dark = shadePacked(color, -0.26);
      const deep = shadePacked(color, -0.46);
      const top = base2 - trunkHeight - height + 2;
      this.drawShadow(cx, base2, width);
      this.rect(cx - (trunkWidth >> 1), base2 - trunkHeight, trunkWidth, trunkHeight, this.packed.trunk);
      this.put(cx - (trunkWidth >> 1) - 1, base2 - 1, this.packed.trunk);
      this.put(cx + (trunkWidth >> 1), base2 - 1, this.packed.trunk);
      for (let row = 0; row < height; row++) {
        const t = (row + 0.5) / height * 2 - 1;
        const half = width / 2 * Math.sqrt(1 - t * t);
        const x0 = Math.round(cx - half);
        const x1 = Math.round(cx + half) - 1;
        for (let x = x0; x <= x1; x++) {
          const lean = x - cx + (row - height / 2);
          let shade = lean < -width * 0.22 ? light : lean > width * 0.3 ? deep : lean > width * 0.1 ? dark : color;
          if (hashUnit(x, top + row, 77) < 0.14) shade = shade === light || shade === highlight ? color : dark;
          this.put(x, top + row, shade);
        }
      }
      this.put(cx - 1, top + 1, highlight);
      this.put(cx - 2, top + 2, highlight);
      if (width >= 7) this.put(cx, top + 1, light);
      if (pal.blossom && pick % 3 === 0) {
        const blossom = hexToPacked(pal.blossom);
        this.put(cx - 2, top + 2, blossom);
        this.put(cx + 1, top + 3, blossom);
        this.put(cx - 1, top + 5, blossom);
      }
    },
    // Голое дерево (зима): ствол и несколько веток.
    drawBareTree(cx, base2, pick) {
      const trunk = this.packed.trunk;
      const bark = shadePacked(this.packed.trunk, -0.28);
      const height = this.px(8);
      this.drawShadow(cx, base2, this.px(5));
      this.rect(cx, base2 - height, 1, height, trunk);
      this.put(cx - 1, base2 - height + 2, bark);
      this.put(cx - 1, base2 - 1, trunk);
      this.put(cx + 1, base2 - 1, trunk);
      const side = pick % 2 ? 1 : -1;
      for (let k = 1; k <= this.px(3); k++) {
        this.put(cx - k, base2 - height + k + 1, trunk);
        this.put(cx + k, base2 - height + k + 1 + (side > 0 ? 1 : 0), trunk);
      }
      this.put(cx + side, base2 - height - 1, trunk);
      if (this.mood === "dark") {
        this.put(cx + side * 2, base2 - height + 2, trunk);
        this.put(cx - side * 2, base2 - height + 4, trunk);
        this.put(cx + side, base2 - height + 5, trunk);
      } else {
        this.put(cx + side * 2, base2 - height + 3, trunk);
        this.put(cx + side * 3, base2 - height + 2, trunk);
        this.put(cx - side * 2, base2 - height + 5, trunk);
      }
    },
    // Ель: ярусы всё шире книзу; круглый год зелёная, зимой со снегом на лапах.
    drawConifer(cx, base2, pick, withSnow) {
      const pal = this.pal;
      const color = hexToPacked(pal.conifer[pick % pal.conifer.length]);
      const light = shadePacked(color, 0.24);
      const dark = shadePacked(color, -0.34);
      const deep = shadePacked(color, -0.5);
      const height = this.px(10) + pick % 2;
      const maxHalf = Math.max(2, Math.round(this.px(6) / 2));
      const trunkHeight = this.px(2);
      const top = base2 - trunkHeight - height + 1;
      this.drawShadow(cx, base2, this.px(6));
      this.rect(cx, base2 - trunkHeight, 1, trunkHeight, this.packed.trunk);
      this.put(cx - 1, base2 - 1, this.packed.trunk);
      this.put(cx + 1, base2 - 1, this.packed.trunk);
      for (let row = 0; row < height; row++) {
        const tierRow = row % 3;
        const half = Math.min(maxHalf, Math.floor(row * 0.34 + tierRow * 0.3 + 0.4));
        for (let dx = -half; dx <= half; dx++) {
          let shade = dx < 0 ? light : dx > 0 ? dx === half ? deep : dark : color;
          if (withSnow && tierRow === 0) shade = dx > 0 ? this.packed.snowShade : this.packed.snow;
          this.put(cx + dx, top + row, shade);
        }
      }
      this.put(cx, top, withSnow ? this.packed.snow : light);
    },
    // Поле: весной ростки, летом растёт, осенью спелые колосья, зимой стерня.
    drawWheat(x, y) {
      const pal = this.pal;
      const T = this.tileSize;
      const stalk = hexToPacked(pal.wheatStalk);
      const head = hexToPacked(pal.wheatTop);
      for (let k = 0; k < 8; k++) {
        const h = tileHash(x, y, 300 + k);
        const sx = x * T + h % T;
        const sy = y * T + this.px(4) + (h >>> 8) % (T - this.px(4));
        const variation = (h >>> 16) % 2;
        if (pal.wheatStage === "bare") {
          this.rect(sx, sy - 2, 1, 2, stalk);
          continue;
        }
        const stalkHeight = (pal.wheatStage === "sprout" ? this.px(2) : pal.wheatStage === "growing" ? this.px(4) : this.px(5)) + variation;
        this.rect(sx, sy - stalkHeight, 1, stalkHeight, stalk);
        this.put(sx, sy - stalkHeight, head);
        if (pal.wheatStage === "ripe") this.put(sx, sy - stalkHeight - 1, head);
      }
    }
  };

  // src/render/painter/map-painter.js
  var MapPainter = class {
    constructor(map, options = {}) {
      this.map = map;
      this.options = {
        tileSize: 12,
        blendSharpness: 1.5,
        // насколько резко смешиваются соседние биомы (больше — резче, 1 — очень мягко)
        coastSharpness: 1.5,
        // то же для границы воды и суши — а также для берегов (песок, галька) и краёв рек
        roundCoast: 1,
        // 0..3: насколько сильно скругляется береговая линия (0 — берег идёт по границам клеток)
        peakSharpness: 0.75,
        // 0..1: острота гор (0 — округлые холмы-«губка», 1 — острые пики и гребни)
        mountainLift: 14,
        // на сколько пикселей (для клетки 12×12) самые высокие горы поднимаются вверх, к северу
        hillStrength: 0.6,
        // 0..1: заметность холмов и впадин на равнинах (0 — выключить)
        ravineDensity: 0.5,
        // 0..1: сколько оврагов в сухих местах (0 — нет)
        grassDensity: 1,
        // густота пучков травы (множитель)
        shores: true,
        // пляжи, каменистые берега и утёсы
        settlements: true,
        // поселения (домики)
        roads: true,
        // дороги между поселениями
        settlementMinHouses: 1,
        // домиков в самом маленьком поселении
        settlementMaxHouses: 3,
        // домиков в клетке высшего уровня (если они помещаются)
        settlementOverflow: 0.25,
        // на сколько (доля клетки) основание дома может выйти за границу своей клетки
        spriteOutline: false,
        // тёмный контур вокруг построек, руд и эфира (в стиле dark fantasy выключен)
        grade: true,
        // в тёмном стиле: цветокоррекция, туман, виньетка
        vignette: 0.35,
        // затемнение к краям карты в тёмном стиле (0 — нет)
        props: true,
        // в тёмном стиле: кости, вороны, развалины, виселицы
        ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== void 0))
        // undefined не должен затирать значения по умолчанию
      };
      this.tileSize = this.options.tileSize;
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.colors = {};
      for (const [name, hex] of Object.entries(COLORS)) this.colors[name] = hexToPacked(hex);
    }
    /* ---------- Главный метод ---------- */
    // view: 'terrain' | 'temperature' | 'regions'. Возвращает холст с готовой картой.
    paint({ view, seasonName, showBorders, mood }) {
      this.view = view;
      this.mood = mood === "dark" ? "dark" : "light";
      this.season = (this.mood === "dark" ? DARK_SEASONS : SEASONS)[seasonName];
      this.pal = this.season.palette;
      this.packed = packPalette(this.pal);
      this.seedSalt = (this.map.seed | 0) * 13 % 1e5;
      this.width = this.map.size * this.tileSize;
      this.canvas.width = this.width;
      this.canvas.height = this.width;
      const image = this.ctx.createImageData(this.width, this.width);
      this.pixels = new Int32Array(image.data.buffer);
      this.waterMask = new Uint8Array(this.width * this.width);
      this.riverMask = null;
      this.relief = null;
      this.reliefHeight = null;
      this.shadeCache = /* @__PURE__ */ new Map();
      this.tuftCache = /* @__PURE__ */ new Map();
      this.emissive = [];
      this.buildAxisTables();
      const terrain2 = view === "terrain";
      this.paintBase();
      this.smoothCoast();
      this.decorateWaterMask();
      if (terrain2) {
        this.relief = this.buildReliefHeights();
        this.reliefHeight = this.relief.height;
        this.paintHills();
        this.paintShores();
        this.paintRivers();
        this.paintRoads();
        this.paintSettlementGround();
      }
      this.paintTexture();
      if (showBorders) this.paintRegionBorders();
      if (terrain2) this.paintScene();
      if (terrain2 && this.mood === "dark" && this.options.grade) this.applyGrading();
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
      for (; ; ) {
        points.push([x0, y0]);
        if (x0 === x1 && y0 === y1) break;
        const doubled = 2 * error;
        if (doubled >= dy) {
          error += dy;
          x0 += sx;
        }
        if (doubled <= dx) {
          error += dx;
          y0 += sy;
        }
      }
      return points;
    }
  };
  Object.assign(MapPainter.prototype, base, tileColors, hills, shores, relief, rivers2, texture, grading, props, roads2, settlements2, minerals, borders, scene, vegetation);

  // src/render/renderer/camera.js
  var camera = {
    // Показать всю карту целиком по центру.
    fitToView() {
      const zoom = Math.min(this.canvas.width, this.canvas.height) / this.worldSize;
      this.camera.zoom = clamp(zoom, this.options.minZoom, this.options.maxZoom);
      this.centerOn(this.worldSize / 2, this.worldSize / 2);
    },
    centerOn(worldX, worldY) {
      this.camera.x = worldX - this.canvas.width / 2 / this.camera.zoom;
      this.camera.y = worldY - this.canvas.height / 2 / this.camera.zoom;
      this.clampCamera();
      this.draw();
    },
    // Не даём камере улететь слишком далеко: за краем карты можно видеть не больше половины экрана.
    clampCamera() {
      const cam = this.camera;
      const viewW = this.canvas.width / cam.zoom;
      const viewH = this.canvas.height / cam.zoom;
      cam.x = clamp(cam.x, -viewW / 2, this.worldSize - viewW / 2);
      cam.y = clamp(cam.y, -viewH / 2, this.worldSize - viewH / 2);
    },
    // Сдвиг камеры на dx, dy экранных пикселей (карта «едет» вслед за пальцем/мышью).
    panBy(dx, dy) {
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.clampCamera();
      this.draw();
    },
    // Зум так, чтобы точка под курсором осталась на месте.
    zoomAt(screenX, screenY, factor) {
      const cam = this.camera;
      const worldBefore = this.screenToWorld(screenX, screenY);
      cam.zoom = clamp(cam.zoom * factor, this.options.minZoom, this.options.maxZoom);
      cam.x = worldBefore.x - screenX / cam.zoom;
      cam.y = worldBefore.y - screenY / cam.zoom;
      this.clampCamera();
      this.draw();
    },
    screenToWorld(screenX, screenY) {
      return {
        x: this.camera.x + screenX / this.camera.zoom,
        y: this.camera.y + screenY / this.camera.zoom
      };
    },
    screenToTile(screenX, screenY) {
      const world = this.screenToWorld(screenX, screenY);
      return {
        x: Math.floor(world.x / this.options.tileSize),
        y: Math.floor(world.y / this.options.tileSize)
      };
    }
  };

  // src/render/renderer/input.js
  var input = {
    bindEvents() {
      const canvas = this.canvas;
      canvas.addEventListener("pointerdown", (e) => {
        this.dragging = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.pressStart = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add("dragging");
      });
      canvas.addEventListener("pointermove", (e) => {
        if (this.dragging) {
          this.panBy(e.clientX - this.lastPointer.x, e.clientY - this.lastPointer.y);
          this.lastPointer = { x: e.clientX, y: e.clientY };
        } else {
          this.reportHover(e);
        }
      });
      const stopDragging = () => {
        this.dragging = false;
        canvas.classList.remove("dragging");
      };
      canvas.addEventListener("pointerup", (e) => {
        const start = this.pressStart;
        stopDragging();
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
          const point = this.pointerToCanvas(e);
          const object = this.onObjectClick ? this.objectAt(point) : null;
          if (object) this.onObjectClick(object);
          else this.selectAt(point);
        }
      });
      canvas.addEventListener("pointercancel", stopDragging);
      canvas.addEventListener("pointerleave", () => this.onHover && this.onHover(null));
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const point = this.pointerToCanvas(e);
        const factor = e.deltaY < 0 ? this.options.zoomStep : 1 / this.options.zoomStep;
        this.zoomAt(point.x, point.y, factor);
      }, { passive: false });
      canvas.addEventListener("keydown", (e) => {
        const step = this.options.keyPanStep;
        const center = { x: canvas.width / 2, y: canvas.height / 2 };
        const actions = {
          ArrowLeft: () => this.panBy(step, 0),
          a: () => this.panBy(step, 0),
          ArrowRight: () => this.panBy(-step, 0),
          d: () => this.panBy(-step, 0),
          ArrowUp: () => this.panBy(0, step),
          w: () => this.panBy(0, step),
          ArrowDown: () => this.panBy(0, -step),
          s: () => this.panBy(0, -step),
          "+": () => this.zoomAt(center.x, center.y, this.options.zoomStep),
          "=": () => this.zoomAt(center.x, center.y, this.options.zoomStep),
          "-": () => this.zoomAt(center.x, center.y, 1 / this.options.zoomStep),
          Escape: () => this.clearSelection()
        };
        const action = actions[e.key];
        if (action) {
          e.preventDefault();
          action();
        }
      });
    },
    // Координаты курсора относительно холста (с учётом того, что CSS-размер может отличаться от размера холста).
    pointerToCanvas(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    },
    reportHover(e) {
      if (!this.onHover) return;
      const point = this.pointerToCanvas(e);
      const tile = this.screenToTile(point.x, point.y);
      this.onHover(this.map.getTileInfo(tile.x, tile.y));
    }
  };

  // src/render/renderer/objects.js
  var objects = {
    /* Объект рисуется по конфигу функцией SpriteRenderer, поверх карты, на экране (а не в буфере карты),
       поэтому армии можно двигать и менять без перерисовки всей карты.
         { id: 'army-1',
           config: SPRITE_EXAMPLES.army,         // описание объекта
           tile: [x, y],                         // клетка карты (основание объекта — внизу клетки)
           offset: [0, 0],                       // сдвиг в пикселях (для клетки 12×12), чтобы поставить точнее
           options: { colors: { team: '#c33' }, flags: ['marching'], frame: 0, flipX: false } }
       Сезон в options подставляется автоматически (текущий сезон карты), если вы не указали свой. */
    setObjects(list) {
      this.objects = list.slice();
      this.draw();
    },
    addObject(object) {
      this.objects = this.objects.filter((o) => o.id !== object.id).concat(object);
      this.draw();
    },
    removeObject(id) {
      this.objects = this.objects.filter((o) => o.id !== id);
      this.draw();
    },
    // Где на экране стоит объект: левый верхний угол и размер спрайта.
    objectBox(object) {
      const unit = this.options.tileSize / 12;
      const sprite = this.sprites.render(object.config, { season: this.seasonName, ...object.options });
      const [tileX, tileY] = object.tile;
      const [offsetX, offsetY] = object.offset || [0, 0];
      const baseX = tileX * this.options.tileSize + this.options.tileSize / 2 + offsetX * unit;
      const baseY = tileY * this.options.tileSize + this.options.tileSize * 0.85 + offsetY * unit;
      const zoom = this.camera.zoom;
      const factor = unit * zoom / sprite.scale;
      return {
        sprite,
        baseY,
        x: (baseX - this.camera.x) * zoom - sprite.anchorX * factor,
        y: (baseY - this.camera.y) * zoom - sprite.anchorY * factor,
        width: sprite.width * factor,
        height: sprite.height * factor
      };
    },
    drawObjects() {
      if (this.objects.length === 0) return;
      const { ctx, canvas } = this;
      const boxes = this.objects.map((object) => ({ object, ...this.objectBox(object) }));
      boxes.sort((a, b) => a.baseY - b.baseY);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const box of boxes) {
        if (box.x > canvas.width || box.y > canvas.height || box.x + box.width < 0 || box.y + box.height < 0) continue;
        ctx.drawImage(box.sprite.canvas, box.x, box.y, box.width, box.height);
      }
      ctx.restore();
    },
    // Объект под точкой экрана (самый южный из перекрывающихся) или null.
    objectAt(point) {
      const hit = this.objects.map((object) => ({ object, ...this.objectBox(object) })).filter((b) => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height).sort((a, b) => b.baseY - a.baseY);
      return hit.length ? hit[0].object : null;
    }
  };

  // src/render/renderer/selection.js
  var selection = {
    // Клик выделяет клетку, а если это суша — ещё и весь её регион.
    selectAt(point) {
      const tile = this.screenToTile(point.x, point.y);
      const info2 = this.map.getTileInfo(tile.x, tile.y);
      if (!info2) {
        this.clearSelection();
        return;
      }
      const region = this.map.getRegionInfo(info2.regionId);
      this.selection = { tile: info2, region, edges: region ? this.regionOutline(region) : [] };
      this.draw();
      if (this.onSelect) this.onSelect(info2, region);
    },
    clearSelection() {
      if (!this.selection) return;
      this.selection = null;
      this.draw();
      if (this.onSelect) this.onSelect(null, null);
    },
    // Внешняя граница региона: отрезок для каждой стороны клетки, за которой уже другой регион (координаты — в клетках).
    regionOutline(region) {
      const { size, regionId } = this.map;
      const edges = [];
      for (const i of region.tiles) {
        const x = i % size;
        const y = Math.floor(i / size);
        if (x === 0 || regionId[i - 1] !== region.id) edges.push([x, y, x, y + 1]);
        if (x === size - 1 || regionId[i + 1] !== region.id) edges.push([x + 1, y, x + 1, y + 1]);
        if (y === 0 || regionId[i - size] !== region.id) edges.push([x, y, x + 1, y]);
        if (y === size - 1 || regionId[i + size] !== region.id) edges.push([x, y + 1, x + 1, y + 1]);
      }
      return edges;
    },
    // Рисуется поверх карты на экране, а не в буфере: выделение можно менять без перерисовки всей карты.
    drawSelection() {
      if (!this.selection) return;
      const { ctx, camera: camera2 } = this;
      const tileSize = this.options.tileSize;
      const size = this.map.size;
      const cell = tileSize * camera2.zoom;
      const screenX = (tileX) => (tileX * tileSize - camera2.x) * camera2.zoom;
      const screenY = (tileY) => (tileY * tileSize - camera2.y) * camera2.zoom;
      const { tile, region, edges } = this.selection;
      ctx.save();
      ctx.lineJoin = "round";
      if (region) {
        ctx.fillStyle = "rgba(255, 240, 170, 0.18)";
        ctx.beginPath();
        for (const i of region.tiles) ctx.rect(screenX(i % size), screenY(Math.floor(i / size)), cell, cell);
        ctx.fill();
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of edges) {
          ctx.moveTo(screenX(x1), screenY(y1));
          ctx.lineTo(screenX(x2), screenY(y2));
        }
        ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = "#ffe27a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = 4;
      ctx.strokeRect(screenX(tile.x), screenY(tile.y), cell, cell);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(screenX(tile.x), screenY(tile.y), cell, cell);
      ctx.restore();
    }
  };

  // src/render/renderer/map-renderer.js
  var MapRenderer = class {
    constructor(canvas, map, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.map = map;
      this.options = {
        tileSize: 16,
        // размер клетки в пикселях (9, 12, 15...)
        minZoom: 0.1,
        maxZoom: 6,
        zoomStep: 1.15,
        // во сколько раз меняется зум за один «щелчок» колеса
        keyPanStep: 60,
        // шаг движения камеры стрелками, в экранных пикселях
        backgroundColor: "#0f1418",
        mood: "dark",
        // 'dark' (dark fantasy) | 'light'
        ...options
      };
      this.painter = new MapPainter(map, this.options);
      this.buffer = document.createElement("canvas");
      this.view = "terrain";
      this.seasonName = "summer";
      this.mood = this.options.mood;
      this.showBorders = true;
      this.camera = { x: 0, y: 0, zoom: 1 };
      this.sprites = new SpriteRenderer();
      this.objects = [];
      this.onObjectClick = null;
      this.selection = null;
      this.onSelect = null;
      this.onHover = null;
      this.dragging = false;
      this.pressStart = null;
      this.lastPointer = { x: 0, y: 0 };
      this.bindEvents();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
    }
    /* ---------- Публичные методы ---------- */
    // Вызывать после каждой новой генерации карты.
    refresh() {
      this.selection = null;
      this.rebuildBuffer();
      this.fitToView();
    }
    setView(view) {
      this.view = view;
      this.rebuildBuffer();
      this.draw();
    }
    setSeason(name) {
      if (!SEASONS[name]) return;
      this.seasonName = name;
      this.rebuildBuffer();
      this.draw();
    }
    // 'dark' — dark fantasy (приглушённые цвета, туман, мёртвые деревья, мрачные детали); 'light' — обычный стиль.
    setMood(mood) {
      this.mood = mood;
      this.rebuildBuffer();
      this.draw();
    }
    setShowSettlements(show) {
      this.painter.options.settlements = show;
      this.rebuildBuffer();
      this.draw();
    }
    setShowBorders(show) {
      this.showBorders = show;
      this.rebuildBuffer();
      this.draw();
    }
    rebuildBuffer() {
      this.buffer = this.painter.paint({ view: this.view, seasonName: this.seasonName, showBorders: this.showBorders, mood: this.mood });
    }
    /* ---------- Камера ---------- */
    get worldSize() {
      return this.map.size * this.options.tileSize;
    }
    /* ---------- Вывод на экран ---------- */
    resize() {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.clampCamera();
      this.draw();
    }
    draw() {
      const { ctx, canvas, camera: camera2 } = this;
      ctx.fillStyle = this.options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (this.buffer.width === 0) return;
      ctx.imageSmoothingEnabled = camera2.zoom < 1;
      const viewW = canvas.width / camera2.zoom;
      const viewH = canvas.height / camera2.zoom;
      const srcX = Math.max(0, camera2.x);
      const srcY = Math.max(0, camera2.y);
      const srcRight = Math.min(this.worldSize, camera2.x + viewW);
      const srcBottom = Math.min(this.worldSize, camera2.y + viewH);
      if (srcRight <= srcX || srcBottom <= srcY) return;
      ctx.drawImage(
        this.buffer,
        srcX,
        srcY,
        srcRight - srcX,
        srcBottom - srcY,
        (srcX - camera2.x) * camera2.zoom,
        (srcY - camera2.y) * camera2.zoom,
        (srcRight - srcX) * camera2.zoom,
        (srcBottom - srcY) * camera2.zoom
      );
      this.drawSelection();
      this.drawObjects();
    }
  };
  Object.assign(MapRenderer.prototype, objects, camera, selection, input);

  // src/ui/controls.js
  function bindToggle(id, apply) {
    const button = document.getElementById(id);
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", on);
      apply(on);
    });
  }
  function bindChoiceGroup(name, apply) {
    const buttons = document.querySelectorAll(`[data-${name}]`);
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((other) => other.setAttribute("aria-pressed", other === button));
        apply(button.dataset[name]);
      });
    });
  }
  function bindPanelToggles() {
    document.querySelectorAll("[data-toggle-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = document.getElementById(button.dataset.togglePanel);
        if (panel) panel.style.display = panel.style.display === "none" ? "flex" : "none";
      });
    });
  }

  // src/sprites/sprite-examples.js
  var SPRITE_EXAMPLES = {
    // Деревня: три домика, дым из трубы, зимой снег на крышах.
    village: {
      id: "village",
      size: [28, 22],
      anchor: [14, 19],
      palette: {
        wall: "#cdb890",
        roof: "#a44f33",
        wood: "#6b4a2e",
        window: "#f4d98a",
        smoke: "#d9d9d9"
      },
      shadow: { rx: 12, ry: 2.5, alpha: 0.28 },
      outline: "#2b1d12",
      layers: [
        // левый дом
        { shape: "rect", x: 3, y: 12, w: 9, h: 7, fill: "wall", bevel: 0.5 },
        { shape: "polygon", points: [[2, 12], [7.5, 6], [13, 12]], fill: "roof", bevel: 0.5 },
        { shape: "rect", x: 5, y: 15, w: 2, h: 4, fill: "wood" },
        { shape: "rect", x: 9, y: 14, w: 2, h: 2, fill: "window" },
        // правый дом
        { shape: "rect", x: 15, y: 13, w: 9, h: 6, fill: "wall", bevel: 0.5 },
        { shape: "polygon", points: [[14, 13], [19.5, 8], [25, 13]], fill: "roof", bevel: 0.5 },
        { shape: "rect", x: 18, y: 15, w: 2, h: 4, fill: "wood" },
        { shape: "rect", x: 21, y: 15, w: 2, h: 2, fill: "window" },
        // труба
        { shape: "rect", x: 10, y: 6, w: 2, h: 4, fill: { shade: "wall", amount: -0.35 } },
        // дым (кадры анимации 0 и 1 — разные)
        { shape: "pixels", x: 10, y: 2, rows: [".s", "s."], legend: { s: "smoke" }, alpha: 0.7, when: { frame: 0 } },
        { shape: "pixels", x: 10, y: 2, rows: ["s.", ".s"], legend: { s: "smoke" }, alpha: 0.7, when: { frame: 1 } },
        // забор
        { shape: "line", points: [[13, 19], [14, 19]], fill: "wood" }
      ],
      variants: {
        winter: {
          palette: { roof: "#eef3f5", wall: "#d8cdb4" },
          addLayers: [
            { shape: "polygon", points: [[2, 12], [7.5, 6], [13, 12], [11, 12], [7.5, 8], [4, 12]], fill: "#ffffff", alpha: 0.9 }
          ]
        },
        autumn: { palette: { roof: "#9a4426" } }
      }
    },
    // Город: стена с зубцами, башни со знамёнами (цвет игрока), донжон. Знамёна машут (2 кадра).
    city: {
      id: "city",
      size: [40, 32],
      anchor: [20, 29],
      palette: {
        stone: "#9a968c",
        stoneDark: { shade: "stone", amount: -0.3 },
        roof: "#7b3a2c",
        gate: "#4a3322",
        window: "#f4d98a",
        flag: "$team"
      },
      shadow: { rx: 18, ry: 3, alpha: 0.3 },
      outline: "#241810",
      layers: [
        // стена
        { shape: "rect", x: 3, y: 18, w: 34, h: 10, fill: "stone", bevel: 0.5 },
        { shape: "rect", x: 3, y: 16, w: 3, h: 2, fill: "stone", bevel: 0.4, repeat: { count: 6, dx: 6 } },
        { shape: "rect", x: 15, y: 21, w: 10, h: 7, fill: "gate" },
        { shape: "ellipse", cx: 20, cy: 21, rx: 5, ry: 3, fill: "gate" },
        // донжон
        { shape: "rect", x: 14, y: 8, w: 12, h: 12, fill: "stone", bevel: 0.5 },
        { shape: "polygon", points: [[13, 8], [20, 1], [27, 8]], fill: "roof", bevel: 0.5 },
        { shape: "rect", x: 19, y: 12, w: 2, h: 3, fill: "window" },
        // боковые башни
        { shape: "rect", x: 1, y: 11, w: 7, h: 17, fill: "stone", bevel: 0.5 },
        { shape: "polygon", points: [[0, 11], [4.5, 5], [9, 11]], fill: "roof", bevel: 0.5 },
        { shape: "rect", x: 32, y: 11, w: 7, h: 17, fill: "stone", bevel: 0.5 },
        { shape: "polygon", points: [[31, 11], [35.5, 5], [40, 11]], fill: "roof", bevel: 0.5 },
        { shape: "rect", x: 4, y: 14, w: 1, h: 2, fill: "window" },
        { shape: "rect", x: 35, y: 14, w: 1, h: 2, fill: "window" },
        // знамёна на башнях
        { shape: "line", points: [[4, 5], [4, 1]], fill: "stoneDark" },
        { shape: "polygon", points: [[5, 1], [9, 2], [5, 4]], fill: "flag", when: { frame: 0 } },
        { shape: "polygon", points: [[5, 1], [9, 3], [5, 4]], fill: "flag", when: { frame: 1 } },
        { shape: "line", points: [[35, 5], [35, 1]], fill: "stoneDark" },
        { shape: "polygon", points: [[36, 1], [40, 2], [36, 4]], fill: "flag", when: { frame: 0 } },
        { shape: "polygon", points: [[36, 1], [40, 3], [36, 4]], fill: "flag", when: { frame: 1 } }
      ],
      variants: {
        winter: {
          addLayers: [
            { shape: "polygon", points: [[13, 8], [20, 1], [27, 8], [25, 8], [20, 3], [15, 8]], fill: "#ffffff", alpha: 0.9 },
            { shape: "rect", x: 3, y: 16, w: 3, h: 1, fill: "#ffffff", alpha: 0.9, repeat: { count: 6, dx: 6 } }
          ]
        }
      }
    },
    // Армия: отряд из трёх воинов со знаменем (цвет игрока). Флаг 'marching' добавляет пыль.
    army: {
      id: "army",
      size: [22, 20],
      anchor: [11, 17],
      palette: {
        skin: "#e0b48a",
        steel: "#aeb4bb",
        cloth: "$team",
        clothDark: { shade: "$team", amount: -0.35 },
        leather: "#6b4a2e",
        pole: "#5a3d24",
        dust: "#c9b48a"
      },
      shadow: { rx: 9, ry: 2, alpha: 0.28 },
      outline: "#1f160e",
      layers: [
        { shape: "pixels", x: 2, y: 8, rows: [
          ".hh.",
          ".ss.",
          "cccc",
          "cccc",
          ".cc.",
          ".ll.",
          ".ll."
        ], legend: { h: "steel", s: "skin", c: "cloth", l: "leather" } },
        { shape: "pixels", x: 9, y: 6, rows: [
          ".hh.",
          ".ss.",
          "cccc",
          "cccc",
          ".cc.",
          ".ll.",
          ".ll."
        ], legend: { h: "steel", s: "skin", c: "cloth", l: "leather" } },
        { shape: "pixels", x: 15, y: 8, rows: [
          ".hh.",
          ".ss.",
          "cccc",
          "cccc",
          ".cc.",
          ".ll.",
          ".ll."
        ], legend: { h: "steel", s: "skin", c: "cloth", l: "leather" } },
        // копья
        { shape: "line", points: [[1, 15], [1, 5]], fill: "pole" },
        { shape: "line", points: [[14, 14], [14, 2]], fill: "pole" },
        // знамя
        { shape: "polygon", points: [[15, 2], [20, 3], [15, 6]], fill: "cloth", when: { frame: 0 } },
        { shape: "polygon", points: [[15, 2], [20, 4], [15, 6]], fill: "cloth", when: { frame: 1 } },
        // пыль при движении
        { shape: "scatter", area: { ellipse: [11, 17, 9, 2] }, count: 7, colors: ["dust"], seed: 3, alpha: 0.6, when: { flag: "marching" } }
      ]
    },
    black_warrior: {
      "id": "black_warrior",
      "size": [
        40,
        32
      ],
      "anchor": [
        20,
        30
      ],
      "palette": {
        "color_1": "#252b2b",
        "color_2": "#23262b",
        "color_3": "#181a19",
        "color_4": "#1f2326",
        "color_5": "#2e3231",
        "color_6": "#21221e",
        "color_7": "#1f2826",
        "color_8": "#181e1e",
        "color_9": "#817366",
        "color_10": "#a5a08d",
        "color_11": "#798584",
        "color_12": "#3f494d",
        "color_13": "#0f1818",
        "color_14": "#241d17",
        "color_15": "#e99667",
        "color_16": "#bb805a",
        "color_17": "#874c3b",
        "color_18": "#4d2b22",
        "color_19": "#3b3d39",
        "color_20": "#33322d",
        "color_21": "#777976",
        "color_22": "#525451",
        "color_23": "#0c0d0c",
        "color_24": "#e0e2d9",
        "color_25": "#232929",
        "color_26": "#20221f",
        "color_27": "#374545",
        "color_28": "#252726",
        "color_29": "#20201e",
        "color_30": "#92958e",
        "color_31": "#656962",
        "color_32": "#6a6c67",
        "color_33": "#9da79c",
        "color_34": "#6d7872",
        "color_35": "#1c2023",
        "color_36": "#888c8d",
        "color_37": "#675e54",
        "color_38": "#101210",
        "color_39": "#48494b",
        "color_40": "#9fa59b",
        "color_41": "#292e31",
        "color_42": "#242d2a",
        "color_43": "#0e0e0d",
        "color_44": "#343837"
      },
      "layers": [
        {
          "shape": "pixels",
          "x": 0,
          "y": 0,
          "rows": [
            ".............aab........................",
            "..............cdddddddddddddd...........",
            ".......eeeef..cggggggggggghd............",
            "......feeijf..cggggggggggggd............",
            ".....ffeeeif..cggkkgkggklgm.............",
            "......nnnnnn..cglkggkggklgm.............",
            "......opqqqr..cgkkgkkkgklgm.............",
            "......qpooop..cgkkglklgklgm.............",
            ".......pooop..cgkkggkggklgd.............",
            ".......qpppq..cggkkgkggklgm.............",
            "...sssstttttt.cggllgkgggggmm............",
            "...uvwsxeeejiycgggggllggggdm............",
            "..uuvweeeeejwycdddddddddddddm...........",
            ".zAABwexeeeewyC.........................",
            ".zAABweeeeeewDDD........................",
            "zzAB.seEeeeewFFF........................",
            "GGH..seeeeeewIJJ........................",
            "GGH..seEeijeiKII........................",
            "HGH.LLcccijciKII........................",
            ".GH.LLLccccciII.........................",
            ".MNFLLLOOOOOP.c.........................",
            ".MMFLLOOOOOOO.c.........................",
            ".NFFLLOOOcOOO.c.........................",
            "....cOOQ.ccOOPc.........................",
            "....cOOQ..cOOPc.........................",
            "....cOQ...cOOPc.........................",
            "...cOOQ...ccccc.........................",
            "...cOQ.....Qccc.........................",
            "...cOQ.....QORc.........................",
            "...OO......QORc.........................",
            "..ROO......QORc.........................",
            "..QQQ......QQQc........................."
          ],
          "legend": {
            "a": "color_1",
            "b": "color_2",
            "c": "color_3",
            "d": "color_4",
            "e": "color_5",
            "f": "color_6",
            "g": "color_7",
            "h": "color_8",
            "i": "color_9",
            "j": "color_10",
            "k": "color_11",
            "l": "color_12",
            "m": "color_13",
            "n": "color_14",
            "o": "color_15",
            "p": "color_16",
            "q": "color_17",
            "r": "color_18",
            "s": "color_19",
            "t": "color_20",
            "u": "color_21",
            "v": "color_22",
            "w": "color_23",
            "x": "color_24",
            "y": "color_25",
            "z": "color_26",
            "A": "color_27",
            "B": "color_28",
            "C": "color_29",
            "D": "color_30",
            "E": "color_31",
            "F": "color_32",
            "G": "color_33",
            "H": "color_34",
            "I": "color_35",
            "J": "color_36",
            "K": "color_37",
            "L": "color_38",
            "M": "color_39",
            "N": "color_40",
            "O": "color_41",
            "P": "color_42",
            "Q": "color_43",
            "R": "color_44"
          }
        }
      ]
    }
  };

  // src/ui/demo-objects.js
  function demoObjects(generator2) {
    const size = generator2.size;
    const center = size / 2;
    const distance = (i) => Math.hypot(i % size - center, Math.floor(i / size) - center);
    const free = generator2.landTiles.filter((i) => generator2.terrain[i] === Terrain.PLAIN && !generator2.river[i] && generator2.resource[i] === Resource.NONE).sort((a, b) => distance(a) - distance(b));
    const spot = (k) => [free[k * 6] % size, Math.floor(free[k * 6] / size)];
    return [
      { id: "city-1", config: SPRITE_EXAMPLES.city, tile: spot(0), options: { colors: { team: "#c0392b" } } },
      { id: "village-1", config: SPRITE_EXAMPLES.village, tile: spot(1) },
      { id: "army-1", config: SPRITE_EXAMPLES.army, tile: spot(2), options: { colors: { team: "#2e86c1" }, flags: ["marching"] } }
    ];
  }

  // src/ui/describe.js
  var TERRAIN_NAMES = ["\u0433\u043B\u0443\u0431\u043E\u043A\u0430\u044F \u0432\u043E\u0434\u0430", "\u043C\u0435\u043B\u043A\u043E\u0432\u043E\u0434\u044C\u0435", "\u0440\u0430\u0432\u043D\u0438\u043D\u0430", "\u0433\u043E\u0440\u0430"];
  var BIOME_NAMES = ["\u0442\u0443\u043D\u0434\u0440\u0430", "\u0442\u0430\u0439\u0433\u0430", "\u0440\u0430\u0432\u043D\u0438\u043D\u0430", "\u0441\u0442\u0435\u043F\u044C", "\u043F\u0443\u0441\u0442\u044B\u043D\u044F", "\u0441\u0430\u0432\u0430\u043D\u043D\u0430", "\u043C\u0451\u0440\u0442\u0432\u044B\u0435 \u0437\u0435\u043C\u043B\u0438", "\u0437\u0435\u043C\u043B\u0438 \u044D\u0444\u0438\u0440\u0430"];
  var RESOURCE_NAMES = ["", "\u0434\u0435\u0440\u0435\u0432\u043E", "\u043F\u0448\u0435\u043D\u0438\u0446\u0430", "\u0437\u043E\u043B\u043E\u0442\u0430\u044F \u0440\u0443\u0434\u0430", "\u044D\u0444\u0438\u0440", "\u0436\u0435\u043B\u0435\u0437\u043D\u0430\u044F \u0440\u0443\u0434\u0430", "\u043F\u043E\u0441\u0435\u043B\u0435\u043D\u0438\u0435"];
  var CROSSING_NAMES = ["", "\u0431\u0440\u043E\u0434", "\u043A\u0430\u043C\u0435\u043D\u043D\u044B\u0439 \u043C\u043E\u0441\u0442"];
  function temperatureName(t) {
    if (t < 0.25) return "\u0445\u043E\u043B\u043E\u0434\u043D\u043E";
    if (t < 0.5) return "\u043F\u0440\u043E\u0445\u043B\u0430\u0434\u043D\u043E";
    if (t < 0.75) return "\u0442\u0435\u043F\u043B\u043E";
    return "\u0436\u0430\u0440\u043A\u043E";
  }
  function describeTile(tile) {
    let kind = TERRAIN_NAMES[tile.terrain];
    if (tile.terrain < Terrain.PLAIN) kind = `${kind}, \u0433\u043B\u0443\u0431\u0438\u043D\u0430 ${tile.waterDepth}`;
    if (tile.terrain === Terrain.PLAIN) kind = tile.hasRiver ? `\u0440\u0435\u043A\u0430 (\u0433\u043B\u0443\u0431\u0438\u043D\u0430 ${tile.riverLevel})` : BIOME_NAMES[tile.biome];
    if (tile.crossing) kind += `, ${CROSSING_NAMES[tile.crossing]}`;
    const parts = [`(${tile.x}, ${tile.y})`, kind, `${temperatureName(tile.temperature)} (${Math.round(tile.temperature * 100)}%)`];
    if (tile.resource !== Resource.NONE && tile.resource !== Resource.SETTLEMENT) parts.push(`\u0440\u0435\u0441\u0443\u0440\u0441: ${RESOURCE_NAMES[tile.resource]}`);
    if (tile.resource === Resource.SETTLEMENT) parts.push(`\u043D\u0430\u0441\u0435\u043B\u0435\u043D\u0438\u0435 ${tile.population} (\u0443\u0440\u043E\u0432\u0435\u043D\u044C ${tile.settlementLevel}, \u0433\u0440\u0443\u043F\u043F\u0430 \u0438\u0437 ${tile.settlementGroupSize} \u043A\u043B.)`);
    if (tile.roadLevel > 0) parts.push("\u0434\u043E\u0440\u043E\u0433\u0430");
    if (tile.regionId >= 0) parts.push(`\u0440\u0435\u0433\u0438\u043E\u043D #${tile.regionId}, ${tile.regionSize} \u043A\u0432.`);
    return parts.join(" \xB7 ");
  }
  function describeRegion(region) {
    const resources2 = region.resources.map((count, code) => count > 0 && code !== Resource.NONE ? `${RESOURCE_NAMES[code]}: ${count}` : null).filter(Boolean);
    const dominantBiome = BIOME_NAMES[region.biomes.indexOf(Math.max(...region.biomes))];
    const parts = [`\u0420\u0435\u0433\u0438\u043E\u043D #${region.id}: ${region.size} \u043A\u0432.`, `\u043D\u0430\u0441\u0435\u043B\u0435\u043D\u0438\u0435 \u0440\u0435\u0433\u0438\u043E\u043D\u0430 ${region.population}`, `\u043F\u0440\u0435\u043E\u0431\u043B\u0430\u0434\u0430\u0435\u0442 ${dominantBiome}`];
    if (region.mountains > 0) parts.push(`\u0433\u043E\u0440: ${region.mountains}`);
    if (region.riverTiles > 0) parts.push(`\u0440\u0435\u043A: ${region.riverTiles}`);
    if (region.coastal) parts.push("\u0432\u044B\u0445\u043E\u0434 \u043A \u0432\u043E\u0434\u0435");
    parts.push(resources2.length ? `\u0440\u0435\u0441\u0443\u0440\u0441\u044B \u2014 ${resources2.join(", ")}` : "\u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u043D\u0435\u0442");
    return parts.join(" \xB7 ");
  }
  function describeStats(generator2) {
    const landPercent = Math.round(generator2.landShare * 100);
    const regions2 = generator2.regionCount;
    const average = (generator2.landTiles.length / regions2).toFixed(1);
    return `\u0421\u0443\u0448\u0430: ${landPercent}% \xB7 \u0440\u0435\u0433\u0438\u043E\u043D\u043E\u0432: ${regions2} \xB7 \u0432 \u0441\u0440\u0435\u0434\u043D\u0435\u043C ${average} \u043A\u0432. \u041D\u0430\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430 \u043A\u0432\u0430\u0434\u0440\u0430\u0442.`;
  }

  // src/main.js
  var generator = new MapGenerator({
    size: 150
    // shapeVariety: 1,       // 0..1: изрезанность континента (заливы, полуострова)
    // coastDetail: 0.2,      // 0..1: мелкая изрезанность береговой линии (0 — гладкие берега)
    // islandDensity: 0.8,    // 0..1: больше островов
    // inlandSeaStrength: 0.5,// внутренние моря
    // aridity: 0.1,          // меньше степей и пустынь
    // waterShare: 0.5,       // больше суши
    // mountainShare: 0.2,    // больше гор
    // riverCount: 30,
    // regionMinSize: 5,
    // regionMaxSize: 8,
    // --- зоны ---
    // steppeShare: 0.1,      // 0..1: доля карты под степями (0 — только обычные сухие места)
    // deadLandShare: 0.08,   // 0..1: доля карты под мёртвыми землями
    // etherLandShare: 0.06,  // 0..1: доля карты под землями эфира
    // etherLandDensity: 0.7, // 0..1: плотность эфира внутри эфирных земель
    // --- поселения и поля ---
    // settlementsPerRegionMax: 3,  // максимум групп поселений в одном регионе
    // wheatMinPerRegion: 2,        // минимум полей в каждом подходящем регионе
  });
  var renderer = new MapRenderer(document.getElementById("map"), generator, {
    // roundCoast: 2,        // 0..3: уровень скругления береговой линии (0 — берег по границам клеток, больше — плавнее)
  });
  var info = document.getElementById("info");
  var selectionPanel = document.getElementById("selection");
  var seedInput = document.getElementById("seed");
  function buildMap() {
    generator.generate(Number(seedInput.value) || 1);
    renderer.refresh();
    info.textContent = describeStats(generator);
  }
  renderer.onHover = (tile) => {
    if (tile) info.textContent = describeTile(tile);
  };
  renderer.onSelect = (tile, region) => {
    if (!tile) {
      selectionPanel.hidden = true;
      return;
    }
    selectionPanel.hidden = false;
    selectionPanel.textContent = region ? `\u041A\u043B\u0435\u0442\u043A\u0430 ${describeTile(tile)}
${describeRegion(region)}` : `\u041A\u043B\u0435\u0442\u043A\u0430 ${describeTile(tile)}`;
  };
  renderer.onObjectClick = (object) => {
    info.textContent = `\u041E\u0431\u044A\u0435\u043A\u0442: ${object.id}`;
  };
  document.getElementById("generate").addEventListener("click", () => {
    seedInput.value = Math.floor(Math.random() * 99999);
    buildMap();
  });
  seedInput.addEventListener("change", buildMap);
  document.getElementById("borders").addEventListener("change", (e) => renderer.setShowBorders(e.target.checked));
  document.getElementById("fit").addEventListener("click", () => renderer.fitToView());
  bindChoiceGroup("season", (season) => renderer.setSeason(season));
  bindChoiceGroup("view", (view) => renderer.setView(view));
  bindToggle("demo-objects", (on) => renderer.setObjects(on ? demoObjects(generator) : []));
  bindToggle("mood", (on) => renderer.setMood(on ? "dark" : "light"));
  bindToggle("settlements", (on) => renderer.setShowSettlements(on));
  bindPanelToggles();
  buildMap();
})();
