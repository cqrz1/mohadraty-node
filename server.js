require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./src/models');

const port = Number(process.env.PORT || 3000);

async function bootstrap() {
  try {
    await sequelize.authenticate();
    // eslint-disable-next-line no-console
    console.log('Database connection established (MSSQL).');

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Mohadraty app listening on http://localhost:${port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', error);
  process.exit(1);
});

bootstrap();
