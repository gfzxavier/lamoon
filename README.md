# lamoon

Animação ASCII de um buquê de *Begonia* 'Lamoon' desabrochando, centralizado sobre fundo preto.

- Começa com a mensagem "Como não sei onde te encontrar pra te dar um toma aí, meu anjo", digitada na tela, e uma caixa de presente isométrica em ASCII cuja tampa sobe e desce. Ao tocar no presente, ele se abre e o buquê aparece.
- As hastes crescem a partir do laço do buquê.
- As folhas palmadas se abrem como um leque: nascem vermelhas e amadurecem para o rosa prateado, com nervuras vinho.
- Por último surgem os cachos de florzinhas coral.

Depois que o buquê aparece, toque na tela ou aperte **espaço** / **R** para ele desabrochar de novo.

É responsivo: em telas pequenas o caractere mantém um tamanho mínimo legível e o buquê é remontado para a grade disponível. Em telas estreitas a copa fica mais estreita e alta, com menos folhas e folhas maiores.

## Rodar

```
yarn install
yarn serve
```

## Estrutura

- `src/begonia/engine.js`: motor procedural que gera cada quadro numa grade de caracteres coloridos (formas, nervuras, paleta e linha do tempo).
- `src/begonia/gift.js`: tela de introdução (texto e caixa de presente 3D em ASCII).
- `src/components/BegoniaBouquet.vue`: escolhe a grade de caracteres conforme a tela e desenha num `<canvas>` em tela cheia, com o buquê centralizado.
