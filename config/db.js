const mongoose = require('mongoose');
const dns = require('dns');

// No Windows / Node.js >= 17, a resolução padrão pode tentar IPv6 primeiro,
// causando falhas em registros SRV do Atlas (querySrv ECONNREFUSED/ENOTFOUND).
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {}
}

const obterUriBanco = () => {
  let uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  uri = uri.trim();
  // Remove aspas simples ou duplas que possam ter sido adicionadas no .env
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
};

let tentandoReconectar = false;

const conectarDB = async () => {
  const uri = obterUriBanco();

  if (!uri) {
    console.error('❌ AVISO: Nenhuma string de conexão configurada (MONGO_URI ou MONGODB_URI vazia no .env).');
    return;
  }

  // Mascara credenciais para log seguro
  const uriMascarada = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`🔌 Conectando ao MongoDB: ${uriMascarada}`);

  const opcoes = {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4 // Força conexão via IPv4 para evitar timeouts com provedores de internet
  };

  try {
    const conn = await mongoose.connect(uri, opcoes);
    console.log(`✅ MongoDB Conectado com Sucesso: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⚠️ Erro ao conectar ao MongoDB: ${error.message}`);
    agendarReconexao();
  }
};

function agendarReconexao() {
  if (tentandoReconectar) return;
  tentandoReconectar = true;
  setTimeout(async () => {
    tentandoReconectar = false;
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 Tentando reconectar ao MongoDB...');
      await conectarDB();
    }
  }, 5000);
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Conexão com o MongoDB perdida. Aguardando reconexão...');
  agendarReconexao();
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ Reconexão com MongoDB restabelecida com sucesso!');
});

mongoose.connection.on('error', (err) => {
  console.error(`⚠️ Erro na conexão do MongoDB: ${err.message}`);
});

module.exports = conectarDB;
