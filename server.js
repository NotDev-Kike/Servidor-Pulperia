import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL en el archivo .env');
// Supabase pooler: prepare:false evita problemas con conexiones reutilizadas.
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20 });
await sql.unsafe(await fs.readFile(path.join(root, 'supabase', 'upgrade.sql'), 'utf8'));
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esta-clave-en-produccion';
const productSchema = z.object({ barcode:z.string().trim().min(1).max(80), name:z.string().trim().min(1).max(160), price:z.coerce.number().min(0), stock:z.coerce.number().int().min(0), cost_price:z.coerce.number().min(0).default(0), tax_rate:z.coerce.number().min(0).max(100).default(15), min_stock:z.coerce.number().int().min(0).default(5), category_id:z.coerce.number().int().positive().nullable().optional(), supplier_id:z.coerce.number().int().positive().nullable().optional() });
const userSchema = z.object({ username:z.string().trim().min(3).max(80), password:z.string().min(6).max(200), role:z.enum(['admin','vendedor']).default('vendedor') });
const id = value => Number.parseInt(value, 10);
const productView = row => row && ({...row, id:Number(row.id), price:Number(row.price), stock:Number(row.stock), cost_price:Number(row.cost_price||0), tax_rate:Number(row.tax_rate||0), min_stock:Number(row.min_stock||0), category_id:row.category_id===null?null:Number(row.category_id), supplier_id:row.supplier_id===null?null:Number(row.supplier_id)});
const saleView = row => ({...row, id:Number(row.id), total:Number(row.total), subtotal:Number(row.subtotal||0), tax:Number(row.tax||0), discount:Number(row.discount||0), amount_paid:Number(row.amount_paid||0), change_given:Number(row.change_given||0), user_id:row.user_id === null ? null : Number(row.user_id), customer_id:row.customer_id === null ? null : Number(row.customer_id)});
const moneyView = row => row && ({...row, id:Number(row.id), subtotal:Number(row.subtotal||0), tax:Number(row.tax||0), total:Number(row.total||0), discount:Number(row.discount||0)});
function issue(user,res){res.cookie('session',jwt.sign({id:user.id,username:user.username,role:user.role},JWT_SECRET,{expiresIn:'8h'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000});}
function auth(req,res,next){try{req.user=jwt.verify(req.cookies.session||'',JWT_SECRET);next()}catch{res.status(401).json({error:'Sesión no válida'})}}
function adminOnly(req,res,next){if(req.user?.role==='vendedor'&&['POST','PUT'].includes(req.method)&&req.path.startsWith('/api/products'))return next();if(req.user?.role!=='admin')return res.status(403).json({error:'Se requiere rol administrador'});next()}
function parsed(schema,body,res){const result=schema.safeParse(body);if(!result.success){res.status(400).json({error:result.error.issues[0]?.message||'Datos inválidos'});return null}return result.data}
function dbError(res,error,status=400){console.error(error);return res.status(status).json({error:error.message||'Error de base de datos'})}

app.post('/api/auth/login',async(req,res)=>{try{const body=parsed(z.object({username:z.string(),password:z.string()}),req.body,res);if(!body)return;const rows=await sql`select * from public.users where username=${body.username} limit 1`;const user=rows[0];const valid=user&&(user.password.startsWith('$2')?bcrypt.compareSync(body.password,user.password):user.password===body.password);if(!valid)return res.status(401).json({error:'Usuario o contraseña incorrectos'});if(!user.password.startsWith('$2'))await sql`update public.users set password=${bcrypt.hashSync(body.password,12)} where id=${user.id}`;issue(user,res);res.json({user:{id:user.id,username:user.username,role:user.role}})}catch(e){dbError(res,e,500)}});
app.post('/api/auth/logout',(_,res)=>{res.clearCookie('session');res.status(204).end()});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/products',auth,async(_,res)=>{try{res.json((await sql`select * from public.products order by name collate "C"`).map(productView))}catch(e){dbError(res,e,500)}});
app.get('/api/products/:barcode',auth,async(req,res)=>{try{const rows=await sql`select * from public.products where barcode=${req.params.barcode} limit 1`;res.json(productView(rows[0])||null)}catch(e){dbError(res,e,500)}});
app.post('/api/products',auth,adminOnly,async(req,res)=>{try{const product=parsed(productSchema,req.body,res);if(!product)return;const rows=await sql`insert into public.products ${sql({...product,category_id:product.category_id||null,supplier_id:product.supplier_id||null})} returning *`;res.status(201).json(productView(rows[0]))}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.put('/api/products/:id',auth,adminOnly,async(req,res)=>{try{const product=parsed(productSchema,req.body,res);if(!product)return;const rows=await sql`update public.products set barcode=${product.barcode},name=${product.name},price=${product.price},stock=${product.stock},cost_price=${product.cost_price},tax_rate=${product.tax_rate},min_stock=${product.min_stock},category_id=${product.category_id||null},supplier_id=${product.supplier_id||null},updated_at=now() where id=${id(req.params.id)} returning *`;if(!rows[0])return res.status(404).json({error:'Producto no encontrado'});res.json(productView(rows[0]))}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.delete('/api/products/:id',auth,adminOnly,async(req,res)=>{try{await sql`delete from public.products where id=${id(req.params.id)}`;res.status(204).end()}catch(e){dbError(res,e)}});

app.post('/api/sales',auth,async(req,res)=>{try{const body=z.object({items:z.array(z.object({id:z.coerce.number().int().positive(),qty:z.coerce.number().int().positive()})).min(1),customer_id:z.coerce.number().int().positive().nullable().optional(),discount:z.coerce.number().min(0).default(0),payment_method:z.enum(['efectivo','tarjeta','transferencia','credito']).default('efectivo'),amount_paid:z.coerce.number().min(0).default(0),notes:z.string().max(500).optional()}).parse(req.body);const rows=await sql`select * from public.create_sale_v2(${req.user.id},${body.customer_id||null},${JSON.stringify(body.items)}::jsonb,${body.discount},${body.payment_method},${body.amount_paid},${body.notes||null}) as result`;res.status(201).json(rows[0].result)}catch(e){dbError(res,e)}});
app.get('/api/sales',auth,adminOnly,async(_,res)=>{try{const rows=await sql`select s.*,u.username,c.name as customer_name from public.sales s left join public.users u on u.id=s.user_id left join public.customers c on c.id=s.customer_id order by s.id desc`;res.json(rows.map(saleView))}catch(e){dbError(res,e,500)}});
app.get('/api/sales/:id',auth,adminOnly,async(req,res)=>{try{const rows=await sql`select si.*,p.name from public.sale_items si join public.products p on p.id=si.product_id where si.sale_id=${id(req.params.id)}`;res.json(rows.map(row=>({...row,id:Number(row.id),sale_id:Number(row.sale_id),product_id:Number(row.product_id),quantity:Number(row.quantity),price:Number(row.price)})))}catch(e){dbError(res,e,500)}});
app.delete('/api/sales/:id',auth,adminOnly,async(req,res)=>{try{await sql`select public.delete_sale(${id(req.params.id)})`;res.status(204).end()}catch(e){dbError(res,e)}});
app.get('/api/users',auth,adminOnly,async(_,res)=>{try{res.json(await sql`select id,username,role,created_at from public.users order by username`)}catch(e){dbError(res,e,500)}});
app.post('/api/users',auth,adminOnly,async(req,res)=>{try{const user=parsed(userSchema,req.body,res);if(!user)return;const rows=await sql`insert into public.users ${sql({...user,password:bcrypt.hashSync(user.password,12)})} returning id,username,role`;res.status(201).json(rows[0])}catch(e){dbError(res,e,e.code==='23505'?409:400)}});

app.get('/api/dashboard',auth,async(_,res)=>{try{const [sales,products,customers,purchases]=await Promise.all([sql`select coalesce(sum(total),0) as total,count(*)::int as count from public.sales where date::date=current_date`,sql`select count(*)::int as count,coalesce(sum(stock*price),0) as inventory_value,count(*) filter(where stock<=min_stock)::int as low_stock from public.products where active=true`,sql`select count(*)::int as count,coalesce(sum(balance),0) as receivable from public.customers where active=true`,sql`select coalesce(sum(total),0) as total from public.purchases where date::date=current_date`]);res.json({sales_today:Number(sales[0].total),sales_count:sales[0].count,inventory_value:Number(products[0].inventory_value),products_count:products[0].count,low_stock:products[0].low_stock,customers_count:customers[0].count,receivable:Number(customers[0].receivable),purchases_today:Number(purchases[0].total)})}catch(e){dbError(res,e,500)}});
app.get('/api/categories',auth,async(_,res)=>{try{res.json(await sql`select * from public.categories where active=true order by name`)}catch(e){dbError(res,e,500)}});
app.post('/api/categories',auth,adminOnly,async(req,res)=>{try{const b=z.object({name:z.string().trim().min(2).max(80)}).parse(req.body);const rows=await sql`insert into public.categories(name) values(${b.name}) returning *`;res.status(201).json(rows[0])}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.get('/api/suppliers',auth,async(_,res)=>{try{res.json(await sql`select * from public.suppliers where active=true order by name`)}catch(e){dbError(res,e,500)}});
app.post('/api/suppliers',auth,adminOnly,async(req,res)=>{try{const b=z.object({name:z.string().trim().min(2).max(160),phone:z.string().max(40).optional(),email:z.string().email().optional().or(z.literal('')),address:z.string().max(240).optional(),tax_id:z.string().max(40).optional()}).parse(req.body);const rows=await sql`insert into public.suppliers ${sql(b)} returning *`;res.status(201).json(rows[0])}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.get('/api/customers',auth,async(_,res)=>{try{res.json((await sql`select * from public.customers where active=true order by name`).map(x=>({...x,id:Number(x.id),credit_limit:Number(x.credit_limit),balance:Number(x.balance)})))}catch(e){dbError(res,e,500)}});
app.post('/api/customers',auth,async(req,res)=>{try{const b=z.object({name:z.string().trim().min(2).max(160),phone:z.string().max(40).optional(),email:z.string().email().optional().or(z.literal('')),address:z.string().max(240).optional(),credit_limit:z.coerce.number().min(0).default(0)}).parse(req.body);const rows=await sql`insert into public.customers ${sql(b)} returning *`;res.status(201).json({...rows[0],id:Number(rows[0].id),credit_limit:Number(rows[0].credit_limit),balance:Number(rows[0].balance)})}catch(e){dbError(res,e)}});
app.post('/api/customers/:id/payments',auth,async(req,res)=>{try{const b=z.object({amount:z.coerce.number().positive(),payment_method:z.enum(['efectivo','tarjeta','transferencia']).default('efectivo'),notes:z.string().max(500).optional()}).parse(req.body);const customerId=id(req.params.id);await sql.begin(async tx=>{await tx`insert into public.payments(customer_id,amount,payment_method,notes,user_id) values(${customerId},${b.amount},${b.payment_method},${b.notes||null},${req.user.id})`;await tx`update public.customers set balance=greatest(0,balance-${b.amount}) where id=${customerId}`});res.status(201).json({ok:true})}catch(e){dbError(res,e)}});
app.get('/api/purchases',auth,adminOnly,async(_,res)=>{try{const rows=await sql`select p.*,s.name as supplier_name,u.username from public.purchases p left join public.suppliers s on s.id=p.supplier_id left join public.users u on u.id=p.user_id order by p.id desc`;res.json(rows.map(moneyView))}catch(e){dbError(res,e,500)}});
app.post('/api/purchases',auth,adminOnly,async(req,res)=>{try{const b=z.object({supplier_id:z.coerce.number().int().positive().nullable().optional(),items:z.array(z.object({id:z.coerce.number().int().positive(),qty:z.coerce.number().int().positive(),cost_price:z.coerce.number().min(0)})).min(1),payment_method:z.enum(['efectivo','tarjeta','transferencia','credito']).default('efectivo'),notes:z.string().max(500).optional()}).parse(req.body);const rows=await sql`select * from public.create_purchase(${req.user.id},${b.supplier_id||null},${JSON.stringify(b.items)}::jsonb,${b.payment_method},${b.notes||null}) as result`;res.status(201).json(rows[0].result)}catch(e){dbError(res,e)}});
app.get('/api/settings',auth,adminOnly,async(_,res)=>{try{const rows=await sql`select value from public.settings where key='business'`;res.json(rows[0]?.value||{})}catch(e){dbError(res,e,500)}});
app.put('/api/settings',auth,adminOnly,async(req,res)=>{try{const b=z.object({name:z.string().min(2).max(160),tax_rate:z.coerce.number().min(0).max(100),currency:z.string().min(1).max(5),invoice_prefix:z.string().min(1).max(10)}).parse(req.body);const rows=await sql`insert into public.settings(key,value,updated_at) values('business',${JSON.stringify(b)}::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now() returning value`;res.json(rows[0].value)}catch(e){dbError(res,e)}});

const dist=path.join(root,'dist');
app.use(express.static(dist));
app.use((req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(dist,'index.html')));
app.use((_,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Pulpería lista en http://localhost:${process.env.PORT||3000}`));
