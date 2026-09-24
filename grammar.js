/**
 * @file Tree-sitter grammar for the Tatum language (`.synth` files)
 * @license MIT
 *
 * Mirrors core/src/dsl/lexer.rs and core/src/dsl/parser.rs.
 *
 * Two things shape this grammar:
 *
 * 1. Newlines are insignificant. The Rust parser skips them everywhere, so
 *    they are `extras` here. That means every rule has to be unambiguous
 *    without them -- which is why a parameter takes either ONE word value or
 *    a run of numbers, never a mix (`voice_mode poly` then `detune 0.3` must
 *    not read as one parameter with three values).
 *
 * 2. Most of the lexer's keywords are left as plain identifiers. Only the
 *    words that pick which kind of BLOCK follows are real keywords, because
 *    only those change the shape of what comes after. `level`, `play`,
 *    `using`, `sidechain` and friends are ordinary identifiers here and get
 *    their colour from highlights.scm instead, which keeps them usable as
 *    module parameter names the way the real parser allows.
 */

/// A parameter name, or any bare word in a chain. `master` is the one keyword
/// that also has to work as a word (`out > master`, `auto master tilt ...`).
const WORD = ($) => choice($.identifier, alias('master', $.identifier));

/// Comma-separated, but the commas are optional: the Rust parser consumes a
/// comma if one is there and carries on if it is not.
const looseList = (rule) => repeat(seq(rule, optional(',')));

module.exports = grammar({
  name: 'tatum',

  word: ($) => $.identifier,

  extras: ($) => [/[ \t\r\n]/, $.comment],

  conflicts: ($) => [
    // `osc saw(55) as osc1` on one line and `osc square(55)` on the next:
    // at `saw` we cannot yet know whether it is a waveform argument or the
    // start of the next chain. One more token (`(`) settles it.
    [$.node_call, $.node_ref],
    // `hat swing 0.62` then `snare nudge 0.01`: at `snare` we cannot tell a
    // further setting on this lane from the start of the next one until the
    // token after it turns out not to be a number.
    [$.groove_lane],
  ],

  rules: {
    source_file: ($) => repeat($._statement),

    comment: ($) => token(seq('#', /[^\n]*/)),

    _statement: ($) =>
      choice(
        $.scale_statement,
        $.meter_statement,
        $.module_definition,
        $.instrument_definition,
        $.pattern_definition,
        $.track_definition,
        $.scene_definition,
        $.groove_definition,
        $.master_definition,
        $.arrangement,
        $.automation,
        $.midi_block,
        $.bus_declaration,
        $.chain_definition,
        $.parameter,
      ),

    bus_declaration: ($) => seq('bus', field('name', $.identifier)),

    // ── Globals ────────────────────────────────────────────────────────────
    //
    // `tempo 124`, `swing 0.56`, `gain_comp 0.3`, `bus drums`,
    // `use "rig.synth"`, `sidechain 0.4 attack=2ms`, `delay sync=eighth ...`
    // are all the same shape, so they are all `parameter`. highlights.scm is
    // what tells `tempo` apart from `cutoff`.

    parameter: ($) =>
      seq(
        field('name', WORD($)),
        choice(
          seq(field('value', choice($._word_value, $.string)), repeat($.option)),
          seq(repeat1(field('value', $._numeric)), repeat($.option)),
          repeat1($.option),
        ),
      ),

    // `scale F# minor` -- the root is not an identifier (`F#` has a sharp in
    // it) and not a note (no octave digit), so it gets its own token.
    scale_statement: ($) =>
      seq('scale', field('root', $.pitch_class), field('mode', $.identifier)),

    meter_statement: ($) =>
      seq('meter', field('numerator', $.number), '/', field('denominator', $.number)),

    // ── Modules ────────────────────────────────────────────────────────────

    module_definition: ($) =>
      seq(
        'module',
        field('type', $.identifier),
        field('name', $.identifier),
        field('body', $.module_body),
      ),

    module_body: ($) => seq('{', repeat($.parameter), '}'),

    // ── Instruments (custom node graphs) ───────────────────────────────────

    instrument_definition: ($) =>
      seq('instrument', field('name', $.identifier), field('body', $.instrument_body)),

    // A line is either `gain 1.8` or a chain of nodes. Restricting the
    // property form to numeric values is what keeps `osc saw(55)` from
    // looking like a property with the value `saw`.
    instrument_body: ($) =>
      seq('{', repeat(choice($.instrument_property, $.chain)), '}'),

    instrument_property: ($) =>
      seq(field('name', $.identifier), repeat1(field('value', $._numeric))),

    // ── Patterns ───────────────────────────────────────────────────────────

    pattern_definition: ($) =>
      seq('pattern', field('name', $.identifier), field('body', $.pattern_body)),

    pattern_body: ($) => seq('{', repeat(choice($.lane, $._step)), '}'),

    /// `kick: X - - - x - - -`. A lane runs until the next `<name>:`.
    lane: ($) => prec.right(seq(field('name', $.identifier), ':', repeat($._step))),

    _step: ($) =>
      choice(
        $.rest,
        $.tie,
        $.drum_step,
        $.note_step,
        $.degree_step,
        $.chord,
        $.chord_symbol_step,
        $.subdivision,
      ),

    rest: ($) => seq('-', optional($.multiplier)),
    tie: ($) => seq('..', optional($.multiplier)),

    drum_step: ($) =>
      seq(
        $.drum_hit,
        optional($.probability),
        optional($.velocity),
        optional($.multiplier),
        optional($.step_lock),
      ),

    drum_hit: ($) => choice('x', 'X', 'o', 'g'),

    note_step: ($) =>
      seq(
        optional($.slide),
        $.note,
        optional(seq('/', $.number)),
        optional($.velocity),
        optional($.multiplier),
        optional($.step_lock),
      ),

    /// A scale degree: `1.2` is degree 1, octave 2.
    degree_step: ($) =>
      seq(
        optional($.slide),
        $.degree,
        optional($.velocity),
        optional($.multiplier),
        optional($.step_lock),
      ),

    chord: ($) =>
      seq(
        '[',
        repeat(choice($.note_step, $.degree_step)),
        ']',
        optional($.velocity),
        optional($.step_lock),
      ),

    /// A bare root is a major triad: `G/2` is G major in octave 2.
    chord_symbol_step: ($) =>
      seq(
        optional($.slide),
        choice($.chord_symbol, seq($.pitch_class, '/', $.number)),
        optional($.velocity),
        optional($.multiplier),
        optional($.step_lock),
      ),

    /// `<B4 C#5 D5>` -- those notes inside one step. The closing `>` is the
    /// same token the routing arrow uses; chains never appear in a pattern.
    subdivision: ($) => seq('<', repeat($._step), '>'),

    slide: ($) => '~',
    velocity: ($) => seq(':', $.number),
    probability: ($) => seq('?', $.number),
    multiplier: ($) => seq('*', $.number),

    /// `(cutoff=0.4, edepth=0.3, res=0.6, gate=0.5)`
    step_lock: ($) => seq('(', looseList($.option), ')'),

    // ── Tracks ─────────────────────────────────────────────────────────────

    track_definition: ($) =>
      seq('track', field('name', $.identifier), field('body', $.track_body)),

    track_body: ($) =>
      seq(
        '{',
        repeat(choice($.play_statement, $.using_statement, $.routing, $.parameter)),
        '}',
      ),

    /// `play` and `using` name a pattern and a module you defined elsewhere,
    /// which is why they are real keywords here: what follows is a reference
    /// rather than one of the option words every other parameter takes.
    play_statement: ($) => seq('play', field('pattern', $.identifier)),

    using_statement: ($) => seq('using', field('module', $.identifier)),

    /// `out > saturate(0.3) > master`, and it may wrap across lines.
    routing: ($) =>
      seq(field('source', WORD($)), repeat1(seq('>', $._chain_element))),

    // ── Scenes and arrangement ─────────────────────────────────────────────

    scene_definition: ($) =>
      seq('scene', field('name', $.identifier), field('body', $.scene_body)),

    scene_body: ($) =>
      seq(
        '{',
        repeat(
          choice(
            $.track_definition,
            $.automation,
            $.extends_statement,
            $.override,
            $.parameter,
          ),
        ),
        '}',
      ),

    extends_statement: ($) => seq('extends', field('scene', $.identifier)),

    /// `reverb_mix = 0.3`
    override: ($) => seq(field('target', WORD($)), '=', field('value', $._value)),

    /// `auto acid cutoff 0.2 > 0.6 > 0.2`
    automation: ($) =>
      seq('auto', field('target', $.automation_target), $.keyframes),

    /// `acid cutoff`, `master tilt`, `reverb_mix`, `tines.mod_index`. The
    /// last word is always the parameter being swept; the ones before it name
    /// what carries it. They are separate node types so highlights can tell
    /// the two apart without having to know every parameter name.
    automation_target: ($) =>
      seq(repeat(WORD($)), field('parameter', alias(WORD($), $.parameter_name))),

    keyframes: ($) => seq($._numeric, repeat1(seq('>', $._numeric))),

    arrangement: ($) => seq('arrange', '{', repeat($.arrangement_entry), '}'),

    // ── MIDI ───────────────────────────────────────────────────────────────

    /// `midi { cc 74 > acid cutoff }`: which controller moves what. The
    /// target is written the way `auto` writes one, and parses the same way.
    midi_block: ($) => seq('midi', '{', repeat($.midi_mapping), '}'),

    midi_mapping: ($) =>
      seq('cc', field('controller', $.number), '>', field('target', $.automation_target)),

    arrangement_entry: ($) =>
      seq(field('scene', WORD($)), optional(field('repeat', $.repeat_count))),

    // ── Grooves ────────────────────────────────────────────────────────────

    groove_definition: ($) =>
      seq('groove', field('name', $.identifier), field('body', $.groove_body)),

    /// `hat swing 0.62 nudge 0.008` -- a drum name and then key/value pairs,
    /// which is the one place a bare word is followed by more than one pair.
    groove_body: ($) => seq('{', repeat($.groove_lane), '}'),

    groove_lane: ($) =>
      seq(field('name', $.identifier), repeat1($.groove_setting)),

    groove_setting: ($) =>
      seq(field('key', $.identifier), field('value', $._numeric)),

    // ── Chains: master, buses and send returns ─────────────────────────────

    master_definition: ($) => seq('master', field('body', $.chain_body)),

    /// `drums { in > compressor(-8) > master }`, `reverb_return { ... }`
    chain_definition: ($) =>
      seq(field('name', $.identifier), field('body', $.chain_body)),

    chain_body: ($) => seq('{', optional($.chain), '}'),

    chain: ($) => seq($._chain_element, repeat(seq('>', $._chain_element))),

    _chain_element: ($) => choice($.node_call, $.node_ref),

    /// `lowpass(800, 0.6, lfo_bars=2)`, `osc saw(55) as osc1`, `noise()`
    node_call: ($) =>
      seq(
        field('name', WORD($)),
        optional(field('waveform', $.identifier)),
        $.arguments,
        optional(seq('as', field('alias', $.identifier))),
      ),

    node_ref: ($) => field('name', WORD($)),

    arguments: ($) => seq('(', looseList(choice($.option, $._value)), ')'),

    // ── Values ─────────────────────────────────────────────────────────────

    /// `wet=0`, `lfo_bars=16`. The `=` is glued to the key on purpose: it is
    /// what lets the lexer tell an option from the next parameter without the
    /// parser needing two tokens of lookahead.
    option: ($) =>
      seq(field('key', $.option_key), field('value', $._value)),

    option_key: ($) => token(seq(/[a-zA-Z_][a-zA-Z0-9_]*/, '=')),

    _value: ($) => choice($._numeric, $._word_value, $.string, $.ratio),

    _word_value: ($) => alias(WORD($), $.value_name),

    _numeric: ($) => choice($.number, $.quantity, $.negative),

    negative: ($) => seq('-', choice($.number, $.quantity)),

    /// `1/8` in `delay(1/8, 0.4)`
    ratio: ($) => seq($.number, '/', $.number),

    // ── Tokens ─────────────────────────────────────────────────────────────

    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    number: ($) => /[0-9]+(\.[0-9]+)?|\.[0-9]+/,

    /// The same number as `number`, in the unit it is written in. The lexer
    /// keeps the suffix as written and the parser resolves it against the
    /// parameter, so `20ms` on a cutoff is an error rather than a silent 20.
    quantity: ($) =>
      token(
        seq(
          /[0-9]+(\.[0-9]+)?|\.[0-9]+/,
          choice(
            /[kK][hH][zZ]/,
            /[hH][zZ]/,
            /[mM][sS]/,
            /[sS][eE][cC]/,
            /[sS][tT]/,
            /[sS]/,
            /[xX]/,
            /[dD][bB]/,
            '%',
          ),
        ),
      ),

    /// A scale degree carries its octave after the dot, so it is written
    /// exactly like a number. It gets its own token anyway: no state accepts
    /// both, and having the two apart is what lets `1.2` be coloured as a
    /// pitch inside a pattern and as an amount everywhere else.
    degree: ($) => token(/[0-9]+(\.[0-9]+)?/),

    /// `A1`, `C#4`, `Ab1`, `g0`
    note: ($) => token(prec(1, /[A-Ga-g][#b]?[0-8]/)),

    /// `Fm9`, `Dbmaj7/2`, `C7`, `E5/3`. A note-shaped token whose octave is
    /// 7 or more is a chord, which is why the bare-digit qualities stop at 7
    /// and `5` and `6` only count as chords when an octave follows.
    chord_symbol: ($) =>
      token(
        prec(
          2,
          /[A-G][#b]?((maj13|maj9|maj7|maj|mmaj7|madd9|m7b5|m13|m11|m7|m9|m6|m|add9|sus2|sus4|7sus4|dim7|dim|aug|13|11|9|7)(\/[0-8])?|[56]\/[0-8])/,
        ),
      ),

    /// `F`, `F#`, `Bb` -- a root with no octave, as `scale` writes it.
    pitch_class: ($) => token(prec(1, /[A-G][#b]?/)),

    /// `x4` after a scene name in `arrange`.
    repeat_count: ($) => token(prec(2, /x[0-9]+/)),

    string: ($) => /"[^"]*"/,
  },
});
