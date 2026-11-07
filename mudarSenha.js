require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function atualizarSenha() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Conectado...');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('98546478', salt);

    const user = await User.findOneAndUpdate(
      { nickname: /^mestre$/i },
      { 
        password: hashedPassword,
        cargo: 'General',
        role: 'admin',
        status: 'ativo'
      },
      { new: true }
    );

    if (user) {
      console.log('✅ Senha alterada com sucesso para o utilizador:', user.nickname);
      console.log('Nova senha: 98546478 | Cargo: General | Status: ativo');
    } else {
      console.log('❌ Utilizador "Mestre" não encontrado. Certifica-te de que ele existe.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
}

atualizarSenha();