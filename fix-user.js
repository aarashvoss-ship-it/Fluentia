const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

async function setTemporaryPassword() {
  const email = 'mehr.sarani@gmail.com';
  const tempPassword = 'FluentiaTempPassM.Sarani2026!';
  const saltRounds = 10;

  try {
    console.log('Generating hash...');
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    console.log('Updating database...');
    const query = `
      UPDATE public.users 
      SET password_hash = $1 
      WHERE lower(btrim(email)) = lower(btrim($2))
    `;
    
    const result = await pool.query(query, [hashedPassword, email]);
    
    if (result.rowCount > 0) {
      console.log(`SUCCESS: Password updated successfully for ${email}`);
      console.log(`Temporary Password is: ${tempPassword}`);
    } else {
      console.log(`WARNING: User with email ${email} was not found in public.users table.`);
    }
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    await pool.end();
  }
}

setTemporaryPassword();