import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor do Mundo Iniciado com Crafting. Pressione Ctrl+C para parar.\n');

  while (true) {
    console.log('⏳ Executando ciclo do mundo...');
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents ORDER BY id ASC');
      let agents = agentsRes.rows;

      for (const agent of agents) {
        // Busca os status mais recentes do agente
        const currentAgentRes = await db.query('SELECT hp, water, food, wood, iron, weapon, shield FROM agents WHERE id = $1', [agent.id]);
        const currentStats = currentAgentRes.rows[0];
        
        if (currentStats.hp <= 0) {
          console.log(`💀 ${agent.name} está MORTO.`);
          continue; 
        }

        const otherAgents = agents.filter(a => a.id !== agent.id && a.hp > 0);
        const worldEvents = otherAgents.map(a => `- ${a.name}: "${a.current_action || 'Escondido'}"`).join('\n');

        const promptText = agent.system_prompt || agent.prompt || agent.personality || 'Você é um líder estratégico.';
        const promptComStatus = `${promptText}\n\n⚠️ SEU STATUS: ${currentStats.hp} HP | ${currentStats.water} Água | ${currentStats.food} Comida | ${currentStats.wood} Madeira | ${currentStats.iron} Ferro | ${currentStats.weapon} Armas | ${currentStats.shield} Defesas.\n\nREGRAS DE CRAFTING:\n- Para ganhar madeira, diga que vai "cortar árvore".\n- Para ganhar ferro, diga que vai "minerar".\n- Para "forjar arma" custa 10 Madeira e 5 Ferro (aumenta seu dano).\n- Para "construir muralha" ou "criar escudo" custa 15 Madeira (bloqueia dano).`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, worldEvents);
        
        let newWater = currentStats.water - 5;
        let newFood = currentStats.food - 5;
        let newWood = currentStats.wood || 0;
        let newIron = currentStats.iron || 0;
        let newWeapon = currentStats.weapon || 0;
        let newShield = currentStats.shield || 0;
        let newHp = currentStats.hp;

        if (world.weather === 'Seca Mortal') newWater -= 10;
        if (world.weather === 'Nevasca Extrema') newFood -= 10;
        if (world.weather === 'Chuva Torrencial') newWater += 10;

        const acaoLower = decision.acao?.toLowerCase() || '';
        
        // Sistema de Farming Base
        if (acaoLower.includes('água') || acaoLower.includes('agua') || acaoLower.includes('rio')) newWater += 30;
        if (acaoLower.includes('comida') || acaoLower.includes('caçar') || acaoLower.includes('plantar')) newFood += 30;
        
        // Sistema de Farming de Minérios
        if (acaoLower.includes('madeira') || acaoLower.includes('árvore') || acaoLower.includes('arvore') || acaoLower.includes('cortar')) newWood += 15;
        if (acaoLower.includes('ferro') || acaoLower.includes('minerar') || acaoLower.includes('pedra')) newIron += 10;

        // Sistema de Crafting (Forja)
        if (acaoLower.includes('arma') || acaoLower.includes('espada') || acaoLower.includes('lança')) {
           if (newWood >= 10 && newIron >= 5) {
               newWood -= 10;
               newIron -= 5;
               newWeapon += 1;
               await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CRAFT', `🛠️ ${agent.name} forjou uma nova Arma! Dano aumentado.`]);
           }
        }
        if (acaoLower.includes('muralha') || acaoLower.includes('escudo') || acaoLower.includes('defesa')) {
           if (newWood >= 15) {
               newWood -= 15;
               newShield += 1;
               await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CRAFT', `🛡️ ${agent.name} construiu Defesas! Proteção aumentada.`]);
           }
        }

        // --- MOTOR DE COMBATE AVANÇADO ---
        let targetAgent = null;
        for (const other of otherAgents) {
          if (acaoLower.includes(other.name.toLowerCase())) {
            targetAgent = other;
            break;
          }
        }

        if (targetAgent && (acaoLower.includes('atacar') || acaoLower.includes('roubar') || acaoLower.includes('invadir') || acaoLower.includes('matar'))) {
          // Busca o escudo do alvo na hora do ataque
          const targetStats = await db.query('SELECT id, shield FROM agents WHERE id = $1', [targetAgent.id]);
          const alvoShield = targetStats.rows[0].shield || 0;
          
          // Cálculo de Dano
          const danoBase = 20;
          const danoExtra = newWeapon * 15; // Cada arma dá +15 de dano
          const defesa = alvoShield * 10; // Cada escudo defende 10
          
          let danoFinal = (danoBase + danoExtra) - defesa;
          if (danoFinal < 0) danoFinal = 0; // Não existe dano negativo
          
          const roubo = 15;
          
          await db.query(
            'UPDATE agents SET hp = GREATEST(hp - $1, 0), water = GREATEST(water - $2, 0), food = GREATEST(food - $2, 0) WHERE id = $3',
            [danoFinal, roubo, targetAgent.id]
          );

          newWater += roubo;
          newFood += roubo;

          await db.query(
            'INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)',
            [world.current_tick, 'GUERRA', `⚔️ ${agent.name} atacou ${targetAgent.name}! Dano causado: ${danoFinal} (Bloqueado: ${defesa}).`]
          );
        }

        // Limites
        if (newWater > 100) newWater = 100;
        if (newFood > 100) newFood = 100;
        if (newWater <= 0) { newWater = 0; newHp -= 25; }
        if (newFood <= 0) { newFood = 0; newHp -= 15; }

        // Verifica Morte
        if (newHp <= 0) {
          newHp = 0;
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'MORTE', `💀 ${agent.name} sucumbiu e foi eliminado.`]);
        }

        // Salva os novos status no banco
        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, weapon = $7, shield = $8 WHERE id = $9', 
          [decision.acao, newWater, newFood, newHp, newWood, newIron, newWeapon, newShield, agent.id]
        );
        
        await db.query(
          'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
          [agent.id, decision.memoria, world.current_tick]
        );

        console.log(`🤖 ${agent.name} agiu. HP: ${newHp}`);
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