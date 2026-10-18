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

const root = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL en el archivo .env');
// Supabase pooler: prepare:false evita problemas con conexiones reutilizadas.
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20 });
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esta-clave-en-produccion';
const productSchema = z.object({ barcode:z.string().trim().min(1).max(80), name:z.string().trim().min(1).max(160), price:z.coerce.number().min(0), stock:z.coerce.number().int().min(0) });
const userSchema = z.object({ username:z.string().trim().min(3).max(80), password:z.string().min(6).max(200), role:z.enum(['admin','vendedor']).default('vendedor') });
const id = value => Number.parseInt(value, 10);
const productView = row => row && ({...row, id:Number(row.id), price:Number(row.price), stock:Number(row.stock)});
const saleView = row => ({...row, id:Number(row.id), total:Number(row.total), user_id:row.user_id === null ? null : Number(row.user_id)});
function issue(user,res){res.cookie('session',jwt.sign({id:user.id,username:user.username,role:user.role},JWT_SECRET,{expiresIn:'8h'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000});}
function auth(req,res,next){try{req.user=jwt.verify(req.cookies.session||'',JWT_SECRET);next()}catch{res.status(401).json({error:'Sesión no válida'})}}
function adminOnly(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Se requiere rol administrador'});next()}
function parsed(schema,body,res){const result=schema.safeParse(body);if(!result.success){res.status(400).json({error:result.error.issues[0]?.message||'Datos inválidos'});return null}return result.data}
function dbError(res,error,status=400){console.error(error);return res.status(status).json({error:error.message||'Error de base de datos'})}

app.post('/api/auth/login',async(req,res)=>{try{const body=parsed(z.object({username:z.string(),password:z.string()}),req.body,res);if(!body)return;const rows=await sql`select * from public.users where username=${body.username} limit 1`;const user=rows[0];const valid=user&&(user.password.startsWith('$2')?bcrypt.compareSync(body.password,user.password):user.password===body.password);if(!valid)return res.status(401).json({error:'Usuario o contraseña incorrectos'});if(!user.password.startsWith('$2'))await sql`update public.users set password=${bcrypt.hashSync(body.password,12)} where id=${user.id}`;issue(user,res);res.json({user:{id:user.id,username:user.username,role:user.role}})}catch(e){dbError(res,e,500)}});
app.post('/api/auth/logout',(_,res)=>{res.clearCookie('session');res.status(204).end()});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/products',auth,async(_,res)=>{try{res.json((await sql`select * from public.products order by name collate "C"`).map(productView))}catch(e){dbError(res,e,500)}});
app.get('/api/products/:barcode',auth,async(req,res)=>{try{const rows=await sql`select * from public.products where barcode=${req.params.barcode} limit 1`;res.json(productView(rows[0])||null)}catch(e){dbError(res,e,500)}});
app.post('/api/products',auth,adminOnly,async(req,res)=>{try{const product=parsed(productSchema,req.body,res);if(!product)return;const rows=await sql`insert into public.products ${sql(product)} returning *`;res.status(201).json(productView(rows[0]))}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.put('/api/products/:id',auth,adminOnly,async(req,res)=>{try{const product=parsed(productSchema,req.body,res);if(!product)return;const rows=await sql`update public.products set barcode=${product.barcode},name=${product.name},price=${product.price},stock=${product.stock},updated_at=now() where id=${id(req.params.id)} returning *`;if(!rows[0])return res.status(404).json({error:'Producto no encontrado'});res.json(productView(rows[0]))}catch(e){dbError(res,e,e.code==='23505'?409:400)}});
app.delete('/api/products/:id',auth,adminOnly,async(req,res)=>{try{await sql`delete from public.products where id=${id(req.params.id)}`;res.status(204).end()}catch(e){dbError(res,e)}});

app.post('/api/sales',auth,async(req,res)=>{try{const items=z.array(z.object({id:z.coerce.number().int().positive(),qty:z.coerce.number().int().positive()})).min(1).parse(req.body.items);const rows=await sql`select * from public.create_sale(${req.user.id},${JSON.stringify(items)}::jsonb) as result`;res.status(201).json(rows[0].result)}catch(e){dbError(res,e)}});
app.get('/api/sales',auth,adminOnly,async(_,res)=>{try{const rows=await sql`select s.*,u.username from public.sales s left join public.users u on u.id=s.user_id order by s.id desc`;res.json(rows.map(saleView))}catch(e){dbError(res,e,500)}});
app.get('/api/sales/:id',auth,adminOnly,async(req,res)=>{try{const rows=await sql`select si.*,p.name from public.sale_items si join public.products p on p.id=si.product_id where si.sale_id=${id(req.params.id)}`;res.json(rows.map(row=>({...row,id:Number(row.id),sale_id:Number(row.sale_id),product_id:Number(row.product_id),quantity:Number(row.quantity),price:Number(row.price)})))}catch(e){dbError(res,e,500)}});
app.delete('/api/sales/:id',auth,adminOnly,async(req,res)=>{try{await sql`select public.delete_sale(${id(req.params.id)})`;res.status(204).end()}catch(e){dbError(res,e)}});
app.get('/api/users',auth,adminOnly,async(_,res)=>{try{res.json(await sql`select id,username,role,created_at from public.users order by username`)}catch(e){dbError(res,e,500)}});
app.post('/api/users',auth,adminOnly,async(req,res)=>{try{const user=parsed(userSchema,req.body,res);if(!user)return;const rows=await sql`insert into public.users ${sql({...user,password:bcrypt.hashSync(user.password,12)})} returning id,username,role`;res.status(201).json(rows[0])}catch(e){dbError(res,e,e.code==='23505'?409:400)}});

const dist=path.join(root,'dist');
app.use(express.static(dist));
app.use((req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(dist,'index.html')));
app.use((_,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Pulpería lista en http://localhost:${process.env.PORT||3000}`));
