import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor do Mundo Iniciado. Pressione Ctrl+C para parar.\n');

  while (true) {
    console.log('⏳ Executando ciclo do mundo...');
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents ORDER BY id ASC');
      let agents = agentsRes.rows;

      for (const agent of agents) {
        // Atualiza os dados do agente atual (caso tenha sofrido dano neste mesmo turno)
        const currentAgentRes = await db.query('SELECT hp, water, food FROM agents WHERE id = $1', [agent.id]);
        const currentStats = currentAgentRes.rows[0];
        agent.hp = currentStats.hp;
        agent.water = currentStats.water;
        agent.food = currentStats.food;

        if (agent.hp <= 0) {
          console.log(`💀 ${agent.name} está MORTO e não pode agir.`);
          continue; 
        }

        const otherAgents = agents.filter(a => a.id !== agent.id && a.hp > 0);
        const worldEvents = otherAgents.map(a => `- ${a.name} está executando: "${a.current_action || 'Nenhuma ação conhecida'}"`).join('\n');

        const promptText = agent.prompt || agent.personality || agent.role || 'Você é um líder estratégico.';
        const promptComStatus = `${promptText}\n\n⚠️ SEU STATUS VITAL AGORA: ${agent.hp} HP | ${agent.water} Água | ${agent.food} Comida. Se água ou comida chegarem a zero, você PERDE HP e MORRE.`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, worldEvents);
        
        let newWater = agent.water - 5;
        let newFood = agent.food - 5;
        let newHp = agent.hp;
        let wasAlive = agent.hp > 0;

        if (world.weather === 'Seca Mortal') newWater -= 10;
        if (world.weather === 'Nevasca Extrema') newFood -= 10;
        if (world.weather === 'Chuva Torrencial') newWater += 10;

        const acaoLower = decision.acao?.toLowerCase() || '';
        
        // Farm contra a Natureza
        if (acaoLower.includes('água') || acaoLower.includes('agua') || acaoLower.includes('poço') || acaoLower.includes('rio')) {
          newWater += 30;
        }
        if (acaoLower.includes('comida') || acaoLower.includes('caçar') || acaoLower.includes('colher') || acaoLower.includes('plantar') || acaoLower.includes('alimento')) {
          newFood += 30;
        }

        // --- MOTOR DE COMBATE E ROUBO (PvP) ---
        let targetAgent = null;
        for (const other of otherAgents) {
          if (acaoLower.includes(other.name.toLowerCase())) {
            targetAgent = other;
            break;
          }
        }

        if (targetAgent && (acaoLower.includes('atacar') || acaoLower.includes('roubar') || acaoLower.includes('invadir') || acaoLower.includes('guerra') || acaoLower.includes('destruir') || acaoLower.includes('matar'))) {
          const dano = 20;
          const roubo = 15;
          
          console.log(`⚔️ BATALHA: ${agent.name} atacou ${targetAgent.name}!`);

          // Arranca a vida e recursos do alvo direto no banco de dados
          await db.query(
            'UPDATE agents SET hp = GREATEST(hp - $1, 0), water = GREATEST(water - $2, 0), food = GREATEST(food - $2, 0) WHERE id = $3',
            [dano, roubo, targetAgent.id]
          );

          // Transfere o saque para o atacante
          newWater += roubo;
          newFood += roubo;

          // Crava a batalha no Livro das Eras
          await db.query(
            'INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)',
            [world.current_tick, 'GUERRA', `⚔️ ${agent.name} atacou ${targetAgent.name}, causando ${dano} de dano e roubando recursos!`]
          );
        }
        // ----------------------------------------

        if (newWater > 100) newWater = 100;
        if (newFood > 100) newFood = 100;
        
        if (newWater <= 0) {
          newWater = 0;
          newHp -= 25;
        }
        if (newFood <= 0) {
          newFood = 0;
          newHp -= 15;
        }

        if (newHp <= 0) {
          newHp = 0;
          if (wasAlive) {
            await db.query(
              'INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)',
              [world.current_tick, 'MORTE', `💀 A facção de ${agent.name} sucumbiu e foi eliminada da história.`]
            );
          }
        }

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4 WHERE id = $5', 
          [decision.acao, newWater, newFood, newHp, agent.id]
        );
        
        await db.query(
          'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
          [agent.id, decision.memoria, world.current_tick]
        );

        console.log(`🤖 ${agent.name} [HP: ${newHp} | W: ${newWater} | F: ${newFood}]: ${decision.acao}`);
        await sleep(5000); 
      }
      
      console.log('✅ Ciclo finalizado!\n');
    } catch (error) {
      console.error('❌ Erro no loop do jogo:', error);
    }
    await sleep(60000);
  }
}

gameLoop();