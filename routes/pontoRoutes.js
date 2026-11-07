const express = require('express');
const router = express.Router();
const BatePonto = require('../models/BatePonto');
const verificarAuth = require('../middleware/auth');

// Rota para bater o ponto (Membro logado)
router.post('/bater', verificarAuth, async (req, res) => {
  try {
    const { etapa } = req.body; // 1, 2 ou 3

    if (![1, 2, 3].includes(etapa)) {
      return res.status(400).json({ success: false, message: 'Etapa de bate-ponto inválida. Escolha entre 1, 2 ou 3.' });
    }

    // Pega a data atual no formato AAAA-MM-DD
    const hoje = new Date().toISOString().split('T')[0];

    // Verifica se já bateu o ponto nesta etapa hoje
    const pontoExistente = await BatePonto.findOne({ usuario: req.user._id, data: hoje, etapa });
    if (pontoExistente) {
      return res.status(400).json({ success: false, message: `Você já registrou presença na Etapa ${etapa} hoje.` });
    }

    // Cria o registo de ponto
    const novoPonto = new BatePonto({
      usuario: req.user._id,
      nickname: req.user.nickname,
      data: hoje,
      etapa,
      status: 'presente'
    });

    await novoPonto.save();

    res.status(201).json({ 
      success: true, 
      message: `Ponto da Etapa ${etapa} registrado com sucesso!` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

// Rota para listar os pontos do dia (Acessível à corporação)
router.get('/diario', verificarAuth, async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const pontos = await BatePonto.find({ data: hoje }).populate('usuario', 'nickname cargo patamarFidelidade');

    res.json({ success: true, data: pontos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

module.exports = router;