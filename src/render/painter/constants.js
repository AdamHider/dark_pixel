/* Константы художника карты: цвета, не зависящие от сезона, пороги снега и льда, дизеринг */

export const COLORS = {
    bridgeDeck: '#a39e92',
    bridgeEdge: '#6e6a62',
    stone: '#b9b5ab',
    stoneShadow: '#7d7a72',
    gold: '#f2d15b',
    goldShadow: '#8a6a14',
    goldLight: '#fff2b0',
    riftDark: '#2a1250',
    riftGlow: '#a45cff',
    riftCore: '#e9ccff',
    regionBorder: '#19110a',
    factionBorder: '#0c0906',                 // тёмная обводка границы фракции
    factionColors: ['#c0503a', '#3d6ea8', '#4f8f52', '#b08a2e', '#7a4f9c', '#2f8f8f'], // цвет каждой фракции по кругу
    sand: '#dccb96',
    wetSand: '#b5a67c',
    pebbleLight: '#a9a59a',
    pebbleDark: '#6f6c66',
    stoneMid: '#8a877e',
    hay: '#c9b774',
    dirt: '#8a7650',
    dirtLight: '#a89168',
    mud: '#5d4f38',
    plank: '#4a3524',
    wallA: '#dccca4',
    wallB: '#c8b48c',
    thatch: '#b09a5a',
    roofA: '#a24d34',
    roofB: '#7e3a2c',
    roofC: '#8d6238',
    roofD: '#5e5a66',
    outline: '#140e0a',
    window: '#f0b24a',
    fire: '#ffb347',
    fireCore: '#fff0b0',
    chapelStone: '#8d8a85',
    bone: '#cfc8b4',
    crow: '#16161a'
};

// Температуры (с учётом сезона), при которых выпадает снег и замерзает вода.
export const SNOW_TEMPERATURE = 0.30;       // холоднее — на земле лежит снег

export const ICE_TEMPERATURE = 0.16;        // холоднее — у берега замерзает вода

export const RIVER_ICE_TEMPERATURE = 0.12;  // холоднее — замерзают реки

// С какой глубины (в клетках от берега) начинается следующий оттенок воды.
export const WATER_DEPTH_STEPS = [1, 2, 3, 5, 8];

export function waterShadeIndex(depth) {
    let index = 0;
    for (let k = 0; k < WATER_DEPTH_STEPS.length; k++) {
        if (depth >= WATER_DEPTH_STEPS[k]) index = k;
    }
    return index;
}

// Матрица упорядоченного дизеринга 4×4: даёт «пиксельный» градиент вместо плавного размытия.
export const STEP_AMOUNTS = Int32Array.from([-30, -15, 0, 15, 28]); // ступени светотени холмов, в долях от 256

export const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], v => (v + 0.5) / 16);
