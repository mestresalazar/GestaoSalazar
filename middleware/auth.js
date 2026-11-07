const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verificarAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Acesso negado. Token não fornecido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    // Trava de segurança: Bloqueia imediatamente usuários inativos ou demitidos
    if (user.status === 'inativo' || user.status === 'demitido') {
      return res.status(403).json({ success: false, message: 'Acesso negado. Conta inativa ou demitida da corporação.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
  }
};

module.exports = verificarAuth;