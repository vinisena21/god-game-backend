import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db';

dotenv.config();

const app = express();
app.use(cors()); 
app.use(express.json());

app.get('/api/world', async (req, res) => {
  try {
    const worldRes = await db.query('SELECT * FROM world_state WHERE id = 1');
    res.json(worldRes.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar o mundo' }); }
});

app.get('/api/world/events', async (req, res) => {
  try {
    const eventsRes = await db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50');
    res.json(eventsRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar eventos' }); }
});

app.get('/api/world/structures', async (req, res) => {
  try {
    const structRes = await db.query('SELECT * FROM world_structures');
    res.json(structRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar estruturas' }); }
});

// ⚡ NOVA ROTA: Busca a fauna e flora física
app.get('/api/world/entities', async (req, res) => {
  try {
    const entRes = await db.query('SELECT * FROM world_entities WHERE hp > 0');
    res.json(entRes.rows);
  } catch (error) { res.status(500).json({ error: 'Erro ao buscar entidades' }); }
});

app.post('/api/world/weather', async (req, res) => {
  const { weather } = req.body;
  try {
    await db.query('UPDATE world_state SET weather = $1 WHERE id = 1', [weather]);
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query('INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)', [tickRes.rows[0].current_tick, 'CLIMA', `O clima mudou para: ${weather}`]);
    res.json({ message: 'Clima alterado' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

// ⚡ BIG BANG: GERADOR DE ECOSISTEMA
app.post('/api/world/reset', async (req, res) => {
  try {
    await db.query("UPDATE world_state SET current_tick = 0, weather = 'Ensolarado' WHERE id = 1");
    await db.query('DELETE FROM world_events');
    await db.query('DELETE FROM agent_memories');
    await db.query('DELETE FROM world_structures');
    await db.query("DELETE FROM agents WHERE name LIKE '%Jr.%'"); 
    
    // Semeando o Ecossistema
    await db.query('DELETE FROM world_entities');
    const entitiesToInsert = [];
    // 8 Árvores na Floresta (X < 50, Y < 50)
    for(let i=0; i<8; i++) entitiesToInsert.push(`('Árvore Anciã', floor(random() * 40) + 5, floor(random() * 40) + 5, 100, 50)`);
    // 4 Jazidas nas Montanhas (X > 50, Y < 50)
    for(let i=0; i<4; i++) entitiesToInsert.push(`('Jazida de Ouro', floor(random() * 40) + 55, floor(random() * 40) + 5, 200, 100)`);
    // 6 Cervos e 4 Lobos espalhados
    for(let i=0; i<6; i++) entitiesToInsert.push(`('Cervo', floor(random() * 80) + 10, floor(random() * 80) + 10, 30, 40)`);
    for(let i=0; i<4; i++) entitiesToInsert.push(`('Lobo', floor(random() * 80) + 10, floor(random() * 80) + 10, 60, 0)`);
    
    await db.query(`INSERT INTO world_entities (type, x, y, hp, resource_amount) VALUES ${entitiesToInsert.join(',')}`);

    await db.query(`
      UPDATE agents SET hp = 100, water = 50, food = 50, wood = 0, iron = 0, weapon = 0, shield = 0, 
      x = floor(random() * 80) + 10, y = floor(random() * 80) + 10, society = 'Nenhuma', current_action = 'Acordando'
    `);
    
    await db.query("INSERT INTO world_events (tick, type, message) VALUES (0, 'BIG BANG', 'O mapa foi recriado com Fauna, Rios e Recursos físicos.')");
    res.json({ message: 'Mundo resetado!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.post('/api/agents/:id/miracle', async (req, res) => {
  const agentId = req.params.id;
  const { message } = req.body;
  try {
    const worldRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query('INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)', [agentId, `VOZ DIVINA: ${message}`, worldRes.rows[0].current_tick]);
    res.json({ message: 'Milagre enviado!' });
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

app.get('/api/agents', async (req, res) => {
  try {
    const agentsRes = await db.query('SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield, x, y, society FROM agents ORDER BY id ASC');
    const agents = agentsRes.rows;
    for (let agent of agents) {
      const memRes = await db.query('SELECT content as memory FROM agent_memories WHERE agent_id = $1 ORDER BY tick_created DESC LIMIT 1', [agent.id]);
      agent.memory = memRes.rows.length > 0 ? memRes.rows[0].memory : 'Vazio.';
    }
    res.json(agents);
  } catch (error) { res.status(500).json({ error: 'Erro' }); }
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`🚀 API rodando na porta ${PORT}`));

import './loop';