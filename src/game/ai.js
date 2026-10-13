/* ИИ неигровых фракций.

   Поведение каждой фракции задаётся её культурой (см. src/game/cultures.js): агрессивные нападают и
   тянутся к чужим землям, торговые улучшают отношения и ищут союзы, любящие эфир — идут к эфирным землям.
   ИИ детерминирован: все «броски» выводятся из номера хода и фракции, поэтому одна и та же карта
   разыгрывается одинаково. Класс AIController управляет всеми фракциями, кроме фракции игрока. */

import { cultureById } from './cultures.js';

// «Случайное» число 0..1, одинаковое при одном и том же ходе и фракции.
function roll(seed, a, b, c) {
    let h = (seed * 374761393 + a * 668265263 + b * 2147483647 + c * 1274126177) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 100000) / 100000;
}

export class AIController {
    constructor(state) {
        this.state = state;
        this.seed = 1;
    }

    // Один ход для всех неигровых фракций.
    takeTurn() {
        const state = this.state;
        for (let f = 0; f < state.factionCount; f++) {
            if (f === state.playerFaction) continue;
            this.playFaction(f);
        }
        return state.factionCount - (state.playerFaction < state.factionCount ? 1 : 0);
    }

    // Полный ход одной фракции: дипломатия, затем армия.
    playFaction(factionId) {
        const state = this.state;
        const culture = cultureById(this.cultureOf(factionId));
        if (!culture) return;

        this.diplomacy(factionId, culture);

        const armies = state.armies.filter(army => army.faction === factionId);
        for (const army of armies) this.actArmy(army, culture);
    }

    cultureOf(factionId) {
        const faction = this.state.factionInfo(factionId);
        return faction && faction.culture !== undefined ? faction.culture : factionId;
    }

    /* ---------- Дипломатия ---------- */

    // Торговые культуры сближаются, агрессивные — портят отношения; небольшой шум делает ход живым.
    diplomacy(factionId, culture) {
        const state = this.state;
        for (let other = 0; other < state.factionCount; other++) {
            if (other === factionId) continue;
            const noise = roll(this.seed + state.turn, factionId, other, 7) * 2 - 1;
            const delta = (culture.trade - culture.aggression) * 6 + noise * 3;
            state.changeRelation(factionId, other, delta);
        }
    }

    /* ---------- Армия ---------- */

    // Отряд идёт к цели: к вражескому отряду, иначе к ближайшей чужой земле (эфирным — если культура их любит).
    actArmy(army, culture) {
        const state = this.state;
        if (army.moves <= 0) return;
        const target = this.pickTarget(army, culture);
        if (target === null) return;

        const reachable = state.reachableTiles(army);
        if (reachable.size === 0) return;

        let best = null, bestDistance = state.generator.tileDistance(army.tile, target);
        for (const tile of reachable.keys()) {
            const d = state.generator.tileDistance(tile, target);
            if (d < bestDistance) { bestDistance = d; best = tile; }
        }
        if (best !== null) state.moveArmy(army.id, best);
    }

    // Куда идёт отряд: враг, чужая земля, а для любителей эфира — ближайший эфир.
    pickTarget(army, culture) {
        const state = this.state;
        const generator = state.generator;
        const distance = (a, b) => generator.tileDistance(a, b);

        // 1. Ближайший чужой отряд фракции, с которой мы в состоянии войны.
        let best = null, bestDistance = Infinity;
        for (const other of state.armies) {
            if (other.faction === army.faction) continue;
            if (state.relationLevel(army.faction, other.faction) !== 'war') continue;
            const d = distance(army.tile, other.tile);
            if (d < bestDistance) { bestDistance = d; best = other.tile; }
        }
        if (best !== null) return best;

        // 2. Ближайшая чужая клетка (расширение владений).
        for (const i of generator.landTiles) {
            const owner = generator.factionId[i];
            if (owner === army.faction) continue;
            const d = distance(army.tile, i);
            if (d < bestDistance) { bestDistance = d; best = i; }
        }

        // 3. Любители эфира иногда устремляются к ближайшему источнику эфира (культурная черта).
        if (culture.ether > 0.7) {
            for (const i of generator.landTiles) {
                if (generator.resource[i] !== 4) continue;   // Resource.ETHER
                const d = distance(army.tile, i);
                if (d < bestDistance) { bestDistance = d; best = i; }
            }
        }
        return best;
    }
}
