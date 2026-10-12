/* Объекты поверх карты (города, деревни, армии...) */

export const objects = {
    /* Объект рисуется по конфигу функцией SpriteRenderer, поверх карты, на экране (а не в буфере карты),
       поэтому армии можно двигать и менять без перерисовки всей карты.
         { id: 'army-1',
           config: SPRITE_EXAMPLES.army,         // описание объекта
           tile: [x, y],                         // клетка карты (основание объекта — внизу клетки)
           offset: [0, 0],                       // сдвиг в пикселях (для клетки 12×12), чтобы поставить точнее
           options: { colors: { team: '#c33' }, flags: ['marching'], frame: 0, flipX: false } }
       Сезон в options подставляется автоматически (текущий сезон карты), если вы не указали свой. */
    setObjects(list) {
        this.objects = list.slice();
        this.draw();
    },

    addObject(object) {
        this.objects = this.objects.filter(o => o.id !== object.id).concat(object);
        this.draw();
    },

    removeObject(id) {
        this.objects = this.objects.filter(o => o.id !== id);
        this.draw();
    },

    // Где на экране стоит объект: левый верхний угол и размер спрайта.
    objectBox(object) {
        const unit = this.options.tileSize / 12;                 // спрайты нарисованы для клетки 12×12
        const sprite = this.sprites.render(object.config, { season: this.seasonName, ...object.options });
        const [tileX, tileY] = object.tile;
        const [offsetX, offsetY] = object.offset || [0, 0];
        const baseX = tileX * this.options.tileSize + this.options.tileSize / 2 + offsetX * unit;
        const baseY = tileY * this.options.tileSize + this.options.tileSize * 0.85 + offsetY * unit;
        const zoom = this.camera.zoom;
        const factor = unit * zoom / sprite.scale;
        return {
            sprite,
            baseY,
            x: (baseX - this.camera.x) * zoom - sprite.anchorX * factor,
            y: (baseY - this.camera.y) * zoom - sprite.anchorY * factor,
            width: sprite.width * factor,
            height: sprite.height * factor
        };
    },

    drawObjects() {
        if (this.objects.length === 0) return;
        const { ctx, canvas } = this;
        const boxes = this.objects.map(object => ({ object, ...this.objectBox(object) }));
        boxes.sort((a, b) => a.baseY - b.baseY); // южнее (ближе) — рисуется позже и перекрывает

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const box of boxes) {
            if (box.x > canvas.width || box.y > canvas.height || box.x + box.width < 0 || box.y + box.height < 0) continue;
            ctx.drawImage(box.sprite.canvas, box.x, box.y, box.width, box.height);
        }
        ctx.restore();
    },

    // Объект под точкой экрана (самый южный из перекрывающихся) или null.
    objectAt(point) {
        const hit = this.objects
            .map(object => ({ object, ...this.objectBox(object) }))
            .filter(b => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height)
            .sort((a, b) => b.baseY - a.baseY);
        return hit.length ? hit[0].object : null;
    },
};
