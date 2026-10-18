async function productos() {

  const res = await fetch('/api/products');
  const data = await res.json();

  let totalStock = 0;

  let html = `
  <h2>📦 Productos</h2>
  <table>
    <tr>
      <th>ID</th>
      <th>Nombre</th>
      <th>Precio</th>
      <th>Stock</th>
    </tr>
  `;

  data.forEach(p => {
    totalStock += p.stock;

    html += `
    <tr>
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td>L ${p.price}</td>
      <td>${p.stock}</td>
    </tr>
    `;
  });

  html += "</table>";

  html += `
  <div class="resumen">
    <b>Total productos:</b> ${data.length} <br>
    <b>Stock total:</b> ${totalStock}
  </div>
  `;

  contenido.innerHTML = html;
}

async function ventas() {

  const res = await fetch('/api/sales');
  const data = await res.json();

  let totalVentas = 0;

  let html = `
  <h2>💰 Ventas</h2>
  <table>
    <tr>
      <th>ID</th>
      <th>Total</th>
      <th>Fecha</th>
      <th>Acciones</th>
    </tr>
  `;

  data.forEach(v => {
    totalVentas += v.total;

    html += `
    <tr>
      <td>${v.id}</td>
      <td>L ${v.total}</td>
      <td>${v.date}</td>
      <td>
        <button onclick="detalle(${v.id})">🔍</button>
        <button onclick="editarVenta(${v.id}, ${v.total})">✏️</button>
        <button onclick="eliminarVenta(${v.id})">❌</button>
      </td>
    </tr>
    `;
  });

  html += "</table>";

  html += `
  <div class="resumen">
    <b>Total ventas:</b> L ${totalVentas.toFixed(2)}
  </div>
  `;

  contenido.innerHTML = html;
}

async function detalle(id) {

  const res = await fetch(`/api/sales/${id}`);
  const data = await res.json();

  let html = `
  <h2>💰 Ventas</h2>
  <button onclick="ventas()">⬅ Volver</button>

  <div class="resumen">
    <h3>🧾 Venta #${id}</h3>
  `;

  data.forEach(d => {
    html += `<p>${d.name} x${d.quantity} - L ${d.price}</p>`;
  });

  html += "</div>";

  contenido.innerHTML = html;
}

async function editarVenta(id, totalActual) {

  const nuevo = prompt("Nuevo total:", totalActual);

  if (nuevo === null) return;

  const res = await fetch(`/api/sales/${id}`, {
    method: "PUT",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ total: parseFloat(nuevo) })
  });

  const result = await res.json();

  console.log("UPDATE:", result);

  if (!result.ok) {
    alert("Error: " + (result.error || "No se pudo actualizar"));
    return;
  }

  alert("Venta actualizada");

  ventas();
}

async function eliminarVenta(id) {

  if (!confirm("¿Eliminar venta?")) return;

  const res = await fetch(`/api/sales/${id}`, {
    method: "DELETE"
  });

  const result = await res.json();

  console.log("DELETE:", result);

  if (!result.ok) {
    alert("Error al eliminar");
    return;
  }

  alert("Venta eliminada");

  ventas();
}