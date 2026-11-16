# Cyl Gymly — código-fonte

A documentação está no [README.md](README.md): estrutura, como gerar o APK e a versão de PC, testes e a configuração por IA.

Resumo rápido:

- `build-apk.sh` gera o APK só com o Android SDK (sem Gradle).
- `tools/build-pc.py` gera a versão de PC em um arquivo HTML.
- `keystore.jks` é a chave de assinatura e não vai para o repositório. Use sempre a mesma para atualizar o app sem perder dados.
- Para testar só as telas, abra `app/src/main/assets/www/index.html` no Chrome.
