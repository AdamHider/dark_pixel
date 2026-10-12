/* Пример объектов на карте: деревня, город и армия — просто чтобы показать, как это работает.
   Своё: renderer.setObjects([{ id, config, tile: [x, y], options }]) — формат конфигов описан в src/sprites/sprite-renderer.js. */

import { Resource, Terrain } from '../map/constants.js';
import { SPRITE_EXAMPLES } from '../sprites/sprite-examples.js';

export function demoObjects(generator) {
    // Три свободные клетки суши поближе к центру карты.
    const size = generator.size;
    const center = size / 2;
    const distance = i => Math.hypot(i % size - center, Math.floor(i / size) - center);
    const free = generator.landTiles
        .filter(i => generator.terrain[i] === Terrain.PLAIN && !generator.river[i] && generator.resource[i] === Resource.NONE)
        .sort((a, b) => distance(a) - distance(b));
    const spot = k => [free[k * 6] % size, Math.floor(free[k * 6] / size)];

    return [
        { id: 'city-1', config: SPRITE_EXAMPLES.city, tile: spot(0), options: { colors: { team: '#c0392b' } } },
        { id: 'village-1', config: SPRITE_EXAMPLES.village, tile: spot(1) },
        { id: 'army-1', config: SPRITE_EXAMPLES.army, tile: spot(2), options: { colors: { team: '#2e86c1' }, flags: ['marching'] } }
    ];
}
