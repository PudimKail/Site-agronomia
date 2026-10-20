# Site Agronomia — G5 em Campo

Site institucional e painel de talhões da G5 em Campo, preparado para apresentação.

## Versão de apresentação (sem banco de dados)

Tudo roda no navegador, como site estático:

- `index.html`: site institucional com a animação do drone, camadas do mapa, etapas do serviço, comparador satélite × índice de vigor, equipe, formulário de diagnóstico e contato.
- `app.html`: painel com login de demonstração, visão geral, editor de talhão (desenhar, editar vértices, mover, medir, desfazer, rota e simulação de voo, exportar GeoJSON), monitoramento e analítica.
- `js/data.js` e `js/api.js`: substituem o backend. Os talhões e alertas ficam no `localStorage` do navegador e o clima vem direto da [Open-Meteo](https://open-meteo.com/). Sem internet, o clima usa valores de reserva.

Acesso de demonstração do painel: usuário `admin`, senha `123456`.
O botão "Restaurar dados de demonstração" no menu do painel volta tudo ao estado inicial.

### Rodar localmente

```bash
python -m http.server 5500
```

Depois abra `http://localhost:5500`.

### Publicação

O site é publicado pelo GitHub Pages a partir da branch `gh-pages`. Para atualizar, publique de novo o conteúdo estático (HTML, `css/`, `js/`, `assets/`) nessa branch. Ao mudar CSS ou JS, aumente o número `?v=` nos links dos dois HTML para o navegador não usar a versão antiga do cache.

## Backend original (não usado na apresentação)

A pasta `backend` tem a versão em Java + Spring Boot + PostgreSQL, com login (`POST /api/auth/login`), registro (`POST /api/auth/register`), saúde (`GET /api/auth/health`), dashboard (`GET /api/dashboard`) e clima (`GET /api/weather`). Para rodar: crie o banco `site_agronomia` no PostgreSQL e execute `mvn spring-boot:run` dentro de `backend`.
