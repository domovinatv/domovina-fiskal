// Klijentski WebAuthn za /admin: prijava (#passkey-login) i upis (#passkey-register).
// Preneseno iz ~/git/logomedo/logomedo.com src/lib/admin/klijent.ts (tamo iz
// pay.domovina.ai backend/src/admin/auth/static.ts). Admin je server-rendered string
// HTML, pa se ovo umeće kao inline <script> (nonce dodaje CSP middleware).
export const KLIJENT_JS = String.raw`
(() => {
const b64uToBuf = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
const bufToB64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function credToJSON(c) {
  if (typeof c.toJSON === "function") return c.toJSON();
  const r = c.response;
  const response = { clientDataJSON: bufToB64u(r.clientDataJSON) };
  if (r.attestationObject) {
    response.attestationObject = bufToB64u(r.attestationObject);
    response.transports = r.getTransports ? r.getTransports() : [];
  } else {
    response.authenticatorData = bufToB64u(r.authenticatorData);
    response.signature = bufToB64u(r.signature);
    if (r.userHandle) response.userHandle = bufToB64u(r.userHandle);
  }
  return { id: c.id, rawId: bufToB64u(c.rawId), type: c.type, response,
    clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment };
}

const PKC = window.PublicKeyCredential;
function requestOptions(o) {
  if (PKC && PKC.parseRequestOptionsFromJSON) return PKC.parseRequestOptionsFromJSON(o);
  return { ...o, challenge: b64uToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
}
function creationOptions(o) {
  if (PKC && PKC.parseCreationOptionsFromJSON) return PKC.parseCreationOptionsFromJSON(o);
  return { ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
  return data;
}

function show(text) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

const loginBtn = document.getElementById("passkey-login");
if (loginBtn) loginBtn.addEventListener("click", async () => {
  try {
    const opts = await post("/admin/passkey/login/options");
    const cred = await navigator.credentials.get({ publicKey: requestOptions(opts) });
    const res = await post("/admin/passkey/login/verify", { response: credToJSON(cred), next: loginBtn.dataset.next });
    location.href = res.next;
  } catch (e) {
    show("Prijava nije uspjela: " + e.message);
  }
});

const regForm = document.getElementById("passkey-register");
if (regForm) regForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const opts = await post("/admin/passkey/register/options");
    const cred = await navigator.credentials.create({ publicKey: creationOptions(opts) });
    await post("/admin/passkey/register/verify", { response: credToJSON(cred), label: regForm.elements.namedItem("label").value });
    location.reload();
  } catch (e) {
    show("Upis nije uspio: " + e.message);
  }
});
})();
`;
