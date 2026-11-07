const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  nickname: { type: String, required: true, unique: true }, // Chave primária do jogo
  password: { type: String, required: true },
  cargo: { 
    type: String, 
    enum: ['Privado', 'Sargento', 'Tenente', 'Major', 'Coronel', 'General'], 
    default: 'Privado' 
  },
  role: { type: String, enum: ['member', 'sub_admin', 'admin'], default: 'member' },
  status: { type: String, enum: ['pendente', 'ativo', 'inativo', 'demitido'], default: 'pendente' },
  dataEntrada: { type: Date, default: Date.now },
  
  // Personalização de Perfil
  avatarUrl: { type: String, default: '/images/default-avatar.png' },
  emojiStatus: { type: String, default: '🎖️' },
  simbolo: { type: String, default: '' },
  bio: { type: String, maxLength: 120 }
});

// Patamar de Fidelidade Automático por Tempo de Gestão
UserSchema.virtual('patamarFidelidade').get(function () {
  const agora = new Date();
  const diferencaDias = Math.floor((agora - this.dataEntrada) / (1000 * 60 * 60 * 24));

  if (diferencaDias >= 181) return { nome: 'Diamante', badge: '💎', classeCss: 'patamar-diamante' };
  if (diferencaDias >= 91)  return { nome: 'Ouro',     badge: '🥇', classeCss: 'patamar-ouro' };
  if (diferencaDias >= 31)  return { nome: 'Prata',    badge: '🥈', classeCss: 'patamar-prata' };
  return { nome: 'Bronze',   badge: '🥉', classeCss: 'patamar-bronze' };
});

// Garante que os virtuais apareçam quando converter para JSON
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);