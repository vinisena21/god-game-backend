import { db } from './db';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🚀 Motor Físico Iniciado (Com Registro de Eventos no Livro das Eras)...\n');

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

      // 🦌 Fauna
      for (const ent of entities) {
        if (ent.type === 'Cervo') {
          let nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
          let ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
          await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
        }
      }

      // 🤖 Ações dos Agentes
      for (const agent of agents) {
        let newX = agent.x; let newY = agent.y;
        let newWater = Math.max(0, agent.water - 1);
        let newFood = Math.max(0, agent.food - 1);
        let newHp = agent.hp;
        let newWood = agent.wood || 0; let newIron = agent.iron || 0;
        let logAcao = 'Explorando a região...';

        // Repulsão (Fim do engarrafamento)
        for (const other of agents) {
          if (other.id !== agent.id) {
            const dX = newX - other.x; const dY = newY - other.y;
            const dist = Math.sqrt(dX * dX + dY * dY);
            if (dist < 4 && dist > 0) {
              newX += (dX / dist) * 3; newY += (dY / dist) * 3;
            }
          }
        }

        // Busca o recurso mais próximo
        let targetEntity = null;
        let minDist = Infinity;
        for (const ent of entities) {
          const dx = ent.x - newX; const dy = ent.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; targetEntity = ent; }
        }

        if (targetEntity) {
          const dx = targetEntity.x - newX; const dy = targetEntity.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 3) {
            newX += Math.round((dx / dist) * Math.min(4, dist));
            newY += Math.round((dy / dist) * Math.min(4, dist));
            logAcao = `Indo em direção a ${targetEntity.type}...`;
          } else {
            // CHEGOU NO RECURSO: Coleta e salva no Livro das Eras!
            if (targetEntity.type === 'Árvore Anciã') { 
                newWood += targetEntity.resource_amount; logAcao = `Coletou madeira.`; 
            }
            else if (targetEntity.type === 'Jazida de Ouro') { 
                newIron += targetEntity.resource_amount; logAcao = `Minerou ouro.`; 
                // ⚡ NOVO: Registra mineração épica
                await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MINERAÇÃO', $2)", [world.current_tick, `⛏️ ${agent.name} encontrou e minerou uma Jazida de Ouro!`]);
            }
            else if (targetEntity.type === 'Cervo') { 
                newFood += targetEntity.resource_amount; logAcao = `Caçou com sucesso!`; 
                // ⚡ NOVO: Registra caça
                await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CAÇA', $2)", [world.current_tick, `🦌 ${agent.name} caçou um cervo para se alimentar.`]);
            }
            
            await db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]);
            entities = entities.filter(e => e.id !== targetEntity.id);
          }
        } else {
           newX += (Math.floor(Math.random() * 9) - 4); newY += (Math.floor(Math.random() * 9) - 4);
        }

        // CONSTRUÇÃO E ZONEAMENTO
        if (newWood >= 40) {
           const hasHouseNear = structures.some(s => Math.sqrt(Math.pow(s.x - newX, 2) + Math.pow(s.y - newY, 2)) < 10);
           const isOnRiver = newX > 40 && newX < 60;

           if (!hasHouseNear && !isOnRiver) {
               await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
               newWood -= 40; 
               logAcao = `Construiu uma Casa!`;
               structures.push({ type: 'Casa', x: newX, y: newY, agent_name: agent.name });
               
               // ⚡ NOVO: Registra expansão da cidade
               await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'CONSTRUÇÃO', $2)", [world.current_tick, `🏘️ ${agent.name} ergueu uma nova casa e expandiu a civilização.`]);
           } else {
               logAcao = `Procurando terreno para construir...`;
               newX += (newX > 50 ? 10 : -10); newY += (Math.floor(Math.random() * 15) - 7);
           }
        }

        newX = Math.max(10, Math.min(90, newX)); newY = Math.max(10, Math.min(90, newY));

        // ⚡ NOVO: Registra Morte se acontecer
        if (newHp <= 0) {
            await db.query("INSERT INTO world_events (tick, type, message) VALUES ($1, 'MORTE', $2)", [world.current_tick, `💀 ${agent.name} não resistiu e faleceu.`]);
        }

        // Salva tudo
        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
          [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
        );
      }
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(2500); 
  }
}

gameLoop();