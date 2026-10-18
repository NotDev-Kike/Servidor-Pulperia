let carrito = [];
let total = 0;

const input = document.getElementById("barcode");
const pagaInput = document.getElementById("paga");

const beep = new Audio("https://www.soundjay.com/buttons/sounds/button-16.mp3");

document.addEventListener("click", (e) => {
  const activo = document.activeElement;

  if (activo !== pagaInput) {
    input.focus();
  }
});

input.addEventListener("keydown", async (e) => {

  if (e.key === "Enter") {

    const code = input.value.trim();
    if (!code) return;

    try {

      const res = await fetch(`/api/products/${code}`);
      const p = await res.json();

      if (p && p.id) {

        if (p.stock <= 0) {
          alert("Sin stock");
          input.value = "";
          return;
        }

        beep.play();

        const existente = carrito.find(x => x.id === p.id);

        if (existente) {
          existente.qty++;
        } else {
          carrito.push({
            id: p.id,
            name: p.name,
            price: p.price,
            qty: 1,
            stock: p.stock
          });
        }

        calcularTotal();
        render();

      } else {
        alert("Producto no encontrado");
      }

    } catch(e) {
      alert("Error conexión");
    }

    input.value = "";
  }

});

function calcularTotal() {
  total = 0;
  carrito.forEach(p => total += p.price * p.qty);
}

function render() {

  const lista = document.getElementById("lista");
  lista.innerHTML = "";

  carrito.forEach((p, i) => {

    const div = document.createElement("div");
    div.className = "producto";

    div.innerHTML = `
      <span>
        <b>${p.name}</b><br>
        L ${p.price} | Stock: ${p.stock}
      </span>

      <div class="controls">
        <button onclick="menos(${i})">➖</button>
        <span>${p.qty}</span>
        <button onclick="mas(${i})">➕</button>
        <button onclick="eliminar(${i})">❌</button>
      </div>
    `;

    lista.appendChild(div);
  });

  document.getElementById("total").textContent = total.toFixed(2);

  calcularCambio();
}

pagaInput.addEventListener("input", calcularCambio);

function calcularCambio() {
  const paga = parseFloat(pagaInput.value) || 0;
  const cambio = paga - total;
  document.getElementById("cambio").textContent = cambio > 0 ? cambio.toFixed(2) : 0;
}

function mas(i) {
  if (carrito[i].qty < carrito[i].stock) {
    carrito[i].qty++;
  } else {
    alert("No hay más stock");
  }
  calcularTotal();
  render();
}

function menos(i) {
  if (carrito[i].qty > 1) {
    carrito[i].qty--;
  } else {
    carrito.splice(i, 1);
  }
  calcularTotal();
  render();
}

function eliminar(i) {
  carrito.splice(i, 1);
  calcularTotal();
  render();
}

async function finalizar() {

  if (carrito.length === 0) return;

  await fetch("/api/sales", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ items: carrito, total })
  });

  alert("Venta completada");

  cancelar();
}

function cancelar() {
  carrito = [];
  total = 0;
  pagaInput.value = "";
  render();
}