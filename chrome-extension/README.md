# CidadeX-BR — Chrome Web Store Extension

## Como publicar na Chrome Web Store

### 1. Gerar os ícones
Crie 3 versões do ícone `pwa-icon.png` nos tamanhos:
- `icons/icon-16.png` (16×16)
- `icons/icon-48.png` (48×48)
- `icons/icon-128.png` (128×128)

Coloque-os na pasta `chrome-extension/icons/`.

### 2. Criar o pacote ZIP
Compacte toda a pasta `chrome-extension/` em um arquivo `.zip`:
```
cd chrome-extension
zip -r cidadex-chrome.zip .
```

### 3. Publicar
1. Acesse [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pague a taxa única de US$ 5 (se ainda não pagou)
3. Clique em **"New Item"** → faça upload do `.zip`
4. Preencha:
   - **Título**: CidadeX-BR
   - **Descrição**: Explore cidades cearenses — bairros, ruas, notícias, lugares, finanças e rede social local.
   - **Categoria**: Social & Communication
   - **Idioma**: Português (Brasil)
5. Adicione **screenshots** (1280×800 ou 640×400) e uma **imagem promocional** (440×280)
6. Clique em **Submit for Review**

### 4. Após aprovação
A extensão ficará disponível na Chrome Web Store. Usuários instalam e clicam no ícone para abrir o CidadeX-BR.

### Materiais necessários para a publicação
- [ ] 3 ícones (16, 48, 128px)
- [ ] Pelo menos 1 screenshot (1280×800)
- [ ] Imagem promocional pequena (440×280)
- [ ] Descrição detalhada em português
- [ ] Política de privacidade (URL pública)
