/* Помощники для кнопок интерфейса */

// Кнопка-переключатель (aria-pressed): apply(on) вызывается при каждом нажатии.
export function bindToggle(id, apply) {
    const button = document.getElementById(id);
    button.addEventListener('click', () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', on);
        apply(on);
    });
}

// Группа кнопок «один из» с атрибутом data-<name>: apply(значение) при выборе.
export function bindChoiceGroup(name, apply) {
    const buttons = document.querySelectorAll(`[data-${name}]`);
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(other => other.setAttribute('aria-pressed', other === button));
            apply(button.dataset[name]);
        });
    });
}

// Кнопки с data-toggle-panel="id" показывают и прячут панель с этим id.
export function bindPanelToggles() {
    document.querySelectorAll('[data-toggle-panel]').forEach(button => {
        button.addEventListener('click', () => {
            const panel = document.getElementById(button.dataset.togglePanel);
            if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        });
    });
}
