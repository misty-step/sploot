const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function checkUsers() {
  try {
    const result = await pool.query(`
      SELECT id, email, created_at, updated_at
      FROM users
      ORDER BY email, created_at
    `);

    console.log('Total users:', result.rows.length);
    console.log('\nUsers:');
    result.rows.forEach(row => {
      console.log(`- ID: ${row.id}`);
      console.log(`  Email: ${row.email}`);
      console.log(`  Created: ${row.created_at}`);
      console.log(`  Updated: ${row.updated_at}`);
      console.log('');
    });

    // Check for duplicates
    const emailCount = new Map();
    result.rows.forEach(row => {
      const count = emailCount.get(row.email) || 0;
      emailCount.set(row.email, count + 1);
    });

    console.log('\nDuplicate emails:');
    let hasDuplicates = false;
    for (const [email, count] of emailCount.entries()) {
      if (count > 1) {
        hasDuplicates = true;
        console.log(`❌ ${email}: ${count} records`);
        const dups = result.rows.filter(r => r.email === email);
        dups.forEach(dup => {
          console.log(`   - ID: ${dup.id}, Created: ${dup.created_at}`);
        });
      }
    }

    if (!hasDuplicates) {
      console.log('✅ No duplicate emails found');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
