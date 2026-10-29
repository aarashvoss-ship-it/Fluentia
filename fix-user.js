const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://paasta:uYHJSWYQRy9mFeLzA2A8M29ksfpzgwPW@database-280116ce-08a:5432/paasta',
});

async function setPassword() {
  const email = 'mehr.sarani@gmail.com';
  const tempPassword = 'TemporaryPassword123!';
  
  try {
    console.log('Generating bcrypt hash...');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    console.log('Updating database...');
    const result = await pool.query(
      `UPDATE public.users SET password_hash = $1 WHERE lower(btrim(email)) = lower(btrim($2))`,
      [hashedPassword, email]
    );

    if (result.rowCount > 0) {
      console.log('SUCCESS! Password updated successfully for:', email);
      console.log('Temporary Password is:', tempPassword);
    } else {
      console.log('WARNING: User with email', email, 'was not found in public.users table.');
    }
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    await pool.end();
  }
}

setPassword();