const mongoose = require('mongoose');

const conectarDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erro de conexão com o MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = conectarDB;