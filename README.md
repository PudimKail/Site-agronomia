# Site Agronomia

Projeto web com interface da fazenda e backend em Java + Spring Boot + PostgreSQL.

## Estrutura

- frontend: HTML/CSS/JS na raiz do projeto
- backend: pasta `backend` com aplicação Java

## Como rodar

### 1) Banco de dados PostgreSQL

Crie um banco local chamado `site_agronomia`:

```sql
CREATE DATABASE site_agronomia;
```

Se quiser, também pode criar um usuário:

```sql
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE site_agronomia TO postgres;
```

### 2) Backend Java

Acesse a pasta `backend` e rode:

```bash
mvn spring-boot:run
```

### 3) Endpoints

- Login: `POST /api/auth/login`
- Registro: `POST /api/auth/register`
- Health: `GET /api/auth/health`
- Dashboard: `GET /api/dashboard`

## Exemplo de login

```json
{
  "username": "admin",
  "password": "123456"
}
```

## Observação

O frontend atual ainda está em HTML estático e o backend precisa ser acessado via chamadas HTTP para validar o login.
