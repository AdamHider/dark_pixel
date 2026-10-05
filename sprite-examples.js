/* ============================================================
   Примеры конфигов для SpriteRenderer (см. описание формата в sprite-renderer.js).
   Это просто данные: их можно хранить в JSON, генерировать кодом или править в sprite-demo.html.
   Размеры — в пикселях для клетки 12×12.
   ============================================================ */
const SPRITE_EXAMPLES = {

    // Деревня: три домика, дым из трубы, зимой снег на крышах.
    village: {
        id: 'village',
        size: [28, 22],
        anchor: [14, 19],
        palette: {
            wall: '#cdb890',
            roof: '#a44f33',
            wood: '#6b4a2e',
            window: '#f4d98a',
            smoke: '#d9d9d9'
        },
        shadow: { rx: 12, ry: 2.5, alpha: 0.28 },
        outline: '#2b1d12',
        layers: [
            // левый дом
            { shape: 'rect', x: 3, y: 12, w: 9, h: 7, fill: 'wall', bevel: 0.5 },
            { shape: 'polygon', points: [[2, 12], [7.5, 6], [13, 12]], fill: 'roof', bevel: 0.5 },
            { shape: 'rect', x: 5, y: 15, w: 2, h: 4, fill: 'wood' },
            { shape: 'rect', x: 9, y: 14, w: 2, h: 2, fill: 'window' },
            // правый дом
            { shape: 'rect', x: 15, y: 13, w: 9, h: 6, fill: 'wall', bevel: 0.5 },
            { shape: 'polygon', points: [[14, 13], [19.5, 8], [25, 13]], fill: 'roof', bevel: 0.5 },
            { shape: 'rect', x: 18, y: 15, w: 2, h: 4, fill: 'wood' },
            { shape: 'rect', x: 21, y: 15, w: 2, h: 2, fill: 'window' },
            // труба
            { shape: 'rect', x: 10, y: 6, w: 2, h: 4, fill: { shade: 'wall', amount: -0.35 } },
            // дым (кадры анимации 0 и 1 — разные)
            { shape: 'pixels', x: 10, y: 2, rows: ['.s', 's.'], legend: { s: 'smoke' }, alpha: 0.7, when: { frame: 0 } },
            { shape: 'pixels', x: 10, y: 2, rows: ['s.', '.s'], legend: { s: 'smoke' }, alpha: 0.7, when: { frame: 1 } },
            // забор
            { shape: 'line', points: [[13, 19], [14, 19]], fill: 'wood' }
        ],
        variants: {
            winter: {
                palette: { roof: '#eef3f5', wall: '#d8cdb4' },
                addLayers: [
                    { shape: 'polygon', points: [[2, 12], [7.5, 6], [13, 12], [11, 12], [7.5, 8], [4, 12]], fill: '#ffffff', alpha: 0.9 }
                ]
            },
            autumn: { palette: { roof: '#9a4426' } }
        }
    },

    // Город: стена с зубцами, башни со знамёнами (цвет игрока), донжон. Знамёна машут (2 кадра).
    city: {
        id: 'city',
        size: [40, 32],
        anchor: [20, 29],
        palette: {
            stone: '#9a968c',
            stoneDark: { shade: 'stone', amount: -0.3 },
            roof: '#7b3a2c',
            gate: '#4a3322',
            window: '#f4d98a',
            flag: '$team'
        },
        shadow: { rx: 18, ry: 3, alpha: 0.3 },
        outline: '#241810',
        layers: [
            // стена
            { shape: 'rect', x: 3, y: 18, w: 34, h: 10, fill: 'stone', bevel: 0.5 },
            { shape: 'rect', x: 3, y: 16, w: 3, h: 2, fill: 'stone', bevel: 0.4, repeat: { count: 6, dx: 6 } },
            { shape: 'rect', x: 15, y: 21, w: 10, h: 7, fill: 'gate' },
            { shape: 'ellipse', cx: 20, cy: 21, rx: 5, ry: 3, fill: 'gate' },
            // донжон
            { shape: 'rect', x: 14, y: 8, w: 12, h: 12, fill: 'stone', bevel: 0.5 },
            { shape: 'polygon', points: [[13, 8], [20, 1], [27, 8]], fill: 'roof', bevel: 0.5 },
            { shape: 'rect', x: 19, y: 12, w: 2, h: 3, fill: 'window' },
            // боковые башни
            { shape: 'rect', x: 1, y: 11, w: 7, h: 17, fill: 'stone', bevel: 0.5 },
            { shape: 'polygon', points: [[0, 11], [4.5, 5], [9, 11]], fill: 'roof', bevel: 0.5 },
            { shape: 'rect', x: 32, y: 11, w: 7, h: 17, fill: 'stone', bevel: 0.5 },
            { shape: 'polygon', points: [[31, 11], [35.5, 5], [40, 11]], fill: 'roof', bevel: 0.5 },
            { shape: 'rect', x: 4, y: 14, w: 1, h: 2, fill: 'window' },
            { shape: 'rect', x: 35, y: 14, w: 1, h: 2, fill: 'window' },
            // знамёна на башнях
            { shape: 'line', points: [[4, 5], [4, 1]], fill: 'stoneDark' },
            { shape: 'polygon', points: [[5, 1], [9, 2], [5, 4]], fill: 'flag', when: { frame: 0 } },
            { shape: 'polygon', points: [[5, 1], [9, 3], [5, 4]], fill: 'flag', when: { frame: 1 } },
            { shape: 'line', points: [[35, 5], [35, 1]], fill: 'stoneDark' },
            { shape: 'polygon', points: [[36, 1], [40, 2], [36, 4]], fill: 'flag', when: { frame: 0 } },
            { shape: 'polygon', points: [[36, 1], [40, 3], [36, 4]], fill: 'flag', when: { frame: 1 } }
        ],
        variants: {
            winter: {
                addLayers: [
                    { shape: 'polygon', points: [[13, 8], [20, 1], [27, 8], [25, 8], [20, 3], [15, 8]], fill: '#ffffff', alpha: 0.9 },
                    { shape: 'rect', x: 3, y: 16, w: 3, h: 1, fill: '#ffffff', alpha: 0.9, repeat: { count: 6, dx: 6 } }
                ]
            }
        }
    },

    // Армия: отряд из трёх воинов со знаменем (цвет игрока). Флаг 'marching' добавляет пыль.
    army: {
        id: 'army',
        size: [22, 20],
        anchor: [11, 17],
        palette: {
            skin: '#e0b48a',
            steel: '#aeb4bb',
            cloth: '$team',
            clothDark: { shade: '$team', amount: -0.35 },
            leather: '#6b4a2e',
            pole: '#5a3d24',
            dust: '#c9b48a'
        },
        shadow: { rx: 9, ry: 2, alpha: 0.28 },
        outline: '#1f160e',
        layers: [
            { shape: 'pixels', x: 2, y: 8, rows: [
                '.hh.',
                '.ss.',
                'cccc',
                'cccc',
                '.cc.',
                '.ll.',
                '.ll.'
            ], legend: { h: 'steel', s: 'skin', c: 'cloth', l: 'leather' } },
            { shape: 'pixels', x: 9, y: 6, rows: [
                '.hh.',
                '.ss.',
                'cccc',
                'cccc',
                '.cc.',
                '.ll.',
                '.ll.'
            ], legend: { h: 'steel', s: 'skin', c: 'cloth', l: 'leather' } },
            { shape: 'pixels', x: 15, y: 8, rows: [
                '.hh.',
                '.ss.',
                'cccc',
                'cccc',
                '.cc.',
                '.ll.',
                '.ll.'
            ], legend: { h: 'steel', s: 'skin', c: 'cloth', l: 'leather' } },
            // копья
            { shape: 'line', points: [[1, 15], [1, 5]], fill: 'pole' },
            { shape: 'line', points: [[14, 14], [14, 2]], fill: 'pole' },
            // знамя
            { shape: 'polygon', points: [[15, 2], [20, 3], [15, 6]], fill: 'cloth', when: { frame: 0 } },
            { shape: 'polygon', points: [[15, 2], [20, 4], [15, 6]], fill: 'cloth', when: { frame: 1 } },
            // пыль при движении
            { shape: 'scatter', area: { ellipse: [11, 17, 9, 2] }, count: 7, colors: ['dust'], seed: 3, alpha: 0.6, when: { flag: 'marching' } }
        ]
    },
    black_warrior: {
        "id": "black_warrior",
        "size": [
          40,
          32
        ],
        "anchor": [
          20,
          30
        ],
        "palette": {
          "color_1": "#252b2b",
          "color_2": "#23262b",
          "color_3": "#181a19",
          "color_4": "#1f2326",
          "color_5": "#2e3231",
          "color_6": "#21221e",
          "color_7": "#1f2826",
          "color_8": "#181e1e",
          "color_9": "#817366",
          "color_10": "#a5a08d",
          "color_11": "#798584",
          "color_12": "#3f494d",
          "color_13": "#0f1818",
          "color_14": "#241d17",
          "color_15": "#e99667",
          "color_16": "#bb805a",
          "color_17": "#874c3b",
          "color_18": "#4d2b22",
          "color_19": "#3b3d39",
          "color_20": "#33322d",
          "color_21": "#777976",
          "color_22": "#525451",
          "color_23": "#0c0d0c",
          "color_24": "#e0e2d9",
          "color_25": "#232929",
          "color_26": "#20221f",
          "color_27": "#374545",
          "color_28": "#252726",
          "color_29": "#20201e",
          "color_30": "#92958e",
          "color_31": "#656962",
          "color_32": "#6a6c67",
          "color_33": "#9da79c",
          "color_34": "#6d7872",
          "color_35": "#1c2023",
          "color_36": "#888c8d",
          "color_37": "#675e54",
          "color_38": "#101210",
          "color_39": "#48494b",
          "color_40": "#9fa59b",
          "color_41": "#292e31",
          "color_42": "#242d2a",
          "color_43": "#0e0e0d",
          "color_44": "#343837"
        },
        "layers": [
          {
            "shape": "pixels",
            "x": 0,
            "y": 0,
            "rows": [
              ".............aab........................",
              "..............cdddddddddddddd...........",
              ".......eeeef..cggggggggggghd............",
              "......feeijf..cggggggggggggd............",
              ".....ffeeeif..cggkkgkggklgm.............",
              "......nnnnnn..cglkggkggklgm.............",
              "......opqqqr..cgkkgkkkgklgm.............",
              "......qpooop..cgkkglklgklgm.............",
              ".......pooop..cgkkggkggklgd.............",
              ".......qpppq..cggkkgkggklgm.............",
              "...sssstttttt.cggllgkgggggmm............",
              "...uvwsxeeejiycgggggllggggdm............",
              "..uuvweeeeejwycdddddddddddddm...........",
              ".zAABwexeeeewyC.........................",
              ".zAABweeeeeewDDD........................",
              "zzAB.seEeeeewFFF........................",
              "GGH..seeeeeewIJJ........................",
              "GGH..seEeijeiKII........................",
              "HGH.LLcccijciKII........................",
              ".GH.LLLccccciII.........................",
              ".MNFLLLOOOOOP.c.........................",
              ".MMFLLOOOOOOO.c.........................",
              ".NFFLLOOOcOOO.c.........................",
              "....cOOQ.ccOOPc.........................",
              "....cOOQ..cOOPc.........................",
              "....cOQ...cOOPc.........................",
              "...cOOQ...ccccc.........................",
              "...cOQ.....Qccc.........................",
              "...cOQ.....QORc.........................",
              "...OO......QORc.........................",
              "..ROO......QORc.........................",
              "..QQQ......QQQc........................."
            ],
            "legend": {
              "a": "color_1",
              "b": "color_2",
              "c": "color_3",
              "d": "color_4",
              "e": "color_5",
              "f": "color_6",
              "g": "color_7",
              "h": "color_8",
              "i": "color_9",
              "j": "color_10",
              "k": "color_11",
              "l": "color_12",
              "m": "color_13",
              "n": "color_14",
              "o": "color_15",
              "p": "color_16",
              "q": "color_17",
              "r": "color_18",
              "s": "color_19",
              "t": "color_20",
              "u": "color_21",
              "v": "color_22",
              "w": "color_23",
              "x": "color_24",
              "y": "color_25",
              "z": "color_26",
              "A": "color_27",
              "B": "color_28",
              "C": "color_29",
              "D": "color_30",
              "E": "color_31",
              "F": "color_32",
              "G": "color_33",
              "H": "color_34",
              "I": "color_35",
              "J": "color_36",
              "K": "color_37",
              "L": "color_38",
              "M": "color_39",
              "N": "color_40",
              "O": "color_41",
              "P": "color_42",
              "Q": "color_43",
              "R": "color_44"
            }
          }
        ]
      }
};
