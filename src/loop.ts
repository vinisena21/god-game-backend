import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor do Mundo Iniciado com Biomas e Estruturas Físicas. Pressione Ctrl+C para parar.\n');

  while (true) {
    console.log('⏳ Executando ciclo do mundo...');
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents ORDER BY id ASC');
      let agents = agentsRes.rows;

      // ⚡ Busca todas as estruturas do mapa
      const structRes = await db.query('SELECT * FROM world_structures');
      let structures = structRes.rows;

      for (const agent of agents) {
        const currentAgentRes = await db.query('SELECT hp, water, food, wood, iron, weapon, shield, x, y FROM agents WHERE id = $1', [agent.id]);
        const currentStats = currentAgentRes.rows[0];
        
        if (currentStats.hp <= 0) {
          continue; 
        }

        const otherAgents = agents.filter(a => a.id !== agent.id && a.hp > 0);
        const worldEvents = otherAgents.map(a => `- ${a.name}: "${a.current_action || 'Escondido'}"`).join('\n');

        let newX = currentStats.x || 50;
        let newY = currentStats.y || 50;
        
        newX += Math.floor(Math.random() * 15) - 7; 
        newY += Math.floor(Math.random() * 15) - 7;

        if (newX < 5) newX = 5;
        if (newX > 95) newX = 95;
        if (newY < 5) newY = 5;
        if (newY > 95) newY = 95;

        let currentBiome = '';
        if (newX < 50 && newY < 50) currentBiome = 'Floresta Densa (Noroeste)';
        else if (newX >= 50 && newY < 50) currentBiome = 'Montanhas de Ferro (Nordeste)';
        else if (newX < 50 && newY >= 50) currentBiome = 'Oásis Sagrado (Sudoeste)';
        else currentBiome = 'Deserto Escaldante (Sudeste)';

        // Identifica o que pertence a este agente
        const myFarms = structures.filter(s => s.agent_name === agent.name && s.type === 'Fazenda').length;
        const myWalls = structures.filter(s => s.agent_name === agent.name && s.type === 'Muralha').length;

        const promptText = agent.system_prompt || agent.prompt || agent.personality || 'Você é um líder estratégico.';
        const promptComStatus = `${promptText}\n\n⚠️ SEU STATUS: ${currentStats.hp} HP | ${currentStats.water} Água | ${currentStats.food} Comida | ${currentStats.wood} Madeira | ${currentStats.iron} Ferro | ${currentStats.weapon} Armas.\nVocê possui ${myFarms} Fazendas e ${myWalls} Muralhas no mapa.\n\n📍 LOCALIZAÇÃO ATUAL: ${currentBiome}.\nO mapa tem 4 biomas: Floresta (+Madeira), Montanhas (+Ferro), Oásis (+Água/Comida) e Deserto (Drena água).\n\nREGRAS DE CONSTRUÇÃO E CRAFTING:\n- "cortar árvore" / "minerar": ganha recursos base.\n- "forjar arma" (10 Mad, 5 Fer): aumenta seu dano.\n- "construir muralha" (15 Mad, 5 Fer): Cria uma parede física que bloqueia ataques inimigos contra você.\n- "construir fazenda" (20 Mad): Cria uma fazenda que te dá +15 de comida por turno passivamente.`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, worldEvents);
        
        let newWater = currentStats.water - 5;
        let newFood = currentStats.food - 5 + (myFarms * 15); // ⚡ COMIDA PASSIVA DAS FAZENDAS!
        let newWood = currentStats.wood || 0;
        let newIron = currentStats.iron || 0;
        let newWeapon = currentStats.weapon || 0;
        let newShield = currentStats.shield || 0;
        let newHp = currentStats.hp;

        if (world.weather === 'Seca Mortal') newWater -= 10;
        if (world.weather === 'Nevasca Extrema') newFood -= 10;
        if (world.weather === 'Chuva Torrencial') newWater += 10;
        if (world.weather === 'Clima Instável') {
          newWater += Math.floor(Math.random() * 30) - 20; 
          newFood += Math.floor(Math.random() * 30) - 20;  
          if (Math.random() > 0.7) newHp -= 15; 
        }

        let gainWater = 30;
        let gainFood = 30;
        let gainWood = 15;
        let gainIron = 10;

        if (currentBiome.includes('Oásis')) { gainWater = 50; gainFood = 50; }
        if (currentBiome.includes('Floresta')) { gainWood = 30; }
        if (currentBiome.includes('Montanhas')) { gainIron = 20; }
        if (currentBiome.includes('Deserto')) { newWater -= 10; }

        const acaoLower = decision.acao?.toLowerCase() || '';
        
        if (acaoLower.includes('água') || acaoLower.includes('agua') || acaoLower.includes('rio')) newWater += gainWater;
        if (acaoLower.includes('comida') || acaoLower.includes('caçar') || acaoLower.includes('plantar')) newFood += gainFood;
        if (acaoLower.includes('madeira') || acaoLower.includes('árvore') || acaoLower.includes('arvore') || acaoLower.includes('cortar')) newWood += gainWood;
        if (acaoLower.includes('ferro') || acaoLower.includes('minerar') || acaoLower.includes('pedra')) newIron += gainIron;

        // ⚡ SISTEMA DE CONSTRUÇÃO FÍSICA NO MAPA
        if (acaoLower.includes('arma') || acaoLower.includes('espada')) {
           if (newWood >= 10 && newIron >= 5) {
               newWood -= 10; newIron -= 5; newWeapon += 1;
               await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CRAFT', `🛠️ ${agent.name} forjou uma Arma!`]);
           }
        }
        if (acaoLower.includes('muralha') || acaoLower.includes('defesa') || acaoLower.includes('parede')) {
           if (newWood >= 15 && newIron >= 5) {
               newWood -= 15; newIron -= 5;
               await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 100)', [agent.name, 'Muralha', newX, newY]);
               await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CONSTRUÇÃO', `🧱 ${agent.name} ergueu uma Muralha em [${newX}, ${newY}]!`]);
           }
        }
        if (acaoLower.includes('fazenda') || acaoLower.includes('plantação')) {
           if (newWood >= 20) {
               newWood -= 20;
               await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 50)', [agent.name, 'Fazenda', newX, newY]);
               await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CONSTRUÇÃO', `🌾 ${agent.name} construiu uma Fazenda em [${newX}, ${newY}]!`]);
           }
        }

        // Motor de Combate (Atacando Muralhas ou Agentes)
        let targetAgent = null;
        for (const other of otherAgents) {
          if (acaoLower.includes(other.name.toLowerCase())) {
            targetAgent = other;
            break;
          }
        }

        if (targetAgent && (acaoLower.includes('atacar') || acaoLower.includes('roubar') || acaoLower.includes('invadir') || acaoLower.includes('matar'))) {
          // Procura se o alvo tem uma muralha no mapa
          const targetWall = structures.find(s => s.agent_name === targetAgent.name && s.type === 'Muralha');
          
          const danoFinal = 20 + (newWeapon * 15); 
          
          if (targetWall) {
             // O ataque bate na muralha!
             const newWallHp = targetWall.hp - danoFinal;
             if (newWallHp <= 0) {
                await db.query('DELETE FROM world_structures WHERE id = $1', [targetWall.id]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'DESTRUIÇÃO', `💥 ${agent.name} destruiu a Muralha de ${targetAgent.name}!`]);
             } else {
                await db.query('UPDATE world_structures SET hp = $1 WHERE id = $2', [newWallHp, targetWall.id]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'GUERRA', `⚔️ ${agent.name} atacou a Muralha de ${targetAgent.name} (HP: ${newWallHp})!`]);
             }
          } else {
             // O ataque acerta o agente direto
             const roubo = 15;
             await db.query(
               'UPDATE agents SET hp = GREATEST(hp - $1, 0), water = GREATEST(water - $2, 0), food = GREATEST(food - $2, 0) WHERE id = $3',
               [danoFinal, roubo, targetAgent.id]
             );
             newWater += roubo;
             newFood += roubo;
             await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'GUERRA', `⚔️ ${agent.name} atacou diretamente ${targetAgent.name}! Dano: ${danoFinal}.`]);
          }
        }

        if (newWater > 100) newWater = 100;
        if (newFood > 100) newFood = 100;
        if (newWater <= 0) { newWater = 0; newHp -= 25; }
        if (newFood <= 0) { newFood = 0; newHp -= 15; }

        if (newHp <= 0) {
          newHp = 0;
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'MORTE', `💀 ${agent.name} sucumbiu em: ${currentBiome}.`]);
        }

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, weapon = $7, shield = $8, x = $9, y = $10 WHERE id = $11', 
          [decision.acao, newWater, newFood, newHp, newWood, newIron, newWeapon, newShield, newX, newY, agent.id]
        );
        
        await db.query(
          'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
          [agent.id, decision.memoria, world.current_tick]
        );

        console.log(`🤖 ${agent.name} agiu em [${currentBiome}]. HP: ${newHp}`);
        await sleep(2000); 
      }
      
      console.log('✅ Ciclo finalizado!\n');
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(15000);
  }
}

gameLoop();