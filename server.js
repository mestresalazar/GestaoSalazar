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

function turnoEstaNoHorarioPermitido(dataTurno) {
    const d = new Date(dataTurno);
    const hora = d.getHours();
    return (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2);
}

function turnoEhDeHoje(dataTurno) {
    const d = new Date(dataTurno);
    const hoje = new Date();
    return d.getDate() === hoje.getDate() &&
           d.getMonth() === hoje.getMonth() &&
           d.getFullYear() === hoje.getFullYear();
}

// --- AUTENTICAÇÃO (LOGIN COM VALIDAÇÃO DE PENDENTE) ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        const user = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') }).lean();
        
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.password && user.password !== passFinal) {
            return res.status(400).json({ success: false, message: 'Senha incorreta.' });
        }

        // BLOQUEIO DE CONTAS PENDENTES
        if (user.status === 'pendente') {
            return res.status(403).json({ success: false, message: 'A sua conta aguarda aprovação do Comando para ter acesso ao site.' });
        }

        res.json({ success: true, message: 'Login bem-sucedido', user: { nickname: user.nickname, cargo: user.cargo, role: user.role, status: user.status } });
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

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') });
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
        res.json({ success: true, message: 'Conta registada com sucesso! Aguarde aprovação.' });
    } catch (error) {
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

// --- HISTÓRICO DO MEMBRO (Admin) ---
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
                ultimoPlantao: ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão'
            },
            historicoTurnos: membro.historicoTurnos || [],
            historicoPromocoes: membro.historicoPromocoes || [],
            historicoSorteios: membro.historicoSorteios || [],
            caixaEntrada: membro.caixaEntrada || []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// --- EFETIVO E PAINEL ADM ---
app.get('/api/admin/membros', async (req, res) => {
  try {
    const membros = await User.find({}, '-password -historicoTurnos.fotoComprovante').lean(); 
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
        const membros = await User.find({}, '-password -historicoTurnos.fotoComprovante').lean();
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

        io.emit('atualizar_status_geral_tropa');
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
        io.emit('atualizar_status_geral_tropa');
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
        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: 'Membro demitido/removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao remover membro.' });
    }
});

// --- RANKINGS ---
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
            mensagem: 'O comando resetou o ranking de horas da tropa para iniciar a nova semana.',
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notif } });
        io.emit('atualizar_status_geral_tropa');

        res.json({ success: true, message: 'Ranking semanal resetado com sucesso!' });
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

// --- ROTA EXCLUSIVA DO MESTRE: ADICIONAR TEMPO MANUALMENTE ---
app.post('/api/admin/mestre/adicionar-tempo', async (req, res) => {
    try {
        const { adminNickname, targetNickname, horas, minutos, segundos, motivo } = req.body;

        if (!adminNickname || adminNickname.toLowerCase().trim() !== 'mestre') {
            return res.status(403).json({ success: false, message: 'Acesso negado. Apenas a conta Mestre pode injetar tempo manualmente.' });
        }

        if (!targetNickname) {
            return res.status(400).json({ success: false, message: 'Nickname do membro alvo é obrigatório.' });
        }

        const h = parseInt(horas) || 0;
        const m = parseInt(minutos) || 0;
        const s = parseInt(segundos) || 0;
        const totalSegundos = (h * 3600) + (m * 60) + s;

        if (totalSegundos <= 0) {
            return res.status(400).json({ success: false, message: 'O tempo a adicionar deve ser superior a zero.' });
        }

        const duracaoFormatada = converterSegundosParaDuracao(totalSegundos);

        const novoTurnoManual = {
            data: new Date(),
            duracao: duracaoFormatada,
            fotoComprovante: motivo ? `Injeção Manual por Mestre: ${motivo}` : 'Injeção Manual por Mestre'
        };

        const notif = {
            titulo: '⏱️ Tempo Adicionado Manualmente',
            mensagem: `O Comando (Mestre) adicionou manualmente ${duracaoFormatada} ao teu histórico de turnos. Motivo: ${motivo || 'Ajuste operacional'}.`,
            data: new Date()
        };

        const resultado = await User.findOneAndUpdate(
            { nickname: new RegExp('^' + targetNickname.trim() + '$', 'i') },
            { 
                $push: { 
                    historicoTurnos: novoTurnoManual,
                    caixaEntrada: notif
                } 
            },
            { new: true }
        );

        if (!resultado) {
            return res.status(404).json({ success: false, message: 'Membro alvo não encontrado na base de dados.' });
        }

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: `Adicionado com sucesso ${duracaoFormatada} para o operacional ${resultado.nickname}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno ao adicionar tempo.' });
    }
});

// --- ROTA DE STATUS DE PLANTÃO ---
app.put('/api/membro/status-plantao', async (req, res) => {
    try {
        const { nickname, emPlantao } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        await User.updateOne(
            { nickname: new RegExp('^' + nickname + '$', 'i') },
            { $set: { emPlantao: !!emPlantao } }
        );

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: 'Status de plantão atualizado!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar status.' });
    }
});

// --- ROTA DE REGISTAR/FINALIZAR TURNO (BLINDADA CONTRA BUGS DE TEMPO) ---
app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, fotoComprovante } = req.body;
        if (!nickname) {
            return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });
        }

        // Validação estrita do formato do tempo para evitar estouros ou valores anômalos
        if (!duracao || typeof duracao !== 'string' || !duracao.match(/^\d{2}:\d{2}:\d{2}$/)) {
            return res.status(400).json({ success: false, message: 'Duração de turno inválida.' });
        }

        const novoTurno = {
            data: new Date(),
            duracao: duracao,
            fotoComprovante: fotoComprovante || 'Sem foto'
        };

        const resultado = await User.updateOne(
            { nickname: new RegExp('^' + nickname + '$', 'i') },
            { 
                $push: { historicoTurnos: novoTurno },
                $set: { emPlantao: false }
            }
        );

        if (resultado.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
        }

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: 'Turno registado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao guardar turno.' });
    }
});

// --- SORTEIOS E AGENDAMENTO ---
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
      const turnosDeHojeValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data) && turnoEhDeHoje(t.data));
      const totalSegundosHoje = turnosDeHojeValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundosHoje >= 7200;
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
        const horaLocal = new Date(agora.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
        const horaAtualStr = String(horaLocal.getHours()).padStart(2, '0') + ':' + String(horaLocal.getMinutes()).padStart(2, '0');
        
        if (horaAtualStr === config.horarioAlvo) {
            const membros = await User.find({}, '-password').lean();
            const elegiveis = membros.filter(m => {
              if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
              const turnosDeHojeValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data) && turnoEhDeHoje(t.data));
              const totalSegundosHoje = turnosDeHojeValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
              return totalSegundosHoje >= 7200;
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
                      mensagem: `🏆 O operacional ${escolhido.nickname} (${escolhido.cargo || 'Soldado'}) cumpriu 2h+ HOJE e ganhou o sorteio: ${premioSorteado}!`,
                      hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                  });
                }
            } else {
                io.to('sala_geral_salazar').emit('receber_mensagem', {
                    nickname: 'SORTEIO OFICIAL',
                    cargo: 'Comando',
                    mensagem: `⚠️ O horário do sorteio agendado (${config.horarioAlvo}) chegou, mas nenhum operacional acumulou 2h de plantão HOJE.`,
                    hora: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }

            config.executado = true;
            await config.save();
        }
    } catch (e) {
        console.error(e);
    }
}

setInterval(executarSorteioAutomatico, 10000);

app.post('/api/admin/sorteio/realizar', async (req, res) => {
  try {
    const { qtdGanhadores, premios } = req.body;
    const membros = await User.find({}, '-password').lean();
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      const turnosDeHojeValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data) && turnoEhDeHoje(t.data));
      const totalSegundosHoje = turnosDeHojeValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundosHoje >= 7200;
    });

    if (elegiveis.length === 0) {
      return res.json({ success: false, message: 'Não há operacionais elegíveis com 2h+ cumpridas HOJE para realizar o sorteio.' });
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
    atualizarEstadoOperacional(salaId);
  });

  socket.on('chat_mensagem', (data) => {
    io.to(data.salaId).emit('receber_mensagem', data);
  });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      const salaId = user.salaId;
      delete usuariosOnline[socket.id];
      atualizarEstadoOperacional(salaId);
    }
  });
});

function atualizarEstadoOperacional(salaId) {
  const conexõesNaSala = Object.values(usuariosOnline).filter(u => u.salaId === salaId);
  const unicosMap = {};
  conexõesNaSala.forEach(u => { unicosMap[u.nickname] = u; });
  const listaFormatada = Object.values(unicosMap);

  io.to(salaId).emit('atualizar_usuarios_online', listaFormatada);
  io.emit('atualizar_status_adm', listaFormatada);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});