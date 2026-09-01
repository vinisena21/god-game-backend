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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar o estado do mundo' });
  }
});

app.get('/api/world/events', async (req, res) => {
  try {
    const eventsRes = await db.query('SELECT * FROM world_events ORDER BY id DESC LIMIT 50');
    res.json(eventsRes.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

app.post('/api/world/weather', async (req, res) => {
  const { weather } = req.body;
  if (!weather) return res.status(400).json({ error: 'Clima não fornecido' });

  try {
    await db.query('UPDATE world_state SET weather = $1 WHERE id = 1', [weather]);
    const tickRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    await db.query(
      'INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)',
      [tickRes.rows[0].current_tick, 'CLIMA', `O Criador alterou o clima global para: ${weather}`]
    );
    res.json({ message: 'Clima alterado com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao alterar o clima' });
  }
});

// ⚡ NOVA ROTA: RESET DO UNIVERSO
app.post('/api/world/reset', async (req, res) => {
  try {
    await db.query("UPDATE world_state SET current_tick = 0, weather = 'Ensolarado' WHERE id = 1");
    await db.query('DELETE FROM world_events');
    await db.query('DELETE FROM agent_memories');
    await db.query(`
      UPDATE agents 
      SET hp = 100, water = 50, food = 50, 
          wood = 0, iron = 0, weapon = 0, shield = 0, 
          current_action = 'Acordando após o reset do universo'
    `);
    await db.query(
      "INSERT INTO world_events (tick, type, message) VALUES (0, 'BIG BANG', 'O Criador resetou o universo. Uma nova era começa agora.')"
    );
    res.json({ message: 'Mundo resetado com sucesso!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao resetar o mundo' });
  }
});

app.post('/api/agents/:id/miracle', async (req, res) => {
  const agentId = req.params.id;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem divina não fornecida' });

  try {
    const worldRes = await db.query('SELECT current_tick FROM world_state WHERE id = 1');
    const currentTick = worldRes.rows[0].current_tick;
    await db.query(
      'INSERT INTO agent_memories (agent_id, content, tick_created) VALUES ($1, $2, $3)',
      [agentId, `VOZ DIVINA: ${message}`, currentTick]
    );
    await db.query(
      'INSERT INTO world_events (tick, type, message) VALUES ($1, $2, $3)',
      [currentTick, 'MILAGRE', `O Criador sussurrou na mente do Agente #${agentId}`]
    );
    res.json({ message: 'Milagre enviado com sucesso!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao enviar intervenção divina' });
  }
});

app.get('/api/agents', async (req, res) => {
  try {
    const agentsRes = await db.query('SELECT id, name, current_action as action, hp, water, food, wood, iron, weapon, shield FROM agents ORDER BY id ASC');
    const agents = agentsRes.rows;
    for (let agent of agents) {
      const memRes = await db.query(
        'SELECT content as memory FROM agent_memories WHERE agent_id = $1 ORDER BY tick_created DESC LIMIT 1',
        [agent.id]
      );
      agent.memory = memRes.rows.length > 0 ? memRes.rows[0].memory : 'Nenhuma memória recente.';
    }
    res.json(agents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🚀 API do Painel Divino rodando na porta ${PORT}`);
});

import './loop';