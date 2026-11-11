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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

function converterDuracaoParaSegundos(duracaoStr) {
  if (!duracaoStr) return 0;
  const partes = duracaoStr.split(':');
  if (partes.length !== 3) return 0;
  return (parseInt(partes[0]) * 3600) + (parseInt(partes[1]) * 60) + parseInt(partes[2]);
}

function converterSegundosParaDuracao(segundosTotais) {
  const segundosSeguros = Math.max(0, parseInt(segundosTotais) || 0);
  const horas = String(Math.floor(segundosSeguros / 3600)).padStart(2, '0');
  const minutos = String(Math.floor((segundosSeguros % 3600) / 60)).padStart(2, '0');
  const segundos = String(segundosSeguros % 60).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

// --- VALIDAÇÃO DE HORÁRIO RIGOROSA EM UTC-3 (BRASÍLIA) ---
function turnoEstaNoHorarioPermitido(dataTurno) {
    if (!dataTurno) return false;
    const d = new Date(dataTurno);
    const horaStr = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: 'numeric', hour12: false });
    const hora = parseInt(horaStr, 10);
    return (hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2);
}

function turnoEhDeHoje(dataTurno) {
    if (!dataTurno) return false;
    const d = new Date(dataTurno);
    const hoje = new Date();
    const dStr = d.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" });
    const hojeStr = hoje.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" });
    return dStr === hojeStr;
}

app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha os campos.' });
        
        const user = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') }).select('-historicoTurnos.fotoComprovante').lean();
        if (!user) return res.status(400).json({ success: false, message: 'Utilizador não encontrado.' });
        if (user.password && user.password !== passFinal) {
            return res.status(400).json({ success: false, message: 'Senha incorreta.' });
        }
        if (user.status === 'pendente') {
            return res.status(403).json({ success: false, message: 'A sua conta aguarda aprovação do Comando para ter acesso ao site.' });
        }

        res.json({ success: true, message: 'Login bem-sucedido', user: { nickname: user.nickname, cargo: user.cargo, role: user.role, status: user.status } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, senha, password } = req.body;
        const passFinal = senha || password;
        if (!nickname || !passFinal) return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });

        const userExiste = await User.findOne({ nickname: new RegExp('^' + nickname.trim() + '$', 'i') });
        if (userExiste) return res.status(400).json({ success: false, message: 'Este nickname já está registado.' });

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

app.get('/api/membro/historico/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }, '-password -historicoTurnos.fotoComprovante').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 
            ? membro.historicoTurnos[membro.historicoTurnos.length - 1] 
            : null;

        res.json({
            success: true,
            membro: {
                nickname: membro.nickname,
                cargo: membro.cargo || 'Soldado',
                status: membro.status || 'Ativo',
                emPlantao: !!membro.emPlantao,
                estadoTurno: membro.estadoTurno || 'parado',
                inicioPlantao: membro.inicioPlantao || null,
                segundosAcumulados: membro.segundosAcumulados || 0,
                fotoComprovanteAtiva: membro.fotoComprovanteAtiva || '',
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

app.get('/api/admin/membro/historico/:nickname', async (req, res) => {
    try {
        const nickname = req.params.nickname;
        let query = { nickname: new RegExp('^' + decodeURIComponent(nickname) + '$', 'i') };
        if (nickname.match(/^[0-9a-fA-F]{24}$/)) {
            query = { $or: [{ nickname: new RegExp('^' + nickname + '$', 'i') }, { _id: nickname }] };
        }

        let membro = await User.findOne(query, '-password -historicoTurnos.fotoComprovante').lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        const ultimoTurno = membro.historicoTurnos && membro.historicoTurnos.length > 0 ? membro.historicoTurnos[membro.historicoTurnos.length - 1] : null;

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

// --- ROTA OTIMIZADA: EXCLUI FOTOS PESADAS PARA A LISTAGEM VOAR ---
app.get('/api/admin/membros', async (req, res) => {
  try {
    const membros = await User.find({}, 'nickname cargo status emPlantao historicoTurnos.duracao historicoTurnos.data').lean(); 
    const membrosFormatados = membros.map(m => {
      const totalSegundosAcumulados = (m.historicoTurnos || []).reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      const totalHorasFormatado = converterSegundosParaDuracao(totalSegundosAcumulados);
      
      const ultimoTurno = m.historicoTurnos && m.historicoTurnos.length > 0 ? m.historicoTurnos[m.historicoTurnos.length - 1] : null;
      return {
        _id: m._id,
        nickname: m.nickname,
        cargo: m.cargo || 'Soldado',
        status: m.status || 'ativo',
        emPlantao: !!m.emPlantao,
        ultimoPlantao: totalSegundosAcumulados > 0 
          ? `Total: ${totalHorasFormatado} (${m.historicoTurnos.length} turnos)` 
          : (ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão registado')
      };
    });
    res.json({ success: true, membros: membrosFormatados });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
  }
});

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
            await User.updateOne({ _id: id }, { $push: { historicoPromocoes: { novoCargo: cargo, data: new Date() } } });
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

app.get('/api/admin/ranking/turnos', async (req, res) => {
    try {
        const membros = await User.find({}, 'nickname cargo historicoTurnos.duracao historicoTurnos.data').lean();
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
            return res.status(400).json({ success: false, message: 'O tempo a adicionar deve ser superior a 0.' });
        }

        const duracaoFormatada = converterSegundosParaDuracao(totalSegundos);
        const dataInjecao = new Date();
        dataInjecao.setHours(18, 0, 0, 0);

        const novoTurnoManual = {
            data: dataInjecao,
            duracao: duracaoFormatada,
            fotoComprovante: motivo ? `Injeção Manual por Mestre: ${motivo}` : 'Injeção Manual por Mestre'
        };

        const notif = {
            titulo: '⏱️ Tempo Adicionado Manualmente',
            mensagem: `O Comando (Mestre) adicionou ${duracaoFormatada} ao teu histórico. Motivo: ${motivo || 'Ajuste operacional'}.`,
            data: new Date()
        };

        const resultado = await User.updateOne(
            { nickname: new RegExp('^' + targetNickname.trim() + '$', 'i') },
            { $push: { historicoTurnos: novoTurnoManual, caixaEntrada: notif } }
        );

        if (resultado.matchedCount === 0) return res.status(404).json({ success: false, message: 'Membro alvo não encontrado na base de dados.' });

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: `Adicionado com sucesso ${duracaoFormatada} para o alvo! Computado no ranking e sorteio.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno ao adicionar tempo: ' + error.message });
    }
});

app.put('/api/membro/status-plantao', async (req, res) => {
    try {
        const { nickname, emPlantao, estadoTurno, inicioPlantao, segundosAcumulados, fotoComprovanteAtiva } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname obrigatório.' });

        const updateData = {
            emPlantao: !!emPlantao,
            estadoTurno: estadoTurno || 'parado'
        };

        if (inicioPlantao !== undefined) updateData.inicioPlantao = inicioPlantao ? new Date(inicioPlantao) : null;
        if (segundosAcumulados !== undefined) updateData.segundosAcumulados = segundosAcumulados;
        if (fotoComprovanteAtiva !== undefined) updateData.fotoComprovanteAtiva = fotoComprovanteAtiva;

        await User.updateOne({ nickname: new RegExp('^' + nickname + '$', 'i') }, { $set: updateData });

        io.emit('atualizar_estado_turno_usuario', { nickname: nickname.toLowerCase() });
        io.emit('atualizar_status_geral_tropa');

        res.json({ success: true, message: 'Estado do turno sincronizado com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao atualizar status na conta.' });
    }
});

app.post('/api/membro/turno', async (req, res) => {
    try {
        const { nickname, duracao, fotoComprovante } = req.body;
        if (!nickname) return res.status(400).json({ success: false, message: 'Nickname não fornecido.' });

        if (!duracao || typeof duracao !== 'string' || !duracao.match(/^\d{2}:\d{2}:\d{2}$/)) {
            return res.status(400).json({ success: false, message: 'Duração de turno inválida.' });
        }

        const segundosEnviados = converterDuracaoParaSegundos(duracao);
        if (segundosEnviados < 5) return res.status(400).json({ success: false, message: 'Turno muito curto para ser registado.' });

        const novoTurno = {
            data: new Date(),
            duracao: duracao,
            fotoComprovante: fotoComprovante || 'Sem foto'
        };

        const resultado = await User.updateOne(
            { nickname: new RegExp('^' + nickname + '$', 'i') },
            { 
                $push: { historicoTurnos: novoTurno }, 
                $set: { 
                    emPlantao: false, 
                    estadoTurno: 'parado',
                    inicioPlantao: null,
                    segundosAcumulados: 0,
                    fotoComprovanteAtiva: ''
                } 
            }
        );

        if (resultado.matchedCount === 0) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        io.emit('atualizar_estado_turno_usuario', { nickname: nickname.toLowerCase() });
        io.emit('atualizar_status_geral_tropa');

        res.json({ success: true, message: 'Turno validado e registado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao guardar turno.' });
    }
});

app.get('/api/membro/provas/status/:nickname', async (req, res) => {
    try {
        const membro = await User.findOne({ nickname: new RegExp('^' + req.params.nickname + '$', 'i') }).lean();
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        if (membro.cooldownProvaAte) {
            const dataCooldown = new Date(membro.cooldownProvaAte);
            const agora = new Date();
            if (agora < dataCooldown) {
                const horasRestantes = Math.ceil((dataCooldown - agora) / (1000 * 60 * 60));
                return res.json({
                    success: true,
                    bloqueadoByCooldown: true,
                    horasRestantes,
                    message: `Estás em cooldown devido a uma reprovação recente. Podes tentar novamente em cerca de ${horasRestantes} hora(s).`
                });
            }
        }

        const turnosValidos = (membro.historicoTurnos || []).filter(t => turnoEstaNoHorarioPermitido(t.data));
        const totalSegundos = turnosValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
        const totalHoras = totalSegundos / 3600;

        const cargoAtual = membro.cargo || 'Soldado';
        let provaDisponivelPara = null;
        let horasNecessarias = 0;

        if (cargoAtual === 'Soldado' || cargoAtual === 'Privado') {
            horasNecessarias = 10;
            if (totalHoras >= 10) provaDisponivelPara = 'Sargento';
        } else if (cargoAtual === 'Sargento') {
            horasNecessarias = 25;
            if (totalHoras >= 25) provaDisponivelPara = 'Tenente';
        } else if (cargoAtual === 'Tenente') {
            horasNecessarias = 50;
            if (totalHoras >= 50) provaDisponivelPara = 'Major';
        }

        const horasFaltando = Math.max(0, (horasNecessarias - totalHoras).toFixed(1));

        res.json({
            success: true,
            bloqueadoPorCooldown: false,
            totalHoras: totalHoras.toFixed(1),
            cargoAtual,
            provaDisponivelPara,
            horasFaltando
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao verificar status de provas.' });
    }
});

app.post('/api/membro/provas/submeter', async (req, res) => {
    try {
        const { nickname, cargoAlvo, respostas } = req.body;
        
        const membro = await User.findOne({ nickname: new RegExp('^' + nickname + '$', 'i') });
        if (!membro) return res.status(404).json({ success: false, message: 'Membro não encontrado.' });

        if (membro.cooldownProvaAte) {
            const dataCooldown = new Date(membro.cooldownProvaAte);
            if (new Date() < dataCooldown) {
                return res.status(400).json({ success: false, message: 'Tentativa bloqueada. Estás no período de cooldown de 24 horas.' });
            }
        }

        let gabarito = {};
        if (cargoAlvo === 'Sargento') {
            gabarito = { q1: 'a', q2: 'b', q3: 'b' };
        } else if (cargoAlvo === 'Tenente') {
            gabarito = { q1: 'a', q2: 'b', q3: 'b' };
        } else if (cargoAlvo === 'Major') {
            gabarito = { q1: 'a', q2: 'a', q3: 'c' };
        }

        let acertos = 0;
        let totalPerguntas = Object.keys(gabarito).length;

        if (respostas && respostas.q1 === gabarito.q1) acertos++;
        if (respostas && respostas.q2 === gabarito.q2) acertos++;
        if (respostas && respostas.q3 === gabarito.q3) acertos++;

        const aprovado = (acertos / totalPerguntas) >= 0.7;

        if (aprovado) {
            await User.updateOne(
                { _id: membro._id },
                { 
                    $set: { cargo: cargoAlvo, cooldownProvaAte: null },
                    $push: { 
                        historicoPromocoes: { novoCargo: cargoAlvo, data: new Date() },
                        caixaEntrada: {
                            titulo: '🎉 Aprovado na Prova!',
                            mensagem: `Parabéns! Foste aprovado na prova do Exército Brasileiro e promovido para <b>${cargoAlvo}</b>!`,
                            data: new Date()
                        }
                    }
                }
            );

            io.emit('atualizar_status_geral_tropa');
            res.json({ success: true, aprovado: true, message: `Parabéns! Passaste na prova com ${acertos}/${totalPerguntas} acertos e foste promovido a ${cargoAlvo}!` });
        } else {
            const dataCooldown = new Date();
            dataCooldown.setHours(dataCooldown.getHours() + 24);

            await User.updateOne(
                { _id: membro._id },
                { 
                    $set: { cooldownProvaAte: dataCooldown },
                    $push: { 
                        caixaEntrada: {
                            titulo: '❌ Reprovado na Prova (Cooldown 24h)',
                            mensagem: `Obtiviste ${acertos}/${totalPerguntas} acertos na prova para ${cargoAlvo}. Estás em cooldown de 24 horas.`,
                            data: new Date()
                        }
                    }
                }
            );

            res.json({ success: true, aprovado: false, message: `Infelizmente obtiviste ${acertos}/${totalPerguntas} acertos. Foste reprovado e terás um cooldown de 24 horas para tentar novamente.` });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro interno ao processar prova.' });
    }
});

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
    const agora = new Date();
    const membros = await User.find({}, 'nickname cargo sorteioExcluidoAte historicoTurnos.duracao historicoTurnos.data').lean();
    
    const elegiveis = membros.filter(m => {
      if (m.sorteioExcluidoAte) {
        const dataExclusao = new Date(m.sorteioExcluidoAte);
        if (dataExclusao.getDate() === agora.getDate() &&
            dataExclusao.getMonth() === agora.getMonth() &&
            dataExclusao.getFullYear() === agora.getFullYear()) {
          return false;
        }
      }

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
    
    await User.updateMany({}, { $set: { sorteioExcluidoAte: null } });

    await ConfigSorteio.findOneAndUpdate(
      { chave: 'sorteio_ativo' },
      { dataAlvo, horarioAlvo, qtdGanhadores: parseInt(qtdGanhadores) || 1, premios: premios || 'Prêmio Especial', executado: false },
      { upsert: true, new: true }
    );

    const notifSorteio = {
      titulo: '🎁 Novo Sorteio Agendado!',
      mensagem: `O Comando agendou um novo sorteio para hoje às <b>${horarioAlvo}</b>.<br><b>Prémios:</b> ${premios || 'Prêmio Especial'}<br>Cumpre pelo menos 2h de plantão HOJE para participar automaticamente!`,
      data: new Date()
    };

    await User.updateMany({}, { $push: { caixaEntrada: notifSorteio } });

    res.json({ success: true, message: 'Sorteio agendado com sucesso e notificação enviada à tropa!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao salvar agendamento e notificar.' });
  }
});

app.put('/api/admin/sorteio/resetar-elegiveis', async (req, res) => {
    try {
        const membros = await User.find({}, 'historicoTurnos.duracao historicoTurnos.data').lean();
        const idsParaExcluir = [];
        const agora = new Date();

        membros.forEach(m => {
            if (m.historicoTurnos && m.historicoTurnos.length > 0) {
                const turnosDeHojeValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data) && turnoEhDeHoje(t.data));
                const totalSegundosHoje = turnosDeHojeValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
                if (totalSegundosHoje >= 7200) {
                    idsParaExcluir.push(m._id);
                }
            }
        });

        await User.updateMany(
            { _id: { $in: idsParaExcluir } },
            { $set: { sorteioExcluidoAte: agora } }
        );

        await ConfigSorteio.findOneAndUpdate(
            { chave: 'sorteio_ativo' },
            { $set: { executado: false } },
            { upsert: true, new: true }
        );

        const notif = {
            titulo: '🔄 Ciclo de Sorteio Reiniciado',
            mensagem: 'O Comando reiniciou a lista de elegíveis deste ciclo. As horas do ranking semanal continuam 100% preservadas.',
            data: new Date()
        };
        await User.updateMany({}, { $push: { caixaEntrada: notif } });

        io.emit('atualizar_status_geral_tropa');
        res.json({ success: true, message: 'Elegíveis deste ciclo removidos com sucesso!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Erro ao resetar elegíveis do sorteio.' });
    }
});

app.post('/api/admin/sorteio/realizar', async (req, res) => {
  try {
    const { qtdGanhadores, premios } = req.body;
    const membros = await User.find({}, 'nickname cargo sorteioExcluidoAte historicoTurnos.duracao historicoTurnos.data').lean();
    const agora = new Date();
    
    const elegiveis = membros.filter(m => {
      if (m.sorteioExcluidoAte) {
        const dataExclusao = new Date(m.sorteioExcluidoAte);
        if (dataExclusao.getDate() === agora.getDate() &&
            dataExclusao.getMonth() === agora.getMonth() &&
            dataExclusao.getFullYear() === agora.getFullYear()) {
          return false;
        }
      }
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      const turnosDeHojeValidos = m.historicoTurnos.filter(t => turnoEstaNoHorarioPermitido(t.data) && turnoEhDeHoje(t.data));
      const totalSegundosHoje = turnosDeHojeValidos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundosHoje >= 7200;
    });

    if (elegiveis.length === 0) {
      return res.json({ success: false, message: 'Não há operacionais elegíveis disponíveis para este sorteio.' });
    }

    const premiosLista = premios ? premios.split(',').map(p => p.trim()) : ['Prêmio Especial'];
    const ganhadores = [];

    for (let i = 0; i < Math.min(parseInt(qtdGanhadores) || 1, elegiveis.length); i++) {
      const randomIndex = Math.floor(Math.random() * elegiveis.length);
      const escolhido = elegiveis.splice(randomIndex, 1)[0];
      const premioSorteado = premiosLista[i % premiosLista.length];
      ganhadores.push({ nickname: escolhido.nickname, cargo: escolhido.cargo || 'Privado', premio: premioSorteado });
      await User.updateOne({ _id: escolhido._id }, { $push: { historicoSorteios: { descricaoPremio: premioSorteado, status: 'venceu', data: new Date() } } });
    }

    res.json({ success: true, ganhadores });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erro ao realizar sorteio.' });
  }
});

const usuariosOnline = {}; 
io.on('connection', (socket) => {
  socket.on('entrar_sala', (data) => {
    let salaId = typeof data === 'string' ? data : (data.salaId || 'sala_geral_salazar');
    let nickname = typeof data === 'string' ? 'Operacional' : (data.nickname || 'Operacional');
    let cargo = typeof data === 'string' ? 'Privado' : (data.cargo || 'Privado');

    socket.join(salaId);
    usuariosOnline[socket.id] = { nickname, cargo, salaId };
    atualizarEstadoOperacional(salaId);
  });

  socket.on('chat_mensagem', (data) => { io.to(data.salaId).emit('receber_mensagem', data); });

  socket.on('disconnect', () => {
    const user = usuariosOnline[socket.id];
    if (user) {
      delete usuariosOnline[socket.id];
      atualizarEstadoOperacional(user.salaId);
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