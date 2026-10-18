import 'dotenv/config';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en el archivo .env');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const sqlite = new Database(path.join(root, 'db.sqlite'), { readonly: true });
const schema = await fs.readFile(path.join(root, 'supabase', 'schema.sql'), 'utf8');

try {
  console.log('Creando tablas y funciones en Supabase…');
  await sql.unsafe(schema);
  const users = sqlite.prepare('select id, username, password, role, created_at from users order by id').all();
  const products = sqlite.prepare('select id, barcode, name, price, stock, created_at, updated_at from products order by id').all();
  const sales = sqlite.prepare('select id, total, date, user_id from sales order by id').all();
  const saleItems = sqlite.prepare('select id, sale_id, product_id, quantity, price from sale_items order by id').all();

  await sql.begin(async tx => {
    for (const row of users) await tx`insert into public.users ${tx(row)} on conflict (id) do update set username=excluded.username,password=excluded.password,role=excluded.role,created_at=excluded.created_at`;
    for (const row of products) await tx`insert into public.products ${tx({...row, price:Number(row.price), created_at:row.created_at || null, updated_at:row.updated_at || null})} on conflict (id) do update set barcode=excluded.barcode,name=excluded.name,price=excluded.price,stock=excluded.stock,created_at=excluded.created_at,updated_at=excluded.updated_at`;
    for (const row of sales) await tx`insert into public.sales ${tx({...row, total:Number(row.total), date:row.date || null})} on conflict (id) do update set total=excluded.total,date=excluded.date,user_id=excluded.user_id`;
    for (const row of saleItems) await tx`insert into public.sale_items ${tx({...row, price:Number(row.price)})} on conflict (id) do update set sale_id=excluded.sale_id,product_id=excluded.product_id,quantity=excluded.quantity,price=excluded.price`;
  });
  await sql`select public.repair_sequences()`;
  console.log(`Migración completada: ${users.length} usuarios, ${products.length} productos, ${sales.length} ventas y ${saleItems.length} líneas.`);
} finally {
  sqlite.close();
  await sql.end();
}
