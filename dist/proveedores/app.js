let productos = [];
let editando = null;

const inputBarcode = document.getElementById("barcode");
const inputName = document.getElementById("name");
const inputPrice = document.getElementById("price");
const inputStock = document.getElementById("stock");

async function cargar(){
  try {
    const res = await fetch('/api/products');
    productos = await res.json();
    renderTabla(productos);
  } catch(e){
    console.error(e);
    alert("Error cargando productos");
  }
}

function renderTabla(lista){

  let html = `
  <table>
    <tr>
      <th>ID</th>
      <th>Nombre</th>
      <th>Precio</th>
      <th>Stock</th>
      <th>Acciones</th>
    </tr>
  `;

  lista.forEach(p=>{
    html += `
    <tr>
      <td>${p.id}</td>
      <td>${p.name || "(Sin nombre)"}</td>
      <td>L ${p.price}</td>
      <td>${p.stock}</td>
      <td>
        <button onclick="editar(${p.id})">✏️</button>
        <button onclick="eliminar(${p.id})">❌</button>
      </td>
    </tr>
    `;
  });

  html += "</table>";
  document.getElementById("tabla").innerHTML = html;
}

function buscar(texto){

  const filtrados = productos.filter(p =>
    (p.name || "").toLowerCase().includes(texto.toLowerCase())
  );

  renderTabla(filtrados);
}

async function guardar(){

  const data = {
    barcode: inputBarcode.value.trim(),
    name: inputName.value.trim(),
    price: parseFloat(inputPrice.value),
    stock: parseInt(inputStock.value)
  };

  console.log("DATA:", data);

  if(!data.barcode){
    alert("Código requerido");
    return;
  }

  if(!data.name){
    alert("Nombre requerido");
    return;
  }

  if(isNaN(data.price)){
    alert("Precio inválido");
    return;
  }

  if(isNaN(data.stock)){
    alert("Stock inválido");
    return;
  }

  try{

    if(editando !== null){

      const res = await fetch(`/api/products/${editando}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(data)
      });

      const result = await res.json();

      console.log("UPDATE:", result);

      if(!result.ok){
        alert("Error: " + result.error);
        return;
      }

      alert("Producto actualizado");

    } else {

      const res = await fetch("/api/products",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(data)
      });

      const result = await res.json();

      console.log("CREATE:", result);

      if(result.error){
        alert(result.error);
        return;
      }

      alert("Producto creado");
    }

    limpiar();
    await cargar();

  }catch(e){
    console.error(e);
    alert("Error de conexión");
  }
}

function editar(id){

  const p = productos.find(x => Number(x.id) === Number(id));

  if(!p){
    alert("Producto no encontrado");
    return;
  }

  console.log("EDITANDO:", p);

  inputBarcode.value = p.barcode || "";
  inputName.value = p.name || "";
  inputPrice.value = p.price || "";
  inputStock.value = p.stock || "";

  editando = id;

  document.querySelector("button.main").innerText = "Actualizar";

  inputBarcode.disabled = true;

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminar(id){

  if(!confirm("¿Eliminar producto?")) return;

  try{

    const res = await fetch(`/api/products/${id}`,{
      method:"DELETE"
    });

    const result = await res.json();

    if(!result.ok){
      alert("Error al eliminar");
      return;
    }

    alert("Producto eliminado");

    await cargar();

  }catch(e){
    console.error(e);
    alert("Error de conexión");
  }
}

function limpiar(){

  inputBarcode.value = "";
  inputName.value = "";
  inputPrice.value = "";
  inputStock.value = "";

  editando = null;

  inputBarcode.disabled = false;

  document.querySelector("button.main").innerText = "Guardar";
}

cargar();