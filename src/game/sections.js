/* Разделы интерфейса игры: ходы, экономика, дипломатия, армия.

   Каждый раздел — это данные: заголовок, текст сводки по текущему состоянию и кнопки действий.
   Панель разделов (см. src/ui/sections-panel.js) просто рисует этот список, поэтому новый раздел
   добавляется одной записью здесь, без правок интерфейса. Метод `summary(state)` возвращает строки,
   `actions(state)` — кнопки `{ label, run(state) }`. */

const NUMBER = new Intl.NumberFormat('ru-RU');

function factionName(state, id) {
    const faction = state.factionInfo(id);
    return faction ? faction.name : `Фракция ${id + 1}`;
}

export const SECTIONS = [
    {
        id: 'turns',
        title: 'Ходы',
        icon: '⏳',
        summary(state) {
            return [
                `Ход: ${state.turn}`,
                `Сейчас ходит: ${state.factionCount ? factionName(state, state.currentFaction) : '—'}`,
                `Фракций на карте: ${state.factionCount}`
            ];
        },
        actions: [
            { label: 'Следующий ход (ИИ)', run(state) { state.endTurn(); } }
        ]
    },
    {
        id: 'economy',
        title: 'Экономика',
        icon: '💰',
        summary(state) {
            if (state.factionCount === 0) return ['На карте нет фракций.'];
            return state.generator.factions.map((faction, f) => {
                const sign = state.income[f] >= 0 ? '+' : '';
                return `${faction.name}: казна ${NUMBER.format(state.treasury[f])} (${sign}${state.income[f]}/ход), население ${NUMBER.format(faction.population)}`;
            });
        },
        actions: [
            { label: 'Собрать налоги', run(state) { state.treasury = state.treasury.map((t, f) => t + state.income[f]); } },
            { label: 'Пересчитать доходы', run(state) { state.income = state.income.map((_, f) => state.monthlyIncome(f)); } }
        ]
    },
    {
        id: 'diplomacy',
        title: 'Дипломатия',
        icon: '🤝',
        // Дипломатия рисуется не текстом, а разметкой: превью карты и список фракций с культурой.
        html: 'diplomacy',
        summary(state) {
            return state.factionCount ? [`Фракций: ${state.factionCount}`] : ['На карте нет фракций.'];
        },
        actions: [
            { label: 'Укрепить связи', run(state) { state.changeRelation(0, 1, 10); } },
            { label: 'Обострить отношения', run(state) { state.changeRelation(0, 1, -10); } },
            { label: 'Сбросить отношения', run(state) { state.relations.clear(); } }
        ]
    },
    {
        id: 'army',
        title: 'Армия',
        icon: '⚔️',
        summary(state) {
            if (state.armies.length === 0) return ['Отрядов пока нет.'];
            return state.armies.map(army => {
                const x = army.tile % state.generator.size;
                const y = Math.floor(army.tile / state.generator.size);
                return `${army.id} · ${factionName(state, army.faction)} · сила ${army.strength} · клетка (${x}, ${y})`;
            });
        },
        actions: [
            { label: 'Новый отряд (фракция 1)', run(state) { if (state.factionCount > 0) state.spawnArmy(0); } },
            { label: 'Пополнить отряды', run(state) { for (const army of state.armies) army.strength = Math.min(200, army.strength + 25); } }
        ]
    }
];
