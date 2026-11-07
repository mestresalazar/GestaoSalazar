const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Rota de Registro (Cadastrar novo membro na corporação)
router.post('/register', async (req, res) => {
  try {
    const { nickname, password } = req.body;

    // Verifica se o nickname já existe
    const usuarioExistente = await User.findOne({ nickname });
    if (usuarioExistente) {
      return res.status(400).json({ success: false, message: 'Este Nickname já está cadastrado no sistema.' });
    }

    // Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Cria o novo usuário (por padrão como Privado e pendente de aprovação)
    const novoUsuario = new User({
      nickname,
      password: hashedPassword,
      cargo: 'Privado',
      status: 'pendente'
    });

    await novoUsuario.save();

    res.status(201).json({ 
      success: true, 
      message: 'Cadastro realizado com sucesso! Aguarde a aprovação do Alto Comando.' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

// Rota de Login por Nickname
router.post('/login', async (req, res) => {
  try {
    const { nickname, password } = req.body;

    // Busca o usuário pelo Nickname
    const user = await User.findOne({ nickname });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Nickname ou senha incorretos.' });
    }

    // Trava de segurança: Impede login de demitidos ou inativos
    if (user.status === 'inativo' || user.status === 'demitido') {
      return res.status(403).json({ success: false, message: 'Sua conta está inativa ou você foi desligado da corporação.' });
    }

    if (user.status === 'pendente') {
      return res.status(403).json({ success: false, message: 'Sua conta ainda está pendente de aprovação pelo comando.' });
    }

    // Valida a senha
    const senhaCorreta = await bcrypt.compare(password, user.password);
    if (!senhaCorreta) {
      return res.status(400).json({ success: false, message: 'Nickname ou senha incorretos.' });
    }

    // Gera o Token JWT
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
        patamarFidelidade: user.patamarFidelidade
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
  }
});

module.exports = router;