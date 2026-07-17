#!/bin/bash
echo ""
echo "  FlexCRM — iniciando..."
echo ""
if ! command -v node &>/dev/null; then echo "  ERROR: Node.js no instalado. Ver: https://nodejs.org"; exit 1; fi
if [ ! -d "node_modules" ]; then echo "  Instalando dependencias..."; npm install; fi
mkdir -p data
echo "  → http://localhost:3000"
echo "  Ctrl+C para detener"
echo ""
if command -v xdg-open &>/dev/null; then sleep 1 && xdg-open http://localhost:3000 &
elif command -v open &>/dev/null; then sleep 1 && open http://localhost:3000 &; fi
node server.js
