# Treino & Saúde — código-fonte

App Android pessoal, 100% offline. Interface em HTML/JS (`app/src/main/assets/www/`), casca Android em Java (`app/src/main/java/`).

- `build-apk.sh` — gera o APK só com o Android SDK (sem Gradle).
- Android Studio — abra esta pasta e use Build > Build APK(s).
- `keystore.jks` — chave de assinatura (senha `treinosaude`). Use sempre a mesma para atualizar o app sem perder dados.
- Para testar só as telas: abra `app/src/main/assets/www/index.html` no Chrome.

Os valores dos alimentos iniciais (`foods.js`) são aproximações da tabela TACO. O app não define metas nutricionais nem recomenda doses de medicamento.
