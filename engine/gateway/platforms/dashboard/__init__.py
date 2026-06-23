"""Dashboard route domain modules.

``gateway.platforms.api_dashboard`` owns the shared helpers, module-level
state, and the ``register_dashboard_routes`` entry point. The per-domain
modules here each expose ``register(app, adapter)`` and pull every shared
helper from ``api_dashboard`` so the public surface stays in one place. The
split is pure restructuring — handlers are moved verbatim, behaviour is
unchanged.
"""
