/* Математические помощники */

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const lerp = (a, b, t) => a + (b - a) * t;

// Выравнивает значения до равномерных 0..1 по рангу: самое малое станет 0, самое большое 1.
// Тогда порог 0.4 честно означает «нижние 40%», независимо от того, как шум «слипается» вокруг 0.5.
export function rankNormalize(values) {
    const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
    const result = new Float32Array(values.length);
    order.forEach((index, rank) => { result[index] = rank / (values.length - 1); });
    return result;
}

// Значение на заданной доле отсортированного списка (0.5 — медиана).
export function percentile(values, share) {
    const sorted = Float32Array.from(values).sort();
    return sorted[Math.floor(sorted.length * share)];
}
