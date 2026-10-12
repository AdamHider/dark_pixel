# Архитектура

## Поток данных

```
seed ──► MapGenerator.generate() ──► плоские массивы (terrain, biome, river, regionId, ...)
                                              │
                                              ▼
index.html  ──►  MapRenderer  ──►  MapPainter.paint()  ──►  Canvas (пиксели)
                     │                    ▲
                     │                    └── читает массивы генератора
                     ▼
              камера, ввод, выделение, всплывающие подсказки (ui/describe.js)
```

Три больших класса, у каждого своя роль:

| Класс | Файл | Отвечает за |
| --- | --- | --- |
| `MapGenerator` | `src/map/map-generator.js` | «Что где находится»: рельеф, климат, реки, регионы, поселения. Данные, без цвета. |
| `MapPainter` | `src/render/painter/map-painter.js` | Рисует всю карту в один `ImageData` — пиксель за пикселем. Читает данные генератора. |
| `MapRenderer` | `src/render/renderer/map-renderer.js` | Канвас на экране: камера, зум, ввод мышью, выделение клеток, объекты-спрайты. |

`src/main.js` связывает их: создаёт генератор и рендерер, подписывает кнопки интерфейса, обновляет подсказки.

## Как модули подмешиваются в классы

Классы хранят только состояние и задают порядок работы. Сами этапы и слои лежат в отдельных файлах и
добавляются в прототип через `Object.assign`. У методов `this` — это экземпляр класса.

```js
// src/map/steps/elevation.js
export const elevation = {
    generateElevation() { /* this — экземпляр MapGenerator */ },
};

// src/map/map-generator.js
Object.assign(MapGenerator.prototype, elevation, terrain, climate, resources, rivers, regions, settlements, roads);
```

То же для рисования (`src/render/painter/map-painter.js`):

```js
Object.assign(MapPainter.prototype, base, coast, tileColors, hills, shores, relief, rivers, texture, grading, props, roads, settlements, minerals, borders, scene, vegetation);
```

**Практический вывод.** Чтобы добавить новый этап генерации (или слой рисования), не нужно трогать большой
класс: создайте файл в `steps/` (или `layers/`), экспортируйте объект с методами, добавьте его в `Object.assign`
и вызовите метод из `generate()` (или `paint()`).

## Соглашения о неймингах и хелперах

Чтобы код читался одинаково, придерживаемся этих правил:

- **Имена методов — глаголы:** `paint*` — слои рисования (`paintShores`, `paintRivers`), `collect*` —
  сбор объектов сцены (`collectTrees`, `collectSettlement`), `build*` — сборка данных/геометрии
  (`buildTileColors`, `buildRiverGeometry`), `draw*` — рисование одного объекта (`drawHouse`, `drawEther`).
- **Имена массивов данных — существительные:** `terrain`, `biome`, `river`, `crossing`, `waterMask`,
  `tileColors`, `tileWater`.
- **Индексы:** `i` — номер клетки (`y * size + x`), `k` — номер пикселя (`gy * width + gx`), `x`/`y` —
  координаты клетки, `gx`/`gy` — координаты пикселя.
- **Размеры спрайтов** задаются в «пикселях клетки 16×16» и переводятся через `this.px(n)`. Для мелких
  деталей — `this.pxMin(n)`, чтобы значение не схлопнулось в 0 при маленькой клетке. Абсолютные пиксели в спрайтах
  не пишем.
- **Детерминированный «случай»** — только через `tileHash(x, y, salt)` / `hashUnit(...)` (см.
  `src/render/painter/noise.js`), чтобы рисунок не менялся при перерисовке.
- **Кэши:** один объект-кэш на слой (`this.riverCache`, `this.spriteCache`), в
  ключе — всё, что влияет на результат (карта, `tileSize`, сезон, стиль). Кэш сравнивается по ссылке на
  исходный массив, а не копируется.
- **Магические числа** выносим в `options` (конструктор `MapPainter`/`MapGenerator`) или в константы
  (`src/map/constants.js`, `src/render/painter/constants.js`).

## Порядок этапов генерации

`MapGenerator.generate(seed)` вызывает этапы строго по порядку — каждый следующий опирается на данные предыдущих:

```js
this.generateElevation();      // высоты и хребты
this.scatterIslands();         // острова у материка
this.generateMoisture();       // влажность
this.classifyTerrain();        // суша/вода/горы по порогам
this.removeSmallMountains();   // чистка
this.removeSmallIslands();     // чистка
this.collectLandTiles();       // список клеток суши
this.fillDepressions();        // сток воды, озёра
this.computeWaterDepth();      // глубина воды, мелководье
this.generateTemperature();    // температура
this.assignBiomes();           // биомы и особые зоны
this.placeResources();         // лес и поля
this.generateRivers();         // русла рек по стоку
this.classifyShores();         // типы берегов
this.placeRareResources();     // золото, железо, эфир
this.placeRiverCrossings();    // мосты и броды
this.buildRegions();           // регионы
this.distributeWheat();        // гарантированные поля по регионам
this.placeSettlements();       // население и поселения
this.buildRoads();             // дороги между поселениями
```

Подробно каждый этап разобран в [map-generation.md](map-generation.md).

## Порядок слоёв рисования

`MapPainter.paint()` рисует слои снизу вверх:

```js
this.paintBase();          // 1. цвет каждой клетки + дизеринг границ
this.roundCoastCorners();  // 2. скругление углов побережья
if (terrain) {
    this.relief = this.buildReliefHeights();  // карта высот гор
    this.paintHills();                        // 3. тени холмов
    this.paintShores();                       // 4. пляжи, галька, утёсы
    this.paintRivers();                       // 5. реки, кромка, броды
    this.paintRoads();                        // 6. дороги
    this.paintSettlementGround();             //    площадки под поселения
}
this.paintTexture();       // 7. крапинки, волны, цветы, листва
if (showBorders) this.paintRegionBorders();   // 8. границы регионов
if (terrain) this.paintScene();               // 9. декорации (деревья, дома, руда) — снизу вверх
if (dark) this.applyGrading();                // 10. цветокоррекция, туман, виньетка
for (const draw of this.emissive) draw();     // 11. источники света (окна, костры, эфир)
```

Подробно — в [rendering.md](rendering.md).

## Формат карты

Карта — квадрат `size × size` клеток. Клетка `(x, y)` хранится по индексу `y * size + x` в плоских массивах.
Один и тот же индекс `i` используется во всех массивах (`terrain[i]`, `biome[i]`, `river[i]`, ...). Это
самый быстрый способ хранить сетки в JS, и он одинаков во всём коде. Полный список массивов — в
[data-model.md](data-model.md).

## Интерфейс

`index.html` задаёт разметку: канвас карты, панель подсказок (`#info`), панель выделения (`#selection`),
поле сида (`#seed`), кнопки. `src/ui/controls.js` — мелкие помощники для кнопок и переключателей,
`src/ui/describe.js` — текстовые описания статистики карты, региона и клетки для подсказок при наведении.

## Спрайты (объекты поверх карты)

`src/render/renderer/objects.js` и `src/sprites/sprite-renderer.js` рисуют отдельные объекты (например,
демонстрационные) поверх карты уже после её отрисовки. Их данные — `src/ui/demo-objects.js`. Это отдельный
механизм от пиксельной отрисовки карты: он нужен для интерактивных объектов с координатами и кликами.
