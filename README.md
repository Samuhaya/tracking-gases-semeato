# Tracking Gases Semeato

App interno da Semeato para controlar o fornecimento de gases industriais (Copa Gás e White Martins):
contratos, tanques por fábrica (F1, F2, F6), leituras de nível com foto, consumo, previsão de compra,
pedidos, notas, pagamentos e créditos.

- **Site:** GitHub Pages (esta pasta é o site).
- **Dados, login e fotos:** Supabase (`supabase/`): tabela `docs` com regras de acesso por papel
  (ADM vê tudo; responsável só a própria fábrica; equipe só grava das 7:30 às 18:00).
- **Contas:** só o ADM cria, pela aba Usuários. O primeiro acesso cria a conta do dono.

Nenhuma senha ou chave secreta fica neste repositório. A chave `anon` em `adapter.js` é pública por natureza;
o que protege os dados são as regras do banco (`supabase/001_schema.sql`).
