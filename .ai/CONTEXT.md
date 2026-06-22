# PEQUENOSCRM PRO - CONTEXTO MAESTRO

Sistema CRM/ERP SaaS Multiempresa y Multisucursal.

## Objetivo
Construir una plataforma escalable para retail.

## Stack
- Node.js
- Express
- SQLite Multi-Tenant
- JWT
- Frontend JS/HTML

## Arquitectura
- master.db: empresas, planes y módulos.
- empresa_x.db: datos aislados por empresa.

## Regla crítica
Nunca romper compatibilidad existente.
