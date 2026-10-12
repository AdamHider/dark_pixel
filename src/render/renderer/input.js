/* Мышь, тач и клавиатура */

export const input = {
    bindEvents() {
        const canvas = this.canvas;

        canvas.addEventListener('pointerdown', e => {
            this.dragging = true;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.pressStart = { x: e.clientX, y: e.clientY };
            canvas.setPointerCapture(e.pointerId);
            canvas.classList.add('dragging');
        });

        canvas.addEventListener('pointermove', e => {
            if (this.dragging) {
                this.panBy(e.clientX - this.lastPointer.x, e.clientY - this.lastPointer.y);
                this.lastPointer = { x: e.clientX, y: e.clientY };
            } else {
                this.reportHover(e);
            }
        });

        const stopDragging = () => {
            this.dragging = false;
            canvas.classList.remove('dragging');
        };
        canvas.addEventListener('pointerup', e => {
            const start = this.pressStart;
            stopDragging();
            // Клик — это нажатие без заметного перетаскивания.
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
                const point = this.pointerToCanvas(e);
                const army = this.armyAt(point);
                if (army) {
                    this.onArmyClick && this.onArmyClick(army);
                } else {
                    const object = this.onObjectClick ? this.objectAt(point) : null;
                    if (object) this.onObjectClick(object);
                    else this.selectAt(point);
                }
            }
        });
        canvas.addEventListener('pointercancel', stopDragging);
        canvas.addEventListener('pointerleave', () => this.onHover && this.onHover(null));

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const point = this.pointerToCanvas(e);
            const factor = e.deltaY < 0 ? this.options.zoomStep : 1 / this.options.zoomStep;
            this.zoomAt(point.x, point.y, factor);
        }, { passive: false });

        // Клавиатура: стрелки/WASD — движение, +/- — зум, Esc — снять выделение. Холст должен быть в фокусе.
        canvas.addEventListener('keydown', e => {
            const step = this.options.keyPanStep;
            const center = { x: canvas.width / 2, y: canvas.height / 2 };
            const actions = {
                ArrowLeft: () => this.panBy(step, 0), a: () => this.panBy(step, 0),
                ArrowRight: () => this.panBy(-step, 0), d: () => this.panBy(-step, 0),
                ArrowUp: () => this.panBy(0, step), w: () => this.panBy(0, step),
                ArrowDown: () => this.panBy(0, -step), s: () => this.panBy(0, -step),
                '+': () => this.zoomAt(center.x, center.y, this.options.zoomStep),
                '=': () => this.zoomAt(center.x, center.y, this.options.zoomStep),
                '-': () => this.zoomAt(center.x, center.y, 1 / this.options.zoomStep),
                Escape: () => this.clearSelection()
            };
            const action = actions[e.key];
            if (action) {
                e.preventDefault();
                action();
            }
        });
    },

    // Координаты курсора относительно холста (с учётом того, что CSS-размер может отличаться от размера холста).
    pointerToCanvas(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    },

    reportHover(e) {
        if (!this.onHover) return;
        const point = this.pointerToCanvas(e);
        const tile = this.screenToTile(point.x, point.y);
        this.onHover(this.map.getTileInfo(tile.x, tile.y));
    },
};
