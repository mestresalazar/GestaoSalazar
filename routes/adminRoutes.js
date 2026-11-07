const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/membros', async (req, res) => {
  try {
    const membros = await User.find({}, '-password'); 
    const membrosFormatados = membros.map(m => {
      const obj = m.toObject();
      const ultimoTurno = obj.historicoTurnos && obj.historicoTurnos.length > 0 
        ? obj.historicoTurnos[obj.historicoTurnos.length - 1] 
        : null;
      
      return {
        ...obj,
        ultimoPlantao: ultimoTurno ? `${ultimoTurno.duracao} (${new Date(ultimoTurno.data).toLocaleDateString()})` : 'Nenhum plantão registado'
      };
    });

    res.json({ success: true, membros: membrosFormatados });
  } catch (error) {
    console.error('Erro ao buscar membros:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar efetivo.' });
  }
});

router.get('/membro/historico/:nickname', async (req, res) => {
  try {
    const membro = await User.findOne({ nickname: req.params.nickname }, '-password');
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
        cargo: membro.cargo,
        status: membro.status,
        ultimoPlantao: ultimoTurno ? `Duração: ${ultimoTurno.duracao} em ${new Date(ultimoTurno.data).toLocaleDateString()}` : 'Nenhum plantão registado'
      },
      historicoTurnos: membro.historicoTurnos || [],
      historicoPromocoes: membro.historicoPromocoes || [],
      historicoSorteios: membro.historicoSorteios || [],
      caixaEntrada: membro.caixaEntrada || []
    });
  } catch (error) {
    console.error('Erro ao buscar histórico do membro:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar histórico.' });
  }
});

router.get('/ranking/turnos', async (req, res) => {
  try {
    const membros = await User.find({}, '-password');
    const rankingMap = {};

    membros.forEach(membro => {
      if (membro.historicoTurnos && membro.historicoTurnos.length > 0) {
        membro.historicoTurnos.forEach(turno => {
          const dataTurno = new Date(turno.data);
          const hora = dataTurno.getHours();

          if ((hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2)) {
            if (!rankingMap[membro.nickname]) {
              rankingMap[membro.nickname] = 0;
            }
            rankingMap[membro.nickname] += converterDuracaoParaSegundos(turno.duracao);
          }
        });
      }
    });

    const rankingArray = Object.keys(rankingMap).map(nickname => ({
      nickname,
      totalSegundos: rankingMap[nickname],
      totalFormatado: converterSegundosParaDuracao(rankingMap[nickname])
    })).sort((a, b) => b.totalSegundos - a.totalSegundos);

    res.json({ success: true, ranking: rankingArray.slice(0, 10) }); 
  } catch (error) {
    console.error('Erro ao calcular ranking de turnos:', error);
    res.status(500).json({ success: false, message: 'Erro ao calcular ranking.' });
  }
});

// Envio de Notificações de Ranking
router.post('/notificar/ranking', async (req, res) => {
  try {
    const membros = await User.find({});
    const rankingMap = {};

    membros.forEach(membro => {
      if (membro.historicoTurnos && membro.historicoTurnos.length > 0) {
        membro.historicoTurnos.forEach(turno => {
          const dataTurno = new Date(turno.data);
          const hora = dataTurno.getHours();
          if ((hora >= 17 && hora <= 23) || (hora >= 0 && hora < 2)) {
            if (!rankingMap[membro.nickname]) rankingMap[membro.nickname] = 0;
            rankingMap[membro.nickname] += converterDuracaoParaSegundos(turno.duracao);
          }
        });
      }
    });

    const rankingArray = Object.keys(rankingMap).map(nickname => ({
      nickname,
      totalSegundos: rankingMap[nickname],
      totalFormatado: converterSegundosParaDuracao(rankingMap[nickname])
    })).sort((a, b) => b.totalSegundos - a.totalSegundos);

    for (let i = 0; i < rankingArray.length; i++) {
      const item = rankingArray[i];
      const posicao = i + 1;
      const membroDoc = await User.findOne({ nickname: item.nickname });

      if (membroDoc) {
        if (!membroDoc.caixaEntrada) membroDoc.caixaEntrada = [];
        membroDoc.caixaEntrada.push({
          data: new Date(),
          titulo: `📊 Sua Classificação no Ranking de Horas`,
          mensagem: `Você está na ${posicao}ª posição do ranking com um total de ${item.totalFormatado} acumuladas no horário regulamentar!`,
          lida: false
        });
        await membroDoc.save({ validateBeforeSave: false });
      }
    }

    res.json({ success: true, message: 'Notificações de ranking enviadas com sucesso!' });
  } catch (error) {
    console.error('Erro ao notificar ranking:', error);
    res.status(500).json({ success: false, message: 'Erro ao enviar notificações de ranking.' });
  }
});

// Rota para Resetar o Ranking da Semana
router.put('/ranking/resetar', async (req, res) => {
  try {
    const membros = await User.find({});
    for (let membro of membros) {
      if (membro.historicoTurnos && membro.historicoTurnos.length > 0) {
        membro.historicoTurnos = [];
        
        if (!membro.caixaEntrada) membro.caixaEntrada = [];
        membro.caixaEntrada.push({
          data: new Date(),
          titulo: '🔄 Nova Semana Iniciada',
          mensagem: 'O ranking de horas foi resetado pela administração. Uma nova semana de plantões começou!',
          lida: false
        });

        await membro.save({ validateBeforeSave: false });
      }
    }
    res.json({ success: true, message: 'Ranking da semana resetado com sucesso para todos os operacionais!' });
  } catch (error) {
    console.error('Erro ao resetar ranking:', error);
    res.status(500).json({ success: false, message: 'Erro ao resetar o ranking no servidor.' });
  }
});

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

router.get('/sorteio/elegiveis', async (req, res) => {
  try {
    const membros = await User.find({}, '-password');
    const elegiveis = membros.filter(m => {
      if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
      const totalSegundos = m.historicoTurnos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
      return totalSegundos >= 7200; // Mínimo de 2 horas
    });

    const listaElegiveis = elegiveis.map(m => ({
      id: m._id,
      nickname: m.nickname,
      cargo: m.cargo || 'Soldado',
      totalTurnos: m.historicoTurnos.length
    }));

    res.json({ success: true, elegiveis: listaElegiveis });
  } catch (error) {
    console.error('Erro ao buscar elegíveis:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar membros elegíveis.' });
  }
});

router.post('/sorteio/realizar', async (req, res) => {
  try {
    const { qtdGanhadores, premios } = req.body;
    const todosMembros = await User.find({});
    
    const elegiveisIds = todosMembros
      .filter(m => {
        if (!m.historicoTurnos || m.historicoTurnos.length === 0) return false;
        const totalSegundos = m.historicoTurnos.reduce((acc, t) => acc + converterDuracaoParaSegundos(t.duracao), 0);
        return totalSegundos >= 7200;
      })
      .map(m => m._id);

    if (elegiveisIds.length === 0) {
      return res.json({ success: false, message: 'Não há membros elegíveis com pelo menos 2 horas de plantão cumpridas.' });
    }

    const embaralhados = [...elegiveisIds].sort(() => 0.5 - Math.random());
    const numPremiados = Math.min(parseInt(qtdGanhadores) || 1, embaralhados.length);
    
    const ganhadores = [];
    const listaPremios = premios ? premios.split(',').map(p => p.trim()) : ['Prêmio Especial'];

    for (let i = 0; i < numPremiados; i++) {
      const vencedorId = embaralhados[i];
      const premioAtribuido = listaPremios[i] || listaPremios[0];

      const vencedorDoc = await User.findById(vencedorId);
      if (vencedorDoc) {
        if (!vencedorDoc.historicoSorteios) vencedorDoc.historicoSorteios = [];
        vencedorDoc.historicoSorteios.push({
          data: new Date(),
          descricaoPremio: premioAtribuido,
          status: 'venceu'
        });

        if (!vencedorDoc.caixaEntrada) vencedorDoc.caixaEntrada = [];
        vencedorDoc.caixaEntrada.push({
          data: new Date(),
          titulo: '🏆 Vencedor do Sorteio Imediato',
          mensagem: `Você venceu o sorteio imediato e ganhou: ${premioAtribuido}!`,
          lida: false
        });

        await vencedorDoc.save({ validateBeforeSave: false });

        ganhadores.push({
          nickname: vencedorDoc.nickname,
          cargo: vencedorDoc.cargo || 'Soldado',
          premio: premioAtribuido
        });
      }
    }

    res.json({ success: true, ganhadores });
  } catch (error) {
    console.error('🔴 ERRO NO SORTEIO:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao realizar sorteio.' });
  }
});

router.put('/membro/:id', async (req, res) => {
  try {
    const { cargo, status, role } = req.body;
    const usuarioAntes = await User.findById(req.params.id);
    if (!usuarioAntes) {
      return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
    }

    const updateData = {};
    if (cargo !== undefined) updateData.cargo = cargo;
    if (status !== undefined) updateData.status = status;
    if (role !== undefined) updateData.role = role;

    let atualizado;
    if (cargo && cargo !== usuarioAntes.cargo) {
      if (!usuarioAntes.historicoPromocoes) usuarioAntes.historicoPromocoes = [];
      
      if (!usuarioAntes.caixaEntrada) usuarioAntes.caixaEntrada = [];
      usuarioAntes.caixaEntrada.push({
        data: new Date(),
        titulo: '⭐ Promoção de Cargo!',
        mensagem: `Parabéns! Você foi promovido para o cargo de ${cargo}.`,
        lida: false
      });

      atualizado = await User.findByIdAndUpdate(
        req.params.id,
        { 
          ...updateData, 
          caixaEntrada: usuarioAntes.caixaEntrada,
          $push: { historicoPromocoes: { data: new Date(), novoCargo: cargo } } 
        },
        { new: true }
      );
    } else {
      atualizado = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
    }

    res.json({ success: true, message: 'Membro atualizado com sucesso!', usuario: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar membro:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar membro.' });
  }
});

router.put('/membro/resetar-turnos/:id', async (req, res) => {
  try {
    const membro = await User.findById(req.params.id);
    if (!membro) {
      return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
    }
    membro.historicoTurnos = [];
    await membro.save();
    res.json({ success: true, message: 'Histórico de turnos e comprovantes resetados com sucesso!' });
  } catch (error) {
    console.error('Erro ao resetar turnos:', error);
    res.status(500).json({ success: false, message: 'Erro ao resetar histórico de turnos.' });
  }
});

router.delete('/membro/:id', async (req, res) => {
  try {
    const removido = await User.findByIdAndDelete(req.params.id);
    if (!removido) {
      return res.status(404).json({ success: false, message: 'Membro não encontrado para exclusão.' });
    }
    res.json({ success: true, message: 'Membro desligado/removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover membro:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover membro.' });
  }
});

module.exports = router;