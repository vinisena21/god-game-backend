import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🚀 Motor Físico Assíncrono Iniciado (Modo Performance)...\n');

  while (true) {
    try {
      // 1. Atualiza o Tick Global
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents WHERE hp > 0 ORDER BY id ASC');
      let agents = agentsRes.rows;
      const structRes = await db.query('SELECT * FROM world_structures');
      let structures = structRes.rows;
      const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
      let entities = entRes.rows;

      // 2. Processamento Local da Fauna (Sem travar na API)
      for (const ent of entities) {
        if (ent.type === 'Cervo') {
          let nx = Math.max(5, Math.min(95, ent.x + (Math.floor(Math.random() * 5) - 2)));
          let ny = Math.max(5, Math.min(95, ent.y + (Math.floor(Math.random() * 5) - 2)));
          await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
        }
      }

      // 3. Execução dos Agentes
      for (const agent of agents) {
        let newX = agent.x;
        let newY = agent.y;
        let newWater = Math.max(0, agent.water - 1);
        let newFood = Math.max(0, agent.food - 1);
        let newHp = agent.hp;
        let newWood = agent.wood || 0;
        let newIron = agent.iron || 0;

        // Movimento autônomo leve se não houver ordem crítica
        // O agente busca o recurso ou estrutura mais próxima visualmente
        const targetEntity = entities[0];
        let logAcao = 'Explorando e coletando recursos da ilha.';

        if (targetEntity) {
          const dx = targetEntity.x - newX;
          const dy = targetEntity.y - newY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 5) {
            // Anda na direção do recurso
            newX += Math.round((dx / dist) * Math.min(4, dist));
            newY += Math.round((dy / dist) * Math.min(4, dist));
            logAcao = `Movendo-se em direção a ${targetEntity.type} [${targetEntity.x}, ${targetEntity.y}]`;
          } else {
            // Chegou no recurso, coleta!
            if (targetEntity.type === 'Árvore Anciã') {
              newWood += targetEntity.resource_amount;
              logAcao = `Coletou madeira de ${targetEntity.type}`;
            } else if (targetEntity.type === 'Jazida de Ouro') {
              newIron += targetEntity.resource_amount;
              logAcao = `Minerou recursos de ${targetEntity.type}`;
            }
            await db.query('DELETE FROM world_entities WHERE id = $1', [targetEntity.id]);
          }
        }

        // Limites físicos da ilha
        newX = Math.max(5, Math.min(95, newX));
        newY = Math.max(5, Math.min(95, newY));

        // Salva o estado atualizado instantaneamente no banco
        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9',
          [logAcao, newWater, newFood, newHp, newWood, newIron, newX, newY, agent.id]
        );
      }

      console.log(`✅ Tick ${world.current_tick} processado com sucesso.`);
    } catch (error) {
      console.error('❌ Erro no loop assíncrono:', error);
    }
    
    // Intervalo reduzido para dar fluidez real ao jogo
    await sleep(6000);
  }
}

gameLoop();