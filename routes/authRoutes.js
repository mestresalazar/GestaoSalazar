const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Rota de Registro
router.post('/register', async (req, res) => {
  try {
    const { nickname } = req.body;
    const password = req.body.password || req.body.senha;

    if (!nickname || !password) {
      return res.status(400).json({ success: false, message: 'Preencha o nickname e a senha.' });
    }

    const usuarioExistente = await User.findOne({ nickname });
    if (usuarioExistente) {
      return res.status(400).json({ success: false, message: 'Este Nickname já está cadastrado no sistema.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const novoUsuario = new User({
      nickname,
      password: hashedPassword,
      cargo: 'Privado',
      status: 'pendente'
    });

    await novoUsuario.save();
    res.status(201).json({ success: true, message: 'Cadastro realizado com sucesso!' });
  } catch (error) {
    console.error('ERRO NO REGISTER:', error);
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

// Rota de Login
router.post('/login', async (req, res) => {
  try {
    const { nickname } = req.body;
    const password = req.body.password || req.body.senha;

    console.log('Tentativa de login para:', nickname);

    const user = await User.findOne({ nickname });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Nickname ou senha incorretos.' });
    }

    console.log('Usuário encontrado no banco:', user.nickname, '| Status:', user.status);

    let senhaCorreta = false;
    try {
      senhaCorreta = await bcrypt.compare(password, user.password);
    } catch (e) {
      senhaCorreta = (password === user.password);
    }

    if (!senhaCorreta) {
      return res.status(400).json({ success: false, message: 'Nickname ou senha incorretos.' });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET não está definido no arquivo .env!');
    }

    const token = jwt.sign(
      { id: user._id, nickname: user.nickname, cargo: user.cargo, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      token,
      user: {
        nickname: user.nickname,
        cargo: user.cargo,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ ERRO CRÍTICO NO LOGIN (DETALHADO):', error);
    res.status(500).json({ success: false, message: 'Erro interno: ' + error.message });
  }
});

// Rota para registar e salvar o turno do membro (Alimenta o Ranking)
router.post('/membro/turno', async (req, res) => {
  try {
    const { nickname, duracao, fotoComprovante } = req.body;

    if (!nickname || !duracao) {
      return res.status(400).json({ success: false, message: 'Dados do turno incompletos.' });
    }

    const membro = await User.findOne({ nickname });
    if (!membro) {
      return res.status(404).json({ success: false, message: 'Membro não encontrado.' });
    }

    if (!membro.historicoTurnos) {
      membro.historicoTurnos = [];
    }

    membro.historicoTurnos.push({
      data: new Date(),
      duracao: duracao,
      fotoComprovante: fotoComprovante || 'Anexo local'
    });

    await membro.save();

    res.json({ success: true, message: 'Turno registado com sucesso no histórico!' });
  } catch (error) {
    console.error('ERRO AO SALVAR TURNO:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar turno: ' + error.message });
  }
});

module.exports = router;