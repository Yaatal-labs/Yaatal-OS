"""Yaatal NFC Viewer — tap-to-buy web server for livestream viewers."""

from .server import (
    ProductCatalog,
    ViewerProduct,
    generate_nfc_url,
    generate_nfc_urls_for_catalog,
    generate_product_page,
    create_server,
)

__all__ = [
    "ProductCatalog",
    "ViewerProduct",
    "generate_nfc_url",
    "generate_nfc_urls_for_catalog",
    "generate_product_page",
    "create_server",
]