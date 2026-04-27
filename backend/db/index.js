import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/football',
  ...(isProduction && {
    ssl: { rejectUnauthorized: false }
  }),
});

// Test connection and auto-run schema
export async function initDb() {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');
    
    // Auto-run schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      console.log('Schema executed successfully.');
    } else {
      console.warn('schema.sql not found at', schemaPath);
    }
    
    client.release();
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  }
}

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;
