---
name: landing-page
description: Crea o rediseña landing pages de alta conversión con estándar premium de agencia — estrategia, copy, UI, SEO, performance y accesibilidad. Activar cuando el usuario dice "haceme una landing para X", "creame la página de venta", "landing para mi negocio", "página que convierta", "web de presentación para...". NO activar para tiendas WordPress/WooCommerce (eso es wp-brand-builder).
allowed-tools: Read, Write, Edit, Grep, Glob
---

## Landing page de alta conversión

Workflow operativo para construir una landing premium de principio a fin.
La identidad, los estándares y las reglas de calidad viven en el agente
`landing-architect`. Este skill define el proceso y el contrato de salida.

### Cuándo usarlo

- El usuario pide una landing, página de venta, web de presentación o página que convierta.
- El usuario tiene un negocio/producto/servicio y quiere una página para venderlo.
- El usuario quiere rediseñar una landing existente.

NO usar para: tiendas WordPress/WooCommerce (agente `wp-brand-builder`),
páginas internas de la app FlexCRM (componentes de `frontend/src/`).

### Paso 1 — Recolectar la información (una pregunta por vez)

Máximo 7 preguntas, UNA a la vez. Esperás la respuesta antes de preguntar la siguiente.

1. ¿Qué vende y a quién? (producto/servicio, público, problema que resuelve)
2. ¿Qué lo hace diferente? (una sola razón)
3. ¿Cuál es la acción principal del visitante? (comprar, reservar, consultar, descargar)
4. ¿Cómo compra hoy el usuario? (web, WhatsApp, local, otro)
5. ¿Cuál es la mayor objeción o miedo del cliente?
6. ¿Hay datos reales? (precios, garantías, testimonios, números verificables)
7. ¿Preferencia de stack o estilo visual?

Si el usuario no responde todo → avanzar con supuestos, marcarlos en la
sección "Supuestos" del output. Nunca inventar precios, testimonios ni estadísticas.

### Paso 2 — Estrategia

Definir antes de escribir nada: cliente ideal, propuesta de valor, promesa
principal, beneficios, objeciones, pruebas y CTA principal. Todo jerarquizado.

### Paso 3 — Arquitectura de secciones

Cada sección tiene un objetivo y responde una pregunta:

| Sección | Pregunta que responde | Objetivo |
|---------|------------------------|----------|
| Hero | ¿Qué hacen? | Capturar atención + CTA principal |
| Logos | ¿Puedo confiar? | Prueba social temprana |
| Beneficios | ¿Por qué debería importarme? | Valor para el usuario |
| Problema / Solución | ¿Me entendés? | Conexión emocional + alternativa |
| Cómo funciona | ¿Es difícil? | Reducir ansiedad (3 pasos máximo) |
| Resultados / Características | ¿Qué obtengo? | Prueba + detalle |
| Testimonios | ¿Puedo confiar? | Prueba social real |
| FAQ | ¿Qué dudas me quedan? | Cerrar objeciones |
| CTA final | ¿Qué hago ahora? | Acción sin fricción |
| Footer | ¿Dónde estoy? | Confianza + legal + contacto |

No agregar secciones decorativas. Solo las que el negocio necesita.

### Paso 4 — Copy

Fórmulas:
- Hero: propuesta de valor en 8 palabras o menos.
- Subtítulo: una frase que refuerce el diferenciador.
- CTA: verbo + beneficio, 3 palabras máximo ("Empezar mi prueba", "Pedir presupuesto").
- Beneficios: 3 bullets de 10 palabras cada uno.
- Testimonios: cita corta + nombre real + contexto (solo si el usuario los dio).
- FAQ: 5-6 preguntas reales, no inventadas.

Reglas: frases cortas, párrafos pequeños, cero frases de relleno, cero clichés.
La lista completa de frases prohibidas y el tono están en el agente `landing-architect`.

### Paso 5 — Implementación

Stack por defecto: React + TypeScript + Tailwind (Vite, standalone).
HTML5 + CSS vanilla solo si el usuario lo pide explícito.

- Componentes pequeños y reutilizables, props tipadas, sin lógica mezclada.
- Sistema visual consistente (tipografía, espaciado, paleta, botones, inputs).
- Responsive 320px–1536px sin overflow ni texto cortado.
- Semántica + accesibilidad (contraste AA, focus visible, teclado, alt).
- SEO: title, description, OG, Twitter Cards, canonical, un solo H1, schema si aplica.
- Performance: sin deps innecesarias, imágenes optimizadas, lazy load.

Para reglas genéricas de UI de producción, consultar el skill `frontend-ui-engineering`.

### Paso 6 — Formato de salida obligatorio

```
## Landing {Nombre} — {stack}

### Estrategia
### Copy aprobado
### Arquitectura
### Código
### SEO implementado
### Checklist de calidad aplicado
### Supuestos
```

### Paso 7 — Checklist de calidad (antes de entregar)

- [ ] Copy: humano, sin frases de IA, sin repeticiones, sin relleno
- [ ] Un solo H1, jerarquía correcta de headings
- [ ] CTA destacado y contextualizado (no repetido 20 veces)
- [ ] Responsive correcto en 320/375/768/1024/1280/1536
- [ ] Contraste AA, focus visible, navegación por teclado
- [ ] Meta tags + OG + canonical + schema
- [ ] Sin imports muertos, console.log, TODO, warnings ni errores de lint
- [ ] Sin imágenes de relleno; cada imagen con propósito y especificación
- [ ] Formularios con estados de carga/error/éxito
- [ ] Supuestos declarados cuando el usuario no dio datos

### Modo exprés

Si el usuario pide algo rápido: versión reducida pero completa en su alcance,
marcada como tal, respetando el checklist mínimo (copy sin relleno, responsive,
un solo H1, sin placeholders de datos inventados).
