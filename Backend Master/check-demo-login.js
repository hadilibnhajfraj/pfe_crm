require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    const db = await client.query(
      'SELECT current_database() AS db'
    );

    console.log('Base connectée :', db.rows[0].db);

    if (db.rows[0].db !== 'cbigestionnairepfe_demo') {
      throw new Error('Base incorrecte : diagnostic interrompu.');
    }

    const result = await client.query(
      `SELECT "passwordHash", "isActive"
       FROM public.users
       WHERE email = $1`,
      ['demo.commercial01@cbi_tunisia.com']
    );

    if (result.rowCount !== 1) {
      throw new Error('Compte absent ou dupliqué.');
    }

    const ok = await bcrypt.compare(
      'PFE-Demo-2026!',
      result.rows[0].passwordHash
    );

    console.log('Compte actif :', result.rows[0].isActive);
    console.log('Mot de passe correct :', ok);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Diagnostic échoué :', err.message);
  process.exitCode = 1;
});
