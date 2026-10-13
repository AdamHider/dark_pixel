/* Экономика фракций: ресурсы карты.

   Карта даёт четыре вида ресурсов, и каждый привязан к тому, что стоит на клетке (см. ResourceInfo
   в src/map/constants.js):

     еда        — пшеница (поля);
     производство — лес, железная руда и эфир;
     население  — поселения (их население из map.population);
     золото     — золотая руда и поселения.

   Мы считаем «приток» (сколько ресурса даёт территория фракции) и «расход» (что тратит её
   население и армия). Разница — баланс за ход.

   ГЛАВНОЕ: сама формула вынесена в одну функцию `computeResourceFlow()`. Её можно заменить целиком,
   не трогая остальное: в `GameState.reset()` присвойте `this.resourceFlow = мояФункция`.
   Функция получает контекст { generator, factionId, counts, population, armies } и возвращает
   объект { food, production, population, gold } с полями { income, upkeep, balance } по каждому ресурсу. */

import { Resource } from '../map/constants.js';

/* Что производит каждая клетка ресурса. Числа условные — правьте под свою экономику.
   Ключ — код Resource, значение — сколько и какого ресурса даёт одна такая клетка. */
export const RESOURCE_YIELD = Object.freeze({
    [Resource.WHEAT]: { food: 2 },
    [Resource.WOOD]: { production: 1 },
    [Resource.IRON]: { production: 2 },
    [Resource.ETHER]: { production: 2 },
    [Resource.GOLD]: { gold: 3 },
    [Resource.SETTLEMENT]: { gold: 1 }   // население поселения считается отдельно — из map.population
});

/* Расход на одного жителя и на один отряд — тоже константы, их удобно крутить. */
export const FOOD_PER_POPULATION = 0.05;   // сколько еды в ход съедает сотня жителей (население / 20)
export const GOLD_PER_POPULATION = 0.02;   // налоги и содержание: население / 50 золота в ход
export const PRODUCTION_PER_ARMY = 4;      // сколько производства требует один отряд

// Порядок и подписи ресурсов — для интерфейса (панель экономики, строка сверху).
export const RESOURCE_KINDS = Object.freeze([
    Object.freeze({ key: 'food', name: 'Еда', icon: '🌾' }),
    Object.freeze({ key: 'production', name: 'Производство', icon: '🔨' }),
    Object.freeze({ key: 'population', name: 'Население', icon: '👥' }),
    Object.freeze({ key: 'gold', name: 'Золото', icon: '💰' })
]);

/* Сколько каких ресурсных клеток у фракции. Возвращает массив по кодам Resource (индекс — код). */
export function countFactionResources(generator, factionId) {
    const counts = new Array(Resource.SETTLEMENT + 1).fill(0);
    const factionId_of = generator.factionId;
    if (!factionId_of) return counts;
    for (const i of generator.landTiles) {
        if (factionId_of[i] !== factionId) continue;
        counts[generator.resource[i]]++;
    }
    return counts;
}

/* Формула притока/расхода. Её и предполагается заменять.
   Приток: поля дают еду, лес/руда/эфир — производство, руда и поселения — золото.
   Население фракции — сумма населения её поселений (плюс небольшая база, чтобы не было нуля).
   Расход: еда — на жителей, производство — на отряды, золото — на жителей. */
export function computeResourceFlow({ counts, population, armies }) {
    const income = { food: 0, production: 0, population: 0, gold: 0 };
    for (let code = 1; code < counts.length; code++) {
        const count = counts[code];
        if (!count) continue;
        const yield_ = RESOURCE_YIELD[code];
        if (!yield_) continue;
        income.food += (yield_.food || 0) * count;
        income.production += (yield_.production || 0) * count;
        income.gold += (yield_.gold || 0) * count;
    }
    income.population = population;

    const upkeep = {
        food: Math.round(population * FOOD_PER_POPULATION),
        production: armies * PRODUCTION_PER_ARMY,
        population: 0,                                    // население — запас, а не расход
        gold: Math.round(population * GOLD_PER_POPULATION)
    };

    const balance = {};
    for (const { key } of RESOURCE_KINDS) balance[key] = income[key] - upkeep[key];
    return { income, upkeep, balance };
}
