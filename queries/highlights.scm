; Syntax highlighting for the synth-core `.synth` DSL.
;
; Read this file from the top down: the general rules come first and the
; specific ones override them later, which is the order the highlighter
; resolves them in.
;
; The one idea worth stating: a pattern is a grid you read at a glance, so
; what sounds is bright and what does not sound gets out of the way. An
; accent is the strongest colour in the file, a ghost note is dimmed, and a
; rest is as quiet as a comment.

; ── Baseline ───────────────────────────────────────────────────────────────

(identifier) @variable
(comment) @comment
(string) @string

(number) @number
(quantity) @number
(negative) @number

; ── Structure ──────────────────────────────────────────────────────────────

[
  "module"
  "instrument"
  "pattern"
  "track"
  "scene"
  "groove"
  "master"
  "arrange"
  "scale"
  "meter"
  "auto"
  "as"
  "bus"
  "play"
  "using"
  "extends"
  "midi"
  "cc"
  "keys"
  "pad"
] @keyword

; The names you define, and the names you refer to them by.
(module_definition name: (identifier) @function)
(instrument_definition name: (identifier) @function)
(pattern_definition name: (identifier) @function)
(track_definition name: (identifier) @function)
(scene_definition name: (identifier) @function)
(groove_definition name: (identifier) @function)
(chain_definition name: (identifier) @function)
(bus_declaration name: (identifier) @function)

; `module keys warmth` -- the kind of instrument is built in.
(module_definition type: (identifier) @type)

; ── Parameters ─────────────────────────────────────────────────────────────

(parameter name: (identifier) @property)
(instrument_property name: (identifier) @property)
(groove_lane name: (identifier) @property)
(groove_setting key: (identifier) @property)
(override target: (identifier) @property)
(option_key) @property

; A word used as a value is an option name -- `poly`, `saw`, `bars_8`,
; `dotted_eighth`, `up`.
(value_name) @constant

; `scale F# minor`
(scale_statement mode: (identifier) @constant)

; The words that start a statement rather than name a parameter. The real
; lexer keeps most of these as keywords; they are identifiers in the grammar
; so that they stay usable as module parameter names, which is what the real
; parser allows too.
((parameter name: (identifier) @keyword)
 (#any-of? @keyword
  "tempo" "swing" "humanize" "gain_comp" "use" "sidechain" "arp"
  "delay" "reverb"))

; ── Chains and effects ─────────────────────────────────────────────────────

(node_call name: (identifier) @function)
(node_call waveform: (identifier) @constant)
(node_call alias: (identifier) @variable)
(node_ref name: (identifier) @variable)
(routing source: (identifier) @keyword)

; The ends of a chain are fixed points, not nodes you named.
((node_ref name: (identifier) @keyword)
 (#any-of? @keyword "in" "out" "master" "mix"))

; ── Arrangement ────────────────────────────────────────────────────────────

(arrangement_entry scene: (identifier) @variable)

; `pad 36 > kick kick`: the drum is one of the kit's own names.
(midi_mapping drum: (identifier) @property)
(repeat_count) @number

; `auto acid cutoff 0.2 > 0.6`: what is being swept, then the sweep itself.
(parameter_name) @property

; ── Patterns ───────────────────────────────────────────────────────────────

; Pitch: notes, scale degrees and chord symbols are the content of a song,
; so they read as literals rather than as amounts.
(note) @string
(degree) @string
(chord_symbol) @string
(pitch_class) @string

(velocity (number) @number)
(probability (number) @number)
(multiplier (number) @number)

; The drum grid.
(lane name: (identifier) @property)

((drum_hit) @keyword
 (#eq? @keyword "X"))          ; accent: the loudest thing on the line

((drum_hit) @constant
 (#eq? @constant "x"))         ; a normal hit

((drum_hit) @comment
 (#any-of? @comment "o" "g"))  ; a ghost, felt more than heard

(rest) @comment
(tie) @comment

(slide) @operator

; ── Punctuation ────────────────────────────────────────────────────────────

[ "*" "?" "=" ">" ] @operator

[ "{" "}" "[" "]" "(" ")" "<" ] @punctuation.bracket

[ ":" "," "/" ] @punctuation.delimiter
