/* Справочники: что может лежать в клетке карты */

export const Terrain = Object.freeze({ DEEP_WATER: 0, SHALLOW_WATER: 1, PLAIN: 2, MOUNTAIN: 3 });

export const Biome = Object.freeze({ TUNDRA: 0, TAIGA: 1, GRASSLAND: 2, STEPPE: 3, DESERT: 4, SAVANNA: 5 });

export const Shore = Object.freeze({ NONE: 0, BEACH: 1, ROCKY: 2, CLIFF: 3 });

export const Resource = Object.freeze({ NONE: 0, WOOD: 1, WHEAT: 2, GOLD: 3, ETHER: 4, IRON: 5, SETTLEMENT: 6 });

// Что даёт каждый ресурс (числа условные — настройте под экономику игры). В клетке бывает только один ресурс.
export const ResourceInfo = Object.freeze({
    [Resource.WHEAT]: { name: 'пшеница', produces: { food: 1 } },
    [Resource.WOOD]: { name: 'дерево', produces: { production: 1 } },
    [Resource.IRON]: { name: 'железная руда', produces: { production: 2 } },
    [Resource.GOLD]: { name: 'золотая руда', produces: { gold: 2 } },
    [Resource.ETHER]: { name: 'эфир', produces: { ether: 1 } },
    [Resource.SETTLEMENT]: { name: 'поселение', produces: { population: 1, gold: 1 } } // население — из map.population[клетка]
});

// 8 направлений дороги; индекс направления d и 7 - d — противоположные.
export const ROAD_DIRECTIONS = Object.freeze([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
