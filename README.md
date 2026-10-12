# Dark Pixel

Пошаговая стратегия в стиле pixel art на чистом JavaScript (ES-модули, без сборщика).

## Запуск

ES-модули не загружаются при открытии `index.html` напрямую (`file://`), нужен любой локальный сервер:

```bash
npm start                       # http-server на http://localhost:8080
# или
python3 -m http.server 8080
```

Либо расширение Live Server в VS Code.

## Проверка кода

```bash
npm install
npm run lint
```

## Структура

```
index.html                 разметка интерфейса
css/main.css               стили
src/
  main.js                  точка входа: генератор + рендерер + кнопки
  core/                    общие утилиты: math, random, ValueNoise, MinHeap
  map/                     генерация карты (данные, без рисования)
    constants.js           Terrain, Biome, Shore, Resource...
    defaults.js            параметры генерации по умолчанию
    map-generator.js       класс MapGenerator: состояние и конвейер generate()
    steps/                 этапы генерации: elevation, terrain, climate, resources,
                           rivers, regions, settlements, roads
  render/
    color.js               упакованные цвета (packRgb, mixPacked, shadePacked...)
    seasons.js             палитры сезонов (светлый и тёмный стиль)
    painter/               отрисовка карты в один большой холст
      map-painter.js       класс MapPainter: состояние и порядок слоёв в paint()
      layers/              слои: base, tile-colors, hills, shores, relief, rivers,
                           texture, roads, settlements, minerals, vegetation,
                           props, borders, scene, grading
    renderer/              класс MapRenderer: камера, ввод, выделение, объекты
  sprites/                 SpriteRenderer и примеры конфигов спрайтов
  ui/                      описания клеток/регионов и помощники для кнопок
tools/image_converter/     вспомогательная утилита
```

### Как устроены большие классы

`MapGenerator`, `MapPainter` и `MapRenderer` хранят состояние и задают порядок работы, а методы каждого
этапа/слоя лежат в отдельных модулях и подмешиваются в прототип:

```js
// src/map/steps/rivers.js
export const rivers = {
    generateRivers() { /* this — экземпляр MapGenerator */ },
};

// src/map/map-generator.js
Object.assign(MapGenerator.prototype, elevation, terrain, climate, resources, rivers, regions, settlements, roads);
```

Новый этап — новый файл в `steps/` (или `layers/`), добавленный в `Object.assign` и вызванный из `generate()` / `paint()`.
