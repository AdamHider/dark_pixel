# Справка по всем функциям

Полный список методов по модулям: что делает, какие аргументы, что возвращает и на что смотреть.
Однотипные методы (слои, этапы) сгруппированы — они устроены одинаково. Новым в JS — сначала
[JavaScript для чайников](js-basics.md).

Как читать записи: `метод(аргументы) -> что возвращает`. «this» у методов слоёв/этапов — это
экземпляр класса (см. [Object.assign](js-basics.md#4-this-методы-и-главный-приём-проекта-objectassign)).

---

## Оглавление

- [1. core/ — общие утилиты](#1-core--общие-утилиты)
- [2. map/ — генерация карты](#2-map--генерация-карты)
  - [2.1 MapGenerator (ядро)](#21-mapgenerator-ядро)
  - [2.2 elevation, terrain, climate](#22-этапы-elevation-terrain-climate)
  - [2.3 resources, rivers, regions](#23-этапы-resources-rivers-regions)
  - [2.4 settlements, factions, roads](#24-этапы-settlements-factions-roads)
- [3. render/ — рисование](#3-render--рисование)
  - [3.1 color.js, seasons.js](#31-colorjs-seasonsjs)
  - [3.2 MapPainter (ядро)](#32-mappainter-ядро)
  - [3.3 Слои: фон, берег, цвет клеток](#33-слои-фон-берег-цвет-клеток)
  - [3.4 Слои: холмы, рельеф гор, берега, реки](#34-слои-холмы-рельеф-гор-берега-реки)
  - [3.5 Слои: дороги, поселения, руда, эфир](#35-слои-дороги-поселения-руда-эфир)
  - [3.6 Слои: деревья, атмосфера, границы, свет](#36-слои-деревья-атмосфера-границы-свет)
  - [3.7 MapRenderer (камера, ввод, выделение, армии, объекты)](#37-maprenderer-камера-ввод-выделение-армии-объекты)
- [4. sprites/ — спрайты объектов](#4-sprites--спрайты-объектов)
- [5. game/ — состояние партии](#5-game--состояние-партии)
- [6. ui/ — интерфейс](#6-ui--интерфейс)
- [7. main.js — сборка всего](#7-mainjs--сборка-всего)

---

## 1. core/ — общие утилиты

### `core/math.js`

| Метод | Что делает |
| --- | --- |
| `clamp(value, min=0, max=1)` | Загоняет число в отрезок `[min, max]`. |
| `lerp(a, b, t)` | Линейная интерполяция: `t=0` — `a`, `t=1` — `b`. |
| `rankNormalize(values)` | Выравнивает значения до 0..1 **по рангу** (меньшее → 0, большее → 1). Возвращает `Float32Array`. Благодаря этому порог `0.4` честно означает «нижние 40%». |
| `percentile(values, share)` | Значение на доле `share` отсортированного списка (`0.5` — медиана). |

### `core/random.js`

| Метод | Что делает |
| --- | --- |
| `hash32(n)` | Перемешивает число в 32-битный хеш. Соседние номера дают несвязанные значения (иначе реки бегут параллельными полосами). |
| `createRandom(seed)` | Генератор (mulberry32): тот же seed → та же последовательность. Возвращает функцию `random() -> 0..1`. |

### `core/value-noise.js` — класс `ValueNoise`

Плавный шум: большие «холмы» значений вместо белого шума. Основной инструмент рельефа и климата.

| Метод | Что делает |
| --- | --- |
| `new ValueNoise(seed)` | Строит решётку случайных узлов 65×65. |
| `latticeValue(ix, iy)` | Значение в узле решётки (с заворотом по маске 63). |
| `sample(x, y) -> 0..1` | Одна «октава»: сглаженная интерполяция между четырьмя узлами. |
| `fractal(x, y, octaves) -> 0..1` | Несколько октав: крупная форма + всё более мелкие детали. `octaves` — сколько. |

### `core/min-heap.js` — класс `MinHeap`

Двоичная «куча»: всегда быстро отдаёт элемент с наименьшим `cost`. Нужна там, где важен порядок
(рост регионов, заливка впадин, поиск пути).

| Метод | Что делает |
| --- | --- |
| `push(cost, tile, region)` | Добавить элемент `[cost, tile, region]`. |
| `pop() -> [cost, tile, region]` | Достать элемент с наименьшим `cost`. |
| `get size` | Сколько элементов лежит. |

### `core/pairs.js`

| Метод | Что делает |
| --- | --- |
| `pairKey(a, b)` | Ключ пары без порядка: `pairKey(2,0)` и `pairKey(0,2)` дают `"0|2"`. Общий для дипломатии и рисования границ. |

---

## 2. map/ — генерация карты

### 2.1 MapGenerator (ядро)

`src/map/map-generator.js`. Хранит карту в плоских массивах; клетка `(x,y)` — индекс `i = y*size + x`.

| Метод | Что делает |
| --- | --- |
| `new MapGenerator(options)` | Сливает `options` с `DEFAULTS`. `options.size` — сторона карты. |
| `generate(seed) -> this` | Главный конвейер: вызывает этапы по порядку (см. [architecture.md](architecture.md)). |
| `createNoiseLayers()` | Создаёт все слои шума (`noise.elevation`, `noise.ridge`, ...). Новый шум — сюда. |
| `allocateLayers()` | Создаёт все плоские массивы (нулевые). Новый массив — сюда. |
| `index(x, y) -> i` | Номер клетки по координатам. |
| `neighbors(i) -> [i,...]` | 4 соседа по сторонам (внутри карты). |
| `neighbors8(i) -> [i,...]` | 8 соседей, включая диагонали. |
| `isLand(i) -> bool` | Суша ли клетка (`terrain >= PLAIN`). |
| `tileDistance(a, b) -> число` | «Манхэттенское» расстояние в клетках. Общее для ИИ и армий. |
| `getRegionInfo(id) -> объект\|null` | Сводка региона: клетки, горы, ресурсы, население, фракция. Для интерфейса. |
| `getTileInfo(x, y) -> объект\|null` | Сводка клетки: тип, биом, ресурс, регион, фракция. Для подсказки при наведении. |
| `get landShare` | Доля суши (0..1). |
| `get regionCount` | Число регионов. |

> **Этапы — это методы, подмешанные из `steps/`.** У них `this` — экземпляр `MapGenerator`. Ниже
> они сгруппированы по файлам. Порядок вызова задан в `generate()`.

### 2.2 Этапы: elevation, terrain, climate

**`steps/elevation.js`** — высота и острова.

| Метод | Что делает |
| --- | --- |
| `generateElevation()` | Высота = шум + «скручивание» координат + спад к краям + форма берега + хребты. Заполняет `elevation`, `ridge`, `massif`. |
| `scatterIslands()` | В полосе мелководья поднимает отдельные «горбы» шума над морем — острова. |

**`steps/terrain.js`** — типы местности, чистка, глубина, берега.

| Метод | Что делает |
| --- | --- |
| `classifyTerrain()` | По долям (не абсолютным числам) ставит воду/равнину/горы; считает высоту гор `mountainHeight`. |
| `removeSmallMountains()` | Горные пятна меньше `minMountainSize` превращает в равнину. |
| `removeSmallIslands()` | Клочки суши меньше `minIslandSize` топит. |
| `collectLandComponent(start, visited)` | Все клетки суши, связанные с `start` (обход по сторонам). |
| `collectLandTiles()` | Пересобирает список всех клеток суши `landTiles`. |
| `computeWaterDepth()` | Волной от суши считает глубину воды; узкая полоса у берега — мелководье. |
| `classifyShores()` | Тип берега у прибрежной суши: утёс (горы/высокое), пляж (низкое и тёплое), иначе камни. |

**`steps/climate.js`** — влажность, температура, биомы и зоны.

| Метод | Что делает |
| --- | --- |
| `generateMoisture()` | Влажность шумом, выровненная по рангу (`rankNormalize`). |
| `generateTemperature()` | Север холоднее, юг жарче; шум и высота вносят поправку. |
| `assignBiomes()` | Ставит биом каждой равнине, затем накладывает зоны. |
| `assignZones()` | Особые зоны поверх биомов: **степи, мёртвые земли, земли эфира** (`steppeShare`, `deadLandShare`, `etherLandShare`). |
| `pickBiome(t, m)` | Биом по температуре и влажности (тундра/тайга/луг/степь/пустыня/саванна). |

### 2.3 Этапы: resources, rivers, regions

**`steps/resources.js`** — лес, поля, руда, эфир.

| Метод | Что делает |
| --- | --- |
| `placeResources()` | Крупные лесные массивы и поля (плюс мелкие рощи) по шуму и климату. |
| `distributeWheat()` | Добивает регионы, где полей меньше `wheatMinPerRegion` (равномерность). |
| `wheatScore(i, fields)` | Насколько клетка хороша под поле (близость реки и т.п.). |
| `isWheatSite(i)` | Подходит ли клетка под поле. |
| `createPatchLayer(bigNoise, bigScale, bigShare, smallNoise, smallScale, smallShare)` | Бинарный слой «пятен»: крупные + мелкие. |
| `createDensityLayer(noise, scale)` | Плавный слой 0..1, выровненный по рангу. |
| `placeRareResources()` | Золото + железо + эфир. |
| `placeGold()` / `placeIron()` | Руды в горах и предгорьях, скоплениями. |
| `tilesNearMountains(distance)` | 1 для гор и суши не дальше `distance` клеток от них. |
| `placeEther()` | Эфир вдоль «линий разлома» и густо — в землях эфира. |
| `createFaultLayer()` | Слой линий: максимум там, где шум пересекает 0.5. |

**`steps/rivers.js`** — озёра, реки, мосты.

| Метод | Что делает |
| --- | --- |
| `fillDepressions()` | Заливка впадин (priority-flood): у каждой клетки появляется сток к морю; глубокие впадины становятся озёрами. |
| `isDiagonal(a, b)` | Диагональные ли соседи. |
| `generateRivers()` | «Дождь» стекает вниз по стоку; где воды много — река. Заполняет `river`, `riverFlow`, `riverTo`. |
| `riverCrossingType(i)` | 2 (мост) для широких рек, 1 (брод) для узких. |
| `placeRiverCrossings()` | На прямых участках рек изредка ставит мост/брод (`crossing`). |

**`steps/regions.js`** — регионы (провинции).

| Метод | Что делает |
| --- | --- |
| `buildRegions()` | Весь цикл: семена → рост → чистка → слияние → выравнивание. |
| `shuffled(list)` | Копия списка в случайном порядке (не портит исходный). |
| `pickRegionSeeds(count)` | Семена регионов не вплотную (сначала большой зазор). |
| `markBlocked(blocked, i, radius)` | Помечает квадрат вокруг клетки как «занято». |
| `growRegionsFromSeeds(seeds)` | Регионы растут одновременно, как кристаллы; цена шага выше в горах/на реках, поэтому границы ложатся по ним. |
| `regionStepCost(tile, noiseLayer)` | Цена присоединить клетку к региону. |
| `attachLeftoverTiles()` | Незанятые клетки отдаёт самому маленькому соседу. |
| `smallestNeighborRegion(i)` | id самого маленького соседнего региона. |
| `fillSeedlessLand()` | Острова без семян делит на регионы обычной волной. |
| `growRegion(start, id, targetSize)` | Простой рост региона от клетки до нужного размера. |
| `countRegionSizes()` | Пересчитывает `regionSizes` (id → число клеток). |
| `mergeSmallRegions()` | Обрывки меньше `regionMergeBelow` вливает в соседа. |
| `balanceRegionSizes()` | Выравнивает размеры регионов (`regionBalancePasses`). |
| `staysConnectedWithout(removed, id)` | Останется ли регион связным, если убрать клетку. |
| `findSmallestNeighborRegion(tiles, ownId)` | Самый маленький соседний регион (кроме своего). |

### 2.4 Этапы: settlements, factions, roads

**`steps/settlements.js`** — население и поселения.

| Метод | Что делает |
| --- | --- |
| `placeSettlements()` | Считает население регионов и ставит группы поселений «раундами» (равномерно по карте). |
| `settlementLevelFor(population)` | Уровень клетки (1..`settlementMaxLevel`) по её населению. |
| `isSettlementSite(i, regionId, habitability, blocked)` | Подходит ли клетка под поселение. |
| `growSettlementGroup(...)` | Выбирает лучшую клетку и наращивает вокруг группу (до `settlementMaxGroup`). |
| `commitSettlementGroup(group, population, blocked)` | Записывает группу: делит население, ставит уровни, дорожки, блокирует окрестность. |
| `computeHabitability()` | «Обитаемость» клетки 0..~1.6 (биом, влага, река, берег). |

**`steps/factions.js`** — фракции (объединения регионов).

| Метод | Что делает |
| --- | --- |
| `buildFactions()` | Семена фракций на крупнейшем массиве, рост, острова по близости, размеры. |
| `factionCulture(id)` | Культура фракции (с учётом `cultureOffset`). |
| `collectFactionRegions(regionIds)` | Группирует регионы по фракциям. |
| `buildRegionAdjacency()` | Соседство регионов (кто с кем граничит). |
| `largestRegionComponent(regionIds, neighbors)` | Крупнейший связный массив регионов (материк). |
| `regionTilesLookup(id)` | Клетки региона. |
| `pickFactionSeeds(mainland, neighbors, count)` | Семена фракций — максимально далеко друг от друга. |
| `regionDistances(sources, mainland, neighbors)` | Расстояния между регионами по графу соседства. |
| `growFactions(...)` | Растит фракции по очереди, выравнивая размеры. |
| `nextFactionRegion(factionRegions, assigned, neighbors)` | Следующий регион для фракции (по соседству). |
| `assignIslandsByProximity(regionIds)` | Острова отдаёт ближайшей фракции. |
| `setRegionFaction(regionId, factionId)` | Назначает регион фракции (только суша). |
| `countFactionSizes()` | Считает население и клетки фракций. |
| `factionName(id)` | Название фракции (по кругу из `factionNames`). |

**`steps/roads.js`** — дороги.

| Метод | Что делает |
| --- | --- |
| `buildRoads()` | Соединяет поселения: кандидаты-рёбра → остовное дерево + петли → путь A*. |
| `findRoadPath(start, goal) -> path\|null` | Поиск пути A* (горы/вода непроходимы, лес/подъёмы дороже, чужие дороги дешевле). |
| `roadStepCost(current, next, diagonal, x, y, dx, dy)` | Цена шага (`Infinity` — нельзя). |
| `carveRoad(path)` | Записывает путь: уровень дороги, связи с соседями, мосты через реки. |

---

## 3. render/ — рисование

### 3.1 color.js, seasons.js

**`color.js`** — цвета как одно число (для быстрой записи в `ImageData`).

| Метод | Что делает |
| --- | --- |
| `packRgb(r, g, b)` | Упаковывает цвет в 32-битное число `AA|BB|GG|RR`. |
| `hexToPacked('#rrggbb')` | То же из hex-строки. |
| `hslToPacked(h, s, l)` | То же из HSL (нужно для режимов температуры и регионов). |
| `mixPacked(a, b, t)` | Смесь цветов: `t=0` — `a`, `t=1` — `b`. Целочисленно, без выделения памяти. |
| `speckColor(color, lighter)` | Крапинка: чуть светлее/темнее (~13%). |
| `shadeFast(color, amount)` | Светлее/темнее на `amount/256`. |
| `shadePacked(color, amount)` | Светлее/темнее (через `mixPacked` с белым/чёрным). |
| `packPalette(palette)` | Палитра сезона → объект с упакованными числами (один раз за кадр). |
| `WHITE`, `BLACK` | Готовые цвета. |

**`seasons.js`** — палитры. `SEASONS`, `DARK_SEASONS` (светлый и тёмный стиль), `SEASON_ORDER`.
Поля палитры описаны в шапке файла. Правьте цвета прямо здесь.

### 3.2 MapPainter (ядро)

`src/render/painter/map-painter.js`. Рисует карту в один холст, пиксель за пикселем.

| Метод | Что делает |
| --- | --- |
| `new MapPainter(map, options)` | Настройки рисования (все числа — в конструкторе). Упаковывает цвета. |
| `paint({view, seasonName, showBorders, showFactions, mood, relations, viewerFaction}) -> canvas` | Главный метод: вызывает слои по порядку. `view`: `terrain`/`temperature`/`regions`/`factions`/`diplomacy`. |
| `px(n)` | «Пиксели для клетки 16×16» → пиксели текущего размера. |
| `pxMin(n)` | То же, но не меньше 1 (для мелких деталей). |
| `forEachTile(callback)` | Обходит все клетки: `callback(x, y)`. |
| `seasonalTemperature(i)` | Температура клетки с поправкой на сезон. |
| `put(x, y, color)` | Поставить пиксель (с проверкой границ). |
| `blend(x, y, color, alpha)` | Смешать пиксель с цветом. |
| `rect(x, y, w, h, color)` | Залить прямоугольник. |
| `linePoints(x0, y0, x1, y1) -> [[x,y],...]` | Пиксели отрезка (Брезенхэм). |

> **Порядок слоёв** задан в `paint()`. Чтобы добавить слой — новый файл в `layers/`, добавить его
> в `Object.assign` и вызвать метод в нужном месте `paint()`.

### 3.3 Слои: фон, берег, цвет клеток

**`layers/base.js`** — фон (цвет клеток с дизерингом).

| Метод | Что делает |
| --- | --- |
| `paintBase()` | Красит каждую клетку, пиксельно смешивая её с соседями по узору Байера. Заполняет `tileColors`, `tileWater`, `waterMask`. |
| `blendGrid()` | Строит таблицы положения пикселя в клетке (кэш на карту). |
| `blendChoices(tx, ty)` | Таблицы выбора «чей цвет взять» для разных «резкостей» и сдвигов узора. |
| `buildAxisTables()` | Для каждого пикселя по оси: между какими клетками лежит и насколько. Заполняет `this.axis`. |
| `isUniform(colors, tx, ty, color)` | Клетка и все 8 соседей одного цвета? (быстрый путь заливки). |

**`layers/coast.js`** — скругление углов побережья.

| Метод | Что делает |
| --- | --- |
| `roundCoastCorners()` | У прибрежной суши подрезает углы, смотрящие в воду, — берег перестаёт быть «квадратным». Обновляет `waterMask`. |

**`layers/tile-colors.js`** — цвет клетки.

| Метод | Что делает |
| --- | --- |
| `buildTileColors() -> {colors, water}` | Цвет каждой клетки и признак «вода». |
| `factionColor(factionId)` | Цвет фракции (по культуре). |
| `tileColor(i)` | Цвет клетки с учётом режима карты (температура/регионы/фракции/дипломатия). |
| `waterColor(i)` | Цвет воды: темнее с глубиной; в холод у берега лёд. |
| `groundColor(i)` | Цвет земли: биом + плодородие + снег. |
| `snowCoverage(i)` | Доля снега 0 / 1/3 / 2/3 / 1. |
| `nearRiver(i)` | Рядом ли с клеткой река (кэш на карту). |
| `fertilityTint(i, color)` | Подмешивает к земле «плодородие» (влага и близость реки). |
| `shadeStep(color, step)` | Осветлить/затемнить на `step` ступеней (-2..2). |

### 3.4 Слои: холмы, рельеф гор, берега, реки

**`layers/hills.js`** — светотень холмов и овраги.

| Метод | Что делает |
| --- | --- |
| `paintHills()` | Лёгкая светотень «карты холмов» + тёмные овраги в сухих местах. Кэширует разметку. |
| `buildHillHeights()` | Карта холмов по пикселям (шум + крупный рельеф). Кэш. |

**`hill-shading.js`** — вынесено отдельно ради скорости: считает список изменений, потом применяет.

| Метод | Что делает |
| --- | --- |
| `computeHillShading({...}) -> {index, code, count}` | Для каждого пикселя: ступень светотени + признак оврага. |
| `applyHillShading(pixels, {index, code, count})` | Применяет список к пикселям. |

**`layers/relief.js`** — горы (карта высот).

| Метод | Что делает |
| --- | --- |
| `buildReliefHeights()` | Карта высот гор: размытые высоты + гребни трёх масштабов + неровности. Кэш. |
| `addPeaks(height, sharp)` | Острые вершины: от макушки расходятся гребни-«грани». |
| `prepareReliefRows()` | Готовит тоны камня/снега, уровни снега, состояние наклонной проекции. |
| `paintReliefRow(relief, gy)` | Одна строка высот → экран; пустоты (южные склоны) закрашивает цветом склона. |
| `fillColumn(gx, fromY, toY, color)` | Заливает вертикальный отрезок. |
| `blurMountainHeights()` | Дважды размывает высоты гор (горы «набухают», уходит сетка). |
| `tilesNearRelief(blurred)` | Клетки, где может быть рельеф (горы и рядом). |
| `snowLevel(tile)` | С какой высоты лежит снег (зависит от сезона). |
| `liftAtTile(x, y)` | На сколько пикселей поднята поверхность гор в центре клетки. |

**`layers/shores.js`** — пляжи, галька, утёсы.

| Метод | Что делает |
| --- | --- |
| `paintShores()` | Полосы берега волной от воды вглубь суши (затухание по расстоянию). |
| `shoreTypeAt(gx, gy)` | Тип берега в пикселе (из сглаженного поля воды, не из клетки). |
| `paintCliffs()` | Утёсы: каменная «стенка» под южным краем суши и тень на воде. |

**`layers/rivers.js`** — реки, мосты, броды.

| Метод | Что делает |
| --- | --- |
| `riverWidthAt(i)` | Ширина реки в пикселях по расходу воды. |
| `riverWidth(level)` | Ширина по уровню (для кромки). |
| `band(thickness)` | Смещение полосы, чтобы лежала по центру клетки. |
| `paintRivers()` | Красит маску рек с мягкой кромкой (дизеринг). |
| `buildRiverGeometry()` | Форма рек: маска, кромка с расстоянием, «сердцевина». Кэш. |
| `paintBankPixel(xx, yy, k, outside, reachPx)` | Берег реки: песок / галька / мокрая земля. |
| `paintCrossing(x, y, i)` | Мост (перпендикулярно реке) или брод из камней. |

### 3.5 Слои: дороги, поселения, руда, эфир

**`layers/roads.js`**

| Метод | Что делает |
| --- | --- |
| `roadWidth(level)` | Ширина дороги по наезженности. |
| `paintRoads()` | Рисует дороги по `roadLevel` и `roadLinks`. |
| `buildRoadGeometry()` | Геометрия дорог (кэш). |

**`layers/settlements.js`**

| Метод | Что делает |
| --- | --- |
| `settlementLayout(x, y, i)` | Раскладка домиков в клетке (кэш). |
| `layoutSettlement(x, y, i)` | Считает позиции домиков (со «дрожанием», чтобы не было линии). |
| `paintSettlementGround()` | Площадка (утоптанная земля) под поселением. |
| `settlementGround(layout)` | Цвет площадки. |
| `collectSettlement(items, x, y, i)` | Добавляет домики в список декораций. |
| `houseColor(color)` | Цвет дома с поправкой на стиль. |
| `houseSprite(part, roll, snow)` | Спрайт части дома (кэш). |
| `drawHouse(sprite, x, base, part, level)` | Рисует дом. |
| `drawBuildingShadow(x, base, width, height)` | Тень под домом. |

**`layers/minerals.js`**

| Метод | Что делает |
| --- | --- |
| `blitSprite(buffer, left, top)` | Копирует маленький буфер в карту. |
| `oreSprite(kind, variant)` | Спрайт руды (кэш). |
| `drawOreTile(x, y, kind)` | Рисует золото/железо. |
| `etherSprite()` | Спрайт кристалла эфира. |
| `drawEther(x, y)` | Рисует эфир (в тёмном стиле светится). |

### 3.6 Слои: деревья, атмосфера, границы, свет

**`layers/vegetation.js`**

| Метод | Что делает |
| --- | --- |
| `collectTrees(items, x, y, i)` | Добавляет деревья клетки в список декораций. |
| `drawShadow(cx, base, width)` | Тень под объектом. |
| `drawBroadleaf(cx, base, pick)` | Лиственное дерево (крона с рваным краем). |
| `drawBareTree(cx, base, pick)` | Голое дерево (зима). |
| `drawConifer(cx, base, pick, withSnow)` | Ель (ярусы; зимой со снегом). |
| `drawWheat(x, y)` | Пшеница. |

**`layers/props.js`** — атмосфера мёртвых земель (тёмный стиль).

| Метод | Что делает |
| --- | --- |
| `collectProps(items)` | Собирает пропсы по клеткам мёртвых земель/пустошей. |
| `drawCharredStump` / `drawShard` / `drawBones` / `drawCrow` / `drawRuin` / `drawGibbet` | Рисуют обугленный пень / осколок / кости / ворону / развалины / виселицу. |

**`layers/borders.js`** — границы регионов.

| Метод | Что делает |
| --- | --- |
| `borderNoise(gx, gy)` | Крупный волнистый шум для излома линии (непрерывный по пикселям). |
| `edgeBand(dist, wobble, width)` | Пиксель внутри полосы вдоль стороны? |
| `paintRegionBorders()` | Ровная полоса постоянной ширины вдоль всех четырёх сторон клетки. |

**`layers/factions.js`** — границы фракций.

| Метод | Что делает |
| --- | --- |
| `factionNoise(gx, gy)` | Шум для излома границы фракций. |
| `paintFactionBorders()` | Полоса постоянной ширины там, где соседи из разных фракций; у стыка — тёмная обводка + цвет дип-статуса, ближе к земле — цвет фракции. |
| `diplomacyColor(a, b)` | Цвет дип-статуса пары (или `null`). |

**`layers/scene.js`** — сцена (порядок декораций).

| Метод | Что делает |
| --- | --- |
| `paintScene()` | Рисует горы и декорации строкой за строкой снизу вверх (перспектива). |
| `collectDecorations()` | Собирает декорации и сортирует по «основанию» (нижней точке). |

**`layers/texture.js`** — мелкая текстура.

| Метод | Что делает |
| --- | --- |
| `paintTexture()` | Крапинки, волны, цветы, пучки травы. |
| `speckLayout(speckCount)` | Позиции крапинок (кэш на карту). |
| `paintGroundDetail(x, y, i)` | Сезонные мелочи на лугах (цветы весной, листва осенью). |
| `paintTufts(x, y, i)` | Пучки травы (густота зависит от влажности и биома). |
| `putGround(x, y, color)` | Пиксель земли (не поверх воды и реки). |

**`layers/grading.js`** — тёмный стиль и свет.

| Метод | Что делает |
| --- | --- |
| `moodize(color)` | Приглушает цвет построек в тёмном стиле. |
| `applyGrading()` | Финальная обработка: тёмные тона, туман, виньетка. |
| `buildFog()` | Густота тумана по пикселям (кэш). |
| `drawLight(x, y, color, glowColor, glowRadius)` | Источник света: яркий цвет + свечение (после цветокоррекции). |

### 3.7 MapRenderer (камера, ввод, выделение, армии, объекты)

`src/render/renderer/map-renderer.js` — показывает кусок холста painter'а на экране.

| Метод | Что делает |
| --- | --- |
| `new MapRenderer(canvas, map, options)` | Настройки камеры/зума/стиля; создаёт `MapPainter`. |
| `refresh()` | Перерисовать буфер и показать всю карту (после новой генерации). |
| `setView(view)` | Режим карты (terrain/temperature/regions/factions). |
| `setSeason(name)` | Сезон. |
| `setMood(mood)` | `'dark'` / `'light'`. |
| `setShowSettlements(show)` / `setShowBorders(show)` / `setShowFactions(show)` | Переключатели слоёв. |
| `rebuildBuffer()` | Перерисовать карту в буфер (вызывает `painter.paint`). |
| `setViewerFaction(id)` | Чья карта в режиме «Политика». |
| `setRelations(relations)` | Уровни дип-отношений (для цвета границ). |
| `thumbnail(maxSize) -> dataURL` | Мини-копия карты (превью в панели дипломатии). |
| `setArmies(armies)` | Список армий для слоя армий. |
| `get worldSize` | Размер карты в пикселях. |
| `resize()` | Подстроиться под размер холста. |
| `draw()` | Вывести буфер на экран + выделение, армии, объекты. |

**`renderer/camera.js`**

| Метод | Что делает |
| --- | --- |
| `fitToView()` | Показать всю карту по центру. |
| `centerOn(worldX, worldY)` | Центрировать камеру на точке. |
| `clampCamera()` | Не дать камере улететь за край. |
| `panBy(dx, dy)` | Сдвиг на экранных пикселях. |
| `zoomAt(screenX, screenY, factor)` | Зум с сохранением точки под курсором. |
| `screenToWorld(screenX, screenY) -> {x, y}` | Экран → мировые пиксели. |
| `screenToTile(screenX, screenY) -> {x, y}` | Экран → клетка. |

**`renderer/input.js`**

| Метод | Что делает |
| --- | --- |
| `bindEvents()` | Подписка на мышь/тач/клавиатуру. |
| `pointerToCanvas(e) -> {x, y}` | Координаты курсора относительно холста. |
| `reportHover(e)` | Сообщить о наведении (`onHover`). |

**`renderer/selection.js`**

| Метод | Что делает |
| --- | --- |
| `selectAt(point)` | Выделить клетку и её регион. |
| `clearSelection()` | Снять выделение. |
| `regionOutline(region) -> edges` | Внешняя граница региона (отрезки для каждой пограничной стороны). |
| `drawSelection()` | Нарисовать выделение поверх карты. |

**`renderer/objects.js`**

| Метод | Что делает |
| --- | --- |
| `setObjects(list)` | Задать список объектов. |
| `addObject(object)` / `removeObject(id)` | Добавить/убрать объект. |
| `objectBox(object) -> {x, y, width, height, sprite, baseY}` | Где объект на экране. |
| `drawObjects()` | Нарисовать объекты (южнее — позже, перекрывает). |
| `objectAt(point) -> object\|null` | Объект под точкой. |

**`renderer/armies.js`**

| Метод | Что делает |
| --- | --- |
| `setArmyModel(model)` | Задать модель (GameState) для зон. |
| `selectArmy(army)` / `clearArmySelection()` | Выбрать/снять выбор армии. |
| `armyColor(factionId)` | Цвет фракции по культуре. |
| `armyScreenPoint(army) -> {x, y}` | Центр клетки армии на экране. |
| `armyAt(point) -> army\|null` | Маркер под точкой. |
| `drawArmies()` | Нарисовать зоны и маркеры армий. |
| `drawArmyMoveArea()` | Достижимая зона и контур зоны контроля выбранной армии. |
| `drawArmyMarker(army)` | Маркер армии (спрайт в цвете фракции). |

---

## 4. sprites/ — спрайты объектов

`src/sprites/sprite-renderer.js` — рисует отдельные объекты (города, армии) поверх карты.

| Метод | Что делает |
| --- | --- |
| `render(config, options) -> {canvas, width, height, anchorX, anchorY, scale}` | Рисует объект по конфигу. |
| `resolveConfig(config, options)` | Сливает конфиг с опциями. |
| `isActive(layer, options, frame)` | Показывать ли слой в этом кадре/варианте. |
| `repeatOffsets(repeat)` | Смещения для повторяющихся слоёв. |
| `color(spec, context, depth)` | Цвет по спецификации (с палитрой и подстановкой team). |
| `drawLayer(context, layer, dx, dy)` | Рисует один слой объекта. |
| `rasterize(context, layer, dx, dy)` | Растеризует слой (фигуры/точки). |
| `insidePolygon(x, y, points)` | Точка внутри многоугольника? |
| `linePoints(x0, y0, x1, y1)` | Пиксели отрезка. |
| `drawPixels` / `drawScatter` / `drawGradient` | Слои из точек / разброса / градиента. |
| `drawShadow(shadow, anchor)` / `drawOutline(spec)` | Тень / контур объекта. |
| `setPixel(context, x, y, color, alpha)` | Поставить пиксель (с альфой). |
| `toCanvas(context, options, anchor)` | Собрать результат в холст. |

`src/sprites/sprite-examples.js` — `SPRITE_EXAMPLES`: готовые конфиги (`city`, `village`, `army`, ...).

---

## 5. game/ — состояние партии

**`game/cultures.js`**

| Метод | Что делает |
| --- | --- |
| `CULTURE_NAMES`, `CULTURE_COLORS`, `CULTURES` | 7 культур: названия, цвета, склонности (aggression/trade/ether). |
| `cultureById(id)` | Культура по индексу (с заворотом; безопасно для любого числа). |

**`game/ai.js` — класс `AIController`**

| Метод | Что делает |
| --- | --- |
| `new AIController(state)` | ИИ для неигровых фракций. |
| `takeTurn()` | Ход всех неигровых фракций. |
| `playFaction(factionId)` | Полный ход фракции: дипломатия + армия. |
| `cultureOf(factionId)` | Культура фракции. |
| `diplomacy(factionId, culture)` | Меняет отношения с другими (торговые сближаются, агрессивные портят). |
| `actArmy(army, culture)` | Отряд идёт к цели. |
| `pickTarget(army, culture)` | Куда идёт: враг → чужая земля → эфир (для любителей эфира). |

**`game/game-state.js` — класс `GameState`**

| Метод | Что делает |
| --- | --- |
| `new GameState(generator)` | Состояние партии по карте. |
| `reset(generator)` | Новая партия (после генерации). |
| `endTurn() -> {turn, income}` | Ход: доход + ИИ + сброс движения. |
| `advanceTurn()` | Доход и переход «хождения» (без действий ИИ). |
| `monthlyIncome(factionId)` | Доход: население / `POPULATION_PER_GOLD` − содержание отрядов. |
| `factionInfo(factionId)` | Данные фракции (или `null`). |
| `relation(a, b)` / `changeRelation(a, b, delta)` | Отношение пары (0 — нейтралитет) и его изменение. |
| `relationKey(a, b)` | Ключ пары (через `pairKey`). |
| `cultureOf(factionId)` / `cultureColor(factionId)` | Культура и её цвет. |
| `relationLevel(a, b)` / `relationLevels()` | Уровень пары (`'war'`/`'neutral'`/`'ally'`) и все пары. |
| `spawnArmy(factionId)` | Новый отряд в центре крупнейшего региона. |
| `biggestRegion(faction)` / `regionCenter(regionId)` | Крупнейший регион и его центр. |
| `armyById(id)` | Отряд по id. |
| `reachableTiles(army)` / `canReach(army, tile)` | Куда отряд дойдёт / дойдёт ли до клетки. |
| `zoneOfControl(army)` / `neighborsWithin(start, radius)` | Зона контроля / клетки в радиусе. |
| `landDistances(start, radius)` | Общий обход суши в ширину (для двух методов выше). |
| `moveArmy(id, tile)` | Переместить отряд, списав очки движения. |
| `resetArmyMoves()` | Вернуть всем отрядам очки движения. |

**`game/sections.js`** — данные разделов интерфейса: `SECTIONS` (заголовок, `summary(state)`,
`actions`). Новый раздел — одна запись здесь.

---

## 6. ui/ — интерфейс

| Файл / метод | Что делает |
| --- | --- |
| `controls.bindToggle(id, apply)` | Кнопка-переключатель (aria-pressed): `apply(on)` при нажатии. |
| `controls.bindChoiceGroup(name, apply)` | Группа «один из» (`data-<name>`): `apply(значение)`. |
| `controls.bindPanelToggles()` | Кнопки `data-toggle-panel="id"` показывают/прячут панель. |
| `describe.describeTile(tile)` | Текст о клетке (тип, биом, ресурс, регион). |
| `describe.describeRegion(region)` | Текст о регионе. |
| `describe.describeStats(generator)` | Текст-сводка по карте. |
| `sections-panel.createSectionsPanel(state, options)` | Панель разделов: `show(id)`, `toggle(id)`, `refresh()`. |
| `demo-objects.demoObjects(generator)` | Демонстрационные объекты (город, деревня, армия). |

---

## 7. main.js — сборка всего

`src/main.js` — точка входа: создаёт `MapGenerator`, `MapRenderer`, `GameState`, подписывает
кнопки и обновляет подсказки. Здесь же — `buildMap()` (генерация + перерисовка), `renderDiplomacy()`
(превью для панели дипломатии), `syncGame()` (передать армии/отношения в рендерер),
`relationName(level)`. Менять стартовые параметры карты удобнее всего здесь.

---

См. также: [JavaScript для чайников](js-basics.md), [Архитектура](architecture.md),
[Генерация карты](map-generation.md), [Рисование](rendering.md), [Модель данных](data-model.md),
[Параметры и рецепты](tweaking.md).
