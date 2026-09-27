import { db } from './db';

/** Tipos de fauna do mundo */
export const PREY_TYPES = ['Cervo', 'Coelho', 'Javali'] as const;
export const PREDATOR_TYPES = ['Lobo', 'Urso', 'Raposa'] as const;
export const ALL_ANIMALS = [...PREY_TYPES, ...PREDATOR_TYPES] as const;

export type AnimalType = (typeof ALL_ANIMALS)[number];

const PREY_FOOD: Record<string, number> = {
  Cervo: 40,
  Coelho: 15,
  Javali: 35,
};

/** Spawns padrão no reset da ilha */
export function buildFaunaSpawnSQL(): string[] {
  const rows: string[] = [];
  // Árvores e jazidas
  for (let i = 0; i < 10; i++)
    rows.push(`('Árvore Anciã', floor(random() * 40) + 5, floor(random() * 40) + 5, 100, 50)`);
  for (let i = 0; i < 5; i++)
    rows.push(`('Jazida de Ouro', floor(random() * 40) + 55, floor(random() * 40) + 5, 200, 100)`);
  // Presas
  for (let i = 0; i < 6; i++)
    rows.push(`('Cervo', floor(random() * 80) + 10, floor(random() * 80) + 10, 30, 40)`);
  for (let i = 0; i < 8; i++)
    rows.push(`('Coelho', floor(random() * 80) + 10, floor(random() * 80) + 10, 15, 15)`);
  for (let i = 0; i < 3; i++)
    rows.push(`('Javali', floor(random() * 80) + 10, floor(random() * 80) + 10, 50, 35)`);
  // Predadores
  for (let i = 0; i < 4; i++)
    rows.push(`('Lobo', floor(random() * 80) + 10, floor(random() * 80) + 10, 60, 0)`);
  for (let i = 0; i < 2; i++)
    rows.push(`('Urso', floor(random() * 80) + 10, floor(random() * 80) + 10, 120, 0)`);
  for (let i = 0; i < 3; i++)
    rows.push(`('Raposa', floor(random() * 80) + 10, floor(random() * 80) + 10, 35, 0)`);
  return rows;
}

export function isPrey(type: string): boolean {
  return (PREY_TYPES as readonly string[]).includes(type);
}

export function isPredator(type: string): boolean {
  return (PREDATOR_TYPES as readonly string[]).includes(type);
}

export function isAnimal(type: string): boolean {
  return isPrey(type) || isPredator(type);
}

export function foodFromPrey(type: string): number {
  return PREY_FOOD[type] ?? 20;
}

/** Atualiza posição / caça da fauna por um tick */
export async function tickFauna(
  entities: any[],
  tick: number
): Promise<any[]> {
  let list = [...entities];

  for (const ent of list) {
    if (!isAnimal(ent.type)) continue;

    let nx = ent.x;
    let ny = ent.y;

    if (isPredator(ent.type)) {
      // Predadores preferem presas; raposa prefere coelho; urso qualquer presa
      const preferred =
        ent.type === 'Raposa'
          ? list.filter((e) => e.type === 'Coelho')
          : list.filter((e) => isPrey(e.type));

      const prey = preferred.find(
        (e) => Math.sqrt((e.x - ent.x) ** 2 + (e.y - ent.y) ** 2) < (ent.type === 'Urso' ? 18 : 15)
      );

      if (prey) {
        const dx = prey.x - ent.x;
        const dy = prey.y - ent.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = ent.type === 'Urso' ? 2 : 3;
        nx = Math.round(ent.x + (dx / d) * speed);
        ny = Math.round(ent.y + (dy / d) * speed);

        if (d < 3) {
          const dmg = ent.type === 'Urso' ? 35 : 20;
          await db.query('UPDATE world_entities SET hp = GREATEST(0, hp - $1) WHERE id = $2', [
            dmg,
            prey.id,
          ]);
          if (prey.hp - dmg <= 0) {
            await db.query('DELETE FROM world_entities WHERE id = $1', [prey.id]);
            list = list.filter((e) => e.id !== prey.id);
            const emoji = ent.type === 'Urso' ? '🐻' : ent.type === 'Raposa' ? '🦊' : '🐺';
            await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CAÇA', $2)", [
              tick,
              `${emoji} Um ${ent.type.toLowerCase()} abateu um ${prey.type.toLowerCase()}.`,
            ]);
          }
        }
      } else {
        nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
        ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
      }
    } else {
      // Presas fogem de predadores
      const predator = list.find(
        (e) =>
          isPredator(e.type) &&
          Math.sqrt((e.x - ent.x) ** 2 + (e.y - ent.y) ** 2) < 12
      );
      if (predator) {
        const dx = ent.x - predator.x;
        const dy = ent.y - predator.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const flee = ent.type === 'Coelho' ? 5 : 4;
        nx = Math.max(5, Math.min(95, Math.round(ent.x + (dx / d) * flee)));
        ny = Math.max(5, Math.min(95, Math.round(ent.y + (dy / d) * flee)));
      } else {
        const step = ent.type === 'Coelho' ? 4 : 2;
        nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * (step * 2 + 1)) - step)));
        ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * (step * 2 + 1)) - step)));
      }
    }

    await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
  }

  return list;
}
