type t;

let create: unit => t;

let add: (t, string, Ezjsonm.t) => unit;

let remove: (t, string) => unit;

let replace: (t, string, Ezjsonm.t) => unit;

let get: (t, string) => Ezjsonm.t;

let exists: (t, string) => bool;

let get_keys: t => list(string);