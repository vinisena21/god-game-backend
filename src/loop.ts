import { db } from './db';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🚀 Motor Físico (Com Zoneamento e Repulsão) Iniciado...\n');

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

      // 🦌 Move a Fauna
      for (const ent of entities) {
        if (ent.type === 'Cervo') {
          let nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
          let ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
          await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
        }
      }

      // 🤖 Cérebro e Física dos Agentes
      for (const agent of agents) {
        let newX = agent.x;
        let newY = agent.y;
        let newWater = Math.max(0, agent.water - 1);
        let newFood = Math.max(0, agent.food - 1);
        let newHp = agent.hp;
        let newWood = agent.wood || 0;
        let newIron = agent.iron || 0;
        let logAcao = 'Explorando o mapa livremente...';

        // 🧲 LEI 1: REPULSÃO SOCIAL (Fim do engarrafamento)
        for (const other of agents) {
          if (other.id !== agent.id) {
            const dX = newX - other.x;
            const dY = newY - other.y;
            const dist = Math.sqrt(dX * dX + dY * dY);
            if (dist < 4 && dist > 0) { // Estão muito perto!
              newX += (dX / dist) * 3; // Empurra pra longe
              newY += (dY / dist) * 3;
            }
          }
        }

        // 🎯 BUSCA O RECURSO MAIS PRÓXIMO
        let targetEntity = null;
        let minDist = Infinity;
        for (const ent of entities) {
          const dx = ent.x - newX;
          const dy = ent.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            targetEntity = ent;
          }
        }

        if (targetEntity) {
          const dx = targetEntity.x - newX;
          const dy = targetEntity.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 3) {
            newX += Math.round((dx / dist) * Math.min(4, dist));
            newY += Math.round((dy / dist) * Math.min(4, dist));
            logAcao = `Indo coletar ${targetEntity.type}...`;
          } else {
            if (targetEntity.type === 'Árvore Anciã') { newWood += targetEntity.resource_amount; logAcao = `Coletou madeira.`; }
            else if (targetEntity.type === 'Jazida de Ouro') { newIron += targetEntity.resource_amount; logAcao = `Minerou ouro.`; }
            else if (targetEntity.type === 'Cervo') { newFood += targetEntity.resource_amount; logAcao = `Caçou com sucesso!`; }
            
            await db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]);
            entities = entities.filter(e => e.id !== targetEntity.id);
          }
        } else {
           // Caminhada aleatória se não tiver recurso
           newX += (Math.floor(Math.random() * 9) - 4);
           newY += (Math.floor(Math.random() * 9) - 4);
        }

        // 🏘️ LEI 2: ZONEAMENTO URBANO (Proibido construir no rio ou em cima do vizinho)
        if (newWood >= 40) {
           // Verifica se já tem estrutura num raio de 10 blocos
           const hasHouseNear = structures.some(s => Math.sqrt(Math.pow(s.x - newX, 2) + Math.pow(s.y - newY, 2)) < 10);
           // Verifica se está tentando construir em cima do rio (X entre 40 e 60)
           const isOnRiver = newX > 40 && newX < 60;

           if (!hasHouseNear && !isOnRiver) {
               await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
               newWood -= 40; 
               logAcao = `Comprou um lote e construiu uma Casa!`;
               // Adiciona na memória pra ninguém construir em cima neste mesmo tick
               structures.push({ type: 'Casa', x: newX, y: newY, agent_name: agent.name });
           } else {
               logAcao = `Procurando terreno vazio para construir...`;
               // Força o cara a andar pra bem longe pra achar lote vazio
               newX += (newX > 50 ? 10 : -10);
               newY += (Math.floor(Math.random() * 15) - 7);
           }
        }

        // Limites físicos da Ilha (Areia)
        newX = Math.max(10, Math.min(90, newX));
        newY = Math.max(10, Math.min(90, newY));

        // Salva as variáveis instantaneamente
        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
          [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
        );
      }
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(2500); // Motor rápido!
  }
}

gameLoop();