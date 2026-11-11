(() => {
  "use strict";

  // Limitar las búsquedas al widget facilita integrarlo en otras páginas.
  const chatbot = document.querySelector("#va-chatbot");
  if (!chatbot) return;

  const chatWindow = chatbot.querySelector(".va-window");
  const launcher = chatbot.querySelector(".va-launcher");
  const closeButton = chatbot.querySelector(".va-close");
  const content = chatbot.querySelector(".va-content");
  const transcript = chatbot.querySelector(".va-transcript");
  const menu = chatbot.querySelector(".va-menu-area");
  const menuToggle = chatbot.querySelector(".va-menu-toggle");
  const messageForm = chatbot.querySelector(".va-input-row");
  const messageInput = chatbot.querySelector("#va-message-input");
  const sendButton = chatbot.querySelector(".va-send");
  const typingIndicator = chatbot.querySelector(".va-typing");
  const actionArea = chatbot.querySelector(".va-actions");
  const flowStatus = chatbot.querySelector(".va-flow-status");
  const optionButtons = [...chatbot.querySelectorAll("[data-va-option]")];
  const MAX_MESSAGE_LENGTH = 500;
  let openingButton = launcher;
  let isResponding = false;

  // FAQ resuelve las preguntas; este archivo coordina la interfaz.
  const { resolveReply } = window.VidaAnimalFAQ;
  const { normalizeText } = window.VidaAnimalFAQ;
  // Cambia requiredFields cuando la clínica confirme los campos obligatorios.
  const appointmentFlow = window.VidaAnimalAppointments.createFlow({ requiredFields: {} });

  function renderActions(actions = []) {
    actionArea.replaceChildren();
    actionArea.hidden = actions.length === 0;
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "va-action";
      button.textContent = action.label;
      button.addEventListener("click", () => sendMessage(action.value, { source: "action", displayText: action.label }));
      actionArea.append(button);
    });
  }

  function syncFlowStatus() {
    const state = appointmentFlow.getMetadata();
    flowStatus.hidden = !state.active;
    flowStatus.textContent = state.progress;
    messageInput.placeholder = state.active ? state.placeholder : "Escribe tu mensaje…";
    messageInput.inputMode = state.active ? state.inputMode : "text";
  }

  function withDraftContext(reply) {
    if (!appointmentFlow.isActive()) return reply;
    return {
      ...reply,
      text: reply.urgent ? `${reply.text}\n\nEl borrador permanece sin enviar.` : `${reply.text}\n\nTu borrador sigue en curso. Pulsa «Continuar borrador» para retomar el dato pendiente.`,
      actions: reply.urgent ? [{ label: "Cancelar borrador", value: "cancelar" }] : [
        { label: "Continuar borrador", value: "continuar" },
        { label: "Cancelar borrador", value: "cancelar" }
      ]
    };
  }

  function processMessage(text, source) {
    const faqReply = resolveReply(text);
    // No registrar síntomas de posible urgencia como si fueran datos ordinarios.
    if (faqReply.urgent) return withDraftContext(faqReply);
    const command = normalizeText(text);
    if (["menu", "menu principal", "inicio", "volver"].includes(command)) return withDraftContext(faqReply);

    if (source === "menu") {
      if (faqReply.intent === "citas") return appointmentFlow.start();
      return withDraftContext(faqReply);
    }

    if (appointmentFlow.isActive()) {
      const isQuestion = /[¿?]/.test(text) || /^(cual|cuanto|donde|como|que|tienen|tiene|ofrecen|hacen|atienden|venden|a que hora)\b/.test(command);
      if (isQuestion && faqReply.intent !== "desconocido") return withDraftContext(faqReply);
      return appointmentFlow.handle(text);
    }
    if (faqReply.intent === "citas") return appointmentFlow.start();
    if (faqReply.intent === "disponibilidad") return {
      ...faqReply,
      actions: [{ label: "Preparar borrador de cita", value: "agendar una cita" }]
    };
    return faqReply;
  }

  function scrollToLatest() {
    content.scrollTop = content.scrollHeight;
  }

  function setMenuVisible(isVisible) {
    menu.hidden = !isVisible;
    menuToggle.setAttribute("aria-expanded", String(isVisible));
  }

  function appendMessage(sender, text) {
    const row = document.createElement("div");
    row.className = `va-message-row va-message-row--${sender}`;
    const bubble = document.createElement("div");
    bubble.className = `va-message va-message--${sender}`;
    const speaker = document.createElement("span");
    speaker.className = "va-sr-only";
    speaker.textContent = sender === "user" ? "Tú: " : "Asistente: ";
    bubble.append(speaker);

    text.split("\n\n").forEach((paragraph) => {
      const element = document.createElement("p");
      // textContent muestra lo escrito como texto; nunca interpreta HTML del usuario.
      element.textContent = paragraph;
      bubble.append(element);
    });
    row.append(bubble);
    transcript.append(row);
    scrollToLatest();
  }

  function setResponding(isBusy) {
    isResponding = isBusy;
    typingIndicator.hidden = !isBusy;
    sendButton.disabled = isBusy;
    menuToggle.disabled = isBusy;
    optionButtons.forEach((button) => { button.disabled = isBusy; });
    actionArea.querySelectorAll("button").forEach((button) => { button.disabled = isBusy; });
  }

  function sendMessage(rawText, { source = "input", displayText = rawText } = {}) {
    if (isResponding) return;
    const text = rawText.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      messageInput.setCustomValidity(!text ? "Escribe un mensaje antes de enviarlo." : `Usa un máximo de ${MAX_MESSAGE_LENGTH} caracteres.`);
      messageInput.reportValidity();
      return;
    }

    messageInput.setCustomValidity("");
    messageInput.value = "";
    renderActions();
    setMenuVisible(false);
    appendMessage("user", displayText.trim());
    messageInput.focus();
    const reply = processMessage(text, source);

    function deliverReply() {
      appendMessage("bot", reply.text);
      setResponding(false);
      setMenuVisible(reply.showMenu);
      renderActions(reply.actions);
      syncFlowStatus();
      scrollToLatest();
    }

    // Las alertas urgentes se muestran inmediatamente, sin animación de espera.
    if (reply.urgent) {
      deliverReply();
    } else {
      setResponding(true);
      scrollToLatest();
      window.setTimeout(deliverReply, 450);
    }
  }

  function setChatOpen(isOpen, trigger = launcher) {
    chatWindow.hidden = !isOpen;
    launcher.setAttribute("aria-expanded", String(isOpen));
    launcher.setAttribute("aria-label", `${isOpen ? "Cerrar" : "Abrir"} asistente de Vida Animal II`);

    if (isOpen) {
      openingButton = trigger;
      closeButton.focus();
    } else {
      openingButton.focus();
    }
  }

  launcher.addEventListener("click", () => setChatOpen(chatWindow.hidden));
  closeButton.addEventListener("click", () => setChatOpen(false));

  // Escape cierra el panel sin impedir que el usuario navegue por la página.
  chatbot.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !chatWindow.hidden) {
      event.preventDefault();
      setChatOpen(false);
    }
  });

  document.querySelectorAll("[data-va-open]").forEach((button) => {
    button.addEventListener("click", () => setChatOpen(true, button));
  });

  // Los botones y el formulario comparten el mismo procesamiento.
  optionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      sendMessage(button.dataset.vaOption, { source: "menu" });
    });
  });

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(messageInput.value);
  });
  messageInput.addEventListener("input", () => messageInput.setCustomValidity(""));
  menuToggle.addEventListener("click", () => {
    setMenuVisible(menu.hidden);
    if (!menu.hidden) scrollToLatest();
  });
})();
