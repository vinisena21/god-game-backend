import { db } from './db';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🚀 Motor Físico Iniciado (Com Cérebro Social Ativado)...\n');

  while (true) {
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents WHERE hp > 0 ORDER BY id ASC');
      let agents = agentsRes.rows;
      const structRes = await db.query('SELECT * FROM world_structures');
      let structures = structRes.rows;
      const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
      let entities = entRes.rows;

      // ==========================================
      // 🧠 MOTOR SOCIAL (FÍSICA DE ENCONTROS)
      // ==========================================
      const SOCIO_RADIUS = 2; 
      
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const agentA = agents[i];
          const agentB = agents[j];

          if (agentA.hp > 0 && agentB.hp > 0) {
            const dX = agentA.x - agentB.x;
            const dY = agentA.y - agentB.y;
            const dist = Math.sqrt(dX * dX + dY * dY);

            // Se encostaram no mapa
            if (dist < SOCIO_RADIUS) {
              const jaConversaramRes = await db.query(
                'SELECT * FROM agent_relationships WHERE (agent_a_id = $1 AND agent_b_id = $2) OR (agent_a_id = $2 AND agent_b_id = $1) LIMIT 1',
                [agentA.id, agentB.id]
              );

              // Cooldown: Só conversa se nunca conversaram ou se passou 10 Ticks desde a última treta
              if (jaConversaramRes.rows.length === 0 || (world.current_tick - jaConversaramRes.rows[0].last_interaction_tick) > 10) {
                console.log(`🧠 Encontro detectado: ${agentA.name} x ${agentB.name}! Disparando LLM...`);
                
                // Registra o início da interação
                await db.query(
                  "INSERT INTO world_events (tick, type, message) VALUES ($1, 'DIÁLOGO', $2)",
                  [world.current_tick, `💬 ${agentA.name} e ${agentB.name} se encontraram cara a cara.`]
                );

                // Chama a API do Cérebro Social rodando no nosso próprio servidor
                try {
                  const PORT = process.env.PORT || 3333;
                  await fetch(`http://localhost:${PORT}/api/world/social-brain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentA, agentB, tick: world.current_tick })
                  });
                } catch(err) {
                  console.error('Falha ao comunicar com o Cérebro Social:', err);
                }
              }
            }
          }
        }
      }

      // ==========================================
      // 🦌 FAUNA (MOVIMENTO ANIMAL)
      // ==========================================
      for (const ent of entities) {
        if (ent.type === 'Cervo') {
          let nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
          let ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
          await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
        }
      }

      // ==========================================
      // 🤖 AÇÕES INDIVIDUAIS DOS AGENTES
      // ==========================================
      for (const agent of agents) {
        let newX = agent.x; let newY = agent.y;
        let newWater = Math.max(0, agent.water - 1);
        let newFood = Math.max(0, agent.food - 1);
        let newHp = agent.hp;
        let newWood = agent.wood || 0; let newIron = agent.iron || 0;
        let logAcao = 'Explorando a região...';

        // 1. Repulsão (Fim do engarrafamento)
        for (const other of agents) {
          if (other.id !== agent.id) {
            const dX = newX - other.x; const dY = newY - other.y;
            const dist = Math.sqrt(dX * dX + dY * dY);
            if (dist < 4 && dist > 0) {
              newX += (dX / dist) * 3; newY += (dY / dist) * 3;
            }
          }
        }

        // 2. Busca de Recursos
        let targetEntity = null;
        let minDist = Infinity;
        
        // Fome crítica: foca no Cervo
        if (newFood < 20) {
          logAcao = 'Caçando com urgência...';
          for (const ent of entities) {
            if (ent.type === 'Cervo') {
              const dx = ent.x - newX; const dy = ent.y - newY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < minDist) { minDist = dist; targetEntity = ent; }
            }
          }
        }

        // Fome ok: coleta o que estiver mais perto
        if (!targetEntity) {
          for (const ent of entities) {
            const dx = ent.x - newX; const dy = ent.y - newY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) { minDist = dist; targetEntity = ent; }
          }
        }

        // 3. Movimento ou Coleta
        if (targetEntity) {
          const dx = targetEntity.x - newX; const dy = targetEntity.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 3) {
            newX += Math.round((dx / dist) * Math.min(4, dist));
            newY += Math.round((dy / dist) * Math.min(4, dist));
            logAcao = `Indo em direção a ${targetEntity.type}...`;
          } else {
            if (targetEntity.type === 'Árvore Anciã') { 
                newWood += targetEntity.resource_amount; logAcao = `Coletou madeira.`; 
            }
            else if (targetEntity.type === 'Jazida de Ouro') { 
                newIron += targetEntity.resource_amount; logAcao = `Minerou ouro.`; 
                await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MINERAÇÃO', $2)", [world.current_tick, `⛏️ ${agent.name} encontrou e minerou uma Jazida de Ouro!`]);
            }
            else if (targetEntity.type === 'Cervo') { 
                newFood += targetEntity.resource_amount; logAcao = `Caçou com sucesso!`; 
                await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CAÇA', $2)", [world.current_tick, `🦌 ${agent.name} caçou um cervo para se alimentar.`]);
            }
            
            await db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]);
            entities = entities.filter(e => e.id !== targetEntity.id);
          }
        } else {
            newX += (Math.floor(Math.random() * 9) - 4); newY += (Math.floor(Math.random() * 9) - 4);
        }

        // 4. Construção e Zoneamento
        if (newWood >= 40) {
           const hasHouseNear = structures.some(s => Math.sqrt(Math.pow(s.x - newX, 2) + Math.pow(s.y - newY, 2)) < 10);
           const isOnRiver = newX > 40 && newX < 60;

           if (!hasHouseNear && !isOnRiver) {
               await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
               newWood -= 40; 
               logAcao = `Construiu uma Casa!`;
               structures.push({ type: 'Casa', x: newX, y: newY, agent_name: agent.name });
               
               await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CONSTRUÇÃO', $2)", [world.current_tick, `🏘️ ${agent.name} ergueu uma nova casa e expandiu a civilização.`]);
           } else {
               logAcao = `Procurando terreno para construir...`;
               newX += (newX > 50 ? 10 : -10); newY += (Math.floor(Math.random() * 15) - 7);
           }
        }

        // 5. HP Logic
        if (newFood <= 0 || newWater <= 0) {
          newHp = Math.max(0, agent.hp - 10);
        } else {
          newHp = Math.min(100, agent.hp + 5);
        }

        newX = Math.max(10, Math.min(90, newX)); newY = Math.max(10, Math.min(90, newY));

        // 6. Morte
        if (newHp <= 0 && agent.hp > 0) {
            await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MORTE', $2)", [world.current_tick, `💀 ${agent.name} não resistiu e faleceu.`]);
        }

        // 7. Salva o Estado
        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
          [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
        );
      }
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(2500); // 1 tick a cada 2.5 segundos (mas o Socket joga pra tela 4 vezes por segundo!)
  }
}

gameLoop();