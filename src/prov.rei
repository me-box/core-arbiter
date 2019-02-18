type t;

let create: (~code: int, ~options: array((int, string)), ~token: string) => t;

let ident: t => (string, int);

let code: t => int;

let code_as_string: t => string;

let uri_path: t => string;

let uri_host: t => string;

let content_format: t => int;

let content_format_as_string: t => string;

let token: t => string;

let observed: t => string;

let max_age: t => Int32.t;

let info: (t, string) => string;