; The outline of a song: its voices, its parts, and the shape it plays them in.

(comment) @annotation

(module_definition
  "module" @context
  type: (identifier) @context
  name: (identifier) @name) @item

(instrument_definition
  "instrument" @context
  name: (identifier) @name) @item

(pattern_definition
  "pattern" @context
  name: (identifier) @name) @item

(track_definition
  "track" @context
  name: (identifier) @name) @item

(scene_definition
  "scene" @context
  name: (identifier) @name) @item

(groove_definition
  "groove" @context
  name: (identifier) @name) @item

(bus_declaration
  "bus" @context
  name: (identifier) @name) @item

; A bus chain or a send return: `drums { in > ... }`, `reverb_return { ... }`
(chain_definition
  name: (identifier) @name) @item

(master_definition
  "master" @name) @item

(arrangement
  "arrange" @name) @item
