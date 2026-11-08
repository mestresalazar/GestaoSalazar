const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const conectarDB = require('./config/db');
const User = require('./models/User');
const ConfigSorteio = require('./models/ConfigSorteio');

dotenv.config();
conectarDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

// Rotas Oficiais Existentes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/ponto', require('./routes/pontoRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

function converterDuracaoParaSegundos(duracaoStr) {
  if (!duracaoStr) return 0;
  const partes = duracaoStr.split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0]) * 3600) + (parseInt(partes[1]) * 60) + parseInt(partes[2]);
}

// --- ROTAS DE SEGURANÇA E SORTEIOS EM FALTA (Evitam o erro 404 e o travamento) ---
app.get('/api/admin/efetivo', async (req, res) => {
    try {
        const membros = await User.find({}, '-password');
        res.json({ success: true, efetivo: membros });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
    }
});

app.get('/api/ranking', async (req, res) => {
    try {
        const membros = await User.find({}, '-password');
        const ranking = membros.map(m => {
            const totalSegundos = (m.historicoTurnos || []).reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Soldado',
                totalHorasSegundos: totalSegundos,
                totalHorasFormatado: `${Math.floor(totalSegundos / 3600)}h ${Math.floor((totalSegundos % 3600) / 60)}m`
            };
        }).sort((a, b) => b.totalHorasSegundos - a.totalHorasSegundos);
        res.json({ success: true, ranking });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking.' });
    }
});

app.get('/api/admin/sorteio/status', async (req, res) => {
  try {
    const config = await ConfigSorteio.findOne({ chave: 'sorteio_ativo' });
    res.json({ success: true, agendamento: config });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar status.' });
  }
});

app.get('/api/admin/sorteio/elegiveis', async (req, res) => {
  try {
    const membros = await User.find({}, '-password');
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      const totalSegundos = m.historicoTurnos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundos >= 7200;
    });
    const listaElegiveis = elegiveis.map(m => ({
      id: m._id,
      nickname: m.nickname,
      cargo: m.cargo || 'Soldado',
      totalTurnos: m.historicoTurnos.length
    }));
    res.json({ success: true, elegiveis: listaElegiveis });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar elegíveis.' });
  }
});

app.post('/api/admin/sorteio/agendar', async (req, res) => {
  try {
    const { dataAlvo, horarioAlvo, qtdGanhadores, premios } = req.body;
    await ConfigSorteio.findOneAndUpdate(
      { chave: 'sorteio_ativo' },
      { dataAlvo, horarioAlvo, qtdGanhadores: parseInt(qtdGanhadores) || 1, premios: premios || 'Prêmio Especial', executado: false },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Sorteio agendado com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao salvar agendamento.' });
  }
});
// --------------------------------------------------------------------------

// --- WEBSOCKETS ---
const usuariosOnline = {}; 
io.on('connection', (socket) => {
  socket.on('entrar_sala', (data) => {
    let salaId = typeof data === 'string' ? data : (data.salaId || 'sala_geral_salazar');
    let nickname = typeof data === 'string' ? 'Operacional' : (data.nickname || 'Operacional');
    let cargo = typeof data === 'string' ? 'Soldado' : (data.cargo || 'Soldado');

    socket.join(salaId);
    usuariosOnline[socket.id] = { nickname, cargo, salaId };
    atualizarListaOnline(salaId);
  });

  socket.on('chat_mensagem', (data) => {
    io.to(data.salaId).emit('receber_mensagem', data);
  });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      const salaId = user.salaId;
      delete usuariosOnline[socket.id];
      atualizarListaOnline(salaId);
    }
  });
});

function atualizarListaOnline(salaId) {
  const conexõesNaSala = Object.values(usuariosOnline).filter(u => u.salaId === salaId);
  const unicosMap = {};
  conexõesNaSala.forEach(u => { unicosMap[u.nickname] = u; });
  io.to(salaId).emit('atualizar_usuarios_online', Object.values(unicosMap));
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});