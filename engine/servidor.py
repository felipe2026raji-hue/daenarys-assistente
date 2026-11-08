"""Motor local do Capri Assistente.

Escuta apenas em 127.0.0.1 e exige o token que o Electron passa na inicialização.
Endpoints:
    GET  /saude
    GET  /estado
    GET  /microfones
    POST /microfone  {"nome": "..."}   (vazio = automático)
    POST /falar      {"texto": "..."}
    POST /parar
    POST /ouvir
    POST /noticias   {"assunto": "...", "quantidade": 5}
"""

import argparse
import hmac
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from noticias import buscar_manchetes, montar_boletim
from voz.reconhecimento import Reconhecedor
from voz.sintese import Sintetizador

TOKEN = ""
SINTETIZADOR = None
RECONHECEDOR = None


class Handler(BaseHTTPRequestHandler):
    server_version = "CapriEngine/1.0"

    def log_message(self, formato, *args):
        # nada de ruído no stdout: o Electron lê a porta por lá
        pass

    # ---------- utilidades ----------

    def _responder(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _autorizado(self):
        if self.headers.get("origin"):
            return False
        recebido = self.headers.get("x-capri-token", "")
        return bool(TOKEN) and hmac.compare_digest(recebido, TOKEN)

    def _corpo(self):
        tamanho = int(self.headers.get("content-length", "0") or 0)
        if tamanho <= 0:
            return {}
        if tamanho > 64 * 1024:
            raise ValueError("corpo grande demais")
        return json.loads(self.rfile.read(tamanho).decode("utf-8") or "{}")

    def _negar(self):
        self._responder(403, {"ok": False, "erro": "não autorizado"})

    # ---------- rotas ----------

    def do_GET(self):
        if not self._autorizado():
            return self._negar()
        if self.path == "/saude":
            return self._responder(200, {
                "ok": True,
                "falando": SINTETIZADOR.falando(),
                "ouvindo": RECONHECEDOR.ocupado,
            })
        if self.path == "/estado":
            return self._responder(200, {
                "ok": True,
                "falando": SINTETIZADOR.falando(),
                "ouvindo": RECONHECEDOR.ocupado,
            })
        if self.path == "/microfones":
            return self._responder(200, {
                "ok": True,
                "microfones": RECONHECEDOR.microfones(),
                "escolhido": RECONHECEDOR.escolhido(),
            })
        return self._responder(404, {"ok": False})

    def do_POST(self):
        if not self._autorizado():
            return self._negar()
        try:
            corpo = self._corpo()
        except Exception as erro:
            return self._responder(400, {"ok": False, "erro": str(erro)})

        if self.path == "/falar":
            texto = str(corpo.get("texto", "") or "").strip()
            if not texto:
                return self._responder(400, {"ok": False, "erro": "texto vazio"})
            SINTETIZADOR.falar(texto)
            return self._responder(200, {"ok": True})

        if self.path == "/parar":
            SINTETIZADOR.parar()
            return self._responder(200, {"ok": True})

        if self.path == "/ouvir":
            tipo, texto = RECONHECEDOR.ouvir()
            if tipo == "texto":
                return self._responder(200, {"ok": True, "texto": texto})
            return self._responder(200, {"ok": False, "motivo": tipo, "mensagem": texto})

        if self.path == "/microfone":
            escolhido = RECONHECEDOR.usar(corpo.get("nome", ""))
            return self._responder(200, {
                "ok": True,
                "escolhido": escolhido,
                "microfones": RECONHECEDOR.microfones(),
            })

        if self.path == "/falando":
            return self._responder(200, {"ok": True, "falando": SINTETIZADOR.falando()})

        if self.path == "/parar-escuta":
            RECONHECEDOR.parar()
            return self._responder(200, {"ok": True})

        if self.path == "/noticias":
            assunto = corpo.get("assunto") or None
            quantidade = int(corpo.get("quantidade") or 5)
            manchetes = buscar_manchetes(assunto, quantidade)
            if not manchetes:
                return self._responder(
                    200,
                    {"ok": False, "erro": "Não consegui buscar as notícias agora."},
                )
            return self._responder(200, {
                "ok": True,
                "manchetes": manchetes,
                "texto": montar_boletim(manchetes, assunto),
            })

        return self._responder(404, {"ok": False})


def main():
    global TOKEN, SINTETIZADOR, RECONHECEDOR

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--token", default="")
    args = parser.parse_args()

    if not args.token:
        print("Token ausente.", file=sys.stderr, flush=True)
        sys.exit(2)

    TOKEN = args.token
    SINTETIZADOR = Sintetizador()
    RECONHECEDOR = Reconhecedor()

    servidor = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    porta = servidor.server_address[1]
    print(f"PORTA={porta}", flush=True)

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
