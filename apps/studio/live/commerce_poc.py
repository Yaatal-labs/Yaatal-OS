"""Feature-gated social-commerce adapter for the Yaatal OS POC.

The production owner of CommerceIntent, payment, inventory, and orders is
Yaatal Engine. This in-memory adapter exists only to make the portable
social-link flow executable before the Engine contract lands.
"""

from __future__ import annotations

import html
import json
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote, urlencode, urlparse


CONTRACT_VERSION = "yaatal.commerce-intent.v1"
PRODUCT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$")
SOURCES = {"copy", "livestream", "telegram", "whatsapp", "bobo", "unknown"}
PROVIDERS = {
    "wave": "Wave",
    "orange_money": "Orange Money",
    "free_money": "Free Money",
    "mixx": "Mixx by Yas",
    "bank": "Bank / PI-SPI",
}


class CommercePocError(ValueError):
    """A bounded validation or transition error safe for an HTTP response."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _text(value: object, field: str, *, maximum: int, required: bool = True) -> str:
    result = str(value or "").strip()
    if required and not result:
        raise CommercePocError("invalid_request", f"{field} is required")
    if len(result) > maximum or any(ord(char) < 32 for char in result):
        raise CommercePocError("invalid_request", f"{field} is invalid")
    return result


def _identifier(value: object, field: str, pattern: re.Pattern[str]) -> str:
    result = _text(value, field, maximum=128)
    if not pattern.fullmatch(result):
        raise CommercePocError("invalid_request", f"{field} is invalid")
    return result


def _media_url(value: object) -> str:
    result = _text(value, "media_url", maximum=2048, required=False)
    if not result:
        return ""
    parsed = urlparse(result)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username:
        raise CommercePocError("invalid_request", "media_url must be a public HTTP(S) URL")
    return result


def _source(value: object) -> str:
    result = str(value or "unknown").strip().lower()
    return result if result in SOURCES else "unknown"


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _price(product: dict) -> int:
    value = product.get("price_fcfa", product.get("price", product.get("price_cents")))
    if isinstance(value, bool) or not isinstance(value, int) or value < 100 or value > 100_000_000:
        raise CommercePocError("invalid_product", "product price must be whole FCFA")
    return value


def _variants(product: dict) -> list[str]:
    values = product.get("variants") or product.get("options") or []
    if not isinstance(values, list):
        return []
    variants = []
    for value in values[:12]:
        item = _text(value, "variant", maximum=48, required=False)
        if item and item not in variants:
            variants.append(item)
    return variants


class CommercePocStore:
    """Process-local reference implementation of the CommerceIntent contract."""

    def __init__(
        self,
        public_base_url: str,
        *,
        clock: Callable[[], float] = time.time,
        token_factory: Callable[[], str] | None = None,
        uuid_factory: Callable[[], uuid.UUID] = uuid.uuid4,
    ):
        base = public_base_url.strip().rstrip("/")
        parsed = urlparse(base)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("public_base_url must be HTTP(S)")
        self.public_base_url = base
        self._clock = clock
        self._token_factory = token_factory or (lambda: secrets.token_urlsafe(18))
        self._uuid_factory = uuid_factory
        self._intents: dict[str, dict] = {}
        self._orders: dict[tuple[str, str], dict] = {}
        self._conversions: list[dict] = []
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._intents.clear()
            self._orders.clear()
            self._conversions.clear()

    def create(self, product: dict, live_session_id: object, merchant_name: object = "Yaatal seller") -> dict:
        product_id = _identifier(product.get("id"), "product_id", PRODUCT_ID_RE)
        session_id = _identifier(live_session_id, "live_session_id", SESSION_ID_RE)
        name = _text(product.get("name"), "product name", maximum=120)
        description = _text(
            product.get("description") or product.get("category") or "Disponible maintenant",
            "description",
            maximum=280,
        )
        merchant = _text(merchant_name, "merchant_name", maximum=80)
        media_values = product.get("images") if isinstance(product.get("images"), list) else []
        media_url = _media_url(product.get("image_url") or (media_values[0] if media_values else ""))
        stock = product.get("stock", 1)
        if isinstance(stock, bool) or not isinstance(stock, int) or stock < 0:
            stock = 1
        if stock == 0:
            raise CommercePocError("product_unavailable", "product is out of stock", 409)

        now = self._clock()
        token = self._token_factory()
        if not token or len(token) > 128 or "/" in token:
            raise RuntimeError("token factory returned an unsafe token")
        intent = {
            "version": CONTRACT_VERSION,
            "intent_id": str(self._uuid_factory()),
            "token": token,
            "status": "active",
            "created_at": _iso(now),
            "live_session_id": session_id,
            "merchant_name": merchant,
            "product": {
                "id": product_id,
                "name": name,
                "description": description,
                "price_fcfa": _price(product),
                "currency": "XOF",
                "media_url": media_url,
                "variants": _variants(product),
                "remaining_stock": stock,
            },
        }
        with self._lock:
            if token in self._intents:
                raise RuntimeError("token collision")
            self._intents[token] = intent
        return self.public_view(intent)

    def public_view(self, intent: dict) -> dict:
        token = intent["token"]
        links = {
            source: f"{self.public_base_url}/b/{quote(token)}?src={source}"
            for source in ("copy", "livestream", "telegram", "whatsapp", "bobo")
        }
        message = f"{intent['product']['name']} — {intent['product']['price_fcfa']:,} FCFA".replace(",", " ")
        return {
            "version": intent["version"],
            "intent_id": intent["intent_id"],
            "status": intent["status"],
            "created_at": intent["created_at"],
            "live_session_id": intent["live_session_id"],
            "product": dict(intent["product"]),
            "public_url": links["copy"],
            "livestream_url": links["livestream"],
            "share": {
                "whatsapp": "https://wa.me/?" + urlencode({"text": f"{message}\n{links['whatsapp']}"}),
                "telegram": "https://t.me/share/url?" + urlencode(
                    {"url": links["telegram"], "text": message}
                ),
            },
        }

    def get(self, token: str) -> dict:
        with self._lock:
            intent = self._intents.get(token)
            if intent is None:
                raise CommercePocError("intent_not_found", "commerce intent not found", 404)
            return intent

    def checkout(self, token: str, payload: dict) -> dict:
        provider = str(payload.get("provider") or "").strip().lower()
        if provider not in PROVIDERS:
            raise CommercePocError("invalid_provider", "choose a supported payment provider")
        quantity = payload.get("quantity", 1)
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1 or quantity > 10:
            raise CommercePocError("invalid_quantity", "quantity must be between 1 and 10")
        idempotency_key = str(payload.get("idempotency_key") or "").strip()
        if not IDEMPOTENCY_RE.fullmatch(idempotency_key):
            raise CommercePocError("invalid_idempotency_key", "a valid idempotency key is required")
        source = _source(payload.get("source_channel"))

        with self._lock:
            intent = self._intents.get(token)
            if intent is None:
                raise CommercePocError("intent_not_found", "commerce intent not found", 404)
            prior = self._orders.get((token, idempotency_key))
            if prior is not None:
                return {**prior, "deduplicated": True}
            if intent["status"] != "active":
                raise CommercePocError("intent_closed", "commerce intent is closed", 409)
            product = intent["product"]
            if product["remaining_stock"] < quantity:
                raise CommercePocError("insufficient_stock", "requested quantity is unavailable", 409)
            selected_variant = _text(payload.get("variant"), "variant", maximum=48, required=False)
            if product["variants"] and selected_variant not in product["variants"]:
                raise CommercePocError("invalid_variant", "choose an available variant")

            product["remaining_stock"] -= quantity
            order_id = f"YTL-{str(self._uuid_factory()).split('-')[0].upper()}"
            order = {
                "version": "yaatal.commerce-receipt.v1",
                "order_id": order_id,
                "intent_id": intent["intent_id"],
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": quantity,
                "variant": selected_variant or None,
                "total_fcfa": product["price_fcfa"] * quantity,
                "currency": "XOF",
                "payment_provider": provider,
                "payment_provider_label": PROVIDERS[provider],
                "payment_status": "sandbox_paid",
                "live_session_id": intent["live_session_id"],
                "source_channel": source,
                "created_at": _iso(self._clock()),
                "deduplicated": False,
            }
            self._orders[(token, idempotency_key)] = order
            self._conversions.append(dict(order))
            return dict(order)

    def conversions(self, live_session_id: str | None = None) -> list[dict]:
        with self._lock:
            values = list(self._conversions)
        if live_session_id:
            values = [value for value in values if value["live_session_id"] == live_session_id]
        return values

    def render_sheet(self, token: str, source_channel: object = "unknown") -> str:
        intent = self.get(token)
        product = intent["product"]
        title = html.escape(product["name"])
        description = html.escape(product["description"])
        merchant = html.escape(intent["merchant_name"])
        price = f"{product['price_fcfa']:,}".replace(",", " ")
        media = html.escape(product["media_url"], quote=True)
        source = _source(source_channel)
        media_meta = f'<meta property="og:image" content="{media}">' if media else ""
        visual = (
            f'<img src="{media}" alt="{title}" referrerpolicy="no-referrer">'
            if media
            else f'<div class="product-mark" aria-label="Product image unavailable">{html.escape(product["name"][:1].upper())}</div>'
        )
        options = "".join(
            f'<option value="{html.escape(value, quote=True)}">{html.escape(value)}</option>'
            for value in product["variants"]
        )
        variant_field = (
            '<label>Option / Variante<select id="variant" name="variant">' + options + "</select></label>"
            if options
            else ""
        )
        config = json.dumps(
            {"checkoutPath": f"/b/{token}/checkout", "source": source},
            ensure_ascii=False,
        ).replace("<", "\\u003c")
        return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#12100d">
  <meta property="og:type" content="product">
  <meta property="og:title" content="{title} — {price} FCFA">
  <meta property="og:description" content="{description}">
  {media_meta}
  <title>{title} · Yaatal</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f7f0e4; --muted:#b7aa98; --line:#44382c; --bronze:#c9894f; --green:#a8d5b1; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; min-height:100vh; background:radial-gradient(circle at 20% 0,#403026 0,transparent 35%),#12100d; color:var(--ink); font-family:"Avenir Next","Trebuchet MS",sans-serif; }}
    main {{ width:min(100%,560px); min-height:100vh; margin:auto; padding:max(20px,env(safe-area-inset-top)) 18px max(28px,env(safe-area-inset-bottom)); display:grid; align-content:start; gap:18px; }}
    header {{ display:flex; justify-content:space-between; align-items:center; padding:2px 2px 12px; border-bottom:1px solid var(--line); }}
    .brand {{ letter-spacing:.18em; font-weight:800; font-size:12px; }} .secure {{ color:var(--green); font-size:12px; }}
    .media {{ aspect-ratio:4/3; border-radius:30px; overflow:hidden; background:linear-gradient(145deg,#493529,#211a15); box-shadow:0 22px 60px #0008; }}
    .media img {{ width:100%; height:100%; object-fit:cover; }} .product-mark {{ height:100%; display:grid; place-items:center; font:700 112px/1 Georgia,serif; color:#e5ad78; }}
    .sheet {{ margin-top:-54px; position:relative; background:#191511eb; border:1px solid #6b503b; border-radius:28px; padding:24px; backdrop-filter:blur(16px); box-shadow:0 22px 55px #0009; }}
    .merchant {{ color:var(--bronze); font-size:12px; font-weight:800; letter-spacing:.11em; text-transform:uppercase; }}
    h1 {{ margin:9px 0 4px; font:600 clamp(30px,9vw,44px)/.98 Georgia,"Times New Roman",serif; letter-spacing:-.035em; }}
    .price {{ margin:13px 0 2px; font-size:25px; font-weight:800; }} .stock {{ color:var(--green); font-size:13px; }}
    .description {{ color:var(--muted); line-height:1.55; }} .sandbox {{ padding:11px 13px; background:#2a2119; border-left:3px solid var(--bronze); color:#d9c8b5; font-size:12px; line-height:1.45; }}
    label {{ display:grid; gap:7px; margin-top:15px; color:var(--muted); font-size:12px; font-weight:700; }} select,input {{ width:100%; border:1px solid var(--line); border-radius:13px; background:#100e0c; color:var(--ink); padding:13px; font:inherit; }}
    .providers {{ display:grid; grid-template-columns:repeat(2,1fr); gap:9px; margin:14px 0; }}
    .provider {{ border:1px solid var(--line); border-radius:15px; background:#211b16; color:var(--ink); padding:12px 10px; text-align:left; font-weight:700; }} .provider[aria-pressed="true"] {{ border-color:var(--bronze); box-shadow:inset 0 0 0 1px var(--bronze); background:#302218; }}
    .dot {{ display:inline-grid; place-items:center; width:24px; height:24px; margin-right:7px; border-radius:50%; background:#fff; color:#15110d; font-size:10px; }}
    .confirm {{ width:100%; border:0; border-radius:999px; padding:16px 18px; background:linear-gradient(90deg,#ba7340,#e2ae68); color:#17110c; font-weight:900; font-size:16px; }} .confirm:disabled {{ opacity:.55; }}
    .receipt {{ display:none; text-align:center; padding:25px 10px 6px; }} .receipt.visible {{ display:block; }} .receipt strong {{ color:var(--green); font-size:20px; }} .receipt p {{ color:var(--muted); line-height:1.5; }}
    footer {{ text-align:center; color:#796c5f; font-size:11px; }}
    @media (max-width:390px) {{ .providers {{ grid-template-columns:1fr; }} .sheet {{ padding:20px; }} }}
  </style>
</head>
<body><main>
  <header><span class="brand">YAATAL</span><span class="secure">● Commerce sécurisée</span></header>
  <section class="media">{visual}</section>
  <section class="sheet">
    <div id="checkout-panel">
      <div class="merchant">{merchant} · Live selection</div><h1>{title}</h1>
      <div class="price">{price} FCFA</div><div class="stock">● Disponible maintenant</div>
      <p class="description">{description}</p>
      <p class="sandbox"><strong>POC sandbox:</strong> aucun débit réel. / No real charge is made.</p>
      <form id="checkout-form">
        {variant_field}
        <label>Quantité / Quantity<input id="quantity" type="number" value="1" min="1" max="10" inputmode="numeric"></label>
        <label>Choisir le moyen de paiement / Choose payment</label>
        <div class="providers" role="group" aria-label="Payment provider">
          <button class="provider" type="button" data-provider="wave" aria-pressed="true"><span class="dot">W</span>Wave</button>
          <button class="provider" type="button" data-provider="orange_money" aria-pressed="false"><span class="dot">OM</span>Orange Money</button>
          <button class="provider" type="button" data-provider="free_money" aria-pressed="false"><span class="dot">FM</span>Free Money</button>
          <button class="provider" type="button" data-provider="mixx" aria-pressed="false"><span class="dot">MX</span>Mixx by Yas</button>
          <button class="provider" type="button" data-provider="bank" aria-pressed="false"><span class="dot">PI</span>Banque · PI-SPI</button>
        </div>
        <button class="confirm" type="submit">Confirmer l'achat · Confirm purchase</button>
      </form>
    </div>
    <div class="receipt" id="receipt" aria-live="polite"><strong>Paiement sandbox confirmé</strong><p id="receipt-copy"></p><button class="confirm" type="button" onclick="location.reload()">Terminé · Done</button></div>
  </section>
  <footer>Yaatal Commerce Sheet · source {html.escape(source)}</footer>
</main>
<script>
  const config={config}; let provider="wave";
  document.querySelectorAll("[data-provider]").forEach(button=>button.addEventListener("click",()=>{{provider=button.dataset.provider;document.querySelectorAll("[data-provider]").forEach(item=>item.setAttribute("aria-pressed",String(item===button)));}}));
  document.querySelector("#checkout-form").addEventListener("submit",async event=>{{event.preventDefault();const submit=event.submitter;submit.disabled=true;submit.textContent="Confirmation…";try{{const response=await fetch(config.checkoutPath,{{method:"POST",headers:{{"content-type":"application/json"}},body:JSON.stringify({{provider,quantity:Number(document.querySelector("#quantity").value),variant:document.querySelector("#variant")?.value||"",source_channel:config.source,idempotency_key:crypto.randomUUID()}})}});const body=await response.json();if(!response.ok)throw new Error(body.message||"Paiement indisponible");document.querySelector("#checkout-panel").hidden=true;document.querySelector("#receipt").classList.add("visible");document.querySelector("#receipt-copy").textContent=`${{body.order_id}} · ${{body.total_fcfa.toLocaleString("fr-FR")}} FCFA · ${{body.payment_provider_label}}`;}}catch(error){{alert(error.message);submit.disabled=false;submit.textContent="Confirmer l'achat · Confirm purchase";}}}});
</script></body></html>"""
