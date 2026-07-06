const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType, BorderStyle } = require('docx');

const B = (t) => new TextRun({ text: t, bold: true });
const T = (t) => new TextRun(t);
const P = (children, opts = {}) => new Paragraph({ children, spacing: { after: 120 }, ...opts });
const bullet = (children) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children });
const H = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun(t)] });

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
        run: { size: 34, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 0, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
        run: { size: 26, bold: true, font: 'Arial', color: '2B6CB0' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1000, right: 1200, bottom: 1000, left: 1200 },
      },
    },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Juegos de lectura de Manu — guía rápida')] }),
      new Paragraph({
        spacing: { after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2B6CB0', space: 4 } },
        children: [new TextRun({ text: 'Juego para practicar la lectura de palabras que Manu ya conoce, con estrellas y premios. Acompaña el trabajo que hace con el método SELEC.', italics: true })],
      }),

      H('Cómo se abre'),
      P([T('Doble clic en el archivo '), B('JuegosManu_v2.html'), T('. Se abre en cualquier navegador (Chrome recomendado), en compu o tablet. No necesita internet, ni cuentas, ni instalar nada.')]),

      H('Los juegos del menú'),
      bullet([B('👀 Conocer las palabras: '), T('pasan tarjetas con dibujo, palabra y voz. Manu solo mira, escucha y toca la flecha. Empiecen siempre por acá, sobre todo si hace días que no juega.')]),
      bullet([B('📖 Libro: '), T('lee la palabra y elige el dibujo correcto entre tres.')]),
      bullet([B('🔍 Lupa: '), T('mira el dibujo y elige la palabra escrita.')]),
      bullet([B('🃏 Carta: '), T('memotest de parejas palabra–dibujo.')]),
      bullet([B('🦜 Loro: '), T('escucha la palabra y la busca escrita, sin dibujo de ayuda. Es el más difícil: dejarlo para cuando venga ganando.')]),

      H('Estrellas y premio'),
      P([T('Cada acierto suma 1 estrella (arriba se ve el contador). Al llegar a '), B('20 estrellas gana un premio de verdad'), T(': acuérdenlo con él antes de empezar y cúmplanlo. Las estrellas quedan guardadas aunque se cierre el navegador.')]),

      H('Cuando se equivoca'),
      P([T('El error no descuenta nada: puede volver a intentar. Al segundo error, la respuesta correcta empieza a brillar para guiarlo. '), B('No corregirlo ni apurarlo'), T(': dejar que el juego lo lleve, y festejar con él cada acierto.')]),

      H('Informe para adultos (📊 arriba a la derecha)'),
      P([T('Muestra cuántas veces acertó cada palabra, de la más difícil a la más fácil. Sirve para saber qué reforzar. El botón "borrar historial" hay que mantenerlo apretado 2 segundos (es a propósito, para que no se borre sin querer).')]),

      H('Consejos'),
      bullet([T('Sesiones cortas: 10 a 15 minutos. Mejor terminar con ganas de más que agotado.')]),
      bullet([T('Tocar la tarjeta o la palabra grande repite el audio, las veces que haga falta.')]),
      bullet([T('La voz sale del dispositivo: para una buena voz masculina en español, instalar la voz "Diego (español – Argentina)" desde Accesibilidad → Contenido hablado del equipo.')]),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('/sessions/admiring-charming-lamport/mnt/outputs/Instructivo_JuegosManu.docx', buf);
  console.log('OK');
});
