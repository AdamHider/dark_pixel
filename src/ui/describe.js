/* Текстовые описания клеток и регионов для интерфейса */

import { Resource, Terrain } from '../map/constants.js';

const TERRAIN_NAMES = ['глубокая вода', 'мелководье', 'равнина', 'гора'];
const BIOME_NAMES = ['тундра', 'тайга', 'равнина', 'степь', 'пустыня', 'саванна', 'мёртвые земли', 'земли эфира'];
const RESOURCE_NAMES = ['', 'дерево', 'пшеница', 'золотая руда', 'эфир', 'железная руда', 'поселение'];
const CROSSING_NAMES = ['', 'брод', 'каменный мост'];
const FORTRESS_NAMES = { keep: 'сторожевой пост', coast: 'порт-крепость', mountain: 'горная твердыня' };

function temperatureName(t) {
    if (t < 0.25) return 'холодно';
    if (t < 0.5) return 'прохладно';
    if (t < 0.75) return 'тепло';
    return 'жарко';
}

export function describeTile(tile) {
    let kind = TERRAIN_NAMES[tile.terrain];
    if (tile.terrain < Terrain.PLAIN) kind = `${kind}, глубина ${tile.waterDepth}`;
    if (tile.terrain === Terrain.PLAIN) kind = tile.hasRiver ? `река (глубина ${tile.riverLevel})` : BIOME_NAMES[tile.biome];
    if (tile.crossing) kind += `, ${CROSSING_NAMES[tile.crossing]}`;

    const parts = [`(${tile.x}, ${tile.y})`, kind, `${temperatureName(tile.temperature)} (${Math.round(tile.temperature * 100)}%)`];
    if (tile.resource !== Resource.NONE && tile.resource !== Resource.SETTLEMENT) parts.push(`ресурс: ${RESOURCE_NAMES[tile.resource]}`);
    if (tile.resource === Resource.SETTLEMENT) parts.push(`население ${tile.population} (уровень ${tile.settlementLevel}, группа из ${tile.settlementGroupSize} кл.)`);
    if (tile.roadLevel > 0) parts.push('дорога');
    if (tile.fortress) parts.push(`крепость: ${FORTRESS_NAMES[tile.fortress.kind] || tile.fortress.kind}`);
    if (tile.regionId >= 0) parts.push(`регион #${tile.regionId}, ${tile.regionSize} кв.`);
    if (tile.factionName) parts.push(`фракция: ${tile.factionName}`);
    return parts.join(' · ');
}

export function describeRegion(region) {
    const resources = region.resources
        .map((count, code) => (count > 0 && code !== Resource.NONE ? `${RESOURCE_NAMES[code]}: ${count}` : null))
        .filter(Boolean);
    const dominantBiome = BIOME_NAMES[region.biomes.indexOf(Math.max(...region.biomes))];

    const parts = [`Регион #${region.id}: ${region.size} кв.`, `население региона ${region.population}`, `преобладает ${dominantBiome}`];
    if (region.factionName) parts.push(`фракция: ${region.factionName}`);
    if (region.mountains > 0) parts.push(`гор: ${region.mountains}`);
    if (region.riverTiles > 0) parts.push(`рек: ${region.riverTiles}`);
    if (region.coastal) parts.push('выход к воде');
    parts.push(resources.length ? `ресурсы — ${resources.join(', ')}` : 'ресурсов нет');
    return parts.join(' · ');
}

export function describeStats(generator) {
    const landPercent = Math.round(generator.landShare * 100);
    const regions = generator.regionCount;
    const average = (generator.landTiles.length / regions).toFixed(1);
    return `Суша: ${landPercent}% · регионов: ${regions} · в среднем ${average} кв. Наведите на квадрат.`;
}
