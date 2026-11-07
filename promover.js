require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function promoverAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Conectado para atualização...');

    // Atualiza o usuário "Mestre" para General, Admin, e status ativo
    const resultado = await User.findOneAndUpdate(
      { nickname: { $regex: /^mestre$/i } }, // Procura "Mestre" ignorando maiúsculas/minúsculas
      {
        cargo: 'General',
        role: 'admin',
        status: 'ativo'
      },
      { new: true }
    );

    if (resultado) {
      console.log('✅ Sucesso! Usuário promovido:', resultado.nickname);
      console.log('Cargo:', resultado.cargo, '| Role:', resultado.role, '| Status:', resultado.status);
    } else {
      console.log('❌ Usuário "Mestre" não encontrado. Certifica-te de que já fizeste o cadastro dele.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Erro ao atualizar:', err);
    process.exit(1);
  }
}

promoverAdmin();