# 🚨 REGRAS OBRIGATÓRIAS DE DESENVOLVIMENTO (GESTAOSALAZAR)

## 1. ⛔ REGRAS DE PRESERVAÇÃO E PROTEÇÃO
- NÃO ALTERE a lógica de autenticação por Nickname (os IDs do jogo não são fixos).
- NÃO REMOVA o middleware de corte imediato de acesso para usuários `inativos` ou `demitidos`.
- NÃO ALTERE a matriz de permissões:
  - General: Acesso total (`admin`).
  - Coronel: Acesso semi-administrativo (`sub_admin`), alterando cargos apenas até Major.
  - Major, Tenente, Sargento e Privado: Permissões de membro.
- NUNCA suba o arquivo `.env` para o Git.

## 2. ⚡ REGRAS DE IMPLEMENTAÇÃO
- Bate-ponto com 3 etapas diárias (17:00 às 02:00).
- Retornos em JSON padrão: `{ success: boolean, message: string, data?: any }`.