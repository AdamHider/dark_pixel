/* Детерминированные случайные числа */

// Хорошо перемешанный хеш числа (0..2^32): соседние номера клеток дают несвязанные значения. Простое умножение давало
// «решётчатые» узоры — реки бежали параллельными диагональными полосами.
export function hash32(n) {
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return (n ^ (n >>> 16)) >>> 0;
}

// Генератор псевдослучайных чисел (mulberry32): один и тот же seed даёт одну и ту же последовательность.
export function createRandom(seed) {
    let state = seed | 0;
    return function random() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
