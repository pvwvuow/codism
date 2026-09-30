import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const email = process.env.ADMIN_EMAIL || 'admin@tvframe.vip';
const password = process.env.ADMIN_PASSWORD || 'Admin123!';

const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (existing) {
  db.prepare('UPDATE users SET password_hash=?, role=? WHERE email=?').run(hash, 'admin', email);
  console.log(`✅ Admin updated: ${email}`);
} else {
  db.prepare('INSERT INTO users(email,password_hash,name,role) VALUES(?,?,?,?)').run(email, hash, 'Admin', 'admin');
  console.log(`✅ Admin created: ${email}`);
}
console.log(`Password: ${password}`);
