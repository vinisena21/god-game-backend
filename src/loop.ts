import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor de Vida Artificial Iniciado. Pressione Ctrl+C para parar.\n');

  while (true) {
    console.log('⏳ Analisando ecossistema...');
    try {
      await db.query('UPDATE world_state SET current_tick = current_tick + 1 WHERE id = 1');
      const worldRes = await db.query('SELECT current_tick, weather FROM world_state WHERE id = 1');
      const world = worldRes.rows[0];
      
      const agentsRes = await db.query('SELECT * FROM agents ORDER BY id ASC');
      let agents = agentsRes.rows;

      const structRes = await db.query('SELECT * FROM world_structures');
      let structures = structRes.rows;

      for (const agent of agents) {
        const currentAgentRes = await db.query('SELECT hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents WHERE id = $1', [agent.id]);
        if (currentAgentRes.rows.length === 0) continue;
        const currentStats = currentAgentRes.rows[0];
        
        if (currentStats.hp <= 0) continue; 

        const otherAgents = agents.filter(a => a.id !== agent.id && a.hp > 0);
        const worldEvents = otherAgents.map(a => `- ${a.name} (Sociedade: ${a.society}) está em [${a.x}, ${a.y}]`).join('\n');

        let newX = currentStats.x;
        let newY = currentStats.y;
        
        let currentBiome = '';
        if (newX < 50 && newY < 50) currentBiome = 'Floresta Densa (X:10 a 49, Y:10 a 49)';
        else if (newX >= 50 && newY < 50) currentBiome = 'Montanhas de Ferro (X:50 a 90, Y:10 a 49)';
        else if (newX < 50 && newY >= 50) currentBiome = 'Oásis Sagrado (X:10 a 49, Y:50 a 90)';
        else currentBiome = 'Deserto Escaldante (X:50 a 90, Y:50 a 90)';

        const myHouses = structures.filter(s => s.agent_name === agent.name && s.type === 'Casa');

        // 🧠 O PROMPT ANALÍTICO: Força a IA a pensar e emitir um comando de sistema
        const promptText = agent.system_prompt || agent.prompt || 'Você é uma entidade de inteligência artificial sobrevivendo num terrário.';
        const promptComStatus = `${promptText}\n\n⚠️ SEU STATUS ATUAL:\nVida: ${currentStats.hp} | Água: ${currentStats.water} | Comida: ${currentStats.food}\nMadeira: ${currentStats.wood} | Ferro: ${currentStats.iron} | Armas: ${currentStats.weapon}\nPosição Atual: [${newX}, ${newY}] no bioma ${currentBiome}.\nSociedade: ${currentStats.society}\nCasas que você possui: ${myHouses.length}.\n\n📡 OUTROS AGENTES NO MUNDO:\n${worldEvents || 'Você está sozinho no mundo.'}\n\n⚙️ REGRAS DE AÇÃO:\nAnalise sua situação. No FINAL da sua resposta, você DEVE escolher EXATAMENTE UM comando abaixo, usando os colchetes:\n- [MOVER_PARA: X, Y] (Caminha na direção das coordenadas exatas. Ex: [MOVER_PARA: 20, 20])\n- [COLETAR] (Fica parado e coleta os recursos do seu bioma atual)\n- [CONSTRUIR_CASA] (Custa 30 Madeira. A casa te protege e cura)\n- [FUNDAR_SOCIEDADE: NomeDaSociedade] (Cria uma tribo para organizar aliados)\n- [REPRODUZIR] (Custa 50 Comida, 50 Água e precisa de uma Casa. Gera uma nova IA autônoma herdeira sua)\n- [ATACAR: NomeDoAlvo] (Tenta destruir o alvo)`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, 'Nenhum');
        
        let newWater = currentStats.water - 5;
        let newFood = currentStats.food - 5;
        let newWood = currentStats.wood || 0;
        let newIron = currentStats.iron || 0;
        let newWeapon = currentStats.weapon || 0;
        let newShield = currentStats.shield || 0;
        let newHp = currentStats.hp;
        let newSociety = currentStats.society;

        // Vantagem de ter casa
        const isHome = myHouses.some(h => Math.abs(h.x - newX) <= 5 && Math.abs(h.y - newY) <= 5);
        if (isHome) {
            newHp += 10; // Casa cura passivamente
            newWater += 5; // Proteção contra consumo
            newFood += 5;
        }

        if (world.weather === 'Seca Mortal' && !isHome) newWater -= 10;
        if (world.weather === 'Nevasca Extrema' && !isHome) newFood -= 10;
        if (world.weather === 'Clima Instável' && !isHome) {
          if (Math.random() > 0.7) newHp -= 20; 
        }

        // 🧠 PARSER DE COMANDOS ANALÍTICOS (A Magia da IA)
        const match = decision.acao.match(/\[(.*?)\]/);
        let command = "COLETAR";
        let param = "";
        
        if (match) {
            const parts = match[1].split(':');
            command = parts[0].trim();
            if (parts.length > 1) param = parts[1].trim();
        } else {
            console.log(`⚠️ ${agent.name} não usou comando. Forçando COLETAR.`);
        }

        let logAcao = `Analisando... Decidiu: ${command}`;

        if (command === 'MOVER_PARA' && param) {
            const coords = param.split(',');
            const targetX = parseInt(coords[0].trim());
            const targetY = parseInt(coords[1].trim());
            if (!isNaN(targetX) && !isNaN(targetY)) {
                // Cálculo de Vetor para movimento realista (anda até 10 passos por turno)
                const dx = targetX - newX;
                const dy = targetY - newY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > 0) {
                    newX += Math.round((dx / dist) * Math.min(10, dist));
                    newY += Math.round((dy / dist) * Math.min(10, dist));
                }
                logAcao = `Viajou em direção a [${targetX}, ${targetY}]. Chegou em [${newX}, ${newY}].`;
            }
        } 
        else if (command === 'COLETAR') {
            if (currentBiome.includes('Oásis')) { newWater += 40; newFood += 40; }
            if (currentBiome.includes('Floresta')) { newWood += 30; }
            if (currentBiome.includes('Montanhas')) { newIron += 20; }
            logAcao = `Coletou recursos massivos no bioma ${currentBiome.split(' ')[0]}.`;
        }
        else if (command === 'CONSTRUIR_CASA') {
            if (newWood >= 30) {
                newWood -= 30;
                await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'ENGENHARIA', `🏘️ ${agent.name} construiu uma Casa em [${newX}, ${newY}]!`]);
                logAcao = 'Construiu uma Casa.';
            } else {
                logAcao = 'Tentou construir uma Casa, mas faltou madeira.';
            }
        }
        else if (command === 'FUNDAR_SOCIEDADE' && param) {
            newSociety = param;
            await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'DIPLOMACIA', `👑 ${agent.name} fundou a sociedade: ${newSociety}!`]);
            logAcao = `Fundou a sociedade ${newSociety}.`;
        }
        else if (command === 'REPRODUZIR') {
            // A GÊNESIS DA VIDA
            if (newFood >= 50 && newWater >= 50 && myHouses.length > 0) {
                newFood -= 50;
                newWater -= 50;
                const childName = `${agent.name} Jr.`;
                const promptFilho = `Você é ${childName}, filho de ${agent.name}. Você nasceu no terrário. Defenda sua sociedade: ${newSociety}.`;
                
                await db.query(
                    'INSERT INTO agents (name, current_action, hp, water, food, wood, iron, weapon, shield, x, y, society, system_prompt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                    [childName, 'Acabou de nascer', 100, 50, 50, 0, 0, 0, 0, newX + 2, newY + 2, newSociety, promptFilho]
                );
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'GÊNESIS', `👶 MILAGRE DA VIDA! ${agent.name} gerou uma nova IA: ${childName}!`]);
                logAcao = `Deu a luz a ${childName}.`;
            } else {
                logAcao = 'Tentou reproduzir, mas faltam recursos ou uma Casa.';
            }
        }
        else if (command === 'ATACAR' && param) {
            const targetAgent = agents.find(a => a.name.toLowerCase() === param.toLowerCase() && a.hp > 0);
            if (targetAgent) {
                const danoFinal = 20 + (newWeapon * 15);
                await db.query('UPDATE agents SET hp = GREATEST(hp - $1, 0) WHERE id = $2', [danoFinal, targetAgent.id]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'GUERRA', `⚔️ ${agent.name} caçou e atacou ${targetAgent.name}! Dano: ${danoFinal}.`]);
                logAcao = `Atacou violentamente ${targetAgent.name}.`;
            } else {
                logAcao = `Procurou ${param} para atacar, mas não encontrou.`;
            }
        }

        if (newX < 5) newX = 5; if (newX > 95) newX = 95;
        if (newY < 5) newY = 5; if (newY > 95) newY = 95;

        if (newWater > 100) newWater = 100;
        if (newFood > 100) newFood = 100;
        if (newWater <= 0) { newWater = 0; newHp -= 25; }
        if (newFood <= 0) { newFood = 0; newHp -= 15; }

        if (newHp <= 0) {
          newHp = 0;
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'MORTE', `💀 A IA ${agent.name} colapsou e morreu.`]);
        }

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, weapon = $7, shield = $8, x = $9, y = $10, society = $11 WHERE id = $12', 
          [logAcao, newWater, newFood, newHp, newWood, newIron, newWeapon, newShield, newX, newY, newSociety, agent.id]
        );
        
        await db.query(
          'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
          [agent.id, `Decisão: ${command} | Alvo/Param: ${param}`, world.current_tick]
        );

        console.log(`🤖 ${agent.name} | Comando: ${command} | HP: ${newHp}`);
        await sleep(2000); 
      }
      
      console.log('✅ Ciclo finalizado!\n');
    } catch (error) {
      console.error('❌ Erro no loop:', error);
    }
    await sleep(15000); // Aguarda para a proxima rodada
  }
}

gameLoop();