import { db } from './db';

export const PREY_TYPES = ['Cervo', 'Coelho', 'Javali', 'Cabra', 'Alce'] as const;
export const PREDATOR_TYPES = ['Lobo', 'Urso', 'Raposa', 'Águia', 'Serpente'] as const;
export const HOSTILE_TYPES = ['Goblin'] as const;
export const ALL_ANIMALS = [...PREY_TYPES, ...PREDATOR_TYPES, ...HOSTILE_TYPES] as const;

export type AnimalType = (typeof ALL_ANIMALS)[number];

const PREY_FOOD: Record<string, number> = {
  Cervo: 40,
  Coelho: 15,
  Javali: 35,
  Cabra: 25,
  Alce: 55,
};

const SPEED: Record<string, number> = {
  Coelho: 5,
  Cabra: 3,
  Cervo: 4,
  Javali: 3,
  Alce: 3,
  Lobo: 4,
  Raposa: 4,
  Urso: 2,
  Águia: 6,
  Serpente: 2,
  Goblin: 3,
};

export function buildFaunaSpawnSQL(): string[] {
  const rows: string[] = [];
  const rnd = (a: number, b: number) => `floor(random() * ${b - a}) + ${a}`;

  for (let i = 0; i < 14; i++)
    rows.push(`('Árvore Anciã', ${rnd(5, 45)}, ${rnd(5, 45)}, 100, 50)`);
  for (let i = 0; i < 7; i++)
    rows.push(`('Jazida de Ouro', ${rnd(55, 95)}, ${rnd(5, 45)}, 200, 100)`);

  for (let i = 0; i < 8; i++) rows.push(`('Cervo', ${rnd(10, 90)}, ${rnd(10, 90)}, 30, 40)`);
  for (let i = 0; i < 12; i++) rows.push(`('Coelho', ${rnd(10, 90)}, ${rnd(10, 90)}, 15, 15)`);
  for (let i = 0; i < 5; i++) rows.push(`('Javali', ${rnd(10, 90)}, ${rnd(10, 90)}, 50, 35)`);
  for (let i = 0; i < 6; i++) rows.push(`('Cabra', ${rnd(10, 90)}, ${rnd(10, 90)}, 28, 25)`);
  for (let i = 0; i < 3; i++) rows.push(`('Alce', ${rnd(10, 90)}, ${rnd(10, 90)}, 70, 55)`);

  for (let i = 0; i < 5; i++) rows.push(`('Lobo', ${rnd(10, 90)}, ${rnd(10, 90)}, 60, 0)`);
  for (let i = 0; i < 2; i++) rows.push(`('Urso', ${rnd(10, 90)}, ${rnd(10, 90)}, 120, 0)`);
  for (let i = 0; i < 4; i++) rows.push(`('Raposa', ${rnd(10, 90)}, ${rnd(10, 90)}, 35, 0)`);
  for (let i = 0; i < 4; i++) rows.push(`('Águia', ${rnd(10, 90)}, ${rnd(10, 90)}, 40, 0)`);
  for (let i = 0; i < 5; i++) rows.push(`('Serpente', ${rnd(10, 90)}, ${rnd(10, 90)}, 25, 0)`);
  for (let i = 0; i < 4; i++) rows.push(`('Goblin', ${rnd(10, 90)}, ${rnd(10, 90)}, 45, 0)`);

  return rows;
}

export function isPrey(type: string): boolean {
  return (PREY_TYPES as readonly string[]).includes(type);
}
export function isPredator(type: string): boolean {
  return (PREDATOR_TYPES as readonly string[]).includes(type);
}
export function isHostile(type: string): boolean {
  return (HOSTILE_TYPES as readonly string[]).includes(type);
}
export function isAnimal(type: string): boolean {
  return isPrey(type) || isPredator(type) || isHostile(type);
}
export function foodFromPrey(type: string): number {
  return PREY_FOOD[type] ?? 20;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export async function tickFauna(entities: any[], tick: number, agents: any[] = []): Promise<any[]> {
  let list = [...entities];
  const updates: Promise<unknown>[] = [];

  for (const ent of list) {
    if (!isAnimal(ent.type)) continue;
    let nx = ent.x;
    let ny = ent.y;
    const speed = SPEED[ent.type] ?? 3;

    if (isHostile(ent.type)) {
      const target = agents
        .filter((a) => a.hp > 0)
        .map((a) => ({ a, d: dist(ent, a) }))
        .filter((t) => t.d < 16)
        .sort((a, b) => a.d - b.d || a.a.hp - b.a.hp)[0];

      if (target) {
        const dx = target.a.x - ent.x;
        const dy = target.a.y - ent.y;
        const d = target.d || 1;
        nx = Math.round(ent.x + (dx / d) * speed);
        ny = Math.round(ent.y + (dy / d) * speed);
        if (d < 3) {
          updates.push(
            db.query('UPDATE agents SET hp = GREATEST(0, hp - 12), current_action = $1 WHERE id = $2', [
              'Atacado por goblin!',
              target.a.id,
            ])
          );
          if (tick % 4 === 0) {
            updates.push(
              db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'COMBATE', $2)", [
                tick,
                `👺 Goblin atacou ${target.a.name}!`,
              ])
            );
          }
        }
      } else {
        nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
        ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
      }
    } else if (isPredator(ent.type)) {
      const preferred =
        ent.type === 'Raposa' || ent.type === 'Águia'
          ? list.filter((e) => e.type === 'Coelho' || e.type === 'Cabra')
          : ent.type === 'Serpente'
            ? list.filter((e) => e.type === 'Coelho' || e.type === 'Cervo')
            : list.filter((e) => isPrey(e.type));

      const range = ent.type === 'Águia' ? 22 : ent.type === 'Urso' ? 18 : 15;
      let best: any = null;
      let bestD = Infinity;
      for (const p of preferred) {
        const d = dist(ent, p);
        if (d < range && d < bestD) {
          bestD = d;
          best = p;
        }
      }

      if (best) {
        const dx = best.x - ent.x;
        const dy = best.y - ent.y;
        const d = bestD || 1;
        nx = Math.round(ent.x + (dx / d) * speed);
        ny = Math.round(ent.y + (dy / d) * speed);
        if (d < 3) {
          const dmg =
            ent.type === 'Urso' ? 35 : ent.type === 'Águia' ? 22 : ent.type === 'Serpente' ? 18 : 20;
          updates.push(
            db.query('UPDATE world_entities SET hp = GREATEST(0, hp - $1) WHERE id = $2', [dmg, best.id])
          );
          if (best.hp - dmg <= 0) {
            updates.push(db.query('DELETE FROM world_entities WHERE id = $1', [best.id]));
            list = list.filter((e) => e.id !== best.id);
            const emoji =
              ent.type === 'Urso'
                ? '🐻'
                : ent.type === 'Raposa'
                  ? '🦊'
                  : ent.type === 'Águia'
                    ? '🦅'
                    : ent.type === 'Serpente'
                      ? '🐍'
                      : '🐺';
            updates.push(
              db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CAÇA', $2)", [
                tick,
                `${emoji} Um ${ent.type.toLowerCase()} abateu um ${best.type.toLowerCase()}.`,
              ])
            );
          }
        }
      } else {
        nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
        ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
      }
    } else {
      let nearestPred: any = null;
      let nearestD = Infinity;
      for (const e of list) {
        if (!isPredator(e.type)) continue;
        const d = dist(ent, e);
        if (d < 12 && d < nearestD) {
          nearestD = d;
          nearestPred = e;
        }
      }
      if (nearestPred) {
        const dx = ent.x - nearestPred.x;
        const dy = ent.y - nearestPred.y;
        const d = nearestD || 1;
        nx = Math.max(5, Math.min(95, Math.round(ent.x + (dx / d) * speed)));
        ny = Math.max(5, Math.min(95, Math.round(ent.y + (dy / d) * speed)));
      } else {
        nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * (speed * 2 + 1)) - speed)));
        ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * (speed * 2 + 1)) - speed)));
      }
    }

    updates.push(db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]));
  }

  const animalCount = list.filter((e) => isAnimal(e.type)).length;
  if (animalCount < 25 && tick % 15 === 0) {
    const pool = ['Coelho', 'Cabra', 'Cervo', 'Raposa', 'Serpente'];
    const t = pool[Math.floor(Math.random() * pool.length)];
    const hp = t === 'Cervo' ? 30 : t === 'Raposa' ? 35 : 20;
    updates.push(
      db.query(
        'INSERT INTO world_entities (type, x, y, hp, resource_amount) VALUES ($1, $2, $3, $4, $5)',
        [t, 10 + Math.floor(Math.random() * 80), 10 + Math.floor(Math.random() * 80), hp, isPrey(t) ? 20 : 0]
      )
    );
  }

  await Promise.all(updates);
  return list;
}
