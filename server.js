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

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/ponto', require('./routes/pontoRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

function converterDuracaoParaSegundos(duracaoStr) {
  if (!duracaoStr) return 0;
  const partes = duracaoStr.split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0]) * 3600) + (parseInt(partes[1]) * 60) + parseInt(partes[2]);
}

// Rota para agendar sorteio salvando no MongoDB
app.post('/api/admin/sorteio/agendar', async (req, res) => {
  try {
    const { dataAlvo, horarioAlvo, qtdGanhadores, premios } = req.body;
    
    await ConfigSorteio.findOneAndUpdate(
      { chave: 'sorteio_ativo' },
      {
        dataAlvo,
        horarioAlvo,
        qtdGanhadores: parseInt(qtdGanhadores) || 1,
        premios: premios || 'Prêmio Especial',
        executado: false
      },
      { upsert: true, new: true }
    );

    console.log(`[SORTEIO AUTOMÁTICO] Salvo na BD e agendado para ${dataAlvo} às ${horarioAlvo}`);
    res.json({ success: true, message: 'Sorteio agendado e salvo com sucesso na base de dados!' });
  } catch (err) {
    console.error('Erro ao agendar sorteio:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar agendamento.' });
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

// Verificador automático do sorteio automático (Exige mínimo de 2 horas / 7200 segundos)
setInterval(async () => {
  try {
    const config = await ConfigSorteio.findOne({ chave: 'sorteio_ativo' });
    if (!config || config.executado) return;

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const dataAtualStr = `${ano}-${mes}-${dia}`;

    const horaAtual = agora.getHours();
    const minAtual = agora.getMinutes();
    const totalMinutosAtuais = (horaAtual * 60) + minAtual;

    const [hAlvo, mAlvo] = config.horarioAlvo.split(':').map(Number);
    const totalMinutosAlvo = (hAlvo * 60) + mAlvo;

    if (dataAtualStr === config.dataAlvo && totalMinutosAtuais >= totalMinutosAlvo) {
      console.log('[SORTEIO AUTOMÁTICO] Horário atingido! A executar sorteio automático...');
      
      config.executado = true;
      await config.save();

      const todosMembros = await User.find({});
      const elegiveis = todosMembros.filter(m => {
        if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
        const totalSegundos = m.historicoTurnos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
        return totalSegundos >= 7200;
      });

      if (elegiveis.length > 0) {
        const embaralhados = [...elegiveis].sort(() => 0.5 - Math.random());
        const numPremiados = Math.min(config.qtdGanhadores, embaralhados.length);
        const listaPremios = config.premios.split(',').map(p => p.trim());

        for (let i = 0; i < numPremiados; i++) {
          const vencedor = embaralhados[i];
          const premioAtribuido = listaPremios[i] || listaPremios[0];

          if (!vencedor.historicoSorteios) vencedor.historicoSorteios = [];
          vencedor.historicoSorteios.push({
            data: new Date(),
            descricaoPremio: premioAtribuido,
            status: 'venceu'
          });

          if (!vencedor.caixaEntrada) vencedor.caixaEntrada = [];
          vencedor.caixaEntrada.push({
            data: new Date(),
            titulo: '🏆 Vencedor do Sorteio Diário',
            mensagem: `Você foi contemplado no sorteio oficial automático e ganhou: ${premioAtribuido}!`,
            lida: false
          });

          await vencedor.save({ validateBeforeSave: false });

          io.to('sala_geral_salazar').emit('receber_mensagem', {
            nickname: 'SORTEIO OFICIAL',
            cargo: 'Comando',
            mensagem: `🏆 O operacional ${vencedor.nickname} (${vencedor.cargo || 'Soldado'}) venceu o sorteio automático e levou: ${premioAtribuido}!`
          });
        }
      }
    }
  } catch (err) {
    console.error('Erro no loop do sorteio automático:', err);
  }
}, 15000);

app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, fotoComprovante } = req.body;
        const user = await User.findOne({ nickname });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        user.historicoTurnos.push({
            data: new Date(),
            duracao: duracao,
            fotoComprovante: fotoComprovante || 'Sem foto'
        });

        await user.save();
        res.json({ success: true, message: 'Turno registado com sucesso no histórico!' });
    } catch (error) {
        console.error('Erro ao guardar turno:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

app.get('/api/membro/historico/:nickname', async (req, res) => {
    try {
        const user = await User.findOne({ nickname: req.params.nickname });
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        res.json({
            success: true,
            historicoTurnos: user.historicoTurnos || [],
            historicoPromocoes: user.historicoPromocoes || [],
            historicoSorteios: user.historicoSorteios || [],
            caixaEntrada: user.caixaEntrada || []
        });
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

const usuariosOnline = {}; 

io.on('connection', (socket) => {
  socket.on('entrar_sala', (data) => {
    let salaId, nickname, cargo;

    if (typeof data === 'string') {
      salaId = data;
      nickname = 'Operacional';
      cargo = 'Soldado';
    } else {
      salaId = data.salaId;
      nickname = data.nickname || 'Operacional';
      cargo = data.cargo || 'Soldado';
    }

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});