# Модель данных

Карта — квадрат `size × size` клеток. Клетка `(x, y)` хранится по индексу:

```js
i = y * size + x;
```

Один и тот же индекс `i` используется во **всех** массивах карты: `terrain[i]`, `biome[i]`, `river[i]` и
так далее. Это быстрее объектов и одинаково во всём коде.

## Массивы `MapGenerator` (создаются в `allocateLayers()`)

| Массив | Тип | Что хранит |
| --- | --- | --- |
| `elevation` | Float32 | высота рельефа (шум + спад к краям) |
| `ridge` | Float32 | 0..1: насколько клетка похожа на горный хребет |
| `massif` | Float32 | 0..1: крупные «пятна» для горных массивов |
| `moisture` | Float32 | 0..1: влажность |
| `temperature` | Float32 | 0..1: температура (0 — холод, 1 — жара) |
| `terrain` | Uint8 | тип: `Terrain.DEEP_WATER/SHALLOW_WATER/PLAIN/MOUNTAIN` |
| `biome` | Uint8 | биом (только у равнин): `Biome.*` |
| `mountainHeight` | Float32 | 0 вне гор; 0.3..1 в горах — «высота» для рисования |
| `waterDepth` | Uint8 | 0 на суше; в воде — расстояние до ближайшей суши (в клетках) |
| `shore` | Uint8 | тип берега у суши рядом с водой/рекой: `Shore.*` |
| `resource` | Uint8 | ресурс клетки: `Resource.*` (в клетке не больше одного) |
| `river` | Uint8 | 0 — реки нет; 1..3 — глубина/уровень реки |
| `riverFlow` | Uint16 | сколько воды проходит через клетку (ширина реки) |
| `riverTo` | Int32 | куда течёт река из клетки (-1 — не река или сток за край) |
| `crossing` | Uint8 | 0 — нет; 1 — брод; 2 — каменный мост |
| `regionId` | Int16 | номер региона (-1 — вода/вне региона) |
| `factionId` | Int16 | номер фракции (-1 — вода/вне фракции) |
| `roadLevel` | Uint8 | 0 — нет дороги; 1..3 — насколько наезжена |
| `roadLinks` | Uint8 | биты: в какие из 8 сторон идёт дорога (`ROAD_DIRECTIONS`) |
| `population` | Uint16 | население в клетке с поселением |
| `settlementLevel` | Uint8 | уровень клетки с поселением 1..4 (0 — нет) |
| `settlementGroup` | Int16 | номер группы поселений в клетке (-1 — нет) |

### Не сеточные данные

| Поле | Что это |
| --- | --- |
| `settlements` | список по клеткам с поселениями: `{ id, groupId, regionId, tile, population, level, center }` |
| `settlementGroups` | группы соседних клеток: `{ id, regionId, tiles, tile (центр), population }` |
| `regionPopulation` | объект `id региона → население` |
| `regionSizes` | объект `id региона → число клеток` |
| `regionFaction` | Int16: `id региона → id фракции` (-1 — не назначен) |
| `factions` | список фракций: `{ id, name, regions, tiles, population }` |
| `factionTiles` / `factionPopulation` | число клеток и население по каждой фракции |
| `landTiles` | список индексов всех клеток суши (заполняется `collectLandTiles`) |
| `seaLevel` | уровень моря (порог высоты) |
| `filled` / `flowTo` | результат заливки впадин (`fillDepressions`): уровень воды и сток |

## Справочники — `src/map/constants.js`

```js
Terrain   = { DEEP_WATER: 0, SHALLOW_WATER: 1, PLAIN: 2, MOUNTAIN: 3 }
Biome     = { TUNDRA: 0, TAIGA: 1, GRASSLAND: 2, STEPPE: 3, DESERT: 4, SAVANNA: 5, DEAD_LAND: 6, ETHER_LAND: 7 }
Shore     = { NONE: 0, BEACH: 1, ROCKY: 2, CLIFF: 3 }
Resource  = { NONE: 0, WOOD: 1, WHEAT: 2, GOLD: 3, ETHER: 4, IRON: 5, SETTLEMENT: 6 }
```

- **`BIOME_COUNT`** — сколько всего биомов, для массивов-сводок по регионам.
- **`ResourceInfo`** — что даёт каждый ресурс (для интерфейса/экономики).
- **`ROAD_DIRECTIONS`** — 8 направлений дороги; направление `d` и `7 - d` — противоположные.

## Полезные методы `MapGenerator`

| Метод | Что делает |
| --- | --- |
| `index(x, y)` | индекс клетки `y * size + x` |
| `neighbors(i)` | 4 соседа (по сторонам) внутри карты |
| `neighbors8(i)` | 8 соседей (со диагональными) |
| `isLand(i)` | суша ли клетка (`terrain >= PLAIN`) |
| `getTileInfo(x, y)` | всё о клетке для подсказки при наведении |
| `getRegionInfo(regionId)` | сводка по региону (размер, горы, ресурсы, биомы, поселения) |

## Вспомогательные модули — `src/core/`

- `math.js` → `rankNormalize(values)` (переводит в равномерные 0..1, сохраняя порядок), `percentile`
  (значение по доле), `clamp`, `smoothstep`, `lerp`.
- `random.js` → `hash32(n)` (детерминированный хэш), `createRandom(seed)` (генератор случайных чисел).
- `value-noise.js` → `ValueNoise` с методом `fractal(x, y, octaves)` — основа всего рельефа.
- `min-heap.js` → `MinHeap` для priority-flood (реки) и A* (дороги).

## Инварианты, о которых полезно помнить

- **В клетке не больше одного ресурса.** Поселение — тоже ресурс (`Resource.SETTLEMENT`), поэтому оно не
  может стоять на золоте, железе, эфире или поле.
- **Реки — часть рельефа.** `river[i] > 0` только у равнин; на мёртвых/эфирных землях нет ресурсов, но река
  может течь (она появляется раньше биомов? нет — позже; см. порядок этапов в
  [map-generation.md](map-generation.md)).
- **`regionId[i]` = -1 для воды.** Регион есть только у суши.
- **`shore[i]` заполнен только у суши рядом с водой или рекой**, для остальных клеток — `Shore.NONE`.
- **Все массивы имеют длину `size * size`** (кроме списков `landTiles`, `settlements`, `settlementGroups`).
