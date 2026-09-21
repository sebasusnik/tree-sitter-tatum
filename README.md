# tree-sitter-tatum

A [Tree-sitter](https://tree-sitter.github.io) grammar for **Tatum**, the
language that [synth-core](https://github.com/sebasusnik/synth-core) plays.
Songs are written in `.synth` files.

A *tatum* is the smallest time unit a listener can perceive — the atomic pulse
a rhythm is inferred from. It is the right name for this language because its
hard limit is sixteen steps to the bar, and subdivisions, ratchets and ties all
exist to negotiate with that one step.

It exists so editors can colour a song. The Zed extension that uses it lives in
[zed-tatum](https://github.com/sebasusnik/zed-tatum); the queries in `queries/` are the source of truth and
that extension carries a copy.

```
npm install
npx tree-sitter generate     # rebuild src/parser.c from grammar.js
npx tree-sitter test         # the corpus in test/corpus
npx tree-sitter highlight examples/tricky.synth
```

`src/parser.c` is committed on purpose: Zed builds the grammar from the
repository as it is, without running the Tree-sitter CLI. Regenerate and commit
it whenever `grammar.js` changes.

## What the grammar mirrors, and where it does not

It follows `core/src/dsl/lexer.rs` and `core/src/dsl/parser.rs`. Two deliberate
differences:

**Newlines are extras.** The real parser skips them everywhere, so a rule here
has to be unambiguous without them. That is why a parameter takes either one
word value or a run of numbers, never a mix — otherwise `voice_mode poly` and
`detune 0.3` on the same line would read as one parameter with three values.

**Most of the lexer's keywords are plain identifiers here.** Only the words that
decide which kind of *block* follows are real keywords (`module`, `pattern`,
`track`, `scene`, `instrument`, `groove`, `master`, `arrange`, `scale`, `meter`,
`auto`, `as`, `bus`, `play`, `using`, `extends`). `level`, `pan`, `sidechain`,
`swing` and the rest stay identifiers, which is what lets them go on being
module parameter names — the real parser allows exactly that, and colouring
them is a job for `highlights.scm` instead.

Three things the token rules get right that are easy to get wrong:

- `C7` is a chord and `C5` is a note, because a note-shaped token whose octave
  is 7 or more is read as a chord symbol. A power chord has to be written
  `E5/3`, and the grammar only accepts `5` and `6` as chord qualities when an
  octave follows them.
- `1.2` is a scale degree inside a pattern and a plain number everywhere else.
  They are separate tokens; no parser state accepts both, so context-aware
  lexing keeps them apart.
- An option key carries its `=` (`wet=`, `lfo_bars=`). Gluing them into one
  token is what lets the lexer tell `rate=16` from the next parameter without
  the parser needing two tokens of lookahead. Options are always written
  unspaced; the spaced `=` of a scene override (`reverb_mix = 0.3`) is a
  different rule.

## Verification

Every `.synth` file in the synth-core repo parses with no ERROR node — 168 files
at the time of writing:

```
find ../synth-core -name '*.synth' -print0 \
  | xargs -0 npx tree-sitter parse -q | grep ERROR
```

That, plus `npx tree-sitter test`, is what this grammar is checked against.

## License

MIT
