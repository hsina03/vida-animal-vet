// Integración en DOM simulado: prueba eventos y estado, no el diseño visual.
// Ejecutar: node tests/chatbot.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = ["chatbot-faq.js", "chatbot-citas.js", "chatbot.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const labels = [...html.matchAll(/data-va-option="([^"]+)"/g)].map((match) => match[1]);

function createUI() {
  const timers = [];
  let focused;
  class Element {
    constructor(tag = "div") {
      this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {};
      this.hidden = false; this.disabled = false; this.value = ""; this.textContent = "";
      this.dataset = {}; this.validityMessage = "";
    }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, callback) { this.listeners[event] = callback; }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { focused = this; }
    setCustomValidity(message) { this.validityMessage = message; }
    reportValidity() { return !this.validityMessage; }
    querySelectorAll(tag) { return this.children.filter((child) => child.tag === tag); }
    click() { if (!this.disabled) this.listeners.click?.(); }
    set innerHTML(value) { throw new Error("El widget debe mostrar el texto sin interpretar HTML."); }
  }
  const selectors = [".va-window", ".va-launcher", ".va-close", ".va-content", ".va-transcript", ".va-menu-area", ".va-menu-toggle", ".va-input-row", "#va-message-input", ".va-send", ".va-typing", ".va-actions", ".va-flow-status"];
  const nodes = Object.fromEntries(selectors.map((selector) => [selector, new Element()]));
  nodes[".va-window"].hidden = true;
  const options = labels.map((label) => { const button = new Element("button"); button.dataset.vaOption = label; return button; });
  const hero = new Element("button");
  const widget = { querySelector: (selector) => nodes[selector], querySelectorAll: () => options, addEventListener(event, callback) { this[event] = callback; } };
  const noExternalData = () => { throw new Error("La demostración no debe enviar ni persistir datos."); };
  const window = { setTimeout: (callback) => timers.push(callback), fetch: noExternalData,
    localStorage: { setItem: noExternalData }, sessionStorage: { setItem: noExternalData } };
  const document = { querySelector: () => widget, querySelectorAll: () => [hero], createElement: (tag) => new Element(tag) };
  vm.runInNewContext(source, { window, document, fetch: noExternalData });
  return {
    nodes, options, widget, timers,
    flush() { while (timers.length) timers.shift()(); },
    submit(text) {
      nodes["#va-message-input"].value = text;
      nodes["#va-message-input"].listeners.input();
      nodes[".va-input-row"].listeners.submit({ preventDefault() {} });
    },
    action(label) {
      const button = nodes[".va-actions"].children.find((item) => item.textContent === label);
      assert.ok(button, `Falta botón: ${label}`);
      button.click();
    },
    lastText() { return nodes[".va-transcript"].children.at(-1).children[0].children.map((item) => item.textContent).join("\n\n"); },
    get focused() { return focused; }
  };
}

const ui = createUI();
ui.nodes[".va-launcher"].click();
ui.options[0].click();
assert.equal(ui.nodes[".va-typing"].hidden, false);
ui.flush();
assert.match(ui.lastText(), /datos ficticios/);
ui.submit("Persona Ejemplo"); ui.flush();
assert.match(ui.lastText(), /teléfono/);
ui.nodes[".va-menu-toggle"].click();
ui.options[3].click(); ui.flush();
assert.match(ui.lastText(), /Plaza del Sol/);
ui.action("Continuar borrador"); ui.flush();
assert.match(ui.lastText(), /teléfono/);
ui.submit("¿Cuánto cuesta una consulta?"); ui.flush();
assert.match(ui.lastText(), /lista de precios autorizada/);
ui.action("Continuar borrador"); ui.flush();
assert.match(ui.lastText(), /teléfono/);
for (const text of ["6560001234", "Luna"]) { ui.submit(text); ui.flush(); }
ui.action("Perro"); ui.flush();
ui.action("Omitir este dato"); ui.flush();
ui.action("Omitir este dato"); ui.flush();
ui.action("Consulta general"); ui.flush();
for (const text of ["15/12/2050", "16:30", "Revisión general"]) { ui.submit(text); ui.flush(); }
assert.match(ui.lastText(), /Revisa los datos[\s\S]*No indicado[\s\S]*15\/12\/2050/);
ui.action("Corregir un dato"); ui.flush();
ui.action("Teléfono"); ui.flush();
ui.submit("6560004321"); ui.flush();
assert.match(ui.lastText(), /\+526560004321/);
ui.action("Finalizar prueba"); ui.flush();
assert.match(ui.lastText(), /No se envió ni registró/);
assert.equal(ui.nodes[".va-flow-status"].hidden, true);

const urgentUI = createUI();
urgentUI.options[0].click(); urgentUI.flush();
urgentUI.submit("Mi mascota no puede respirar");
assert.equal(urgentUI.timers.length, 0);
assert.match(urgentUI.lastText(), /contacta inmediatamente/);
urgentUI.submit("continuar"); urgentUI.flush();
assert.match(urgentUI.lastText(), /nombre completo/);
urgentUI.action("Cancelar borrador"); urgentUI.flush();
assert.equal(urgentUI.nodes[".va-flow-status"].hidden, true);

const faqUI = createUI();
faqUI.submit("<img src=x onerror=alert(1)>"); faqUI.flush();
assert.equal(faqUI.nodes[".va-transcript"].children[0].children[0].children[1].textContent, "<img src=x onerror=alert(1)>");
faqUI.submit("quiero reagendar mi cita"); faqUI.flush();
assert.match(faqUI.lastText(), /no puede consultar, modificar ni cancelar/);
assert.equal(faqUI.nodes[".va-flow-status"].hidden, true);
console.log("PASS: integración de citas y FAQ en DOM simulado: botones, edición, continuidad, urgencias y finalización sin envío.");
