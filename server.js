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

function converterDuracaoParaSegundos(duracaoStr) {
  if (!duracaoStr) return 0;
  const partes = duracaoStr.split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0]) * 3600) + (parseInt(partes[1]) * 60) + parseInt(partes[2]);
}

function converterSegundosParaDuracao(segundosTotais) {
  const horas = String(Math.floor(segundosTotais / 3600)).padStart(2, '0');
  const minutos = String(Math.floor((segundosTotais % 3600) / 60)).padStart(2, '0');
  const segundos = String(segundosTotais % 60).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

// --- AUTENTICAÇÃO (LOGIN) ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const user = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }).lean();
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        res.json({ success: true, message: 'Login bem-sucedido', user: { nickname: user.nickname, cargo: user.cargo, role: user.role } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// --- AUTENTICAÇÃO (REGISTO) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;

        if (!nickname || !passFinal) {
            return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });
        }

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') });
        if (userExiste) {
            return res.status(400).json({ success: false, message: 'Este nickname já está registado.' });
        }

        const novoUtilizador = new User({
            nickname: nickname.trim(),
            password: passFinal,
            cargo: 'Soldado',
            status: 'pendente'
        });

        await novoUtilizador.save();
        res.json({ success: true, message: 'Conta registada com sucesso!' });
    } catch (error) {
        console.error('Erro no registo:', error);
        res.status(500).json({ success: false, message: 'Erro ao registar conta.' });
    }
});

// --- HISTÓRICO DO MEMBRO (Dashboard) ---
app.get('/api/membro/historico/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }, '-password').lean();
        if (!membro) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 
            ? membro.historicoTurnos[membro.historicoTurnos.length - 1] 
            : null;

        res.json({
            success: true,
            membro: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Soldado',
                status: membro.status || 'Ativo',
                ultimoPlantao: ultimoTurno ? `Duração: ${ultimoTurno.duracao} em ${new Date(ultimoTurno.data).toLocaleDateString()}` : 'Nenhum plantão registado'
            },
            historicoTurnos: membro.historicoTurnos || [],
            historicoPromocoes: membro.historicoPromocoes || [],
            historicoSorteios: membro.historicoSorteios || [],
            caixaEntrada: membro.caixaEntrada || []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar histórico.' });
    }
});

// --- HISTÓRICO DO MEMBRO (Painel Admin) ---
app.get('/api/admin/membro/historico/:nickname', async (req, res) => {
    try {
        const nickname = req.params.nickname;
        let query = { nickname: new RegExp('^' + decodeURIComponent(nickname) + '$', 'i') };
        
        if (nickname.match(/^[0-9a-fA-F]{24}$/)) {
            query = { $or: [{ nickname: new RegExp('^' + nickname + '$', 'i') }, { _id: nickname }] };
        }

        let membro = await User.findOne(query, '-password').lean();
        if (!membro) {
            membro = await User.findOne({}, '-password').lean();
        }

        if (!membro) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 
            ? membro.historicoTurnos[membro.historicoTurnos.length - 1] 
            : null;

        res.json({
            success: true,
            membro: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Soldado',
                status: membro.status || 'Ativo',
                ultimoPlantao: ultimoTurno ? `Duração: ${ultimoTurno.duracao} em ${new Date(ultimoTurno.data).toLocaleDateString()}` : 'Nenhum plantão registado'
            },
            historicoTurnos: membro.historicoTurnos || [],
            historicoPromocoes: membro.historicoPromocoes || [],
            historicoSorteios: membro.historicoSorteios || [],
            caixaEntrada: membro.caixaEntrada || []
        });
    } catch (error) {
        console.error('Erro ao carregar histórico admin:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// --- EFETIVO E PAINEL ADM ---
app.get('/api/admin/membros', async (req, res) => {
  try {
    const membros = await User.find({}, '-password').lean(); 
    const membrosFormatados = membros.map(m => {
      const ultimoTurno = m.historicoTurnos && m.historicoTurnos.length > 0 
        ? m.historicoTurnos[m.historicoTurnos.length - 1] 
        : null;
      
      return {
        ...m,
        ultimoPlantao: ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão registado'
      };
    });
    res.json({ success: true, membros: membrosFormatados });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
  }
});

app.get('/api/admin/efetivo', async (req, res) => {
    try {
        const membros = await User.find({}, '-password').lean();
        res.json({ success: true, efetivo: membros });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
    }
});

// --- RANKINGS ---
app.get('/api/ranking', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo historicoTurnos').lean();
        const ranking = membros.map(m => {
            const totalSegundos = (m.historicoTurnos || []).reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Soldado',
                totalHorasSegundos: totalSegundos,
                totalHorasFormatado: converterSegundosParaDuracao(totalSegundos)
            };
        }).sort((a, b) => b.totalHorasSegundos - a.totalHorasSegundos);

        res.json({ success: true, ranking });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking.' });
    }
});

app.get('/api/admin/ranking/turnos', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo historicoTurnos').lean();
        const ranking = membros.map(m => {
            const totalSegundos = (m.historicoTurnos || []).reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Soldado',
                totalSegundos: totalSegundos,
                totalFormatado: converterSegundosParaDuracao(totalSegundos)
            };
        }).sort((a, b) => b.totalSegundos - a.totalSegundos);

        res.json({ success: true, ranking: ranking.slice(0, 10) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking de turnos.' });
    }
});

// --- TURNOS ---
app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, fotoComprovante } = req.body;
        if (!nickname) {
            return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });
        }

        const novoTurno = {
            data: new Date(),
            duracao: duracao || '00:00:00',
            fotoComprovante: fotoComprovante || 'Sem foto'
        };

        const resultado = await User.updateOne(
            { nickname: new RegExp('^' + nickname + '$', 'i') },
            { $push: { historicoTurnos: novoTurno } }
        );

        if (resultado.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        res.json({ success: true, message: 'Turno registado com sucesso!' });
    } catch (error) {
        console.error('Erro ao guardar turno:', error);
        res.status(500).json({ success: false, message: 'Erro ao guardar turno.' });
    }
});

// --- SORTEIOS ---
app.get('/api/admin/sorteio/status', async (req, res) => {
  try {
    const config = await ConfigSorteio.findOne({ chave: 'sorteio_ativo' }).lean();
    res.json({ success: true, agendamento: config });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar status.' });
  }
});

app.get('/api/admin/sorteio/elegiveis', async (req, res) => {
  try {
    const membros = await User.find({}, '-password').lean();
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