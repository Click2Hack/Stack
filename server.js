const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const PRICE_DB = require('./price_db.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const items = Object.entries(PRICE_DB).map(([name, price]) => {
    return `<button onclick=\"addItem('${name}', ${price})\">➕ ${name} (₹${price})</button>`;
  }).join('<br/>');

  res.send(`
    <html>
    <head>
      <title>Customer Order</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        .form { max-width: 700px; margin: auto; }
        .cart { background: #f9f9f9; padding: 10px; margin-top: 10px; border: 1px solid #ccc; }
        .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { margin-top: 10px; font-weight: bold; font-size: 18px; }
        .qr-img { max-width: 200px; margin-top: 10px; }
        .error { color: red; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="form">
        <h2>📝 Create Your Order</h2>
        <form method="POST" action="/generate-order" onsubmit="return prepareSubmit()">
          <input id="name" name="name" placeholder="Your Name" required /><br/><br/>
          <input id="number" name="number" placeholder="Phone Number" required /><br/><br/>
          <label>Dining Mode:</label><br/>
          <select id="mode" name="mode">
            <option value="">-- Choose --</option>
            <option value="Dine-In">Dine-In</option>
            <option value="Walk-In">Walk-In</option>
            <option value="Delivery">Delivery</option>
            <option value="In Car">In Car</option>
          </select><br/><br/>

          <label>Order Type:</label><br/>
          <input type="checkbox" id="dinein" name="order_type_dinein" /> Dine-In
          <input type="checkbox" id="packaged" name="order_type_packaged" /> Packaged
          <input type="checkbox" id="container" name="order_type_container" /> Container<br/><br/>

          <label>Items:</label><br/>
          ${items}

          <div class="cart">
            <h3>🛒 Your Cart</h3>
            <div id="cart"></div>
            <div class="total">Total: ₹<span id="total-amount">0</span></div>
            <div class="error" id="form-error"></div>
          </div>

          <input type="hidden" name="items" id="items-input" value="[]" />
          <br/>
          <label>Note:</label><br/>
          <textarea name="note" id="note"></textarea><br/><br/>

          <button type="submit">✅ Generate Order QR</button>
        </form>
      </div>

      <script>
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        let priceMap = ${JSON.stringify(PRICE_DB)};

        function addItem(item, price) {
          const index = cart.findIndex(i => i.name === item);
          if (index !== -1) {
            cart[index].qty++;
          } else {
            cart.push({ name: item, qty: 1 });
          }
          updateCart();
        }

        function removeItem(index) {
          cart.splice(index, 1);
          updateCart();
        }

        function updateCart() {
          localStorage.setItem('cart', JSON.stringify(cart));
          const container = document.getElementById('cart');
          container.innerHTML = '';
          let total = 0;
          cart.forEach((item, idx) => {
            total += (priceMap[item.name.toLowerCase()] || 0) * item.qty;
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = '<span>' + item.name + ' × ' + item.qty + '</span>' +
              '<button onclick="removeItem(' + idx + ')">❌</button>';
            container.appendChild(row);
          });
          document.getElementById('total-amount').textContent = total;
        }

        function prepareSubmit() {
          const name = document.getElementById('name').value.trim();
          const number = document.getElementById('number').value.trim();
          const mode = document.getElementById('mode').value;

          if (!name || !number || !mode || cart.length === 0) {
            document.getElementById('form-error').textContent = '❌ Please fill all fields and add at least one item.';
            return false;
          }

          const expanded = [];
          cart.forEach(i => {
            for (let j = 0; j < i.qty; j++) expanded.push(i.name);
          });
          document.getElementById('items-input').value = JSON.stringify(expanded);

          localStorage.setItem('form_name', name);
          localStorage.setItem('form_number', number);
          localStorage.setItem('form_mode', mode);
          localStorage.setItem('form_note', document.getElementById('note').value);

          return true;
        }

        document.getElementById('name').value = localStorage.getItem('form_name') || '';
        document.getElementById('number').value = localStorage.getItem('form_number') || '';
        document.getElementById('mode').value = localStorage.getItem('form_mode') || '';
        document.getElementById('note').value = localStorage.getItem('form_note') || '';
        updateCart();
      </script>
    </body>
    </html>
  `);
});

app.post('/generate-order', async (req, res) => {
  const body = req.body;
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const order_id = `ORD-${Date.now()}`;
  const parsedItems = JSON.parse(body.items || '[]');

  const order = {
    name: body.name,
    number: body.number,
    mode: body.mode,
    order_type: {
      dinein: !!body.order_type_dinein,
      packaged: !!body.order_type_packaged,
      container: !!body.order_type_container
    },
    items: parsedItems,
    packaged_items: body.order_type_packaged ? parsedItems : [],
    container_items: body.order_type_container ? parsedItems : [],
    amount: parsedItems.reduce((sum, i) => sum + (PRICE_DB[i.toLowerCase()] || 0), 0),
    payment_status: "Unpaid",
    payment_mode: "",
    note: body.note || "",
    order_id,
    timestamp
  };

  console.log("✅ Order Received:", order);

  const jsonData = JSON.stringify(order, null, 2);
  const qrData = JSON.stringify(order);
  const qrImage = await QRCode.toDataURL(qrData);

  res.send(`
    <html>
      <body style="padding: 20px; font-family: sans-serif">
        <h2>✅ Order Created</h2>
        <img class="qr-img" src="${qrImage}" /><br/><br/>
        <textarea rows="10" cols="80">${jsonData}</textarea><br/><br/>
        <a href="/" onclick="localStorage.clear()">🔙 Start New Order</a>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Web app running at http://localhost:${PORT}`);
});
