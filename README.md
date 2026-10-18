# Pulpería · Sistema de gestión para minisúper

Sistema web para administrar una pulpería, tienda de barrio o minisúper. Incluye punto de venta, inventario, clientes, compras, proveedores, usuarios y conexión con Supabase PostgreSQL.

## Características principales

- Punto de venta para registrar ventas rápidamente.
- Carrito de compra con cantidades, descuentos e ISV.
- Métodos de pago: efectivo, tarjeta, transferencia y crédito.
- Control automático de existencias después de cada venta.
- Inventario con código de barras, precio, costo, stock mínimo, ISV, categoría y proveedor.
- Clientes con límite de crédito, saldo pendiente y registro de pagos.
- Compras que incrementan el stock y actualizan el costo del producto.
- Proveedores.
- Reportes de ventas y compras para administración.
- Tablero con ventas del día, reposición y métricas operativas.
- Usuarios con roles de administrador y vendedor.
- Compatibilidad con escáneres de códigos de barras USB o Bluetooth.
- Base de datos PostgreSQL alojada en Supabase.
- Validaciones de entrada con Zod.
- Contraseñas protegidas con bcryptjs.
- Sesiones protegidas mediante cookie HTTP-only y JWT.
- Cabeceras de seguridad mediante Helmet.

## Roles y permisos

### Administrador

El administrador tiene acceso completo a:

- Tablero general.
- Punto de venta.
- Inventario.
- Clientes y cuentas por cobrar.
- Compras.
- Proveedores.
- Reportes.
- Creación de usuarios y asignación de roles.
- Eliminación de productos.

### Vendedor

El vendedor tiene un flujo simplificado para operar la tienda:

- Al iniciar sesión entra directamente al Punto de venta.
- Puede vender y cobrar productos.
- Puede aplicar descuentos y seleccionar métodos de pago.
- Puede seleccionar clientes para ventas a crédito.
- Puede consultar y registrar clientes.
- Puede agregar o actualizar productos del inventario.
- Puede ajustar precio de venta y existencias.
- Puede consultar alertas de stock bajo.

El vendedor no tiene acceso a compras, proveedores, reportes completos, usuarios ni eliminación de productos. Estas restricciones existen tanto en el menú como en el backend.

## Escáner de códigos de barras

El sistema está preparado para escáneres USB o Bluetooth que funcionen como teclado, conocidos como keyboard wedge.

### En el punto de venta

1. Entra al Punto de venta.
2. El cursor queda en el buscador.
3. Escanea el código de barras.
4. El escáner escribe el código y normalmente envía Enter.
5. El producto se agrega automáticamente al carrito.

También se puede escribir el código manualmente y presionar Enter.

### En inventario

1. Entra a Inventario.
2. Escanea un código en el campo Código de barras.
3. Si el producto ya existe, sus datos se cargan automáticamente.
4. Se puede actualizar el stock o la información permitida.

Para un producto nuevo, el código debe registrarse junto con su nombre, precio y stock. En el futuro se puede conectar un catálogo externo, por ejemplo Open Food Facts, para intentar completar automáticamente la información de productos desconocidos.

## Tecnologías

- React 19.
- Vite 7.
- Express 5.
- Node.js con módulos ES.
- PostgreSQL mediante el paquete `postgres`.
- Supabase como proveedor de base de datos.
- Zod para validación.
- JWT y cookies HTTP-only para autenticación.
- bcryptjs para contraseñas.
- Lucide React para iconos.
- CSS propio responsive.

## Requisitos

- Node.js 20 o superior recomendado.
- npm.
- Proyecto de Supabase con PostgreSQL habilitado.
- Cadena de conexión PostgreSQL de Supabase.

## Instalación

Desde la carpeta del proyecto:

```bash
npm install
```

Después crea un archivo `.env` en la raíz. Nunca publiques este archivo ni compartas sus valores.

```env
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/postgres
JWT_SECRET=una-clave-larga-y-segura
NODE_ENV=development
PORT=3000
```

`DATABASE_URL` debe contener la conexión PostgreSQL de Supabase. En producción es recomendable usar la conexión pooler proporcionada por Supabase.

## Base de datos y Supabase

El proyecto no utiliza SQLite en ejecución. La aplicación se conecta directamente a Supabase PostgreSQL.

Archivos importantes:

- `supabase/schema.sql`: esquema inicial.
- `supabase/upgrade.sql`: ampliación idempotente del esquema para categorías, proveedores, clientes, compras, pagos, configuración y funciones de ventas.

Al iniciar el backend, `server.js` ejecuta `supabase/upgrade.sql` automáticamente. El script usa operaciones seguras como `IF NOT EXISTS`, por lo que puede ejecutarse varias veces sin duplicar tablas ni columnas.

También puedes ejecutar el SQL manualmente desde el SQL Editor de Supabase si lo necesitas:

1. Abre el proyecto en Supabase.
2. Entra a SQL Editor.
3. Copia el contenido de `supabase/schema.sql` si la base está vacía.
4. Ejecuta después `supabase/upgrade.sql`.
5. Confirma que existan las tablas de productos, ventas, clientes, compras y usuarios.

## Ejecución local

### Producción local

```bash
npm start
```

La aplicación queda disponible en:

```text
http://localhost:3000
```

### Desarrollo

```bash
npm run dev
```

El modo desarrollo ejecuta el servidor Node con reinicio automático y Vite para la interfaz.

### Compilar frontend

```bash
npm run build
```

La compilación genera la carpeta `dist`, que es servida por Express.

### Vista previa de Vite

```bash
npm run preview
```

## Flujo de una venta

1. El vendedor inicia sesión.
2. El sistema abre el Punto de venta.
3. Se buscan productos escribiendo el nombre, código o usando el escáner.
4. Se agregan productos al carrito.
5. Se selecciona cliente si corresponde.
6. Se define descuento, método de pago y monto recibido.
7. Se cobra la venta.
8. Supabase registra la venta y sus líneas.
9. El stock se descuenta automáticamente.
10. Si es una venta a crédito, se actualiza el saldo del cliente.

Las operaciones de venta se ejecutan mediante la función transaccional `public.create_sale_v2`, evitando que se registre una venta sin actualizar el inventario correctamente.

## API principal

Todas las rutas protegidas requieren una sesión válida.

### Autenticación

- `POST /api/auth/login`: iniciar sesión.
- `POST /api/auth/logout`: cerrar sesión.
- `GET /api/auth/me`: consultar el usuario actual.

### Productos e inventario

- `GET /api/products`: listar productos.
- `GET /api/products/:barcode`: buscar por código de barras.
- `POST /api/products`: crear producto; administrador o vendedor.
- `PUT /api/products/:id`: actualizar producto; administrador o vendedor.
- `DELETE /api/products/:id`: eliminar producto; solo administrador.

### Ventas

- `POST /api/sales`: registrar una venta.
- `GET /api/sales`: consultar ventas; solo administrador.
- `GET /api/sales/:id`: consultar detalle; solo administrador.
- `DELETE /api/sales/:id`: eliminar venta; solo administrador.

### Clientes y pagos

- `GET /api/customers`: listar clientes.
- `POST /api/customers`: crear cliente.
- `POST /api/customers/:id/payments`: registrar pago de cliente.

### Compras y proveedores

- `GET /api/suppliers`: listar proveedores.
- `POST /api/suppliers`: crear proveedor; solo administrador.
- `GET /api/purchases`: listar compras; solo administrador.
- `POST /api/purchases`: registrar compra; solo administrador.

### Administración

- `GET /api/dashboard`: métricas del tablero.
- `GET /api/categories`: listar categorías.
- `POST /api/categories`: crear categoría; solo administrador.
- `GET /api/users`: listar usuarios; solo administrador.
- `POST /api/users`: crear usuario; solo administrador.
- `GET /api/settings`: consultar configuración; solo administrador.
- `PUT /api/settings`: actualizar configuración; solo administrador.

## Estructura del proyecto

```text
Servidor-Pulperia/
├── src/
│   ├── main.jsx          # Interfaz React y módulos del sistema
│   └── styles.css        # Estilos y diseño responsive
├── supabase/
│   ├── schema.sql        # Esquema inicial
│   └── upgrade.sql       # Migraciones y funciones PostgreSQL
├── server.js             # API Express, autenticación y conexión Supabase
├── index.html             # Entrada de Vite
├── package.json           # Scripts y dependencias
├── package-lock.json      # Versiones exactas instaladas
├── dist/                  # Frontend compilado
├── Datos Locales/         # Documentación o referencias locales
└── .env                   # Configuración local, no se publica
```

## Seguridad

- No subas `.env` al repositorio.
- No escribas contraseñas de Supabase en el README, código fuente o capturas.
- Usa una clave `JWT_SECRET` larga y aleatoria.
- Cambia la contraseña de la base de datos si fue compartida públicamente.
- En producción configura `NODE_ENV=production` para activar cookies seguras.
- Usa HTTPS cuando publiques el sistema.
- Crea usuarios vendedores con contraseñas individuales.
- No compartas la cuenta de administrador.

## Errores comunes

### `Failed to fetch` o `ERR_CONNECTION_REFUSED`

El backend no está ejecutándose. Inicia el servidor:

```bash
npm start
```

Mantén esa terminal abierta mientras uses la aplicación.

### Error de conexión con Supabase

Revisa:

- Que exista `.env`.
- Que `DATABASE_URL` sea correcta.
- Que la contraseña no contenga caracteres sin codificar dentro de la URL.
- Que el proyecto de Supabase esté activo.
- Que la conexión use el puerto y host correctos.

### El vendedor no puede ver compras o reportes

Es el comportamiento esperado. Esas funciones están reservadas para el administrador.

### El escáner no agrega el producto

Comprueba:

- Que el código exista en Inventario.
- Que el escáner termine la lectura con Enter.
- Que el cursor esté en el buscador del Punto de venta.
- Que el producto tenga existencias mayores que cero.

## Estado actual y siguientes mejoras

El sistema ya cuenta con la operación principal de una pulpería. Las mejoras recomendadas para una siguiente etapa son:

- Impresión de recibos o facturas.
- Integración con impresora térmica.
- Catálogo externo para completar datos mediante código de barras.
- Apertura y cierre de caja por turno.
- Arqueo de caja.
- Historial de movimientos de inventario.
- Devoluciones y anulaciones con autorización administrativa.
- Exportación de reportes a Excel o PDF.
- Copias de seguridad automatizadas.
- Despliegue en un servicio de hosting.
- Integración fiscal según los requisitos legales de Honduras.

## Licencia

Proyecto privado para la gestión de una pulpería o minisúper. Define una licencia antes de distribuirlo públicamente.
