require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function setup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Conectado...');

    // Remove qualquer duplicado e cria limpo
    await User.deleteMany({ nickname: /^mestre$/i });

    const hashedPassword = await bcrypt.hash('123456', await bcrypt.genSalt(10));

    const adminUser = new User({
      nickname: 'Mestre',
      password: hashedPassword,
      cargo: 'General',
      role: 'admin',
      status: 'ativo'
    });

    await adminUser.save();
    console.log('✅ Usuário "Mestre" recriado com sucesso como General Admin!');
    console.log('Senha padrão definida: 123456');
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

setup();