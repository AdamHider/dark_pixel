# Параметры и рецепты правок

Здесь собраны: где задаются параметры, как их менять и готовые рецепты для типовых задач.

## Где какие параметры

| Что | Где | Как передать |
| --- | --- | --- |
| Генерация карты (рельеф, климат, зоны, реки, поселения, дороги) | `src/map/defaults.js` (`DEFAULTS`) | `new MapGenerator({ seed: 7, steppeShare: 0.12 })` |
| Рисование (размер клетки, горы, дома, свет) | `src/render/painter/map-painter.js` (конструктор) | `new MapRenderer(canvas, generator, { tileSize: 16, peakSharpness: 0.75 })` |
| Палитры сезонов | `src/render/seasons.js` | правка объектов `SEASONS` / `DARK_SEASONS` |
| Фиксированные цвета, пороги, ступени | `src/render/painter/constants.js` | правка констант |
| Коды (типы, биомы, ресурсы) | `src/map/constants.js` | правка констант |

Параметры `DEFAULTS` заморожены (`Object.freeze`), но любой можно переопределить при создании генератора:
значения из `options` перекрывают значения по умолчанию (`{ ...DEFAULTS, ...options }`).

**Пример:** `src/main.js` — здесь создаётся генератор карты со `size: 150` и рендерер. Меняйте числа тут или
раскомментируйте строки с параметрами.

## Как менять размер карты и клетки

```js
// src/main.js
const generator = new MapGenerator({ size: 150, seed: 1 });        // 150×150 клеток
const renderer = new MapRenderer(canvas, generator, { tileSize: 12 }); // 12 пикселей на клетку
```

`tileSize` влияет только на вид (крупнее/мельче пиксель), а `size` — на содержание карты (больше/меньше
клеток, дольше генерация). Меняя `tileSize`, проверяйте рисунки: все они должны использовать `px(n)`, а не
абсолютные пиксели.

---

## Рецепты

### Сделать берега более естественными

Берег рисуется скруглением углов побережья (`roundCoastCorners` в `coast.js`): у прибрежной суши
подрезаются углы, смотрящие в воду. Радиус — доля клетки, поэтому форма углов одинакова при любом
`tileSize`. Мягкость полосы берега (пляж/галька) задаёт `coastSharpness`.

Силуэт самого берега регулируют `shapeVariety`, `coastDetail`, `warpStrength` в `src/map/defaults.js`.

### Другие горы

```js
new MapRenderer(canvas, generator, {
    peakSharpness: 1,   // острые пики; 0 — округлые холмы
    mountainLift: 20,   // выше поднимаются
    hillStrength: 0.3,  // меньше холмов на равнинах
});
```

Сколько гор и как они сгруппированы — в генерации: `mountainShare`, `mountainClustering`, `ridgeScale`.

### Больше/меньше поселений

```js
new MapGenerator({
    settlementsPerRegionMax: 2,   // не больше 2 групп в регионе
    settlementSpacing: 3,         // дальше друг от друга
    populationPerHabitability: 6, // беднее регионы
    populationVariation: 0.6,     // ровнее между регионами
});
```

Число домиков в клетке — `settlementMaxLevel` (уровни) и параметры рисования `settlementMinHouses`,
`settlementMaxHouses`, `settlementOverflow` в рендерере.

### Равномернее разложить пшеницу

```js
new MapGenerator({
    wheatMinPerRegion: 3,  // минимум полей на регион
    wheatShare: 0.55,
});
```

Механизм — `distributeWheat()` в `src/map/steps/resources.js`: добивает регионы с нехваткой полей.

### Сильнее/слабее зоны

```js
new MapGenerator({
    steppeShare: 0.15,    // больше степей
    deadLandShare: 0.1,   // больше мёртвых земель
    deadLandMoisture: 0.3, // мёртвые земли заходят и во влажноватые края
    etherLandShare: 0.08, // больше земель эфира
    etherLandDensity: 0.8, // эфира внутри них гуще
    zoneScale: 3,         // пятна мельче и чаще
});
```

Ноль выключает зону. Логика — `assignZones()` в `src/map/steps/climate.js`.

### Реки шире/уже и извилистее

```js
new MapGenerator({
    rainfall: 1.5,                 // больше воды -> шире реки
    riverThresholds: [40, 120, 320], // ниже пороги -> больше рек
    riverMeander: 0.03,            // русла петляют сильнее
    riverCrossingChance: 0.2,      // больше мостов и бродов
});
```

### Дороже/дешевле дороги

```js
new MapGenerator({
    roadNeighbors: 2,     // меньше соседей соединяем
    roadMaxDistance: 18,  // дороги короче
    roadLoopChance: 0.2,  // меньше петель
});
```

Или выключить совсем: `roads: false`.

### Светлее/темнее стиль

```js
new MapRenderer(canvas, generator, {
    mood: 'dark',      // 'dark' | 'light'
    grade: true,
    vignette: 0.5,
});
```

Палитры — `src/render/seasons.js`; интенсивность эффектов (туман, виньетка) — `grading.js`.

---

## Как добавить новый биом или зону

1. Добавьте код в `Biome` (`src/map/constants.js`).
2. В `assignZones()` (`src/map/steps/climate.js`) добавьте слой шума и условие подмены биома (по образцу
   степей/мёртвых/эфирных земель). Новый шум объявите в `createNoiseLayers()` (`src/map/map-generator.js`) с
   уникальным `seed + N`.
3. Задайте цвет биома в палитрах (`src/render/seasons.js`) и/или в `tile-colors.js`.
4. Если биом должен влиять на ресурсы/поселения — добавьте проверку в `placeResources()` /
   `isSettlementSite()`.

## Как добавить новый этап генерации

1. Создайте `src/map/steps/my-step.js`:
   ```js
   export const myStep = {
       generateMyStep() { /* this — MapGenerator */ },
   };
   ```
2. Импортируйте и подмешайте в `src/map/map-generator.js`:
   ```js
   import { myStep } from './steps/my-step.js';
   Object.assign(MapGenerator.prototype, elevation, /* ... */ myStep);
   ```
3. Вызовите метод из `generate()` в нужном месте (до/после тех этапов, данные которых он использует).
4. Если нужен новый массив — заведите его в `allocateLayers()` и опишите в [data-model.md](data-model.md).

## Как добавить новый слой рисования

1. Создайте `src/render/painter/layers/my-layer.js`:
   ```js
   export const myLayer = {
       paintMyLayer() { /* this — MapPainter, пишите в this.pixels */ },
   };
   ```
2. Импортируйте и добавьте в `Object.assign(MapPainter.prototype, /* ... */ myLayer)` в
   `src/render/painter/map-painter.js`.
3. Вызовите `this.paintMyLayer()` из `paint()` в нужном месте порядка слоёв.

> Пишите через `this.put(...)`, `this.rect(...)`, `this.linePoints(...)` и цвета из `this.colors` /
> `this.pal`, а размеры задавайте через `this.px(n)` (и `this.pxMin(n)` для деталей, чтобы они не схлопывались в 0).

---

## Отладка

- **Не совпадает тип клетки и картинка.** Тип при наведении берётся из данных генератора
  (`getTileInfo`), картинка — из `waterMask`. Следите, чтобы слой, меняющий берег, обновлял `waterMask`
  (как `roundCoastCorners`).
- **Пропали детали после смены `tileSize`.** Значит, где-то использованы абсолютные пиксели вместо `px(n)`.
- **Слои накладываются не туда.** Проверьте порядок в `paint()` — декорации рисуются снизу вверх
  (`collectDecorations` сортирует по «основанию»).
- **Быстрый просмотр конкретной клетки.** Откройте `index.html`, наведите мышь: подсказка показывает тип,
  биом, ресурс, регион (см. `src/ui/describe.js`).
