import { Position, BotDefinition } from '../types';

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 800;

// Helper to generate seats for tables
const generateSeats = (count: number, startX: number, startY: number, spacing: number, dir: 'up' | 'down' | 'left' | 'right', tableBase: { x: number, y: number, w: number, h: number }) =>
{
  return Array(count).fill(0).map((_, i) =>
  {
    const isHorizontal = dir === 'up' || dir === 'down';
    const x = isHorizontal ? startX + (i * spacing) : startX;
    const y = isHorizontal ? startY : startY + (i * spacing);

    let cx = x, cy = y, mx = x, my = y, bx = x, by = y;

    if (dir === 'down')
    {
      cy = tableBase.y - 25; mx = x; my = tableBase.y + 16; by = cy - 10;
    } else if (dir === 'up')
    {
      cy = tableBase.y + tableBase.h + 25; mx = x; my = tableBase.y + tableBase.h - 16; by = cy + 10;
    } else if (dir === 'right')
    {
      cx = tableBase.x - 25; mx = tableBase.x + 16; my = y; bx = cx - 10;
    } else if (dir === 'left')
    {
      cx = tableBase.x + tableBase.w + 25; mx = tableBase.x + tableBase.w - 16; my = y; bx = cx + 10;
    }

    return { id: `seat-${dir}-${cx}-${cy}`, cx, cy, mx, my, bx, by, dir };
  });
};

export interface Zone
{
  id: string;
  name: string;
  bounds: { x: number, y: number, w: number, h: number };
  tables: { x: number, y: number, w: number, h: number }[];
  seats: any[];
}

export const ZONES: Zone[] = [
  {
    id: 'art', name: 'Art Department',
    bounds: { x: 40, y: 80, w: 430, h: 370 },
    tables: [{ x: 70, y: 130, w: 370, h: 80 }, { x: 70, y: 320, w: 370, h: 80 }],
    seats: [
      ...generateSeats(4, 120, 0, 90, 'down', { x: 70, y: 130, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'up', { x: 70, y: 130, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'down', { x: 70, y: 320, w: 370, h: 80 }),
      ...generateSeats(4, 120, 0, 90, 'up', { x: 70, y: 320, w: 370, h: 80 })
    ]
  },
  {
    id: 'art-mgr', name: 'Art Manager',
    bounds: { x: 40, y: 480, w: 130, h: 180 },
    tables: [{ x: 80, y: 530, w: 70, h: 100 }],
    seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 80, y: 530, w: 70, h: 100 })]
  },
  {
    id: 'proj-mgr', name: 'Project Manager',
    bounds: { x: 190, y: 480, w: 130, h: 180 },
    tables: [{ x: 230, y: 530, w: 70, h: 100 }],
    seats: [...generateSeats(1, 0, 580, 0, 'right', { x: 230, y: 530, w: 70, h: 100 })]
  },
  {
    id: 'conf-a', name: 'Meeting Room A',
    bounds: { x: 340, y: 480, w: 140, h: 180 },
    tables: [{ x: 380, y: 530, w: 60, h: 110 }],
    seats: [
      ...generateSeats(5, 0, 540, 22, 'right', { x: 380, y: 530, w: 60, h: 110 }),
      ...generateSeats(5, 0, 540, 22, 'left', { x: 380, y: 530, w: 60, h: 110 })
    ]
  },
  {
    id: 'game-web', name: 'Game & Marketing',
    bounds: { x: 500, y: 80, w: 180, h: 370 },
    tables: [{ x: 550, y: 150, w: 80, h: 240 }],
    seats: [
      ...generateSeats(3, 0, 180, 70, 'right', { x: 550, y: 150, w: 80, h: 240 }),
      ...generateSeats(3, 0, 180, 70, 'left', { x: 550, y: 150, w: 80, h: 240 })
    ]
  },
  {
    id: 'hr', name: 'Human Resources',
    bounds: { x: 710, y: 80, w: 120, h: 170 },
    tables: [{ x: 730, y: 150, w: 80, h: 80 }],
    seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 150, w: 80, h: 80 })]
  },
  {
    id: 'account', name: 'Accounting',
    bounds: { x: 850, y: 80, w: 120, h: 170 },
    tables: [{ x: 870, y: 150, w: 80, h: 80 }],
    seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 150, w: 80, h: 80 })]
  },
  {
    id: 'it', name: 'IT Department',
    bounds: { x: 710, y: 280, w: 120, h: 170 },
    tables: [{ x: 730, y: 350, w: 80, h: 80 }],
    seats: [...generateSeats(1, 770, 0, 0, 'down', { x: 730, y: 350, w: 80, h: 80 })]
  },
  {
    id: 'facility', name: 'Facilities',
    bounds: { x: 850, y: 280, w: 120, h: 170 },
    tables: [{ x: 870, y: 350, w: 80, h: 80 }],
    seats: [...generateSeats(1, 910, 0, 0, 'down', { x: 870, y: 350, w: 80, h: 80 })]
  },
  {
    id: 'ai', name: 'Simulation & AI',
    bounds: { x: 500, y: 480, w: 180, h: 180 },
    tables: [{ x: 550, y: 540, w: 80, h: 80 }],
    seats: [
      ...generateSeats(1, 0, 580, 80, 'right', { x: 550, y: 540, w: 80, h: 80 }),
      ...generateSeats(1, 0, 580, 80, 'left', { x: 550, y: 540, w: 80, h: 80 })
    ]
  },
  {
    id: 'conf-b', name: 'Meeting Room B',
    bounds: { x: 710, y: 480, w: 260, h: 180 },
    tables: [{ x: 750, y: 550, w: 180, h: 60 }],
    seats: [
      ...generateSeats(4, 765, 0, 45, 'down', { x: 750, y: 550, w: 180, h: 60 }),
      ...generateSeats(4, 765, 0, 45, 'up', { x: 750, y: 550, w: 180, h: 60 })
    ]
  }
];

// Spawning now defaults to the central hallway junction
export const SPAWN_POSITION = { x: 485, y: 460 };

export function getRandomSpawn(): Position
{
  let attempts = 0;
  while (attempts < 100)
  {
    const x = 50 + Math.random() * (MAP_WIDTH - 100);
    const y = 50 + Math.random() * (MAP_HEIGHT - 100);

    // Ensure the random spawn is in a walkable hallway (not in a zone/room)
    if (isWalkable(x, y) && !getZoneAtPosition({ x, y }))
    {
      return { x, y };
    }
    attempts++;
  }
  return SPAWN_POSITION;
}

export function isWalkable(x: number, y: number): boolean
{
  if (x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) return false;

  for (const zone of ZONES)
  {
    for (const table of zone.tables)
    {
      if (x >= table.x && x <= table.x + table.w && y >= table.y && y <= table.y + table.h) return false;
    }
  }
  return true;
}

export function getZoneAtPosition(pos: Position): string | null
{
  const zone = ZONES.find(z =>
    pos.x >= z.bounds.x && pos.x <= z.bounds.x + z.bounds.w &&
    pos.y >= z.bounds.y && pos.y <= z.bounds.y + z.bounds.h
  );
  return zone?.id || null;
}

export function getZoneById(id: string)
{
  return ZONES.find(z => z.id === id);
}

export function distance(a: Position, b: Position): number
{
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const BOT_DEFINITIONS: BotDefinition[] = [];