import { db } from './db';
import { getAgentDecision } from './ai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function gameLoop() {
  console.log('🌍 Motor de Simulação RTS Iniciado...\n');

  while (true) {
    console.log('⏳ Analisando ecossistema e movendo a fauna...');
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

      // 🐺 INTELIGÊNCIA DOS ANIMAIS (Movem-se antes dos agentes)
      for (const ent of entities) {
          if (ent.type === 'Cervo') {
             // Cervo anda aleatoriamente
             let nx = ent.x + (Math.floor(Math.random() * 7) - 3);
             let ny = ent.y + (Math.floor(Math.random() * 7) - 3);
             await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [Math.max(5, Math.min(95, nx)), Math.max(5, Math.min(95, ny)), ent.id]);
          } else if (ent.type === 'Lobo') {
             // Lobo persegue o agente mais próximo
             let closestAgent = agents.sort((a, b) => (Math.abs(a.x - ent.x) + Math.abs(a.y - ent.y)) - (Math.abs(b.x - ent.x) + Math.abs(b.y - ent.y)))[0];
             if (closestAgent) {
                 let dist = Math.abs(closestAgent.x - ent.x) + Math.abs(closestAgent.y - ent.y);
                 if (dist < 5) {
                     await db.query('UPDATE agents SET hp = hp - 15 WHERE id = $1', [closestAgent.id]);
                     await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'NATUREZA', `🐺 Um Lobo atacou ${closestAgent.name}!`]);
                 } else {
                     let nx = ent.x + (closestAgent.x > ent.x ? 4 : -4);
                     let ny = ent.y + (closestAgent.y > ent.y ? 4 : -4);
                     await db.query('UPDATE world_entities SET x = $1, y = $2 WHERE id = $3', [nx, ny, ent.id]);
                 }
             }
          }
      }

      // 🧠 INTELIGÊNCIA DOS AGENTES
      for (const agent of agents) {
        let newX = agent.x; let newY = agent.y;
        
        // 🌫️ FOG OF WAR: A IA SÓ VÊ O QUE ESTÁ NUM RAIO DE 20 BLOCOS!
        const nearbyAgents = agents.filter(a => a.id !== agent.id && Math.abs(a.x - agent.x) <= 20 && Math.abs(a.y - agent.y) <= 20)
                                   .map(a => `[AGENTE ID:${a.id}] ${a.name} em X:${a.x},Y:${a.y}`).join(', ') || 'Nenhum';
        const nearbyEntities = entities.filter(e => Math.abs(e.x - agent.x) <= 20 && Math.abs(e.y - agent.y) <= 20)
                                       .map(e => `[${e.type.toUpperCase()} ID:${e.id}] em X:${e.x},Y:${e.y}`).join(', ') || 'Nada na visão';
        const nearbyStructures = structures.filter(s => Math.abs(s.x - agent.x) <= 20 && Math.abs(s.y - agent.y) <= 20)
                                       .map(s => `[${s.type} de ${s.agent_name}] em X:${s.x},Y:${s.y}`).join(', ') || 'Nenhuma';

        const promptComStatus = `${agent.system_prompt || 'Você é uma IA sobrevivente.'}\n\n⚠️ SEU STATUS: Vida: ${agent.hp} | Água: ${agent.water} | Comida: ${agent.food} | Mad: ${agent.wood} | Fer: ${agent.iron} | Armas: ${agent.weapon}\nSua Posição: [${newX}, ${newY}].\n\n🌫️ SEU CAMPO DE VISÃO (Raio 20):\nAgentes: ${nearbyAgents}\nRecursos/Fauna: ${nearbyEntities}\nEstruturas: ${nearbyStructures}\n\n🌊 GEOGRAFIA: Um Rio Intransponível corta o mapa verticalmente no Eixo X=50. Tentar cruzar o rio (X=50) sem ponte causa 20 de dano por afogamento.\n\n⚙️ COMANDOS ESPECÍFICOS (Escolha APENAS UM no final):\n- [MOVER_PARA: X, Y]\n- [EXTRAIR: ID] (ID de uma Árvore ou Jazida na visão para coletar recursos)\n- [CAÇAR: ID] (ID de Cervo, Lobo ou Agente na visão)\n- [CONSTRUIR_CASA] (30 Mad. Te protege)\n- [CONSTRUIR_PONTE] (15 Mad. Constrói sobre o rio em X=50 para cruzar seguro)\n- [REPRODUZIR] (Custa 50 Com/Agu, gera um herdeiro)`;

        const decision = await getAgentDecision(agent.name, promptComStatus, world.weather, 'Mundo hostil');
        
        let newWater = agent.water - 5; let newFood = agent.food - 5;
        let newWood = agent.wood || 0; let newIron = agent.iron || 0;
        let newHp = agent.hp; let newSociety = agent.society;

        const myHouses = structures.filter(s => s.agent_name === agent.name && s.type === 'Casa');
        const isHome = myHouses.some(h => Math.abs(h.x - newX) <= 5 && Math.abs(h.y - newY) <= 5);
        if (isHome) { newHp += 10; newWater += 5; newFood += 5; }

        if (world.weather === 'Seca Mortal' && !isHome) newWater -= 10;
        if (world.weather === 'Clima Instável' && !isHome && Math.random() > 0.7) newHp -= 20;

        const match = decision.acao.match(/\[(.*?)\]/);
        let command = "MOVER_PARA"; let param = "50,50";
        if (match) {
            const parts = match[1].split(':');
            command = parts[0].trim();
            if (parts.length > 1) param = parts[1].trim();
        }

        let logAcao = `Tentou: ${command}`;

        if (command === 'MOVER_PARA' && param) {
            const coords = param.split(',');
            const tX = parseInt(coords[0]); const tY = parseInt(coords[1]);
            if (!isNaN(tX) && !isNaN(tY)) {
                let oldX = newX;
                newX += Math.round(((tX - newX) / (Math.abs(tX - newX) || 1)) * Math.min(10, Math.abs(tX - newX)));
                newY += Math.round(((tY - newY) / (Math.abs(tY - newY) || 1)) * Math.min(10, Math.abs(tY - newY)));
                
                // 🌊 FÍSICA DO RIO
                if ((oldX < 50 && newX >= 50) || (oldX > 50 && newX <= 50) || newX === 50) {
                    const bridge = structures.find(s => s.type === 'Ponte' && s.x === 50 && Math.abs(s.y - newY) <= 8);
                    if (!bridge) {
                        newHp -= 20;
                        logAcao = `Cruzou o rio nadando e quase afogou (-20 HP). Chegou em [${newX}, ${newY}].`;
                    } else {
                        logAcao = `Cruzou o rio em segurança pela Ponte! Chegou em [${newX}, ${newY}].`;
                    }
                } else {
                    logAcao = `Caminhou para [${newX}, ${newY}].`;
                }
            }
        } 
        else if (command === 'EXTRAIR' && param) {
            const targetId = parseInt(param);
            const alvo = entities.find(e => e.id === targetId);
            if (alvo && Math.abs(alvo.x - newX) <= 15) {
                if (alvo.type === 'Árvore Anciã') { newWood += alvo.resource_amount; logAcao = 'Derrubou uma árvore colossal!'; }
                if (alvo.type === 'Jazida de Ouro') { newIron += alvo.resource_amount; logAcao = 'Minerou ouro/ferro brilhante!'; }
                await db.query('DELETE FROM world_entities WHERE id = $1', [targetId]);
            } else logAcao = 'Tentou extrair algo fora de alcance ou inexistente.';
        }
        else if (command === 'CAÇAR' && param) {
            const targetId = parseInt(param);
            const mob = entities.find(e => e.id === targetId);
            if (mob && Math.abs(mob.x - newX) <= 15) {
                if (mob.type === 'Cervo') { newFood += mob.resource_amount; logAcao = 'Caçou um Cervo com sucesso!'; }
                if (mob.type === 'Lobo') { logAcao = 'Matou um Lobo feroz em defesa!'; }
                await db.query('DELETE FROM world_entities WHERE id = $1', [targetId]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'CAÇA', `🏹 ${agent.name} abateu um ${mob.type}!`]);
            }
        }
        else if (command === 'CONSTRUIR_CASA') {
            if (newWood >= 30) {
                newWood -= 30;
                await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 150)', [agent.name, 'Casa', newX, newY]);
                logAcao = 'Ergueu uma Casa.';
            }
        }
        else if (command === 'CONSTRUIR_PONTE') {
            if (newWood >= 15) {
                newWood -= 15;
                await db.query('INSERT INTO world_structures (agent_name, type, x, y, hp) VALUES ($1, $2, $3, $4, 300)', [agent.name, 'Ponte', 50, newY]);
                await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'ENGENHARIA', `🌉 ${agent.name} construiu uma Ponte sobre o Rio!`]);
                logAcao = 'Construiu uma ponte majestosa.';
            }
        }

        if (newX < 5) newX = 5; if (newX > 95) newX = 95;
        if (newY < 5) newY = 5; if (newY > 95) newY = 95;

        if (newHp <= 0) {
          newHp = 0;
          await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [world.current_tick, 'MORTE', `💀 ${agent.name} colapsou na natureza.`]);
        }

        await db.query(
          'UPDATE agents SET current_action = $1, water = $2, food = $3, hp = $4, wood = $5, iron = $6, x = $7, y = $8 WHERE id = $9', 
          [logAcao, Math.max(0, Math.min(100, newWater)), Math.max(0, Math.min(100, newFood)), newHp, newWood, newIron, newX, newY, agent.id]
        );
        console.log(`🤖 ${agent.name} executou: ${logAcao}`);
        await sleep(2000); 
      }
      console.log('✅ Ciclo finalizado!\n');
    } catch (error) { console.error('❌ Erro:', error); }
    await sleep(15000); 
  }
}

gameLoop();