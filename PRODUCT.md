# Product

## Register

product

## Users

Platform engineers, SREs, and app owners who already think in OpenBao terms (namespaces, mounts, policies, AppRoles). They open this UI at a desk, in a namespace, to manage secrets and access without dropping to the CLI or the stock Ember UI.

## Product Purpose

A modern UI for OpenBao that keeps OpenBao as the source of truth. Friendly names and progressive disclosure sit on top of real primitives: environments are KV mounts, apps are folders across those mounts, access is ACL policies and identity groups. Success is that an operator can create an environment, place an app in it, and grant scoped access without writing HCL by hand — and still understand the paths OpenBao will enforce.

## Brand Personality

Calm, precise, trustworthy. Forest-green OpenBao identity, not a generic SaaS skin. Voice is short and literal: say "environment" when it is a mount, "app" when it is a folder, "disable" when the engine is destroyed.

## Anti-references

- HashiCorp Vault's stock Ember UI (dense, engine-first, hover-only actions)
- Infisical/Doppler clones that invent a parallel workspace model and hide the real paths
- Cream/sand SaaS dashboards, glass cards, metric-hero layouts
- Hover-only destructive controls and unlabeled icon rows

## Design Principles

1. **Mirror the primitives, polish the experience.** Never invent a parallel object model.
2. **Simple by default, depth on demand.** Progressive disclosure for engines, history, and danger.
3. **Scope is always visible.** Namespace, environment, and path stay on screen.
4. **Capability-aware and fail closed.** Don't offer actions the token cannot perform.
5. **Guardrails on destruction.** Typed confirm for irreversible deletes.

## Accessibility & Inclusion

WCAG AA contrast for body text and controls. Keyboard-reachable actions with visible focus. `prefers-reduced-motion` for motion. Touch targets at least 44px on small viewports. Destructive actions named in accessible labels, not icon-only mystery meat.
