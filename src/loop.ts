import { db } from './db';
import { getAgentDecision } from './ai';
import { tickFauna, isPrey, foodFromPrey } from './fauna';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** ~1.25 tick/s — antes era 2.5s (~0.4 tick/s) */
const TICK_MS = 800;

const WEATHERS = ['Ensolarado', 'Nublado', 'Chuva leve', 'Tempestade', 'Ensolarado', 'Nublado'];

const DESPERATE_PRAYERS = [
  'Criador, estou morrendo de fome. Tenha piedade!',
  'Deus da ilha, a sede me consome. Envie chuva ou água!',
  'Senhor, minha força acaba. Salve-me deste sofrimento!',
  'Ouça minha oração... não deixe que eu pereça sozinho.',
  'Criador onipotente, conceda-me provisões para sobreviver.',
  'Estou ferido e fraco. Peço a sua graça divina!',
];

async function gameLoop() {
  console.log(`🚀 Motor rápido (${TICK_MS}ms/tick)...\n`);

  while (true) {
    const t0 = Date.now();
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      if (!world) {
        await sleep(TICK_MS);
        continue;
      }

      // Clima a cada ~24s de wall-clock (30 ticks)
      if (world.current_tick % 30 === 0) {
        const newWeather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
        if (newWeather !== world.weather) {
          await db.query('UPDATE world_state SET weather = $1 WHERE id = 1', [newWeather]);
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [
            world.current_tick,
            'CLIMA',
            `🌤️ O clima mudou para: ${newWeather}`,
          ]);
          world.weather = newWeather;
        }
      }

      const [agentsRes, structRes, entRes] = await Promise.all([
        db.query('SELECT * FROM agents WHERE hp > 0 ORDER BY id ASC'),
        db.query('SELECT * FROM world_structures'),
        db.query('SELECT * FROM world_entities WHERE hp > 0'),
      ]);
      let agents = agentsRes.rows;
      let structures = structRes.rows;
      let entities = entRes.rows;

      // Social — menos queries: só a cada 2 ticks e cooldown maior
      if (world.current_tick % 2 === 0) {
        const SOCIO_RADIUS = 2.5;
        for (let i = 0; i < agents.length; i++) {
          for (let j = i + 1; j < agents.length; j++) {
            const agentA = agents[i];
            const agentB = agents[j];
            if (agentA.hp <= 0 || agentB.hp <= 0) continue;
            const dist = Math.sqrt((agentA.x - agentB.x) ** 2 + (agentA.y - agentB.y) ** 2);
            if (dist < SOCIO_RADIUS) {
              const rel = await db.query(
                `SELECT last_interaction_tick FROM agent_relationships
                 WHERE (agent_a_id = $1 AND agent_b_id = $2) OR (agent_a_id = $2 AND agent_b_id = $1) LIMIT 1`,
                [agentA.id, agentB.id]
              );
              const lastTick = rel.rows[0]?.last_interaction_tick ?? -999;
              if (world.current_tick - lastTick > 20) {
                await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'DIÁLOGO', $2)", [
                  world.current_tick,
                  `💬 ${agentA.name} e ${agentB.name} se encontraram.`,
                ]);
                try {
                  const PORT = process.env.PORT || 3333;
                  // fire-and-forget — não bloqueia o tick
                  void fetch(`http://localhost:${PORT}/api/world/social-brain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentA, agentB, tick: world.current_tick }),
                  });
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }
      }

      entities = await tickFauna(entities, world.current_tick);

      // IA mais rara em wall-clock (a cada ~10s)
      const useAI = world.current_tick % 12 === 0 && agents.length > 0;

      // Updates em batch no final
      const updates: Promise<unknown>[] = [];

      for (const agent of agents) {
        let newX = agent.x;
        let newY = agent.y;
        // Consumo calibrado para tick rápido (~mesmo ritmo de antes em wall-clock)
        let newWater = agent.water;
        let newFood = agent.food;
        if (world.current_tick % 3 === 0) {
          newWater = Math.max(0, newWater - 1);
          newFood = Math.max(0, newFood - 1);
        }
        let newHp = agent.hp;
        let newWood = agent.wood || 0;
        let newIron = agent.iron || 0;
        let logAcao = agent.current_action || 'Explorando...';

        if (world.weather?.includes('Chuva') || world.weather?.includes('Tempestade')) {
          newWater = Math.min(100, newWater + 1);
        }

        for (const other of agents) {
          if (other.id !== agent.id) {
            const dX = newX - other.x;
            const dY = newY - other.y;
            const dist = Math.sqrt(dX * dX + dY * dY);
            if (dist < 4 && dist > 0) {
              newX += (dX / dist) * 3;
              newY += (dY / dist) * 3;
            }
          }
        }

        let targetEntity: any = null;
        let minDist = Infinity;

        if (newFood < 25) {
          logAcao = 'Caçando com urgência...';
          for (const ent of entities) {
            if (isPrey(ent.type)) {
              const dist = Math.sqrt((ent.x - newX) ** 2 + (ent.y - newY) ** 2);
              if (dist < minDist) {
                minDist = dist;
                targetEntity = ent;
              }
            }
          }
        }

        if (!targetEntity) {
          for (const ent of entities) {
            const dist = Math.sqrt((ent.x - newX) ** 2 + (ent.y - newY) ** 2);
            if (dist < minDist) {
              minDist = dist;
              targetEntity = ent;
            }
          }
        }

        if (targetEntity) {
          const dx = targetEntity.x - newX;
          const dy = targetEntity.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Passos maiores = movimento mais fluido/rápido
          const step = 6;
          if (dist > 3) {
            newX += Math.round((dx / dist) * Math.min(step, dist));
            newY += Math.round((dy / dist) * Math.min(step, dist));
            logAcao = `Indo a ${targetEntity.type}...`;
          } else {
            if (targetEntity.type === 'Árvore Anciã') {
              newWood += targetEntity.resource_amount || 50;
              logAcao = 'Coletou madeira.';
            } else if (targetEntity.type === 'Jazida de Ouro') {
              newIron += targetEntity.resource_amount || 100;
              logAcao = 'Minerou ouro.';
              updates.push(
                db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MINERAÇÃO', $2)", [
                  world.current_tick,
                  `⛏️ ${agent.name} minerou ouro!`,
                ])
              );
            } else if (isPrey(targetEntity.type)) {
              newFood += foodFromPrey(targetEntity.type);
              logAcao = `Caçou um ${targetEntity.type}!`;
              updates.push(
                db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CAÇA', $2)", [
                  world.current_tick,
                  `🍖 ${agent.name} caçou um ${targetEntity.type.toLowerCase()}.`,
                ])
              );
            }
            updates.push(db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]));
            entities = entities.filter((e) => e.id !== targetEntity.id);
          }
        } else {
          newX += Math.floor(Math.random() * 11) - 5;
          newY += Math.floor(Math.random() * 11) - 5;
        }

        if (newWood >= 40) {
          const hasHouseNear = structures.some(
            (s) => Math.sqrt((s.x - newX) ** 2 + (s.y - newY) ** 2) < 10
          );
          const isOnRiver = newX > 40 && newX < 60;
          if (!hasHouseNear && !isOnRiver) {
            updates.push(
              db.query(
                'INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)',
                [agent.name, 'Casa', newX, newY]
              )
            );
            newWood -= 40;
            logAcao = 'Construiu uma Casa!';
            structures.push({ type: 'Casa', x: newX, y: newY, agent_name: agent.name });
            updates.push(
              db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CONSTRUÇÃO', $2)", [
                world.current_tick,
                `🏘️ ${agent.name} ergueu uma casa.`,
              ])
            );
          } else {
            logAcao = 'Procurando terreno...';
            newX += newX > 50 ? 8 : -8;
          }
        }

        if (
          agent.hp > 70 &&
          newFood > 40 &&
          newWater > 30 &&
          agent.society !== 'Nenhuma' &&
          world.current_tick % 40 === 0 &&
          Math.random() < 0.25
        ) {
          const hasHouse = structures.some((s) => s.agent_name === agent.name);
          if (hasHouse) {
            const babyName = `${agent.name.split(' ')[0]} Jr.`;
            const exists = await db.query('SELECT id FROM agents WHERE name = $1', [babyName]);
            if (exists.rows.length === 0) {
              updates.push(
                db.query(
                  `INSERT INTO agents (name, hp, water, food, wood, iron, x, y, society, current_action)
                   VALUES ($1, 80, 40, 40, 0, 0, $2, $3, $4, 'Nascendo')`,
                  [babyName, newX + 2, newY + 2, agent.society]
                )
              );
              updates.push(
                db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'NASCIMENTO', $2)", [
                  world.current_tick,
                  `👶 ${babyName} nasceu!`,
                ])
              );
              newFood -= 15;
            }
          }
        }

        const isDesperate = agent.hp < 35 || newFood < 10 || newWater < 10;
        if (isDesperate && Math.random() < 0.12) {
          const recentPrayer = await db.query(
            `SELECT id FROM world_events WHERE type = 'ORAÇÃO' AND message LIKE $1 AND tick > $2 LIMIT 1`,
            [`%${agent.name}%`, world.current_tick - 12]
          );
          if (recentPrayer.rows.length === 0) {
            const prayer = DESPERATE_PRAYERS[Math.floor(Math.random() * DESPERATE_PRAYERS.length)];
            updates.push(
              db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'ORAÇÃO', $2)", [
                world.current_tick,
                `🙏 ${agent.name}: "${prayer}"`,
              ])
            );
            logAcao = 'Ajoelhado em oração...';
          }
        }

        if (useAI && Math.random() < 0.25) {
          try {
            const recentEvents = await db.query('SELECT message FROM world_events ORDER BY id DESC LIMIT 4');
            const decision = await getAgentDecision(
              agent.name,
              agent.personality || 'Sobrevivente',
              world.weather,
              recentEvents.rows.map((r: any) => r.message).join('\n')
            );
            if (decision.acao) logAcao = decision.acao;
            if (decision.oracao) {
              updates.push(
                db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'ORAÇÃO', $2)", [
                  world.current_tick,
                  `🙏 ${agent.name}: "${decision.oracao}"`,
                ])
              );
            }
          } catch {
            /* ignore */
          }
        }

        if (newFood <= 0 || newWater <= 0) newHp = Math.max(0, agent.hp - 8);
        else if (world.current_tick % 2 === 0) newHp = Math.min(100, agent.hp + 3);
        if (world.weather === 'Tempestade' && Math.random() < 0.1) newHp = Math.max(0, newHp - 4);

        newX = Math.max(8, Math.min(92, newX));
        newY = Math.max(8, Math.min(92, newY));

        if (newHp <= 0 && agent.hp > 0) {
          updates.push(
            db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MORTE', $2)", [
              world.current_tick,
              `💀 ${agent.name} faleceu.`,
            ])
          );
        }

        updates.push(
          db.query(
            'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
            [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
          )
        );
      }

      await Promise.all(updates);
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }

    // Mantém ritmo estável mesmo se o tick demorar
    const elapsed = Date.now() - t0;
    await sleep(Math.max(50, TICK_MS - elapsed));
  }
}

gameLoop();
