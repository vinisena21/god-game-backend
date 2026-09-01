import { useState, useEffect } from 'react';

// Variável inteligente: se estiver na nuvem usa o link real, se estiver no PC usa o localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export default function App() {
  const [worldState, setWorldState] = useState({ current_tick: 0, weather: 'Carregando...' });
  const [agents, setAgents] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isChanging, setIsChanging] = useState(false);
  const [miracleText, setMiracleText] = useState<{ [key: number]: string }>({});

  const fetchData = async () => {
    try {
      const worldRes = await fetch(`${API_URL}/api/world`);
      if (worldRes.ok) setWorldState(await worldRes.json());

      const agentsRes = await fetch(`${API_URL}/api/agents`);
      if (agentsRes.ok) setAgents(await agentsRes.json());

      const eventsRes = await fetch(`${API_URL}/api/world/events`);
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    }
  };

  const changeWeather = async (newWeather: string) => {
    setIsChanging(true);
    setWorldState(prev => ({ ...prev, weather: `⏳ Invocando ${newWeather}...` }));
    try {
      await fetch(`${API_URL}/api/world/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: newWeather }),
      });
      fetchData();
    } finally {
      setIsChanging(false);
    }
  };

  const sendMiracle = async (agentId: number, name: string) => {
    const text = miracleText[agentId];
    if (!text) return;

    try {
      const response = await fetch(`${API_URL}/api/agents/${agentId}/miracle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (response.ok) {
        alert(`⚡ A Voz Divina ecoou na mente de ${name}!`);
        setMiracleText(prev => ({ ...prev, [agentId]: '' }));
        fetchData();
      }
    } catch (error) {
      console.error("Erro ao enviar milagre:", error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const btnStyle = { padding: '0.5rem 1rem', cursor: isChanging ? 'wait' : 'pointer', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', backgroundColor: '#0a0a0a', color: '#e5e5e5', minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, color: '#fff' }}>👁️ Painel do Criador</h1>
      </header>

      <section style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333', marginBottom: '2rem' }}>
        <h2>🌍 Controle Global</h2>
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
          <p><strong>Tick Atual:</strong> {worldState.current_tick}</p>
          <p><strong style={{ color: '#4ade80' }}>Clima:</strong> {worldState.weather}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button disabled={isChanging} onClick={() => changeWeather('Ensolarado')} style={btnStyle}>☀️ Sol</button>
          <button disabled={isChanging} onClick={() => changeWeather('Chuva Torrencial')} style={btnStyle}>🌧️ Chuva</button>
          <button disabled={isChanging} onClick={() => changeWeather('Nevasca Extrema')} style={btnStyle}>❄️ Neve</button>
          <button disabled={isChanging} onClick={() => changeWeather('Seca Mortal')} style={btnStyle}>🔥 Seca</button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {/* Coluna da Esquerda: Agentes */}
        <section style={{ flex: '3 1 600px' }}>
          <h2>🤖 Facções e Inventário</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333', opacity: agent.hp <= 0 ? 0.5 : 1 }}>
                <h3 style={{ marginTop: 0, color: '#4ade80', display: 'flex', justifyContent: 'space-between' }}>
                  {agent.name} {agent.hp <= 0 && '💀'}
                  <span style={{ fontSize: '1rem', color: agent.hp > 20 ? '#ef4444' : '#7f1d1d' }}>❤️ {agent.hp} HP</span>
                </h3>
                
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', backgroundColor: '#000', padding: '0.75rem', borderRadius: '6px', border: '1px solid #222' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>💧 Água: {agent.water}</span>
                  <span style={{ color: '#eab308', fontWeight: 'bold' }}>🍖 Comida: {agent.food}</span>
                </div>

                <p style={{ fontSize: '0.9rem' }}><strong>Ação:</strong> {agent.action}</p>
                <p style={{ fontSize: '0.9rem', color: '#aaa', minHeight: '40px' }}><strong>Memória:</strong> {agent.memory}</p>
                
                {agent.hp > 0 && (
                  <div style={{ display: 'flex', marginTop: '1rem', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Sussurrar na mente da IA..."
                      value={miracleText[agent.id] || ''}
                      onChange={(e) => setMiracleText(prev => ({ ...prev, [agent.id]: e.target.value }))}
                      style={{ flex: 1, padding: '0.5rem', backgroundColor: '#000', color: '#fff', border: '1px solid #555', borderRadius: '4px' }}
                    />
                    <button onClick={() => sendMiracle(agent.id, agent.name)} style={{ padding: '0.5rem', cursor: 'pointer', backgroundColor: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                      Falar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Coluna da Direita: Livro das Eras */}
        <section style={{ flex: '1 1 300px' }}>
          <h2>📜 Livro das Eras</h2>
          <div style={{ backgroundColor: '#1a1a1a', padding: '1rem', borderRadius: '8px', border: '1px solid #333', maxHeight: '600px', overflowY: 'auto' }}>
            {events.length === 0 ? <p style={{ color: '#aaa' }}>A história ainda não começou...</p> : null}
            {events.map(ev => (
              <div key={ev.id} style={{ borderBottom: '1px solid #333', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 'bold' }}>[Tick {ev.tick}] {ev.type}</span>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{ev.message}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}