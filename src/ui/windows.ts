/**
 * Layouts of the pack's UI windows, in pixels relative to each window frame's top-left corner
 * (measured on the source PNGs). Buttons and slots baked into the art are given as centres.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TABS = [228, 338, 448, 560, 671].map((y) => ({ x: 179, y, w: 235, h: 58 }));
const BOTTOM3 = [384, 604, 826].map((x) => ({ x, y: 800, w: 190, h: 40 }));
const TITLE = { x: 589, y: 65, w: 470, h: 90 };

export const WINDOWS = {
  bank: {
    frame: 'win/bank',
    title: TITLE,
    tabs: TABS,
    slots: [308, 555].flatMap((y) => [494, 689, 887].map((x) => ({ x, y, w: 180, h: 170 }))),
    labels: [420, 666].flatMap((y) => [494, 689, 887].map((x) => ({ x, y, w: 108, h: 42 }))),
    bottom: BOTTOM3,
  },
  skills: {
    frame: 'win/skills',
    title: TITLE,
    tabs: TABS,
    panel: { x: 691, y: 450, w: 680, h: 585 },
    bottom: BOTTOM3,
  },
  main: {
    frame: 'win/main',
    title: { x: 566, y: 72, w: 470, h: 90 },
    slots: [289, 386].map((y) => ({ x: 273, y, w: 178, h: 42 })),
    button: { x: 273, y: 613, w: 165, h: 60 },
    bottom: [401, 721].map((x) => ({ x, y: 798, w: 190, h: 40 })),
  },
  map: {
    frame: 'win/levels_map',
    title: { x: 629, y: 70, w: 470, h: 90 },
    /** the 10 baked level nodes, in path order */
    nodes: [
      [239, 307], [309, 439], [445, 375], [511, 507], [611, 615],
      [741, 581], [769, 463], [901, 399], [927, 261], [1079, 343],
    ].map(([x, y]) => ({ x, y, w: 80, h: 85 })),
    bottom: [461, 795].map((x) => ({ x, y: 798, w: 120, h: 38 })),
  },
} as const;
