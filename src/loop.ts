import { db } from './db';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🚀 Motor Físico Assíncrono Iniciado (Modo Performance Individual)...\n');

  while (true) {
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents WHERE hp > 0 ORDER BY id ASC');
      let agents = agentsRes.rows;
      const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
      let entities = entRes.rows; // Lista de recursos do mapa

      // Move a fauna
      for (const ent of entities) {
        if (ent.type === 'Cervo') {
          let nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
          let ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
          await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
        }
      }

      // IA Individual
      for (const agent of agents) {
        let newX = agent.x;
        let newY = agent.y;
        let newWater = Math.max(0, agent.water - 1);
        let newFood = Math.max(0, agent.food - 1);
        let newHp = agent.hp;
        let newWood = agent.wood || 0;
        let newIron = agent.iron || 0;
        let logAcao = 'Refletindo sobre a ilha...';

        // ⚡ A CORREÇÃO: Cada IA vasculha a lista e acha o alvo MAIS PRÓXIMO dela!
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
            // Anda na direção do SEU PRÓPRIO alvo
            newX += Math.round((dx / dist) * Math.min(4, dist));
            newY += Math.round((dy / dist) * Math.min(4, dist));
            logAcao = `Viajando até ${targetEntity.type} em [${targetEntity.x}, ${targetEntity.y}]`;
          } else {
            // Chegou no alvo!
            if (targetEntity.type === 'Árvore Anciã') {
              newWood += targetEntity.resource_amount;
              logAcao = `Derrubou e coletou madeira.`;
            } else if (targetEntity.type === 'Jazida de Ouro') {
              newIron += targetEntity.resource_amount;
              logAcao = `Minerou ouro com sucesso.`;
            } else if (targetEntity.type === 'Cervo') {
              newFood += targetEntity.resource_amount;
              logAcao = `Caçou um Cervo!`;
            }
            
            // Deleta do banco de dados pra ninguém mais tentar pegar
            await db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]);
            // Tira da memória local pro próximo agente na fila não ir atrás de fantasma
            entities = entities.filter(e => e.id !== targetEntity.id);
          }
        } else {
           // Se não tiver alvo, anda de forma orgânica e dispersa pelo mapa
           newX += (Math.floor(Math.random() * 9) - 4);
           newY += (Math.floor(Math.random() * 9) - 4);
           logAcao = 'Explorando o mapa livremente.';
        }

        // 🏠 IA Construtora: Se juntou madeira, faz a casa e espalha a civilização!
        if (newWood >= 50) {
           await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
           newWood -= 30; // Gasta a madeira
           logAcao = `Ergueu uma Casa em [${newX}, ${newY}]!`;
        }

        // Não deixa sair da ilha
        newX = Math.max(5, Math.min(95, newX));
        newY = Math.max(5, Math.min(95, newY));

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
          [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
        );
      }
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(3000); // Roda a cada 3 segundos pra ficar bem fluido
  }
}

gameLoop();