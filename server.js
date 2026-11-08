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
    methods: ["GET", "POST", "PUT", "DELETE"]
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

// Horário regulamentar estrito para o ranking (17:00 às 02:00)
function turnoEstaNoHorarioPermitido(dataTurno) {
    const d = new Date(dataTurno);
    const hora = d.getHours();
    return (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2);
}

// --- AUTENTICAÇÃO (LOGIN) ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        const user = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }).lean();
        
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.password && user.password !== passFinal) {
            return res.status(400).json({ success: false, message: 'Senha incorreta.' });
        }

        res.json({ success: true, message: 'Login bem-sucedido', user: { nickname: user.nickname, cargo: user.cargo, role: user.role, status: user.status } });
    } catch (e) {
        console.error('Erro no login:', e);
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// --- AUTENTICAÇÃO (REGISTO BLINDADO) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;

        if (!nickname || !passFinal) {
            return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });
        }

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') });
        if (userExiste) {
            return res.status(400).json({ success: false, message: 'Este nickname já está registado.' });
        }

        // Criação segura ignorando restrições rígidas de schema antigo
        const novoUtilizador = new User({
            nickname: nickname.trim(),
            password: passFinal,
            cargo: 'Soldado',
            status: 'pendente',
            role: 'membro',
            historicoTurnos: [],
            historicoPromocoes: [],
            historicoSorteios: [],
            caixaEntrada: []
        });

        await novoUtilizador.save();
        res.json({ success: true, message: 'Conta registada com sucesso!' });
    } catch (error) {
        console.error('Erro crítico no registo:', error);
        res.status(500).json({ success: false, message: 'Erro ao registar conta na base de dados.' });
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
                status: membro.status || 'Ativo'
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

// --- GESTÃO DE MEMBROS ---
app.put('/api/admin/membro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cargo } = req.body;
        const updateData = {};
        if (status) updateData.status = status;
        if (cargo) updateData.cargo = cargo;

        const membro = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        
        if (cargo) {
            await User.findByIdAndUpdate(id, {
                $push: { historicoPromocoes: { novoCargo: cargo, data: new Date() } }
            });
        }

        res.json({ success: true, message: 'Membro atualizado com sucesso!', membro });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar membro.' });
    }
});

app.put('/api/admin/membro/resetar-turnos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const membro = await User.findByIdAndUpdate(id, { $set: { historicoTurnos: [] } }, { new: true });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        res.json({ success: true, message: 'Turnos resetados com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao resetar turnos.' });
    }
});

app.delete('/api/admin/membro/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const membro = await User.findByIdAndDelete(id);
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        res.json({ success: true, message: 'Membro demitido/removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover membro.' });
    }
});

// --- RANKINGS (Oculta quem tem 0 horas) ---
app.get('/api/ranking', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo historicoTurnos').lean();
        const ranking = membros.map(m => {
            const turnosValidos = (m.historicoTurnos || []).filter(t => turnoEstaNoHorarioPermitido(t.data));
            const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Soldado',
                totalHorasSegundos: totalSegundos,
                totalHorasFormatado: converterSegundosParaDuracao(totalSegundos)
            };
        }).filter(m => m.totalHorasSegundos > 0).sort((a, b) => b.totalHorasSegundos - a.totalHorasSegundos);

        res.json({ success: true, ranking });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking.' });
    }
});

app.get('/api/admin/ranking/turnos', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo historicoTurnos').lean();
        const ranking = membros.map(m => {
            const turnosValidos = (m.historicoTurnos || []).filter(t => turnoEstaNoHorarioPermitido(t.data));
            const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
            return {
                nickname: m.nickname,
                cargo: m.cargo || 'Soldado',
                totalSegundos: totalSegundos,
                totalFormatado: converterSegundosParaDuracao(totalSegundos)
            };
        }).filter(m => m.totalSegundos > 0).sort((a, b) => b.totalSegundos - a.totalSegundos);

        res.json({ success: true, ranking: ranking.slice(0, 10) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao carregar ranking de turnos.' });
    }
});

app.put('/api/admin/ranking/resetar', async (req, res) => {
    try {
        await User.updateMany({}, { $set: { historicoTurnos: [] } });

        const notif = {
            titulo: '🔄 Ranking Semanal Resetado',
            mensagem: 'O comando resetou o ranking de horas da tropa para iniciar a nova semana. A contagem de horas foi reiniciada.',
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notif } });

        res.json({ success: true, message: 'Ranking semanal resetado com sucesso e tropa notificada!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar ranking.' });
    }
});

app.post('/api/admin/notificar/ranking', async (req, res) => {
    try {
        const notif = {
            titulo: '📊 Posição do Ranking',
            mensagem: 'O comando atualizou as notificações relativas ao ranking semanal de horas (17h às 02h).',
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notif } });
        res.json({ success: true, message: 'Notificações enviadas!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao enviar notificações.' });
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

// --- SORTEIOS E AGENDAMENTO AUTOMÁTICO (Com fuso horário ajustado para o Brasil) ---
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
      const turnosValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data));
      const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
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

async function executarSorteioAutomatico() {
    try {
        const config = await ConfigSorteio.findOne({ chave: 'sorteio_ativo' });
        if (!config || config.executado) return;

        const agora = new Date();
        // Converte estritamente para o fuso horário do Brasil para bater certo com a hora local
        const horaLocal = new Date(agora.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
        const horaAtualStr = String(horaLocal.getHours()).padStart(2, '0') + ':' + String(horaLocal.getMinutes()).padStart(2, '0');
        
        if (horaAtualStr === config.horarioAlvo) {
            const membros = await User.find({}, '-password').lean();
            const elegiveis = membros.filter(m => {
              if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
              const turnosValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data));
              const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
              return totalSegundos >= 7200;
            });

            if (elegiveis.length > 0) {
                const premiosLista = config.premios ? config.premios.split(',').map(p => p.trim()) : ['Prêmio Especial'];
                
                for (let i = 0; i < Math.min(config.qtdGanhadores || 1, elegiveis.length); i++) {
                  const randomIndex = Math.floor(Math.random() * elegiveis.length);
                  const escolhido = elegiveis.splice(randomIndex, 1)[0];
                  const premioSorteado = premiosLista[i % premiosLista.length];

                  await User.findByIdAndUpdate(escolhido._id, {
                    $push: { historicoSorteios: { descricaoPremio: premioSorteado, status: 'Contemplado', data: new Date() } }
                  });

                  io.to('sala_geral_salazar').emit('receber_mensagem', {
                      nickname: 'SORTEIO OFICIAL',
                      cargo: 'Comando',
                      mensagem: `🏆 O operacional ${escolhido.nickname} (${escolhido.cargo || 'Soldado'}) foi contemplado no sorteio agendado e ganhou: ${premioSorteado}!`,
                      hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                  });
                }
            } else {
                io.to('sala_geral_salazar').emit('receber_mensagem', {
                    nickname: 'SORTEIO OFICIAL',
                    cargo: 'Comando',
                    mensagem: `⚠️ O horário do sorteio agendado (${config.horarioAlvo}) foi atingido, mas não há nenhum operacional elegível com 2h+ de plantão no horário regulamentar (17h-02h).`,
                    hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }

            config.executado = true;
            await config.save();
        }
    } catch (e) {
        console.error('Erro no agendamento automático do sorteio:', e);
    }
}

setInterval(executarSorteioAutomatico, 10000);

app.post('/api/admin/sorteio/realizar', async (req, res) => {
  try {
    const { qtdGanhadores, premios } = req.body;
    const membros = await User.find({}, '-password').lean();
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      const turnosValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data));
      const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundos >= 7200;
    });

    if (elegiveis.length === 0) {
      return res.json({ success: false, message: 'Não há operacionais elegíveis com 2h+ no horário permitido (17h-02h) para realizar o sorteio.' });
    }

    const premiosLista = premios ? premios.split(',').map(p => p.trim()) : ['Prêmio Especial'];
    const ganhadores = [];

    for (let i = 0; i < Math.min(parseInt(qtdGanhadores) || 1, elegiveis.length); i++) {
      const randomIndex = Math.floor(Math.random() * elegiveis.length);
      const escolhido = elegiveis.splice(randomIndex, 1)[0];
      const premioSorteado = premiosLista[i % premiosLista.length];

      ganhadores.push({
        nickname: escolhido.nickname,
        cargo: escolhido.cargo || 'Soldado',
        premio: premioSorteado
      });

      await User.findByIdAndUpdate(escolhido._id, {
        $push: { historicoSorteios: { descricaoPremio: premioSorteado, status: 'Contemplado', data: new Date() } }
      });
    }

    res.json({ success: true, ganhadores });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erro ao realizar sorteio.' });
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