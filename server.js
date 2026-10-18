import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(root, 'db.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'vendedor', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT NOT NULL UNIQUE, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0 CHECK(price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL NOT NULL DEFAULT 0, date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, user_id INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0), price REAL NOT NULL);`);
function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(item => item.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('users', 'created_at', "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
ensureColumn('products', 'created_at', "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
ensureColumn('products', 'updated_at', "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
ensureColumn('sales', 'user_id', 'INTEGER REFERENCES users(id)');
const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!admin) db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run('admin', bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'pineda1234', 12), 'admin');

const app = express();
app.use(helmet({ contentSecurityPolicy: false })); app.use(express.json({ limit: '1mb' })); app.use(cookieParser());
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esta-clave-en-produccion';
const productSchema = z.object({ barcode:z.string().trim().min(1).max(80), name:z.string().trim().min(1).max(160), price:z.coerce.number().min(0), stock:z.coerce.number().int().min(0) });
const userSchema = z.object({ username:z.string().trim().min(3).max(80), password:z.string().min(6).max(200), role:z.enum(['admin','vendedor']).default('vendedor') });
function issue(user,res){res.cookie('session',jwt.sign({id:user.id,username:user.username,role:user.role},JWT_SECRET,{expiresIn:'8h'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000});}
function auth(req,res,next){try{req.user=jwt.verify(req.cookies.session||'',JWT_SECRET);next()}catch{res.status(401).json({error:'Sesión no válida'})}}
function adminOnly(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Se requiere rol administrador'});next()}
function parsed(schema,body,res){const r=schema.safeParse(body);if(!r.success){res.status(400).json({error:r.error.issues[0]?.message||'Datos inválidos'});return null}return r.data}
app.post('/api/auth/login',(req,res)=>{const b=parsed(z.object({username:z.string(),password:z.string()}),req.body,res);if(!b)return;const u=db.prepare('SELECT * FROM users WHERE username=?').get(b.username);const ok=u&&(u.password.startsWith('$2')?bcrypt.compareSync(b.password,u.password):u.password===b.password);if(!ok)return res.status(401).json({error:'Usuario o contraseña incorrectos'});if(!u.password.startsWith('$2'))db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(b.password,12),u.id);issue(u,res);res.json({user:{id:u.id,username:u.username,role:u.role}})});
app.post('/api/auth/logout',(_,res)=>{res.clearCookie('session');res.status(204).end()}); app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/products',auth,(_,res)=>res.json(db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all()));
app.get('/api/products/:barcode',auth,(req,res)=>res.json(db.prepare('SELECT * FROM products WHERE barcode=?').get(req.params.barcode)||null));
app.post('/api/products',auth,adminOnly,(req,res)=>{const p=parsed(productSchema,req.body,res);if(!p)return;try{const r=db.prepare('INSERT INTO products (barcode,name,price,stock) VALUES (?,?,?,?)').run(p.barcode,p.name,p.price,p.stock);res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid))}catch{res.status(409).json({error:'El código de barras ya existe'})}});
app.put('/api/products/:id',auth,adminOnly,(req,res)=>{const p=parsed(productSchema,req.body,res);if(!p)return;try{const r=db.prepare('UPDATE products SET barcode=?,name=?,price=?,stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.barcode,p.name,p.price,p.stock,req.params.id);if(!r.changes)return res.status(404).json({error:'Producto no encontrado'});res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id))}catch{res.status(409).json({error:'El código de barras ya existe'})}});
app.delete('/api/products/:id',auth,adminOnly,(req,res)=>{const r=db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);if(!r.changes)return res.status(404).json({error:'Producto no encontrado'});res.status(204).end()});
app.post('/api/sales',auth,(req,res)=>{const items=z.array(z.object({id:z.coerce.number().int().positive(),qty:z.coerce.number().int().positive()})).min(1).safeParse(req.body.items);if(!items.success)return res.status(400).json({error:'La venta no contiene productos válidos'});try{const sale=db.transaction(()=>{let total=0;const lines=items.data.map(i=>{const p=db.prepare('SELECT * FROM products WHERE id=?').get(i.id);if(!p)throw Error('Producto no encontrado');if(p.stock<i.qty)throw Error(`Stock insuficiente para ${p.name}`);total+=p.price*i.qty;return {...i,price:p.price}});const id=db.prepare('INSERT INTO sales (total,user_id) VALUES (?,?)').run(total,req.user.id).lastInsertRowid;const line=db.prepare('INSERT INTO sale_items (sale_id,product_id,quantity,price) VALUES (?,?,?,?)');const update=db.prepare('UPDATE products SET stock=stock-?,updated_at=CURRENT_TIMESTAMP WHERE id=?');lines.forEach(i=>{line.run(id,i.id,i.qty,i.price);update.run(i.qty,i.id)});return{id,total}})();res.status(201).json(sale)}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/sales',auth,adminOnly,(_,res)=>res.json(db.prepare('SELECT s.*,u.username FROM sales s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC').all()));
app.get('/api/sales/:id',auth,adminOnly,(req,res)=>res.json(db.prepare('SELECT si.*,p.name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE sale_id=?').all(req.params.id)));
app.delete('/api/sales/:id',auth,adminOnly,(req,res)=>{try{db.transaction(()=>{const lines=db.prepare('SELECT product_id,quantity FROM sale_items WHERE sale_id=?').all(req.params.id);const update=db.prepare('UPDATE products SET stock=stock+? WHERE id=?');lines.forEach(i=>update.run(i.quantity,i.product_id));db.prepare('DELETE FROM sales WHERE id=?').run(req.params.id)})();res.status(204).end()}catch{res.status(400).json({error:'No se pudo eliminar la venta'})}});
app.get('/api/users',auth,adminOnly,(_,res)=>res.json(db.prepare('SELECT id,username,role,created_at FROM users ORDER BY username').all()));
app.post('/api/users',auth,adminOnly,(req,res)=>{const u=parsed(userSchema,req.body,res);if(!u)return;try{const r=db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(u.username,bcrypt.hashSync(u.password,12),u.role);res.status(201).json({id:r.lastInsertRowid,username:u.username,role:u.role})}catch{res.status(409).json({error:'El usuario ya existe'})}});
const dist=path.join(root,'dist');app.use(express.static(dist));app.use((req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(dist,'index.html')));app.use((_,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Pulpería lista en http://localhost:${process.env.PORT||3000}`));
