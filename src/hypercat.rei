type t;
let create: unit => t;
let get: (t) => Ezjsonm.t;
let add: (t, string) => unit;
let remove: (t, string) => unit;
